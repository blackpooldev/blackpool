#!/usr/bin/env node
/**
 * blackpool CLI - private payments for onchain agents.
 *
 * Usage:
 *   blackpool login              -- sign BLACKPOOL message, cache signature for this wallet
 *   blackpool balance [--pool p] -- print private balance
 *   blackpool send <to> <amount> -- send privately to an address (amount "max" = the whole private balance)
 *
 * Auth: BLACKPOOL_KEY env var (agent private key, hex). No mnemonic support in MVP.
 * Config: ~/.blackpool/config.json stores cached signatures (per address).
 */

'use strict'

const path = require('path')
const fs = require('fs')
const os = require('os')
const { ethers } = require('ethers')

// === constants ===
const API = process.env.BLACKPOOL_API || 'https://api.blackpool.cash'
const SIGN_MESSAGE =
  'Welcome to Blackpool\n\n' +
  'Sign this message to access your private account.\n\n' +
  '- Gas free: no transaction is sent\n' +
  '- Your private account keys are derived from this signature\n' +
  '- It cannot move funds from your wallet or approve spending\n- Only sign it on blackpool.cash or the Blackpool CLI'
const CONFIG_DIR = process.env.BLACKPOOL_HOME || path.join(os.homedir(), '.blackpool')
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')   // cached BLACKPOOL sig
const WALLET_FILE = path.join(CONFIG_DIR, 'wallet.json')   // stored priv key (chmod 600)

// === tiny utilities ===
const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', cyan: '\x1b[36m', lime: '\x1b[38;5;155m'
}
// --json (or BLACKPOOL_JSON=1): stdout carries exactly one JSON object, human progress goes to stderr.
const JSON_MODE = process.argv.includes('--json') || process.env.BLACKPOOL_JSON === '1'
const RESULT = {}
let CMD = null
function result(obj) { Object.assign(RESULT, obj) }
function out(line) { if (JSON_MODE) process.stderr.write(line + '\n'); else console.log(line) }
function color(text, col) {
  return !JSON_MODE && process.stdout.isTTY ? `${col}${text}${c.reset}` : text
}
function ok(msg)   { out(color('✓ ', c.green) + msg) }
function fail(msg, code = 1) {
  if (JSON_MODE) process.stdout.write(JSON.stringify({ ok: false, command: CMD, error: String(msg) }) + '\n')
  else console.error(color('✗ ', c.red) + msg)
  process.exit(code)
}
// Extract a human revert reason from ethers' verbose errors (which otherwise dump the entire tx,
// calldata, and JSON-RPC request body into .message — unreadable in a terminal).
function cleanErr(e) {
  if (!e) return 'unknown error'
  // Most robust: search the ENTIRE stringified error tree for an on-chain revert reason. ethers v5
  // buries "execution reverted: <reason>" at unpredictable depths (e.message, e.error.body,
  // e.error.error.message, ...), so instead of guessing the path we regex the whole blob.
  let blob = ''
  try { blob = JSON.stringify(e) } catch { /* circular */ }
  blob += ' ' + (e.message || '') + ' ' + (e.error?.body || '')
  const rev = blob.match(/execution reverted:?\s*([^"'\\}\]]+?)\s*["'\\}\]]/i)
  if (rev && rev[1].trim()) return rev[1].trim()
  // Fallback: first clean reason field, else first line of message before ethers noise.
  const reason = e.reason || e.error?.reason
  if (reason && !/cannot estimate gas|processing response/i.test(reason)) return String(reason)
  const m = e.message || String(e)
  return m.split(/\s*[\(\[]\s*(?:See:|error=|reason=)/)[0].trim().slice(0, 200)
}
function info(msg) { out(color('  ', c.dim) + msg) }
function log(msg)  { out(msg) }

// === config ===
function loadConfig() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return { signatures: {} }
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
  } catch (e) {
    fail(`config unreadable at ${CONFIG_FILE}: ${e.message}`)
  }
}
function saveConfig(cfg) {
  try {
    if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 })
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), { mode: 0o600 })
  } catch (e) {
    fail(`could not write config: ${e.message}`)
  }
}

// === hidden input prompt (like sudo password, no echo) ===
// TTY path: setRawMode + no echo, backspace-aware. Non-TTY path: read line from stdin (for scripting / CI).
function promptHidden(question) {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin
    // Non-TTY (piped): read one line from stdin without echo suppression (already invisible in pipes).
    if (!stdin.isTTY) {
      process.stdout.write(question + color('(non-tty, reading from stdin)\n', c.dim))
      let buf = ''
      stdin.setEncoding('utf8')
      stdin.on('data', d => { buf += d })
      stdin.on('end', () => resolve(buf.replace(/\r?\n$/, '')))
      stdin.on('error', reject)
      return
    }
    // TTY: hidden input via raw mode.
    process.stdout.write(question)
    const wasRaw = stdin.isRaw
    stdin.setRawMode(true); stdin.resume(); stdin.setEncoding('utf8')
    let buf = ''
    const cleanup = () => { stdin.removeListener('data', onData); stdin.setRawMode(!!wasRaw); stdin.pause() }
    const onData = (data) => {
      for (const ch of data) {
        if (ch === '\u0003') { cleanup(); process.stdout.write('\n'); reject(new Error('aborted')); return } // Ctrl+C
        if (ch === '\r' || ch === '\n') { cleanup(); process.stdout.write('\n'); resolve(buf); return }
        if (ch === '\u007f' || ch === '\b') { if (buf.length > 0) buf = buf.slice(0, -1); continue }
        buf += ch
      }
    }
    stdin.on('data', onData)
  })
}

// === wallet storage ===
function loadStoredKey() {
  try {
    if (!fs.existsSync(WALLET_FILE)) return null
    const raw = JSON.parse(fs.readFileSync(WALLET_FILE, 'utf8'))
    return raw.privateKey || null
  } catch { return null }
}
function saveStoredKey(pk) {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 })
  fs.writeFileSync(WALLET_FILE, JSON.stringify({ privateKey: pk }, null, 2), { mode: 0o600 })
}

// === wallet ===
// Priority: BLACKPOOL_KEY env var (for agents / CI) > stored wallet.json (from `blackpool login`) > error.
function getWallet() {
  const key = process.env.BLACKPOOL_KEY || loadStoredKey()
  if (!key) {
    fail('no wallet configured. Run `blackpool login` to set one up (interactive, hidden input), or set BLACKPOOL_KEY env var.')
  }
  try {
    return new ethers.Wallet(key)
  } catch (e) {
    fail(`stored key invalid: ${e.message}`)
  }
}

// Cached signatures are only valid for the message they signed: a new sign-in message means a new account.
const SIGN_MESSAGE_ID = ethers.utils.id(SIGN_MESSAGE)
function getCachedSignature(address) {
  const cfg = loadConfig()
  if (cfg.signMessageId !== SIGN_MESSAGE_ID) return undefined
  return cfg.signatures?.[address.toLowerCase()]
}

async function ensureSignature(wallet, { forceNew = false } = {}) {
  const address = wallet.address
  if (!forceNew) {
    const cached = getCachedSignature(address)
    if (cached) return cached
  }
  const sig = await wallet.signMessage(SIGN_MESSAGE)
  const cfg = loadConfig()
  if (cfg.signMessageId !== SIGN_MESSAGE_ID) cfg.signatures = {}
  cfg.signMessageId = SIGN_MESSAGE_ID
  cfg.signatures = cfg.signatures || {}
  cfg.signatures[address.toLowerCase()] = sig
  saveConfig(cfg)
  return sig
}

// === HTTP ===
// === local proving ===
// Balance scans, deposits, payments and swaps are computed on this machine (lib/localApi.js): keys come from
// the cached sign-in signature, proofs from the circuit files in <BLACKPOOL_HOME>/zk/. The API only receives
// finished proofs (POST /api/relay) and serves public pool data, so the signature never leaves this machine.
let LOCAL = null
function localApi() {
  if (LOCAL) return LOCAL
  const { createLocalApi } = require('../lib/localApi')
  const { createCircuitLoader } = require('../lib/circuit')
  const UA = `blackpool-cli/${require('../package.json').version}`
  const request = async (method, endpoint, body) => {
    for (let attempt = 0; ; attempt++) {
      const r = await fetch(`${API}${endpoint}`, {
        method, headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
        body: method === 'GET' ? undefined : JSON.stringify(body || {}), signal: AbortSignal.timeout(120_000),
      })
      let json = {}
      try { json = await r.json() } catch {}
      if (r.status === 429 && attempt < 4) {
        const wait = Math.min(Math.max(Number(json?.retryAfter) || 5, 1), 30)
        info(`rate limited by the API, retrying in ${wait}s...`)
        await new Promise((res) => setTimeout(res, wait * 1000)); continue
      }
      if (!r.ok) throw Object.assign(new Error(json?.error || `HTTP ${r.status}`), { status: r.status })
      return json
    }
  }
  let said = false
  LOCAL = createLocalApi({
    request,
    loadCircuit: createCircuitLoader({ dir: path.join(CONFIG_DIR, 'zk'), userAgent: UA }),
    onProgress: (p) => {
      if (p.stage === 'download') info(`downloading proving key (${p.file}, ${Math.round((p.bytes || 0) / 1e6)} MB, first run only)...`)
      if (p.stage === 'prove' && !said) { info('generating zero-knowledge proof locally...'); said = true }
    },
  })
  return LOCAL
}

async function apiPost(endpoint, body, opts = {}) {
  if (localApi().handles(endpoint)) return localApi().handle(endpoint, body)
  if (body && 'signature' in body) { body = { ...body }; delete body.signature } // never sent to the API
  for (let attempt = 0; ; attempt++) {
    try { return await apiPostOnce(endpoint, body, opts) }
    catch (e) {
      if (e.status !== 429 || attempt >= 4) throw e
      const wait = Math.min(Math.max(Number(e.retryAfter) || 5, 1), 30)
      info(`rate limited by the API, retrying in ${wait}s...`)
      await new Promise(r => setTimeout(r, wait * 1000))
    }
  }
}
async function apiPostOnce(endpoint, body, { timeoutMs = 90_000 } = {}) {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const r = await fetch(`${API}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': `blackpool-cli/${require('../package.json').version}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    let json = {}
    try { json = await r.json() } catch {}
    if (!r.ok) {
      const msg = json?.error || `HTTP ${r.status}`
      throw Object.assign(new Error(msg), { status: r.status, retryAfter: json?.retryAfter })
    }
    return json
  } finally { clearTimeout(t) }
}

// === commands ===
async function cmdLogin() {
  let wallet
  // If BLACKPOOL_KEY env is set, use it (agent/CI path). Otherwise prompt with hidden input.
  if (process.env.BLACKPOOL_KEY) {
    try { wallet = new ethers.Wallet(process.env.BLACKPOOL_KEY) }
    catch (e) { fail(`invalid BLACKPOOL_KEY: ${e.message}`) }
    info('using BLACKPOOL_KEY from environment')
  } else {
    log(color('Paste your agent private key (input hidden, like a password).', c.dim))
    log(color('It is stored locally at ~/.blackpool/wallet.json (chmod 600), never sent anywhere.', c.dim))
    let pk
    try { pk = (await promptHidden('  private key: ')).trim() }
    catch (e) { fail(e.message) }
    if (!pk) fail('no key entered')
    if (!pk.startsWith('0x')) pk = '0x' + pk
    try { wallet = new ethers.Wallet(pk) }
    catch (e) { fail(`invalid private key: ${e.message}`) }
    saveStoredKey(pk)
    ok(`wallet stored at ${WALLET_FILE} (chmod 600)`)
  }
  log(color(`agent ${wallet.address}`, c.dim))
  info('signing BLACKPOOL message...')
  const sig = await ensureSignature(wallet, { forceNew: true })
  ok(`logged in as ${color(wallet.address, c.cyan)}`)
  info(`signature cached at ${CONFIG_FILE}`)
  result({ address: wallet.address })
}

