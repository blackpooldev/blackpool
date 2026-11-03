'use client'
// Private bridges for the signed-in account, read from POST /api/intents with the registry-auth signature (derived
// locally; never the sign-in signature). Shared by the in-progress strip on the form and the wallet panel.
// Polls every 15 s while a bridge is in flight, retries quietly on API errors. Nothing is stored in the browser.
import { useCallback, useEffect, useRef, useState } from 'react'

const API_URL = process.env.NEXT_PUBLIC_API_URL || ''
export const TERMINAL = new Set(['SUCCESS', 'REFUNDED', 'FAILED'])

export type Intent = {
  depositAddress: string; originChain: string; fromAsset: string; toAsset: string; recipient: string; refundTo: string
  amountIn: string; amountOutQuote?: string; amountOut?: string; status: string; createdAt: number; updatedAt: number; statusUrl: string
}

export function useBridges({ enabled, getAuthSig, refreshKey }: { enabled: boolean; getAuthSig: () => Promise<string>; refreshKey?: number }) {
  const [items, setItems] = useState<Intent[]>([])
  const [loaded, setLoaded] = useState(false)
  const [tick, setTick] = useState(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sigRef = useRef(getAuthSig)
  sigRef.current = getAuthSig

  useEffect(() => {
    if (!enabled) { setItems([]); setLoaded(false); return }
    let stop = false
    const load = async () => {
      if (timer.current) clearTimeout(timer.current)
      try {
        const authSig = await sigRef.current()
        const r = await fetch(`${API_URL}/api/intents`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ authSig }) })
        if (!r.ok) throw new Error(String(r.status))
        const j = await r.json()
        if (stop) return
        const list: Intent[] = [...(j.intents || [])].sort((a: Intent, b: Intent) => (b.createdAt || 0) - (a.createdAt || 0))
        setItems(list); setLoaded(true)
        if (list.some((it) => !TERMINAL.has(it.status))) timer.current = setTimeout(load, 15_000)
      } catch {
        if (!stop) timer.current = setTimeout(load, 30_000) // API hiccup: try again quietly
      }
    }
    load()
    return () => { stop = true; if (timer.current) clearTimeout(timer.current) }
  }, [enabled, refreshKey, tick])

  const refresh = useCallback(() => setTick((t) => t + 1), [])
  const pending = items.filter((it) => !TERMINAL.has(it.status))
  return { items, pending, loaded, refresh }
}

export const STATUS: Record<string, { text: string; tone: 'live' | 'ok' | 'warn' }> = {
  PENDING_DEPOSIT: { text: 'Waiting', tone: 'live' },
  KNOWN_DEPOSIT_TX: { text: 'Bridging', tone: 'live' },
  PROCESSING: { text: 'Bridging', tone: 'live' },
  INCOMPLETE_DEPOSIT: { text: 'Refunding', tone: 'warn' },
  SUCCESS: { text: 'Delivered', tone: 'ok' },
  REFUNDED: { text: 'Refunded', tone: 'warn' },
  FAILED: { text: 'Refunding', tone: 'warn' },
}
export const statusOf = (s: string) => STATUS[s] || { text: s.toLowerCase().replace(/_/g, ' '), tone: 'live' as const }

export const shortAddr = (a: string) => (a && a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a)
export function ago(ms: number) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000))
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return `${Math.round(s / 86400)} d ago`
}
// amounts from the solver come with up to 18 decimals; 6 significant digits is plenty to read
export const amt = (v?: string) => { const n = Number(v); return v && isFinite(n) ? String(+n.toPrecision(6)) : (v || '') }
