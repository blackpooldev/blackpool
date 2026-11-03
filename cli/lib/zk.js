'use strict'
// Blackpool client-side zero-knowledge core.
//
// Runs unchanged in Node (the CLI and its MCP server) and in the browser (bundled into the web app's proving
// worker). Key derivation, note scanning, Merkle paths, coin selection and Groth16 proving all happen here, on
// the user's device. The relayer only ever receives a finished proof and its public data — never the sign-in
// signature, the keys or the notes. Nothing in this module writes to disk or to any browser storage: every
// secret lives in the caller's memory for as long as the caller keeps it.
const { utils: U, BigNumber } = require('ethers') // ethers v5 (CLI dependency; bundled for the browser)
const { poseidon1, poseidon2, poseidon3, poseidon4 } = require('poseidon-lite')

const FIELD_SIZE = 21888242871839275222246405745257275088548364400416034343698204186575808495617n
const TREE_HEIGHT = 26
// Merkle zeros(0) of every Blackpool pool: keccak256("privacyblackpool") % FIELD_SIZE.
const ZERO_LEAF = 13957331740549083428539157647087363326246483135047439495076507042642183216086n
const FEE_RATE_BPS = 35n // must match the relayer

const SIGN_IN_MESSAGE =
  'Welcome to Blackpool\n\nSign this message to access your private account.\n\n- Gas free: no transaction is sent\n- Your private account keys are derived from this signature\n- It cannot move funds from your wallet or approve spending\n- Only sign it on blackpool.cash or the Blackpool CLI'

const POOL_ABI = [
  'function transact((uint256[2] pA,uint256[2][2] pB,uint256[2] pC,bytes32 root,bytes32[2] inputNullifiers,bytes32[2] outputCommitments,uint256 publicAmount,bytes32 extDataHash) _args,(address recipient,int256 extAmount,address feeRecipient,uint256 fee,bytes encryptedOutput1,bytes encryptedOutput2) _extData) payable',
  'function isKnownRoot(bytes32) view returns (bool)',
]
const POOL_IFACE = new U.Interface(POOL_ABI)

// ---------- primitives ----------

function webcrypto() {
  if (globalThis.crypto && globalThis.crypto.subtle) return globalThis.crypto
  return require('crypto').webcrypto // Node 18
}

const big = (x) => (typeof x === 'bigint' ? x : BigInt(BigNumber.from(x).toString()))
const mod = (x) => ((x % FIELD_SIZE) + FIELD_SIZE) % FIELD_SIZE

function poseidon(items) {
  const f = [null, poseidon1, poseidon2, poseidon3, poseidon4][items.length]
  if (!f) throw new Error(`unsupported poseidon arity ${items.length}`)
  return f(items.map((x) => (typeof x === 'bigint' ? x : big(x))))
}

/** 0x-prefixed, zero-padded hex. Negative numbers become '-0x…' (how ethers v5 reads signed ints). */
function toHex(x, bytes = 32) {
  const v = big(x)
  const h = (v < 0n ? -v : v).toString(16).padStart(bytes * 2, '0')
  return (v < 0n ? '-0x' : '0x') + h
}

function randomField(nbytes = 31) {
  const b = new Uint8Array(nbytes)
  webcrypto().getRandomValues(b)
  return BigInt(U.hexlify(b))
}

function randomPrivkey() {
  const b = new Uint8Array(32)
  webcrypto().getRandomValues(b)
  return U.hexlify(b)
}

// ---------- keys ----------

class Keypair {
  constructor(privkey = randomPrivkey()) {
    this.privkey = privkey
    this.pubkey = poseidon([privkey])
  }
  sign(commitment, index) {
    return poseidon([this.privkey, commitment, index])
  }
}

/**
 * Keys of a private account, derived from the sign-in signature exactly as before:
 * encryptionKey = keccak256(signature), utxoPrivateKey = keccak256(encryptionKey).
 */