async function cmdAddress() {
  const wallet = getWallet()
  log(wallet.address)
  result({ address: wallet.address })
}

async function cmdLogout() {
  let removed = []
  for (const f of [WALLET_FILE, CONFIG_FILE]) {
    try { if (fs.existsSync(f)) { fs.unlinkSync(f); removed.push(f) } } catch {}
  }
  if (removed.length) { removed.forEach(f => ok(`removed ${f}`)) }
  else info('nothing to remove (already logged out)')
  result({ removed })
}

// === Multi-chain registry (mirrors frontend app/page.tsx: CHAIN_POOLS + UNISWAP + POOL_META) ===
// Each chain has private pools (native ETH + a stablecoin) and its own Uniswap V3 addresses for swap.
// Robinhood is an Arbitrum Orbit L2 (chainId 4663); its stablecoin is USDG (Global Dollar).

// Minimum size for any flow that pays the withdraw fee. send, swap and both bridge paths all start
// with a relayer withdraw, so they share one floor rather than each carrying its own number. These
// mirror MIN_TX_NATIVE / MIN_TX_STABLE in frontend/app/page.tsx -- keep the two in step, otherwise
// the CLI accepts amounts the app refuses.
//
// Without this the CLI let a too-small send through to apiServer.js, which rejects anything where
// fee*2 >= amount (a hard floor of 0.00030211 ETH at flatFee 0.00015). The user got a backend error
// instead of a clear message, and on the swap/bridge paths that failure lands *after* funds have
// already moved to a burner, needing `blackpool recover`. Failing early is the whole point.
const MIN_TX_NATIVE = 0.001   // ETH / BNB: send, swap, bridge
const MIN_TX_STABLE = 2       // USDC / USDG / USDT

// Floor for one pool of one chain, plus the message the CLI fails with. `pool` is a key into
// CHAINS[chain].pools, so this works for the native and stablecoin pool of every chain.
function minTxFor(chain, pool) {
  const p = CHAINS[chain].pools[pool]
  return { min: p.native ? MIN_TX_NATIVE : MIN_TX_STABLE, symbol: p.symbol }
}

// Fail unless `n` clears the floor for that pool. `flow` is the word used in the message ("send",
// "swap", "bridge") so the error names the command the user actually ran.
function requireMinTx(n, chain, pool, flow) {
  const { min, symbol } = minTxFor(chain, pool)
  if (n < min) {
    fail(`minimum ${flow} is ${min} ${symbol} on ${CHAINS[chain].label} — smaller amounts are mostly consumed by the withdraw fee (flat + 0.35%)`)
  }
}

