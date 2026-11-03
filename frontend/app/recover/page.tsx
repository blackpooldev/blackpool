'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import Mark from '../components/Mark'
import '../changelog/changelog.css'
import './recover.css'
import { ethers } from 'ethers'
import { registryAuthSigFromSignIn } from '../lib/burner'

// SELF-SERVE emergency recovery for funds stranded on a one-time swap burner.
//
// Trust model: the user signs the BLACKPOOL message IN THEIR OWN BROWSER. That signature never leaves
// the page — it is used locally to DERIVE the burner keys (deterministic from signature + nonce),
// then this page sweeps whatever each burner holds DIRECTLY to the user's public wallet. No private
// key or signature is ever sent to any server. This is the same derive+sweep logic the app's auto-
// recovery uses, but it bypasses the reshield-to-pool path entirely (funds go to the public wallet,
// which the user can re-shield in the app afterward). Works even if localStorage was wiped.

const SIGN_MESSAGE = 'Welcome to Blackpool\n\nSign this message to access your private account.\n\n- Gas free: no transaction is sent\n- Your private account keys are derived from this signature\n- It cannot move funds from your wallet or approve spending\n- Only sign it on blackpool.cash or the Blackpool CLI'
// byte-identical to backend src/burnerRegistry.js + app/lib/burner.ts
const API = process.env.NEXT_PUBLIC_API_URL || 'https://blackpool-api.fly.dev'

// WebCrypto AES-256-GCM decrypt — mirrors app/lib/burner.ts decryptBurnerKey (key = keccak256(sign-in sig)).
function _bytes(hex: string): Uint8Array { const h = hex.replace(/^0x/, ''); const u = new Uint8Array(h.length / 2); for (let i = 0; i < u.length; i++) u[i] = parseInt(h.substr(i * 2, 2), 16); return u }
async function decryptBurnerKey(encHex: string, signInSig: string): Promise<string> {
  const keyBytes = _bytes(ethers.keccak256(_bytes(signInSig)))
  const key = await crypto.subtle.importKey('raw', keyBytes as unknown as ArrayBuffer, 'AES-GCM', false, ['decrypt'])
  const buf = _bytes(encHex)
  const pt = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12) }, key, buf.slice(12) as unknown as ArrayBuffer))
  return new TextDecoder().decode(pt)
}

// Per-chain config (mirrors the main app's CHAIN_POOLS / UNISWAP.stable).
// legacy: BSC returns baseFeePerGas=0x0 and rejects EIP-1559 (type-2) tx params ("could not coalesce
// error") — it needs a legacy `gasPrice` tx. stableDec: BSC Binance-Peg USDC/USDT are 18-decimal,
// unlike 6-decimal USDC/USDG elsewhere; using 6 mis-displays AND mis-encodes amounts.
// Each chain lists SEVERAL RPCs, tried in order. A single endpoint is a single point of failure: when
// the one hardcoded RPC throttles or blocks the browser, every read fails with "Failed to fetch" and a
// funded burner gets reported as empty. Only endpoints verified to answer CORS preflight from
// app.blackpool.cash (Access-Control-Allow-Origin present) are listed — an endpoint the browser cannot
// reach is worse than useless here.
const CHAINS = [
  { key: 'base',      label: 'Base',      rpcs: ['https://mainnet.base.org', 'https://base-rpc.publicnode.com'],                                                                    stable: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', stableSym: 'USDC', stableDec: 6,  legacy: false },
  { key: 'robinhood', label: 'Robinhood', rpcs: ['https://rpc.mainnet.chain.robinhood.com', 'https://robinhood-rpc.publicnode.com'], stable: '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168', stableSym: 'USDG', stableDec: 6,  legacy: false },
  { key: 'arbitrum',  label: 'Arbitrum',  rpcs: ['https://arb1.arbitrum.io/rpc', 'https://arbitrum-one-rpc.publicnode.com'],                                                        stable: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', stableSym: 'USDC', stableDec: 6,  legacy: false },
  { key: 'bsc',       label: 'BSC',       rpcs: ['https://bsc-dataseed.binance.org', 'https://bsc-rpc.publicnode.com', 'https://bsc-dataseed1.defibit.io'],                          stable: '0x55d398326f99059fF775485246999027B3197955', stableSym: 'USDT', stableDec: 18, legacy: true  },
]

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address,uint256) returns (bool)',
]


