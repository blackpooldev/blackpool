# Blackpool

> Private payments that leave no trail.

[![build](https://github.com/blackpooldev/blackpool/actions/workflows/build.yml/badge.svg?branch=main)](https://github.com/blackpooldev/blackpool/actions/workflows/build.yml)
[![npm](https://img.shields.io/npm/v/@blackpool/cli?label=%40blackpool%2Fcli)](https://www.npmjs.com/package/@blackpool/cli)
[![License: MIT](https://img.shields.io/badge/license-MIT-black.svg)](LICENSE)
[![chains](https://img.shields.io/badge/live-Robinhood%20%C2%B7%20Base%20%C2%B7%20Arbitrum%20%C2%B7%20BNB-27a563.svg)](#networks)
[![contracts](https://img.shields.io/badge/contracts-Sourcify%20exact%20match-27a563.svg)](https://sourcify.dev)
[![app](https://img.shields.io/badge/app-blackpool.cash-111.svg)](https://blackpool.cash/app)

Shield an asset once. Send, swap and bridge it privately after that, from a web app or a CLI, with no account, no custody and no trail back to your wallet.

Blackpool is a set of zero-knowledge privacy pools on EVM chains. Every pool is a Poseidon Merkle tree of encrypted notes; spending a note means proving in zero knowledge (Groth16) that you own a leaf without saying which one. A relayer submits the transaction and pays the gas, so your wallet never appears on-chain again after the deposit.

```
  wallet ──sign once──► account keys (derived from the signature)
                              │
                              ▼
         ┌────────────── private balance (notes in a pool) ──────────────┐
         │                        │                        │             │
    private send            same-chain swap          private bridge    recover
  (any EVM address)     (ETH ⇄ stablecoin via DEX)   (NEAR Intents)   (from signature)
         │                        │                        │
         └──────────── relayer submits, pays gas ──────────┘
```

The relayer sees a proof and an encrypted payload. It cannot link a withdrawal to a deposit, cannot spend notes and cannot decrypt anything: the AES key for recovery data is `keccak256(signature)` and the backend only ever learns a one-way derived identifier.

## Networks

| Chain | Pools | Status |
|---|---|---|
| Robinhood Chain (4663) | ETH · USDG | **live** |
| Base (8453) | ETH · USDC | **live** |
| Arbitrum One (42161) | ETH · USDC | **live** |
| BNB Smart Chain (56) | BNB · USDC · USDT | **live** |

Pool proxies (UUPS; the admin can upgrade and pause, nothing else):

| Chain | ETH / BNB pool | Stablecoin pool(s) |
|---|---|---|
| Robinhood Chain | [`0x993490DCc199A41D5A2A412e30bA205FD43B9D69`](https://robin.etherscan.io/address/0x993490DCc199A41D5A2A412e30bA205FD43B9D69) | USDG [`0xeBfC2287Efc2FEDc51e24124A582bcb6CcDD5300`](https://robin.etherscan.io/address/0xeBfC2287Efc2FEDc51e24124A582bcb6CcDD5300) |
| Base | [`0xEC0FB87E77Fb18Abbbda726E69adFc561b148A02`](https://basescan.org/address/0xEC0FB87E77Fb18Abbbda726E69adFc561b148A02) | USDC [`0x71716bCc48Ec226De36fa07d11959b1C27e9EC19`](https://basescan.org/address/0x71716bCc48Ec226De36fa07d11959b1C27e9EC19) |
| Arbitrum One | [`0xEC0FB87E77Fb18Abbbda726E69adFc561b148A02`](https://arbiscan.io/address/0xEC0FB87E77Fb18Abbbda726E69adFc561b148A02) | USDC [`0x59E4f3A645cD9d23c99e12a00e541B77331B8Ad4`](https://arbiscan.io/address/0x59E4f3A645cD9d23c99e12a00e541B77331B8Ad4) |
| BNB Smart Chain | [`0xEC0FB87E77Fb18Abbbda726E69adFc561b148A02`](https://bscscan.com/address/0xEC0FB87E77Fb18Abbbda726E69adFc561b148A02) | USDC [`0x59E4f3A645cD9d23c99e12a00e541B77331B8Ad4`](https://bscscan.com/address/0x59E4f3A645cD9d23c99e12a00e541B77331B8Ad4) · USDT [`0x3A3225C54b6D326C855eEa77d76a6F143Df6555D`](https://bscscan.com/address/0x3A3225C54b6D326C855eEa77d76a6F143Df6555D) |

Admin on every chain: `0xB1aCad20c0D0F6dA98841b09369eFAe46FdD8126`. Several addresses repeat across chains (same deployer, same nonce) while being different contracts: always read an address with its chain.

Implementations, verifiers, hashers and deploy blocks for every chain are in [`deploy/ADDRESSES.md`](deploy/ADDRESSES.md). The running API reports the pools it serves at `GET https://api.blackpool.cash/api/health`.

## Using it

**Web app.** [blackpool.cash/app](https://blackpool.cash/app): connect a wallet, sign once, shield. [blackpool.cash/recover](https://blackpool.cash/recover) recovers anything that got stuck mid-flow from the same signature, on any device.

**CLI.** [`@blackpool/cli`](https://www.npmjs.com/package/@blackpool/cli) drives the same API from a terminal, for scripts and agents:

```
npm i -g @blackpool/cli                           # or: npx @blackpool/cli help
blackpool login                                   # key via hidden prompt (or BLACKPOOL_KEY for agents/CI)
blackpool balance --chain robinhood
blackpool deposit 0.5 --chain robinhood           # shield
blackpool send 0x… 0.1 --chain robinhood          # private send, no gas from you
blackpool bridge sol_usdc <solana address> 0.1 --from hood_eth
blackpool recover --chain all                     # sweep anything stranded, idempotent
```

The CLI keeps the key you give it and the cached sign-in signature in `~/.blackpool/` (mode 600). `BLACKPOOL_KEY` skips the interactive login for agents and CI.

## How it works

- **Sign-in.** The wallet signs one fixed message. `keccak256(sig)` becomes the encryption key, its hash the UTXO spending key; the same wallet reproduces the same account anywhere. The hosted relayer API receives the signature with each private operation, derives the keys in memory to build the proof and never stores them (client-side proving is on the roadmap).
- **Shield.** A deposit inserts a commitment `Poseidon(amount, pubkey, blinding)` into the pool's tree. The amount is free-form: no fixed denominations.
- **Spend.** A 2-in / 2-out Groth16 circuit (`circuits/`) proves ownership of the inputs, correctness of the outputs and that the nullifiers are fresh. The relayer verifies the proof on-chain through `Verifier2`.
- **Swap.** Same-chain swaps withdraw to a one-time burner wallet, swap on the chain's DEX, and re-shield. Burner keys are registered encrypted (client-side AES-GCM) so a stalled swap is recoverable from any device.
- **Bridge.** Cross-chain transfers withdraw privately to a NEAR Intents (1Click) solver deposit address; the solver delivers on the destination chain. Refunds go back to the burner, which recovery re-shields.

The protocol reference lives at [blackpool.cash/docs](https://blackpool.cash/docs); the roadmap in [`ROADMAP.md`](ROADMAP.md).

## Repository

```
circuits/     circom circuit (transaction2) + build artifacts
contracts/    EtherPool / ERCPool, MerkleTreeWithHistory, Verifier2, per-chain variants
src/          keypair, UTXO, proving, encryption, registry-auth derivation
scripts/      deploy + upgrade scripts, hasher/verifier generation
cli/          @blackpool/cli
frontend/     Next.js static app (blackpool.cash)
deploy/       the address book (ADDRESSES.md)
test/         hardhat test-suite (149 tests)
```

## Development

```bash
npm install
npm run compile          # hardhat compile + Poseidon hasher bytecode
npm test                 # 149 tests, ~2 min (proves real Groth16 proofs)
```

Deploying a pool needs `PRIVATE_KEY` (deployer) and `ADMIN_ADDRESS` in the environment, then for example `npx hardhat run scripts/deployRobinhoodEther.js --network robinhood`. Always compile first. Upgrades go through `scripts/deployUpgrade*.js` and the `.openzeppelin/` manifest.

The relayer API and indexer are operated by Blackpool and are not part of this repository; the frontend and CLI talk to `https://api.blackpool.cash`. The frontend is a static export: `cd frontend && npm run build`.

## Security

Non-custodial by construction: no server ever holds a key that can spend a note or decrypt recovery data. The relayer refuses anything that is not a fee-paying withdraw with a known root and unspent nullifiers, and simulates every transaction before broadcasting it.

Found something? Please read [`SECURITY.md`](SECURITY.md) and write to [hello@blackpool.cash](mailto:hello@blackpool.cash) rather than opening a public issue.

## Contributing

Issues and pull requests are welcome; see [`CONTRIBUTING.md`](CONTRIBUTING.md). The cryptographic core (circuit, tree, note format, sign-in message) is frozen — changes there need a migration plan, not a PR.

## License

MIT. See [LICENSE](LICENSE).
