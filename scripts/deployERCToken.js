// Deploy a BlackpoolERCPool for ONE ERC20 token (1 pool per token).
// Reuses the existing Verifier2 + Hasher (from the EtherPool deploy) to save gas.
// Usage:
//   TOKEN_ADDRESS=the token address TOKEN_DECIMALS=6 TOKEN_SYMBOL=USDC \
//   npx hardhat run scripts/deployERCToken.js --network base
// Other tokens: change TOKEN_ADDRESS/DECIMALS/SYMBOL — zero code changes.
const { ethers, upgrades } = require('hardhat')
const { utils } = ethers

const MERKLE_TREE_HEIGHT = 26

const TOKEN_ADDRESS = (process.env.TOKEN_ADDRESS || '').toLowerCase()
const TOKEN_DECIMALS = parseInt(process.env.TOKEN_DECIMALS || '6', 10)
const TOKEN_SYMBOL = process.env.TOKEN_SYMBOL || '?'

// Reuse the existing ones (verified on-chain from the chain's EtherPool deploy)
const VERIFIER2_ADDRESS = process.env.VERIFIER2_ADDRESS || (() => { throw new Error('VERIFIER2_ADDRESS env is required (reuse the chain\'s Verifier2 from deploy/ADDRESSES.md)') })()
const HASHER_ADDRESS = process.env.HASHER_ADDRESS || (() => { throw new Error('HASHER_ADDRESS env is required (reuse the chain\'s Hasher from deploy/ADDRESSES.md)') })()

const ADMIN_ADDRESS = process.env.ADMIN_ADDRESS || (() => { throw new Error('ADMIN_ADDRESS env is required (Blackpool admin / multisig)') })()

const MAXIMUM_DEPOSIT_AMOUNT = utils.parseUnits(process.env.MAXIMUM_DEPOSIT_AMOUNT || '1000000', TOKEN_DECIMALS)
const MINIMUM_AMOUNT = utils.parseUnits(process.env.MINIMUM_AMOUNT || '1', TOKEN_DECIMALS)

async function main() {
  if (!/^0x[a-f0-9]{40}$/.test(TOKEN_ADDRESS)) throw new Error('TOKEN_ADDRESS env required (0x...)')

  const [deployer] = await ethers.getSigners()
  console.log(`Deployer: ${deployer.address} | balance ${utils.formatEther(await deployer.getBalance())} ETH`)

  // sanity: the token really is an ERC20 on this chain
  const erc = new ethers.Contract(TOKEN_ADDRESS, ['function symbol() view returns(string)', 'function decimals() view returns(uint8)'], ethers.provider)
  const [sym, dec] = await Promise.all([erc.symbol(), erc.decimals()])
  console.log(`Token on-chain: ${sym} dec=${dec}`)
  if (Number(dec) !== TOKEN_DECIMALS) throw new Error(`TOKEN_DECIMALS mismatch: env=${TOKEN_DECIMALS} on-chain=${dec}`)
  if (TOKEN_SYMBOL !== '?' && sym.toUpperCase() !== TOKEN_SYMBOL.toUpperCase()) throw new Error(`TOKEN_SYMBOL mismatch: env=${TOKEN_SYMBOL} on-chain=${sym}`)

  console.log(`Reusing Verifier2 ${VERIFIER2_ADDRESS} + Hasher ${HASHER_ADDRESS}`)
  const BlackpoolERCPool = await ethers.getContractFactory('BlackpoolERCPool')
  const ercPool = await upgrades.deployProxy(
    BlackpoolERCPool,
    [MAXIMUM_DEPOSIT_AMOUNT, MINIMUM_AMOUNT, ADMIN_ADDRESS],
    {
      kind: 'uups',
      initializer: 'initialize',
      constructorArgs: [VERIFIER2_ADDRESS, MERKLE_TREE_HEIGHT, HASHER_ADDRESS, TOKEN_ADDRESS],
      unsafeAllow: ['state-variable-immutable', 'constructor'],
    },
  )
  await ercPool.deployed()

  let implAddress = 'unknown'
  try { implAddress = await upgrades.erc1967.getImplementationAddress(ercPool.address) } catch {}
  const network = await ethers.provider.getNetwork()
  const deployBlock = await ethers.provider.getBlockNumber()

  console.log('\n--- Deployment Summary ---')
  console.log(`Network:     ${network.name} (chainId: ${network.chainId})`)
  console.log(`Token:       ${sym} ${TOKEN_ADDRESS} (${TOKEN_DECIMALS}dp)`)
  console.log(`Pool proxy:  ${ercPool.address}`)
  console.log(`Pool impl:   ${implAddress}`)
  console.log(`Admin:       ${ADMIN_ADDRESS}`)
  console.log(`DeployBlock: ~${deployBlock}`)
  console.log(`\n.env.api entry:\n  ERC_POOL_${sym.toUpperCase()}=${ercPool.address}\n  ERC_POOL_${sym.toUpperCase()}_DEPLOY_BLOCK=${deployBlock}`)
}

main()
  .then(() => process.exit(0))
  .catch((error) => { console.error(error); process.exit(1) })
