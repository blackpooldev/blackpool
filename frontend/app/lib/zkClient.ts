'use client'
// Main-thread bridge to the proving worker (/zk/worker.js).
//
// The five calls that used to send the sign-in signature to the API (balance, withdraw, deposit/prepare, swap,
// swap-private) now run in the worker, on this device, with the same request/response shapes. The signature is
// passed to the worker by postMessage and kept in memory only; the API receives public data requests and
// finished proofs. Nothing here touches localStorage, sessionStorage or IndexedDB.

export const LOCAL_ZK_PATHS = new Set(['/api/balance', '/api/withdraw', '/api/deposit/prepare', '/api/swap', '/api/swap-private'])

export type ZkProgress = { stage: 'download' | 'circuit' | 'scan' | 'prove' | 'relay'; file?: string; pct?: number; pool?: string }

let worker: Worker | null = null
let seq = 0
const waiting = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
const listeners = new Set<(p: ZkProgress) => void>()

function getWorker(): Worker {
  if (worker) return worker
  const w = new Worker('/zk/worker.js')
  w.onmessage = (ev: MessageEvent) => {
    const m = ev.data || {}
    if (m.progress) { listeners.forEach((fn) => fn(m.progress as ZkProgress)); return }
    const p = waiting.get(m.id)
    if (!p) return
    waiting.delete(m.id)
    if (m.ok) p.resolve(m.result)
    else p.reject(new Error(m.error || 'local proving failed'))
  }
  w.onerror = (ev) => {
    const err = new Error(ev.message || 'proving worker crashed')
    waiting.forEach((p) => p.reject(err))
    waiting.clear()
    worker = null
  }
  worker = w
  const apiBase = process.env.NEXT_PUBLIC_API_URL || ''
  send('init', { apiBase }).catch(() => {})
  return w
}

function send(op: string, extra: Record<string, unknown> = {}): Promise<any> {
  const w = worker || getWorker()
  const id = ++seq
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject })
    w.postMessage({ id, op, ...extra })
  })
}

/** Runs one of LOCAL_ZK_PATHS on this device. */
export function zkCall(path: string, body: Record<string, unknown>): Promise<any> {
  return send('call', { path, body })
}

/** Starts downloading the proving key in the background (first use only; the browser caches it). */
export function zkWarm(): void {
  send('warm').catch(() => {})
}

/** Drops every key the worker derived (sign-out / account switch). */
export function zkForget(): void {
  if (worker) send('forget').catch(() => {})
}

export function onZkProgress(fn: (p: ZkProgress) => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}
