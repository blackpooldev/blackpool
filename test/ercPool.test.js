import { expect } from 'chai'
import { network } from 'hardhat'
import {
  MERKLE_TREE_HEIGHT, BigNumber, Utxo, toFixedHex, signIn, createEmptyTree, prepareTransaction,
  deploy, deployHasher, deployPoolProxy, dummyProof as dp, dummyExtData as de,
} from './helpers.js'

const { ethers, networkHelpers } = await network.create()
const { loadFixture } = networkHelpers

const MAXIMUM_DEPOSIT_AMOUNT = ethers.parseEther('1')
const MINIMUM_AMOUNT = ethers.parseEther('0.0005')

async function ercTransaction({ ercPool, token, tree, from, encryptionKey, ...rest }) {
  const { args, extData, outputs } = await prepareTransaction({ tree, encryptionKey, ...rest })
  const overrides = { gasLimit: 3000000 }
  const extAmount = BigNumber.from(extData.extAmount)
  const signer = from || (await ethers.getSigners())[0]

  if (extAmount.gt(0)) {
    await token.connect(signer).approve(await ercPool.getAddress(), extAmount.toBigInt())
  }

  const receipt = await ercPool.connect(signer).transact(args, extData, overrides)
  const result = await receipt.wait()

  for (const output of outputs) {
    tree.insert(toFixedHex(output.getCommitment()))
  }

  return result
}

