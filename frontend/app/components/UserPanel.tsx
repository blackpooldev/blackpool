'use client'
import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { explorerAddressUrl, explorerName } from './TxResult'
import { type Intent, TERMINAL, statusOf, shortAddr, ago, amt } from '../lib/useBridges'

// Connected-wallet panel. Desktop: dropdown under the address chip. Phones (<= 560px): bottom sheet with a scrim.
// Holds the account actions and the account's private bridges (newest first); older ones and recovery live on /recover.
// The chip shows a live badge while bridges are in flight. Design: Figma "Blackpool — Stepper motion", page "Wallet — bridges".
const LIST_MAX = 5

export function UserPanel({ address, onDisconnect, chainLabel = 'Base', bridges = [], assetInfo, open, onOpenChange, onOpen }: {
  address: string
  onDisconnect: () => void
  chainLabel?: string
  bridges?: Intent[]
  assetInfo?: (k: string) => { symbol: string; chain: string }
  open: boolean
  onOpenChange: (v: boolean) => void
  onOpen?: () => void // refresh the bridge list when the panel opens
}) {
  const [copied, setCopied] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  // Phones get a bottom sheet rendered into <body>: the navbar's backdrop-filter would otherwise become the
  // containing block of position:fixed and pin the sheet to the header.
  const [sheet, setSheet] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 560px)')
    const on = () => setSheet(mq.matches)
    on(); mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  const setOpen = (v: boolean) => { if (v && !open) onOpen?.(); onOpenChange(v) }

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (ref.current?.contains(t) || menuRef.current?.contains(t)) return
      onOpenChange(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onOpenChange(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open, onOpenChange])

  const short = `${address.slice(0, 6)}...${address.slice(-4)}`
  const copy = async () => {
    try { await navigator.clipboard.writeText(address); setCopied(true); setTimeout(() => setCopied(false), 1200) } catch {}
  }
  const pending = bridges.filter((b) => !TERMINAL.has(b.status)).length
  const info = assetInfo || ((k: string) => ({ symbol: k, chain: '' }))
  const list = bridges.slice(0, LIST_MAX)
  const wrapSheet = (el: React.ReactNode) => (sheet && typeof document !== 'undefined' ? createPortal(el, document.body) : el)

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        className="user_panel_btn"
        style={{ cursor: 'pointer', gap: 6, padding: '5px 10px', ...(open ? { borderColor: 'var(--color-accent)' } : {}) }}
        onClick={() => setOpen(!open)}
        title={pending ? `${pending} bridge${pending > 1 ? 's' : ''} in progress` : 'Account'}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {pending > 0 ? (
          <span className="up-badge" aria-label={`${pending} bridge${pending > 1 ? 's' : ''} in progress`}>
            <i className="bs-dot" aria-hidden />{pending}
          </span>
        ) : <span style={{ color: '#91ffa3' }}>●</span>}
        <span className="addr_long">{short}</span>
        <span className="addr_short">{`${address.slice(0, 4)}…${address.slice(-4)}`}</span>
        <div style={{ width: 14, height: 14, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s', display: 'flex' }}>
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.7 14.7a1 1 0 01-1.4 0l-5-5a1 1 0 011.4-1.4L12 12.6l4.3-4.3a1 1 0 011.4 1.4l-5 5z" /></svg>
        </div>
      </button>
      {open && wrapSheet(
        <>
          <div className="user_panel_scrim" onClick={() => onOpenChange(false)} aria-hidden />
          <div ref={menuRef} className="user_panel_menu" role="dialog" aria-label="Account and bridges">
            <div className="up-grab" aria-hidden><span /></div>
            <div className="up-head">
              <div style={{ minWidth: 0 }}>
                <div className="up-kicker">Connected · {chainLabel}</div>
                <div style={{ fontSize: 15, color: 'var(--color-fg1)', fontFamily: 'var(--font-mono)', fontWeight: 500 }}>{short}</div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button type="button" className="up-icon" onClick={copy} title={copied ? 'Copied' : 'Copy address'} aria-label="Copy address">
                  {copied
                    ? <svg viewBox="0 0 24 24" fill="none" stroke="#91ffa3" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                    : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>}
                </button>
                <a className="up-icon" href={explorerAddressUrl(chainLabel, address)} target="_blank" rel="noopener noreferrer" title={`View on ${explorerName(chainLabel)}`} aria-label={`View on ${explorerName(chainLabel)}`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><path d="M15 3h6v6" /><path d="M10 14L21 3" /></svg>
                </a>
              </div>
            </div>

            <div className="up-section">
              <div className="up-section-h">
                <span className="up-kicker" style={{ margin: 0 }}>Private bridges</span>
                {pending > 0 && <span style={{ fontSize: 11.5, fontWeight: 500, color: '#91ffa3' }}>{pending} in progress</span>}
              </div>
              {list.length === 0 ? (
                <div className="up-empty">No private bridges yet.</div>
              ) : list.map((b) => <BridgeRow key={b.depositAddress} b={b} info={info} />)}
              {list.length > 0 && <div className="up-note">Bridges keep running after you close the tab.{bridges.length > LIST_MAX ? ' Older ones are in History & recovery.' : ''}</div>}
            </div>

            <div className="up-foot">
              <a href="/recover" className="up-row" style={{ color: 'var(--color-fg2)' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3 2" /></svg>
                <span style={{ flex: 1 }}>History &amp; recovery</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="#6e7074" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="m9 18 6-6-6-6" /></svg>
              </a>
              <button type="button" className="up-row" style={{ color: '#ff8d8d' }} onClick={() => { onOpenChange(false); onDisconnect() }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></svg>
                <span style={{ flex: 1 }}>Disconnect</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function BridgeRow({ b, info }: { b: Intent; info: (k: string) => { symbol: string; chain: string } }) {
  const st = statusOf(b.status)
  const from = info(b.fromAsset), to = info(b.toAsset)
  const tone = st.tone === 'ok' ? { fg: '#34c77b', bg: 'rgba(52,199,123,0.14)' } : st.tone === 'warn' ? { fg: '#ffb450', bg: 'rgba(255,180,80,0.14)' } : { fg: '#91ffa3', bg: 'rgba(145,255,163,0.14)' }
  const out = amt(b.amountOut || b.amountOutQuote)
  const detail = b.status === 'SUCCESS'
    ? `${out ? `received ${out} ${to.symbol}` : 'delivered'} · to ${shortAddr(b.recipient)}`
    : (b.status === 'REFUNDED' || b.status === 'FAILED' || b.status === 'INCOMPLETE_DEPOSIT')
      ? `refund to ${shortAddr(b.refundTo)} on ${from.chain}`
      : `to ${shortAddr(b.recipient)}`
  return (
    <div className={`up-bridge${st.tone === 'live' ? ' live' : ''}`}>
      <div className="up-l1">
        <span className="up-route">
          <b>{amt(b.amountIn)} {from.symbol}</b> <span>{from.chain}</span> <span className="up-arrow">→</span> <span>{to.chain}{to.symbol !== from.symbol ? ` · ${to.symbol}` : ''}</span>
        </span>
        <span className="up-pill" style={{ color: tone.fg, background: tone.bg }}>
          {st.tone === 'live' && <i className="bs-dot" aria-hidden style={{ background: tone.fg }} />}{st.text}
        </span>
      </div>
      <div className="up-l2">
        <span className="up-detail">{detail}</span>
        <span>{ago(b.createdAt)}</span>
        <a href={b.statusUrl} target="_blank" rel="noopener noreferrer" title="Track on the solver explorer" aria-label="Track">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7M9 7h8v8" /></svg>
        </a>
      </div>
    </div>
  )
}
