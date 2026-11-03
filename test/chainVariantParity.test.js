// Guards against production DRIFT between chains that intentionally share the BLACKPOOL-native
// contract variant. robinhood/ and arbitrum/ carry byte-identical source (same privacyblackpool zero
// family, same pool logic) - they are duplicated per-chain only for folder clarity + Arbiscan/
// explorer verification metadata. If someone upgrades one chain's pool and forgets the other,
// the source hashes diverge and this test fails, catching the drift before deploy.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { expect } from 'chai'
import { ROOT } from './helpers.js'

const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')

describe('Chain variant parity (drift guard)', () => {
  const files = [
    'MerkleTreeWithHistoryL2.sol',
    'BlackpoolEtherPoolL2.sol',
    'BlackpoolERCPoolL2.sol',
  ]
  for (const f of files) {
    it(`robinhood/${f} == arbitrum/${f} (source byte-identical)`, () => {
      const rh = sha(path.join(ROOT, 'contracts/robinhood', f))
      const arb = sha(path.join(ROOT, 'contracts/arbitrum', f))
      expect(arb, `arbitrum/${f} drifted from robinhood/${f} - BLACKPOOL-native variant must stay in sync`).to.equal(rh)
    })
  }
})
