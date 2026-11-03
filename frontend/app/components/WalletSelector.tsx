'use client'
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useConnect } from 'wagmi';

interface Props {
    cb: () => void
    render?: (open: () => void) => React.ReactNode
}

// Wallet connect button + modal. Responsive: center card (desktop) / bottom-sheet (mobile <480px).
export function EvmWalletSelector({ cb, render }: Props) {
    const [open, setOpen] = useState(false)
    const [isMobile, setIsMobile] = useState(false)
    const { connectors, connectAsync, isPending } = useConnect()
    const [pendingId, setPendingId] = useState<string | null>(null)

    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth <= 480)
        check()
        window.addEventListener('resize', check)
        return () => window.removeEventListener('resize', check)
    }, [])

    // Escape to close + lock body scroll while open
    useEffect(() => {
        if (!open) return
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
        window.addEventListener('keydown', onKey)
        const prev = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
    }, [open])

    // Dedupe by name (wagmi can expose both the generic injected connector and the same wallet by name), popular first.
    // When wallets announce themselves by name (EIP-6963), drop the generic "Injected" entry: it goes through
    // window.ethereum, which several installed wallets overwrite, so prompts can land in the wrong wallet.
    const seen = new Set<string>()
    const named = connectors.some(c => c.id !== 'injected' && c.type === 'injected')
    const sortedConnectors = [...connectors]
        .filter(c => !(named && c.id === 'injected'))
        .filter(c => { const k = c.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true })
        .sort((a, b) => {
            const rank = (n: string) => n === 'MetaMask' ? 0 : n === 'Coinbase Wallet' ? 1 : n === 'WalletConnect' ? 2 : 3
            return rank(a.name) - rank(b.name)
        });

    const handleConnect = async (connectorId: string) => {
        const connector = connectors.find(c => c.id === connectorId)
        if (!connector) return
        setPendingId(connectorId)
        try {
            await connectAsync({ connector })
            setOpen(false)
            cb()
        } catch (error) {
            console.error('Failed to connect EVM wallet:', error)
        } finally {
            setPendingId(null)
        }
    }

    const overlayStyle: React.CSSProperties = {
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100vh',
        background: 'rgba(0,0,0,.6)', zIndex: 1040,
        display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center',
        backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)',
    }
    const cardStyle: React.CSSProperties = {
        position: 'relative', width: isMobile ? '100%' : 'calc(100% - 2rem)', maxWidth: isMobile ? '100%' : 400,
        borderRadius: isMobile ? '16px 16px 0 0' : 14, background: '#10141f',
        boxShadow: '0 8px 30px rgba(0,0,0,.7)', padding: '20px 20px 16px', boxSizing: 'border-box',
        border: '1px solid rgba(168,85,247,.15)',
        animation: isMobile ? 'sheetUp .25s ease' : 'fadeIn .2s ease',
    }

    return (
        <>
            {render ? render(() => setOpen(true)) : (
                <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
                    <span>Connect Wallet</span>
                </button>
            )}
            {open && typeof document !== 'undefined' && createPortal(
                <div style={overlayStyle} onClick={() => setOpen(false)}>
                    <style>{`
                        @keyframes fadeIn { from { opacity:0; transform:scale(.97) } to { opacity:1; transform:scale(1) } }
                        @keyframes sheetUp { from { transform:translateY(100%) } to { transform:translateY(0) } }
                    `}</style>
                    <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
                        {isMobile && <div style={{ width: 40, height: 4, borderRadius: 2, background: '#3a4150', margin: '0 auto 14px' }} />}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <div style={{ fontWeight: 600, fontSize: 19, color: 'white' }}>Connect a wallet</div>
                            <button
                                onClick={() => setOpen(false)}
                                style={{ all: 'unset', cursor: 'pointer', color: '#888', fontSize: 22, lineHeight: 1, padding: '2px 6px', borderRadius: 6 }}
                                aria-label="Close"
                            >×</button>
                        </div>
                        <div style={{ fontSize: 13, color: '#8b93a1', marginBottom: 14 }}>Choose how you want to connect to BLACKPOOL.</div>
                        {connectors.length === 0 && (
                            <div style={{ padding: '20px 0', color: '#999', fontSize: 14 }}>
                                No wallets detected. Install a browser wallet (MetaMask, Coinbase, Rabby) or open in your wallet&apos;s dApp browser.
                            </div>
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: isMobile ? 12 : 0 }}>
                            {sortedConnectors.map((connector) => (
                                <WalletItem
                                    key={connector.id}
                                    name={connector.name}
                                    icon={connector.icon}
                                    isPending={isPending && pendingId === connector.id}
                                    disabled={isPending}
                                    connect={() => handleConnect(connector.id)}
                                />
                            ))}
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    )
}

function GenericWalletIcon() {
    return (
        <div style={{ width: 30, height: 30, borderRadius: 7, background: 'linear-gradient(135deg,#3b82f6,#6366f1)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="6" width="20" height="13" rx="2.5" />
                <path d="M2 10h20" />
                <circle cx="17.5" cy="13.5" r="1.4" fill="#fff" stroke="none" />
            </svg>
        </div>
    )
}

function WalletItem({ name, icon, connect, isPending, disabled }: {
    name: string
    icon?: string
    isPending: boolean
    disabled: boolean
    connect: () => void
}) {
    const [hover, setHover] = useState(false)
    const [imgOk, setImgOk] = useState(true)
    // "Injected" is wagmi's generic browser-wallet connector and ships no icon — give it a clear name + icon.
    const label = name === 'Injected' ? 'Browser Wallet' : name
    const hasIcon = !!icon && imgOk
    return (
        <div
            onClick={() => { if (!disabled) connect() }}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', borderRadius: 10,
                cursor: disabled ? (isPending ? 'wait' : 'not-allowed') : 'pointer',
                background: hover && !disabled ? '#1a2130' : '#141a26',
                border: '1px solid ' + (hover && !disabled ? 'rgba(168,85,247,.3)' : '#232b3a'),
                opacity: disabled && !isPending ? 0.5 : 1, transition: 'all .15s',
            }}
        >
            {hasIcon
                ? <img src={icon} alt={label} onError={() => setImgOk(false)} style={{ width: 30, height: 30, borderRadius: 7, flexShrink: 0 }} />
                : <GenericWalletIcon />
            }
            <span style={{ fontSize: 15, fontWeight: 500, color: '#fff', flex: 1 }}>{label}</span>
            {isPending && <span style={{ fontSize: 12, color: '#91ffa3' }}>Connecting...</span>}
        </div>
    )
}
