'use client'
// One line above the form while a private bridge is in flight (or just finished). The full list lives in the wallet
// panel; "View" opens it. Bridges keep running after the tab closes, so this also appears for a returning user.
import { useEffect, useState } from 'react'
import { type Intent, TERMINAL, amt } from '../lib/useBridges'

const RECENT_MS = 3 * 60_000 // a finished bridge stays in the strip for 3 minutes

export function BridgeStrip({ items, assetInfo, onView, hidden }: {
  items: Intent[]
  assetInfo: (k: string) => { symbol: string; chain: string }
  onView: () => void
  hidden?: boolean
}) {
  const [, setNow] = useState(0)
  useEffect(() => { const t = setInterval(() => setNow((n) => n + 1), 30_000); return () => clearInterval(t) }, [])
  if (hidden) return null
  const pending = items.filter((it) => !TERMINAL.has(it.status))
  const recent = items.filter((it) => TERMINAL.has(it.status) && Date.now() - (it.updatedAt || it.createdAt) < RECENT_MS)
  if (!pending.length && !recent.length) return null

  let tone: 'live' | 'ok' | 'warn' = 'live'
  let line: string
  if (pending.length > 1) line = `${pending.length} bridges in progress`
  else if (pending.length === 1) {
    const it = pending[0]; const from = assetInfo(it.fromAsset); const to = assetInfo(it.toAsset)
    line = `Bridging ${amt(it.amountIn)} ${from.symbol} to ${to.chain}`
  } else {
    const it = recent[0]; const to = assetInfo(it.toAsset); const from = assetInfo(it.fromAsset)
    if (it.status === 'SUCCESS') { tone = 'ok'; const out = amt(it.amountOut || it.amountOutQuote); line = out ? `Delivered ${out} ${to.symbol} on ${to.chain}` : `Bridge delivered on ${to.chain}` }
    else { tone = 'warn'; line = `Bridge refunded to your wallet on ${from.chain}` }
  }
  const c = tone === 'warn' ? { fg: '#ffb450', bg: 'rgba(255,180,80,0.07)', bd: 'rgba(255,180,80,0.3)' } : { fg: '#91ffa3', bg: 'rgba(52,199,123,0.07)', bd: 'rgba(52,199,123,0.28)' }

  return (
    <button type="button" className="bridge-strip" onClick={onView} aria-label={`${line}. Open bridges`}
      style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', cursor: 'pointer', background: c.bg, border: `1px solid ${c.bd}`, borderRadius: 10, padding: '9px 11px', font: 'inherit' }}>
      {tone === 'ok'
        ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.fg} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6 9 17l-5-5" /></svg>
        : <i className={tone === 'live' ? 'bs-dot' : ''} aria-hidden style={{ width: 7, height: 7, borderRadius: 4, background: c.fg, flexShrink: 0 }} />}
      <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 500, color: 'var(--color-fg2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{line}</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 12.5, fontWeight: 500, color: c.fg, flexShrink: 0 }}>
        View
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m9 18 6-6-6-6" /></svg>
      </span>
    </button>
  )
}