describe('BlackpoolERCPool', function () {
  async function fixture() {
    const [sender, gov, admin] = await ethers.getSigners()
    const token = await deploy(ethers, 'MockERC20')
    const verifier2 = await deploy(ethers, 'Verifier2')
    const hasher = await deployHasher(ethers)
    const { pool: ercPool } = await deployPoolProxy(
      ethers,
      'BlackpoolERCPool',
      [await verifier2.getAddress(), MERKLE_TREE_HEIGHT, await hasher.getAddress(), await token.getAddress()],
      [MAXIMUM_DEPOSIT_AMOUNT, MINIMUM_AMOUNT, admin.address],
    )
    const { encryptionKey, keypair } = await signIn(sender)

    return { ercPool, token, gov, admin, sender, encryptionKey, keypair, verifier2, hasher }
  }

  const dummyProof = () => dp(ethers)
  const dummyExtData = (o) => de(ethers, o)

  it('exposes token, verifier2, levels, hasher immutables', async () => {
    const { ercPool, token, verifier2, hasher } = await loadFixture(fixture)
    expect(await ercPool.token()).to.equal(await token.getAddress())
    expect(await ercPool.verifier2()).to.equal(await verifier2.getAddress())
    expect(await ercPool.levels()).to.equal(BigInt(MERKLE_TREE_HEIGHT))
    expect(await ercPool.hasher()).to.equal(await hasher.getAddress())
  })

  it('rejects zero token in constructor', async () => {
    const verifier2 = await deploy(ethers, 'Verifier2')
    const hasher = await deployHasher(ethers)
    const BlackpoolERCPool = await ethers.getContractFactory('BlackpoolERCPool')
    await expect(
      BlackpoolERCPool.deploy(await verifier2.getAddress(), MERKLE_TREE_HEIGHT, await hasher.getAddress(), ethers.ZeroAddress),
    ).to.be.revertedWith('token is zero address')
  })

  it('should configure maximum deposit amount', async () => {
    const { ercPool, admin } = await loadFixture(fixture)
    const newLimit = ethers.parseEther('1337')
    await ercPool.connect(admin).configureMaximumDepositAmount(newLimit)
    expect(await ercPool.maximumDepositAmount()).to.equal(newLimit)
  })

  it('constants check', async () => {
    const { ercPool } = await loadFixture(fixture)
    const maxFee = await ercPool.MAX_FEE()
    const maxExtAmount = await ercPool.MAX_EXT_AMOUNT()
    const fieldSize = await ercPool.FIELD_SIZE()
    expect(maxExtAmount + maxFee).to.be.lt(fieldSize)
  })

  it('MAX_ENCRYPTED_OUTPUT_SIZE is 256', async () => {
    const { ercPool } = await loadFixture(fixture)
    expect(await ercPool.MAX_ENCRYPTED_OUTPUT_SIZE()).to.equal(256n)
  })

  it('rejects encryptedOutput exceeding limit', async () => {
    const { ercPool } = await loadFixture(fixture)
    const oversized = '0x' + 'aa'.repeat(257)
    await expect(
      ercPool.transact(dummyProof(), dummyExtData({ encryptedOutput1: oversized }), { gasLimit: 1e6 }),
    ).to.be.revertedWith('Encrypted output too large')
  })

  it('rejects transact with native value attached (non-payable)', async () => {
    const { ercPool, sender } = await loadFixture(fixture)
    const data = ercPool.interface.encodeFunctionData('transact', [
      dummyProof(),
      dummyExtData({ extAmount: MINIMUM_AMOUNT }),
    ])
    await expect(
      sender.sendTransaction({ to: (await ercPool.getAddress()), data, value: 1, gasLimit: 1e6 }),
    ).to.revert(ethers)
  })

  it('rejects plain ETH transfers (no receive)', async () => {
    const { ercPool, sender } = await loadFixture(fixture)
    await expect(sender.sendTransaction({ to: (await ercPool.getAddress()), value: 1 })).to.revert(ethers)
  })

  it('rejects deposit below minimumAmount', async () => {
    const { ercPool } = await loadFixture(fixture)
    const dust = 1n
    await expect(
      ercPool.transact(dummyProof(), dummyExtData({ extAmount: dust }), { gasLimit: 1e6 }),
    ).to.be.revertedWith('Amount too small')
  })

  it('accepts deposit at minimumAmount then fails merkle check', async () => {
    const { ercPool } = await loadFixture(fixture)
    await expect(
      ercPool.transact(dummyProof(), dummyExtData({ extAmount: MINIMUM_AMOUNT }), { gasLimit: 1e6 }),
    ).to.be.revertedWith('Invalid merkle root')
  })

  it('rejects deposit without token approval', async () => {
    const { ercPool, encryptionKey } = await loadFixture(fixture)
    const tree = createEmptyTree()
    const depositAmount = ethers.parseEther('0.05')
    const utxo = new Utxo({ amount: depositAmount })
    const { args, extData } = await prepareTransaction({ tree, outputs: [utxo], encryptionKey })
    await expect(ercPool.transact(args, extData, { gasLimit: 50e6 })).to.revert(ethers)
  })

  it('should deposit, transact and withdraw (ERC-20)', async function () {
    const { ercPool, token, encryptionKey, keypair } = await loadFixture(fixture)
    const tree = createEmptyTree()

    const aliceDepositAmount = ethers.parseEther('0.1')
    const aliceDepositUtxo = new Utxo({ amount: aliceDepositAmount, keypair })
    await ercTransaction({ ercPool, token, tree, outputs: [aliceDepositUtxo], encryptionKey })

    const bobAddress = '0xDeaD00000000000000000000000000000000BEEf'
    const bobSendAmount = ethers.parseEther('0.06')
    const aliceChangeUtxo = new Utxo({
      amount: aliceDepositAmount - bobSendAmount,
      keypair,
    })
    await ercTransaction({
      ercPool,
      token,
      tree,
      inputs: [aliceDepositUtxo],
      outputs: [aliceChangeUtxo],
      recipient: bobAddress,
      encryptionKey,
    })

    expect(await token.balanceOf(bobAddress)).to.equal(bobSendAmount)

    const aliceRecv = '0x000000000000000000000000000000000000dEaD'
    await ercTransaction({
      ercPool,
      token,
      tree,
      inputs: [aliceChangeUtxo],
      outputs: [],
      recipient: aliceRecv,
      encryptionKey,
    })

    expect(await token.balanceOf(aliceRecv)).to.equal(aliceDepositAmount - bobSendAmount)
    expect(await token.balanceOf(await ercPool.getAddress())).to.equal(0n)
  })

  it('should deposit and withdraw with relayer fee (ERC-20)', async function () {
    const { ercPool, token, encryptionKey, keypair } = await loadFixture(fixture)
    const tree = createEmptyTree()
    const [, , , relayer] = await ethers.getSigners()

    const aliceDepositAmount = ethers.parseEther('0.1')
    const aliceDepositUtxo = new Utxo({ amount: aliceDepositAmount, keypair })
    await ercTransaction({ ercPool, token, tree, outputs: [aliceDepositUtxo], encryptionKey })

    const withdrawAmount = ethers.parseEther('0.08')
    const fee = ethers.parseEther('0.01')
    const changeAmount = aliceDepositAmount - withdrawAmount - fee
    const recipient = '0xDeaD00000000000000000000000000000000BEEf'
    const aliceChangeUtxo = new Utxo({ amount: changeAmount, keypair })

    await ercTransaction({
      ercPool,
      token,
      tree,
      inputs: [aliceDepositUtxo],
      outputs: [aliceChangeUtxo],
      recipient,
      fee,
      feeRecipient: relayer.address,
      encryptionKey,
    })

    expect(await token.balanceOf(recipient)).to.equal(withdrawAmount)
    expect(await token.balanceOf(relayer.address)).to.equal(fee)
    expect(await token.balanceOf((await ercPool.getAddress()))).to.equal(changeAmount)
  })

  it('attacker cannot frontrun withdraw by replacing recipient', async function () {
    const { ercPool, token, encryptionKey, keypair } = await loadFixture(fixture)
    const tree = createEmptyTree()
    const [, , , , attacker] = await ethers.getSigners()

    const aliceDepositAmount = ethers.parseEther('0.1')
    const aliceDepositUtxo = new Utxo({ amount: aliceDepositAmount, keypair })
    await ercTransaction({ ercPool, token, tree, outputs: [aliceDepositUtxo], encryptionKey })

    const aliceWithdrawAddress = '0xDeaD00000000000000000000000000000000BEEf'
    const { args, extData } = await prepareTransaction({
      tree,
      inputs: [aliceDepositUtxo],
      outputs: [],
      recipient: aliceWithdrawAddress,
      encryptionKey,
    })

    const attackerExtData = { ...extData, recipient: attacker.address }
    await expect(ercPool.connect(attacker).transact(args, attackerExtData, { gasLimit: 50e6 })).to.be.revertedWith(
      'Incorrect external data hash',
    )

    const attackerBefore = await token.balanceOf(attacker.address)
    await ercPool.transact(args, extData, { gasLimit: 50e6 })
    expect(await token.balanceOf(aliceWithdrawAddress)).to.equal(aliceDepositAmount)
    expect(await token.balanceOf(attacker.address)).to.equal(attackerBefore)
  })

  it('should reject tampered publicAmount', async function () {
    const { ercPool, token, encryptionKey } = await loadFixture(fixture)
    const tree = createEmptyTree()
    const depositAmount = ethers.parseEther('0.05')
    const utxo = new Utxo({ amount: depositAmount })
    const { args, extData } = await prepareTransaction({ tree, outputs: [utxo], encryptionKey })
    args.publicAmount = toFixedHex(42)
    await token.approve((await ercPool.getAddress()), depositAmount)
    await expect(ercPool.transact(args, extData, { gasLimit: 50e6 })).to.be.revertedWith('Invalid public amount')
  })

  it('should reject double spend', async function () {
    const { ercPool, token, encryptionKey, keypair } = await loadFixture(fixture)
    const tree = createEmptyTree()

    const aliceDepositAmount = ethers.parseEther('0.1')
    const aliceDepositUtxo = new Utxo({ amount: aliceDepositAmount, keypair })
    await ercTransaction({ ercPool, token, tree, outputs: [aliceDepositUtxo], encryptionKey })

    const bobAddress = '0xDeaD00000000000000000000000000000000BEEf'
    const withdrawAmount = ethers.parseEther('0.05')
    const aliceChangeUtxo = new Utxo({
      amount: aliceDepositAmount - withdrawAmount,
      keypair,
    })
    await ercTransaction({
      ercPool,
      token,
      tree,
      inputs: [aliceDepositUtxo],
      outputs: [aliceChangeUtxo],
      recipient: bobAddress,
      encryptionKey,
    })

    const aliceChangeUtxo2 = new Utxo({ amount: 0, keypair })
    await expect(
      ercTransaction({
        ercPool,
        token,
        tree,
        inputs: [aliceDepositUtxo],
        outputs: [aliceChangeUtxo2],
        recipient: bobAddress,
        encryptionKey,
      }),
    ).to.be.revertedWith('Input is already spent')
  })

  it('should reject deposit exceeding limit', async function () {
    const { ercPool, token, encryptionKey } = await loadFixture(fixture)
    const tree = createEmptyTree()
    const overLimitAmount = MAXIMUM_DEPOSIT_AMOUNT + 1n
    const utxo = new Utxo({ amount: overLimitAmount })
    await expect(
      ercTransaction({ ercPool, token, tree, outputs: [utxo], encryptionKey }),
    ).to.be.revertedWith('amount is larger than maximumDepositAmount')
  })

  it('non-admin cannot configure limits', async () => {
    const { ercPool, sender } = await loadFixture(fixture)
    await expect(ercPool.connect(sender).configureMaximumDepositAmount(ethers.parseEther('999'))).to.be.revertedWith(
      'only admin',
    )
  })

  it('admin can transfer admin to new address', async function () {
    const { ercPool, admin, gov } = await loadFixture(fixture)
    await ercPool.connect(admin).transferAdmin(gov.address)
    expect(await ercPool.pendingAdmin()).to.equal(gov.address)
    await ercPool.connect(gov).claimAdmin()
    expect(await ercPool.admin()).to.equal(gov.address)
  })

  it('cannot initialize twice', async function () {
    const { ercPool, admin } = await loadFixture(fixture)
    await expect(
      ercPool.connect(admin).initialize(ethers.parseEther('2'), MINIMUM_AMOUNT, admin.address),
    ).to.revert(ethers)
  })

  it('should reject withdraw to zero address', async function () {
    const { ercPool, token, encryptionKey } = await loadFixture(fixture)
    const tree = createEmptyTree()
    const depositAmount = ethers.parseEther('0.05')
    const depositUtxo = new Utxo({ amount: depositAmount })
    await ercTransaction({ ercPool, token, tree, outputs: [depositUtxo], encryptionKey })

    await expect(
      ercTransaction({
        ercPool,
        token,
        tree,
        inputs: [depositUtxo],
        outputs: [],
        recipient: '0x0000000000000000000000000000000000000000',
        encryptionKey,
      }),
    ).to.be.revertedWith("Can't withdraw to zero address")
  })

  it('should reject unknown root', async function () {
    const { ercPool, token, encryptionKey } = await loadFixture(fixture)
    const tree = createEmptyTree()
    const depositAmount = ethers.parseEther('0.05')
    const utxo = new Utxo({ amount: depositAmount })
    const { args, extData } = await prepareTransaction({ tree, outputs: [utxo], encryptionKey })
    args.root = toFixedHex(123456789)
    await token.approve((await ercPool.getAddress()), depositAmount)
    await expect(ercPool.transact(args, extData, { gasLimit: 50e6 })).to.be.revertedWith('Invalid merkle root')
  })

  it('should reject wrong extDataHash', async function () {
    const { ercPool, token, encryptionKey } = await loadFixture(fixture)
    const tree = createEmptyTree()
    const depositAmount = ethers.parseEther('0.05')
    const utxo = new Utxo({ amount: depositAmount })
    const { args, extData } = await prepareTransaction({ tree, outputs: [utxo], encryptionKey })
    const tampered = { ...extData, recipient: '0xDeaD00000000000000000000000000000000BEEf' }
    await token.approve((await ercPool.getAddress()), depositAmount)
    await expect(ercPool.transact(args, tampered, { gasLimit: 50e6 })).to.be.revertedWith('Incorrect external data hash')
  })

  it('calculatePublicAmount rules match BlackpoolEtherPool', async function () {
    const { ercPool } = await loadFixture(fixture)
    await expect(ercPool.calculatePublicAmount(0, 0)).to.be.revertedWith('ext amount must exceed fee for deposits')
    const r1 = await ercPool.calculatePublicAmount(ethers.parseEther('0.1'), ethers.parseEther('0.01'))
    expect(r1).to.equal(ethers.parseEther('0.09'))
    const fieldSize = await ercPool.FIELD_SIZE()
    const r2 = await ercPool.calculatePublicAmount(ethers.parseEther('-0.1'), ethers.parseEther('0.01'))
    expect(r2).to.equal(fieldSize - ethers.parseEther('0.11'))
  })

  it('admin can pause and unpause; transact blocked when paused', async function () {
    const { ercPool, token, admin, encryptionKey } = await loadFixture(fixture)
    const tree = createEmptyTree()
    const depositAmount = ethers.parseEther('0.05')
    const utxo = new Utxo({ amount: depositAmount })
    const { args, extData } = await prepareTransaction({ tree, outputs: [utxo], encryptionKey })

    await ercPool.connect(admin).pause()
    await token.approve((await ercPool.getAddress()), depositAmount)
    await expect(ercPool.transact(args, extData, { gasLimit: 50e6 })).to.revert(ethers)

    await ercPool.connect(admin).unpause()
    await ercTransaction({ ercPool, token, tree, outputs: [utxo], encryptionKey })
    expect(await token.balanceOf((await ercPool.getAddress()))).to.equal(depositAmount)
  })

  it('non-admin cannot pause', async () => {
    const { ercPool, sender } = await loadFixture(fixture)
    await expect(ercPool.connect(sender).pause()).to.be.revertedWith('only admin')
  })
})

