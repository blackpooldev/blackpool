# Roadmap

Where Blackpool is today and what comes next. Dates are not promised; the order is.

## Live today

| Component | Status |
|---|---|
| ETH + USDG pools on Robinhood Chain | Live |
| ETH + USDC pools on Base | Live |
| ETH + USDC pools on Arbitrum | Live |
| BNB + USDC + USDT pools on BNB Chain | Live |
| Private send (up to two recipients per proof) | Live on all four chains |
| Same-chain swap through a one-time burner (Uniswap V3; PancakeSwap V3 on BNB Chain) | Live on all four chains |
| Private bridge via NEAR Intents (EVM chains and Solana) | Live |
| Encrypted burner registry + recovery from any device | Live at [blackpool.cash/recover](https://blackpool.cash/recover) |
| Client-side proving: keys and Groth16 proofs stay on the user's device (app and CLI) | Live |
| Relayer API: broadcasts finished proofs, no gas for the user | Live at `api.blackpool.cash` |
| CLI | [`@blackpool/cli`](https://www.npmjs.com/package/@blackpool/cli) on npm |
| Public analytics and status | [blackpool.cash/analytics](https://blackpool.cash/analytics), [blackpool.cash/status](https://blackpool.cash/status) |

Contract addresses for every pool are in [`deploy/ADDRESSES.md`](deploy/ADDRESSES.md); every implementation is verified on Sourcify.

## Next

1. **Admin to a multisig.** Pools are UUPS proxies controlled by a single admin key during launch. Upgrade and pause move to a multisig.
2. **External audit** of the pool contracts and circuits.
3. **Self-hosting guide** for running your own relayer and indexer against the same pools.

## Later

- **BLACKPOOL token:** TBA.

- More pool assets on the existing chains, and new EVM chains as configuration (token address, decimals, symbol), without contract changes.
- Opt-in disclosure: view keys for a single transaction, and proofs of non-association with sanctioned addresses that do not reveal the rest of your activity.
- A TypeScript SDK for integrators.

## Building in the open

The contracts, circuits, client libraries, CLI and web app are MIT-licensed in this repository. Security reports go to the address in [`SECURITY.md`](SECURITY.md).

- **App:** [blackpool.cash/app](https://blackpool.cash/app)
- **Docs:** [blackpool.cash/docs](https://blackpool.cash/docs)
- **Code:** [github.com/blackpooldev/blackpool](https://github.com/blackpooldev/blackpool)
