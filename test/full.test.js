import { expect } from 'chai'
import { network } from 'hardhat'
import {
  MERKLE_TREE_HEIGHT, BigNumber, Utxo, toFixedHex, poseidonHash, getExtDataHash, signIn, encrypt, decrypt,
  createEmptyTree, prepareTransaction, deploy, deployHasher, deployPoolProxy,
} from './helpers.js'

const { ethers, networkHelpers } = await network.create()
const { loadFixture } = networkHelpers

const MAXIMUM_DEPOSIT_AMOUNT = ethers.parseEther('1')
const MINIMUM_AMOUNT = ethers.parseEther('0.0005')

async function transaction({ etherPool, tree, ...rest }) {
  const { args, extData, outputs } = await prepareTransaction({ tree, ...rest })

  const overrides = { gasLimit: 3000000 }
  const extAmount = BigNumber.from(extData.extAmount)
  if (extAmount.gt(0)) {
    overrides.value = extAmount.toBigInt()
  }

  const receipt = await etherPool.transact(args, extData, overrides)
  const result = await receipt.wait()

  for (const output of outputs) {
    tree.insert(toFixedHex(output.getCommitment()))
  }

  return result
}

describe('BlackpoolEtherPool', function () {


  async function fixture() {
    const [sender, gov, admin] = await ethers.getSigners()
    const verifier2 = await deploy(ethers, 'Verifier2')
    const hasher = await deployHasher(ethers)
    const { pool: etherPool } = await deployPoolProxy(
      ethers,
      'BlackpoolEtherPool',
      [await verifier2.getAddress(), MERKLE_TREE_HEIGHT, await hasher.getAddress()],
      [MAXIMUM_DEPOSIT_AMOUNT, MINIMUM_AMOUNT, admin.address],
    )

    // Derive encryption key and UTXO keypair from sender's signature
    const { encryptionKey, keypair } = await signIn(sender)

    return { etherPool, gov, admin, sender, encryptionKey, keypair }
  }

  it('should configure', async () => {
    const { etherPool, admin } = await loadFixture(fixture)
    const newDepositLimit = ethers.parseEther('1337')

    await etherPool.connect(admin).configureMaximumDepositAmount(newDepositLimit)

    expect(await etherPool.maximumDepositAmount()).to.be.equal(newDepositLimit)
  })

  it('encrypt -> decrypt should work', async () => {
    const [sender] = await ethers.getSigners()
    const { encryptionKey } = await signIn(sender)

    const data = Buffer.from([0xff, 0xaa, 0x00, 0x01])
    const ciphertext = encrypt(data, encryptionKey)
    const result = decrypt(ciphertext, encryptionKey)
    expect(result).to.be.deep.equal(data)
  })

  it('constants check', async () => {
    const { etherPool } = await loadFixture(fixture)
    const maxFee = await etherPool.MAX_FEE()
    const maxExtAmount = await etherPool.MAX_EXT_AMOUNT()
    const fieldSize = await etherPool.FIELD_SIZE()

    expect(maxExtAmount + maxFee).to.be.lt(fieldSize)
  })

  it('should deposit, transact and withdraw', async function () {
    const { etherPool, encryptionKey, keypair } = await loadFixture(fixture)
    const tree = createEmptyTree()

    // Alice deposits into the pool
    const aliceDepositAmount = ethers.parseEther('0.1')
    const aliceDepositUtxo = new Utxo({ amount: aliceDepositAmount, keypair })
    await transaction({ etherPool, tree, outputs: [aliceDepositUtxo], encryptionKey })

    // Alice withdraws a portion to Bob's address
    const bobEthAddress = '0xDeaD00000000000000000000000000000000BEEf'
    const bobSendAmount = ethers.parseEther('0.06')
    const aliceChangeUtxo = new Utxo({
      amount: aliceDepositAmount - bobSendAmount,
      keypair,
    })
    await transaction({
      etherPool, tree,
      inputs: [aliceDepositUtxo],
      outputs: [aliceChangeUtxo],
      recipient: bobEthAddress,
      encryptionKey,
    })

    const bobBalance = await ethers.provider.getBalance(bobEthAddress)
    expect(bobBalance).to.be.equal(bobSendAmount)

    // Alice withdraws the remaining balance
    const aliceEthAddress = '0x000000000000000000000000000000000000dEaD'
    await transaction({
      etherPool, tree,
      inputs: [aliceChangeUtxo],
      outputs: [],
      recipient: aliceEthAddress,
      encryptionKey,
    })

    const aliceBalance = await ethers.provider.getBalance(aliceEthAddress)
    expect(aliceBalance).to.be.equal(aliceDepositAmount - bobSendAmount)
    expect(await ethers.provider.getBalance((await etherPool.getAddress()))).to.be.equal(0n)
  })

  it('should deposit and withdraw with relayer fee', async function () {
    const { etherPool, sender, encryptionKey, keypair } = await loadFixture(fixture)
    const tree = createEmptyTree()
    const [, , , relayer] = await ethers.getSigners()

    const aliceDepositAmount = ethers.parseEther('0.1')
    const aliceDepositUtxo = new Utxo({ amount: aliceDepositAmount, keypair })

    const poolBalanceBefore = await ethers.provider.getBalance((await etherPool.getAddress()))
    expect(poolBalanceBefore).to.be.equal(0n)

    const senderBalanceBefore = await ethers.provider.getBalance(sender.address)

    const depositTx = await transaction({ etherPool, tree, outputs: [aliceDepositUtxo], encryptionKey })

    const senderBalanceAfterDeposit = await ethers.provider.getBalance(sender.address)
    const depositGasUsed = depositTx.gasUsed * depositTx.gasPrice
    expect(senderBalanceBefore - senderBalanceAfterDeposit).to.be.equal(aliceDepositAmount + depositGasUsed)

    const poolBalanceAfterDeposit = await ethers.provider.getBalance((await etherPool.getAddress()))
    expect(poolBalanceAfterDeposit).to.be.equal(aliceDepositAmount)

    // Withdraw with relayer fee
    const withdrawAmount = ethers.parseEther('0.08')
    const fee = ethers.parseEther('0.01')
    const changeAmount = aliceDepositAmount - withdrawAmount - fee
    const recipient = '0xDeaD00000000000000000000000000000000BEEf'
    const aliceChangeUtxo = new Utxo({
      amount: changeAmount,
      keypair,
    })

    const relayerBalanceBefore = await ethers.provider.getBalance(relayer.address)

    const withdrawTx = await transaction({
      etherPool, tree,
      inputs: [aliceDepositUtxo],
      outputs: [aliceChangeUtxo],
      recipient,
      fee,
      feeRecipient: relayer.address,
      encryptionKey,
    })

    // Recipient gets the withdrawal amount
    const recipientBalance = await ethers.provider.getBalance(recipient)
    expect(recipientBalance).to.be.equal(withdrawAmount)

    // Relayer gets the fee
    const relayerBalanceAfter = await ethers.provider.getBalance(relayer.address)
    expect(relayerBalanceAfter - relayerBalanceBefore).to.be.equal(fee)

    // Pool retains only the change amount
    const poolBalanceAfterWithdraw = await ethers.provider.getBalance((await etherPool.getAddress()))
    expect(poolBalanceAfterWithdraw).to.be.equal(changeAmount)

    // Sender paid gas for the withdraw tx but no ETH value
    const senderBalanceAfterWithdraw = await ethers.provider.getBalance(sender.address)
    const withdrawGasUsed = withdrawTx.gasUsed * withdrawTx.gasPrice
    expect(senderBalanceAfterDeposit - senderBalanceAfterWithdraw).to.be.equal(withdrawGasUsed)
  })

  it('should deposit and withdraw with zero fee', async function () {
    const { etherPool, sender, encryptionKey, keypair } = await loadFixture(fixture)
    const tree = createEmptyTree()
    const [, , , relayer] = await ethers.getSigners()

    const aliceDepositAmount = ethers.parseEther('0.1')
    const aliceDepositUtxo = new Utxo({ amount: aliceDepositAmount, keypair })

    const poolBalanceBefore = await ethers.provider.getBalance((await etherPool.getAddress()))
    expect(poolBalanceBefore).to.be.equal(0n)

    const senderBalanceBefore = await ethers.provider.getBalance(sender.address)

    const depositTx = await transaction({ etherPool, tree, outputs: [aliceDepositUtxo], encryptionKey })

    const senderBalanceAfterDeposit = await ethers.provider.getBalance(sender.address)
    const depositGasUsed = depositTx.gasUsed * depositTx.gasPrice
    expect(senderBalanceBefore - senderBalanceAfterDeposit).to.be.equal(aliceDepositAmount + depositGasUsed)

    const poolBalanceAfterDeposit = await ethers.provider.getBalance((await etherPool.getAddress()))
    expect(poolBalanceAfterDeposit).to.be.equal(aliceDepositAmount)

    // Withdraw with relayer fee
    const withdrawAmount = ethers.parseEther('0.08')
    const fee = 0n
    const changeAmount = aliceDepositAmount - withdrawAmount - fee
    const recipient = '0xDeaD00000000000000000000000000000000BEEf'
    const aliceChangeUtxo = new Utxo({
      amount: changeAmount,
      keypair,
    })

    const relayerBalanceBefore = await ethers.provider.getBalance(relayer.address)

    const withdrawTx = await transaction({
      etherPool, tree,
      inputs: [aliceDepositUtxo],
      outputs: [aliceChangeUtxo],
      recipient,
      fee,
      feeRecipient: relayer.address,
      encryptionKey,
    })

    // Recipient gets the withdrawal amount
    const recipientBalance = await ethers.provider.getBalance(recipient)
    expect(recipientBalance).to.be.equal(withdrawAmount)

    // Relayer gets the fee
    const relayerBalanceAfter = await ethers.provider.getBalance(relayer.address)
    expect(relayerBalanceAfter - relayerBalanceBefore).to.be.equal(fee)

    // Pool retains only the change amount
    const poolBalanceAfterWithdraw = await ethers.provider.getBalance((await etherPool.getAddress()))
    expect(poolBalanceAfterWithdraw).to.be.equal(changeAmount)

    // Sender paid gas for the withdraw tx but no ETH value
    const senderBalanceAfterWithdraw = await ethers.provider.getBalance(sender.address)
    const withdrawGasUsed = withdrawTx.gasUsed * withdrawTx.gasPrice
    expect(senderBalanceAfterDeposit - senderBalanceAfterWithdraw).to.be.equal(withdrawGasUsed)
  })

  it('attacker cannot frontrun withdraw by replacing recipient', async function () {
    const { etherPool, encryptionKey, keypair } = await loadFixture(fixture)
    const tree = createEmptyTree()
    const [, , , , attacker] = await ethers.getSigners()

    const aliceDepositAmount = ethers.parseEther('0.1')
    const aliceDepositUtxo = new Utxo({ amount: aliceDepositAmount, keypair })
    await transaction({ etherPool, tree, outputs: [aliceDepositUtxo], encryptionKey })

    // Alice prepares a withdrawal to her own address
    const aliceWithdrawAddress = '0xDeaD00000000000000000000000000000000BEEf'
    const { args, extData } = await prepareTransaction({
      tree,
      inputs: [aliceDepositUtxo],
      outputs: [],
      recipient: aliceWithdrawAddress,
      encryptionKey,
    })

    // Attacker intercepts and replaces recipient with their own address
    const attackerExtData = { ...extData, recipient: attacker.address }

    await expect(
      etherPool.transact(args, attackerExtData, { gasLimit: 50e6 }),
    ).to.be.revertedWith('Incorrect external data hash')

    // Verify attacker received nothing
    const attackerBalanceBefore = await ethers.provider.getBalance(attacker.address)

    // Original transaction still works with the correct recipient
    await etherPool.transact(args, extData, { gasLimit: 50e6 })

    const recipientBalance = await ethers.provider.getBalance(aliceWithdrawAddress)
    expect(recipientBalance).to.be.equal(aliceDepositAmount)

    const attackerBalanceAfter = await ethers.provider.getBalance(attacker.address)
    expect(attackerBalanceAfter).to.be.equal(attackerBalanceBefore)
  })

  it('should reject tampered publicAmount', async function () {
    const { etherPool, encryptionKey } = await loadFixture(fixture)
    const tree = createEmptyTree()

    const depositAmount = ethers.parseEther('0.05')
    const utxo = new Utxo({ amount: depositAmount })
    const { args, extData } = await prepareTransaction({
      tree,
      outputs: [utxo],
      encryptionKey,
    })

    // Tamper with publicAmount after proof was generated
    args.publicAmount = toFixedHex(42)

    await expect(
      etherPool.transact(args, extData, {
        value: depositAmount,
        gasLimit: 50e6,
      }),
    ).to.be.revertedWith('Invalid public amount')
  })

  it('should reject tampered fee', async function () {
    const { etherPool, encryptionKey } = await loadFixture(fixture)
    const tree = createEmptyTree()

    const depositAmount = ethers.parseEther('0.05')
    const utxo = new Utxo({ amount: depositAmount })
    const { args, extData } = await prepareTransaction({
      tree,
      outputs: [utxo],
      encryptionKey,
    })

    // Tamper with fee after proof was generated
    extData.fee = toFixedHex(ethers.parseEther('0.01'))

    await expect(
      etherPool.transact(args, extData, {
        value: depositAmount,
        gasLimit: 50e6,
      }),
    ).to.be.revertedWith('Incorrect external data hash')
  })

  it('should reject double spend', async function () {
    const { etherPool, encryptionKey, keypair } = await loadFixture(fixture)
    const tree = createEmptyTree()

    const aliceDepositAmount = ethers.parseEther('0.1')
    const aliceDepositUtxo = new Utxo({ amount: aliceDepositAmount, keypair })
    await transaction({ etherPool, tree, outputs: [aliceDepositUtxo], encryptionKey })

    const bobAddress = '0xDeaD00000000000000000000000000000000BEEf'
    const withdrawAmount = ethers.parseEther('0.05')
    const aliceChangeUtxo = new Utxo({
      amount: aliceDepositAmount - withdrawAmount,
      keypair,
    })
    await transaction({
      etherPool, tree,
      inputs: [aliceDepositUtxo],
      outputs: [aliceChangeUtxo],
      recipient: bobAddress,
      encryptionKey,
    })

    // Attempt to reuse the same UTXO (double spend)
    const aliceChangeUtxo2 = new Utxo({ amount: 0, keypair })
    await expect(
      transaction({
        etherPool, tree,
        inputs: [aliceDepositUtxo],
        outputs: [aliceChangeUtxo2],
        recipient: bobAddress,
        encryptionKey,
      }),
    ).to.be.revertedWith('Input is already spent')
  })

  it('should reject deposit exceeding limit', async function () {
    const { etherPool, encryptionKey } = await loadFixture(fixture)
    const tree = createEmptyTree()

    const overLimitAmount = MAXIMUM_DEPOSIT_AMOUNT + 1n
    const utxo = new Utxo({ amount: overLimitAmount })
    await expect(
      transaction({ etherPool, tree, outputs: [utxo], encryptionKey }),
    ).to.be.revertedWith('amount is larger than maximumDepositAmount')
  })

  it('non-admin cannot configure limits', async () => {
    const { etherPool, sender } = await loadFixture(fixture)
    await expect(
      etherPool.connect(sender).configureMaximumDepositAmount(ethers.parseEther('999')),
    ).to.be.revertedWith('only admin')
  })

  it('should reject direct ETH transfers', async function () {
    const { etherPool, sender } = await loadFixture(fixture)
    await expect(
      sender.sendTransaction({ to: (await etherPool.getAddress()), value: ethers.parseEther('1') }),
    ).to.be.revertedWith('Use transact() to deposit')
  })

  it('admin can transfer admin to new address', async function () {
    const { etherPool, admin, gov } = await loadFixture(fixture)

    await etherPool.connect(admin).transferAdmin(gov.address)
    expect(await etherPool.pendingAdmin()).to.equal(gov.address)
    expect(await etherPool.admin()).to.equal(admin.address)

    await etherPool.connect(gov).claimAdmin()
    expect(await etherPool.admin()).to.equal(gov.address)
    expect(await etherPool.pendingAdmin()).to.equal(ethers.ZeroAddress)
  })

  it('non-admin cannot transfer admin', async function () {
    const { etherPool, sender, gov } = await loadFixture(fixture)
    await expect(
      etherPool.connect(sender).transferAdmin(gov.address),
    ).to.be.revertedWith('only admin')
  })

  it('non-pending admin cannot claim admin', async function () {
    const { etherPool, admin, sender, gov } = await loadFixture(fixture)
    await etherPool.connect(admin).transferAdmin(gov.address)
    await expect(
      etherPool.connect(sender).claimAdmin(),
    ).to.be.revertedWith('not pending admin')
  })

  it('cannot transfer admin to zero address', async function () {
    const { etherPool, admin } = await loadFixture(fixture)
    await expect(
      etherPool.connect(admin).transferAdmin(ethers.ZeroAddress),
    ).to.be.revertedWith('new admin is zero address')
  })

  it('admin can overwrite pending admin before claim', async function () {
    const { etherPool, admin, gov, sender } = await loadFixture(fixture)

    await etherPool.connect(admin).transferAdmin(gov.address)
    expect(await etherPool.pendingAdmin()).to.equal(gov.address)

    await etherPool.connect(admin).transferAdmin(sender.address)
    expect(await etherPool.pendingAdmin()).to.equal(sender.address)

    await expect(
      etherPool.connect(gov).claimAdmin(),
    ).to.be.revertedWith('not pending admin')

    await etherPool.connect(sender).claimAdmin()
    expect(await etherPool.admin()).to.equal(sender.address)
  })

  it('new admin can configure limits after transfer', async function () {
    const { etherPool, admin, gov } = await loadFixture(fixture)

    await etherPool.connect(admin).transferAdmin(gov.address)
    await etherPool.connect(gov).claimAdmin()

    const newLimit = ethers.parseEther('500')
    await etherPool.connect(gov).configureMaximumDepositAmount(newLimit)
    expect(await etherPool.maximumDepositAmount()).to.equal(newLimit)

    await expect(
      etherPool.connect(admin).configureMaximumDepositAmount(ethers.parseEther('1')),
    ).to.be.revertedWith('only admin')
  })

  it('cannot initialize twice', async function () {
    const { etherPool, admin } = await loadFixture(fixture)
    await expect(
      etherPool.connect(admin).initialize(ethers.parseEther('2'), MINIMUM_AMOUNT, admin.address),
    ).to.revert(ethers)
  })

  it('should deposit and withdraw full amount, then deposit again', async function () {
    const { etherPool, encryptionKey } = await loadFixture(fixture)
    const tree = createEmptyTree()

    // First cycle: deposit and withdraw everything
    const depositAmount1 = ethers.parseEther('0.1')
    const depositUtxo1 = new Utxo({ amount: depositAmount1 })
    await transaction({ etherPool, tree, outputs: [depositUtxo1], encryptionKey })

    const recipient1 = '0xDeaD00000000000000000000000000000000BEEf'
    await transaction({
      etherPool, tree,
      inputs: [depositUtxo1],
      outputs: [],
      recipient: recipient1,
      encryptionKey,
    })

    expect(await ethers.provider.getBalance(recipient1)).to.be.equal(depositAmount1)
    expect(await ethers.provider.getBalance((await etherPool.getAddress()))).to.be.equal(0n)

    // Second cycle: deposit again after pool was fully drained
    const depositAmount2 = ethers.parseEther('0.05')
    const depositUtxo2 = new Utxo({ amount: depositAmount2 })
    await transaction({ etherPool, tree, outputs: [depositUtxo2], encryptionKey })

    expect(await ethers.provider.getBalance((await etherPool.getAddress()))).to.be.equal(depositAmount2)

    // Withdraw from the second deposit
    const recipient2 = '0x000000000000000000000000000000000000dEaD'
    await transaction({
      etherPool, tree,
      inputs: [depositUtxo2],
      outputs: [],
      recipient: recipient2,
      encryptionKey,
    })

    expect(await ethers.provider.getBalance(recipient2)).to.be.equal(depositAmount2)
    expect(await ethers.provider.getBalance((await etherPool.getAddress()))).to.be.equal(0n)
  })

  it('can deposit after increasing limit', async function () {
    const { etherPool, admin, encryptionKey } = await loadFixture(fixture)
    const tree = createEmptyTree()

    const largeAmount = ethers.parseEther('5')
    const utxo = new Utxo({ amount: largeAmount })

    // Should fail with default limit (1 ETH)
    await expect(
      transaction({ etherPool, tree, outputs: [utxo], encryptionKey }),
    ).to.be.revertedWith('amount is larger than maximumDepositAmount')

    // Increase limit
    await etherPool.connect(admin).configureMaximumDepositAmount(ethers.parseEther('1000'))

    // Should now succeed
    await transaction({ etherPool, tree, outputs: [utxo], encryptionKey })
    expect(await ethers.provider.getBalance((await etherPool.getAddress()))).to.be.equal(largeAmount)
  })

  it('cannot deposit after decreasing limit', async function () {
    const { etherPool, admin, encryptionKey } = await loadFixture(fixture)
    const tree = createEmptyTree()

    // Deposit 0.5 ETH (within default 1 ETH limit)
    const depositUtxo = new Utxo({ amount: ethers.parseEther('0.5') })
    await transaction({ etherPool, tree, outputs: [depositUtxo], encryptionKey })

    // Decrease limit to 0.1 ETH
    await etherPool.connect(admin).configureMaximumDepositAmount(ethers.parseEther('0.1'))

    // Now 0.5 ETH deposit should fail
    const utxo = new Utxo({ amount: ethers.parseEther('0.5') })
    await expect(
      transaction({ etherPool, tree, outputs: [utxo], encryptionKey }),
    ).to.be.revertedWith('amount is larger than maximumDepositAmount')
  })

  it('withdrawal has no limit', async function () {
    const { etherPool, admin, encryptionKey } = await loadFixture(fixture)
    const tree = createEmptyTree()

    // Set limit high enough for initial deposit
    await etherPool.connect(admin).configureMaximumDepositAmount(ethers.parseEther('200'))

    // Deposit 100 ETH
    const depositAmount = ethers.parseEther('100')
    const depositUtxo = new Utxo({ amount: depositAmount })
    await transaction({ etherPool, tree, outputs: [depositUtxo], encryptionKey })

    expect(await ethers.provider.getBalance((await etherPool.getAddress()))).to.be.equal(depositAmount)

    // Lower deposit limit to 50 ETH
    await etherPool.connect(admin).configureMaximumDepositAmount(ethers.parseEther('50'))

    // Verify new 100 ETH deposit fails
    const blockedUtxo = new Utxo({ amount: depositAmount })
    await expect(
      transaction({ etherPool, tree, outputs: [blockedUtxo], encryptionKey }),
    ).to.be.revertedWith('amount is larger than maximumDepositAmount')

    // Withdraw the full 100 ETH -- should succeed despite 50 ETH deposit limit
    const recipient = '0xDeaD00000000000000000000000000000000BEEf'
    await transaction({
      etherPool, tree,
      inputs: [depositUtxo],
      outputs: [],
      recipient,
      encryptionKey,
    })

    expect(await ethers.provider.getBalance(recipient)).to.be.equal(depositAmount)
    expect(await ethers.provider.getBalance((await etherPool.getAddress()))).to.be.equal(0n)
  })

  it('arithmetic overflow protection', async function () {
    const { etherPool, encryptionKey } = await loadFixture(fixture)
    const tree = createEmptyTree()

    const depositAmount = ethers.parseEther('0.05')
    const utxo = new Utxo({ amount: depositAmount })
    const { args, extData } = await prepareTransaction({
      tree,
      outputs: [utxo],
      encryptionKey,
    })

    // Set publicAmount to max uint256 (would overflow in unchecked math)
    args.publicAmount = ethers.toBeHex(ethers.MaxUint256)

    await expect(
      etherPool.transact(args, extData, {
        value: depositAmount,
        gasLimit: 50e6,
      }),
    ).to.revert(ethers)
  })

  it('should deposit with zero fee and withdraw with positive fee', async function () {
    const { etherPool, encryptionKey } = await loadFixture(fixture)
    const tree = createEmptyTree()
    const [, , , relayer] = await ethers.getSigners()

    // Deposit with zero fee
    const depositAmount = ethers.parseEther('0.1')
    const depositUtxo = new Utxo({ amount: depositAmount })
    await transaction({ etherPool, tree, outputs: [depositUtxo], fee: 0, encryptionKey })

    expect(await ethers.provider.getBalance((await etherPool.getAddress()))).to.be.equal(depositAmount)

    // Withdraw with positive relayer fee
    const withdrawFee = ethers.parseEther('0.02')
    const recipient = '0xDeaD00000000000000000000000000000000BEEf'
    await transaction({
      etherPool, tree,
      inputs: [depositUtxo],
      outputs: [],
      recipient,
      fee: withdrawFee,
      feeRecipient: relayer.address,
      encryptionKey,
    })

    const recipientBalance = await ethers.provider.getBalance(recipient)
    expect(recipientBalance).to.be.equal(depositAmount - withdrawFee)
    expect(await ethers.provider.getBalance((await etherPool.getAddress()))).to.be.equal(0n)
  })

  it('should reject incorrect ETH value on deposit', async function () {
    const { etherPool, encryptionKey } = await loadFixture(fixture)
    const tree = createEmptyTree()

    const depositAmount = ethers.parseEther('0.05')
    const utxo = new Utxo({ amount: depositAmount })
    const { args, extData } = await prepareTransaction({
      tree,
      outputs: [utxo],
      encryptionKey,
    })
    // Send wrong msg.value (too little)
    await expect(
      etherPool.transact(args, extData, {
        value: depositAmount - 1n,
        gasLimit: 50e6,
      }),
    ).to.be.revertedWith('Incorrect ETH value')
  })

  it('should reject withdraw to zero address', async function () {
    const { etherPool, encryptionKey } = await loadFixture(fixture)
    const tree = createEmptyTree()

    const depositAmount = ethers.parseEther('0.05')
    const depositUtxo = new Utxo({ amount: depositAmount })
    await transaction({ etherPool, tree, outputs: [depositUtxo], encryptionKey })

    await expect(
      transaction({
        etherPool, tree,
        inputs: [depositUtxo],
        outputs: [],
        recipient: '0x0000000000000000000000000000000000000000',
        encryptionKey,
      }),
    ).to.be.revertedWith("Can't withdraw to zero address")
  })

  it('should reject unknown root', async function () {
    const { etherPool, encryptionKey } = await loadFixture(fixture)
    const tree = createEmptyTree()

    const depositAmount = ethers.parseEther('0.05')
    const utxo = new Utxo({ amount: depositAmount })
    const { args, extData } = await prepareTransaction({
      tree,
      outputs: [utxo],
      encryptionKey,
    })

    // Replace root with an unknown value
    args.root = toFixedHex(123456789)

    await expect(
      etherPool.transact(args, extData, {
        value: depositAmount,
        gasLimit: 50e6,
      }),
    ).to.be.revertedWith('Invalid merkle root')
  })

  it('should reject zero root', async function () {
    const { etherPool, encryptionKey } = await loadFixture(fixture)
    const tree = createEmptyTree()

    const depositAmount = ethers.parseEther('0.05')
    const utxo = new Utxo({ amount: depositAmount })
    const { args, extData } = await prepareTransaction({
      tree,
      outputs: [utxo],
      encryptionKey,
    })

    args.root = toFixedHex(0)

    await expect(
      etherPool.transact(args, extData, {
        value: depositAmount,
        gasLimit: 50e6,
      }),
    ).to.be.revertedWith('Invalid merkle root')
  })

  it('should reject wrong extDataHash', async function () {
    const { etherPool, encryptionKey } = await loadFixture(fixture)
    const tree = createEmptyTree()

    const depositAmount = ethers.parseEther('0.05')
    const utxo = new Utxo({ amount: depositAmount })
    const { args, extData } = await prepareTransaction({
      tree,
      outputs: [utxo],
      encryptionKey,
    })

    // Tamper with extData after proof was generated (changing recipient)
    const tamperedExtData = { ...extData, recipient: '0xDeaD00000000000000000000000000000000BEEf' }

    await expect(
      etherPool.transact(args, tamperedExtData, {
        value: depositAmount,
        gasLimit: 50e6,
      }),
    ).to.be.revertedWith('Incorrect external data hash')
  })

  it('should reject zero extAmount (no shielded transfers)', async function () {
    const { etherPool } = await loadFixture(fixture)
    await expect(
      etherPool.calculatePublicAmount(0, 0),
    ).to.be.revertedWith('ext amount must exceed fee for deposits')
  })

  it('should reject zero extAmount with positive fee', async function () {
    const { etherPool } = await loadFixture(fixture)
    await expect(
      etherPool.calculatePublicAmount(0, ethers.parseEther('0.01')),
    ).to.be.revertedWith('ext amount must exceed fee for deposits')
  })

  it('should reject deposit where fee equals extAmount', async function () {
    const { etherPool } = await loadFixture(fixture)
    const amount = ethers.parseEther('0.1')
    await expect(
      etherPool.calculatePublicAmount(amount, amount),
    ).to.be.revertedWith('ext amount must exceed fee for deposits')
  })

  it('should reject deposit where fee exceeds extAmount', async function () {
    const { etherPool } = await loadFixture(fixture)
    await expect(
      etherPool.calculatePublicAmount(ethers.parseEther('0.05'), ethers.parseEther('0.1')),
    ).to.be.revertedWith('ext amount must exceed fee for deposits')
  })

  it('should reject withdrawal where fee equals extAmount', async function () {
    const { etherPool } = await loadFixture(fixture)
    const amount = ethers.parseEther('0.1')
    await expect(
      etherPool.calculatePublicAmount(-amount, amount),
    ).to.be.revertedWith('ext amount must exceed fee for deposits')
  })

  it('should reject withdrawal where fee exceeds extAmount', async function () {
    const { etherPool } = await loadFixture(fixture)
    await expect(
      etherPool.calculatePublicAmount(ethers.parseEther('-0.05'), ethers.parseEther('0.1')),
    ).to.be.revertedWith('ext amount must exceed fee for deposits')
  })

  it('should accept deposit where extAmount exceeds fee', async function () {
    const { etherPool } = await loadFixture(fixture)
    const result = await etherPool.calculatePublicAmount(
      ethers.parseEther('0.1'),
      ethers.parseEther('0.01'),
    )
    expect(result).to.be.equal(ethers.parseEther('0.09'))
  })

  it('should accept withdrawal where extAmount exceeds fee', async function () {
    const { etherPool } = await loadFixture(fixture)
    const fieldSize = await etherPool.FIELD_SIZE()
    const result = await etherPool.calculatePublicAmount(
      ethers.parseEther('-0.1'),
      ethers.parseEther('0.01'),
    )
    expect(result).to.be.equal(fieldSize - ethers.parseEther('0.11'))
  })

  it('should accept deposit with zero fee', async function () {
    const { etherPool } = await loadFixture(fixture)
    const result = await etherPool.calculatePublicAmount(ethers.parseEther('0.1'), 0)
    expect(result).to.be.equal(ethers.parseEther('0.1'))
  })

  it('should accept withdrawal with zero fee', async function () {
    const { etherPool } = await loadFixture(fixture)
    const fieldSize = await etherPool.FIELD_SIZE()
    const result = await etherPool.calculatePublicAmount(ethers.parseEther('-0.1'), 0)
    expect(result).to.be.equal(fieldSize - ethers.parseEther('0.1'))
  })

  it('admin can pause and unpause', async () => {
    const { etherPool, admin } = await loadFixture(fixture)

    expect(await etherPool.paused()).to.be.false

    await etherPool.connect(admin).pause()
    expect(await etherPool.paused()).to.be.true

    await etherPool.connect(admin).unpause()
    expect(await etherPool.paused()).to.be.false
  })

  it('non-admin cannot pause', async () => {
    const { etherPool, sender } = await loadFixture(fixture)
    await expect(
      etherPool.connect(sender).pause(),
    ).to.be.revertedWith('only admin')
  })

  it('non-admin cannot unpause', async () => {
    const { etherPool, admin, sender } = await loadFixture(fixture)
    await etherPool.connect(admin).pause()
    await expect(
      etherPool.connect(sender).unpause(),
    ).to.be.revertedWith('only admin')
  })

  it('transact is blocked when paused', async function () {
    const { etherPool, admin, encryptionKey } = await loadFixture(fixture)
    const tree = createEmptyTree()

    const depositAmount = ethers.parseEther('0.05')
    const utxo = new Utxo({ amount: depositAmount })
    const { args, extData } = await prepareTransaction({
      tree,
      outputs: [utxo],
      encryptionKey,
    })

    await etherPool.connect(admin).pause()

    await expect(
      etherPool.transact(args, extData, {
        value: depositAmount,
        gasLimit: 50e6,
      }),
    ).to.revert(ethers)
  })

  it('transact works after unpause', async function () {
    const { etherPool, admin, encryptionKey } = await loadFixture(fixture)
    const tree = createEmptyTree()

    await etherPool.connect(admin).pause()
    await etherPool.connect(admin).unpause()

    const depositAmount = ethers.parseEther('0.05')
    const utxo = new Utxo({ amount: depositAmount })
    await transaction({ etherPool, tree, outputs: [utxo], encryptionKey })

    expect(await ethers.provider.getBalance((await etherPool.getAddress()))).to.be.equal(depositAmount)
  })

  it('should be compliant', async function () {
    // basically verifier should check if a commitment and a nullifier hash are on chain
    const { etherPool, encryptionKey } = await loadFixture(fixture)
    const tree = createEmptyTree()
    const aliceDepositAmount = ethers.parseEther('0.07')
    const aliceDepositUtxo = new Utxo({ amount: aliceDepositAmount })
    const [sender] = await ethers.getSigners()

    const { args, extData, outputs: depositOutputs } = await prepareTransaction({
      tree,
      outputs: [aliceDepositUtxo],
      encryptionKey,
    })
    const receipt = await etherPool.transact(args, extData, {
      value: aliceDepositAmount,
      gasLimit: 50e6,
    })
    await receipt.wait()
    for (const output of depositOutputs) {
      tree.insert(toFixedHex(output.getCommitment()))
    }

    // withdrawal
    await transaction({
      etherPool, tree,
      inputs: [aliceDepositUtxo],
      outputs: [],
      recipient: sender.address,
      encryptionKey,
    })

    const commitment = aliceDepositUtxo.getCommitment()
    const index = tree.indexOf(toFixedHex(commitment))
    aliceDepositUtxo.index = index
    const nullifier = aliceDepositUtxo.getNullifier()

    // commitment = hash(amount, pubKey, blinding, mintAddress)
    // nullifier = hash(commitment, merklePath, sign(merklePath, privKey))
    const dataForVerifier = {
      commitment: {
        amount: aliceDepositUtxo.amount,
        pubkey: aliceDepositUtxo.keypair.pubkey,
        blinding: aliceDepositUtxo.blinding,
        mintAddress: aliceDepositUtxo.mintAddress,
      },
      nullifier: {
        commitment,
        merklePath: index,
        signature: aliceDepositUtxo.keypair.sign(commitment, index),
      },
    }

    // generateReport(dataForVerifier) -> compliance report
    // on the verifier side we compute commitment and nullifier and then check them onchain
    const commitmentV = poseidonHash([...Object.values(dataForVerifier.commitment)])
    const nullifierV = poseidonHash([
      commitmentV,
      dataForVerifier.nullifier.merklePath,
      dataForVerifier.nullifier.signature,
    ])

    expect(commitmentV.toString()).to.be.equal(commitment.toString())
    expect(nullifierV.toString()).to.be.equal(nullifier.toString())
    expect(await etherPool.nullifierHashes(toFixedHex(nullifierV))).to.be.equal(true)
    // expect commitmentV present onchain (it will be in NewCommitment events)

    // in report we can see the tx with NewCommitment event (this is how alice got money)
    // and the tx with NewNullifier event is where alice spent the UTXO
  })
})