const CHAINS = {
  base: {
    label: 'Base',
    chainId: 8453,
    rpc: process.env.BLACKPOOL_BASE_RPC || process.env.BLACKPOOL_RPC || 'https://mainnet.base.org',
    stablePool: 'usdc',
    nativePool: 'eth',
    // pool key -> { symbol, decimals, native, minDeposit }. minDeposit mirrors the frontend
    // POOL_META floor and must stay in step with it: every stablecoin pool is a flat 3 units (~$3)
    // for a uniform entry point across chains, native pools are 0.001 ETH / 0.01 BNB. These are an
    // operator choice, not a fee-ratio rule -- see the note in frontend POOL_META for what the
    // withdraw fee costs at each floor, including the base:usdc fee*2 edge at a 2 USDC withdraw.
    pools: { eth: { symbol: 'ETH', decimals: 18, native: true, minDeposit: 0.001 }, usdc: { symbol: 'USDC', decimals: 6, native: false, minDeposit: 3 } },
    uni: { router: '0x2626664c2603336E57B271c5C0b26F421741e481', quoter: '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a', weth: '0x4200000000000000000000000000000000000006', stable: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', fee: 100 },
    // realistic gas ceiling (gwei) — never let ethers default to 1.5 gwei
    gasCapGwei: '0.05',
  },
  robinhood: {
    label: 'Robinhood',
    chainId: 4663,
    rpc: process.env.BLACKPOOL_ROBINHOOD_RPC || 'https://rpc.mainnet.chain.robinhood.com',
    stablePool: 'usdg',
    nativePool: 'eth',
    pools: { eth: { symbol: 'ETH', decimals: 18, native: true, minDeposit: 0.001 }, usdg: { symbol: 'USDG', decimals: 6, native: false, minDeposit: 3 } },
    uni: { router: '0xcaf681a66d020601342297493863e78c959e5cb2', quoter: '0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7', weth: '0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73', stable: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168', fee: 500 },
    gasCapGwei: '0.1',
  },
  arbitrum: {
    label: 'Arbitrum',
    chainId: 42161,
    rpc: process.env.BLACKPOOL_ARBITRUM_RPC || 'https://arb1.arbitrum.io/rpc',
    stablePool: 'usdc',
    nativePool: 'eth',
    pools: { eth: { symbol: 'ETH', decimals: 18, native: true, minDeposit: 0.001 }, usdc: { symbol: 'USDC', decimals: 6, native: false, minDeposit: 3 } },
    uni: { router: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45', quoter: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e', weth: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', stable: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', fee: 500 },
    gasCapGwei: '0.5',
  },
  // BSC runs PancakeSwap V3, not Uniswap. Router is the SmartRouter (SwapRouter02-compatible);
  // the frontend verified by bytecode + estimateGas that the other commonly-cited address lacks
  // the exactInputSingle selector and reverts. `stable` is USDT because its WBNB pool is far
  // deeper than USDC's. Binance-Peg stables are 18 decimals, NOT 6.
  bsc: {
    label: 'BSC',
    chainId: 56,
    rpc: process.env.BLACKPOOL_BSC_RPC || 'https://bsc-dataseed.binance.org',
    stablePool: 'usdt',
    nativePool: 'bnb',
    pools: {
      bnb:  { symbol: 'BNB',  decimals: 18, native: true,  minDeposit: 0.01 },
      usdc: { symbol: 'USDC', decimals: 18, native: false, minDeposit: 3 },
      usdt: { symbol: 'USDT', decimals: 18, native: false, minDeposit: 3 },
    },
    uni: { router: '0x13f4EA83D0bd40E75C8222255bc855a974568Dd4', quoter: '0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997', weth: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', stable: '0x55d398326f99059fF775485246999027B3197955', fee: 100 },
    // BSC has no EIP-1559 baseFee (it reads 0) and validators enforce a ~0.05 gwei floor, so this
    // is used as a legacy gasPrice rather than a 1559 cap. See chainGasOverrides.
    gasCapGwei: '0.06',
    legacyGas: true,
  },
}
// Usage strings list chains from CHAINS so adding a chain can't leave a stale `base|robinhood` hint.
const CHAIN_LIST = Object.keys(CHAINS).join('|')
// resolve --chain flag (default base for backward compat). Accepts base | robinhood | rh.
function resolveChain(args) {
  const raw = (getFlag(args, '--chain') || 'base').toLowerCase()
  const key = raw === 'rh' ? 'robinhood' : raw === 'arb' ? 'arbitrum' : raw === 'bnb' ? 'bsc' : raw
  if (!CHAINS[key]) fail(`unknown chain "${raw}" (supported: ${Object.keys(CHAINS).join(', ')})`)
  return key
}
// pool keys valid for a chain (e.g. ['eth','usdc'] on base, ['eth','usdg'] on robinhood)
function poolsForChain(chain) { return Object.keys(CHAINS[chain].pools) }
// block explorer tx link per chain
const EXPLORERS = { base: 'https://basescan.org/tx/', robinhood: 'https://robin.etherscan.io/tx/', arbitrum: 'https://arbiscan.io/tx/', bsc: 'https://bscscan.com/tx/' }
function explorerTx(chain, hash) { return (EXPLORERS[chain] || EXPLORERS.base) + hash }
// Build an RPC provider with the network pinned explicitly. Plain JsonRpcProvider defers its first
// call until an eth_chainId "detect network" round-trip succeeds — and when a public RPC (notably
// Robinhood's) blips, that surfaces as a fatal "could not detect network" even though we already
// know the chainId. StaticJsonRpcProvider + an explicit network skips that probe entirely and never
// re-detects, so a transient hiccup no longer aborts deposit/swap/bridge before they even start.
function rpcProvider(chain) {
  const C = CHAINS[chain]
  return new ethers.providers.StaticJsonRpcProvider(C.rpc, { chainId: C.chainId, name: chain })
}
// Connection-level errors worth retrying (the RPC dropped the request/response entirely — NOT a
// revert or an insufficient-funds error, which are real failures and must NOT be retried).
function isRetryableRpcError(e) {
  const msg = String(e && (e.reason || e.message) || '').toLowerCase()
  const code = e && e.code
  return code === 'SERVER_ERROR' || code === 'NETWORK_ERROR' || code === 'TIMEOUT'
    || msg.includes('missing response') || msg.includes('could not detect network')
    || msg.includes('econnreset') || msg.includes('etimedout') || msg.includes('socket hang up')
    || msg.includes('fetch failed') || msg.includes('bad gateway') || msg.includes('502')
    || msg.includes('503') || msg.includes('timeout')
}
// Retry a read-only RPC call (getBalance, allowance, quote, getFeeData, etc) across transient
// connection drops on public RPCs. Real errors (revert, invalid params) surface immediately.
async function withRpcRetry(fn, { attempts = 5, baseDelayMs = 600, label = 'rpc call' } = {}) {
  let lastErr
  for (let i = 0; i < attempts; i++) {
    try { return await fn() }
    catch (e) {
      lastErr = e
      if (!isRetryableRpcError(e)) throw e
      if (i < attempts - 1) await new Promise(r => setTimeout(r, baseDelayMs * (i + 1)))
    }
  }
  throw new Error(`${label} failed after ${attempts} attempts (connection kept dropping): ${(lastErr && (lastErr.reason || lastErr.message)) || lastErr}`)
}
// Sign a transaction ONCE (fixes nonce + gas), then broadcast it — retrying the *exact same signed
// bytes* if the connection drops before we get a response. This is safe: resending identical raw tx
// bytes is idempotent (same hash), so a dropped response can never cause a double-send. If the first
// attempt actually landed but the response was lost, the resend just gets "already known" back.
// Then polls for the receipt with its own retry loop instead of ethers' non-resilient tx.wait().
async function broadcastAndWait(signer, provider, txRequest, { label = 'transaction', confirmations = 1 } = {}) {
  const populated = await withRpcRetry(() => signer.populateTransaction(txRequest), { label: `${label} (populate)` })
  const rawTx = await signer.signTransaction(populated)
  const txHash = ethers.utils.keccak256(rawTx)

  let sent = false
  for (let i = 0; i < 6 && !sent; i++) {
    try {
      await provider.sendTransaction(rawTx)
      sent = true
    } catch (e) {
      const msg = String(e && (e.reason || e.message) || '').toLowerCase()
      // Already broadcast by a previous attempt (or picked up by another node) — not a failure.
      if (msg.includes('already known') || msg.includes('nonce too low') || msg.includes('already exists')) { sent = true; break }
      if (!isRetryableRpcError(e)) throw e
      if (i < 5) await new Promise(r => setTimeout(r, 700 * (i + 1)))
    }
  }
  if (!sent) {
    // The node may have accepted the tx and still answered with an error: look for it before giving up.
    try { if (await withRpcRetry(() => provider.getTransaction(txHash), { label: `${label} (lookup)` })) sent = true } catch {}
  }
  if (!sent) throw new Error(`${label}: could not broadcast after repeated connection drops`)

  // Poll for the receipt ourselves (retrying connection errors) instead of tx.wait(), which throws
  // fatally on the first dropped response even though the tx may already be mining.
  const deadline = Date.now() + 180_000
  while (Date.now() < deadline) {
    try {
      const receipt = await provider.getTransactionReceipt(txHash)
      if (receipt && receipt.confirmations >= confirmations) {
        if (receipt.status === 0) throw new Error(`${label} reverted on-chain (tx ${txHash})`)
        return { hash: txHash, receipt }
      }
    } catch (e) {
      if (!isRetryableRpcError(e)) throw e
    }
    await new Promise(r => setTimeout(r, 2000))
  }
  throw new Error(`${label}: broadcast (tx ${txHash}) but no confirmation after 180s — check the explorer, funds are not lost`)
}
// EIP-1559 gas overrides capped at the chain's realistic ceiling. Robinhood's RPC "suggests"
// ~1.6 gwei while baseFee is ~0.047 gwei (34x inflated) — using the suggestion inflates every tx
// and can overshoot a burner's tiny ETH. Cap at gasCapGwei; floor priority at 0.001 gwei.
async function chainGasOverrides(provider, chain) {
  // Legacy chains (BSC) report baseFee=0 and reject EIP-1559 maxFee with "gas price below minimum";
  // validators enforce a ~0.05 gwei floor. Use a single legacy gasPrice at/above the floor instead.
  if (CHAINS[chain].legacyGas) {
    const floor = ethers.utils.parseUnits(CHAINS[chain].gasCapGwei, 'gwei')
    let gp = floor
    try { const fd = await provider.getFeeData(); if (fd.gasPrice && fd.gasPrice.gt(floor)) gp = fd.gasPrice } catch {}
    return { gasPrice: gp }
  }
  const cap = ethers.utils.parseUnits(CHAINS[chain].gasCapGwei, 'gwei')
  const minPrio = ethers.utils.parseUnits('0.001', 'gwei')
  // 2 x baseFee + tip, like wallets do. Not getFeeData(): ethers v5 adds a 1.5 gwei tip, which then hits the cap
  // (0.5 gwei on Arbitrum, ~50x the real price) and makes the node reject value + gas x maxFee as unaffordable.
  let netMax
  try { const b = await provider.getBlock('latest'); if (b && b.baseFeePerGas) netMax = b.baseFeePerGas.mul(2).add(minPrio) } catch {}
  if (!netMax) { try { const fd = await provider.getFeeData(); netMax = fd.maxFeePerGas } catch {} }
  const maxFeePerGas = netMax && netMax.lt(cap) ? netMax : cap
  const maxPriorityFeePerGas = maxFeePerGas.lt(minPrio) ? maxFeePerGas : minPrio
  return { maxFeePerGas, maxPriorityFeePerGas }
}
// Burner txs inside one swap: 2 x baseFee + tip (headroom for the minute or two the swap takes), capped.
async function burnerFees(provider, chain) {
  if (CHAINS[chain].legacyGas) return chainGasOverrides(provider, chain)
  const cap = ethers.utils.parseUnits(CHAINS[chain].gasCapGwei, 'gwei')
  const tip = ethers.utils.parseUnits('0.001', 'gwei')
  let want
  try { const b = await provider.getBlock('latest'); if (b && b.baseFeePerGas) want = b.baseFeePerGas.mul(2).add(tip) } catch {}
  const maxFeePerGas = want && want.lt(cap) ? want : cap
  return { maxFeePerGas, maxPriorityFeePerGas: maxFeePerGas.lt(tip) ? maxFeePerGas : tip }
}
// Sync version (fixed chain cap, no network fetch) — for burner txs where we set an explicit gasLimit
// and just need a chain-realistic price. Replaces the old Base-only baseGasOverrides().
function chainGasOverridesSync(chain) {
  // Legacy chains (BSC): single gasPrice at the validator floor, not an EIP-1559 pair.
  if (CHAINS[chain].legacyGas) {
    return { gasPrice: ethers.utils.parseUnits(CHAINS[chain].gasCapGwei, 'gwei') }
  }
  const maxFeePerGas = ethers.utils.parseUnits(CHAINS[chain].gasCapGwei, 'gwei')
  return { maxFeePerGas, maxPriorityFeePerGas: ethers.utils.parseUnits('0.001', 'gwei') }
}
// back-compat: some helpers reference the base RPC + usdc directly
const BASE_RPC = CHAINS.base.rpc
const BASE_USDC = CHAINS.base.uni.stable

async function getPublicBalances(address, chain = 'base') {
  const C = CHAINS[chain]
  const provider = rpcProvider(chain)
  const usdc = new ethers.Contract(C.uni.stable, ['function balanceOf(address) view returns (uint256)'], provider)
  // Read the stable's decimals from the pool config instead of assuming 6: BSC's Binance-Peg
  // USDC/USDT are 18-decimal, so a hardcoded 6 would report balances 1e12x too large.
  const stableDecimals = C.pools[C.stablePool].decimals
  // Robinhood's public RPC is flaky and intermittently drops requests, which used to surface as a
  // bare "?" in the balance view. Retry a couple of times with a short backoff before giving up.
  let lastErr
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const [ethBal, usdcBal] = await Promise.all([
        provider.getBalance(address),
        usdc.balanceOf(address),
      ])
      return {
        eth:  ethers.utils.formatEther(ethBal),
        usdc: ethers.utils.formatUnits(usdcBal, stableDecimals),
      }
    } catch (e) {
      lastErr = e
      if (attempt < 2) await new Promise(r => setTimeout(r, 800 * (attempt + 1)))
    }
  }
  throw new Error(`RPC unavailable for ${C.label} public balances: ${cleanErr(lastErr)}`)
}

// Poll /api/balance until the indexer reflects at least `minBalance` (as a number), or timeout.
// Fixes the indexer-lag window right after deposit/send where balance can transiently look stale.
// Returns { balance, utxoCount, symbol } from the last successful response, or throws on timeout.
async function waitForBalance(sig, address, pool, minBalance, maxMs = 30_000) {
  const deadline = Date.now() + maxMs
  let last
  while (Date.now() < deadline) {
    try {
      last = await apiPost('/api/balance', { signature: sig, address, pool })
      if (parseFloat(last.balance || '0') >= minBalance) return last
    } catch { /* transient */ }
    await new Promise(r => setTimeout(r, 2000))
  }
  return last || { balance: '?', utxoCount: '?', symbol: pool.toUpperCase() }
}

// Render the full private+public balance view for ONE chain. Shared by single-chain and --chain all.
async function showChainBalance(chain, wallet, sig, wait) {
  const C = CHAINS[chain]
  const validPools = poolsForChain(chain)
  // BSC's native pool key is 'bnb', not 'eth' — read it from the chain config.
  const [ethKey, stableKey] = [C.nativePool, C.stablePool]
  const stableSym = C.pools[stableKey].symbol
  const nativeSym = C.pools[ethKey].symbol
  info(`fetching balances for ${color(wallet.address, c.cyan)} on ${C.label}...`)
  let [ethPriv, stablePriv, pub] = await Promise.all([
    apiPost('/api/balance', { signature: sig, address: wallet.address, pool: ethKey, chain }).catch(e => ({ balance: '?', utxoCount: '?', err: e.message })),
    apiPost('/api/balance', { signature: sig, address: wallet.address, pool: stableKey, chain }).catch(e => ({ balance: '?', utxoCount: '?', err: e.message })),
    getPublicBalances(wallet.address, chain).catch(e => ({ eth: '?', usdc: '?', err: e.message })),
  ])
  // With --wait, poll briefly if a private balance reads 0 (indexer may be catching up post-tx).
  if (wait && (parseFloat(ethPriv.balance || '0') === 0 || parseFloat(stablePriv.balance || '0') === 0)) {
    const deadline = Date.now() + 30_000
    while (Date.now() < deadline && (parseFloat(ethPriv.balance || '0') === 0 || parseFloat(stablePriv.balance || '0') === 0)) {
      await new Promise(r => setTimeout(r, 2500))
      try {
        ;[ethPriv, stablePriv] = await Promise.all([
          apiPost('/api/balance', { signature: sig, address: wallet.address, pool: ethKey, chain }),
          apiPost('/api/balance', { signature: sig, address: wallet.address, pool: stableKey, chain }),
        ])
      } catch {}
    }
  }
  log('')
  log(color(`  private (shielded, spendable via BLACKPOOL) — ${C.label}`, c.dim))
  log(`    ${color(nativeSym.padEnd(5), c.dim)} ${color(ethPriv.balance, c.lime)}   ${color(`(${ethPriv.utxoCount} utxo)`, c.dim)}`)
  log(`    ${color(stableSym.padEnd(5), c.dim)} ${color(stablePriv.balance, c.lime)}   ${color(`(${stablePriv.utxoCount} utxo)`, c.dim)}`)
  log('')
  log(color(`  public (wallet on ${C.label}, can be shielded)`, c.dim))
  log(`    ${color(nativeSym.padEnd(5), c.dim)} ${color(pub.eth, c.cyan)}`)
  log(`    ${color(stableSym.padEnd(5), c.dim)} ${color(pub.usdc, c.cyan)}`)
  if (pub.err) info(`  (public balance unavailable: ${pub.err} — retry, or set BLACKPOOL_${chain.toUpperCase()}_RPC to a private RPC)`)
  log('')
  ;(RESULT.balances ||= []).push({
    chain, address: wallet.address,
    private: {
      [nativeSym]: { balance: ethPriv.balance, utxos: ethPriv.utxoCount, ...(ethPriv.err ? { error: ethPriv.err } : {}) },
      [stableSym]: { balance: stablePriv.balance, utxos: stablePriv.utxoCount, ...(stablePriv.err ? { error: stablePriv.err } : {}) },
    },
    public: { [nativeSym]: pub.eth, [stableSym]: pub.usdc, ...(pub.err ? { error: pub.err } : {}) },
  })
}

async function cmdBalance(args) {
  const wallet = getWallet()
  const wait = args.includes('--wait')
  const rawChain = (getFlag(args, '--chain') || 'base').toLowerCase()

  // --chain all: loop every chain, full view each. Ignores --pool (pool names differ per chain).
  if (rawChain === 'all') {
    const sig = await ensureSignature(wallet)
    for (const chainKey of Object.keys(CHAINS)) {
      await showChainBalance(chainKey, wallet, sig, wait)
    }
    info(`shield public into private: ${color(`blackpool deposit <amount> [--pool <pool>] [--chain ${CHAIN_LIST}]`, c.yellow)}`)
    log('')
    return
  }

  const chain = resolveChain(args)
  const C = CHAINS[chain]
  const pool = getFlag(args, '--pool')
  const validPools = poolsForChain(chain)

  // if --pool specified, only that pool (private). Otherwise, show both pools private + public wallet.
  if (pool) {
    if (!validPools.includes(pool)) fail(`unknown pool "${pool}" on ${C.label} (supported: ${validPools.join(', ')})`)
    const sig = await ensureSignature(wallet)
    info(`fetching private ${pool.toUpperCase()} balance on ${C.label}${wait ? ' (waiting for indexer...)' : ''}...`)
    // With --wait, poll a bit in case a tx was just broadcast and the indexer is catching up.
    let res = await apiPost('/api/balance', { signature: sig, address: wallet.address, pool, chain })
    if (wait && parseFloat(res.balance || '0') === 0) {
      const deadline = Date.now() + 30_000
      while (Date.now() < deadline && parseFloat(res.balance || '0') === 0) {
        await new Promise(r => setTimeout(r, 2500))
        try { res = await apiPost('/api/balance', { signature: sig, address: wallet.address, pool, chain }) } catch {}
      }
    }
    log('')
    log(`  ${color('private balance', c.dim)}  ${color(res.balance, c.lime)} ${color(res.symbol, c.cyan)} ${color(`on ${C.label}`, c.dim)}`)
    log(`  ${color('utxos', c.dim)}            ${res.utxoCount}`)
    log('')
    result({ chain, pool, address: wallet.address, balance: res.balance, symbol: res.symbol, utxos: res.utxoCount })
    return
  }

  const sig = await ensureSignature(wallet)
  await showChainBalance(chain, wallet, sig, wait)
  info(`shield public into private: ${color(`blackpool deposit <amount> [--pool ${validPools.join('|')}] [--chain ${chain}]`, c.yellow)}`)
  log('')
}

async function cmdDeposit(args) {
  const chain = resolveChain(args)
  const C = CHAINS[chain]
  const amount = args[0]
  const validPools = poolsForChain(chain)
  const pool = getFlag(args, '--pool') || C.stablePool
  if (!amount || amount.startsWith('--')) fail(`usage: blackpool deposit <amount> [--pool ${validPools.join('|')}] [--chain ${CHAIN_LIST}]`, 2)
  const n = Number(amount)
  if (isNaN(n) || n <= 0) fail(`invalid amount: ${amount}`)
  if (!validPools.includes(pool)) fail(`unknown pool "${pool}" on ${C.label} (supported: ${validPools.join(', ')})`)
  // Reject deposits the withdraw fee would eat. Mirrors the frontend floor: the withdraw fee is
  // flatFee + 0.35%, so an amount near the flat fee is mostly consumed on the way out, and one
  // under 2x the fee cannot be withdrawn at all (relayer guard: fee*2 < amount).
  const minDep = C.pools[pool].minDeposit
  if (minDep && n < minDep) {
    fail(`minimum deposit is ${minDep} ${C.pools[pool].symbol} on ${C.label} — smaller amounts get eaten by the withdraw fee`)
  }

  const wallet = getWallet()
  const sig = await ensureSignature(wallet)
  const provider = rpcProvider(chain)
  const signer = new ethers.Wallet(wallet.privateKey, provider)
  // Chain-realistic gas cap — never let ethers default to ~1.5 gwei (on Robinhood that inflates the
  // ~1.3M-gas deposit ~34x and can overshoot the wallet's ETH). Cap at the chain's realistic ceiling.
  const gasOv = await chainGasOverrides(provider, chain)

  log('')
  log(color(`  shielding ${amount} ${pool.toUpperCase()} on ${C.label}`, c.bold))
  log(color(`  from public wallet ${wallet.address}`, c.dim))
  log('')
  info('preparing deposit (the proof is generated on this machine)...')

  const prep = await apiPost('/api/deposit/prepare', {
    signature: sig, address: wallet.address, amount: String(amount), pool, chain,
  }, { timeoutMs: 180_000 })

  // ERC pool with insufficient allowance -> approve first
  if (prep.approveTx) {
    const decimals = C.pools[pool].decimals
    const needed = ethers.utils.parseUnits(String(n), decimals)
    info(`approving ${prep.symbol} spend by BLACKPOOL pool...`)
    const ap = await broadcastAndWait(signer, provider, {
      to: prep.approveTx.to,
      data: prep.approveTx.data,
      value: prep.approveTx.value === '0' ? 0 : ethers.BigNumber.from(prep.approveTx.value),
      ...gasOv,
    }, { label: 'approve' })
    info(`approve tx: ${ap.hash}`)
    ok('approve confirmed')
    // Poll allowance on-chain before deposit tx (mirrors frontend fix 8f92163).
    // Public RPC is load-balanced; the deposit gas-estimate can hit a node that
    // hasn't seen the approve yet -> "transfer amount exceeds allowance". Poll until it reflects.
    const token = new ethers.Contract(prep.approveTx.to, ['function allowance(address,address) view returns (uint256)'], provider)
    info('waiting for allowance to propagate on-chain...')
    let ok2 = false
    for (let i = 0; i < 15; i++) {
      try {
        const allow = await token.allowance(wallet.address, prep.to)
        if (allow.gte(needed)) { ok2 = true; break }
      } catch {}
      await new Promise(r => setTimeout(r, 2000))
    }
    if (!ok2) fail('allowance did not propagate after 30s. Re-run `blackpool deposit` - the approve is already on-chain, so it will skip approve and go straight to deposit.')
  }

  info('broadcasting deposit tx...')
  const dep = await broadcastAndWait(signer, provider, {
    to: prep.to,
    data: prep.data,
    value: prep.value === '0' ? 0 : ethers.BigNumber.from(prep.value),
    ...gasOv,
  }, { label: 'deposit' })
  info(`deposit tx: ${dep.hash}`)

  log('')
  ok(color(`shielded ${amount} ${prep.symbol} on ${C.label}`, c.green))
  info(`new private balance: ${prep.newBalance} ${prep.symbol}`)
  info(`tx: ${explorerTx(chain, dep.hash)}`)
  log('')
  result({ chain, pool, amount: n, symbol: prep.symbol, txHash: dep.hash, explorer: explorerTx(chain, dep.hash), privateBalance: prep.newBalance })
}

// === Uniswap V3 constants on Base (extracted from frontend bundle - do not change) ===
const UNI_USDC   = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const UNI_WETH   = '0x4200000000000000000000000000000000000006'
const UNI_ROUTER = '0x2626664c2603336E57B271c5C0b26F421741e481' // SwapRouter02
const UNI_QUOTER = '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a'
const UNI_FEE    = 100 // 0.01% pool
// Gas params are now chain-aware via chainGasOverridesSync(chain) (registry gasCapGwei). The old
// Base-only baseGasOverrides() + GAS_RESERVE_ETH constant were removed in the multi-chain refactor.

// Derive a burner wallet deterministically from the user's BLACKPOOL signature.
// === Non-custodial burner registry (mirrors frontend app/lib/burner.ts) ===
// Each swap now uses a FRESH RANDOM wallet whose privkey is encrypted client-side (AES-256-GCM under
// keccak256(sign-in sig)) and pushed to the backend registry as ciphertext. Recovery from any device
// re-signs the two messages, fetches the rows, decrypts locally, and sweeps. This replaces the old
// derive-nonce-0..19 model, which stranded funds at high nonces and — crucially — could NOT recover
// burners created by the frontend (different address space). CLI is now at parity with the web app.
const crypto = require('crypto')
// Signed by a key DERIVED from the sign-in signature (never by the wallet itself) — identical bytes to
// src/registryAuth.js on the backend and frontend/app/lib/burner.ts.
const REGISTRY_AUTH_DOMAIN = 'blackpool/registry-auth/v1'
const REGISTRY_AUTH_MESSAGE =
  'Blackpool Registry\n\n' +
  'Authorize access to your encrypted recovery data.\n' +
  'This does not move funds and does not expose your account keys.'

// AES-256 key from the sign-in signature: keccak256(getBytes(sig)) -> 32 bytes. Identical to frontend.
function aesKeyFromSignIn(signInSig) {
  return Buffer.from(ethers.utils.keccak256(ethers.utils.arrayify(signInSig)).slice(2), 'hex')
}
// Encrypt to the frontend's WebCrypto layout: [iv(12)] + [ciphertext] + [authTag(16)]. WebCrypto's
// subtle.encrypt appends the 16-byte GCM tag to the ciphertext, so we mirror that with getAuthTag().
function encryptBurnerKey(privKeyHex, signInSig) {
  const key = aesKeyFromSignIn(signInSig)
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(Buffer.from(privKeyHex, 'utf8')), cipher.final()])
  const tag = cipher.getAuthTag()
  return '0x' + Buffer.concat([iv, ct, tag]).toString('hex')
}
// Decrypt the frontend's layout (tag is the trailing 16 bytes).
function decryptBurnerKey(encHex, signInSig) {
  const key = aesKeyFromSignIn(signInSig)
  const buf = Buffer.from(encHex.replace(/^0x/, ''), 'hex')
  const iv = buf.slice(0, 12)
  const tag = buf.slice(buf.length - 16)
  const ct = buf.slice(12, buf.length - 16)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
}

