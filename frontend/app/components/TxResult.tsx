'use client'
import { useEffect, useState } from 'react'

// Block explorer base URLs per chain. Used to turn a bare tx hash into a clickable link.
const EXPLORERS: Record<string, string> = {
  Base:      'https://basescan.org',
  Robinhood: 'https://robin.etherscan.io',
  Ethereum:  'https://etherscan.io',
  Arbitrum:  'https://arbiscan.io',
  BSC:       'https://bscscan.com',
  Solana:    'https://solscan.io',
}

export function explorerTxUrl(chain: string, hash: string): string {
  const base = EXPLORERS[chain] || EXPLORERS.Base
  return `${base}/tx/${hash}`
}

export function explorerAddressUrl(chain: string, address: string): string {
  const base = EXPLORERS[chain] || EXPLORERS.Base
  return `${base}/address/${address}`
}

export function explorerHomeUrl(chain: string): string {
  return EXPLORERS[chain] || EXPLORERS.Base
}

// Human label for the explorer of a given chain (Base -> Basescan, Robinhood -> Etherscan).
const EXPLORER_NAMES: Record<string, string> = {
  Base:      'Basescan',
  Robinhood: 'Etherscan',
  Ethereum:  'Etherscan',
  Arbitrum:  'Arbiscan',
  BSC:       'BscScan',
  Solana:    'Solscan',
}
export function explorerName(chain: string): string {
  return EXPLORER_NAMES[chain] || 'Explorer'
}

function short(hash: string): string {
  return hash.length > 16 ? `${hash.slice(0, 10)}...${hash.slice(-8)}` : hash
}

// Tx result chip: shows a labelled explorer link, auto-hides after `hideAfter` ms (default 12s).
// Pass multiple entries for bridge (source chain + destination chain).
export function TxResult({ entries, hideAfter = 12000 }: {
  entries: { label: string, chain: string, hash: string }[]
  hideAfter?: number
}) {
  const [visible, setVisible] = useState(true)
  // reset visibility + timer whenever the set of hashes changes
  const key = entries.map(e => e.hash).join(',')
  useEffect(() => {
    setVisible(true)
    if (!key) return
    const t = setTimeout(() => setVisible(false), hideAfter)
    return () => clearTimeout(t)
  }, [key, hideAfter])

  if (!visible || entries.length === 0) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10, animation: 'bp-fade .3s ease' }}>
      <style>{`@keyframes bp-fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}`}</style>
      {entries.map((e, i) => (
        <a
          key={i}
          href={explorerTxUrl(e.chain, e.hash)}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none',
            background: 'var(--color-bg3)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-pill)', padding: '8px 14px',
            fontFamily: 'var(--font-mono)', fontSize: 11.5, letterSpacing: '-0.02em',
            color: 'var(--color-fg2)', transition: 'border-color 0.2s ease, background 0.2s ease',
          }}
        >
          <span style={{ color: 'var(--color-muted)', textTransform: 'uppercase' }}>{e.label}</span>
          <span style={{ color: 'var(--color-accent)', flex: 1 }}>{short(e.hash)}</span>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-muted)', flexShrink: 0 }} aria-hidden="true">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
        </a>
      ))}
    </div>
  )
}
