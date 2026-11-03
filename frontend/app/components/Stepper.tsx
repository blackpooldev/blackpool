'use client'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

// Themed progress stepper (modal overlay) for send/swap/bridge.
// CSS animasi: stepper-fill (garis ngisi), step-completed (centang), step-pulse (step aktif).
// Nyambung tema BLACKPOOL (dark #10141f, accent #91ffa3 hijau + #4f9cff biru).

export interface Step { id: number | string; title: string; sub?: string }

export function StepperModal({ steps, activeStep, error, info, onClose, onDismiss }: {
  steps: Step[]
  activeStep: number          // index of the running step (0-based). >= steps.length = all done
  error?: string | null       // when set, the active step turns red
  info?: string | null        // neutral note (not an error) - e.g. slow solver, funds safe. Stops the spinner.
  onClose?: () => void        // shows a close button once done/error/info
  onDismiss?: () => void      // escape hatch: close manually while still processing (funds safe)
}) {
  const done = activeStep >= steps.length
  const resolved = done || !!error || !!info   // the spinner only runs while NOT resolved
  const showClose = resolved
  if (typeof document === 'undefined') return null
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', zIndex: 1050, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <style>{`
        @keyframes bp-step-pulse { 0%,100%{box-shadow:0 0 0 0 rgba(0,33,245,.5)} 50%{box-shadow:0 0 0 7px rgba(0,33,245,0)} }
        @keyframes bp-fill { from{height:0} to{height:100%} }
        @keyframes bp-pop { 0%{transform:scale(.5);opacity:0} 60%{transform:scale(1.15)} 100%{transform:scale(1);opacity:1} }
        @keyframes bp-fade { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
      `}</style>
      <div style={{ width: '100%', maxWidth: 440, background: 'var(--color-bg1)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-card)', boxShadow: '0 12px 40px rgba(0,0,31,.6)', padding: '24px 22px 20px', animation: 'bp-fade .25s ease', boxSizing: 'border-box' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 18, color: 'var(--color-fg1)', marginBottom: 4 }}>
          {error ? 'Paused' : done ? 'Complete' : info ? 'Still processing' : 'Processing privately'}
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--color-muted)', marginBottom: 24 }}>
          {error ? 'Funds are safe. You can resume.' : done ? 'All steps finished.' : info ? 'Funds are safe. Safe to close this window.' : 'Keep this open until it finishes.'}
        </div>

        {/* horizontal stepper: dot — line — dot — line — dot */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 0 }}>
          {steps.map((s, i) => {
            const isDone = i < activeStep
            const isActive = i === activeStep && !error && !done && !info
            const isError = i === activeStep && !!error
            const isLast = i === steps.length - 1
            const dotBg = isDone ? 'var(--color-accent)' : isError ? '#ff6b6b' : isActive ? 'var(--color-primary)' : 'var(--color-bg3)'
            const dotColor = (isDone || isActive) ? 'var(--color-on-primary)' : isError ? '#0a0c10' : 'var(--color-fg2)'
            return (
              <div key={s.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, minWidth: 0, position: 'relative' }}>
                {/* connector line to next step (drawn from this dot's right edge) */}
                {!isLast && (
                  <div style={{ position: 'absolute', top: 13, left: 'calc(50% + 16px)', right: 'calc(-50% + 16px)', height: 2, background: 'var(--color-bg4)', borderRadius: 1, overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', inset: 0, width: isDone ? '100%' : '0%', background: 'var(--color-accent)', transition: 'width .4s ease' }} />
                  </div>
                )}
                {/* dot */}
                <div style={{
                  width: 26, height: 26, minWidth: 26, borderRadius: 13, background: dotBg, color: dotColor,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, zIndex: 1,
                  transition: 'background .3s', animation: isActive ? 'bp-step-pulse 1.5s infinite' : isDone || isError ? 'bp-pop .3s ease' : 'none',
                  border: (!isDone && !isActive && !isError) ? '1px solid var(--color-border)' : 'none',
                }}>
                  {isDone ? '✓' : isError ? '!' : isActive ? <Spinner /> : i + 1}
                </div>
                {/* label under dot */}
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '-0.02em', fontWeight: isActive ? 600 : 500, marginTop: 8, textAlign: 'center', lineHeight: 1.25, padding: '0 3px', color: isDone ? 'var(--color-accent)' : isError ? '#ff6b6b' : isActive ? 'var(--color-fg1)' : 'var(--color-muted)' }}>{s.title}</div>
              </div>
            )
          })}
        </div>

        {/* detailed status line for the active/errored step (full step-by-step text) */}
        {!done && (() => {
          const cur = steps[Math.min(activeStep, steps.length - 1)]
          const sub = cur?.sub
          return sub ? (
            <div style={{ marginTop: 18, fontSize: 12.5, color: error ? '#ff9b9b' : '#8b93a1', textAlign: 'center', animation: 'bp-fade .3s ease' }}>
              {error ? '' : '● '}{sub}
            </div>
          ) : null
        })()}

        {error && <div style={{ marginTop: 12, fontSize: 12, color: '#ff9b9b', background: 'rgba(255,107,107,.08)', border: '1px solid rgba(255,107,107,.2)', borderRadius: 8, padding: '8px 10px', wordBreak: 'break-word' }}>{error}</div>}

        {info && !error && <div style={{ marginTop: 12, fontSize: 12, color: 'var(--color-accent)', background: 'rgba(52,199,123,.10)', border: '1px solid rgba(52,199,123,.3)', borderRadius: 8, padding: '8px 10px', wordBreak: 'break-word' }}>{info}</div>}

        {showClose && (
          <button onClick={onClose} className="btn btn-primary" style={{ width: '100%', marginTop: 16 }}>
            <span>{error ? 'Close' : info ? 'Close' : 'Done'}</span>
          </button>
        )}

        {/* escape hatch while still processing: solver can take up to ~15 min on-chain even after
            funds are delivered; let the user close without waiting on the status poll. */}
        {!resolved && onDismiss && (
          <button onClick={onDismiss} className="btn btn-outline" style={{ width: '100%', marginTop: 12, fontSize: 12.5 }}>
            <span>Close and track later</span>
          </button>
        )}
      </div>
    </div>,
    document.body
  )
}

function Spinner() {
  return (
    <div style={{ width: 13, height: 13, border: '2px solid rgba(255,255,255,.35)', borderTopColor: '#fff', borderRadius: '50%', animation: 'bp-spin .7s linear infinite' }}>
      <style>{`@keyframes bp-spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
