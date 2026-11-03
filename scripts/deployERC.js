const { ethers, upgrades } = require('hardhat')
const { utils } = ethers

const MERKLE_TREE_HEIGHT = 26

/** Ethereum mainnet native USDT — see https://etherscan.io/token/0xdac17f958d2ee523a2206206994597c13d831ec7 */
const TOKEN_ADDRESS = '0xdac17f958d2ee523a2206206994597c13d831ec7'.toLowerCase()
const TOKEN_DECIMALS = parseInt(process.env.TOKEN_DECIMALS || '6', 10)

const MAXIMUM_DEPOSIT_AMOUNT = process.env.MAXIMUM_DEPOSIT_AMOUNT
  ? utils.parseUnits(process.env.MAXIMUM_DEPOSIT_AMOUNT, TOKEN_DECIMALS)
  : utils.parseUnits('1000000', TOKEN_DECIMALS)

const MINIMUM_AMOUNT = process.env.MINIMUM_AMOUNT
  ? utils.parseUnits(process.env.MINIMUM_AMOUNT, TOKEN_DECIMALS)
  : utils.parseUnits('1', TOKEN_DECIMALS)

const ADMIN_ADDRESS = process.env.ADMIN_ADDRESS || (() => { throw new Error('ADMIN_ADDRESS env is required (Blackpool admin / multisig)') })()

async function main() {
  require('./compileHasher')

  const [deployer] = await ethers.getSigners()
  console.log(`Deploying contracts with account: ${deployer.address}`)
  console.log(`Account balance: ${utils.formatEther(await deployer.getBalance())} ETH`)

  const Verifier2 = await ethers.getContractFactory('Verifier2')
  const verifier2 = await Verifier2.deploy()
  await verifier2.deployed()
  console.log(`Verifier2 deployed at: ${verifier2.address}`)

  const Hasher = await ethers.getContractFactory('Hasher')
  const hasher = await Hasher.deploy()
  await hasher.deployed()
  console.log(`Hasher deployed at: ${hasher.address}`)

  console.log(
    `BlackpoolERCPool constructor args:\n${JSON.stringify(
      [verifier2.address, MERKLE_TREE_HEIGHT, hasher.address, TOKEN_ADDRESS],
      null,
      2,
    )}\n`,
  )

  const BlackpoolERCPool = await ethers.getContractFactory('BlackpoolERCPool')
  const ercPool = await upgrades.deployProxy(
    BlackpoolERCPool,
    [MAXIMUM_DEPOSIT_AMOUNT, MINIMUM_AMOUNT, ADMIN_ADDRESS],
    {
      kind: 'uups',
      initializer: 'initialize',
      constructorArgs: [verifier2.address, MERKLE_TREE_HEIGHT, hasher.address, TOKEN_ADDRESS],
      unsafeAllow: ['state-variable-immutable', 'constructor'],
    },
  )
  await ercPool.deployed()
  console.log(`BlackpoolERCPool proxy deployed at: ${ercPool.address}`)
  console.log(
    `BlackpoolERCPool token: ${TOKEN_ADDRESS} (${TOKEN_DECIMALS} decimals); max deposit: ${utils.formatUnits(
      MAXIMUM_DEPOSIT_AMOUNT,
      TOKEN_DECIMALS,
    )} units; min amount: ${utils.formatUnits(MINIMUM_AMOUNT, TOKEN_DECIMALS)} units`,
  )

  let implAddress = 'unknown'
  try {
    implAddress = await upgrades.erc1967.getImplementationAddress(ercPool.address)
  } catch {
    // On live networks the ERC-1967 slot may not be readable immediately after deployment
  }
  const network = await ethers.provider.getNetwork()
  console.log('\n--- Deployment Summary ---')
  console.log(`Network:    ${network.name} (chainId: ${network.chainId})`)
  console.log(`Token:      ${TOKEN_ADDRESS}`)
  console.log(`Verifier2:  ${verifier2.address}`)
  console.log(`Hasher:     ${hasher.address}`)
  console.log(`BlackpoolERCPool (proxy):  ${ercPool.address}`)
  console.log(`BlackpoolERCPool (impl):   ${implAddress}`)
  console.log(`Admin:      ${ADMIN_ADDRESS}`)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
