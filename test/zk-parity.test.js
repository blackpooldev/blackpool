// Parity + proving test for cli/lib/zk.js against the original server implementation (src/*).
// Run from the repo root: node test/zk-parity.test.js
process.env.HARDHAT_NETWORK = process.env.HARDHAT_NETWORK || 'hardhat'
const assert = require('assert')
const fs = require('fs')
const { ethers } = require('ethers')
const { MerkleTree } = require('fixed-merkle-tree')
const snarkjs = require('snarkjs')
const zk = require('../cli/lib/zk')
const OldUtxo = require('../src/utxo')
const { deriveKeys: oldDerive } = require('../src/encryption')
const { poseidonHash2, getExtDataHash, toFixedHex } = require('../src/utils')

;(async () => {
  const wallet = ethers.Wallet.createRandom()
  const sig = await wallet.signMessage(zk.SIGN_IN_MESSAGE)
  const old = oldDerive(sig)
  const keys = await zk.deriveKeys(sig)
  assert.strictEqual(keys.pubkey, toFixedHex(old.keypair.pubkey), 'pubkey parity')
  console.log('ok  key derivation matches')

  // note parity + cross encryption
  const o = new OldUtxo({ amount: 123456789n.toString(), keypair: old.keypair, index: 7 })
  const n = new zk.Note({ amount: 123456789n, keypair: keys.keypair, blinding: BigInt(o.blinding.toString()), index: 7 })
  assert.strictEqual(zk.toHex(n.commitment()), toFixedHex(o.getCommitment()), 'commitment parity')
  assert.strictEqual(zk.toHex(n.nullifier()), toFixedHex(o.getNullifier()), 'nullifier parity')
  const encOld = o.encrypt(old.encryptionKey)
  const scanned = await zk.scanNotes({ keys, entries: [{ index: 7, commitment: toFixedHex(o.getCommitment()), encryptedOutput: encOld }], spent: new Set() })
  assert.strictEqual(scanned.length, 1); assert.strictEqual(scanned[0].amount, 123456789n)
  const encNew = await n.encrypt(keys.aesKey)
  const back = OldUtxo.decrypt(old.encryptionKey, encNew, 7, old.keypair)
  assert.strictEqual(back.amount.toString(), '123456789')
  const spentSet = new Set([zk.toHex(n.nullifier()).toLowerCase()])
  assert.strictEqual((await zk.scanNotes({ keys, entries: [{ index: 7, commitment: toFixedHex(o.getCommitment()), encryptedOutput: encOld }], spent: spentSet })).length, 0)
  console.log('ok  notes: commitment, nullifier, encryption both ways, spent filter')

  // tree parity
  const zero = zk.ZERO_LEAF.toString()
  for (const size of [0, 1, 2, 3, 17, 64, 129]) {
    const leaves = Array.from({ length: size }, () => toFixedHex(ethers.BigNumber.from(ethers.utils.randomBytes(31))))
    const t = new MerkleTree(26, leaves, { hashFunction: poseidonHash2, zeroElement: zero })
    const mine = zk.buildTree(leaves)
    assert.strictEqual(zk.toHex(mine.root), toFixedHex(t.root), `root parity size ${size}`)
    for (const i of [0, size - 1, Math.floor(size / 2)].filter((x) => x >= 0 && x < size)) {
      const a = t.path(i).pathElements.map((e) => toFixedHex(e))
      const b = mine.path(i).map((e) => zk.toHex(e))
      assert.deepStrictEqual(b, a, `path parity size ${size} leaf ${i}`)
    }
  }
  console.log('ok  Merkle roots and paths match fixed-merkle-tree (sizes 0..129)')

  // extDataHash parity
  const ext = { recipient: wallet.address, extAmount: zk.toHex(-5000n), feeRecipient: wallet.address, fee: zk.toHex(77n), encryptedOutput1: encOld, encryptedOutput2: encNew }
  assert.strictEqual(zk.toHex(zk.extDataHash(ext)), toFixedHex(getExtDataHash(ext)), 'extDataHash parity')
  console.log('ok  extDataHash matches')

  // full flow: deposit into a tree with existing leaves, then withdraw the new note, prove + verify both
  const wasm = fs.readFileSync('build/circuits/transaction2.wasm')
  const zkey = fs.readFileSync('build/circuits/transaction2.zkey')
  const vkey = await snarkjs.zKey.exportVerificationKey(zkey)
  const leaves = Array.from({ length: 40 }, () => toFixedHex(ethers.BigNumber.from(ethers.utils.randomBytes(31))))
  let account = { tree: zk.buildTree(leaves), notes: [], balance: 0n }
  const dep = await zk.prepareDeposit({ keys, account, amount: 10n ** 16n, depositor: wallet.address, feeRecipient: wallet.address })
  let t0 = Date.now()
  const p1 = await zk.prove(dep.circuitInput, { wasm, zkey, snarkjs })
  const tDep = Date.now() - t0
  const pub = (pi) => [pi.root, pi.publicAmount, pi.extDataHash, ...pi.inputNullifiers, ...pi.outputCommitments]
  const { publicSignals: ps1 } = await snarkjs.groth16.fullProve(dep.circuitInput, wasm, zkey)
  assert.deepStrictEqual(ps1.map((x) => zk.toHex(BigInt(x))), pub(dep.publicArgs), 'public signals = publicArgs')
  // verify our proof object against the same signals (convert back to snarkjs layout)
  const toSnark = (p) => ({ pi_a: [BigInt(p.pA[0]).toString(), BigInt(p.pA[1]).toString(), '1'], pi_b: [[BigInt(p.pB[0][1]).toString(), BigInt(p.pB[0][0]).toString()], [BigInt(p.pB[1][1]).toString(), BigInt(p.pB[1][0]).toString()], ['1', '0']], pi_c: [BigInt(p.pC[0]).toString(), BigInt(p.pC[1]).toString(), '1'], protocol: 'groth16', curve: 'bn128' })
  assert.ok(await snarkjs.groth16.verify(vkey, ps1, toSnark(p1)), 'deposit proof verifies')
  console.log(`ok  deposit proof verifies (${tDep} ms)`)

  // the deposit landed: its first output is now leaf 40
  const out = dep.publicArgs.outputCommitments
  const entries = leaves.map((c, i) => ({ index: i, commitment: c, encryptedOutput: '0x00' }))
  entries.push({ index: 40, commitment: out[0], encryptedOutput: dep.extData.encryptedOutput1 })
  entries.push({ index: 41, commitment: out[1], encryptedOutput: dep.extData.encryptedOutput2 })
  account = await zk.loadAccount({ keys, poolData: { root: zk.toHex(zk.buildTree(entries.map((e) => e.commitment)).root), entries, nullifiers: [] } })
  assert.strictEqual(account.balance, 10n ** 16n, 'balance after deposit')
  const flat = ethers.utils.parseEther('0.00015').toString()
  const wd = await zk.prepareWithdraw({ keys, account, amount: 4n * 10n ** 15n, recipient: wallet.address, flatFeeWei: flat, feeRecipient: wallet.address })
  t0 = Date.now()
  const p2 = await zk.prove(wd.circuitInput, { wasm, zkey, snarkjs })
  const tWd = Date.now() - t0
  const { publicSignals: ps2 } = await snarkjs.groth16.fullProve(wd.circuitInput, wasm, zkey)
  assert.deepStrictEqual(ps2.map((x) => zk.toHex(BigInt(x))), pub(wd.publicArgs))
  assert.ok(await snarkjs.groth16.verify(vkey, ps2, toSnark(p2)), 'withdraw proof verifies')
  assert.strictEqual(wd.change, 6n * 10n ** 15n)
  console.log(`ok  withdraw proof verifies (${tWd} ms), fee ${wd.fee}, change ${wd.change}`)
  t0 = Date.now()
  await zk.prove(wd.circuitInput, { wasm, zkey, snarkjs, singleThread: true })
  console.log(`ok  single-thread proof ${Date.now() - t0} ms`)
  process.exit(0)
})().catch((e) => { console.error('FAIL', e); process.exit(1) })