describe('toFixedHex negative numbers', function () {
  it('should produce correct length for positive numbers', function () {
    const result = toFixedHex(5)
    expect(result).to.have.lengthOf(66) // "0x" + 64 hex chars
    expect(result).to.equal('0x' + '0'.repeat(63) + '5')
    expect(BigNumber.from(result).toNumber()).to.equal(5)
  })

  it('should roundtrip negative numbers through BigNumber', function () {
    const values = [-1, -5, -1000, '-1000000000000000000']
    for (const v of values) {
      const hex = toFixedHex(v)
      const recovered = BigNumber.from(hex)
      expect(recovered.eq(BigNumber.from(v))).to.be.true
    }
  })

  it('should roundtrip negative numbers through toFixedHex', function () {
    const neg = toFixedHex(-5)
    expect(BigNumber.from(neg).toNumber()).to.equal(-5)
  })

  it('should produce correct extDataHash with negative extAmount', function () {
    const extData = {
      recipient: toFixedHex('0x' + '1'.repeat(40), 20),
      extAmount: toFixedHex(ethers.parseEther('-0.1')),
      feeRecipient: toFixedHex(0, 20),
      fee: toFixedHex(0),
      encryptedOutput1: '0x00',
      encryptedOutput2: '0x00',
    }
    // should not throw
    const hash = getExtDataHash(extData)
    expect(hash).to.not.be.undefined
  })
})