async function deriveKeys(signature) {
  if (!/^0x[0-9a-fA-F]{130}$/.test(String(signature))) throw new Error('invalid sign-in signature')
  const encKeyHex = U.keccak256(signature)
  const encKey = U.arrayify(encKeyHex)
  const keypair = new Keypair(U.keccak256(encKey))
  const aesKey = await webcrypto().subtle.importKey('raw', encKey, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
  return { keypair, aesKey, pubkey: toHex(keypair.pubkey) }
}

// AES-256-GCM in the format the pools have always used: IV(12) || tag(16) || ciphertext.
async function encrypt(aesKey, text) {
  const iv = new Uint8Array(12)
  webcrypto().getRandomValues(iv)
  const out = new Uint8Array(await webcrypto().subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, aesKey, new TextEncoder().encode(text)))
  const ct = out.slice(0, out.length - 16)
  const tag = out.slice(out.length - 16)
  return U.hexlify(U.concat([iv, tag, ct]))
}

async function decrypt(aesKey, hex) {
  const buf = U.arrayify(hex)
  if (buf.length < 29) throw new Error('ciphertext too short')
  const iv = buf.slice(0, 12)
  const tag = buf.slice(12, 28)
  const ct = buf.slice(28)
  const plain = await webcrypto().subtle.decrypt({ name: 'AES-GCM', iv, tagLength: 128 }, aesKey, U.concat([ct, tag]))
  return new TextDecoder().decode(plain)
}

// ---------- notes ----------

class Note {
  constructor({ amount = 0n, keypair = new Keypair(), blinding = randomField(), index = null, mint = 0n } = {}) {
    this.amount = big(amount)
    this.keypair = keypair
    this.blinding = big(blinding)
    this.index = index
    this.mint = big(mint)
  }
  commitment() {
    return poseidon([this.amount, this.keypair.pubkey, this.blinding, this.mint])
  }
  nullifier() {
    if (this.amount > 0n && this.index == null) throw new Error('nullifier needs the note index')
    const c = this.commitment()
    const i = BigInt(this.index || 0)
    return poseidon([c, i, this.keypair.sign(c, i)])
  }
  encrypt(aesKey) {
    return encrypt(aesKey, `${this.amount}|${this.blinding}|${this.index || 0}|${this.mint}`)
  }
}

/**
 * Find this account's unspent notes in a pool.
 * entries: [{ index, commitment, encryptedOutput }] (public, from the indexer)
 * spent:   Set of spent nullifiers as lowercase 0x-hex (public NewNullifier events)
 */
async function scanNotes({ keys, entries, spent }) {
  const mine = []
  for (const e of entries) {
    let parts
    try { parts = (await decrypt(keys.aesKey, e.encryptedOutput)).split('|') } catch { continue }
    if (parts.length !== 4) continue
    let note
    try {
      note = new Note({ amount: BigInt(parts[0]), blinding: BigInt(parts[1]), keypair: keys.keypair, index: Number(e.index), mint: BigInt(parts[3]) })
    } catch { continue }
    if (note.amount === 0n) continue
    if (toHex(note.commitment()) !== toHex(e.commitment)) continue
    if (spent && spent.has(toHex(note.nullifier()).toLowerCase())) continue
    mine.push(note)
  }
  return mine
}

// ---------- Merkle tree (height 26, Poseidon, Blackpool zero leaf) ----------

const ZEROS = (() => {
  const z = [ZERO_LEAF]
  for (let i = 1; i <= TREE_HEIGHT; i++) z.push(poseidon([z[i - 1], z[i - 1]]))
  return z
})()

/** Builds every non-empty layer once; path() is then O(height). leaves are in index order. */
function buildTree(leaves) {
  const layers = [leaves.map(big)]
  for (let level = 0; level < TREE_HEIGHT; level++) {
    const cur = layers[level]
    const next = []
    for (let i = 0; i < cur.length; i += 2) next.push(poseidon([cur[i], i + 1 < cur.length ? cur[i + 1] : ZEROS[level]]))
    layers.push(next)
  }
  const root = layers[TREE_HEIGHT].length ? layers[TREE_HEIGHT][0] : ZEROS[TREE_HEIGHT]
  return {
    root,
    size: leaves.length,
    path(index) {
      if (index < 0 || index >= leaves.length) throw new Error(`leaf ${index} not in tree`)
      const pathElements = []
      let idx = index
      for (let level = 0; level < TREE_HEIGHT; level++) {
        const sib = idx ^ 1
        pathElements.push(sib < layers[level].length ? layers[level][sib] : ZEROS[level])
        idx >>= 1
      }
      return pathElements
    },
  }
}

