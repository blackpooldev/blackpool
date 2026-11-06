'use strict'
/**
 * blackpool mcp — Model Context Protocol server over stdio (newline-delimited JSON-RPC 2.0).
 *
 * Every tool runs the CLI itself as a child process with --json, so tools behave exactly like the commands documented
 * in AGENTS.md, and a failing command can never take the server down. The wallet key stays in this process's
 * environment (BLACKPOOL_KEY) and is only passed to the child; nothing is written to stdout except protocol messages.
 *
 * Optional environment:
 *   BLACKPOOL_MCP_TOOLS     comma-separated allow-list of tool names (default: all)
 *   BLACKPOOL_MCP_READONLY  1 = expose read-only tools only
 */
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')

const VERSION = require('../package.json').version
const CLI = path.join(__dirname, 'blackpool.js')
const SUPPORTED = ['2025-06-18', '2025-03-26', '2024-11-05']

const CHAIN = { type: 'string', enum: ['base', 'robinhood', 'arbitrum', 'bsc'], description: 'Chain. Default base.' }
const POOL = { type: 'string', description: 'Pool on that chain: eth|usdc (base, arbitrum), eth|usdg (robinhood), bnb|usdc|usdt (bsc). Default: the chain\'s stablecoin pool.' }
const AMOUNT = { type: 'string', pattern: '^([0-9]+(\\.[0-9]+)?|max)$', description: 'Decimal amount in token units, e.g. "10" or "0.25", or "max" (send: the whole pool balance; swap/bridge: the most one operation can move). Never wei.' }

