import { expect } from 'chai'
import { network } from 'hardhat'
import { MERKLE_TREE_HEIGHT, deploy, deployHasher, deployPoolProxy, dummyProof as dp, dummyExtData as de } from './helpers.js'

const { ethers, networkHelpers } = await network.create()
const { loadFixture } = networkHelpers

const MAXIMUM_DEPOSIT_AMOUNT = ethers.parseEther('1')
const MINIMUM_AMOUNT = ethers.parseEther('0.0005')
const dummyProof = () => dp(ethers)
const dummyExtData = (o) => de(ethers, o)

describe('Minimum amount enforcement', function () {
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

  it('minimumAmount is initialized to 0.0005 ether', async function () {
    const { etherPool } = await loadFixture(fixture)
    expect(await etherPool.minimumAmount()).to.equal(MINIMUM_AMOUNT)
  })

  // --- Deposit checks ---

  it('rejects deposit below minimumAmount', async function () {
    const { etherPool } = await loadFixture(fixture)
    const dust = 1n

    await expect(
      etherPool.transact(
        dummyProof(),
        dummyExtData({ extAmount: dust }),
        { value: dust, gasLimit: 1e6 },
      ),
    ).to.be.revertedWith('Amount too small')
  })

  it('rejects deposit just below minimumAmount', async function () {
    const { etherPool } = await loadFixture(fixture)
    const justBelow = MINIMUM_AMOUNT - 1n

    await expect(
      etherPool.transact(
        dummyProof(),
        dummyExtData({ extAmount: justBelow }),
        { value: justBelow, gasLimit: 1e6 },
      ),
    ).to.be.revertedWith('Amount too small')
  })

  it('accepts deposit at exactly minimumAmount (passes to next check)', async function () {
    const { etherPool } = await loadFixture(fixture)

    await expect(
      etherPool.transact(
        dummyProof(),
        dummyExtData({ extAmount: MINIMUM_AMOUNT }),
        { value: MINIMUM_AMOUNT, gasLimit: 1e6 },
      ),
    ).to.be.revertedWith('Invalid merkle root')
  })

  it('deposit: fee is included in minimumAmount (extAmount covers fee)', async function () {
    const { etherPool } = await loadFixture(fixture)
    await expect(
      etherPool.transact(
        dummyProof(),
        dummyExtData({
          extAmount: MINIMUM_AMOUNT,
          fee: ethers.parseEther('0.0002'),
          feeRecipient: '0xDeaD00000000000000000000000000000000BEEf',
        }),
        { value: MINIMUM_AMOUNT, gasLimit: 1e6 },
      ),
    ).to.be.revertedWith('Invalid merkle root')
  })

  // --- Withdrawal checks ---

  it('rejects dust withdrawal (1 wei, no fee)', async function () {
    const { etherPool } = await loadFixture(fixture)

    await expect(
      etherPool.transact(
        dummyProof(),
        dummyExtData({
          extAmount: -1n,
          recipient: '0xDeaD00000000000000000000000000000000BEEf',
        }),
        { gasLimit: 1e6 },
      ),
    ).to.be.revertedWith('Amount too small')
  })

  it('rejects withdrawal just below minimumAmount (no fee)', async function () {
    const { etherPool } = await loadFixture(fixture)
    const justBelow = MINIMUM_AMOUNT - 1n

    await expect(
      etherPool.transact(
        dummyProof(),
        dummyExtData({
          extAmount: -justBelow,
          recipient: '0xDeaD00000000000000000000000000000000BEEf',
        }),
        { gasLimit: 1e6 },
      ),
    ).to.be.revertedWith('Amount too small')
  })

  it('accepts withdrawal at exactly minimumAmount (passes to next check)', async function () {
    const { etherPool } = await loadFixture(fixture)

    await expect(
      etherPool.transact(
        dummyProof(),
        dummyExtData({
          extAmount: -MINIMUM_AMOUNT,
          recipient: '0xDeaD00000000000000000000000000000000BEEf',
        }),
        { gasLimit: 1e6 },
      ),
    ).to.be.revertedWith('Invalid merkle root')
  })

  it('withdrawal: fee counts toward minimumAmount', async function () {
    const { etherPool } = await loadFixture(fixture)
    const halfMin = MINIMUM_AMOUNT / 2n

    await expect(
      etherPool.transact(
        dummyProof(),
        dummyExtData({
          extAmount: -halfMin,
          fee: halfMin,
          recipient: '0xDeaD00000000000000000000000000000000BEEf',
          feeRecipient: '0x000000000000000000000000000000000000dEaD',
        }),
        { gasLimit: 1e6 },
      ),
    ).to.be.revertedWith('Invalid merkle root')
  })

  it('withdrawal: fee alone does not satisfy minimumAmount when extAmount is dust', async function () {
    const { etherPool } = await loadFixture(fixture)

    await expect(
      etherPool.transact(
        dummyProof(),
        dummyExtData({
          extAmount: -1n,
          fee: MINIMUM_AMOUNT - 2n,
          recipient: '0xDeaD00000000000000000000000000000000BEEf',
          feeRecipient: '0x000000000000000000000000000000000000dEaD',
        }),
        { gasLimit: 1e6 },
      ),
    ).to.be.revertedWith('Amount too small')
  })

  // --- Admin configurability ---

  it('admin can update minimumAmount via configureMinimumAmount', async function () {
    const { etherPool, admin } = await loadFixture(fixture)
    const newMin = ethers.parseEther('0.01')

    await etherPool.connect(admin).configureMinimumAmount(newMin)
    expect(await etherPool.minimumAmount()).to.equal(newMin)
  })

  it('non-admin cannot update minimumAmount', async function () {
    const { etherPool, sender } = await loadFixture(fixture)

    await expect(
      etherPool.connect(sender).configureMinimumAmount(ethers.parseEther('0.01')),
    ).to.be.revertedWith('only admin')
  })

  it('updated minimumAmount is enforced on deposits', async function () {
    const { etherPool, admin } = await loadFixture(fixture)
    const newMin = ethers.parseEther('0.1')

    await etherPool.connect(admin).configureMinimumAmount(newMin)

    // 0.05 ETH was above old minimum but below the new one
    const amount = ethers.parseEther('0.05')
    await expect(
      etherPool.transact(
        dummyProof(),
        dummyExtData({ extAmount: amount }),
        { value: amount, gasLimit: 1e6 },
      ),
    ).to.be.revertedWith('Amount too small')

    // 0.1 ETH meets the new minimum
    await expect(
      etherPool.transact(
        dummyProof(),
        dummyExtData({ extAmount: newMin }),
        { value: newMin, gasLimit: 1e6 },
      ),
    ).to.be.revertedWith('Invalid merkle root')
  })

  it('admin can set minimumAmount to zero', async function () {
    const { etherPool, admin } = await loadFixture(fixture)

    await etherPool.connect(admin).configureMinimumAmount(0)
    expect(await etherPool.minimumAmount()).to.equal(0n)

    // 1 wei deposit should now pass the minimum check
    await expect(
      etherPool.transact(
        dummyProof(),
        dummyExtData({ extAmount: 1n }),
        { value: 1n, gasLimit: 1e6 },
      ),
    ).to.be.revertedWith('Invalid merkle root')
  })

  // --- Cross-validation ---

  it('rejects configureMinimumAmount exceeding current max', async function () {
    const { etherPool, admin } = await loadFixture(fixture)

    await expect(
      etherPool.connect(admin).configureMinimumAmount(MAXIMUM_DEPOSIT_AMOUNT + 1n),
    ).to.be.revertedWith('min exceeds max')
  })

  it('rejects configureMaximumDepositAmount below current min', async function () {
    const { etherPool, admin } = await loadFixture(fixture)

    // minimumAmount is 0.0005 ETH, try setting max below that
    await expect(
      etherPool.connect(admin).configureMaximumDepositAmount(MINIMUM_AMOUNT - 1n),
    ).to.be.revertedWith('min exceeds max')
  })

  it('allows setting max equal to min', async function () {
    const { etherPool, admin } = await loadFixture(fixture)

    await etherPool.connect(admin).configureMaximumDepositAmount(MINIMUM_AMOUNT)
    expect(await etherPool.maximumDepositAmount()).to.equal(MINIMUM_AMOUNT)
  })

  it('allows setting min equal to max', async function () {
    const { etherPool, admin } = await loadFixture(fixture)

    await etherPool.connect(admin).configureMinimumAmount(MAXIMUM_DEPOSIT_AMOUNT)
    expect(await etherPool.minimumAmount()).to.equal(MAXIMUM_DEPOSIT_AMOUNT)
  })

  it('to widen range: raise max first, then raise min', async function () {
    const { etherPool, admin } = await loadFixture(fixture)
    const newMax = ethers.parseEther('10')
    const newMin = ethers.parseEther('5')

    await etherPool.connect(admin).configureMaximumDepositAmount(newMax)
    await etherPool.connect(admin).configureMinimumAmount(newMin)

    expect(await etherPool.maximumDepositAmount()).to.equal(newMax)
    expect(await etherPool.minimumAmount()).to.equal(newMin)
  })

  it('to narrow range: lower min first, then lower max', async function () {
    const { etherPool, admin } = await loadFixture(fixture)
    const newMin = ethers.parseEther('0.0001')
    const newMax = ethers.parseEther('0.001')

    await etherPool.connect(admin).configureMinimumAmount(newMin)
    await etherPool.connect(admin).configureMaximumDepositAmount(newMax)

    expect(await etherPool.maximumDepositAmount()).to.equal(newMax)
    expect(await etherPool.minimumAmount()).to.equal(newMin)
  })
})
