'use strict'
// Proving-key loader for Node (CLI and its MCP server). Downloads the Groth16 circuit files once from the
// published manifest, verifies their SHA-256 and keeps them in <BLACKPOOL_HOME>/zk/. These files are public
// (the same ones the pool verifier was generated from); nothing secret is written.
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const MANIFEST_URL = process.env.BLACKPOOL_ZK_MANIFEST || 'https://blackpool.cash/zk/manifest.json'

function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex') }

function createCircuitLoader({ dir, userAgent = 'blackpool-cli' }) {
  let cached = null
  return async function loadCircuit(onProgress = () => {}) {
    if (cached) return cached
    fs.mkdirSync(dir, { recursive: true })
    const local = (name) => path.join(dir, name)
    let manifest
    try {
      const r = await fetch(MANIFEST_URL, { headers: { 'User-Agent': userAgent }, signal: AbortSignal.timeout(30_000) })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      manifest = await r.json()
      fs.writeFileSync(local('manifest.json'), JSON.stringify(manifest))
    } catch (e) {
      // offline: fall back to the last manifest whose files are already here
      if (!fs.existsSync(local('manifest.json'))) throw new Error(`cannot fetch the proving-key manifest (${e.message})`)
      manifest = JSON.parse(fs.readFileSync(local('manifest.json'), 'utf8'))
    }
    const out = {}
    for (const kind of ['wasm', 'zkey']) {
      const f = manifest[kind]
      const name = path.basename(f.path)
      const file = local(name)
      let buf = fs.existsSync(file) ? fs.readFileSync(file) : null
      if (!buf || sha256(buf) !== f.sha256) {
        onProgress({ stage: 'download', file: kind, bytes: f.bytes })
        const url = new URL(f.path, MANIFEST_URL).toString()
        const r = await fetch(url, { headers: { 'User-Agent': userAgent }, signal: AbortSignal.timeout(300_000) })
        if (!r.ok) throw new Error(`download ${name}: HTTP ${r.status}`)
        buf = Buffer.from(await r.arrayBuffer())
        if (sha256(buf) !== f.sha256) throw new Error(`download ${name}: checksum mismatch`)
        fs.writeFileSync(file + '.tmp', buf)
        fs.renameSync(file + '.tmp', file)
        for (const old of fs.readdirSync(dir)) if (old !== name && old.endsWith('.' + kind)) fs.rmSync(local(old), { force: true })
      }
      out[kind] = new Uint8Array(buf)
    }
    cached = out
    return out
  }
}

module.exports = { createCircuitLoader, MANIFEST_URL }
