'use client'
// Bridges still in flight for this account, shown on /app after sign-in. A private bridge keeps going after the
// tab closes (the relayer broadcast the withdrawal and the solver delivers), so a returning user sees its live
// status here instead of having to find /recover. Reads POST /api/intents with the registry-auth signature (derived
// locally; never the sign-in signature). Polls every 15 s while anything is pending. Nothing is stored.
import { useEffect, useRef, useState } from 'react'

const API_URL = process.env.NEXT_PUBLIC_API_URL || ''
const TERMINAL = new Set(['SUCCESS', 'REFUNDED', 'FAILED'])
const RECENT_MS = 30 * 60_000 // finished bridges stay visible for 30 minutes
const LABEL: Record<string, { text: string; tone: 'wait' | 'ok' | 'warn' }> = {
  PENDING_DEPOSIT: { text: 'Waiting for deposit', tone: 'wait' },
  KNOWN_DEPOSIT_TX: { text: 'Deposit seen', tone: 'wait' },
  PROCESSING: { text: 'Bridging', tone: 'wait' },
  INCOMPLETE_DEPOSIT: { text: 'Partial deposit, refund pending', tone: 'warn' },
  SUCCESS: { text: 'Delivered', tone: 'ok' },
  REFUNDED: { text: 'Refunded', tone: 'warn' },
  FAILED: { text: 'Failed, refunding', tone: 'warn' },
}
const TONE = {
  wait: { fg: '#8fb3ff', bg: 'rgba(91,141,239,0.14)' },
  ok: { fg: '#91ffa3', bg: 'rgba(145,255,163,0.12)' },
  warn: { fg: '#ffb450', bg: 'rgba(255,180,80,0.12)' },
}

type Intent = {
  depositAddress: string; originChain: string; fromAsset: string; toAsset: string; recipient: string; refundTo: string
  amountIn: string; amountOutQuote?: string; amountOut?: string; status: string; createdAt: number; updatedAt: number; statusUrl: string
}

const short = (a: string) => (a && a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a)
function ago(ms: number) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000))
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return `${Math.round(s / 86400)} d ago`
}

export function BridgeWatch({ enabled, getAuthSig, labelOf, refreshKey, hidden }: {
  enabled: boolean
  getAuthSig: () => Promise<string>
  labelOf: (assetKey: string) => string
  refreshKey?: number
  hidden?: boolean
}) {
  const [items, setItems] = useState<Intent[]>([])
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!enabled) { setItems([]); return }
    let stop = false
    const load = async () => {
      try {
        const authSig = await getAuthSig()
        const r = await fetch(`${API_URL}/api/intents`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ authSig }) })
        if (!r.ok) throw new Error(String(r.status))
        const j = await r.json()
        const now = Date.now()
        const list: Intent[] = (j.intents || []).filter((it: Intent) => !TERMINAL.has(it.status) || now - (it.updatedAt || it.createdAt) < RECENT_MS)
        if (stop) return
        setItems(list)
        if (list.some((it) => !TERMINAL.has(it.status))) timer.current = setTimeout(load, 15_000)
      } catch {
        if (!stop) timer.current = setTimeout(load, 30_000) // API hiccup: try again quietly
      }
    }
    load()
    return () => { stop = true; if (timer.current) clearTimeout(timer.current) }
  }, [enabled, refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const visible = items.filter((it) => !dismissed.has(it.depositAddress))
  if (hidden || !visible.length) return null
  const pending = visible.filter((it) => !TERMINAL.has(it.status)).length

  return (
    <div className="bridge-watch" role="status" aria-live="polite" style={{ background: 'rgba(91,141,239,0.06)', border: '1px solid rgba(91,141,239,0.32)', borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
        <div style={{ fontSize: 13, color: '#8fb3ff', fontWeight: 600 }}>
          {pending ? `${pending} bridge${pending > 1 ? 's' : ''} in progress` : 'Recent bridges'}
        </div>
        <a href="/recover" style={{ fontSize: 12, color: '#9aa3b2', textDecoration: 'underline', textUnderlineOffset: 3 }}>All bridges</a>
      </div>
      {pending > 0 && (
        <div style={{ fontSize: 12, color: '#c7cfdb', lineHeight: 1.45 }}>
          Bridges finish on their own, even if you close this tab. If the solver cannot deliver, the funds are refunded on the origin chain.
        </div>
      )}
      {visible.map((it) => {
        const lab = LABEL[it.status] || { text: it.status.toLowerCase().replace(/_/g, ' '), tone: 'wait' as const }
        const tone = TONE[lab.tone]
        const done = TERMINAL.has(it.status)
        return (
          <div key={it.depositAddress} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: '#e6e8eb', fontWeight: 500 }}>
                {it.amountIn} {labelOf(it.fromAsset)} <span style={{ color: '#6e7074' }}>→</span> {labelOf(it.toAsset)}
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: tone.fg, background: tone.bg, borderRadius: 999, padding: '3px 9px', whiteSpace: 'nowrap' }}>
                  {!done && <i className="bw-dot" style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 999, background: tone.fg, marginRight: 6, verticalAlign: 1 }} />}
                  {lab.text}
                </span>
                {done && (
                  <button type="button" aria-label="Dismiss" onClick={() => setDismissed((d) => new Set(d).add(it.depositAddress))}
                    style={{ background: 'none', border: 0, color: '#6e7074', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 2 }}>×</button>
                )}
              </span>
            </div>
            <div style={{ fontSize: 12, color: '#9aa3b2', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <span>to <span style={{ fontFamily: 'monospace' }}>{short(it.recipient)}</span></span>
              {it.status === 'SUCCESS' && (it.amountOut || it.amountOutQuote) && <span>received {it.amountOut || it.amountOutQuote}</span>}
              {(it.status === 'REFUNDED' || it.status === 'FAILED' || it.status === 'INCOMPLETE_DEPOSIT') && <span>refund to <span style={{ fontFamily: 'monospace' }}>{short(it.refundTo)}</span></span>}
              <span>{ago(it.createdAt)}</span>
              <a href={it.statusUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#8fb3ff' }}>Track ↗</a>
            </div>
          </div>
        )
      })}
    </div>
  )
}
