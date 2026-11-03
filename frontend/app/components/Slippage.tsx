'use client'
import { useState, useRef, useEffect } from 'react'

// Slippage control: label + gear (SVG) trigger, popover with presets + custom bps.
// value = basis points (100 = 1%). 'Smart' = 100 default.
export function SlippageControl({ value, onChange }: { value: number, onChange: (bps: number) => void }) {
  const [open, setOpen] = useState(false)
  const [custom, setCustom] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const presets = [50, 100, 300] // 0.5% / 1% / 3%
  const isPreset = presets.includes(value)

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const pct = (value / 100).toString().replace(/\.0$/, '')
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#4f9cff'; e.currentTarget.style.color = '#fff' }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#333b4a'; e.currentTarget.style.color = '#c7cfdb' }}
        title="Adjust slippage tolerance"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', border: '1px solid #333b4a',
          background: 'rgba(31,41,55,0.5)', color: '#c7cfdb', borderRadius: 8, padding: '5px 9px', fontSize: 12.5, lineHeight: 1,
          transition: 'border-color .15s, color .15s',
        }}
      >
        <GearIcon />
        <span>{isPreset && value === 100 ? 'Smart' : `${pct}%`} slippage</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 6, zIndex: 60, width: 220,
          background: '#161b26', border: '1px solid #2a3242', borderRadius: 12, boxShadow: '0 10px 30px rgba(0,0,0,.6)', padding: 12,
        }}>
          <div style={{ fontSize: 12, color: '#8b93a1', marginBottom: 8 }}>Slippage tolerance</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            {presets.map(p => {
              const active = value === p
              return (
                <button key={p} onClick={() => { onChange(p); setCustom('') }} style={{
                  flex: 1, cursor: 'pointer', borderRadius: 7, padding: '7px 0', fontSize: 12.5, fontWeight: active ? 600 : 500,
                  border: `1px solid ${active ? '#4f9cff' : '#2a3242'}`, background: active ? 'rgba(79,156,255,.12)' : 'transparent',
                  color: active ? '#8bc0ff' : '#c7cfdb',
                }}>
                  {p === 100 ? 'Smart' : `${p / 100}%`}
                </button>
              )
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, border: `1px solid ${!isPreset ? '#4f9cff' : '#2a3242'}`, borderRadius: 7, padding: '6px 9px' }}>
            <input
              value={custom}
              inputMode="decimal"
              placeholder="Custom"
              onChange={e => {
                const v = e.target.value.replace(/[^0-9.]/g, '')
                setCustom(v)
                const bps = Math.round(parseFloat(v) * 100)
                if (!isNaN(bps) && bps >= 10 && bps <= 500) onChange(bps)
              }}
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: 13, width: '100%' }}
            />
            <span style={{ color: '#8b93a1', fontSize: 13 }}>%</span>
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--color-muted)', marginTop: 7 }}>Range 0.1%–5%. Higher tolerates more price movement.</div>
        </div>
      )}
    </div>
  )
}

function GearIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}
