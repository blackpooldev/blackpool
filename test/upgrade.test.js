import { expect } from 'chai'
import { network } from 'hardhat'
import { MERKLE_TREE_HEIGHT, deploy, deployHasher, deployPoolProxy } from './helpers.js'

const { ethers, networkHelpers } = await network.create()
const { loadFixture } = networkHelpers

const MAXIMUM_DEPOSIT_AMOUNT = ethers.parseEther('1')
const MINIMUM_AMOUNT = ethers.parseEther('0.0005')

// UUPS proxy deployed directly (ERC1967Proxy + initialize calldata); upgrades go through upgradeToAndCall,
// exactly what an admin (or the admin Safe) sends on a live chain. Storage-layout compatibility is checked
// separately with @openzeppelin/upgrades-core against the build-info.
describe('BlackpoolEtherPool Upgrades', function () {
  async function fixture() {
    const [sender, , admin] = await ethers.getSigners()
    const verifier2 = await deploy(ethers, 'Verifier2')
    const hasher = await deployHasher(ethers)
    const { pool: etherPool } = await deployPoolProxy(
      ethers,
      'BlackpoolEtherPool',
      [await verifier2.getAddress(), MERKLE_TREE_HEIGHT, await hasher.getAddress()],
      [MAXIMUM_DEPOSIT_AMOUNT, MINIMUM_AMOUNT, admin.address],
    )
    return { etherPool, verifier2, hasher, admin, sender }
  }

  async function deployV2({ verifier2, hasher }, signer) {
    const V2 = await ethers.getContractFactory('BlackpoolEtherPoolV2Mock', signer)
    const impl = await V2.deploy(await verifier2.getAddress(), MERKLE_TREE_HEIGHT, await hasher.getAddress())
    await impl.waitForDeployment()
    return { V2, impl }
  }

  async function upgradeTo(etherPool, signer, f, v2Arg) {
    const { V2, impl } = await deployV2(f, signer)
    await etherPool.connect(signer).upgradeToAndCall(await impl.getAddress(), V2.interface.encodeFunctionData('initializeV2', [v2Arg]))
    return V2.attach(await etherPool.getAddress())
  }

  describe('deployProxy', () => {
    it('should deploy behind an ERC1967 proxy and initialize correctly', async () => {
      const { etherPool, admin } = await loadFixture(fixture)
      expect(await etherPool.admin()).to.equal(admin.address)
      expect(await etherPool.maximumDepositAmount()).to.equal(MAXIMUM_DEPOSIT_AMOUNT)
    })

    it('should have correct merkle tree initial state', async () => {
      const { etherPool } = await loadFixture(fixture)
      expect(await etherPool.nextIndex()).to.equal(0n)
      expect(await etherPool.currentRootIndex()).to.equal(0n)
      const root = await etherPool.getLastRoot()
      expect(root).to.not.equal(ethers.ZeroHash)
    })

    it('should not allow re-initialization', async () => {
      const { etherPool, admin } = await loadFixture(fixture)
      await expect(
        etherPool.initialize(MAXIMUM_DEPOSIT_AMOUNT, MINIMUM_AMOUNT, admin.address),
      ).to.revert(ethers)
    })
  })

  describe('upgradeProxy', () => {
    it('should upgrade and preserve storage', async () => {
      const f = await loadFixture(fixture)
      const { etherPool, admin } = f

      const newLimit = ethers.parseEther('5')
      await etherPool.connect(admin).configureMaximumDepositAmount(newLimit)
      expect(await etherPool.maximumDepositAmount()).to.equal(newLimit)

      const upgraded = await upgradeTo(etherPool, admin, f, 42)

      expect(await upgraded.admin()).to.equal(admin.address)
      expect(await upgraded.maximumDepositAmount()).to.equal(newLimit)
      expect(await upgraded.version()).to.equal(2n)
      expect(await upgraded.newVariable()).to.equal(42n)

      const root = await upgraded.getLastRoot()
      expect(root).to.not.equal(ethers.ZeroHash)
    })

    it('should reject upgrade from non-admin', async () => {
      const f = await loadFixture(fixture)
      const { etherPool, sender } = f
      const { impl } = await deployV2(f)

      await expect(
        etherPool.connect(sender).upgradeToAndCall(await impl.getAddress(), '0x'),
      ).to.be.revertedWith('only admin')
    })

    it('should allow admin to upgrade after admin transfer', async () => {
      const f = await loadFixture(fixture)
      const { etherPool, admin, sender } = f

      await etherPool.connect(admin).transferAdmin(sender.address)
      await etherPool.connect(sender).claimAdmin()
      expect(await etherPool.admin()).to.equal(sender.address)

      const upgraded = await upgradeTo(etherPool, sender, f, 99)

      expect(await upgraded.admin()).to.equal(sender.address)
      expect(await upgraded.version()).to.equal(2n)
    })

    it('old admin cannot upgrade after admin transfer', async () => {
      const f = await loadFixture(fixture)
      const { etherPool, admin, sender } = f
      await etherPool.connect(admin).transferAdmin(sender.address)
      await etherPool.connect(sender).claimAdmin()
      const { impl } = await deployV2(f)
      await expect(
        etherPool.connect(admin).upgradeToAndCall(await impl.getAddress(), '0x'),
      ).to.be.revertedWith('only admin')
    })
  })
})
