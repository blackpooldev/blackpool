# AGENTS.md — Blackpool for agents

Private payments for AI agents and scripts. This file is the complete guide to using Blackpool through its CLI: setup, every command, the JSON each one returns, chains and limits, recipes, integration code, errors and safety rules. Start with the quickstart; everything after it is reference.

| | |
|---|---|
| This file | https://blackpool.cash/AGENTS.md (plain markdown, no JavaScript, no bot challenge) |
| Mirrors | https://raw.githubusercontent.com/blackpooldev/blackpool/main/AGENTS.md · inside the npm package at `node_modules/@blackpool/cli/AGENTS.md` |
| Index for LLMs | https://blackpool.cash/llms.txt |
| CLI | [`@blackpool/cli`](https://www.npmjs.com/package/@blackpool/cli) — Node.js 18+ |
| MCP | local: `npx -y @blackpool/cli@latest mcp` · hosted read-only: `https://mcp.blackpool.cash/mcp` (§9) |
| API | `https://api.blackpool.cash` (the CLI calls it for you) |
| Live status | https://blackpool.cash/status |
| Human docs | https://blackpool.cash/docs |

---

## 1. Quickstart (60 seconds)

```sh
npm i -g @blackpool/cli                 # or prefix every command with: npx -y @blackpool/cli@latest
export BLACKPOOL_KEY=0x<agent-wallet-private-key>   # a dedicated wallet, never your main one
export BLACKPOOL_JSON=1                 # every command prints one JSON object on stdout

blackpool address                       # → {"ok":true,"command":"address","address":"0x…"}  fund this address
blackpool deposit 25 --pool usdc --chain base          # shield 25 USDC (the only step that needs gas)
blackpool send 0xRECIPIENT 10 --pool usdc --chain base # private payment, relayer pays gas
blackpool balance --chain base --pool usdc             # → {"ok":true,…,"balance":"13.965",…}
```

Agent app with MCP support? Skip the shell entirely: see §9.

Paste this into your agent's instructions:

```text
You can make private crypto payments with the `blackpool` CLI (env BLACKPOOL_KEY and BLACKPOOL_JSON=1 are set).
Always run commands with a timeout of at least 300 seconds and parse the single JSON object on stdout.
"ok": true means it succeeded; "ok": false has an "error" to report. Exit code 2 means you called it wrong.
Before paying, check `blackpool balance --chain <c> --pool <p>`; if it is short, `blackpool deposit` first.
Never retry deposit, send, swap or bridge after a timeout or unclear failure: run `blackpool balance --wait`
(or `blackpool bridges`) to see whether it landed. `blackpool recover --chain all` is always safe to run.
Never print, log or share BLACKPOOL_KEY or anything in ~/.blackpool.
Full guide: https://blackpool.cash/AGENTS.md
```

---

## 2. How Blackpool works (what an agent needs to know)

- **Public balance**: tokens in the agent wallet, visible to everyone.
- **Private balance**: notes inside a Blackpool pool contract. Spending them reveals neither the agent wallet nor which deposit paid.
- **Shield (`deposit`)**: moves public funds into the pool. Signed and paid (gas) by the agent wallet. This is the only on-chain action that shows your wallet.
- **Private operations (`send`, `swap`, `bridge`)**: a zero-knowledge proof spends notes; the Blackpool relayer submits the transaction and pays gas. The fee is taken from the amount moved, so the agent needs no gas for these.
- **Burner**: a one-time wallet used inside `swap` and `bridge`. Its key is encrypted locally and registered before it is funded, so `recover` can always sweep it.
- **Account**: derived from one signature of the Blackpool sign-in message by the agent wallet. Same key → same private account on every chain and machine.
- **Pools are per chain and per asset.** A private USDC balance on Base cannot pay on Arbitrum; use `bridge` to move between chains.

---

## 3. Setup

### 3.1 Install

```sh
npm i -g @blackpool/cli        # global: `blackpool …`
npx -y @blackpool/cli@latest …  # no install, always the newest version
blackpool version --json        # {"ok":true,"command":"version","version":"0.2.0"}
blackpool latest --json         # {"ok":true,"command":"latest","installed":"0.2.0","latest":"0.2.0","upToDate":true}
```

### 3.2 Configure

| Variable | Required | Purpose |
|---|---|---|
| `BLACKPOOL_KEY` | yes (or run `blackpool login` once) | Agent wallet private key, 0x-prefixed hex. Used only locally. |
| `BLACKPOOL_JSON` | recommended | `1` = JSON output for every command (same as adding `--json`). |
| `BLACKPOOL_HOME` | no | Config/cache directory, default `~/.blackpool`. Set it when the home directory is read-only (containers, serverless). |
| `BLACKPOOL_API` | no | API base URL, default `https://api.blackpool.cash`. |

Without `BLACKPOOL_KEY`, `blackpool login` asks for the key with a hidden prompt and stores it at `~/.blackpool/wallet.json` (mode 600). Agents should prefer the environment variable.

### 3.3 Fund

```sh
blackpool address --json
```

Send the agent wallet the asset you want to shield **plus a little native gas for the deposit** (a deposit uses about 1.3M gas; keep at least 0.0005 ETH on Robinhood Chain, Base or Arbitrum, or 0.002 BNB on BNB Chain). After shielding, private operations need no gas.

### 3.4 Verify

```sh
blackpool balance --chain all --json
```

---

## 4. Command reference

Every command accepts `--json`. Amounts are plain decimals in token units (`10`, `0.25`), never wei. `--chain` defaults to `base`. Typical durations assume a healthy network.

### `address`
Print the agent wallet address.
```json
{"ok":true,"command":"address","address":"0x70997970C51812dc3A010C7d01b50e0d17dc79C8"}
```

### `balance [--chain C|all] [--pool P] [--wait]`
Private and public balances. `--pool` limits the answer to one private pool. `--wait` polls up to 30 s while a private balance reads 0 (use right after a deposit). ~5–15 s.
```json
{"ok":true,"command":"balance","chain":"base","pool":"usdc","address":"0x…","balance":"13.965","symbol":"USDC","utxos":2}
```
Without `--pool` (one entry per chain; `--chain all` returns four):
```json
{"ok":true,"command":"balance","balances":[{"chain":"base","address":"0x…",
  "private":{"ETH":{"balance":"0.0","utxos":0},"USDC":{"balance":"13.965","utxos":2}},
  "public":{"ETH":"0.00412","USDC":"0.0"}}]}
```
A value of `"?"` with an `error` field means that read failed; retry.

### `deposit <amount> [--pool P] [--chain C]`
Shield public funds from the agent wallet. ERC-20 pools approve first (one extra transaction). Needs native gas. ~10–30 s (the first run also downloads the 20 MB proving key).
```json
{"ok":true,"command":"deposit","chain":"base","pool":"usdc","amount":25,"symbol":"USDC",
 "txHash":"0x…","explorer":"https://basescan.org/tx/0x…","privateBalance":"25.0"}
```
`--pool` defaults to the chain's stablecoin pool.

### `send <recipient> <amount> [--pool P] [--chain C]`
Private payment to any EVM address on the same chain. `amount` is what leaves your private balance; the recipient gets `amount − fee`. No gas needed. ~10–30 s.
```json
{"ok":true,"command":"send","chain":"base","pool":"usdc","recipient":"0x…","amount":10,
 "received":"8.965","fee":"1.035","symbol":"USDC","txHash":"0x…","explorer":"https://basescan.org/tx/0x…"}
```
To make the recipient receive exactly `X`, send `(X + flat) / (1 − 0.0035)` rounded up (see §5).

`amount` can be `max`: the whole private balance of `--pool`, of every pool on the chain when `--pool` is omitted, or of every pool on every chain with `--chain all`. A send spends at most two notes, so a balance spread over more notes goes out in several sends; a balance at or below twice its fee is left as dust.
```json
{"ok":true,"command":"send","recipient":"0x…","amount":"max","sends":[{"chain":"bsc","pool":"usdt","amount":"12.253307487806713664",
 "received":"11.7104…","fee":"0.5428…","txHash":"0x…"}],"received":{"USDT":"11.7104…"},"dust":[],"errors":[]}
```

### `swap <amount> --from P [--chain C] [--slippage BPS]`
Private same-chain swap between the chain's native pool and stablecoin pool; the output is re-shielded into your private balance. `--slippage` in basis points, default `100` (1%). No gas needed. ~1–3 min.
`amount` can be `max`: the most one swap can move (its two largest notes). If the balance is spread over more notes, the output says what is left; run `swap max` again for the rest.
```json
{"ok":true,"command":"swap","chain":"base","from":"eth","amount":0.01,"received":"22.41",
 "symbol":"USDC","txHash":"0x…","explorer":"https://basescan.org/tx/0x…","privateBalance":"36.375"}
```
If it fails half-way, funds sit on a registered burner: run `recover`.

### `bridge <dest-asset> <recipient> <amount> --from ORIGIN [--no-wait]`
Private cross-chain transfer through NEAR Intents. `ORIGIN` is the private pool paying (default `base_usdc`); `dest-asset` and recipient format are listed in §6. The withdrawal is private; the solver delivers on the destination chain. Without `--no-wait` the CLI polls up to 6 minutes.
`amount` can be `max`: the most one bridge can move from the `--from` pool (its two largest notes); the route minimum still applies.
```json
{"ok":true,"command":"bridge","from":"base_usdc","to":"sol_usdc","recipient":"7Gx4…kQ2m","amount":10,
 "amountOutQuote":"8.91","withdrawTx":"0x…","depositAddress":"0x…","statusUrl":"https://…",
 "status":"SUCCESS","amountOut":"8.93"}
```
`status` is `SUBMITTED` (with `--no-wait`), `SUCCESS`, or `PENDING` (still running after 6 min; check `bridges` later). A refund or failure returns `"ok":false`; refunds go to the agent wallet on the origin chain.

### `bridges`
Every bridge this account has made, newest first, from the server-side intent registry (works from any machine).
```json
{"ok":true,"command":"bridges","bridges":[{"status":"SUCCESS","createdAt":1793760000000,"amountIn":"10",
 "fromAsset":"base_usdc","toAsset":"sol_usdc","recipient":"7Gx4…","refundTo":"0x…","originChain":"base",
 "amountOutQuote":"8.91","amountOut":"8.93","destTx":"…","depositAddress":"0x…","statusUrl":"https://…"}]}
```

### `assets`
Bridge destinations and valid origins, live from the API.
```json
{"ok":true,"command":"assets","assets":{"sol_usdc":{"chain":"sol","symbol":"USDC","decimals":6,"isNative":false},"…":{}},
 "origins":["base_eth","base_usdc","hood_eth","hood_usdg","arb_eth","arb_usdc","bsc_bnb","bsc_usdc","bsc_usdt"]}
```

### `recover [--to ADDR] [--chain C|all]`
Sweep every registered burner that still holds funds to the agent wallet (or `--to`). Idempotent and safe at any time. Swept funds land in the **public** wallet; `deposit` again to make them private. ~10–60 s per chain. A burner that holds tokens but no gas gets a gas top-up from the relayer first; if that is refused, the result reports it in `needsGas` instead of claiming the chain is clean.
```json
{"ok":true,"command":"recover","recovered":[{"chain":"base","to":"0x…","swept":1,"dust":0,"errors":0,"needsGas":0}]}
```

### `login`, `logout`, `version`, `latest`, `help`
`login` signs and caches the sign-in message (`{"address"}`); `logout` deletes the stored key and cache (`{"removed":[…]}`); `version` and `latest` report versions.

---

## 5. Chains, pools, fees and minimums

| `--chain` | Pools (`--pool`) | Min deposit | Min send / swap / bridge | Flat fee | DEX for `swap` |
|---|---|---|---|---|---|
| `base` (default) | `eth`, `usdc` | 0.001 ETH · 3 USDC | 0.001 ETH · 2 USDC | 0.00015 ETH · 1 USDC | Uniswap V3 |
| `robinhood` | `eth`, `usdg` | 0.001 ETH · 3 USDG | 0.001 ETH · 2 USDG | 0.00015 ETH · 0.5 USDG | Uniswap V3 |
| `arbitrum` | `eth`, `usdc` | 0.001 ETH · 3 USDC | 0.001 ETH · 2 USDC | 0.00015 ETH · 0.5 USDC | Uniswap V3 |
| `bsc` | `bnb`, `usdc`, `usdt` | 0.01 BNB · 3 USDC/USDT | 0.001 BNB · 2 USDC/USDT | 0.001 BNB · 0.5 USDC/USDT | PancakeSwap V3 |

- **Fee** on every private spend = flat fee + 0.35% of the amount, deducted from the amount. Example: `send 10` USDC on Base → fee 1 + 0.035 = 1.035, recipient gets 8.965.
- A spend must be more than twice its own fee; the CLI enforces the minimums above before doing anything.
- Bridges pay the pool fee plus the solver's quote (shown as `amountOutQuote`); each route also has a solver minimum.
- `deposit` costs only network gas; there is no Blackpool fee on shielding.

---

## 6. Bridging

**Origins** (`--from`): `base_eth`, `base_usdc`, `hood_eth`, `hood_usdg` (Robinhood Chain), `arb_eth`, `arb_usdc`, `bsc_bnb`, `bsc_usdc`, `bsc_usdt`.

**Destinations** (`dest-asset`; run `blackpool assets` for the live list):

| Chain | Assets | Recipient format |
|---|---|---|
| Base | `base_eth`, `base_weth`, `base_usdc`, `base_cbbtc` | EVM `0x…` |
| Ethereum | `eth_eth`, `eth_weth`, `eth_usdc`, `eth_usdt`, `eth_cbbtc` | EVM `0x…` |
| Arbitrum | `arb_eth`, `arb_weth`, `arb_usdc`, `arb_usdt`, `arb_arb` | EVM `0x…` |
| BNB Chain | `bsc_bnb`, `bsc_usdc`, `bsc_usdt` | EVM `0x…` |
| Robinhood Chain | `hood_eth`, `hood_usdg`, `hood_weth`, `hood_usde` | EVM `0x…` |
| Solana | `sol_sol`, `sol_usdc`, `sol_usdt` | base58 public key |

**Statuses** in `bridges`: `PENDING_DEPOSIT` → `PROCESSING` → `SUCCESS`, or `REFUNDED` / `FAILED` (refund to `refundTo` on `originChain`). Treat any other value as in progress.

---

## 7. Recipes

### Pay an invoice exactly
```sh
# recipient must receive 50 USDC on Base: amount = (50 + 1) / 0.9965 = 51.18 (round up)
blackpool balance --chain base --pool usdc --json        # need >= 51.18
blackpool send 0xVENDOR 51.18 --pool usdc --chain base --json
```

### Top up only when needed
```sh
bal=$(blackpool balance --chain base --pool usdc --json | jq -r .balance)
if (( $(echo "$bal < 51.18" | bc -l) )); then blackpool deposit 100 --pool usdc --chain base --json; fi
```

### Batch payouts (sequential, never parallel)
```sh
while IFS=, read -r to amount; do
  out=$(blackpool send "$to" "$amount" --pool usdc --chain base --json)
  echo "$out" >> payouts.jsonl
  [ "$(echo "$out" | jq -r .ok)" = "true" ] || { echo "stopped at $to"; break; }
done < payouts.csv
```
Run payouts one at a time: each spend consumes notes and returns change, so parallel sends from one account can race.

### Swap ETH to USDC privately
```sh
blackpool swap 0.01 --from eth --chain base --json
```

### Bridge to Solana without blocking
```sh
blackpool bridge sol_usdc <solana-address> 10 --from base_usdc --no-wait --json
blackpool bridges --json | jq '.bridges[0].status'     # poll every minute until SUCCESS / REFUNDED
```

### Move private funds to another chain (rebalance)
```sh
blackpool bridge arb_usdc $(blackpool address --json | jq -r .address) 20 --from base_usdc --json
blackpool deposit 19 --pool usdc --chain arbitrum --json   # re-shield on the destination chain
```
The bridge delivers to a public address; shield it again on the destination chain.

### Health check before a run
```sh
curl -s https://api.blackpool.cash/api/health | jq '.ok, .relayerGas'
```

### Clean up after an interrupted swap or bridge
```sh
blackpool recover --chain all --json
```

---

## 8. Integration code

### Node.js
```js
import { execFile } from 'node:child_process'

export function blackpool(args, { timeoutMs = 300_000 } = {}) {
  return new Promise((resolve) => {
    execFile('blackpool', [...args, '--json'], { timeout: timeoutMs, env: process.env }, (err, stdout, stderr) => {
      try { resolve(JSON.parse(stdout.trim().split('\n').pop())) }
      catch { resolve({ ok: false, error: (stderr || err?.message || 'no output').trim(), exitCode: err?.code }) }
    })
  })
}

const r = await blackpool(['send', '0xRECIPIENT', '10', '--pool', 'usdc', '--chain', 'base'])
if (!r.ok) throw new Error(r.error)
console.log(r.txHash, r.received)
```

### Python
```python
import json, subprocess

def blackpool(*args, timeout=300):
    p = subprocess.run(["blackpool", *args, "--json"], capture_output=True, text=True, timeout=timeout)
    try:
        return json.loads(p.stdout.strip().splitlines()[-1])
    except (ValueError, IndexError):
        return {"ok": False, "error": (p.stderr or "no output").strip(), "exitCode": p.returncode}

r = blackpool("balance", "--chain", "base", "--pool", "usdc")
print(r["balance"] if r["ok"] else r["error"])
```

### Tool definition for function-calling models
Expose one tool and let the model choose the command:
```json
{
  "name": "blackpool",
  "description": "Private crypto payments via the Blackpool CLI. Commands: address; balance [--chain base|robinhood|arbitrum|bsc|all] [--pool P] [--wait]; deposit <amount> [--pool P] [--chain C]; send <recipient> <amount> [--pool P] [--chain C]; swap <amount> --from P [--chain C]; bridge <dest-asset> <recipient> <amount> --from ORIGIN [--no-wait]; bridges; assets; recover [--chain C|all]. Returns one JSON object; ok=false carries an error. Never retry deposit/send/swap/bridge without checking balance first.",
  "input_schema": {
    "type": "object",
    "properties": {
      "args": { "type": "array", "items": { "type": "string" }, "description": "CLI arguments, e.g. [\"send\",\"0xabc…\",\"10\",\"--pool\",\"usdc\",\"--chain\",\"base\"]" }
    },
    "required": ["args"]
  }
}
```
Implement it with the Node or Python wrapper above. Allow-list the first argument to the commands you want the agent to use (for example only `balance`, `send` and `bridges`).

---

## 9. MCP servers

Blackpool speaks the [Model Context Protocol](https://modelcontextprotocol.io), so any MCP-capable agent app can call it as tools instead of running shell commands. There are two servers.

Both are listed publicly, so an agent app or directory can find them by name:

| Listing | Name | What is listed |
|---|---|---|
| [Official MCP Registry](https://registry.modelcontextprotocol.io/v0.1/servers/cash.blackpool%2Fblackpool/versions/latest) | `cash.blackpool/blackpool` | The local server (npm package) and the hosted endpoint |
| [Glama — server](https://glama.ai/mcp/servers/blackpooldev/blackpool) | `blackpooldev/blackpool` | The local server, built and tested from the open-source repository |
| [Glama — connector](https://glama.ai/mcp/connectors/cash.blackpool/blackpool) | `cash.blackpool/blackpool` | The hosted endpoint, ownership verified and health-checked |
| [npm](https://www.npmjs.com/package/@blackpool/cli) | `@blackpool/cli` | The package that runs the local server |

### 9.1 Local server — payments (recommended)

Runs on your machine over stdio and exposes the full CLI as tools. The wallet key stays in the local environment; tools behave exactly like the commands in §4 and return the same JSON.

Add it to your app's MCP configuration (most apps use this `mcpServers` format):

```json
{
  "mcpServers": {
    "blackpool": {
      "command": "npx",
      "args": ["-y", "@blackpool/cli@latest", "mcp"],
      "env": {
        "BLACKPOOL_KEY": "0x<agent-wallet-private-key>",
        "BLACKPOOL_MCP_TOOLS": "balance,send,bridges"
      }
    }
  }
}
```

With the CLI installed globally, `"command": "blackpool", "args": ["mcp"]` works too. Apps that add servers from a terminal take the same command: `npx -y @blackpool/cli@latest mcp`.

| Tool | Does | Annotations |
|---|---|---|
| `blackpool_address` | Agent wallet address | read-only |
| `blackpool_balance` | Private and public balances (`chain`, `pool`, `wait`) | read-only |
| `blackpool_deposit` | Shield from the agent wallet (`amount`, `pool`, `chain`) | destructive |
| `blackpool_send` | Private payment (`recipient`, `amount`, `pool`, `chain`) | destructive |
| `blackpool_swap` | Private same-chain swap (`amount`, `from`, `chain`, `slippage_bps`) | destructive |
| `blackpool_bridge` | Private bridge (`dest_asset`, `recipient`, `amount`, `from`, `wait`) | destructive |
| `blackpool_bridges` | Bridge history and status | read-only |
| `blackpool_assets` | Bridge destinations and origins | read-only |
| `blackpool_recover` | Sweep stranded burners (`chain`, `to`) | idempotent |

Resource: `blackpool://agents.md` (this guide).

Limit what the agent can do from the configuration:

| Variable | Effect |
|---|---|
| `BLACKPOOL_MCP_TOOLS` | Comma-separated allow-list, e.g. `balance,send,bridges` (with or without the `blackpool_` prefix). |
| `BLACKPOOL_MCP_READONLY` | `1` exposes only read-only tools. |
| `BLACKPOOL_HOME`, `BLACKPOOL_API` | Same as for the CLI (§3.2). |

Every tool result carries the command's JSON as `structuredContent` (and as text); `isError` is `true` when `"ok": false`. The retry rules in §12 apply unchanged: never repeat `blackpool_deposit`, `blackpool_send`, `blackpool_swap` or `blackpool_bridge` after a timeout without checking `blackpool_balance` or `blackpool_bridges` first.

### 9.2 Hosted server — read-only

`https://mcp.blackpool.cash/mcp` (Streamable HTTP, no sign-in). It never receives keys or signatures, so it can only answer questions:

| Tool | Returns |
|---|---|
| `blackpool_status` | API health, configured pools, relayer gas per chain |
| `blackpool_fees` | Flat fee, rate, minimum deposit and minimum spend per pool |
| `blackpool_assets` | Bridge destinations and origins |
| `blackpool_bridge_quote` | Indicative quote (`from`, `to`, `amount`) |
| `blackpool_analytics` | Shielded notes per chain and pool, relayer fees |
| `blackpool_guide` | This guide, whole or one section (`section`) |

```json
{
  "mcpServers": {
    "blackpool-info": { "url": "https://mcp.blackpool.cash/mcp" }
  }
}
```

Use the hosted server to plan (fees, routes, quotes, status) and the local server to act.

---

## 10. Output contract

- stdout: exactly one line of JSON when `--json` (or `BLACKPOOL_JSON=1`) is set. stderr: human progress, safe to log.
- Envelope: `{"ok": true, "command": "<name>", …fields}` or `{"ok": false, "command": "<name>", "error": "<message>"}`.
- Amounts are decimal strings in token units (some input echoes such as `amount` are numbers). Tx hashes are 0x-hex; `explorer` is a full URL.
- Exit codes: `0` success · `1` failed or refused (including amounts under a minimum) · `2` usage (unknown command, missing arguments).
- New fields may be added; existing fields are not renamed or removed without a major version bump.

---

## 11. Errors and what to do

| `error` contains | Meaning | Do |
|---|---|---|
| `no wallet configured` | `BLACKPOOL_KEY` missing | Set it, or run `blackpool login`. |
| `invalid BLACKPOOL_KEY` / `stored key invalid` | Not a 0x hex private key | Fix the key. |
| `minimum deposit is …` / `minimum send is …` | Below the floor in §5 | Use a larger amount. |
| `unknown pool` / `unknown chain` / `unknown --from` | Wrong flag value | Use the values in §5–6. |
| `invalid recipient address` | Wrong format for the destination | EVM `0x…` (40 hex) or Solana base58. |
| `insufficient` / `no unspent` | Private balance too low | `balance`, then `deposit` more. |
| `Withdrawal must be more than twice the fee` | Amount too close to the fee | Larger amount. |
| `Amount is too low for this route. Minimum is …` | Solver minimum for that bridge | Bridge at least that much. |
| `This route needs at least $… right now` | Temporary USD floor the solver network sets on a route (code `ROUTE_MINIMUM`; currently every route to or from BNB Chain) | Bridge at least that much or pick another destination. Nothing left the private balance. |
| `No route for this pair right now` | No solver quotes the pair (code `NO_ROUTE`) | Pick another token or chain. |
| `rate limited, slow down` | API limit (40 relay ops, 600 reads per minute per IP) | The CLI already waited and retried 4 times; pause a minute. |
| `simulation failed: …` | The relayer refused a transaction that would revert | Do not retry blindly; check `balance`; report the message. |
| `reshield would revert` / `swap output … too small` | Swap stopped after funds reached the burner | `recover`, then `deposit` again. |
| `solver refunded` / `bridge failed at solver` | Bridge did not complete | Refund goes to the agent wallet on the origin chain; `deposit` to re-shield. |
| `timeout` / `fetch failed` / `HTTP 5xx` | Network or service problem | Check https://blackpool.cash/status; for write commands check `balance --wait` before retrying. |

---

## 12. Retries, timeouts, concurrency

- Safe to retry any time: `address`, `balance`, `assets`, `bridges`, `recover`, `version`, `latest`.
- **Not** safe to retry blindly: `deposit`, `send`, `swap`, `bridge`. A timeout can mean the transaction landed. Check `balance --wait` (or `bridges`) and only retry if the balance is unchanged.
- Give every command a timeout of **at least 300 s** (`bridge` without `--no-wait` up to 420 s).
- One write command at a time per account. Reads can run in parallel.
- A private balance can read `0` for a few seconds after a deposit while the indexer catches up; use `--wait`.

---

## 13. Security

- **Dedicated agent wallet.** Fund it with only what the agent may spend. Never use a personal or treasury key.
- `BLACKPOOL_KEY` never leaves the machine: it signs the sign-in message, deposit approvals and deposit transactions locally.
- The **sign-in signature** is cached in `$BLACKPOOL_HOME/config.json` (mode 600) and never sent anywhere: keys, note scanning and proofs are computed locally (CLI 0.4.0+), and the relayer receives finished proofs only. Anyone holding that signature can spend the agent's private balance. Treat the config directory like a key: never print it, never put it in prompts, logs or tool output.
- Only sign the Blackpool sign-in message on blackpool.cash or with this CLI.
- The contracts and circuits have not been externally audited; pools are upgradeable and pausable by a 2-of-3 Safe (0x401027251176A8AFec701fE37412edeC45ec6FdB), which cannot move notes. Size balances accordingly. Details: https://blackpool.cash/docs#security
- Report vulnerabilities privately to hello@blackpool.cash (subject `security`).

---

## 14. Direct API (advanced)

The CLI is the supported interface: it derives keys and generates Groth16 proofs locally. A client in another language must do the same (see `cli/lib/zk.js`): read public pool data from `GET /api/zk/pool`, derive keys from the EIP-191 signature of the exact message below, prove with the published circuit (`https://blackpool.cash/zk/manifest.json`), then post the proof to `POST /api/relay`, or broadcast a deposit from its own wallet. The API never accepts the signature itself. Endpoint list: https://blackpool.cash/docs#api

```text
Welcome to Blackpool

Sign this message to access your private account.

- Gas free: no transaction is sent
- Your private account keys are derived from this signature
- It cannot move funds from your wallet or approve spending
- Only sign it on blackpool.cash or the Blackpool CLI
```

The message is part of the account: a different message, even by one character, is a different (empty) account.

---

## 15. Working on this repository

If you are a coding agent editing this repository rather than using the CLI: the CLI lives in `cli/`, contracts in `contracts/`, circuits in `circuits/`, client libraries in `src/`, the web app in `frontend/`. Run `npx hardhat test` before changing contracts or core libraries. Keep the sign-in message, note format and circuit byte-identical across `src/`, `cli/` and `frontend/` (changing any of them changes every account). Never commit keys, `.env` files or credentials. Keep this file in sync with `cli/bin/blackpool.js` when commands or output fields change.
