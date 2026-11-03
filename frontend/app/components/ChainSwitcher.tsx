'use client'
import { useState, useRef, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { switchWalletChain } from '../lib/walletChain'

// full:true = chain has private pools (shield/send/swap/withdraw). full:false = bridge destination only.
const CHAINS = [
  { id: 4663, name: 'Robinhood', logo: '/token_logos/robinhood.png?v=2', full: true },
  { id: 8453, name: 'Base', logo: '/token_logos/base.png', full: true },
  { id: 42161, name: 'Arbitrum', logo: '/token_logos/arbitrum.png', full: true },
  { id: 56, name: 'BNB Chain', logo: '/token_logos/bsc.png', full: true },
]

// chain IDs that have private pools (can shield/withdraw/swap). Others are bridge-only.
const POOL_CHAIN_IDS = CHAINS.filter(c => c.full).map(c => c.id)

// Network switcher. The switch is requested from the wallet directly (see lib/walletChain.ts), so the button
// never stays on "Switching..." when a wallet skips the chainChanged event; a rejected or unanswered request
// shows a short note instead.
export function ChainSwitcher() {
  const [open, setOpen] = useState(false)
  const [switching, setSwitching] = useState<number | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const { chainId, isConnected, connector } = useAccount()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  useEffect(() => {
    if (!note) return
    const t = setTimeout(() => setNote(null), 6000)
    return () => clearTimeout(t)
  }, [note])

  const wrongForPool = isConnected && !POOL_CHAIN_IDS.includes(chainId as number)
  const active = CHAINS.find(c => c.id === chainId) || (wrongForPool ? { id: 0, name: 'Wrong network', logo: '', full: false } : CHAINS[0])

  const pick = async (id: number) => {
    setOpen(false)
    setNote(null)
    if (id === chainId) return
    if (!isConnected) { setNote('Connect a wallet first.'); return }
    setSwitching(id)
    try {
      await switchWalletChain(connector, id)
    } catch (e: any) {
      setNote(e?.message || 'The wallet could not switch network.')
    } finally {
      setSwitching(null)
    }
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        className="chain_btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Network: ${active.name}`}
        onClick={() => setOpen(o => !o)}
        style={{ minWidth: 100, padding: '7px 14px', border: `1px solid ${wrongForPool ? '#b4884d' : 'var(--color-border)'}`, borderRadius: 'var(--radius-pill)', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '-0.02em', background: 'var(--color-bg3)', color: 'var(--color-fg2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, userSelect: 'none' }}
        title={wrongForPool ? 'Switch to a pool chain (Robinhood, Base, Arbitrum, BNB) to shield or withdraw' : 'Network'}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {active.logo ? <img src={active.logo} style={{ width: 16, height: 16, flexShrink: 0 }} alt="" /> : <span style={{ width: 8, height: 8, borderRadius: 4, background: '#b4884d', flexShrink: 0 }} />}
          <span className="chain_name">{switching ? 'Switching...' : active.name}</span>
        </span>
        <div style={{ width: 16, height: 16, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.7 14.7a1 1 0 01-1.4 0l-5-5a1 1 0 011.4-1.4L12 12.6l4.3-4.3a1 1 0 011.4 1.4l-5 5z" /></svg>
        </div>
      </button>
      {note && !open && (
        <div role="status" style={{ position: 'absolute', top: '100%', left: 0, marginTop: 6, background: 'var(--color-bg1)', border: '1px solid rgba(255,180,80,.35)', borderRadius: 10, padding: '8px 10px', fontSize: 12, color: '#ffb450', zIndex: 99, width: 240, lineHeight: 1.4 }}>
          {note}
        </div>
      )}
      {open && (
        <div className="chain_menu" style={{ position: 'absolute', top: '100%', left: 0, marginTop: 6, background: 'var(--color-bg1)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-card)', boxShadow: '0 8px 24px rgba(0,0,31,.6)', zIndex: 99, padding: 6, minWidth: 190 }}>
          {CHAINS.map(c => {
            const isActive = c.id === chainId
            return (
              <div
                key={c.id}
                className="wallet-item"
                role="option"
                aria-selected={isActive}
                onClick={() => pick(c.id)}
                style={{ padding: '8px 12px', background: isActive ? 'var(--color-primary)' : 'transparent', borderRadius: 'var(--radius-pill)', display: 'flex', alignItems: 'center', gap: 8, color: isActive ? 'var(--color-on-primary)' : 'var(--color-fg2)', cursor: 'pointer' }}
              >
                <img src={c.logo} style={{ width: 18, height: 18 }} alt={c.name} />
                <span style={{ fontSize: 14 }}>{c.name}</span>
                {!c.full && <span style={{ marginLeft: 'auto', color: '#b4884d', fontSize: 10.5, fontWeight: 600 }}>bridge only</span>}
                {isActive && c.full && <span style={{ marginLeft: 'auto', color: '#91ffa3', fontSize: 12 }}>●</span>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