// Registry auth signature — over the SEPARATE registry message, never the sign-in sig (signing this
// does NOT reveal the encryption key; the backend only ecrecovers the owner address from it).
async function registryAuthSig(signInSig) {
  const key = ethers.utils.keccak256(ethers.utils.concat([ethers.utils.arrayify(signInSig), ethers.utils.toUtf8Bytes(REGISTRY_AUTH_DOMAIN)]))
  return new ethers.Wallet(key).signMessage(REGISTRY_AUTH_MESSAGE)
}

// Create a fresh random ephemeral burner, encrypt its key, register it BEFORE funding so recovery is
// possible even if the very next step stalls. Register failure does NOT abort the swap (recovery also
// scans legacy on-chain), but we surface it.
async function createAndRegisterBurner(signInSig, authSig, chain, token) {
  const w = ethers.Wallet.createRandom()
  const encKey = encryptBurnerKey(w.privateKey, signInSig)
  try {
    await apiPost('/api/burner/register', { authSig, burnerAddress: w.address, chain, token, encKey }, { timeoutMs: 30_000 })
  } catch (e) { info(`(registry register failed: ${cleanErr(e)} — swap continues; recovery still scans on-chain)`) }
  return w
}

// Fetch the user's registered burners (ciphertext), decrypt each key locally. Cross-device, no cache.
async function listRecoverableBurners(signInSig, authSig) {
  const rows = []; let before = null
  for (let i = 0; i < 100; i++) {
    const res = await apiPost('/api/burner/list', before ? { authSig, before } : { authSig }, { timeoutMs: 30_000 })
    rows.push(...(res.burners || [])); if (!res.next) break; before = res.next
  }
  const out = []
  for (const row of rows) {
    try { out.push({ address: row.burnerAddress, chain: row.chain, token: row.token, privateKey: decryptBurnerKey(row.encKey, signInSig), sweptAt: row.sweptAt }) }
    catch { /* row from a different account / undecryptable — skip */ }
  }
  return out
}

// Mark a burner swept in the registry (bookkeeping only; best-effort).
async function markBurnerSwept(authSig, burnerAddress, chain) {
  try { await apiPost('/api/burner/mark-swept', { authSig, burnerAddress, chain }, { timeoutMs: 20_000 }) } catch { /* non-fatal */ }
}
// Poll until token balance >= minimum. Mirrors frontend e7().
async function waitTokenBalance(provider, tokenAddr, addr, min, retries = 60) {
  const c = new ethers.Contract(tokenAddr, ['function balanceOf(address) view returns (uint256)'], provider)
  for (let i = 0; i < retries; i++) {
    try { const b = await c.balanceOf(addr); if (b.gte(min)) return b } catch {}
    await new Promise(r => setTimeout(r, 2500))
  }
  throw new Error(`token balance never reached on ${addr}`)
}
// Poll until ETH balance >= minimum. Mirrors frontend e9().
// After a swap's reshield: send the burner's unused gas back to the relayer that advanced it, so the burner ends
// empty. Keeps only the cost of this transfer (+30%, plus an L1 data-fee cushion on Base). Never fails the swap.
async function returnUnusedGas(burner, provider, chain) {
  try {
    const cfg = await apiGet('/api/zk/config')
    const to = cfg && cfg.relayer
    if (!to || !/^0x[a-fA-F0-9]{40}$/.test(to)) return
    const fees = await burnerFees(provider, chain)
    const fee = fees.maxFeePerGas || fees.gasPrice
    const bal = await provider.getBalance(burner.address)
    let gas = ethers.BigNumber.from(21_000)
    try { gas = await provider.estimateGas({ from: burner.address, to, value: 1 }) } catch {}
    const gasLimit = gas.mul(13).div(10)
    const l1Cushion = chain === 'base' ? ethers.utils.parseUnits('2000', 'gwei') : ethers.BigNumber.from(0) // OP-stack L1 data fee
    const keep = gasLimit.mul(fee).add(l1Cushion)
    if (bal.lte(keep.mul(2))) return // nothing worth moving
    const value = bal.sub(keep)
    await broadcastAndWait(burner, provider, { to, value, gasLimit, ...fees }, { label: 'return unused gas' })
    info(`returned ${ethers.utils.formatEther(value)} unused gas to the relayer (burner is empty)`)
  } catch (e) {
    info(`could not return the unused gas (${cleanErr(e)}); \`blackpool recover\` can sweep it later`)
  }
}

