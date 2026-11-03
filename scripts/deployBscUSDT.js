// Deploy the BLACKPOOL-native USDT pool on BSC (chain 56).
// USDT = Binance-Peg USDT on BSC (18 decimals — BSC stablecoins are 18 decimals, unlike ETH/Base/Arbitrum's 6).
// Address 0x55d398326f99059fF775485246999027B3197955.
// Uses the privacyblackpool-branded ERC pool variant (contracts/bsc/BlackpoolERCPoolL2.sol).
//
// Run: npx hardhat run scripts/deployBscUSDT.js --network bsc
const { ethers, upgrades } = require('hardhat')
const { utils } = ethers

const MERKLE_TREE_HEIGHT = 26

// Binance-Peg USDT on BSC. Verified on-chain: 18 decimals, symbol "USDT".
const TOKEN_ADDRESS = '0x55d398326f99059fF775485246999027B3197955'.toLowerCase()
const TOKEN_DECIMALS = 18

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
  console.log(`Network: chainId ${network.chainId} (expect 56 = BSC)`)
  if (Number(network.chainId) !== 56) {
    throw new Error(`Wrong network: got chainId ${network.chainId}, expected 56. Use --network bsc`)
  }
  console.log(`Deploying with account: ${deployer.address}`)
  console.log(`Account balance: ${utils.formatEther(await deployer.getBalance())} BNB`)

  const Verifier2 = await ethers.getContractFactory('Verifier2')
  const verifier2 = await Verifier2.deploy()
  await verifier2.deployed()
  console.log(`Verifier2 deployed at: ${verifier2.address}`)

  const Hasher = await ethers.getContractFactory('Hasher')
  const hasher = await Hasher.deploy()
  await hasher.deployed()
  console.log(`Hasher deployed at: ${hasher.address}`)

  const Pool = await ethers.getContractFactory('contracts/bsc/BlackpoolERCPoolL2.sol:BlackpoolERCPoolL2')
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

  const deployBlock = pool.deployTransaction?.blockNumber ?? (await ethers.provider.getBlockNumber())

  console.log('\n--- BSC USDT Pool Deployment ---')
  console.log(`Network:    BSC (chainId 56)`)
  console.log(`Token:      ${TOKEN_ADDRESS} (USDT, ${TOKEN_DECIMALS} decimals)`)
  console.log(`Verifier2:  ${verifier2.address}`)
  console.log(`Hasher:     ${hasher.address}`)
  console.log(`ERCPool (proxy): ${pool.address}`)
  console.log(`ERCPool (impl):  ${implAddress}`)
  console.log(`Admin:      ${ADMIN_ADDRESS}`)
  console.log(`DeployBlock: ${deployBlock}`)
  console.log(`Tree zeros: privacyblackpool (zeros(0)=0x1edb91df...555e5bd6)`)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
