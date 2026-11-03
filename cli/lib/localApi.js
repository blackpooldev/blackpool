'use strict'
// Local replacements for the five endpoints that used to receive the sign-in signature.
//
// createLocalApi() returns handle(path, body) for:
//   /api/balance  /api/withdraw  /api/deposit/prepare  /api/swap  /api/swap-private
// with the SAME request and response shapes the server used, so callers (web app, CLI, MCP server) only swap the
// transport. The signature is used here, in memory, to derive keys; it is never sent anywhere. Proofs are made
// locally and only the finished proof goes to /api/relay. Nothing is persisted by this module.
const { utils: U, Wallet } = require('ethers') // v5
const zk = require('./zk')

const LOCAL_PATHS = new Set(['/api/balance', '/api/withdraw', '/api/deposit/prepare', '/api/swap', '/api/swap-private'])
const REGISTRY_AUTH_DOMAIN = 'blackpool/registry-auth/v1'
const REGISTRY_AUTH_MESSAGE = 'Blackpool Registry\n\nAuthorize access to your encrypted recovery data.\nThis does not move funds and does not expose your account keys.'
const ERC20 = new U.Interface(['function approve(address,uint256) returns (bool)'])

/** Same derivation as the burner/intent registries: owner = address(keccak256(sig || domain)). */
function registryAuthSig(signInSig) {
  const key = U.keccak256(U.concat([U.arrayify(signInSig), U.toUtf8Bytes(REGISTRY_AUTH_DOMAIN)]))
  return new Wallet(key).signMessage(REGISTRY_AUTH_MESSAGE)
}

/**
 * request(method, path, body) -> parsed JSON; must throw Error(message) on a non-2xx answer.
 * loadCircuit(onProgress) -> { wasm, zkey } (Uint8Array or file paths), loaded once by the caller.
 */
