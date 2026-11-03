// Shared helpers for the Hardhat 3 deploy and upgrade scripts (ESM).
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)

export const TREE_HEIGHT = 26

/** Poseidon(2) hasher bytecode, generated exactly as for the live pools (circomlibjs). */
export function hasherFactory(ethers, signer) {
  const { poseidonContract } = require('circomlibjs')
  return new ethers.ContractFactory(poseidonContract.generateABI(2), poseidonContract.createCode(2), signer)
}

/** ERC1967Proxy is compiled as a dependency, so Hardhat 3 keeps it in build-info only. */
export function proxyFactory(ethers, signer) {
  const dir = path.join(ROOT, 'artifacts', 'build-info')
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.output.json'))) {
    const { output } = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
    for (const [source, contracts] of Object.entries(output.contracts || {})) {
      if (source.endsWith('/proxy/ERC1967/ERC1967Proxy.sol') && contracts.ERC1967Proxy) {
        const c = contracts.ERC1967Proxy
        return new ethers.ContractFactory(c.abi, '0x' + c.evm.bytecode.object, signer)
      }
    }
  }
  throw new Error('ERC1967Proxy not found in artifacts/build-info; run `npx hardhat build` first')
}

/** Safe Transaction Builder batch (app.safe.global > Transaction Builder > drag and drop). */
export function writeSafeBatch({ chainId, safe, name, description, txs, file }) {
  const json = {
    version: '1.0',
    chainId: String(chainId),
    createdAt: Date.now(),
    meta: { name, description, createdFromSafeAddress: safe },
    transactions: txs.map((t) => ({ to: t.to, value: '0', data: t.data, contractMethod: null, contractInputsValues: null })),
  }
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n')
  return file
}

export function need(name) {
  const v = process.env[name]
  if (!v) throw new Error(`${name} is required`)
  return v
}
