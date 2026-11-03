# Blackpool contract addresses

Source of truth for what is deployed. The API serves whatever pools its environment lists; check `GET https://api.blackpool.cash/api/health`.

All pools are UUPS proxies (`ERC1967Proxy`); the admin can upgrade and pause, nothing else. **Admin of every pool on every chain: the 2-of-3 Safe `0x401027251176A8AFec701fE37412edeC45ec6FdB`** (Safe v1.4.1, same address on all four chains; owners `0x91614605bb513Ef7F4E4B2Eb1227F7Bb1cf2dAFe`, `0x271E822f5156Ea4693822e1f37463340c4028f13`, `0xc6fE6880D4D088D1771cDF8F350e05AA13B2b2f4`), since 2026-11-03. Merkle zero family `privacyblackpool`, `zeros(0) = 0x1edb91df646d66b3e01420a5b8316cb085a4c3999f548d66afd87cfb555e5bd6`, tree height 26, root history 100. Every implementation and verifier is verified on [Sourcify](https://sourcify.dev) (exact match) and imported by the chains' Blockscout explorers; Hasher contracts are generated Poseidon bytecode (circomlibjs) with no Solidity source.

Operational wallets (addresses only): deployer `0xB1aCDE318cd195b9Aa3B79441Fe171Bb9cF5FD0F`, relayer `0xb1aC1E5a5d68430061274875f3D6C71c885492f4`, fee recipient `0xb1acfEFc1023Ec6c875dB19AAC94571Dd3d08389`, former admin (retired, no rights) `0xB1aCad20c0D0F6dA98841b09369eFAe46FdD8126`.

> The same deployer at the same nonce produces the same `CREATE` address on every chain, so several addresses below repeat across chains while being different contracts. Always read an address together with its chain.

Native pools: max deposit 1000 ETH/BNB, minimum 0.0005. Stablecoin pools: max 1,000,000, minimum 1 (token units).

## Robinhood Chain (4663) — live 2026-11-02

Explorer: https://robin.etherscan.io

| Pool | Proxy | Implementation | Verifier2 | Hasher | Token | Deploy block |
|---|---|---|---|---|---|---|
| ETH (`BlackpoolEtherPoolL2`) | `0x993490DCc199A41D5A2A412e30bA205FD43B9D69` | `0x2A3a1219ef552b4fE2C8bFD450612004286478b6` | `0xAad8C42EB7dC22A8F623efa24E387F4cd98b5E22` | `0xEc38396bBA7b22605D8EF87b1b85C7baBFbe10b7` | native | 104372368 |
| USDG (`BlackpoolERCPoolL2`) | `0xeBfC2287Efc2FEDc51e24124A582bcb6CcDD5300` | `0x71716bCc48Ec226De36fa07d11959b1C27e9EC19` | `0xEC0FB87E77Fb18Abbbda726E69adFc561b148A02` | `0xf8572Bf291d143864E9166f7594c1d274A2b516e` | `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` (6 dec) | 104372640 |

## Base (8453) — live 2026-11-02

Explorer: https://basescan.org

| Pool | Proxy | Implementation | Verifier2 | Hasher | Token | Deploy block |
|---|---|---|---|---|---|---|
| ETH (`BlackpoolEtherPool`) | `0xEC0FB87E77Fb18Abbbda726E69adFc561b148A02` | `0x993490DCc199A41D5A2A412e30bA205FD43B9D69` | `0xEc38396bBA7b22605D8EF87b1b85C7baBFbe10b7` | `0x2A3a1219ef552b4fE2C8bFD450612004286478b6` | native | 53435689 |
| USDC (`BlackpoolERCPool`) | `0x71716bCc48Ec226De36fa07d11959b1C27e9EC19` | `0xf8572Bf291d143864E9166f7594c1d274A2b516e` | shared with ETH pool | shared with ETH pool | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (6 dec) | 53435695 |

## Arbitrum One (42161) — live 2026-11-02

Explorer: https://arbiscan.io

| Pool | Proxy | Implementation | Verifier2 | Hasher | Token | Deploy block |
|---|---|---|---|---|---|---|
| ETH (`BlackpoolEtherPoolL2`) | `0xEC0FB87E77Fb18Abbbda726E69adFc561b148A02` | `0x993490DCc199A41D5A2A412e30bA205FD43B9D69` | `0xEc38396bBA7b22605D8EF87b1b85C7baBFbe10b7` | `0x2A3a1219ef552b4fE2C8bFD450612004286478b6` | native | 520705940 |
| USDC (`BlackpoolERCPoolL2`) | `0x59E4f3A645cD9d23c99e12a00e541B77331B8Ad4` | `0xeBfC2287Efc2FEDc51e24124A582bcb6CcDD5300` | `0xf8572Bf291d143864E9166f7594c1d274A2b516e` | `0x71716bCc48Ec226De36fa07d11959b1C27e9EC19` | `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` (6 dec) | 520706038 |

## BNB Smart Chain (56) — live 2026-11-02

Explorer: https://bscscan.com — note BSC's Binance-Peg USDC/USDT have **18 decimals**.

| Pool | Proxy | Implementation | Verifier2 | Hasher | Token | Deploy block |
|---|---|---|---|---|---|---|
| BNB (`BlackpoolEtherPoolL2`) | `0xEC0FB87E77Fb18Abbbda726E69adFc561b148A02` | `0x993490DCc199A41D5A2A412e30bA205FD43B9D69` | `0xEc38396bBA7b22605D8EF87b1b85C7baBFbe10b7` | `0x2A3a1219ef552b4fE2C8bFD450612004286478b6` | native | 131326044 |
| USDC (`BlackpoolERCPoolL2`) | `0x59E4f3A645cD9d23c99e12a00e541B77331B8Ad4` | `0xeBfC2287Efc2FEDc51e24124A582bcb6CcDD5300` | `0xf8572Bf291d143864E9166f7594c1d274A2b516e` | `0x71716bCc48Ec226De36fa07d11959b1C27e9EC19` | `0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d` (18 dec) | 131326090 |
| USDT (`BlackpoolERCPoolL2`) | `0x3A3225C54b6D326C855eEa77d76a6F143Df6555D` | `0x0077925aFF147c58fCB8bd145FDe4C842BA6BdDD` | `0x8ECA0D72F5B8CBeFA37e080Ef89D905E72a7EA04` | `0xFe1b45fa6407A210205725fEB31B22c8D733E2B9` | `0x55d398326f99059fF775485246999027B3197955` (18 dec) | 131326136 |