export default function Recover() {
  const [log, setLog] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [wallet, setWallet] = useState<string | null>(null)
  const add = (m: string) => setLog(l => [...l, m])
  const logRef = useRef<HTMLPreElement | null>(null)
  useEffect(() => { document.title = 'Recover — Blackpool' }, [])
  useEffect(() => {
    const nav = document.querySelector<HTMLElement>('.cl-nav'); if (!nav) return
    const on = () => { if (window.scrollY > 8) nav.setAttribute('data-scrolled', ''); else nav.removeAttribute('data-scrolled') }
    on(); window.addEventListener('scroll', on, { passive: true }); return () => window.removeEventListener('scroll', on)
  }, [])
  useEffect(() => { const el = logRef.current; if (el) el.scrollTop = el.scrollHeight }, [log])

  const run = async () => {
    setBusy(true); setLog([]); setDone(false); setWallet(null)
    try {
      const eth = (window as any).ethereum
      if (!eth) { add('❌ No wallet found. Open this page inside your wallet\'s in-app browser (Rabby / MetaMask / Coinbase).'); return }

      add('Connecting wallet…')
      const accts: string[] = await eth.request({ method: 'eth_requestAccounts' })
      const user = ethers.getAddress(accts[0])
      setWallet(user)
      add(`Wallet: ${user}`)

      add('Sign the Blackpool sign-in message. The signature stays in your browser.')
      const signature: string = await eth.request({ method: 'personal_sign', params: [SIGN_MESSAGE, user] })

      // Candidate burners come from the encrypted registry only (every Blackpool burner is registered at creation).
      const burners: ethers.Wallet[] = []
      const seen = new Set<string>()

      // Fetch registry burners: the registry-auth signature is derived locally from the sign-in signature (no
      // second prompt); the returned ciphertext is decrypted locally with the sign-in signature (backend can't decrypt).
      try {
        add('Fetching your ephemeral swap wallets from the registry…')
        const authSig: string = await registryAuthSigFromSignIn(signature)
        const rows: any[] = []; let before: number | null = null; let ok = true
        for (let i = 0; i < 100; i++) {
          const r: Response = await fetch(`${API}/api/burner/list`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(before ? { authSig, before } : { authSig }) })
          if (!r.ok) { ok = false; break }
          const j: { burners?: any[]; next?: number | null } = await r.json(); rows.push(...(j.burners || [])); if (!j.next) break; before = j.next
        }
        if (ok) {
          let added = 0
          for (const row of rows) {
            try {
              const pk = await decryptBurnerKey(row.encKey, signature)
              const w = new ethers.Wallet(pk)
              // Log the registry address vs the address the decrypted key actually produces. If these
              // ever disagree, the scan would be checking the wrong address while the funds sit on the
              // registry one — that must be visible, not silent.
              if (row.burnerAddress && row.burnerAddress.toLowerCase() !== w.address.toLowerCase()) {
                add(`  ⚠️ MISMATCH: registry ${row.burnerAddress} vs decrypted key ${w.address} (${row.chain}) — scanning the decrypted one.`)
              } else {
                add(`  · registry ${w.address} (${row.chain}) key OK`)
              }
              if (!seen.has(w.address.toLowerCase())) { burners.push(w); seen.add(w.address.toLowerCase()); added++ }
            } catch { /* row from a different account / bad decrypt — skip */ }
          }
          add(`Registry: ${added} burner wallet(s) found${added ? '. Scanning them across all chains…' : '.'}`)
        } else { add('Registry fetch failed — nothing to scan. Try again in a moment.') }
        // Cross-chain bridges (NEAR Intents 1Click) recorded by the API for this wallet. These never use a
        // burner: a private withdraw pays the solver's deposit address, the solver pays the recipient, and a
        // failed intent is refunded to the origin-chain address shown below — nothing to sweep, only to read.
        try {
          const ri = await fetch(`${API}/api/intents`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ authSig }) })
          if (ri.ok) {
            const ij = await ri.json()
            const list: any[] = ij.intents || []
            add(`\nBridges (NEAR Intents): ${list.length} recorded for this wallet${list.length ? ':' : '.'}`)
            for (const it of list.slice(0, 25)) {
              const when = new Date(it.createdAt).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
              const st = String(it.status || 'UNKNOWN')
              const mark = st === 'SUCCESS' ? '✅' : (st === 'REFUNDED' || st === 'FAILED') ? '↩️' : '⏳'
              add(`  ${mark} ${when}  ${it.amountIn} ${it.fromAsset} → ${it.toAsset}  [${st}]`)
              add(`      to ${it.recipient}`)
              if (st === 'SUCCESS') add(`      delivered ${it.amountOut || it.amountOutQuote || ''}${it.destTx ? ` · dest tx ${it.destTx}` : ''}`)
              else if (st === 'REFUNDED' || st === 'FAILED') add(`      ${it.statusDetail || 'solver could not complete'} — refund goes to ${it.refundTo} on ${it.originChain}`)
              else add(`      in progress — refund address if it fails: ${it.refundTo} on ${it.originChain}`)
              add(`      track: ${it.statusUrl}`)
            }
          } else { add('Bridge list unavailable right now.') }
        } catch { add('Bridge list skipped (API unreachable).') }
      } catch { add('Registry unreachable — nothing to scan. Try again in a moment.') }

      let sweptAny = false
      let foundAny = false

      for (const chain of CHAINS) {
        // FAILOVER provider set for this chain. `active` is sticky: reads keep using the endpoint that
        // last worked, and only advance to the next one when a call actually fails. That keeps the load
        // identical to a single RPC in the happy path (no request multiplication) while surviving one
        // endpoint going down — the failure mode that reported a funded burner as empty.
        const providers = chain.rpcs.map(u => new ethers.JsonRpcProvider(u))
        let active = 0
        // Run `fn` against the active endpoint; on failure move to the next and retry, once per endpoint.
        const viaRpc = async <T,>(fn: (p: ethers.JsonRpcProvider) => Promise<T>): Promise<T> => {
          let lastErr: any
          for (let i = 0; i < providers.length; i++) {
            const idx = (active + i) % providers.length
            try { const out = await fn(providers[idx]); active = idx; return out }
            catch (e) { lastErr = e }
          }
          throw lastErr
        }
        const provider = providers[0]
        // ADAPTIVE gas. EIP-1559 chains: use maxFeePerGas = 2x baseFee, and set maxPriorityFeePerGas
        // via the network's eth_maxPriorityFeePerGas (RH + Arbitrum return 0x0 — hardcoding a positive
        // priority triggers ethers v6 "could not coalesce error" when the RPC returns a mismatched
        // response). Legacy chains (BSC): use type-0 gasPrice tx.
        let feeOverrides: Record<string, bigint>
        let gasUnitFee: bigint // the per-gas price used for reserving headroom below
        try {
          if (chain.legacy) {
            const fd = await viaRpc(p => p.getFeeData())
            const price = fd.gasPrice || ethers.parseUnits('0.1', 'gwei')
            gasUnitFee = price
            feeOverrides = { gasPrice: price }
          } else {
            const blk = await viaRpc(p => p.getBlock('latest'))
            const baseFee = blk?.baseFeePerGas || ethers.parseUnits('0.02', 'gwei')
            const floor = ethers.parseUnits('0.02', 'gwei')
            let maxFeePerGas = baseFee * 2n
            if (maxFeePerGas < floor) maxFeePerGas = floor
            // Ask the network for its expected priority — RH/Arb return 0x0, Base returns a real number.
            let maxPriorityFeePerGas = 0n
            try {
              const prio = await viaRpc(p => p.send('eth_maxPriorityFeePerGas', []))
              if (typeof prio === 'string' && prio.length > 2) maxPriorityFeePerGas = BigInt(prio)
            } catch { /* not supported: leave at 0 */ }
            if (maxPriorityFeePerGas > maxFeePerGas) maxPriorityFeePerGas = maxFeePerGas
            gasUnitFee = maxFeePerGas
            feeOverrides = { maxFeePerGas, maxPriorityFeePerGas }
          }
        } catch {
          if (chain.legacy) { const p = ethers.parseUnits('0.1', 'gwei'); gasUnitFee = p; feeOverrides = { gasPrice: p } }
          else { const p = ethers.parseUnits('0.1', 'gwei'); gasUnitFee = p; feeOverrides = { maxFeePerGas: p, maxPriorityFeePerGas: 0n } }
        }

        const stable = new ethers.Contract(chain.stable, ERC20_ABI, provider)

        for (let n = 0; n < burners.length; n++) {
          const bw = burners[n].connect(provider)
          let ethBal = 0n, stableBal = 0n
          // One read per burner (no retry storms), but routed through the chain's endpoint list so a
          // dead/blocked RPC falls over to the next one instead of turning every balance into a silent 0.
          try { ethBal = await viaRpc(p => p.getBalance(bw.address)) }
          catch (e: any) { add(`  ⚠️ ${chain.label} ${bw.address.slice(0, 10)}… native read failed on all ${chain.rpcs.length} RPCs: ${e?.shortMessage || e?.code || e?.message || String(e)}`) }
          try { stableBal = await viaRpc(p => new ethers.Contract(chain.stable, ERC20_ABI, p).balanceOf(bw.address)) } catch { /* transient */ }
          if (ethBal === 0n && stableBal === 0n) continue
          foundAny = true
          add(`\n• ${chain.label} burner ${bw.address.slice(0, 10)}…: ${ethers.formatEther(ethBal)} ${chain.key === 'bsc' ? 'BNB' : 'ETH'}, ${ethers.formatUnits(stableBal, chain.stableDec)} ${chain.stableSym}`)

          // 1) Sweep the stablecoin first (needs the burner's native for gas — do it before draining it).
          if (stableBal > 0n) {
            const transferData = stable.interface.encodeFunctionData('transfer', [user, stableBal])
            // Estimate intrinsic+exec gas from the node instead of hardcoding. Robinhood/Arbitrum are
            // Nitro L2s whose intrinsic gas for a transfer exceeds the L1 21000/55000 constants, so a
            // hardcoded limit is rejected with "intrinsic gas too low" (-32000), which ethers v6 then
            // surfaces as the opaque "could not coalesce error". Estimate + 25% headroom, fall back high.
            let erc20GasLimit = 120000n
            try { erc20GasLimit = ((await viaRpc(p => p.estimateGas({ from: bw.address, to: chain.stable, data: transferData }))) * 125n) / 100n } catch { /* fallback stays */ }
            const erc20GasCost = erc20GasLimit * gasUnitFee * 3n
            if (ethBal < erc20GasCost) {
              add(`  ⚠️ ${chain.stableSym} found but burner has too little gas. Send ~0.00003 native to the burner address above and re-run, or recover ${chain.stableSym} manually.`)
            } else {
              try {
                // Broadcast through the endpoint list too: signing is local, but the send itself needs a
                // reachable RPC, and the first endpoint may be the blocked one.
                const tx = await viaRpc(p => burners[n].connect(p).sendTransaction({ to: chain.stable, value: 0n, data: transferData, gasLimit: erc20GasLimit, ...feeOverrides }))
                add(`  → ${chain.stableSym} sweep tx: ${tx.hash}`)
                await tx.wait()
                add(`  ✅ ${ethers.formatUnits(stableBal, chain.stableDec)} ${chain.stableSym} sent to your wallet.`)
                sweptAny = true
                try { ethBal = await viaRpc(p => p.getBalance(bw.address)) } catch { /* refresh for the native sweep below */ }
              } catch (e: any) { add(`  ❌ ${chain.stableSym} sweep failed: ${e?.shortMessage || e?.message || String(e)}`) }
            }
          }

          // 2) Sweep native (pays its own gas from the same balance; reserve with 3x headroom).
          if (ethBal > 0n) {
            // Intrinsic gas for a plain native send is NOT 21000 on Nitro L2s — Robinhood (4663) requires
            // 21220 (eth_estimateGas -> 0x52e3), and a hardcoded 21000 is rejected by the node with
            // "intrinsic gas too low (supplied gas 21000)". ethers v6 cannot map that non-standard
            // -32000 body and throws "could not coalesce error", which is what stranded user sweeps.
            // Estimate against the node (with the real value) and add 25% headroom.
            let nativeGasLimit = 30000n
            const probeValue = ethBal / 2n // safe probe: never exceeds balance, same intrinsic cost
            try { nativeGasLimit = ((await viaRpc(p => p.estimateGas({ from: bw.address, to: user, value: probeValue }))) * 125n) / 100n } catch { /* fallback stays */ }
            const gasCost = nativeGasLimit * gasUnitFee * 3n
            const value = ethBal - gasCost
            const nativeSym = chain.key === 'bsc' ? 'BNB' : 'ETH'
            if (value <= 0n) {
              add(`  (${nativeSym} balance ${ethers.formatEther(ethBal)} is dust — below gas cost, skipping)`)
            } else {
              try {
                const tx = await viaRpc(p => burners[n].connect(p).sendTransaction({ to: user, value, gasLimit: nativeGasLimit, ...feeOverrides }))
                add(`  → ${nativeSym} sweep tx: ${tx.hash}`)
                await tx.wait()
                add(`  ✅ ${ethers.formatEther(value)} ${nativeSym} sent to your wallet.`)
                sweptAny = true
              } catch (e: any) { add(`  ❌ ${nativeSym} sweep failed: ${e?.shortMessage || e?.message || String(e)}`) }
            }
          }
        }
      }

      if (!foundAny) add('\n✅ Nothing stranded — all your burner wallets are empty on both chains.')
      else if (sweptAny) add('\n✅ Done. Recovered funds are now in your public wallet. Re-shield them in the app if you want them private again.')
      else add('\n⚠️ Funds were found but could not be swept (see notes above). Reach out and we\'ll help.')
      setDone(true)
    } catch (e: any) {
      add(`Error: ${e?.shortMessage || e?.message || String(e)}`)
    } finally { setBusy(false) }
  }

  const status = busy ? 'running' : done ? 'done' : 'idle'
  const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
  return (
    <main className="cl rc">
      <header className="cl-nav">
        <div className="cl-nav-in">
          <Link href="/" className="cl-brand"><Mark size={24} />Blackpool<span className="cl-brand-sub">Recover</span></Link>
          <nav className="cl-nav-links"><Link href="/">Home</Link><Link href="/docs">Docs</Link><Link href="/agents">Agents</Link><Link href="/analytics">Analytics</Link><Link href="/changelog">Changelog</Link></nav>
          <Link href="/app" className="cl-btn">Launch app</Link>
        </div>
      </header>

      <div className="cl-wrap">
        <div className="cl-head">
          <h1>Recover</h1>
          <p className="rc-lead">Anything that can get stuck is recoverable from your signature alone. Open this page in the wallet you used, sign once, and every burner registered to that wallet is found, swept back and listed with your bridges.</p>
        </div>

        <section className="rc-tool">
          <div className="cl-vis rc-vis">
            <div className="cl-mock wide rc-win">
              <div className="cl-mock-h">Recover funds<span>Scans Robinhood Chain · Base · Arbitrum · BNB Chain for one-time swap wallets</span></div>
              <div className="cl-chips">
                <span className="cl-chip"><i className="rc-dot" style={{ background: '#34C77B' }} />Robinhood Chain</span>
                <span className="cl-chip"><i className="rc-dot" style={{ background: '#4C7FE3' }} />Base</span>
                <span className="cl-chip"><i className="rc-dot" style={{ background: '#7B68E0' }} />Arbitrum</span>
                <span className="cl-chip"><i className="rc-dot" style={{ background: '#E9A23B' }} />BNB Chain</span>
              </div>
              <div className="cl-kv"><span>Wallet</span><b className={wallet ? 'mono' : ''}>{wallet ? short(wallet) : 'not connected'}</b></div>
              <div className="cl-kv"><span>Signature</span><b>1 · stays in this browser</b></div>
              <div className="cl-kv"><span>Burner registry</span><b>decrypted locally</b></div>
              <button className="cl-btn rc-btn" onClick={run} disabled={busy}>
                {busy ? <><i className="rc-spin" />Scanning and sweeping…</> : done ? 'Run again' : 'Recover my funds'}
              </button>
              <div className="rc-console">
                <div className="rc-console-h"><span className="mono">log</span><span className={`cl-pill ${status === 'running' ? 'run' : status === 'done' ? 'ok' : ''}`}>{status === 'running' ? 'running' : status === 'done' ? 'done' : 'idle'}</span></div>
                <pre className="rc-log" ref={logRef}>
                  {log.length ? log.join('\n') : <><span className="rc-prompt">&gt; waiting for signature</span>{'\n'}  press Recover my funds to start. Output stays on this device.</>}
                </pre>
              </div>
              <div className="cl-mock-f">No seed phrases, no exports. Funds return to the wallet you sign with.</div>
            </div>
          </div>
        </section>

        <section className="rc-tiles">
          <div className="rc-tile"><h3>Your signature stays local</h3><p>Recover decrypts your burner registry in the browser and signs sweeps there. Nothing secret is sent to a server.</p></div>
          <div className="rc-tile"><h3>Burners from any device</h3><p>Every one-time swap wallet is registered encrypted at creation, so a swap that stalls is recoverable anywhere.</p></div>
          <div className="rc-tile"><h3>Bridges and refunds</h3><p>Every cross-chain intent is listed with its status. A failed bridge shows where the refund went.</p></div>
        </section>

        <section className="cl-cta">
          <h2>Move value privately.<br /><span>Start with one signature.</span></h2>
          <p>Connect a wallet, sign once, and your private account exists on every supported chain.</p>
          <Link href="/app" className="cl-btn lg">Launch app</Link>
        </section>
        <p className="cl-foot">© {new Date().getFullYear()} Blackpool. Recovery uses public RPC endpoints; keys never leave your device.</p>
      </div>
    </main>
  )
}
