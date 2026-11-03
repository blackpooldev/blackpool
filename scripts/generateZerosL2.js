// generateZeros VARIANT for FRESH deployments (Robinhood Chain + any future BLACKPOOL-native pool).
//
// Uses the BLACKPOOL-branded zero value: keccak256("privacyblackpool") % FIELD_SIZE.
// This produces a DIFFERENT Merkle zeros(0) than the original scripts/generateZeros.js
// (legacy upstream seed; not used by any Blackpool deployment).
//
// Only use the output of THIS script for NEW chain deployments where the pool starts empty.
// Never mix: pools with different zero seeds are incompatible.
//
// Run: node scripts/generateZerosL2.js
const { ethers } = require('ethers')
const { poseidon2 } = require('poseidon-lite')

const FIELD_SIZE = BigInt(
  '21888242871839275222246405745257275088548364400416034343698204186575808495617',
)

const zeroValue = BigInt(ethers.utils.keccak256(ethers.utils.toUtf8Bytes('privacyblackpool'))) % FIELD_SIZE

const zeros = [zeroValue]
for (let i = 1; i <= 31; i++) {
  zeros[i] = poseidon2([zeros[i - 1], zeros[i - 1]])
}

console.log('// default `zero` value is keccak256("privacyblackpool") %% FIELD_SIZE')
console.log(`// = ${zeroValue.toString()}\n`)

for (let i = 0; i <= 31; i++) {
  const hex = '0x' + zeros[i].toString(16).padStart(64, '0')
  if (i === 0) {
    console.log(`if (i == ${i}) return bytes32(${hex});`)
  } else {
    console.log(`else if (i == ${i}) return bytes32(${hex});`)
  }
}