describe('BlackpoolERCPool upgrades', function () {
  // UUPS proxy deployed directly (ERC1967Proxy + initialize calldata); upgrades go through upgradeToAndCall.
  async function fixture() {
    const [sender, , admin] = await ethers.getSigners()
    const token = await deploy(ethers, 'MockERC20')
    const verifier2 = await deploy(ethers, 'Verifier2')
    const hasher = await deployHasher(ethers)
    const { pool: ercPool } = await deployPoolProxy(
      ethers,
      'BlackpoolERCPool',
      [await verifier2.getAddress(), MERKLE_TREE_HEIGHT, await hasher.getAddress(), await token.getAddress()],
      [ethers.parseEther('1'), ethers.parseEther('0.0005'), admin.address],
    )
    return { ercPool, verifier2, hasher, admin, sender, token }
  }

  async function deployV2({ verifier2, hasher, token }, signer) {
    const V2 = await ethers.getContractFactory('BlackpoolERCPoolV2Mock', signer)
    const impl = await V2.deploy(await verifier2.getAddress(), MERKLE_TREE_HEIGHT, await hasher.getAddress(), await token.getAddress())
    await impl.waitForDeployment()
    return { V2, impl }
  }

  it('deployProxy initializes and exposes token', async () => {
    const { ercPool, admin, token } = await loadFixture(fixture)
    expect(await ercPool.admin()).to.equal(admin.address)
    expect(await ercPool.token()).to.equal(await token.getAddress())
  })

  it('upgrade preserves storage and immutables', async () => {
    const f = await loadFixture(fixture)
    const { ercPool, admin, token } = f
    const newLimit = ethers.parseEther('5')
    await ercPool.connect(admin).configureMaximumDepositAmount(newLimit)
    expect(await ercPool.maximumDepositAmount()).to.equal(newLimit)

    const { V2, impl } = await deployV2(f, admin)
    await ercPool.connect(admin).upgradeToAndCall(await impl.getAddress(), V2.interface.encodeFunctionData('initializeV2', [42]))
    const upgraded = V2.attach(await ercPool.getAddress())

    expect(await upgraded.admin()).to.equal(admin.address)
    expect(await upgraded.maximumDepositAmount()).to.equal(newLimit)
    expect(await upgraded.token()).to.equal(await token.getAddress())
    expect(await upgraded.version()).to.equal(2n)
    expect(await upgraded.newVariable()).to.equal(42n)
  })

  it('non-admin cannot upgrade', async () => {
    const f = await loadFixture(fixture)
    const { ercPool, sender } = f
    const { impl } = await deployV2(f)
    await expect(ercPool.connect(sender).upgradeToAndCall(await impl.getAddress(), '0x')).to.be.revertedWith('only admin')
  })
})
