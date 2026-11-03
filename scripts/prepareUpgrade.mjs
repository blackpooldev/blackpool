// Prepare a pool upgrade for the Safe: deploy a new implementation with the SAME constructor arguments as the
// live one (read from its immutables), then write a Safe Transaction Builder file that calls
// upgradeToAndCall(newImplementation, 0x) on the proxy. Nothing changes on-chain until the Safe signs.
//
//   PROXY=0x…  POOL_CONTRACT=contracts/base/BlackpoolEtherPool.sol:BlackpoolEtherPool \
//   DEPLOYER_KEY=0x…  npx hardhat run --network base scripts/prepareUpgrade.mjs
//
// Before running: `npm run compile && npm test`, and check storage compatibility of the new contract against the
// one live today (see README "Upgrades").
import path from 'node:path'
import { network } from 'hardhat'
import { ROOT, writeSafeBatch, need } from './evmLib.mjs'

const IMPL_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc'
const { ethers, networkName } = await network.create()
const [deployer] = await ethers.getSigners()
const { chainId } = await ethers.provider.getNetwork()
const proxy = ethers.getAddress(need('PROXY'))
const contract = need('POOL_CONTRACT')

const Pool = await ethers.getContractFactory(contract)
const live = Pool.attach(proxy)
const currentImpl = ethers.getAddress('0x' + (await ethers.provider.getStorage(proxy, IMPL_SLOT)).slice(26))
const admin = await live.admin()
const readImm = async (fn) => { try { return await live[fn]() } catch { return null } }
const [verifier, levels, hasher, token] = await Promise.all([readImm('verifier2'), readImm('levels'), readImm('hasher'), readImm('token')])
if (!verifier || levels == null || !hasher) throw new Error('could not read verifier2/levels/hasher from the live pool')
const ctorArgs = [verifier, Number(levels), hasher, ...(token ? [token] : [])]
console.log(`chain ${chainId} proxy ${proxy}\n  current implementation ${currentImpl}\n  admin ${admin}\n  constructor args ${JSON.stringify(ctorArgs)}`)

const impl = await Pool.deploy(...ctorArgs)
await impl.waitForDeployment()
const newImpl = await impl.getAddress()
console.log(`  new implementation ${newImpl}`)

const file = writeSafeBatch({
  chainId: Number(chainId), safe: admin, file: path.join(ROOT, 'deploy', 'safe', `${networkName}-upgrade-${proxy.slice(2, 10)}.json`),
  name: `Blackpool: upgrade pool ${proxy.slice(0, 10)}…`,
  description: `upgradeToAndCall(${newImpl}, 0x) on ${proxy}; previous implementation ${currentImpl}`,
  txs: [{ to: proxy, data: Pool.interface.encodeFunctionData('upgradeToAndCall', [newImpl, '0x']) }],
})
console.log(`Safe batch written: ${path.relative(ROOT, file)}\nVerify first: npx hardhat verify --network ${networkName} ${newImpl} ${ctorArgs.join(' ')}`)