async function waitEthBalance(provider, addr, min, label = 'eth') {
  for (let i = 0; i < 80; i++) {
    const b = await provider.getBalance(addr)
    if (b.gte(min)) return b
    await new Promise(r => setTimeout(r, 2500))
  }
  throw new Error(`${label} balance never arrived on ${addr}`)
}

async function apiGet(endpoint, { timeoutMs = 30_000 } = {}) {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const r = await fetch(`${API}${endpoint}`, { headers: { 'User-Agent': `blackpool-cli/${require('../package.json').version}` }, signal: controller.signal })
    let json = {}
    try { json = await r.json() } catch {}
    if (!r.ok) throw new Error(json?.error || `HTTP ${r.status}`)
    return json
  } finally { clearTimeout(t) }
}

// 1Click origin assets, keyed by the shielded pool they withdraw from. The API resolves a bridge
// origin via CHAIN_DEFS.oneClickAsset and rejects anything else with "has no private pool", so this
// mirrors that map. Robinhood is indexed by 1Click since 2026-09-18 (chain id 'hood'); Arc is
// absent (chain disabled). Origin chain is derived from the key, not assumed to be Base.
const BRIDGE_ORIGINS = {
  base_eth:  { chain: 'base',     pool: 'eth'  },
  base_usdc: { chain: 'base',     pool: 'usdc' },
  hood_eth:  { chain: 'robinhood', pool: 'eth'  },
  hood_usdg: { chain: 'robinhood', pool: 'usdg' },
  arb_eth:   { chain: 'arbitrum', pool: 'eth'  },
  arb_usdc:  { chain: 'arbitrum', pool: 'usdc' },
  bsc_bnb:   { chain: 'bsc',      pool: 'bnb'  },
  bsc_usdc:  { chain: 'bsc',      pool: 'usdc' },
  bsc_usdt:  { chain: 'bsc',      pool: 'usdt' },
}

// blackpool bridge <destAssetKey> <recipient> <amount> [--from ...] [--chain ...]
// Every destination uses the NEAR Intents 1Click flow (/api/swap + poll) — Robinhood included.
async function cmdBridge(args) {
  if (/^(max|all)$/i.test(String(args[2] || ''))) {
    const o = BRIDGE_ORIGINS[getFlag(args, '--from') || 'base_usdc']
    if (!o) fail(`unknown --from "${getFlag(args, '--from')}" (1Click origins: ${Object.keys(BRIDGE_ORIGINS).join(', ')})`)
    args = [...args]; args[2] = await resolveMaxAmount(o.chain, o.pool, 'bridge')
  }
  const toAsset = args[0]
  const recipient = args[1]
  const amount = args[2]
  if (!toAsset || toAsset.startsWith('--') || !recipient || !amount) {
    fail(`usage: blackpool bridge <dest-asset> <recipient> <amount> [--from <origin>] [--chain ...]\n  origins: ${Object.keys(BRIDGE_ORIGINS).join('|')} (default base_usdc)\n  run 'blackpool assets' for destinations`, 2)
  }
  const fromAsset = getFlag(args, '--from') || 'base_usdc'
  // Recipient format follows the destination: Solana = base58 pubkey, everything else EVM 0x…
  const destRe = toAsset.startsWith('sol_') ? /^[1-9A-HJ-NP-Za-km-z]{32,44}$/ : /^0x[a-fA-F0-9]{40}$/
  if (!destRe.test(recipient)) fail(`invalid recipient address for ${toAsset}: ${recipient}`)
  const n = Number(amount)
  if (isNaN(n) || n <= 0) fail(`invalid amount: ${amount}`)
  // Validate the origin locally instead of discovering it server-side. Without this, an unsupported
  // --from spent a signature and a ~1 min proof round-trip only to come back with the API's
  // "origin X has no private pool".
  const origin = BRIDGE_ORIGINS[fromAsset]
  if (!origin) {
    const known = Object.keys(BRIDGE_ORIGINS).join(', ')
    fail(`unknown --from "${fromAsset}" (1Click origins: ${known})`)
  }
  // The origin pool must exist on the origin chain and carries its own deposit floor.
  // Note the two floors are different checks: minDeposit is about whether this amount could have been
  // shielded in the first place (a note that already exists is fine to bridge, hence info not fail),
  // while the MIN_TX floor is about the withdraw fee this bridge is *about to* pay, which is why that
  // one fails. The origin chain here comes from BRIDGE_ORIGINS, not --chain.
  const originMin = CHAINS[origin.chain].pools[origin.pool].minDeposit
  if (originMin && n < originMin) {
    info(`note: ${n} is below the ${originMin} ${CHAINS[origin.chain].pools[origin.pool].symbol} deposit floor on ${CHAINS[origin.chain].label} — bridging an existing balance is fine, but you could not have shielded this amount.`)
  }
  requireMinTx(n, origin.chain, origin.pool, 'bridge')

  const wallet = getWallet()
  const sig = await ensureSignature(wallet)

  log('')
  log(color(`  bridging ${amount} privately`, c.bold))
  log(color(`  ${fromAsset} -> ${toAsset}`, c.dim))
  log(color(`  recipient ${recipient}`, c.dim))
  log('')
  info('quote + groth16 proof + private withdraw to solver... can take ~1-2 min')

  const res = await apiPost('/api/swap', {
    signature: sig, fromAsset, toAsset, amount: String(amount), recipient,
    refundTo: wallet.address, // Solana/XRP recipients: solver refunds (origin chain) come back to this wallet
  }, { timeoutMs: 180_000 })

  ok(`withdrawn privately to solver`)
  info(`≈ ${res.amountOut} arriving, est ~${res.timeEstimate}s`)
  // origin chain comes from the validated BRIDGE_ORIGINS entry. The old version inferred it with a
  // robinhood-or-base ternary, so an arb_*/bsc_* origin printed a Basescan link for a tx that was
  // never on Base.
  info(`withdraw tx: ${explorerTx(origin.chain, res.txHash)}`)
  info(`tracking: ${res.statusUrl}`)
  log('')
  result({ from: fromAsset, to: toAsset, recipient, amount: n, amountOutQuote: res.amountOut, withdrawTx: res.txHash, depositAddress: res.depositAddress || null, statusUrl: res.statusUrl, status: 'SUBMITTED' })

  if (res.depositAddress && !args.includes('--no-wait')) {
    info('polling solver status (Ctrl+C to stop; bridge continues regardless)...')
    const start = Date.now()
    while (Date.now() - start < 360_000) {
      await new Promise(r => setTimeout(r, 8000))
      try {
        const st = await apiGet(`/api/intent-status?depositAddress=${res.depositAddress}`)
        if (st.status === 'SUCCESS') { ok(color(`delivered ${st.amountOut || res.amountOut} to recipient`, c.green)); log(''); result({ status: 'SUCCESS', amountOut: st.amountOut || res.amountOut }); return }
        if (st.status === 'REFUNDED') { fail(`solver refunded (${st.refundReason || 'route unavailable'}). Funds auto-return to your wallet.`) }
        if (st.status === 'FAILED') { fail('bridge failed at solver. Funds auto-refund.') }
        info(`status: ${st.status}...`)
      } catch (e) { info(`status check: ${e.message}`) }
    }
    info('still processing after 6 min - check the tracking URL above.')
    result({ status: 'PENDING' })
  }
  log('')
}

// blackpool swap <amount> --from eth|usdc [--slippage bps]
// Same-chain private swap ETH<->USDC via burner + Uniswap V3, reshield to private balance.
// Mirrors frontend flow: fresh burner -> /api/swap-private -> [burner-gas for USDC] -> approve+swap
// via Uniswap V3 -> unwrap WETH if ETH output -> /api/deposit/prepare -> burner broadcasts reshield.
// blackpool recover [--to <addr>]
// Sweep any USDC/ETH stranded on burner wallets back to the user's public wallet.
// Mirrors frontend /recover/page.tsx: sweep every registry burner holding more than dust.
// Sweep one burner's stablecoin + ETH to `dest`. Returns { swept, dust, error } counters.
async function sweepBurner(privateKey, chain, dest) {
  const C = CHAINS[chain]
  const stableSym = C.pools[C.stablePool].symbol
  const stableDecimals = C.pools[C.stablePool].decimals
  const provider = rpcProvider(chain)
  const gasO = chainGasOverridesSync(chain)
  const DUST_ETH = ethers.utils.parseEther('0.0001')
  const usdc = new ethers.Contract(C.uni.stable, ['function balanceOf(address) view returns (uint256)'], provider)
  const burner = new ethers.Wallet(privateKey, provider)

  let ethB, uB
  try { [ethB, uB] = await Promise.all([provider.getBalance(burner.address), usdc.balanceOf(burner.address)]) }
  catch (e) { info(`  ${burner.address.slice(0, 10)}: balance read failed (${(e.message || '').slice(0, 60)})`); return { swept: false, dust: false, error: true } }

  if (ethB.eq(0) && uB.eq(0)) return { swept: false, dust: false, error: false }
  if (uB.eq(0) && ethB.lte(DUST_ETH)) return { swept: false, dust: true, error: false } // only dust ETH — not recoverable

  log(color(`  burner ${burner.address}`, c.cyan))
  log(`    ${C.pools[C.nativePool].symbol} : ${ethers.utils.formatEther(ethB)}`)
  log(`    ${stableSym}: ${ethers.utils.formatUnits(uB, stableDecimals)}`)
  let swept = false, error = false

  // stablecoin first (needs ETH for gas). Chain-realistic gas so the burner's small top-up isn't drained.
  if (uB.gt(0)) {
    try {
      if (ethB.lt(ethers.utils.parseEther('0.00001'))) {
        info(`  burner has no ETH for gas — send it ~0.00002 ETH then re-run recover`)
      } else {
        info(`  sweeping ${ethers.utils.formatUnits(uB, stableDecimals)} ${stableSym} to ${dest}...`)
        const t = new ethers.Contract(C.uni.stable, ['function transfer(address,uint256) returns (bool)'], burner)
        const populated = await t.populateTransaction.transfer(dest, uB)
        const tx = await broadcastAndWait(burner, provider, { ...populated, gasLimit: 80_000, ...gasO }, { label: `${stableSym} sweep` })
        ok(`  ${stableSym.toLowerCase()} swept: ${tx.hash.slice(0, 14)}...`)
        swept = true
      }
    } catch (e) { info(`  ${stableSym} sweep failed: ${(e.message || '').slice(0, 80)}`); error = true }
  }

  // remaining ETH, 2x headroom over the actual max fee.
  try {
    const ethNow = await provider.getBalance(burner.address)
    if (ethNow.gt(0)) {
      const fee = await provider.getFeeData()
      const perGas = fee.maxFeePerGas || fee.gasPrice || ethers.utils.parseUnits('2', 'gwei')
      // A plain ETH transfer is 21000 on L1/Base, but Arbitrum Orbit L2s (Robinhood) charge
      // a slightly higher intrinsic gas (~21167) and reject a hardcoded 21000 as "intrinsic gas
      // too low". Estimate per-chain and add a small buffer; fall back to 50k if estimation fails.
      let gasUnits
      try { gasUnits = (await provider.estimateGas({ to: dest, value: ethNow.div(2), from: burner.address })).mul(12).div(10) }
      catch { gasUnits = ethers.BigNumber.from(50_000) }
      const gasCost = perGas.mul(gasUnits).mul(2)
      if (ethNow.gt(gasCost)) {
        const sendVal = ethNow.sub(gasCost)
        info(`  sweeping ${ethers.utils.formatEther(sendVal)} ETH to ${dest}...`)
        const tx = await broadcastAndWait(burner, provider, { to: dest, value: sendVal, gasLimit: gasUnits }, { label: 'ETH sweep' })
        ok(`  eth swept: ${tx.hash.slice(0, 14)}...`)
        swept = true
      } else {
        info(`  ETH (${ethers.utils.formatEther(ethNow)}) is dust below gas cost, leaving it`)
      }
    }
  } catch (e) { info(`  ETH sweep failed: ${(e.message || '').slice(0, 80)}`); error = true }
  return { swept, dust: false, error }
}