const TOOLS = [
  {
    name: 'blackpool_address', title: 'Wallet address', readOnly: true,
    description: 'Address of the agent wallet. Fund it with the asset to shield plus a little native gas for deposits.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    args: () => ['address'],
  },
  {
    name: 'blackpool_balance', title: 'Balances', readOnly: true,
    description: 'Read the agent wallet\'s private (shielded) and public balances. Without pool: both pools of the chain (native coin and stablecoin) with their note (UTXO) counts; chain "all" covers every chain. With pool: that one private pool only. Read-only; needs BLACKPOOL_KEY. Use wait=true right after a deposit or send, when the private balance may still read 0. Returns {balances: [{chain, address, private: {SYMBOL: {balance, utxos}}, public: {SYMBOL: balance}}]}, or with pool {chain, pool, balance, symbol, utxos}.',
    inputSchema: { type: 'object', properties: { chain: { ...CHAIN, enum: [...CHAIN.enum, 'all'], description: 'Chain, or "all" for every chain. Default base.' }, pool: POOL, wait: { type: 'boolean', description: 'Poll up to 30 s while a private balance reads 0, e.g. right after a deposit. Default false.' } }, additionalProperties: false },
    args: (a) => ['balance', ...opt('--chain', a.chain), ...opt('--pool', a.pool), ...(a.wait ? ['--wait'] : [])],
  },
  {
    name: 'blackpool_deposit', title: 'Shield (deposit)', destructive: true,
    description: 'Shield public funds from the agent wallet into the private pool. Signs and pays gas from the agent wallet. Takes 30-90 s. Do not retry after a timeout without checking blackpool_balance.',
    inputSchema: { type: 'object', properties: { amount: AMOUNT, pool: POOL, chain: CHAIN }, required: ['amount'], additionalProperties: false },
    args: (a) => ['deposit', String(a.amount), ...opt('--pool', a.pool), ...opt('--chain', a.chain)],
  },
  {
    name: 'blackpool_send', title: 'Private send', destructive: true,
    description: 'Pay any EVM address privately from the private balance. The relayer pays gas; the recipient receives amount minus the fee (flat + 0.35%). amount "max" sends the whole balance of the pool (or of every pool when pool is omitted), splitting across several sends when needed and leaving dust untouched. Takes 30-90 s per send. Never retry after a timeout without checking blackpool_balance.',
    inputSchema: { type: 'object', properties: { recipient: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' }, amount: { type: 'string', pattern: '^([0-9]+(\\.[0-9]+)?|max)$', description: 'Decimal amount in token units, e.g. "10" or "0.25", or "max" for the whole private balance. Never wei.' }, pool: POOL, chain: CHAIN }, required: ['recipient', 'amount'], additionalProperties: false },
    args: (a) => ['send', a.recipient, String(a.amount), ...opt('--pool', a.pool), ...opt('--chain', a.chain)],
  },
  {
    name: 'blackpool_swap', title: 'Private swap', destructive: true,
    description: 'Private same-chain swap between the native pool and the stablecoin pool; output is re-shielded. If it stops half-way, run blackpool_recover.',
    inputSchema: { type: 'object', properties: { amount: AMOUNT, from: { type: 'string', description: 'Pool to swap from (eth|usdc on base/arbitrum, eth|usdg on robinhood, bnb|usdt on bsc).' }, chain: CHAIN, slippage_bps: { type: 'integer', minimum: 10, maximum: 500 } }, required: ['amount', 'from'], additionalProperties: false },
    args: (a) => ['swap', String(a.amount), '--from', a.from, ...opt('--chain', a.chain), ...opt('--slippage', a.slippage_bps)],
  },
  {
    name: 'blackpool_bridge', title: 'Private bridge', destructive: true,
    description: 'Private cross-chain transfer via NEAR Intents. from = origin private pool (base_eth, base_usdc, hood_eth, hood_usdg, arb_eth, arb_usdc, bsc_bnb, bsc_usdc, bsc_usdt); dest_asset from blackpool_assets; recipient is EVM 0x… or a Solana address for sol_*. Returns once submitted unless wait=true.',
    inputSchema: { type: 'object', properties: { dest_asset: { type: 'string' }, recipient: { type: 'string' }, amount: AMOUNT, from: { type: 'string' }, wait: { type: 'boolean', description: 'Poll delivery up to 6 minutes. Default false.' } }, required: ['dest_asset', 'recipient', 'amount', 'from'], additionalProperties: false },
    args: (a) => ['bridge', a.dest_asset, a.recipient, String(a.amount), '--from', a.from, ...(a.wait ? [] : ['--no-wait'])],
  },
  {
    name: 'blackpool_bridges', title: 'Bridge history', readOnly: true,
    description: 'Every bridge of this account with status (PENDING_DEPOSIT, PROCESSING, SUCCESS, REFUNDED, FAILED) and refund address.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    args: () => ['bridges'],
  },
  {
    name: 'blackpool_assets', title: 'Bridge assets', readOnly: true,
    description: 'List what the private bridge can deliver and which private pools can fund a bridge. Returns {assets: {KEY: {chain, symbol, decimals, isNative}}, origins: [...]} where origins are pool keys such as base_eth, hood_usdg or bsc_usdt. Use an assets KEY as dest_asset and an origins entry as from in blackpool_bridge. Read-only; needs no key and no gas.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    args: () => ['assets'],
  },
  {
    name: 'blackpool_recover', title: 'Recover', idempotent: true,
    description: 'Find the one-time burner wallets from earlier private swaps and bridges that still hold funds (for example after an interrupted swap) and sweep them to the agent wallet, or to the address in to. Idempotent and safe to run any time: empty burners are skipped and amounts too small to cover gas are reported as dust. Needs BLACKPOOL_KEY. Returns {recovered: [{chain, to, swept, dust, errors}]}.',
    inputSchema: { type: 'object', properties: { chain: { ...CHAIN, enum: [...CHAIN.enum, 'all'], description: 'Chain to scan, or "all" for every chain. Default all.' }, to: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$', description: 'Address to sweep to. Default: the agent wallet.' } }, additionalProperties: false },
    args: (a) => ['recover', ...opt('--chain', a.chain || 'all'), ...opt('--to', a.to)],
  },
]

function opt(flag, v) { return v === undefined || v === null || v === '' ? [] : [flag, String(v)] }

function enabledTools() {
  let list = TOOLS
  if (process.env.BLACKPOOL_MCP_READONLY === '1') list = list.filter(t => t.readOnly)
  const allow = (process.env.BLACKPOOL_MCP_TOOLS || '').split(',').map(s => s.trim()).filter(Boolean)
  if (allow.length) list = list.filter(t => allow.includes(t.name) || allow.includes(t.name.replace(/^blackpool_/, '')))
  return list
}

function describe(t) {
  return {
    name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema,
    annotations: { title: t.title, readOnlyHint: !!t.readOnly, destructiveHint: !!t.destructive, idempotentHint: !!(t.readOnly || t.idempotent), openWorldHint: true },
  }
}

function runCli(args, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args, '--json'], { env: { ...process.env, BLACKPOOL_JSON: '1' }, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = '', err = ''
    const timer = setTimeout(() => { child.kill('SIGTERM') }, timeoutMs)
    child.stdout.on('data', d => { out += d })
    child.stderr.on('data', d => { err += d; if (err.length > 20000) err = err.slice(-20000) })
    child.on('close', (code) => {
      clearTimeout(timer)
      const last = out.trim().split('\n').pop() || ''
      try { resolve({ code, json: JSON.parse(last) }) }
      catch { resolve({ code, json: { ok: false, error: code === null ? `timed out after ${Math.round(timeoutMs / 1000)} s; check balance before retrying` : (err.trim().split('\n').pop() || 'no output') } }) }
    })
  })
}

function agentsDoc() {
  try { return fs.readFileSync(path.join(__dirname, '..', 'AGENTS.md'), 'utf8') } catch { return 'See https://blackpool.cash/AGENTS.md' }
}

async function handle(msg) {
  const { id, method, params = {} } = msg
  switch (method) {
    case 'initialize': {
      const v = SUPPORTED.includes(params.protocolVersion) ? params.protocolVersion : SUPPORTED[0]
      return {
        protocolVersion: v,
        capabilities: { tools: { listChanged: false }, resources: { listChanged: false } },
        serverInfo: { name: 'blackpool', title: 'Blackpool', version: VERSION },
        instructions: 'Private payments with zero-knowledge pools. Check blackpool_balance before paying; deposit first if the private balance is short. Never retry deposit, send, swap or bridge after a timeout without checking blackpool_balance or blackpool_bridges. blackpool_recover is always safe. Full guide: resource blackpool://agents.md.',
      }
    }
    case 'ping': return {}
    case 'tools/list': return { tools: enabledTools().map(describe) }
    case 'tools/call': {
      const t = enabledTools().find(x => x.name === params.name)
      if (!t) throw rpcError(-32602, `unknown tool: ${params.name}`)
      const a = params.arguments || {}
      for (const r of t.inputSchema.required || []) if (a[r] === undefined || a[r] === '') return toolResult({ ok: false, error: `missing argument: ${r}` })
      const { json } = await runCli(t.args(a), t.name === 'blackpool_bridge' && a.wait ? 450_000 : 330_000)
      return toolResult(json)
    }
    case 'resources/list':
      return { resources: [{ uri: 'blackpool://agents.md', name: 'AGENTS.md', title: 'Blackpool guide for agents', mimeType: 'text/markdown', description: 'Setup, commands, JSON fields, limits, recipes, errors and security rules.' }] }
    case 'resources/read':
      if (params.uri !== 'blackpool://agents.md') throw rpcError(-32002, 'resource not found')
      return { contents: [{ uri: params.uri, mimeType: 'text/markdown', text: agentsDoc() }] }
    case 'resources/templates/list': return { resourceTemplates: [] }
    case 'prompts/list': return { prompts: [] }
    default: throw rpcError(-32601, `method not found: ${method}`)
  }
}

function toolResult(json) {
  return { content: [{ type: 'text', text: JSON.stringify(json) }], structuredContent: json, isError: json.ok === false }
}
function rpcError(code, message) { return Object.assign(new Error(message), { rpc: { code, message } }) }

function serve() {
  return new Promise((resolve) => {
    const send = (obj) => process.stdout.write(JSON.stringify(obj) + '\n')
    let buf = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => {
      buf += chunk
      let i
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1)
        if (!line) continue
        let msg
        try { msg = JSON.parse(line) } catch { send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } }); continue }
        const batch = Array.isArray(msg) ? msg : [msg]
        for (const m of batch) {
          if (m.id === undefined || m.id === null) continue // notification (initialized, cancelled, …)
          handle(m).then(
            (result) => send({ jsonrpc: '2.0', id: m.id, result }),
            (e) => send({ jsonrpc: '2.0', id: m.id, error: e.rpc || { code: -32603, message: String(e.message || e) } }),
          )
        }
      }
    })
    process.stdin.on('end', resolve)
  })
}

module.exports = { serve, TOOLS }
