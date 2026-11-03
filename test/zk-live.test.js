// Live check of local proving against mainnet pool state, no funds moved:
// a fresh account proves a deposit locally and the transaction is SIMULATED (eth_call) from a funded address,
// so the real on-chain verifier checks the client-made proof and the real root. Also exercises /api/relay guards.
// Usage: API=http://127.0.0.1:4102 node test/zk-live.test.js <chain> <pool> <fundedFrom> <amount>
const assert = require('assert')
const fs = require('fs')
const { ethers } = require('ethers')
const { createLocalApi } = require('../cli/lib/localApi')
const zk = require('../cli/lib/zk')

const API = process.env.API || 'http://127.0.0.1:4102'
const [chain = 'robinhood', pool = 'eth', from, amount = '0.001'] = process.argv.slice(2)
const RPC = { robinhood: 'https://rpc.mainnet.chain.robinhood.com', base: 'https://mainnet.base.org', arbitrum: 'https://arb1.arbitrum.io/rpc', bsc: 'https://bsc-dataseed.bnbchain.org' }

async function request(method, path, body) {
  const r = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json' }, body: method === 'GET' ? undefined : JSON.stringify(body || {}) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw Object.assign(new Error(j.error || `HTTP ${r.status}`), { status: r.status })
  return j
}

;(async () => {
  const circuit = { wasm: fs.readFileSync('build/circuits/transaction2.wasm'), zkey: fs.readFileSync('build/circuits/transaction2.zkey') }
  const stages = []
  const local = createLocalApi({ request, loadCircuit: async () => circuit, onProgress: (p) => stages.push(p.stage) })
  const w = ethers.Wallet.createRandom()
  const signature = await w.signMessage(zk.SIGN_IN_MESSAGE)

  const cfg = await request('GET', '/api/zk/config')
  assert.ok(cfg.pools[`${chain}:${pool}`], 'pool in config')
  const snap = await request('GET', `/api/zk/pool?chain=${chain}&pool=${pool}`)
  const tree = zk.buildTree(snap.entries.map((e) => e.commitment))
  assert.strictEqual(zk.toHex(tree.root), snap.root, 'local root = indexer root')
  console.log(`ok  ${chain}:${pool} snapshot: ${snap.entries.length} leaves, ${snap.nullifiers.length} spent nullifiers, local root matches`)

  const bal = await local.handle('/api/balance', { signature, chain, pool })
  assert.strictEqual(bal.balance, '0.0'); console.log(`ok  balance of a fresh account: ${bal.balance} ${bal.symbol}`)

  const t0 = Date.now()
  const dep = await local.handle('/api/deposit/prepare', { signature, address: from, amount, chain, pool })
  console.log(`ok  deposit prepared and proved locally in ${Date.now() - t0} ms (stages: ${[...new Set(stages)].join(' > ')})`)

  const provider = new ethers.providers.StaticJsonRpcProvider(RPC[chain])
  const P = cfg.pools[`${chain}:${pool}`]
  const pc = new ethers.Contract(P.address, zk.POOL_ABI, provider)
  const decoded = pc.interface.decodeFunctionData('transact', dep.data)
  assert.ok(await pc.isKnownRoot(decoded._args.root), 'proof root is known on-chain')
  // Some public RPCs return revert data as a normal result instead of an error: decode both.
  let m = null
  try {
    const r = await provider.call({ from, to: dep.to, data: dep.data, value: ethers.BigNumber.from(dep.value) })
    if (r && r.startsWith('0x08c379a0')) m = ethers.utils.defaultAbiCoder.decode(['string'], '0x' + r.slice(10))[0]
    else if (r && r !== '0x') m = `custom error ${r.slice(0, 10)}`
  } catch (e) { m = (e.error && e.error.message) || e.reason || e.message }
  // Any revert at the token pull happens AFTER root, nullifier, extDataHash, publicAmount and proof checks.
  const tokenPull = /allowance|transfer amount exceeds|transfer from|ERC20|SafeERC20|0xfb8f41b2|0xe450d38c|0x5274afe7|0x13be252b/i
  if (m == null) console.log(`ok  eth_call transact from ${from.slice(0, 10)}...: the on-chain verifier ACCEPTS the locally generated proof`)
  else if (!P.isNative && tokenPull.test(m)) console.log(`ok  proof, root and amounts accepted; reverted only at the token pull (${m.slice(0, 50)})`)
  else throw new Error(`simulation reverted: ${m}`)

  // relay guards
  const expect400 = async (body, re) => {
    try { await request('POST', '/api/relay', body); throw new Error('expected rejection') }
    catch (e) { assert.ok(e.status === 400 && re.test(e.message), `relay guard: ${e.message}`) }
  }
  await expect400({ chain, pool }, /missing args/)
  await expect400({ chain, pool, args: decoded._args, extData: decoded._extData }, /malformed|withdraw/)
  const args = { pA: decoded._args.pA.map(String), pB: decoded._args.pB.map((r) => r.map(String)), pC: decoded._args.pC.map(String), root: decoded._args.root,
    inputNullifiers: decoded._args.inputNullifiers, outputCommitments: decoded._args.outputCommitments, publicAmount: zk.toHex(decoded._args.publicAmount), extDataHash: decoded._args.extDataHash }
  const ext = { recipient: decoded._extData.recipient, extAmount: zk.toHex(decoded._extData.extAmount), feeRecipient: decoded._extData.feeRecipient, fee: zk.toHex(decoded._extData.fee), encryptedOutput1: decoded._extData.encryptedOutput1, encryptedOutput2: decoded._extData.encryptedOutput2 }
  await expect400({ chain, pool, args, extData: ext }, /only broadcasts withdrawals/)
  await expect400({ chain, pool, args, extData: { ...ext, extAmount: zk.toHex(-(10n ** 15n)), fee: '0x0' } }, /fee too low|fee recipient/)
  await expect400({ chain, pool, args, extData: { ...ext, extAmount: zk.toHex(-(10n ** 15n)), fee: zk.toHex(10n ** 14n) }, purpose: 'swap' }, /fee too low|twice|quote/)
  console.log('ok  /api/relay rejects deposits, missing/low fees and unquoted swaps')
  process.exit(0)
})().catch((e) => { console.error('FAIL', e.message || e); process.exit(1) })
