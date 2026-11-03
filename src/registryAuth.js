// Registry authentication derived from the sign-in signature (single wallet prompt).
//
// The wallet signs ONE message (the sign-in message). From that signature the client derives, locally:
//   AES key      = keccak256(signInSig)                                   (encrypts burner keys; never leaves the client)
//   registry key = keccak256(signInSig || utf8("blackpool/registry-auth/v1"))
//   authSig      = Wallet(registry key).signMessage(REGISTRY_AUTH_MESSAGE)
// The backend ecrecovers authSig -> address(registry key) = the owner id for the burner registry and the intent
// registry. Neither the owner address nor authSig can be inverted to the AES key, so the backend still cannot
// decrypt anything (non-custodial). This file is the single source of truth for the derivation on the backend;
// frontend/app/lib/burner.ts and cli/bin/blackpool.js implement the identical bytes.
'use strict'
const { ethers } = require('ethers5')

const REGISTRY_AUTH_DOMAIN = 'blackpool/registry-auth/v1'
const REGISTRY_AUTH_MESSAGE =
  'Blackpool Registry\n\nAuthorize access to your encrypted recovery data.\nThis does not move funds and does not expose your account keys.'

function registryKeyFromSignIn(signInSig) {
  return ethers.utils.keccak256(ethers.utils.concat([ethers.utils.arrayify(signInSig), ethers.utils.toUtf8Bytes(REGISTRY_AUTH_DOMAIN)]))
}
function registryOwnerFromSignIn(signInSig) {
  return ethers.utils.computeAddress(registryKeyFromSignIn(signInSig)).toLowerCase()
}
async function registryAuthSigFromSignIn(signInSig) {
  return new ethers.Wallet(registryKeyFromSignIn(signInSig)).signMessage(REGISTRY_AUTH_MESSAGE)
}

module.exports = { REGISTRY_AUTH_DOMAIN, REGISTRY_AUTH_MESSAGE, registryKeyFromSignIn, registryOwnerFromSignIn, registryAuthSigFromSignIn }