function createLocalApi({ request, loadCircuit, snarkjs, singleThread = false, onProgress = () => {} }) {
  const mem = { config: null, configAt: 0, keys: new Map(), pending: new Map() }

  async function config() {
    if (!mem.config || Date.now() - mem.configAt > 5 * 60_000) { mem.config = await request('GET', '/api/zk/config'); mem.configAt = Date.now() }
    return mem.config
  }
  async function keysFor(signature) {
    let k = mem.keys.get(signature)
    if (!k) { k = await zk.deriveKeys(signature); mem.keys.set(signature, k) }
    return k
  }
  async function poolOf({ chain, pool, fromAsset }) {
    const cfg = await config()
    let key = chain && pool ? `${String(chain).toLowerCase()}:${String(pool).toLowerCase()}` : null
    if (!key && fromAsset) key = Object.keys(cfg.pools).find((k) => cfg.pools[k].oneClickAsset === fromAsset) || null
    if (!key) key = `${String(chain || 'base').toLowerCase()}:${String(pool || 'eth').toLowerCase()}`
    const P = cfg.pools[key]
    if (!P) throw new Error('unknown pool')
    return { key, ...P, feeRecipient: cfg.feeRecipient }
  }
  const units = (P, v) => BigInt(U.parseUnits(String(v), P.decimals).toString())
  const fmt = (P, v) => U.formatUnits(v.toString(), P.decimals)

  // A snapshot behind the chain (the API reports the pool's on-chain nextIndex) would show old notes right after a
  // transaction; wait for it to catch up (normally a few seconds) before using it.
  async function poolSnapshot(P, timeoutMs = 45_000) {
    const until = Date.now() + timeoutMs
    for (;;) {
      const d = await request('GET', `/api/zk/pool?chain=${P.chain}&pool=${P.pool}`)
      if (d.chainNextIndex == null || d.nextIndex >= d.chainNextIndex || Date.now() > until) return d
      await new Promise((r) => setTimeout(r, 2500))
    }
  }
  async function account(keys, P) {
    onProgress({ stage: 'scan', pool: P.key })
    const data = await poolSnapshot(P)
    const indexed = new Set(data.nullifiers.map((n) => n.toLowerCase()))
    const pend = mem.pending.get(P.key) || new Set()
    for (const n of pend) if (indexed.has(n)) pend.delete(n)
    return zk.loadAccount({ keys, poolData: { root: data.root, entries: data.entries, nullifiers: [...data.nullifiers, ...pend] } })
  }
  async function proofFor(tx) {
    onProgress({ stage: 'circuit' })
    const circuit = await loadCircuit(onProgress)
    onProgress({ stage: 'prove' })
    const proof = await zk.prove(tx.circuitInput, { ...circuit, snarkjs, singleThread })
    return { ...proof, ...tx.publicArgs }
  }
  async function relay(P, tx, purpose, extra = {}) {
    const args = await proofFor(tx)
    onProgress({ stage: 'relay' })
    const r = await request('POST', '/api/relay', { chain: P.chain, pool: P.pool, args, extData: tx.extData, purpose, ...extra })
    const set = mem.pending.get(P.key) || new Set()
    for (const n of tx.publicArgs.inputNullifiers) set.add(n.toLowerCase())
    mem.pending.set(P.key, set)
    return r
  }
  // A second spend in the same session needs the first one's change note in the tree.
  async function waitIndexed(P, nullifiers, timeoutMs = 90_000) {
    const want = nullifiers.map((n) => n.toLowerCase())
    const until = Date.now() + timeoutMs
    while (Date.now() < until) {
      const d = await request('GET', `/api/zk/pool?chain=${P.chain}&pool=${P.pool}`)
      const have = new Set(d.nullifiers.map((n) => n.toLowerCase()))
      if (want.every((n) => have.has(n))) return
      await new Promise((r) => setTimeout(r, 3000))
    }
    throw new Error('timed out waiting for the indexer; your first payment went through, retry the second')
  }
  function friendly(e, P) {
    if (e.code === 'TOO_SMALL') return new Error(`amount must be more than twice the fee (${fmt(P, e.minimum)} ${P.symbol})`)
    if (e.code === 'FRAGMENTED') return new Error(`max ${fmt(P, e.maxSpendable)} per transaction (funds split across several notes; spend the rest separately)`)
    if (e.code === 'INSUFFICIENT') return new Error(`insufficient balance: have ${fmt(P, e.maxSpendable)}`)
    return e
  }

  const handlers = {
    async '/api/balance'(b) {
      const P = await poolOf(b)
      const acc = await account(await keysFor(b.signature), P)
      return { balance: fmt(P, acc.balance), symbol: P.symbol, utxoCount: acc.notes.length, utxos: acc.notes.map((n) => fmt(P, n.amount)) }
    },

    async '/api/withdraw'(b) {
      const P = await poolOf(b)
      const keys = await keysFor(b.signature)
      const list = Array.isArray(b.recipients) && b.recipients.length ? b.recipients.map((r) => ({ address: r.address, amount: r.amount })) : [{ address: b.recipient, amount: b.amount }]
      if (list.length > 2) throw new Error('max 2 recipients (circuit 2-output constraint)')
      for (const r of list) {
        if (!r.address || !/^0x[a-fA-F0-9]{40}$/.test(r.address)) throw new Error(`invalid recipient address: ${r.address || '(empty)'}`)
        if (!r.amount || isNaN(Number(r.amount)) || Number(r.amount) <= 0) throw new Error(`invalid amount for ${r.address}`)
      }
      const results = []
      for (let i = 0; i < list.length; i++) {
        if (i > 0) await waitIndexed(P, results[i - 1]._nullifiers)
        const acc = await account(keys, P)
        if (!acc.notes.length) throw new Error('no unspent UTXOs')
        let tx
        try { tx = await zk.prepareWithdraw({ keys, account: acc, amount: units(P, list[i].amount), recipient: list[i].address, flatFeeWei: P.flatFeeWei, feeRecipient: P.feeRecipient }) }
        catch (e) { throw friendly(e, P) }
        const r = await relay(P, tx, 'withdraw')
        results.push({ ...r, _nullifiers: tx.publicArgs.inputNullifiers })
      }
      const clean = results.map(({ _nullifiers, ...r }) => r)
      return clean.length === 1 ? clean[0] : { success: clean.every((x) => x.success), transfers: clean }
    },

    async '/api/deposit/prepare'(b) {
      if (!b.address || !b.amount) throw new Error('missing address/amount')
      const P = await poolOf(b)
      const keys = await keysFor(b.signature)
      const acc = await account(keys, P)
      const amount = units(P, b.amount)
      const tx = await zk.prepareDeposit({ keys, account: acc, amount, depositor: b.address, feeRecipient: P.feeRecipient })
      const args = await proofFor(tx)
      const resp = {
        to: P.address,
        data: zk.encodeTransact(args, tx.extData),
        value: P.isNative ? amount.toString() : '0',
        newBalance: fmt(P, tx.newBalance),
        symbol: P.symbol,
      }
      if (!P.isNative) {
        const a = await request('GET', `/api/zk/allowance?chain=${P.chain}&pool=${P.pool}&owner=${b.address}`)
        if (BigInt(a.allowance) < amount) resp.approveTx = { to: P.token, data: ERC20.encodeFunctionData('approve', [P.address, amount.toString()]), value: '0' }
      }
      return resp
    },

    async '/api/swap'(b) {
      if (!b.signature) throw new Error('missing signature')
      const q = await request('POST', '/api/swap/quote', {
        fromAsset: b.fromAsset, toAsset: b.toAsset, amount: b.amount, recipient: b.recipient, refundTo: b.refundTo, slippage: b.slippage,
        ...(b.chain && b.pool ? { chain: b.chain, pool: b.pool } : {}),
      })
      const P = await poolOf({ chain: q.chain, pool: q.pool })
      const keys = await keysFor(b.signature)
      const acc = await account(keys, P)
      if (!acc.notes.length) throw new Error(`your private ${P.symbol} balance on ${P.chain} is empty — switch to the pool that holds your funds, or deposit ${P.symbol} first`)
      let tx
      try { tx = await zk.prepareWithdraw({ keys, account: acc, amount: BigInt(q.amountWei), recipient: q.depositAddress, flatFeeWei: P.flatFeeWei, feeRecipient: P.feeRecipient }) }
      catch (e) { throw friendly(e, P) }
      const r = await relay(P, tx, 'swap', { authSig: await registryAuthSig(b.signature) })
      return { success: r.success, txHash: r.txHash, depositAddress: r.depositAddress, amountOut: r.amountOut, timeEstimate: r.timeEstimate, statusUrl: r.statusUrl }
    },

    async '/api/swap-private'(b) {
      if (!b.burnerAddress || !/^0x[a-fA-F0-9]{40}$/.test(b.burnerAddress)) throw new Error('invalid burnerAddress')
      if (!b.amount || isNaN(Number(b.amount)) || Number(b.amount) <= 0) throw new Error('invalid amount')
      const P = await poolOf(b)
      const keys = await keysFor(b.signature)
      const acc = await account(keys, P)
      if (!acc.notes.length) throw new Error('no unspent UTXOs')
      let tx
      try { tx = await zk.prepareWithdraw({ keys, account: acc, amount: units(P, b.amount), recipient: b.burnerAddress, flatFeeWei: P.flatFeeWei, feeRecipient: P.feeRecipient }) }
      catch (e) { throw friendly(e, P) }
      const r = await relay(P, tx, 'swap-private')
      if (!r.success) throw new Error('withdraw to burner failed')
      return {
        success: true, step: 'withdrawn_to_burner', txHash: r.txHash, burnerAddress: b.burnerAddress, originToken: P.symbol,
        originIsNative: !!P.isNative, burnerReceives: fmt(P, tx.receives), burnerReceivesEth: P.isNative ? fmt(P, tx.receives) : undefined,
        gasReserveEth: String(b.gasBuffer || '0.00005'), needsGasTopup: !P.isNative, fee: fmt(P, tx.fee),
      }
    },
  }

  return {
    handles: (path) => LOCAL_PATHS.has(path),
    async handle(path, body) {
      const h = handlers[path]
      if (!h) throw new Error(`no local handler for ${path}`)
      if (!body || !body.signature) throw new Error('missing signature')
      return h(body)
    },
    /** Forget every key derived in this session. */
    forget() { mem.keys.clear(); mem.pending.clear() },
  }
}

module.exports = { createLocalApi, LOCAL_PATHS, registryAuthSig, REGISTRY_AUTH_MESSAGE }
