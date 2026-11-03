'use client'
import { useState, useEffect, useRef } from 'react'

const API = process.env.NEXT_PUBLIC_API_URL || 'https://api.blackpool.cash'
const CACHE_MS = 60_000 // 60s matches backend TTL

// In-memory shared cache (across all hook instances in the same page load). Keyed by symbol.
const _cache: Record<string, { price: number; at: number }> = {}

/**
 * Hook: live USD price for a token symbol ('ETH', 'BNB', 'USDC', 'USDG', 'USDT').
 * Returns { usdPrice: number | null, loading: boolean }.
 * Auto-refreshes every 60s. Stables short-circuit to $1.00 to avoid needless network calls.
 */
export function useUsdPrice(symbol: string): { usdPrice: number | null; loading: boolean } {
  const [price, setPrice] = useState<number | null>(() => {
    const s = symbol.toUpperCase()
    if (s === 'USDC' || s === 'USDG' || s === 'USDT') return 1 // fast start for stables
    const c = _cache[s]
    return c && Date.now() - c.at < CACHE_MS ? c.price : null
  })
  const [loading, setLoading] = useState(false)
  const sym = symbol.toUpperCase()
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    // Stables: always $1.00 (UI precision only — no accounting depends on this)
    if (sym === 'USDC' || sym === 'USDG' || sym === 'USDT') { setPrice(1); return }

    let cancelled = false
    const fetchPrice = async () => {
      const c = _cache[sym]
      if (c && Date.now() - c.at < CACHE_MS) { setPrice(c.price); return }
      setLoading(true)
      try {
        const r = await fetch(`${API}/api/price?symbols=${sym}`)
        if (!r.ok) throw new Error(`${r.status}`)
        const j = await r.json()
        const p = j.prices?.[sym]
        if (typeof p === 'number' && !cancelled) {
          _cache[sym] = { price: p, at: Date.now() }
          setPrice(p)
        }
      } catch { /* silent — price is a UX nicety, not critical */ }
      if (!cancelled) setLoading(false)
    }
    fetchPrice()
    intervalRef.current = setInterval(fetchPrice, CACHE_MS)
    return () => { cancelled = true; if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [sym])

  return { usdPrice: price, loading }
}

/** Format USD value: $1,234.56 for >= $1, $0.00123 for dust. */
export function fmtUsd(value: number): string {
  if (value >= 1) return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  if (value >= 0.01) return `$${value.toFixed(4)}`
  if (value > 0) return `$${value.toFixed(6)}`
  return '$0'
}