// Sweep registry burners for ONE chain. Shared by single-chain and --chain all.
async function recoverOneChain(chain, wallet, sig, dest) {
  const C = CHAINS[chain]
  log('')
  log(color(`  recovering stranded burner funds on ${C.label}`, c.bold))
  log(color(`  sweeping to ${dest}`, c.dim))
  log('')

  let swept = 0, dust = 0, errors = 0
  const seen = new Set()

  // 1) Registry burners (random ephemeral, created by frontend OR this CLI). Primary path — random
  // burners are NOT derivable, so without the registry they'd be unrecoverable.
  try {
    const authSig = await registryAuthSig(sig)
    const registryBurners = (await listRecoverableBurners(sig, authSig)).filter(b => b.chain === chain)
    info(`registry: ${registryBurners.length} burner(s) on ${C.label}`)
    for (const b of registryBurners) {
      if (seen.has(b.address.toLowerCase())) continue
      seen.add(b.address.toLowerCase())
      const r = await sweepBurner(b.privateKey, chain, dest)
      if (r.swept) { swept++; await markBurnerSwept(authSig, b.address, chain) }
      if (r.dust) dust++
      if (r.error) errors++
    }
  } catch (e) { info(`registry scan skipped: ${cleanErr(e)}`) }

  log('')
  if (swept > 0) ok(color(`recovered funds from ${swept} burner(s) on ${C.label}`, c.green))
  else ok(`no stranded funds on ${C.label} — all burners clean`)
  if (dust > 0) info(`(${dust} burner(s) hold only dust ETH below gas cost — not recoverable, safe to ignore)`)
  if (errors > 0) info(`${errors} burner(s) had errors — re-run recover to retry`)
  log('')
  ;(RESULT.recovered ||= []).push({ chain, to: dest, swept, dust, errors })
  return { swept, dust, errors }
}

async function cmdRecover(args) {
  const to = getFlag(args, '--to')
  const wallet = getWallet()
  const dest = to || wallet.address
  if (!/^0x[a-fA-F0-9]{40}$/.test(dest)) fail(`invalid --to address: ${dest}`)
  const sig = await ensureSignature(wallet)
  const rawChain = (getFlag(args, '--chain') || 'base').toLowerCase()

  // --chain all: sweep every chain in one go (fully idempotent, safe to run any time)
  if (rawChain === 'all') {
    for (const chainKey of Object.keys(CHAINS)) {
      await recoverOneChain(chainKey, wallet, sig, dest)
    }
    return
  }

  const chain = resolveChain(args)
  await recoverOneChain(chain, wallet, sig, dest)
}

async function cmdSwap(args) {
  if (/^(max|all)$/i.test(String(args[0] || ''))) {
    const fromPool = getFlag(args, '--from')
    if (!fromPool) fail('usage: blackpool swap max --from <pool> [--chain C]', 2)
    args = [...args]; args[0] = await resolveMaxAmount(resolveChain(args), fromPool, 'swap')
  }
  const chain = resolveChain(args)
  const C = CHAINS[chain]
  const amount = args[0]
  const from = getFlag(args, '--from')
  const stablePool = C.stablePool // 'usdc' on base, 'usdg' on robinhood, 'usdt' on bsc
  const nativePool = C.nativePool // 'eth' everywhere except bsc, where it's 'bnb'
  const validFrom = [nativePool, stablePool]
  if (!amount || amount.startsWith('--') || !from) fail(`usage: blackpool swap <amount> --from ${validFrom.join('|')} [--chain ${CHAIN_LIST}] [--slippage 100]`, 2)
  if (!validFrom.includes(from)) fail(`--from must be ${validFrom.join(' or ')} on ${C.label}`)
  const n = Number(amount)
  if (isNaN(n) || n <= 0) fail(`invalid amount: ${amount}`)
  requireMinTx(n, chain, from, 'swap')
  const slippageBps = Number(getFlag(args, '--slippage') || 100) // 1% default
  const isEthOrigin = from === nativePool
  const toSym = isEthOrigin ? C.pools[stablePool].symbol : C.pools[nativePool].symbol
  const stableSym = C.pools[stablePool].symbol
  // per-chain Uniswap V3 + token addresses (registry)
  const U = { router: C.uni.router, quoter: C.uni.quoter, weth: C.uni.weth, stable: C.uni.stable, fee: C.uni.fee }
  const stableDecimals = C.pools[stablePool].decimals
  let liveFees = null // set before the first burner tx (see reserve sizing below)
  const gasOv = (limit) => ({ gasLimit: limit, ...(liveFees || chainGasOverridesSync(chain)) })

  const wallet = getWallet()
  const sig = await ensureSignature(wallet)
  const provider = rpcProvider(chain)

  log('')
  log(color(`  swapping ${amount} ${from.toUpperCase()} -> ${toSym} privately on ${C.label}`, c.bold))
  log(color(`  fresh random burner (encrypted key registered for cross-device recovery)`, c.dim))
  log('')

  // === Step 1: create + register a fresh random burner (parity with frontend) ===
  info('creating fresh burner + registering encrypted key for recovery...')
  const authSig = await registryAuthSig(sig)
  const burnerW = await createAndRegisterBurner(sig, authSig, chain, C.uni.stable)
  const burner = new ethers.Wallet(burnerW.privateKey, provider)
  info(`burner: ${burner.address}`)
  info(`if anything fails, run \`blackpool recover\` — this burner's key is in the registry.`)

  // === Step 2: withdraw private -> burner via /api/swap-private ===
  info(`withdrawing private ${from.toUpperCase()} to burner via relayer...`)
  const wp = await apiPost('/api/swap-private', {
    signature: sig, chain, pool: from,
    fromAsset: chain === 'base' ? (isEthOrigin ? 'base_eth' : 'base_usdc') : undefined,
    amount: String(amount), burnerAddress: burner.address,
  }, { timeoutMs: 180_000 })
  info(`withdraw tx: ${explorerTx(chain, wp.txHash)}`)

  // Gas reserve sizing (chain-aware). The reshield needs a SEPARATE approve+deposit (~1.68M gas) for a
  // stablecoin dest, or a single ~1.6M-gas deposit for an ETH dest — priced at the chain's gas cap
  // (never ethers' 1.5 gwei default). Under-reserving here is exactly what stranded ETH→USDG on
  // Robinhood, so reserve generously (+50%).
  // Priced at the LIVE fee (3 x baseFee + tip, never above the chain cap) rather than the cap itself: on Arbitrum the
  // cap is ~50x the real price, which left most of a small swap sitting on the burner as unused gas.
  liveFees = await burnerFees(provider, chain)
  const feePerGas = liveFees.maxFeePerGas || liveFees.gasPrice
  const reshieldGasNeed = ethers.BigNumber.from(1_680_000).mul(feePerGas) // approve + ZK deposit, advanced by the relayer
  const swapGasReserve = ethers.BigNumber.from(320_000).mul(feePerGas).mul(15).div(10) // the swap tx itself

  // === Step 3: wait funds on burner + top-up gas for stablecoin origin ===
  let amountIn
  if (isEthOrigin) {
    info('waiting for ETH on burner...')
    await waitEthBalance(provider, burner.address, ethers.utils.parseEther('0.0001'), 'burner funding')
    const bal = await provider.getBalance(burner.address)
    // Swap everything except the swap tx's own gas; the relayer advances the reshield gas afterwards.
    if (bal.lte(swapGasReserve)) fail('burner balance too low after fees')
    amountIn = bal.sub(swapGasReserve)
  } else {
    info(`waiting for ${stableSym} on burner...`)
    amountIn = await waitTokenBalance(provider, U.stable, burner.address, ethers.BigNumber.from(1), 200)
    info('topping up burner gas via relayer...')
    // txCount 2: swap + unwrap both need gas; the ETH-dest reshield pays its own from the swap output.
    const gasRes = await apiPost('/api/burner-gas', {
      signature: sig, burnerAddress: burner.address, chain, txCount: 2,
    }, { timeoutMs: 60_000 })
    if (!gasRes.success) fail('gas top-up failed')
    await waitEthBalance(provider, burner.address, ethers.BigNumber.from(1), 'burner gas')
  }

  // === Step 4: swap via Uniswap V3 (SwapRouter02) ===
  info(`swapping ${from.toUpperCase()} -> ${toSym} on Uniswap V3 (fee tier ${U.fee / 10000}%)...`)
  const tokenIn  = isEthOrigin ? U.weth : U.stable
  const tokenOut = isEthOrigin ? U.stable : U.weth
  const quoter = new ethers.Contract(U.quoter,
    ['function quoteExactInputSingle((address,address,uint256,uint24,uint160)) returns (uint256,uint160,uint32,uint256)'], provider)
  const quote = await quoter.callStatic.quoteExactInputSingle([tokenIn, tokenOut, amountIn, U.fee, 0])
  const amountOut = quote[0]
  // slippage: 100 bps = 1%
  const minOut = amountOut.sub(amountOut.mul(slippageBps).div(10000))
  const decOut = isEthOrigin ? stableDecimals : 18
  info(`quote: ${ethers.utils.formatUnits(amountOut, decOut)} ${toSym} (min ${ethers.utils.formatUnits(minOut, decOut)} at ${slippageBps} bps slippage)`)

  // approve stablecoin if origin. Manual gasLimit to avoid public-RPC estimateGas flakiness.
  if (!isEthOrigin) {
    const stable = new ethers.Contract(U.stable, [
      'function allowance(address,address) view returns (uint256)',
      'function approve(address,uint256) returns (bool)',
    ], burner)
    if ((await stable.allowance(burner.address, U.router)).lt(amountIn)) {
      info(`approving ${stableSym} to Uniswap router...`)
      // approve() = ~50k gas. Chain-realistic gas params so the burner's small ETH top-up isn't
      // drained by ethers' default 1.5 gwei fee estimate. Also skips estimateGas.
      const apPop = await stable.populateTransaction.approve(U.router, amountIn)
      await broadcastAndWait(burner, provider, { ...apPop, ...gasOv(80_000) }, { label: 'swap approve' })
      // Poll allowance propagation (mirror same fix as deposit).
      for (let i = 0; i < 20; i++) {
        try { if ((await stable.allowance(burner.address, U.router)).gte(amountIn)) break } catch {}
        await new Promise(r => setTimeout(r, 2500))
      }
    }
  }
  const router = new ethers.Contract(U.router, [
    'function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256)',
  ], burner)
  const params = { tokenIn, tokenOut, fee: U.fee, recipient: burner.address, amountIn, amountOutMinimum: minOut, sqrtPriceLimitX96: 0 }
  // Uniswap V3 exactInputSingle ~180k gas. Manual gas so burner's ETH top-up is enough.
  const swapOverrides = gasOv(250_000)
  const swapPop = isEthOrigin
    ? await router.populateTransaction.exactInputSingle(params, { ...swapOverrides, value: amountIn })
    : await router.populateTransaction.exactInputSingle(params, swapOverrides)
  const swapTx = await broadcastAndWait(burner, provider, swapPop, { label: 'Uniswap swap' })
  info(`swap tx: ${explorerTx(chain, swapTx.hash)}`)
  ok('swap confirmed on Uniswap')

  // === Step 5: unwrap WETH -> ETH if ETH is the destination ===
  if (!isEthOrigin) {
    info('unwrapping WETH -> ETH on burner...')
    const wethBal = await waitTokenBalance(provider, U.weth, burner.address, ethers.BigNumber.from(1), 60)
    const weth = new ethers.Contract(U.weth, ['function withdraw(uint256)'], burner)
    const uwPop = await weth.populateTransaction.withdraw(wethBal)
    await broadcastAndWait(burner, provider, { ...uwPop, ...gasOv(60_000) }, { label: 'WETH unwrap' })
    info('unwrap confirmed')
  }

  // === Step 6: figure out reshield amount + call /api/deposit/prepare ===
  const destPool = isEthOrigin ? stablePool : 'eth'
  const destDec = isEthOrigin ? stableDecimals : 18
  let reshieldAmount
  if (isEthOrigin) {
    // Stablecoin destination: reshield the full stable balance (gas paid in the burner's reserved ETH).
    reshieldAmount = await waitTokenBalance(provider, U.stable, burner.address, ethers.BigNumber.from(1), 60)
    // The relayer advances the approve + deposit gas (the burner now holds the stablecoin, which is what the
    // top-up endpoint checks). Whatever is not used goes back to the relayer after the reshield.
    if ((await provider.getBalance(burner.address)).lt(reshieldGasNeed)) {
      info('relayer advancing reshield gas...')
      const g = await apiPost('/api/burner-gas', { signature: sig, burnerAddress: burner.address, chain, txCount: 2 }, { timeoutMs: 60_000 })
      if (!g.success) fail('reshield gas top-up failed; the swapped funds are safe on the burner, run `blackpool recover`')
      await waitEthBalance(provider, burner.address, reshieldGasNeed, 'reshield gas')
    }
  } else {
    // ETH destination: the deposit tx is payable (value = amount) AND pays its own gas from the same
    // balance. Reserve the deposit gas at the live fee.
    const full = await waitEthBalance(provider, burner.address, ethers.utils.parseEther('0.0000001'), 'swap output')
    const gasReserve = feePerGas.mul(1_600_000).mul(12).div(10) // live fee, +20%
    if (full.lte(gasReserve)) fail(`swap output ${ethers.utils.formatEther(full)} ETH too small to reshield after gas`)
    reshieldAmount = full.sub(gasReserve)
  }
  const reshieldFmt = ethers.utils.formatUnits(reshieldAmount, destDec)
  info(`preparing reshield of ${reshieldFmt} ${toSym} back to your private balance...`)
  // Reshield prepare: pass the USER's address (mirrors frontend `address: el`), NOT the burner.
  // The tx is still broadcast FROM the burner (which holds the swapped funds), but the deposit's
  // extData.recipient references the user's account - matching how the frontend reshields.
  const prep = await apiPost('/api/deposit/prepare', {
    signature: sig, address: wallet.address, amount: reshieldFmt, pool: destPool, chain,
  }, { timeoutMs: 180_000 })

  // ERC pool: burner approve first
  if (prep.approveTx) {
    info(`burner approving ${prep.symbol} to BLACKPOOL pool...`)
    await broadcastAndWait(burner, provider, {
      to: prep.approveTx.to, data: prep.approveTx.data,
      value: prep.approveTx.value === '0' ? 0 : ethers.BigNumber.from(prep.approveTx.value),
      ...gasOv(80_000),
    }, { label: 'reshield approve' })
    // allowance-propagation poll (same fix as deposit)
    const token = new ethers.Contract(prep.approveTx.to, ['function allowance(address,address) view returns (uint256)'], provider)
    for (let i = 0; i < 20; i++) {
      try { if ((await token.allowance(burner.address, prep.to)).gte(reshieldAmount)) break } catch {}
      await new Promise(r => setTimeout(r, 2500))
    }
  }
  // Pre-flight: simulate the reshield via eth_call before broadcasting. If it would revert,
  // we learn why WITHOUT spending gas or stranding funds - then recover cleanly.
  const reshieldVal = prep.value === '0' ? ethers.BigNumber.from(0) : ethers.BigNumber.from(prep.value)
  info('simulating reshield before broadcast...')
  try {
    await provider.call({ to: prep.to, data: prep.data, value: reshieldVal, from: burner.address })
  } catch (simErr) {
    const reason = simErr.reason || simErr.error?.message || simErr.message || String(simErr)
    fail(`reshield would revert: ${reason.slice(0, 160)}\n  Funds are safe on burner ${burner.address}. Run \`blackpool recover\` to sweep them back.`)
  }

  info('burner broadcasting reshield tx (funds re-enter YOUR private balance)...')
  // reshield transact() = Groth16 proof verify + Merkle tree updates on-chain. Measured ~1.35M gas.
  // Two constraints must both fit: (1) gasLimit >= actual usage (else revert like 591k cap),
  // (2) gasLimit * maxFeePerGas <= burner ETH balance (else "insufficient funds for gas").
  // Solution: estimate real gas, add 20% buffer, and cap maxFeePerGas to what the burner can afford.
  const burnerEth = await provider.getBalance(burner.address)
  let estGas
  try { estGas = await provider.estimateGas({ to: prep.to, data: prep.data, value: reshieldVal, from: burner.address }) }
  catch { estGas = ethers.BigNumber.from(1_600_000) } // fallback
  const gasLimit = estGas.mul(12).div(10) // +20% headroom
  // The live fee OR what fits in burner ETH, whichever is lower.
  let maxFee = feePerGas
  const maxAffordable = burnerEth.div(gasLimit)
  if (maxFee.gt(maxAffordable)) maxFee = maxAffordable.mul(9).div(10) // 90% of ceiling
  // BNB Chain enforces a 0.05 gwei minimum on the effective price; an EIP-1559 tip of maxFee/10 falls below it.
  const feeFields = C.legacyGas ? { gasPrice: maxFee } : { maxFeePerGas: maxFee, maxPriorityFeePerGas: maxFee.div(10) }
  const rtx = await broadcastAndWait(burner, provider, {
    to: prep.to, data: prep.data, value: reshieldVal,
    gasLimit,
    ...feeFields,
  }, { label: 'reshield' })

  await returnUnusedGas(burner, provider, chain)

  log('')
  ok(color(`swap complete: ${amount} ${from.toUpperCase()} -> ${reshieldFmt} ${toSym} (private) on ${C.label}`, c.green))
  info(`new private balance: ${prep.newBalance} ${prep.symbol}`)
  info(`reshield tx: ${explorerTx(chain, rtx.hash)}`)
  log('')
  result({ chain, from, amount: n, received: reshieldFmt, symbol: toSym, txHash: rtx.hash, explorer: explorerTx(chain, rtx.hash), privateBalance: prep.newBalance })
}