// ---------- fees and coin selection ----------

/** The relayer fee for spending `gross` out of the pool (same formula the relayer enforces). */
function relayFee(gross, flatFeeWei) {
  return big(flatFeeWei) + (big(gross) * FEE_RATE_BPS) / 10000n
}

/** The 2-in circuit can spend at most two notes; take the two largest. */
function pickInputs(notes, amount) {
  const sorted = [...notes].sort((a, b) => (a.amount < b.amount ? 1 : a.amount > b.amount ? -1 : 0))
  const inputs = sorted.slice(0, 2)
  const sum = inputs.reduce((s, n) => s + n.amount, 0n)
  const total = notes.reduce((s, n) => s + n.amount, 0n)
  if (sum < big(amount)) {
    const err = new Error(total >= big(amount)
      ? `max ${sum} per transaction (funds split across ${notes.length} notes; spend the rest separately)`
      : `insufficient balance: have ${sum}`)
    err.code = total >= big(amount) ? 'FRAGMENTED' : 'INSUFFICIENT'
    err.maxSpendable = sum
    throw err
  }
  return { inputs, sum }
}

// ---------- transaction building + proving ----------

function extDataHash(ext) {
  const enc = U.defaultAbiCoder.encode(
    ['tuple(address recipient,int256 extAmount,address feeRecipient,uint256 fee,bytes encryptedOutput1,bytes encryptedOutput2)'],
    [ext],
  )
  return mod(BigInt(U.keccak256(enc)))
}

/**
 * Builds the circuit input and the transaction's public data.
 * tree: buildTree() over the pool's current leaves. nextIndex = tree.size.
 */
async function buildTransaction({ keys, tree, inputs, outputs, fee = 0n, recipient, feeRecipient }) {
  if (inputs.length > 2 || outputs.length > 2) throw new Error('at most 2 inputs and 2 outputs')
  inputs = [...inputs]; outputs = [...outputs]
  while (inputs.length < 2) inputs.push(new Note())
  while (outputs.length < 2) outputs.push(new Note())
  fee = big(fee)
  const extAmount = fee + outputs.reduce((s, n) => s + n.amount, 0n) - inputs.reduce((s, n) => s + n.amount, 0n)

  const inPathIndices = []
  const inPathElements = []
  for (const n of inputs) {
    if (n.amount > 0n) {
      inPathIndices.push(n.index)
      inPathElements.push(tree.path(n.index).map(String))
    } else {
      inPathIndices.push(0)
      inPathElements.push(new Array(TREE_HEIGHT).fill('0'))
    }
  }
  let next = tree.size
  for (const o of outputs) o.index = next++

  const ext = {
    recipient: U.getAddress(toHex(big(recipient || 0), 20)),
    extAmount: toHex(extAmount),
    feeRecipient: U.getAddress(toHex(big(feeRecipient || 0), 20)),
    fee: toHex(fee),
    encryptedOutput1: await outputs[0].encrypt(keys.aesKey),
    encryptedOutput2: await outputs[1].encrypt(keys.aesKey),
  }
  const hash = extDataHash(ext)
  const publicAmount = mod(extAmount - fee)
  const nullifiers = inputs.map((n) => n.nullifier())
  const commitments = outputs.map((n) => n.commitment())

  const circuitInput = {
    root: tree.root.toString(),
    inputNullifier: nullifiers.map(String),
    outputCommitment: commitments.map(String),
    publicAmount: publicAmount.toString(),
    extDataHash: hash.toString(),
    mintAddress: inputs[0].mint.toString(),
    inAmount: inputs.map((n) => n.amount.toString()),
    inPrivateKey: inputs.map((n) => big(n.keypair.privkey).toString()),
    inBlinding: inputs.map((n) => n.blinding.toString()),
    inPathIndices,
    inPathElements,
    outAmount: outputs.map((n) => n.amount.toString()),
    outBlinding: outputs.map((n) => n.blinding.toString()),
    outPubkey: outputs.map((n) => n.keypair.pubkey.toString()),
  }
  const publicArgs = {
    root: toHex(tree.root),
    inputNullifiers: nullifiers.map((x) => toHex(x)),
    outputCommitments: commitments.map((x) => toHex(x)),
    publicAmount: toHex(publicAmount),
    extDataHash: toHex(hash),
  }
  return { circuitInput, publicArgs, extData: ext, extAmount }
}

