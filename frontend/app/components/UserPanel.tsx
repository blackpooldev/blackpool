'use client'
import { useState, useRef, useEffect } from 'react'
import { explorerAddressUrl, explorerName } from './TxResult'

// Connected-wallet panel: address chip that opens a dropdown (copy address, view on explorer, disconnect).
// Replaces the bare "click chip = disconnect" behavior (accidental disconnects, no affordances).
export function UserPanel({ address, onDisconnect, chainLabel = 'Base' }: { address: string, onDisconnect: () => void, chainLabel?: string }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const short = `${address.slice(0, 6)}...${address.slice(-4)}`
  const copy = async () => {
    try { await navigator.clipboard.writeText(address); setCopied(true); setTimeout(() => setCopied(false), 1200) } catch {}
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        className="user_panel_btn"
        style={{ cursor: 'pointer', gap: 6, padding: '5px 10px' }}
        onClick={() => setOpen(o => !o)}
        title="Account"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span style={{ color: '#91ffa3' }}>●</span>
        <span className="addr_long">{short}</span>
        <span className="addr_short">{`${address.slice(0, 4)}…${address.slice(-4)}`}</span>
        <div style={{ width: 14, height: 14, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s', display: 'flex' }}>
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.7 14.7a1 1 0 01-1.4 0l-5-5a1 1 0 011.4-1.4L12 12.6l4.3-4.3a1 1 0 011.4 1.4l-5 5z" /></svg>
        </div>
      </button>
      {open && (
        <div className="user_panel_menu" style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, background: '#171b26', border: '1px solid #2a3242', borderRadius: 12, boxShadow: '0 10px 30px rgba(0,0,0,.6)', zIndex: 1000, minWidth: 210, overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #232b3a' }}>
            <div style={{ fontSize: 11, color: '#7b8496', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '.04em' }}>Connected</div>
            <div style={{ fontSize: 14, color: '#fff', fontFamily: 'monospace' }}>{short}</div>
          </div>
          <MenuRow onClick={copy} label={copied ? 'Copied' : 'Copy address'} accent={copied ? '#91ffa3' : undefined}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
          </MenuRow>
          <a href={explorerAddressUrl(chainLabel, address)} target="_blank" rel="noopener" style={{ textDecoration: 'none', color: 'inherit' }}>
            <MenuRow label={`View on ${explorerName(chainLabel)}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><path d="M15 3h6v6" /><path d="M10 14L21 3" /></svg>
            </MenuRow>
          </a>
          <MenuRow onClick={() => { setOpen(false); onDisconnect() }} label="Disconnect" accent="#ff8d8d">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></svg>
          </MenuRow>
        </div>
      )}
    </div>
  )
}

function MenuRow({ label, children, onClick, accent }: { label: string, children: React.ReactNode, onClick?: () => void, accent?: string }) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', cursor: 'pointer', background: hover ? '#1e2534' : 'transparent', color: accent || '#d2d7e0', fontSize: 14, transition: 'background .12s' }}
    >
      <div style={{ width: 16, height: 16, display: 'flex', flexShrink: 0 }}>{children}</div>
      <span>{label}</span>
    </div>
  )
}
