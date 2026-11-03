// Sanity check for the simulation itself: a valid local proof must pass eth_call, a tampered one must revert.
// Usage: node scripts/zkSimCheck.js <chain> <pool> <from> <amount>
const fs = require('fs')
const { ethers } = require('ethers5')
const { createLocalApi } = require('../cli/lib/localApi')
const zk = require('../cli/lib/zk')
const API = process.env.API || 'https://api.blackpool.cash'
const RPC = { robinhood: 'https://rpc.mainnet.chain.robinhood.com', base: 'https://mainnet.base.org', arbitrum: 'https://arb1.arbitrum.io/rpc', bsc: 'https://bsc-dataseed.bnbchain.org' }
const [chain, pool, from, amount] = process.argv.slice(2)
const request = async (method, path, body) => { const r = await fetch(API + path, { method, headers: { 'Content-Type': 'application/json' }, body: method === 'GET' ? undefined : JSON.stringify(body) }); const j = await r.json(); if (!r.ok) throw new Error(j.error); return j }
;(async () => {
  const circuit = { wasm: fs.readFileSync('build/circuits/transaction2.wasm'), zkey: fs.readFileSync('build/circuits/transaction2.zkey') }
  const local = createLocalApi({ request, loadCircuit: async () => circuit })
  const sig = await ethers.Wallet.createRandom().signMessage(zk.SIGN_IN_MESSAGE)
  const dep = await local.handle('/api/deposit/prepare', { signature: sig, address: from, amount, chain, pool })
  const provider = new ethers.providers.StaticJsonRpcProvider(RPC[chain])
  const run = async (label, data) => {
    try { const r = await provider.call({ from, to: dep.to, data, value: ethers.BigNumber.from(dep.value) }); console.log(`${label}: SUCCESS (returned ${r.slice(0, 20)})`) }
    catch (e) { console.log(`${label}: REVERT ${String((e.error && e.error.message) || e.reason || e.message).slice(0, 90)}`) }
  }
  await run('valid proof   ', dep.data)
  const iface = new ethers.utils.Interface(zk.POOL_ABI)
  const d = iface.decodeFunctionData('transact', dep.data)
  const args = { ...d._args, pA: [d._args.pA[0].add(1), d._args.pA[1]] }
  await run('tampered proof', iface.encodeFunctionData('transact', [args, d._extData]))
  const code = await provider.getCode(dep.to)
  console.log('pool code bytes', (code.length - 2) / 2)
})().catch((e) => { console.error(e); process.exit(1) })
