# @blackpool/cli

> **Official:** our only X account is [@intheblackpool](https://x.com/intheblackpool). The only Blackpool token contract is the one on [blackpool.cash/token](https://blackpool.cash/token).

Private payments for onchain agents. One env var or one hidden prompt, then shield / send / swap / bridge with zero-knowledge privacy on **Base**, **Robinhood Chain**, **Arbitrum**, and **BNB Smart Chain**. Proofs are built on your machine, the same way the web app does it; the full agent guide is [AGENTS.md](https://blackpool.cash/AGENTS.md).

Every command takes an optional `--chain base|robinhood|arbitrum|bsc` flag (default `base`). On Base and Arbitrum the stablecoin is USDC; on Robinhood it's USDG; on BSC the stablecoins are USDC and USDT (Binance-Peg, 18 decimals) and the native asset is BNB.

## Install

```bash
npm i -g @blackpool/cli
# or
npx @blackpool/cli help
```

## Setup

Two ways to provide your key, depending on who's running it.

### Interactive (humans / local demo) - key never shown

```bash
blackpool login
#   private key: ●●●●●●●●●●   <- hidden input, like sudo password
# ✓ wallet stored at ~/.blackpool/wallet.json (chmod 600)
```

The key is prompted with **hidden input** (no echo, never enters shell history), then stored locally at `~/.blackpool/wallet.json` with `chmod 600` (owner-only). It is never transmitted, and neither is the sign-in signature: keys and proofs are computed on your machine.

### Env var (agents / CI) - no prompt

```bash
export BLACKPOOL_KEY=0xyour_agent_private_key
blackpool login   # detects env var, skips the prompt, stores nothing to disk
```

Agents pull the key from their own secret manager / vault into `BLACKPOOL_KEY`. The CLI reads it directly and does not write it to disk.

### Logout

```bash
blackpool logout   # removes ~/.blackpool/wallet.json + config.json
```

**Key resolution order:** `BLACKPOOL_KEY` env var → `~/.blackpool/wallet.json` → error.

## Commands

```bash
blackpool balance                            # private + public balances (both pools), Base
blackpool balance --chain robinhood          # balances on Robinhood (ETH + USDG)
blackpool balance --chain arbitrum           # balances on Arbitrum (ETH + USDC)
blackpool balance --chain bsc                # balances on BSC (BNB + USDC + USDT)
blackpool balance --pool eth                 # just private ETH
blackpool deposit 25 --pool usdc             # shield 25 USDC from public to private (Base)
blackpool deposit 15 --pool usdg --chain robinhood  # shield 15 USDG on Robinhood
blackpool deposit 0.05 --pool bnb --chain bsc       # shield BNB (BSC native pool is 'bnb', not 'eth')
blackpool send 0xRECIPIENT 2.5               # send 2.5 USDC privately (no gas from you)
blackpool send 0xRECIPIENT 0.01 --pool eth   # send private ETH
blackpool send 0xRECIPIENT 2.5 --chain robinhood    # send 2.5 USDG privately on Robinhood
blackpool send 0xRECIPIENT max --pool usdt --chain bsc  # send the whole private USDT balance
blackpool send 0xRECIPIENT max --chain all   # empty every private pool on every chain into one address
blackpool swap 0.001 --from eth              # private same-chain swap ETH -> USDC (Uniswap V3)
blackpool swap 3 --from usdc                 # private same-chain swap USDC -> ETH
blackpool swap max --from eth --chain arbitrum      # swap as much private ETH as one swap can move
blackpool bridge arb_usdc 0xRECIPIENT 2.5    # bridge cross-chain privately to Arbitrum (1Click)
blackpool bridge bsc_usdt 0xRECIPIENT 5 --from bsc_usdc  # 1Click origin can be any shielded pool
blackpool bridge base_eth 0xRECIPIENT max --from hood_eth  # bridge as much as one bridge can move
blackpool assets                             # list all supported bridge destinations
blackpool recover                            # sweep any stranded funds from one-time burners
blackpool recover --to 0xADDR                # sweep to a different destination
```

## How it works

Each command follows the pattern [AGENTS.md](https://blackpool.cash/AGENTS.md) documents.

**Login / balance / send / bridge** - you sign once; the CLI scans your notes and builds the Groth16 proof locally (the 20 MB proving key is downloaded once to `~/.blackpool/zk/`), then the relayer broadcasts it. You pay no gas. The relayer is compensated via the protocol fee (flat + 0.35% per withdraw / swap / bridge).

**Deposit** - your public wallet signs and broadcasts the shield tx (this is the only step where you pay gas, because the pool must see funds coming from a public address). For ERC-20 pools (USDC), an `approve` runs first; the CLI polls the on-chain allowance before broadcasting the deposit (same fix as the frontend for load-balanced RPC lag).

**Swap same-chain** - mirrors the frontend burner flow exactly:

1. Create a fresh random burner wallet and register its key, encrypted with your signature, in the recovery registry before any funds move.
2. Private withdraw from your pool → burner via `/api/swap-private`.
3. For USDC origin: relayer tops up burner gas via `/api/burner-gas`.
4. Burner approves + swaps on Uniswap V3 (SwapRouter02, 0.01% fee tier).
5. WETH is unwrapped to ETH if ETH is the destination.
6. Pre-flight `eth_call` simulation of the reshield (catches reverts cheap).
7. Burner reshields the swapped output back to **your** private balance via `/api/deposit/prepare`.

If any step fails between (2) and (7), funds remain on the burner; its key is in the registry, encrypted so only your signature can read it. Run `blackpool recover` to sweep them home from any device.

**Bridge cross-chain** - private withdraw to a NEAR Intents 1Click solver via `/api/swap`, then poll `/api/intent-status` until `SUCCESS` (or `REFUNDED`, in which case the solver returns your funds automatically). No burner involved for bridges.

**Recover** - fetches every burner registered for your wallet, decrypts the keys locally, and sweeps stranded funds back to your public wallet (or `--to <addr>`). Handles the wallets `swap` may have left behind if a later step reverted. Uses Base-realistic gas params (0.05 gwei) so the burner's tiny ETH top-up is enough for the sweep tx.

## Environment

- `BLACKPOOL_KEY` - agent private key (0x-hex). Optional if you've run `blackpool login`.
- `BLACKPOOL_API` - API base URL (default `https://api.blackpool.cash`).
- `BLACKPOOL_RPC` / `BLACKPOOL_BASE_RPC` - Base RPC endpoint (default `https://mainnet.base.org`). Set to your own Alchemy / QuickNode URL for faster + more reliable gas estimation on the burner-heavy swap flow.
- `BLACKPOOL_ROBINHOOD_RPC` - Robinhood Chain RPC endpoint (default `https://rpc.mainnet.chain.robinhood.com`), used when `--chain robinhood`.

## Config files

- `~/.blackpool/wallet.json` - stored private key (chmod 600, only if you used `blackpool login` interactively).
- `~/.blackpool/config.json` - cached BLACKPOOL signatures per wallet (chmod 600).
- `~/.blackpool/zk/` - public proving key files, verified against the published SHA-256.

## Verified live on Base mainnet

Every command in this CLI has been exercised end-to-end against `api.blackpool.cash` with real on-chain transactions:

- `deposit` → `0x7ae2dde7…` (3 USDC shielded)
- `send` → `0x2108ae58…` (1.49125 USDC delivered privately, fee 1.00875)
- `swap` → `0x1bd8d68d…` (0.001 ETH → 1.170797 USDC private, full reshield)
- `bridge` → `0xdfc495fa…` (2.5 USDC Base → 1.484306 USDC delivered to Arbitrum)
- `recover` → 1.9895 USDC swept back from a stranded burner

## Cross-chain destinations

Run `blackpool assets` for the full live list. Currently: **Base, Ethereum, BSC, Arbitrum** - ETH / WETH / USDC / USDT / cbBTC / ARB / BNB depending on the chain.

## Roadmap

- `@blackpool/sdk` - TypeScript SDK for programmatic use inside an agent.
- Mandate limits - human-signed spend cap per window (aligns with the "supervised agent" pattern).
- Optional wallet encryption at rest - passphrase-protected `wallet.json`.

## Support

Docs: [docs.blackpool.cash/agents](https://docs.blackpool.cash/agents) · Site: [blackpool.cash](https://blackpool.cash)

## Agents

Run any command with `--json` (or `BLACKPOOL_JSON=1`) to get one JSON object on stdout and progress on stderr; exit codes are `0` ok, `1` failed, `2` usage. [`AGENTS.md`](AGENTS.md) (also at https://blackpool.cash/AGENTS.md) documents every command's fields, minimums, retry rules and security notes.

## MCP

`blackpool mcp` runs a Model Context Protocol server over stdio, so agent apps can call Blackpool as tools:

```json
{ "mcpServers": { "blackpool": { "command": "npx", "args": ["-y", "@blackpool/cli@latest", "mcp"], "env": { "BLACKPOOL_KEY": "0x..." } } } }
```

`BLACKPOOL_MCP_TOOLS=balance,send` limits the tools, `BLACKPOOL_MCP_READONLY=1` exposes read-only ones. A hosted read-only server (status, fees, assets, quotes, analytics, guide) runs at `https://mcp.blackpool.cash/mcp`. Details: [AGENTS.md §9](AGENTS.md).
