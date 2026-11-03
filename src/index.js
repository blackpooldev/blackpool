/* eslint-disable no-console */
const { ethers } = require('ethers5')
const { BigNumber } = ethers
const { toFixedHex, poseidonHash2, getExtDataHash, FIELD_SIZE } = require('./utils')
const Utxo = require('./utxo')

const { prove } = require('./prover')

async function getProof({
  inputs,
  outputs,
  extAmount,
  fee,
  recipient,
  feeRecipient,
  encryptionKey,
  pool = 'eth',
  chain = 'base',
}) {
  let inputMerklePathIndices = []
  let inputMerklePathElements = []
  // fetch /merkle/root from indexer url (chain defaults to base for pre-multi-chain callers)
  const res = await fetch(`${process.env.INDEXER_URL}/merkle/root?pool=${pool}&chain=${chain}`)
  if (!res.ok) {
    throw new Error(`Failed to fetch merkle root: ${res.status} ${res.statusText}`)
  }
  const { root, nextIndex: initialNextIndex } = await res.json()
  let nextIndex = initialNextIndex
  for (const input of inputs) {
    if (input.amount.gt(0)) {
      // fetch commitment info by post method
      // return status must be 200, otherwise throw error
      let res = await fetch(`${process.env.INDEXER_URL}/commitment/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          commitment: toFixedHex(input.getCommitment()),
          pool,
          chain,
        }),
      })
      if (!res.ok) {
        throw new Error(`Failed to fetch commitment info`)
      }
      const { index, pathElements } = await res.json()
      input.index = index
      if (input.index < 0) {
        throw new Error(`Input commitment ${toFixedHex(input.getCommitment())} was not found`)
      }
      inputMerklePathIndices.push(input.index)
      inputMerklePathElements.push(pathElements)
    } else {
      inputMerklePathIndices.push(0)
      inputMerklePathElements.push(new Array(26).fill(0))
    }
  }

  // update nextIndex to outputs
  for (let output of outputs) {
    output.index = nextIndex++
  }

  const extData = {
    recipient: toFixedHex(recipient, 20),
    extAmount: toFixedHex(extAmount),
    feeRecipient: toFixedHex(feeRecipient, 20),
    fee: toFixedHex(fee),
    encryptedOutput1: outputs[0].encrypt(encryptionKey),
    encryptedOutput2: outputs[1].encrypt(encryptionKey),
  }

  const extDataHash = getExtDataHash(extData)
  let input = {
    root,
    inputNullifier: inputs.map((x) => x.getNullifier().toString()),
    outputCommitment: outputs.map((x) => x.getCommitment().toString()),
    publicAmount: BigNumber.from(extAmount).sub(fee).add(FIELD_SIZE).mod(FIELD_SIZE).toString(),
    extDataHash: extDataHash.toString(),
    mintAddress: inputs[0].mintAddress.toString(),

    // data for 2 transaction inputs
    inAmount: inputs.map((x) => x.amount.toString()),
    inPrivateKey: inputs.map((x) => x.keypair.privkey.toString()),
    inBlinding: inputs.map((x) => x.blinding.toString()),
    inPathIndices: inputMerklePathIndices,
    inPathElements: inputMerklePathElements,

    // data for 2 transaction outputs
    outAmount: outputs.map((x) => x.amount.toString()),
    outBlinding: outputs.map((x) => x.blinding.toString()),
    outPubkey: outputs.map((x) => x.keypair.pubkey.toString()),
  }

  const { pA, pB, pC } = await prove(input, `./build/circuits/transaction${inputs.length}`)

  const args = {
    pA,
    pB,
    pC,
    root: toFixedHex(input.root),
    inputNullifiers: inputs.map((x) => toFixedHex(x.getNullifier())),
    outputCommitments: outputs.map((x) => toFixedHex(x.getCommitment())),
    publicAmount: toFixedHex(input.publicAmount),
    extDataHash: toFixedHex(extDataHash),
  }

  return {
    extData,
    args,
  }
}

async function prepareTransaction({
  etherPool,
  inputs = [],
  outputs = [],
  fee = 0,
  recipient = 0,
  feeRecipient = 0,
  fromBlock = 0,
  encryptionKey,
  pool = 'eth',
  chain = 'base',
}) {
  if (inputs.length > 2 || outputs.length > 2) {
    throw new Error('Incorrect inputs/outputs count')
  }
  while (inputs.length < 2) {
    inputs.push(new Utxo())
  }
  while (outputs.length < 2) {
    outputs.push(new Utxo())
  }

  let extAmount = BigNumber.from(fee)
    .add(outputs.reduce((sum, x) => sum.add(x.amount), BigNumber.from(0)))
    .sub(inputs.reduce((sum, x) => sum.add(x.amount), BigNumber.from(0)))

  const { args, extData } = await getProof({
    inputs,
    outputs,
    extAmount,
    fee,
    recipient,
    feeRecipient,
    encryptionKey,
    pool,
    chain,
  })

  return {
    args,
    extData,
  }
}

async function transaction({ etherPool, ...rest }) {
  const { args, extData } = await prepareTransaction({
    etherPool,
    ...rest,
  })

  const overrides = { gasLimit: 3000000 }
  const extAmount = BigNumber.from(extData.extAmount)
  if (extAmount.gt(0)) {
    overrides.value = extAmount
  }

  const receipt = await etherPool.transact(args, extData, overrides)
  return await receipt.wait()
}

/**
 * Scan all utxos from relayer and try to decrypt each encrypted output.
 * Successfully decrypted outputs belong to the user. Returns unspent UTXOs.
 *
 * PERF: decrypting EVERY encrypted output on every call is O(all
 * notes) and dominated prepare latency (30s+). Instead we cache, per user (keyed by encryptionKey),
 * the set of encrypted outputs we've ALREADY decrypted as "ours" plus how far we've scanned, and on
 * each call only attempt to decrypt the NEW outputs the indexer has added since. isSpent is then a
 * single parallel batch over only the user's own (few) notes.
 */
const _utxoScanCache = new Map() // encKeyHex -> { scanned: number, mine: Array<{index, encryptedOutput}> }

async function findUnspentUtxos({ etherPool, encryptionKey, keypair, fromBlock = 0, pool = 'eth', chain = 'base' }) {
  const _tf = Date.now()
  // Validate the indexer response before using it. Previously an error body (or an HTML 502 page)
  // was passed straight into the loop below: `allEncrypted.length` came back undefined, the scan
  // silently did nothing, and the caller reported a 0 balance as if the wallet were empty. A user
  // whose deposit is unindexed must see an ERROR, never a confident zero.
  const idxUrl = `${process.env.INDEXER_URL}/all_encrypted?pool=${pool}&chain=${chain}`
  let res
  try {
    res = await fetch(idxUrl, { signal: AbortSignal.timeout(Number(process.env.INDEXER_FETCH_TIMEOUT_MS || 30000)) })
  } catch (e) {
    throw new Error(`indexer unreachable for ${chain}:${pool} (${String(e.message || e).slice(0, 80)}) — balance unknown, not zero`)
  }
  if (!res.ok) throw new Error(`indexer HTTP ${res.status} for ${chain}:${pool} — balance unknown, not zero`)
  const allEncrypted = await res.json()
  if (!Array.isArray(allEncrypted)) {
    throw new Error(`indexer returned ${typeof allEncrypted} not array for ${chain}:${pool} — balance unknown, not zero`)
  }
  const _tfetch = Date.now()

  // cache key MUST include chain — otherwise base:eth and robinhood:eth (same pool name) collide
  // and one chain's UTXOs bleed into the other's balance/deposit flow.
  const cacheKey = `${chain}:${pool}:${(encryptionKey && encryptionKey.toString ? encryptionKey.toString('hex') : String(encryptionKey))}`
  const cached = _utxoScanCache.get(cacheKey) || { scanned: 0, mine: [] }
  // Only decrypt outputs we have not scanned before. The indexer returns append-only order, so
  // anything beyond `scanned` is new. (If the list ever shrinks/reorders, scanned>len resets below.)
  const startAt = allEncrypted.length >= cached.scanned ? cached.scanned : 0
  let newlyMine = 0
  for (let i = startAt; i < allEncrypted.length; i++) {
    const encrypted = allEncrypted[i]
    const { index, encryptedOutput } = encrypted
    try {
      const utxo = Utxo.decrypt(encryptionKey, encryptedOutput, Number(index), keypair)
      if (utxo.amount.isZero()) continue
      const commitment = toFixedHex(utxo.getCommitment())
      const onChainCommitment = toFixedHex(encrypted.commitment)
      if (commitment !== onChainCommitment) continue
      cached.mine.push({ index: Number(index), encryptedOutput })
      newlyMine++
    } catch { /* not ours */ }
  }
  cached.scanned = allEncrypted.length
  _utxoScanCache.set(cacheKey, cached)
  const _tdec = Date.now()

  // Rebuild Utxo objects for the user's notes, then batch ALL isSpent checks into ONE Multicall3
  // aggregate call (one batched call). This replaces N separate
  // RPC round-trips (which a rate-limited public RPC serialized to 20s+) with a single request.
  const mine = cached.mine.map(m => Utxo.decrypt(encryptionKey, m.encryptedOutput, m.index, keypair))
  let spentFlags
  try {
    spentFlags = await batchIsSpent(etherPool, mine)
  } catch {
    // fall back to parallel individual calls if multicall is unavailable
    spentFlags = await Promise.all(mine.map(u => etherPool.isSpent(toFixedHex(u.getNullifier())).catch(() => false)))
  }
  const unspent = mine.filter((_, i) => !spentFlags[i])
  console.log(`[findUnspent] fetch=${_tfetch-_tf}ms decryptNew(${allEncrypted.length-startAt}/+${newlyMine})=${_tdec-_tfetch}ms isSpent(${mine.length})=${Date.now()-_tdec}ms`)
  return unspent
}

// Batch N isSpent(nullifier) view calls into a single Multicall3.aggregate3 request.
const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11' // canonical, deployed on Base
async function batchIsSpent(etherPool, utxos) {
  if (utxos.length === 0) return []
  const provider = etherPool.provider
  const mc = new ethers.Contract(MULTICALL3, [
    'function aggregate3((address target,bool allowFailure,bytes callData)[] calls) view returns ((bool success,bytes returnData)[] returnData)'
  ], provider)
  const calls = utxos.map(u => ({
    target: etherPool.address,
    allowFailure: true,
    callData: etherPool.interface.encodeFunctionData('isSpent', [toFixedHex(u.getNullifier())]),
  }))
  const results = await mc.callStatic.aggregate3(calls)
  return results.map(r => {
    if (!r.success) return false
    try { return etherPool.interface.decodeFunctionResult('isSpent', r.returnData)[0] } catch { return false }
  })
}

module.exports = { transaction, prepareTransaction, findUnspentUtxos }
