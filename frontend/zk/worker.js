/* Blackpool proving worker (bundled to /zk/worker.js by frontend/zk/build.sh).
 *
 * Runs the same local-proving code as the CLI (cli/lib/localApi.js) off the main thread. The sign-in signature
 * arrives by postMessage, keys are derived and kept in this worker's memory only, proofs are generated here and
 * only finished proofs leave the device (POST /api/relay). No localStorage, sessionStorage, IndexedDB or Cache
 * API is used: the circuit files are fetched over HTTP (immutable, browser-cached) and held in memory.
 */
const { createLocalApi } = require('../../cli/lib/localApi')
const snarkjs = require('snarkjs')

let api = ''
let local = null
let circuit = null
let circuitLoading = null
let singleThread = false

const post = (m) => self.postMessage(m)
const progress = (p) => post({ progress: p })

async function request(method, path, body) {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(`${api}${path}`, {
      method,
      headers: method === 'GET' ? {} : { 'Content-Type': 'application/json' },
      body: method === 'GET' ? undefined : JSON.stringify(body || {}),
    })
    const json = await r.json().catch(() => ({}))
    if (r.status === 429 && attempt < 4) {
      await new Promise((res) => setTimeout(res, Math.min(Math.max(Number(json.retryAfter) || 5, 1), 30) * 1000))
      continue
    }
    if (!r.ok) throw new Error(json.error || `API error ${r.status}`)
    return json
  }
}

async function sha256(buf) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', buf))
  return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('')
}

async function fetchFile(f, kind) {
  const r = await fetch(f.path)
  if (!r.ok) throw new Error(`proving key download failed (${kind}: HTTP ${r.status})`)
  const total = Number(r.headers.get('content-length')) || f.bytes || 0
  let buf
  if (r.body && r.body.getReader && total) {
    const reader = r.body.getReader()
    const out = new Uint8Array(total)
    let got = 0
    let last = -1
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (got + value.length > out.length) throw new Error('proving key larger than announced')
      out.set(value, got)
      got += value.length
      const pct = Math.floor((got / total) * 100)
      if (pct !== last) { last = pct; progress({ stage: 'download', file: kind, pct }) }
    }
    buf = out.subarray(0, got)
  } else {
    buf = new Uint8Array(await r.arrayBuffer())
  }
  if ((await sha256(buf)) !== f.sha256) throw new Error(`proving key checksum mismatch (${kind})`)
  return buf
}

function loadCircuit() {
  if (circuit) return Promise.resolve(circuit)
  if (!circuitLoading) {
    circuitLoading = (async () => {
      const r = await fetch('/zk/manifest.json', { cache: 'no-cache' })
      if (!r.ok) throw new Error('proving key manifest unavailable')
      const m = await r.json()
      const wasm = await fetchFile(m.wasm, 'wasm')
      const zkey = await fetchFile(m.zkey, 'zkey')
      circuit = { wasm, zkey }
      return circuit
    })().catch((e) => { circuitLoading = null; throw e })
  }
  return circuitLoading
}

function makeLocal() {
  local = createLocalApi({ request, loadCircuit, snarkjs, singleThread, onProgress: progress })
}

self.onmessage = async ({ data }) => {
  const { id, op } = data || {}
  try {
    if (op === 'init') { api = data.apiBase || ''; makeLocal(); return post({ id, ok: true }) }
    if (op === 'warm') { await loadCircuit(); return post({ id, ok: true }) }
    if (op === 'forget') { if (local) local.forget(); return post({ id, ok: true }) }
    if (op === 'call') {
      if (!local) makeLocal()
      try {
        return post({ id, ok: true, result: await local.handle(data.path, data.body) })
      } catch (e) {
        // Browsers without nested-worker support fail inside snarkjs' thread pool: retry on one thread.
        const msg = String((e && e.message) || e)
        if (!singleThread && /worker|thread|blob/i.test(msg)) { singleThread = true; makeLocal(); return post({ id, ok: true, result: await local.handle(data.path, data.body) }) }
        throw e
      }
    }
    throw new Error(`unknown op ${op}`)
  } catch (e) {
    post({ id, ok: false, error: String((e && e.message) || e) })
  }
}