// blackpool bridges — list this wallet's NEAR Intents bridges (server-side intent registry, any device).
async function cmdBridges() {
  const wallet = getWallet()
  const sig = await ensureSignature(wallet)
  const authSig = await registryAuthSig(sig)
  const res = await apiPost('/api/intents', { authSig }, { timeoutMs: 60_000 })
  const list = res.intents || []
  result({ bridges: list })
  if (!list.length) { log(color('  no bridges recorded for this wallet', c.dim)); return }
  log('')
  for (const it of list) {
    const when = new Date(it.createdAt).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
    const st = String(it.status || 'UNKNOWN')
    const col = st === 'SUCCESS' ? c.green : (st === 'REFUNDED' || st === 'FAILED') ? c.red : c.yellow
    log(`  ${color(st.padEnd(16), col)} ${when}  ${it.amountIn} ${it.fromAsset} -> ${it.toAsset}`)
    log(color(`      to ${it.recipient}`, c.dim))
    if (st === 'SUCCESS') log(color(`      delivered ${it.amountOut || it.amountOutQuote || ''}${it.destTx ? `  dest tx ${it.destTx}` : ''}`, c.dim))
    else if (st === 'REFUNDED' || st === 'FAILED') log(color(`      ${it.statusDetail || 'solver could not complete'} — refund to ${it.refundTo} on ${it.originChain}`, c.dim))
    else log(color(`      in progress — refund address if it fails: ${it.refundTo} on ${it.originChain}`, c.dim))
    log(color(`      ${it.statusUrl}`, c.dim))
  }
  log('')
}

async function cmdAssets() {
  info('fetching supported assets...')
  const res = await apiGet('/api/assets')
  result({ assets: res.assets || {}, origins: Object.keys(BRIDGE_ORIGINS) })
  log('')
  log(color('  bridge destination assets:', c.bold))
  const byChain = {}
  for (const [k, v] of Object.entries(res.assets || {})) {
    byChain[v.chain] = byChain[v.chain] || []
    byChain[v.chain].push(`${k} (${v.symbol})`)
  }
  for (const [chain, list] of Object.entries(byChain)) {
    log(`  ${color(chain, c.cyan)}: ${color(list.join(', '), c.dim)}`)
  }
  log('')
  // Destinations and origins are different sets: any listed asset can be a destination, but an
  // origin must be a pool BLACKPOOL shields AND that 1Click indexes.
  log(color(`  valid --from origins: ${Object.keys(BRIDGE_ORIGINS).join(', ')}`, c.bold))
  log(color('  every destination above is reachable from every origin via NEAR Intents (Robinhood = hood_*)', c.dim))
  log('')
}

async function cmdSend(args) {
  if (/^(max|all)$/i.test(String(args[1] || ''))) return cmdSendMax(args)
  const chain = resolveChain(args)
  const C = CHAINS[chain]
  const recipient = args[0]
  const amount = args[1]
  const validPools = poolsForChain(chain)
  const pool = getFlag(args, '--pool') || C.stablePool
  if (!recipient || !amount) fail(`usage: blackpool send <recipient> <amount> [--pool ${validPools.join('|')}] [--chain ${CHAIN_LIST}]`, 2)
  if (!/^0x[a-fA-F0-9]{40}$/.test(recipient)) fail(`invalid recipient address: ${recipient}`)
  const n = Number(amount)
  if (isNaN(n) || n <= 0) fail(`invalid amount: ${amount}`)
  if (!validPools.includes(pool)) fail(`unknown pool "${pool}" on ${C.label} (supported: ${validPools.join(', ')})`)
  requireMinTx(n, chain, pool, 'send')

  const wallet = getWallet()
  const sig = await ensureSignature(wallet)

  log('')
  log(color(`  paying ${amount} ${pool.toUpperCase()} privately on ${C.label}`, c.bold))
  log(color(`  to ${recipient}`, c.dim))
  log('')
  info('building groth16 proof + broadcasting via relayer...')
  info('this can take ~30-90 seconds - you pay no gas.')

  const res = await apiPost('/api/withdraw', {
    signature: sig, amount: String(amount), recipient, pool, chain
  }, { timeoutMs: 180_000 })

  log('')
  ok(color(`sent ${res.recipientReceives} ${res.symbol}`, c.green) + ` to ${color(recipient, c.cyan)}`)
  info(`fee: ${res.fee} ${res.symbol}`)
  info(`tx:  ${explorerTx(chain, res.txHash)}`)
  log('')
  result({ chain, pool, recipient, amount: n, received: res.recipientReceives, fee: res.fee, symbol: res.symbol, txHash: res.txHash, explorer: explorerTx(chain, res.txHash) })
}

