# Security policy

Blackpool moves real funds. If you find a way to steal, freeze, link or de-anonymise them, please tell us privately first.

## Reporting

Email **hello@blackpool.cash** with the subject `security`. Include the affected component (circuit, contract, relayer API, indexer, frontend, CLI), a reproduction, and the impact as you understand it. We acknowledge reports within 48 hours and keep you updated until the issue is closed. Please do not open a public issue, test against other users' funds, or run automated scanners against `api.blackpool.cash`.

## Scope

In scope: everything in this repository as deployed at blackpool.cash / api.blackpool.cash, and the on-chain contracts listed in `deploy/ADDRESSES.md`. Out of scope: third-party services the protocol routes through (DEX routers, NEAR Intents solvers, RPC and hosting providers), and social engineering.

## What we consider critical

- Spending or freezing notes you do not own, or spending a note twice.
- Linking a withdrawal to a deposit, or recovering a user's keys, from anything the relayer or indexer stores or logs.
- Making the relayer broadcast a transaction that does not pay the protocol fee, or that drains its gas wallet.
- Decrypting burner-registry rows without the owner's sign-in signature.

## Hard invariants

The sign-in message, the note format, the Merkle zero family and the circuit are frozen: any change to them breaks existing private balances. Reports that only concern these being "unusual" are appreciated but not bugs.
