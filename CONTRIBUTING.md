# Contributing

Thanks for looking at Blackpool. The project is small and opinionated, so a little context before you start.

## Before a pull request

- Open an issue first for anything beyond a bug fix, so we can agree on the approach.
- Keep changes to the cryptographic core out of pull requests. The circuit (`circuits/`), `MerkleTreeWithHistory`, the note/keypair format (`src/keypair.js`, `src/utxo.js`), the sign-in message and the Merkle zero family are frozen: existing private balances depend on them byte for byte. Changes there need a migration plan discussed in an issue.
- Frontend, API, CLI, indexer, docs and tests are all fair game.

## Working on it

```bash
npm install
npm run compile      # Hardhat 3 build + Poseidon hasher bytecode
npm test             # 149 tests, real Groth16 proofs, about two minutes
cd frontend && npm install && npm run dev
```

The API runs with `node scripts/apiServer.js` and reads its pools from `*_POOL_ADDRESS` / `*_POOL_DEPLOY_BLOCK` environment variables; without any it serves an empty pool list, which is fine for frontend work.

## Style

- JavaScript/TypeScript with no semicolons on the backend, Prettier defaults on the frontend; keep each file's existing style.
- Comments and commit messages in English. Explain *why*, not what.
- One logical change per commit; a short imperative subject line.
- Never commit anything from `credentials/`, `.env` files, keys or signatures. The pre-commit hook blocks the obvious cases but is not a substitute for care.

## Reporting bugs

Open an issue with a reproduction and the affected component. For anything security-related, see [SECURITY.md](SECURITY.md) and do not open a public issue.
