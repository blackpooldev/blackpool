// Deploy the BLACKPOOL-native BNB pool on BSC (chain 56).
// Native BNB (18 decimals, like ETH). Uses privacyblackpool-branded EtherPool variant
// (contracts/bsc/BlackpoolEtherPoolL2.sol). Zero touch to live Base/RH/Arbitrum.
//
// Run: npx hardhat run scripts/deployBscBNB.js --network bsc
//   requires PRIVATE_KEY in env (deployer, must hold BNB on BSC for gas)
const { ethers, upgrades } = require('hardhat')
const { utils } = ethers

const MERKLE_TREE_HEIGHT = 26
const MAXIMUM_DEPOSIT_AMOUNT = utils.parseEther('1000')   // 1000 BNB max deposit
const MINIMUM_AMOUNT = utils.parseEther('0.0005')         // 0.0005 BNB min (~$0.15)
// Admin/governance for the proxy. Same pattern as Arbitrum/Robinhood: single-key (deployer = admin = relayer).
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

  const Pool = await ethers.getContractFactory('contracts/bsc/BlackpoolEtherPoolL2.sol:BlackpoolEtherPoolL2')
  const pool = await upgrades.deployProxy(
    Pool,
    [MAXIMUM_DEPOSIT_AMOUNT, MINIMUM_AMOUNT, ADMIN_ADDRESS],
    {
      kind: 'uups',
      initializer: 'initialize',
      constructorArgs: [verifier2.address, MERKLE_TREE_HEIGHT, hasher.address],
      unsafeAllow: ['state-variable-immutable', 'constructor'],
    },
  )
  await pool.deployed()

  let implAddress = 'unknown'
  try {
    implAddress = await upgrades.erc1967.getImplementationAddress(pool.address)
  } catch {}

  const deployBlock = pool.deployTransaction?.blockNumber ?? (await ethers.provider.getBlockNumber())

  console.log('\n--- BSC BNB Pool Deployment ---')
  console.log(`Network:    BSC (chainId 56)`)
  console.log(`Token:      native BNB (18 decimals)`)
  console.log(`Verifier2:  ${verifier2.address}`)
  console.log(`Hasher:     ${hasher.address}`)
  console.log(`EtherPool (proxy): ${pool.address}`)
  console.log(`EtherPool (impl):  ${implAddress}`)
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
