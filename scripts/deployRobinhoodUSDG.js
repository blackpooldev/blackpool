// Deploy the BLACKPOOL-native USDG pool on Robinhood Chain (chain 4663).
// USDG = Robinhood's canonical stablecoin (6 decimals, verified on-chain).
// Uses the privacyblackpool-branded ERC pool variant (contracts/robinhood/BlackpoolERCPoolL2.sol).
//
// Run: npx hardhat run scripts/deployRobinhoodUSDG.js --network robinhood
const { ethers, upgrades } = require('hardhat')
const { utils } = ethers

const MERKLE_TREE_HEIGHT = 26

// USDG on Robinhood Chain (canonical stablecoin). Verified: 6 decimals, symbol "USDG".
const TOKEN_ADDRESS = '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168'.toLowerCase()
const TOKEN_DECIMALS = 6

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
  const network = await ethers.provider.getNetwork()
  console.log(`Network: chainId ${network.chainId} (expect 4663 = Robinhood)`)
  if (Number(network.chainId) !== 4663) {
    throw new Error(`Wrong network: got chainId ${network.chainId}, expected 4663. Use --network robinhood`)
  }
  console.log(`Deploying with account: ${deployer.address}`)
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
    `BlackpoolERCPoolL2 constructor args:\n${JSON.stringify(
      [verifier2.address, MERKLE_TREE_HEIGHT, hasher.address, TOKEN_ADDRESS],
      null,
      2,
    )}\n`,
  )

  const Pool = await ethers.getContractFactory('contracts/robinhood/BlackpoolERCPoolL2.sol:BlackpoolERCPoolL2')
  const pool = await upgrades.deployProxy(
    Pool,
    [MAXIMUM_DEPOSIT_AMOUNT, MINIMUM_AMOUNT, ADMIN_ADDRESS],
    {
      kind: 'uups',
      initializer: 'initialize',
      constructorArgs: [verifier2.address, MERKLE_TREE_HEIGHT, hasher.address, TOKEN_ADDRESS],
      unsafeAllow: ['state-variable-immutable', 'constructor'],
    },
  )
  await pool.deployed()

  let implAddress = 'unknown'
  try {
    implAddress = await upgrades.erc1967.getImplementationAddress(pool.address)
  } catch {}

  console.log('\n--- Robinhood USDG Pool Deployment ---')
  console.log(`Network:    Robinhood (chainId 4663)`)
  console.log(`Token:      ${TOKEN_ADDRESS} (USDG, ${TOKEN_DECIMALS} decimals)`)
  console.log(`Verifier2:  ${verifier2.address}`)
  console.log(`Hasher:     ${hasher.address}`)
  console.log(`ERCPool (proxy): ${pool.address}`)
  console.log(`ERCPool (impl):  ${implAddress}`)
  console.log(`Admin:      ${ADMIN_ADDRESS}`)
  console.log(`Tree zeros: privacyblackpool (zeros(0)=0x1edb91df...555e5bd6)`)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
