// Deploy one Blackpool pool: Verifier2, Poseidon hasher, implementation and an ERC1967 (UUPS) proxy initialized
// with initialize(maximumDepositAmount, minimumAmount, admin).
//
//   POOL_CONTRACT=contracts/robinhood/BlackpoolERCPoolL2.sol:BlackpoolERCPoolL2 \
//   TOKEN=0x5fc5…  DECIMALS=6  MAX_DEPOSIT=1000000  MIN_AMOUNT=1  ADMIN_ADDRESS=0x<Safe> \
//   DEPLOYER_KEY=0x…  npx hardhat run --network robinhood scripts/deployPool.mjs
//
// Native pools: omit TOKEN (DECIMALS defaults to 18). ADMIN_ADDRESS should be the Safe; the pool has no other owner.
import { network } from 'hardhat'
import { TREE_HEIGHT, hasherFactory, proxyFactory, need } from './evmLib.mjs'

const { ethers } = await network.create()
const [deployer] = await ethers.getSigners()
const { chainId } = await ethers.provider.getNetwork()
const contract = need('POOL_CONTRACT')
const admin = ethers.getAddress(need('ADMIN_ADDRESS'))
const token = process.env.TOKEN ? ethers.getAddress(process.env.TOKEN) : null
const decimals = Number(process.env.DECIMALS || 18)
const maxDeposit = ethers.parseUnits(need('MAX_DEPOSIT'), decimals)
const minAmount = ethers.parseUnits(need('MIN_AMOUNT'), decimals)

console.log(`chain ${chainId}, deployer ${deployer.address}, balance ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))}`)
const verifier = await (await ethers.getContractFactory('Verifier2')).deploy()
await verifier.waitForDeployment()
const hasher = await hasherFactory(ethers, deployer).deploy()
await hasher.waitForDeployment()
const ctorArgs = [await verifier.getAddress(), TREE_HEIGHT, await hasher.getAddress(), ...(token ? [token] : [])]
const Pool = await ethers.getContractFactory(contract)
const impl = await Pool.deploy(...ctorArgs)
await impl.waitForDeployment()
const init = Pool.interface.encodeFunctionData('initialize', [maxDeposit, minAmount, admin])
const proxy = await proxyFactory(ethers, deployer).deploy(await impl.getAddress(), init)
await proxy.waitForDeployment()
const pool = Pool.attach(await proxy.getAddress())

console.log(JSON.stringify({
  chainId: Number(chainId), contract, proxy: await proxy.getAddress(), implementation: await impl.getAddress(),
  verifier2: ctorArgs[0], hasher: ctorArgs[2], token, admin: await pool.admin(), maxDeposit: maxDeposit.toString(),
  minimumAmount: minAmount.toString(), deployBlock: (await proxy.deploymentTransaction().wait()).blockNumber,
  constructorArgs: ctorArgs.map(String),
}, null, 2))
console.log('Next: verify the implementation (npx hardhat verify), add the pool to deploy/ADDRESSES.md and the API/indexer env.')