// "max" for swap/bridge: the most one operation can spend (its two largest notes), as an exact decimal string.
async function resolveMaxAmount(chain, pool, flow) {
  if (!CHAINS[chain] || !CHAINS[chain].pools[pool]) fail(`unknown pool "${pool}" on ${CHAINS[chain] ? CHAINS[chain].label : chain}`)
  const P = CHAINS[chain].pools[pool]
  const sig = await ensureSignature(getWallet())
  const bal = await apiPost('/api/balance', { signature: sig, pool, chain }, { timeoutMs: 120_000 })
  const notes = (bal.utxos || []).map((u) => ethers.utils.parseUnits(String(u), P.decimals)).sort((a, b) => (b.gt(a) ? 1 : b.lt(a) ? -1 : 0))
  if (!notes.length) fail(`no private ${P.symbol} on ${CHAINS[chain].label}`)
  const spend = notes.slice(0, 2).reduce((s, n) => s.add(n), ethers.BigNumber.from(0))
  const total = notes.reduce((s, n) => s.add(n), ethers.BigNumber.from(0))
  const spendStr = ethers.utils.formatUnits(spend, P.decimals)
  if (Number(spendStr) < minTxFor(chain, pool).min) fail(`private ${P.symbol} on ${CHAINS[chain].label} is ${ethers.utils.formatUnits(total, P.decimals)}, below the minimum ${flow}`)
  info(`max: ${spendStr} ${P.symbol}` + (notes.length > 2 ? ` (of ${ethers.utils.formatUnits(total, P.decimals)} across ${notes.length} notes; run ${flow} max again for the rest)` : ''))
  return spendStr
}

// send <recipient> max: empty one pool, every pool of a chain, or every pool everywhere into one address.
async function cmdSendMax(args) {
  const recipient = args[0]
  if (!/^0x[a-fA-F0-9]{40}$/.test(String(recipient || ''))) fail(`invalid recipient address: ${recipient}`, 2)
  const rawChain = (getFlag(args, '--chain') || 'base').toLowerCase()
  const chains = rawChain === 'all' ? Object.keys(CHAINS) : [resolveChain(args)]
  const poolFlag = (getFlag(args, '--pool') || 'all').toLowerCase()
  if (rawChain === 'all' && poolFlag !== 'all') fail('with --chain all, use --pool all (pool names differ per chain)', 2)
  if (poolFlag !== 'all' && !poolsForChain(chains[0]).includes(poolFlag)) fail(`unknown pool "${poolFlag}" on ${CHAINS[chains[0]].label} (supported: ${poolsForChain(chains[0]).join(', ')})`)

  const wallet = getWallet()
  const sig = await ensureSignature(wallet)
  const sends = [], dust = [], errors = []
  log('')
  log(color(`  sending the whole private balance to ${recipient}`, c.bold))
  for (const chain of chains) {
    const pools = poolFlag === 'all' ? poolsForChain(chain) : [poolFlag]
    for (const pool of pools) {
      const P = CHAINS[chain].pools[pool]
      const tag = `${CHAINS[chain].label} ${P.symbol}`
      for (let round = 0; round < 12; round++) {
        let bal
        try { bal = await apiPost('/api/balance', { signature: sig, pool, chain }, { timeoutMs: 120_000 }) }
        catch (e) { errors.push({ chain, pool, error: cleanErr(e) }); info(`${tag}: could not read the balance (${cleanErr(e)})`); break }
        const notes = (bal.utxos || []).map((u) => ethers.utils.parseUnits(String(u), P.decimals)).sort((a, b) => (b.gt(a) ? 1 : b.lt(a) ? -1 : 0))
        if (!notes.length) { if (round === 0) info(`${tag}: empty`); break }
        // one send spends at most the two largest notes
        const spend = notes.slice(0, 2).reduce((s, n) => s.add(n), ethers.BigNumber.from(0))
        const spendStr = ethers.utils.formatUnits(spend, P.decimals)
        const total = ethers.utils.formatUnits(notes.reduce((s, n) => s.add(n), ethers.BigNumber.from(0)), P.decimals)
        if (Number(spendStr) < minTxFor(chain, pool).min) { dust.push({ chain, pool, symbol: P.symbol, balance: total }); info(`${tag}: ${total} left as dust (under the minimum send)`); break }
        info(`${tag}: sending ${spendStr}${notes.length > 2 ? ` (part ${round + 1}, ${notes.length} notes)` : ''}...`)
        try {
          const res = await apiPost('/api/withdraw', { signature: sig, amount: spendStr, recipient, pool, chain }, { timeoutMs: 180_000 })
          sends.push({ chain, pool, symbol: res.symbol, amount: spendStr, received: res.recipientReceives, fee: res.fee, txHash: res.txHash, explorer: explorerTx(chain, res.txHash) })
          ok(`${tag}: sent ${spendStr}, recipient gets ${res.recipientReceives} ${res.symbol}  ${color(explorerTx(chain, res.txHash), c.dim)}`)
        } catch (e) {
          const m = cleanErr(e)
          if (/twice the fee/i.test(m)) { dust.push({ chain, pool, symbol: P.symbol, balance: total }); info(`${tag}: ${total} left as dust (at or below twice the fee)`) }
          else { errors.push({ chain, pool, error: m }); info(`${tag}: not sent (${m})`) }
          break
        }
      }
    }
  }
  const received = {}
  for (const s of sends) received[s.symbol] = (Number(received[s.symbol] || 0) + Number(s.received)).toString()
  log('')
  if (sends.length) ok(color(`${sends.length} send(s) done`, c.green) + (dust.length ? `, ${dust.length} pool(s) left with dust` : ''))
  else info('nothing to send')
  log('')
  result({ recipient, amount: 'max', sends, received, dust, errors })
  if (errors.length && !sends.length) fail(errors.map((e) => `${e.chain}/${e.pool}: ${e.error}`).join('; '))
}

function getFlag(args, name) {
  const i = args.indexOf(name)
  if (i === -1) return null
  return args[i + 1]
}

// === help ===
function help() {
  log(`
${color('blackpool', c.bold)} ${color('v' + require('../package.json').version, c.dim)} - private payments for onchain agents

${color('Usage:', c.bold)}
  blackpool <command> [args] [flags]

${color('Commands:', c.bold)}
  login                          Store key (hidden prompt) + sign BLACKPOOL message.
  address                        Print the wallet address (fund this to shield).
  logout                         Remove stored key and cached signature.
  balance [--pool] [--chain]     Show private + public balances (or one pool).
                                 --chain all shows every chain in one run.
  deposit <amount> [--pool] [--chain]   Shield public funds into private pool.
  send <to> <amount> [--pool] [--chain] Send privately to an address (no gas from you).
                                 amount "max": the whole private balance (no --pool = every pool; --chain all).
                                 swap/bridge also take "max" (the most one operation can move).
  swap <amount> --from <pool> [--chain] Private same-chain swap via Uniswap V3.
  bridge <asset> <to> <amount>   Bridge cross-chain privately via NEAR Intents (--no-wait: return once submitted)
                                 (--from ${Object.keys(BRIDGE_ORIGINS).join('|')}).
                                 Run 'blackpool assets' for the destination list.
  assets                         List supported bridge destination assets.
  bridges                        List your cross-chain bridges + status (where a refund went).
  mcp                            Run a Model Context Protocol server over stdio (agent apps).
  recover [--to <addr>] [--chain]   Sweep any stranded funds from burner wallets.
                                 --chain all sweeps every chain in one run (idempotent).
  version                        Print CLI version.
  latest                         Check npm for a newer version.
  help                           Show this help.

${color('Chains:', c.bold)}
${Object.entries(CHAINS).map(([k, v]) => `  --chain ${k.padEnd(10)} ${k === 'base' ? '(default) ' : ''}pools: ${Object.keys(v.pools).join(', ')}`).join('\n')}

${color('Environment (optional, for agents/CI):', c.bold)}
  BLACKPOOL_KEY   Agent private key (0x-hex). If set, skips interactive login.
  BLACKPOOL_API   API base URL (default: ${API}).
  BLACKPOOL_HOME  Config directory (default: ~/.blackpool).
  BLACKPOOL_JSON  Set to 1 for JSON output (same as --json).

${color('Output:', c.bold)}
  --json          One JSON object on stdout: {"ok":true,"command":...,...} or {"ok":false,"error":...}.
                  Progress goes to stderr. Exit codes: 0 ok, 1 error, 2 usage.

${color('Config:', c.bold)}
  ~/.blackpool/wallet.json       Stored private key (chmod 600).
  ~/.blackpool/config.json       Cached signatures per wallet (chmod 600).

${color('Docs:', c.bold)}
  https://blackpool.cash/docs#agents
  https://blackpool.cash/AGENTS.md
`)
}

// Check npm registry for latest published version.
async function cmdLatest() {
  const local = require('../package.json').version
  info(`fetching latest @blackpool/cli from npm...`)
  try {
    const r = await fetch('https://registry.npmjs.org/@blackpool/cli/latest', { headers: { 'Accept': 'application/json' } })
    if (!r.ok) fail(`npm registry error (HTTP ${r.status})`)
    const remote = (await r.json()).version
    result({ installed: local, latest: remote, upToDate: local === remote })
    log('')
    log(`  ${color('installed', c.dim)}  ${color('v' + local, c.cyan)}`)
    log(`  ${color('latest   ', c.dim)}  ${color('v' + remote, c.lime)}`)
    log('')
    if (local === remote) {
      ok('you are on the latest version')
    } else {
      info(color(`update available: npm i -g @blackpool/cli@${remote}`, c.yellow))
    }
    log('')
  } catch (e) { fail(`could not reach npm registry: ${e.message}`) }
}

// === entrypoint ===
async function main() {
  const [cmd, ...args] = process.argv.slice(2).filter(a => a !== '--json')
  CMD = cmd || 'help'
  try {
    switch (cmd) {
      case 'login':   await cmdLogin();          break
      case 'logout':  await cmdLogout();         break
      case 'address': await cmdAddress();        break
      case 'mcp':     await require('./mcp.js').serve(); process.exit(0)
      case 'balance': await cmdBalance(args);    break
      case 'deposit': await cmdDeposit(args);    break
      case 'send':    await cmdSend(args);       break
      case 'swap':    await cmdSwap(args);       break
      case 'bridge':  await cmdBridge(args);     break
      case 'assets':  await cmdAssets();         break
      case 'bridges': await cmdBridges();        break
      case 'recover': await cmdRecover(args);    break
      case 'version':
      case '-v':
      case '--version': {
        const pkg = require('../package.json')
        log(pkg.version)
        result({ version: pkg.version })
        break
      }
      case 'latest':
      case '--latest': await cmdLatest(); break
      case 'help':
      case '-h':
      case '--help':
      case undefined: help();                    break
      default: if (!JSON_MODE) { log(`unknown command: ${cmd}\n`); help() } fail(`unknown command: ${cmd} (run blackpool help)`, 2)
    }
    // Exit explicitly: the prover leaves worker threads alive, which would keep the process running after a
    // deposit, send, swap or bridge has already finished.
    if (JSON_MODE) process.stdout.write(JSON.stringify({ ok: true, command: CMD, ...RESULT }) + '\n', () => process.exit(0))
    else process.stdout.write('', () => process.exit(0)) // flush piped output first
  } catch (e) {
    fail(cleanErr(e))
  }
}
main()