/**
 * Groth16 proof with snarkjs. wasm/zkey: Uint8Array (or a path in Node). singleThread avoids nested workers.
 */
async function prove(circuitInput, { wasm, zkey, snarkjs, singleThread = false }) {
  const sj = snarkjs || require('snarkjs')
  const { proof } = await sj.groth16.fullProve(circuitInput, wasm, zkey, undefined, undefined, { singleThread })
  return {
    pA: [toHex(proof.pi_a[0]), toHex(proof.pi_a[1])],
    pB: [
      [toHex(proof.pi_b[0][1]), toHex(proof.pi_b[0][0])],
      [toHex(proof.pi_b[1][1]), toHex(proof.pi_b[1][0])],
    ],
    pC: [toHex(proof.pi_c[0]), toHex(proof.pi_c[1])],
  }
}

/** Calldata for a self-broadcast deposit (the user's wallet sends it; value = extAmount for native pools). */
function encodeTransact(args, extData) {
  return POOL_IFACE.encodeFunctionData('transact', [args, extData])
}

// ---------- high-level flows (pure: the caller supplies pool data and circuit files) ----------

/**
 * poolData: { root, entries, nullifiers } from GET /api/zk/pool. Rebuilds the tree locally and refuses to
 * continue if it does not reproduce the root the pool reported (stale or inconsistent indexer data).
 */
async function loadAccount({ keys, poolData }) {
  const entries = [...poolData.entries].sort((a, b) => a.index - b.index)
  entries.forEach((e, i) => { if (Number(e.index) !== i) throw new Error(`indexer data has a gap at leaf ${i}; retry in a few seconds`) })
  const tree = buildTree(entries.map((e) => e.commitment))
  if (poolData.root && toHex(tree.root).toLowerCase() !== String(poolData.root).toLowerCase()) {
    throw new Error('pool data is out of sync (root mismatch); retry in a few seconds')
  }
  const spent = new Set((poolData.nullifiers || []).map((n) => toHex(n).toLowerCase()))
  const notes = await scanNotes({ keys, entries, spent })
  const balance = notes.reduce((s, n) => s + n.amount, 0n)
  return { tree, notes, balance }
}

/** Shield `amount` (merging the oldest existing note so the balance stays in few notes). */
async function prepareDeposit({ keys, account, amount, depositor, feeRecipient }) {
  const inputs = account.notes.length ? [account.notes.slice().sort((a, b) => a.index - b.index)[0]] : []
  const inSum = inputs.reduce((s, n) => s + n.amount, 0n)
  const outputs = [new Note({ amount: inSum + big(amount), keypair: keys.keypair })]
  const tx = await buildTransaction({ keys, tree: account.tree, inputs, outputs, fee: 0n, recipient: depositor, feeRecipient })
  return { ...tx, newBalance: account.balance + big(amount) }
}

/** Spend `amount` (gross, before the relayer fee) to `recipient`; change stays private. */
async function prepareWithdraw({ keys, account, amount, recipient, flatFeeWei, feeRecipient }) {
  amount = big(amount)
  const fee = relayFee(amount, flatFeeWei)
  if (fee * 2n >= amount) {
    const err = new Error('amount must be more than twice the fee'); err.code = 'TOO_SMALL'; err.minimum = fee * 2n; throw err
  }
  const { inputs, sum } = pickInputs(account.notes, amount)
  const change = sum - amount
  const outputs = change > 0n ? [new Note({ amount: change, keypair: keys.keypair })] : []
  const tx = await buildTransaction({ keys, tree: account.tree, inputs, outputs, fee, recipient, feeRecipient })
  return { ...tx, fee, receives: amount - fee, change }
}

module.exports = {
  FIELD_SIZE, TREE_HEIGHT, ZERO_LEAF, ZEROS, FEE_RATE_BPS, SIGN_IN_MESSAGE, POOL_ABI,
  poseidon, toHex, Keypair, Note, deriveKeys, encrypt, decrypt, scanNotes, buildTree,
  relayFee, pickInputs, extDataHash, buildTransaction, prove, encodeTransact,
  loadAccount, prepareDeposit, prepareWithdraw,
}
