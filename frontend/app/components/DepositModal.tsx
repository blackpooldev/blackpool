'use client'
import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { TxResult } from './TxResult'
import { useUsdPrice, fmtUsd } from '../lib/useUsdPrice'

// ⇅ swap arrows for the fiat/token toggle.
function SwapVertIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-fg2)' }}>
      <path d="M7 4v16M7 4l-3 3M7 4l3 3" />
      <path d="M17 20V4M17 20l-3-3M17 20l3-3" />
    </svg>
  )
}

// Conversion line + ⇅ toggle for the deposit input. `amount` is always the token value (what the
// deposit tx uses); fiat mode keeps a local USD string and writes back the token-equivalent.
function DepositConvToggle({ amount, symbol, fiatMode, setFiatMode, fiatText, setFiatText, setAmount, busy }: {
  amount: string; symbol: string; fiatMode: boolean; setFiatMode: (v: boolean) => void
  fiatText: string; setFiatText: (v: string) => void; setAmount: (v: string) => void; busy?: boolean
}) {
  const { usdPrice } = useUsdPrice(symbol)
  const n = parseFloat(amount)
  const hasVal = amount !== '' && !isNaN(n)
  const secondary = !fiatMode
    ? (hasVal && usdPrice != null ? `≈ ${fmtUsd(n * usdPrice)}` : (usdPrice == null ? '' : ''))
    : (hasVal ? `≈ ${(+n.toPrecision(8))} ${symbol}` : '')
  const toggle = () => {
    if (!usdPrice || busy) return
    const next = !fiatMode
    if (next) setFiatText(hasVal ? (n * usdPrice).toFixed(2) : '')
    setFiatMode(next)
  }
  return (
    <div className="amount_box_conv" style={{ paddingRight: 0 }}>
      <span className="amount_box_conv_txt">{secondary || '\u00A0'}</span>
      <button
        onClick={toggle}
        disabled={!usdPrice || busy}
        className="amount_box_swap"
        title={usdPrice ? `Switch to ${fiatMode ? symbol : 'USD'} input` : 'Price unavailable'}
        style={{ cursor: usdPrice && !busy ? 'pointer' : 'default', opacity: usdPrice ? 1 : 0.4 }}
      >
        <SwapVertIcon />
      </button>
      {fiatMode && <span style={{ fontSize: 11, color: 'var(--color-fg3)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>USD</span>}
    </div>
  )
}

// "Top up private balance" deposit popup.
// Isolated from send/swap/bridge forms so its button can never bubble into a send submit.
export function DepositModal({ open, onClose, poolSym, amount, setAmount, onDeposit, busy, txHash, walletBalance, status, chainLabel = 'Base' }: {
  open: boolean
  onClose: () => void
  poolSym: string
  amount: string
  setAmount: (v: string) => void
  onDeposit: () => void
  busy: boolean
  txHash?: string
  walletBalance?: string   // formatted, e.g. "10.971163"
  status?: string          // in-progress status line, e.g. "generating ZK proof..."
  chainLabel?: string      // active chain label (Base | Robinhood) for the explorer link
}) {
  const [fiatMode, setFiatMode] = useState(false)
  const [fiatText, setFiatText] = useState('')
  const { usdPrice } = useUsdPrice(poolSym)
  // Reset fiat text on modal close so the next open starts fresh.
  useEffect(() => { if (!open) { setFiatMode(false); setFiatText('') } }, [open])
  const handleInput = (raw: string) => {
    const v = raw.replace(',', '.')
    if (!fiatMode) { setAmount(v); return }
    setFiatText(v)
    if (v === '' || !usdPrice) { setAmount(''); return }
    const usd = parseFloat(v)
    if (isNaN(usd)) return
    setAmount((usd / usdPrice).toString())
  }
  if (!open || typeof document === 'undefined') return null
  return createPortal(
    <div
      onClick={onClose}
      style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', zIndex: 1045, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, boxSizing: 'border-box' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="deposit-modal-card"
        style={{ width: '100%', background: 'var(--color-bg1)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-card)', boxShadow: '0 12px 40px rgba(0,0,31,.6)', boxSizing: 'border-box' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 19, color: 'var(--color-fg1)' }}>Top up private balance</div>
          <button onClick={onClose} aria-label="Close" title={busy ? 'Close. The deposit keeps running in the background.' : 'Close'} style={{ all: 'unset', cursor: 'pointer', color: 'var(--color-muted)', fontSize: 22, lineHeight: 1, padding: '2px 6px' }}>×</button>
        </div>
        <div style={{ fontSize: 13, color: 'var(--color-muted)', marginBottom: 18, lineHeight: 1.4 }}>
          Add funds to your private balance so you&apos;re able to send privately.
        </div>

        {/* Single bordered amount box: number on top, conversion + ⇅ below, MAX + token pill centered. */}
        <div className="amount_box">
          <div className="amount_box_opt">
            {walletBalance && (
              <span
                onClick={() => { if (!busy) { setAmount(walletBalance); if (fiatMode && usdPrice) setFiatText((parseFloat(walletBalance) * usdPrice).toFixed(2)) } }}
                className="withdraw_max"
                style={{ cursor: busy ? 'default' : 'pointer' }}
              >MAX</span>
            )}
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '-0.02em', color: 'var(--color-fg1)', background: 'var(--color-bg4)', border: '1px solid var(--color-border)', padding: '5px 11px', borderRadius: 'var(--radius-pill)' }}>{poolSym}</span>
          </div>
          <div className="amount_box_main">
            {fiatMode && <span className="amount_box_prefix">$</span>}
            <input
              className="amount_box_input"
              placeholder="0.00"
              inputMode="decimal"
              autoFocus
              value={fiatMode ? fiatText : amount}
              disabled={busy}
              onChange={(e) => handleInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !busy) onDeposit() }}
            />
          </div>
          <DepositConvToggle
            amount={amount} symbol={poolSym}
            fiatMode={fiatMode} setFiatMode={setFiatMode}
            fiatText={fiatText} setFiatText={setFiatText}
            setAmount={setAmount} busy={busy}
          />
        </div>

        {walletBalance && (
          <div style={{ fontSize: 12.5, color: 'var(--color-muted)', marginTop: 8 }}>
            Wallet balance: {walletBalance} {poolSym}
          </div>
        )}

        <button className="btn btn-primary" onClick={onDeposit} disabled={busy} style={{ width: '100%', marginTop: 18 }}>
          {busy && <span style={{ display: 'inline-block', width: 13, height: 13, border: '2px solid rgba(51,51,51,.35)', borderTopColor: '#333', borderRadius: '50%', animation: 'bp-spin .7s linear infinite' }} />}
          <span>{busy ? 'Depositing' : 'Deposit'}</span>
        </button>
        <style>{`@keyframes bp-spin{to{transform:rotate(360deg)}}`}</style>

        {busy && status && (
          <div style={{ fontSize: 12.5, color: 'var(--color-muted)', marginTop: 10, textAlign: 'center' }}>{status}</div>
        )}
        {!busy && txHash && (
          <TxResult entries={[{ label: `Deposit (${chainLabel})`, chain: chainLabel, hash: txHash }]} />
        )}
      </div>
    </div>,
    document.body
  )
}
