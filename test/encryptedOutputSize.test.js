import { expect } from 'chai'
import { network } from 'hardhat'
import { MERKLE_TREE_HEIGHT, deploy, deployHasher, deployPoolProxy, dummyProof as dp, dummyExtData as de } from './helpers.js'

const { ethers, networkHelpers } = await network.create()
const { loadFixture } = networkHelpers

const MAXIMUM_DEPOSIT_AMOUNT = ethers.parseEther('1')
const MINIMUM_AMOUNT = ethers.parseEther('0.0005')
const dummyProof = () => dp(ethers)
const dummyExtData = (o) => de(ethers, o)

describe('Encrypted output size limit', function () {
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
    return { etherPool, sender, admin }
  }

  it('MAX_ENCRYPTED_OUTPUT_SIZE is 256', async function () {
    const { etherPool } = await loadFixture(fixture)
    expect(await etherPool.MAX_ENCRYPTED_OUTPUT_SIZE()).to.equal(256n)
  })

  it('rejects encryptedOutput1 exceeding MAX_ENCRYPTED_OUTPUT_SIZE', async function () {
    const { etherPool } = await loadFixture(fixture)
    const oversized = '0x' + 'aa'.repeat(257)

    await expect(
      etherPool.transact(dummyProof(), dummyExtData({ encryptedOutput1: oversized }), { gasLimit: 1e6 }),
    ).to.be.revertedWith('Encrypted output too large')
  })

  it('rejects encryptedOutput2 exceeding MAX_ENCRYPTED_OUTPUT_SIZE', async function () {
    const { etherPool } = await loadFixture(fixture)
    const oversized = '0x' + 'bb'.repeat(257)

    await expect(
      etherPool.transact(dummyProof(), dummyExtData({ encryptedOutput2: oversized }), { gasLimit: 1e6 }),
    ).to.be.revertedWith('Encrypted output too large')
  })

  it('rejects both outputs oversized', async function () {
    const { etherPool } = await loadFixture(fixture)
    const oversized = '0x' + 'cc'.repeat(300)

    await expect(
      etherPool.transact(
        dummyProof(),
        dummyExtData({ encryptedOutput1: oversized, encryptedOutput2: oversized }),
        { gasLimit: 1e6 },
      ),
    ).to.be.revertedWith('Encrypted output too large')
  })

  it('accepts encryptedOutput at exactly MAX_ENCRYPTED_OUTPUT_SIZE', async function () {
    const { etherPool } = await loadFixture(fixture)
    const exact = '0x' + 'dd'.repeat(256)

    // Passes the size check, then fails on the next validation (merkle root)
    await expect(
      etherPool.transact(dummyProof(), dummyExtData({ encryptedOutput1: exact, encryptedOutput2: exact }), { gasLimit: 1e6 }),
    ).to.be.revertedWith('Invalid merkle root')
  })

  it('accepts empty encryptedOutputs', async function () {
    const { etherPool } = await loadFixture(fixture)

    // Passes the size check, then fails on the next validation (merkle root)
    await expect(
      etherPool.transact(dummyProof(), dummyExtData(), { gasLimit: 1e6 }),
    ).to.be.revertedWith('Invalid merkle root')
  })

  it('rejects encryptedOutput1 at MAX + 1', async function () {
    const { etherPool } = await loadFixture(fixture)
    const justOver = '0x' + 'ee'.repeat(257)
    const exact = '0x' + 'ff'.repeat(256)

    await expect(
      etherPool.transact(dummyProof(), dummyExtData({ encryptedOutput1: justOver, encryptedOutput2: exact }), { gasLimit: 1e6 }),
    ).to.be.revertedWith('Encrypted output too large')
  })

  it('rejects encryptedOutput2 at MAX + 1 when output1 is valid', async function () {
    const { etherPool } = await loadFixture(fixture)
    const exact = '0x' + 'ff'.repeat(256)
    const justOver = '0x' + 'ee'.repeat(257)

    await expect(
      etherPool.transact(dummyProof(), dummyExtData({ encryptedOutput1: exact, encryptedOutput2: justOver }), { gasLimit: 1e6 }),
    ).to.be.revertedWith('Encrypted output too large')
  })
})
