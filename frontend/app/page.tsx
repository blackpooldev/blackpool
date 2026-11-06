import "./landing.css";
import type { CSSProperties } from "react";
import Link from "next/link";
import { FAQ } from "./faq";
import LandingMotion from "./components/LandingMotion";
import Mark from "./components/Mark";
import Icon from "./components/Icon";
import FootMark from "./components/FootMark";
import NewsPill from "./components/NewsPill";
import ProductMenu from "./components/ProductMenu";
import { PRODUCT_GROUPS } from "./components/products";
import { HIGHLIGHTS } from "./changelog/entries";
import JsonLd, { siteGraph } from "./components/JsonLd";
import { pageMeta } from "./components/seo";

export const metadata = pageMeta("/", "Blackpool — Private crypto payments that leave no trail", "Send, swap and bridge crypto privately on Robinhood Chain, Base, Arbitrum and BNB Chain with zero-knowledge proofs. Non-custodial, and the relayer pays the gas.");

// Blackpool landing. Server component, no wallet code: the dApp lives at /app.
// Copy is Blackpool's own; every claim below maps to a shipped feature (see TECH.md / BLACKPOOL.md).

const CHAINS = [
  { name: "Base", logo: "/token_logos/base.png", slug: "base" },
  { name: "Robinhood Chain", logo: "/token_logos/robinhood.png?v=2", slug: "robinhood-chain" },
  { name: "Arbitrum", logo: "/token_logos/arbitrum.png", slug: "arbitrum" },
  { name: "BNB Chain", logo: "/token_logos/bsc.png", slug: "bnb-chain" },
  { name: "Solana", logo: "/token_logos/solana.png", soon: "bridge", slug: undefined },
  { name: "Ethereum", logo: "/token_logos/ethereum.png", soon: "bridge", slug: undefined },
];

const LINKS = [
  { c: "#34C77B", i: "shield", t: "Shield ETH or USDC on Base →", h: "/app" },
  { c: "#5B8DEF", i: "send", t: "Send privately, relayer pays gas →", h: "/app" },
  { c: "#E9A23B", i: "swap", t: "Swap inside the pool →", h: "/app" },
  { c: "#8F7BF2", i: "intents", t: "Bridge to Solana via NEAR Intents →", h: "/app" },
  { c: "#3FB8C9", i: "route", t: "Bridge to Robinhood Chain →", h: "/app" },
  { c: "#EF5B5B", i: "recover", t: "Recover a stuck burner →", h: "/recover" },
  { c: "#EBECEC", i: "cli", t: "Use the CLI →", h: "/docs" },
  { c: "#6E7074", i: "docs", t: "Read the docs →", h: "/docs" },
];

const HS = [18,22,20,30,26,34,40,38,52,44,60,58,72,66,80,74,92,88,104,98,118,112,126,120,134,128,142,138,146,150];
const SB_VIEWS = [["Overview", "#6E7074"], ["Shield", "#34C77B"], ["Private send", "#5B8DEF"], ["Swap", "#8F7BF2"], ["Private bridge", "#E9A23B"], ["Recovery", "#EF5B5B"]];
const SB_CHAINS = [["Base", "#4C7FE3"], ["Robinhood Chain", "#27A563"], ["Arbitrum", "#7B68E0"], ["BNB Chain", "#C2842A"]];
const BYCHAIN: Array<[string, string, string, number]> = [["Robinhood Chain", "1.300 ETH", "#27A563", 100], ["Base", "0.812 ETH", "#4C7FE3", 62], ["BNB Chain", "0.600 ETH", "#C2842A", 46], ["Arbitrum", "0.520 ETH", "#7B68E0", 40]];

export default function Landing() {
  return (
    <main className="lp">
      <div className="lp-rails" aria-hidden="true" />
      <LandingMotion />
      <header className="lp-nav">
        <div className="lp-wrap lp-nav-in">
          <Link href="/" className="lp-brand"><Mark className="lp-mark" size={26} />Blackpool</Link>
          <nav className="lp-links">
            <ProductMenu /><a href="#chains">Chains</a><a href="#how">How it works</a><Link href="/recover">Recover</Link><a href="/docs">Docs</a><Link href="/agents">Agents</Link><a href="#faq">FAQ</a><Link href="/changelog">Changelog</Link>
          </nav>
          <div className="lp-nav-right">
            <Link href="/app" className="lp-btn pri">Launch app</Link>
            <button type="button" className="lp-menu" aria-label="Menu" aria-expanded="false"><i /><i /></button>
          </div>
        </div>
        <div className="lp-drawer">
          <details className="lp-dd-m"><summary>Product<svg width="12" height="12" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.75l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></summary>
            {PRODUCT_GROUPS.map((g) => (
              <div className="lp-dd-mg" key={g.title}><div className="lp-dd-h">{g.title}</div>
                {g.items.map((it) => <Link href={it.h} className="lp-dd-mi" key={it.t}><Icon k={it.k} c={it.c} size={15} /><span>{it.t}</span></Link>)}
              </div>
            ))}
          </details>
          <a href="#chains">Chains</a><a href="#how">How it works</a><Link href="/recover">Recover</Link><a href="/docs">Docs</a><Link href="/agents">Agents</Link><a href="#faq">FAQ</a><Link href="/changelog">Changelog</Link>
          <Link href="/app" className="lp-btn pri lg">Launch app</Link>
        </div>
      </header>

      <div className="lp-wrap">
        <div className="lp-pill-row">
          <NewsPill items={HIGHLIGHTS} />
        </div>

        <section className="lp-hero">
          <h1 className="lp-h1">Private payments<br /><span className="dim">that leave no trail</span></h1>
          <div className="lp-hero-right">
            <p className="lp-sub">Shield, send, swap and bridge across chains with zero-knowledge proofs. No fixed denominations, no waiting periods, no custody.</p>
            <div className="lp-cta-row">
              <Link href="/app" className="lp-btn pri lg">Launch app</Link>
              <a href="/docs" className="lp-btn lg">Read the docs</a>
            </div>
          </div>
        </section>

        <div className="lp-chains" id="chains" aria-label="Supported chains">
          <div className="lp-chains-track">
            {[...CHAINS, ...CHAINS].map((c, i) => (
              c.slug
                ? <Link href={`/private-payments/${c.slug}`} className="lp-chain" key={c.name + i} aria-hidden={i >= CHAINS.length} tabIndex={i >= CHAINS.length ? -1 : undefined} title={`Private payments on ${c.name}`}><img src={c.logo} alt="" />{c.name}</Link>
                : <div className="lp-chain" key={c.name + i} aria-hidden={i >= CHAINS.length}><img src={c.logo} alt="" />{c.name}{c.soon && <span className="soon">{c.soon} only</span>}</div>
            ))}
          </div>
        </div>

        <div className="lp-window" id="product" data-scene="bridge" data-step="0">
          <div className="lp-stage">
            <div className="lp-console" aria-hidden="true">
              <aside className="lp-sb">
                <div className="lp-sb-brand"><Mark size={18} />Blackpool</div>
                <div className="lp-sb-h">Views</div>
                {SB_VIEWS.map(([n, c]) => <div className="lp-sb-it" data-k={({ Shield: "shield", "Private send": "send", Swap: "swap", "Private bridge": "bridge", Recovery: "recover" } as Record<string, string>)[n] || ""} key={n}><i style={{ background: c }} />{n}</div>)}
                <div className="lp-sb-h">Chains</div>
                {SB_CHAINS.map(([n, c]) => <div className="lp-sb-it" key={n}><i style={{ background: c }} />{n}</div>)}
              </aside>
              <div className="lp-main">
                <div className="lp-main-h"><b>Private account</b><span className="live"><i />Live</span></div>
                <div className="lp-main-s">4 chains · <b data-count="notes">12</b> shielded notes · last sync <b data-sync>4</b> s ago</div>
                <div className="lp-tiles">
                  <div className="lp-tile"><span>Private balance</span><b>3.232 ETH</b><small><span data-usd="3.232">≈ $7,332</span> · across 4 chains</small></div>
                  <div className="lp-tile"><span>Shielded notes</span><b data-count="notes">12</b><small>2 spent · <b data-count="unspent">10</b> unspent</small></div>
                  <div className="lp-tile"><span>Pending intents</span><b><em className="n0">0</em><em className="n1">1</em></b><small><b data-r="from">Robinhood Chain</b> → <b data-r="to">Solana</b> · 1Click</small></div>
                  <div className="lp-tile"><span>Relayer fees paid</span><b>0.0042 ETH</b><small>flat fee · taken from notes</small></div>
                </div>
                <div className="lp-panels">
                  <div className="lp-panel lp-chart">
                    <div className="ph"><b>Shielded notes over time</b><span className="chip">All time ▾</span></div>
                    <div className="ps">Since Sep 2026 · all pools</div>
                    <div className="bars">{HS.map((h, i) => <i key={i} style={{ height: h, opacity: i > 24 ? 1 : 0.55 + i / 60, "--i": i } as CSSProperties} />)}</div>
                    <div className="ax"><span>Sep 3</span><span>Oct 1</span><span>Nov 1</span></div>
                  </div>
                  <div className="lp-panel lp-bychain">
                    <div className="ph"><b>Private balance by chain</b></div>
                    <div className="ps">Encrypted locally · visible only to you</div>
                    {BYCHAIN.map(([n, v, c, w]) => <div className="r" key={n}><i style={{ background: c }} /><span>{n}</span><b className="mono">{v}</b><u><em style={{ width: `${w}%`, background: c }} /></u></div>)}
                  </div>
                </div>
              </div>
            </div>
          <div className="lp-win-grid lp-scene" data-scene="send">
            <div className="lp-flow">
              <div className="lp-node"><div className="t">Shield <em className="st"><span className="p">queued</span><span className="a">confirming…</span><span className="d">confirmed</span></em></div><div className="d">1.000 ETH joined the Base pool as an encrypted note.</div></div>
              <div className="lp-node"><div className="t">Prove <em className="st"><span className="p">queued</span><span className="a">building groth16…</span><span className="d">1.4 s</span></em></div><div className="d">Your browser builds the proof. Keys never leave it.</div></div>
              <div className="lp-node"><div className="t">Relay <em className="st"><span className="p">queued</span><span className="a">submitting…</span><span className="d">gas paid</span></em></div><div className="d">The relayer submits the transaction, so your wallet never touches it.</div></div>
              <div className="lp-node"><div className="t">Deliver <em className="st"><span className="p">queued</span><span className="a">settling…</span><span className="d">settled</span></em></div><div className="d">The recipient receives plain ETH. Nothing on-chain links the two.</div></div>
            </div>
            <div className="lp-card">
              <h4>Send privately</h4>
              <div className="sub">Private balance · 0.812 ETH on Base</div>
              <div className="lp-field"><label>Recipient</label><div className="mono"><span className="type">0x9f3c…41e7</span><i className="caret" aria-hidden="true" /></div></div>
              <div className="lp-field"><label>Amount</label><div>0.25 ETH<i className="hatch" aria-hidden="true" /></div></div>
              <div className="lp-field"><label>Network fee</label><div>0.00015 ETH · paid from the pool<i className="hatch" aria-hidden="true" /></div></div>
              <div className="prog"><i /></div>
              <div className="go"><span className="g0">Send privately</span><span className="g1">Sending privately…</span><span className="g2">Sent · nothing to trace</span></div>
            </div>
            <div className="lp-mini lp-link"><b>Unlinkable</b><span>the paying wallet is the relayer, never yours</span><div className="q"><em className="mono">0x12ab…9c01</em><i className="ln"><u>✕</u></i><em className="mono">0x9f3c…41e7</em></div><div className="found">no on-chain edge between the two</div></div>
          </div>
          <div className="lp-win-grid lp-scene" data-scene="bridge">
            <div className="lp-flow">
              <div className="lp-node"><div className="t">Shield <em className="st"><span className="p">queued</span><span className="a">confirming…</span><span className="d">confirmed</span></em></div><div className="d"><b data-r="shield">1.000 ETH</b> joined the <b data-r="from">Robinhood Chain</b> pool as an encrypted note.</div></div>
              <div className="lp-node"><div className="t">Prove <em className="st"><span className="p">queued</span><span className="a">building groth16…</span><span className="d">1.6 s</span></em></div><div className="d">Your browser proves the note and pays a one-time burner. Your wallet is never involved.</div></div>
              <div className="lp-node"><div className="t">Intent <em className="st"><span className="p">queued</span><span className="a">quoting 1Click…</span><span className="d">deposit funded</span></em></div><div className="d">NEAR Intents returns a one-off deposit address. The burner pays it; the origin chain never sees <b data-r="to">Solana</b>.</div></div>
              <div className="lp-node"><div className="t">Deliver <em className="st"><span className="p">queued</span><span className="a">solvers settling…</span><span className="d">delivered</span></em></div><div className="d"><b data-r="toAsset">USDC</b> lands in the <b data-r="to">Solana</b> wallet. Neither chain can see the other side.</div></div>
            </div>
            <div className="lp-card">
              <h4>Bridge privately</h4>
              <div className="sub">From <b data-r="from">Robinhood Chain</b> · private <b data-r="asset">ETH</b></div>
              <div className="lp-field"><label>To</label><div><img className="ico" data-r="toLogo" src="/token_logos/solana.png" alt="" /><b data-r="to">Solana</b>&nbsp;·&nbsp;<b data-r="toAsset">USDC</b><i className="hatch" aria-hidden="true" /></div></div>
              <div className="lp-field"><label>Recipient</label><div className="mono"><span className="type" data-r="recipient">7Gx4…kQ2m</span><i className="caret" aria-hidden="true" /></div></div>
              <div className="lp-field"><label>You receive</label><div>≈ <b data-r="out">2,259.40 USDC</b>&nbsp;· NEAR Intents quote<i className="hatch" aria-hidden="true" /></div></div>
              <div className="prog"><i /></div>
              <div className="go"><span className="g0">Bridge privately</span><span className="g1">Bridging via NEAR Intents…</span><span className="g2">Delivered on <b data-r="to">Solana</b> · no trail</span></div>
            </div>
          </div>
          <div className="lp-win-grid lp-scene" data-scene="shield"><div className="lp-flow"><div className="lp-node"><div className="t">Approve <em className="st"><span className="p">queued</span><span className="a">signing…</span><span className="d">signed</span></em></div><div className="d">One wallet signature authorises the deposit. Nothing else ever leaves your wallet.</div></div><div className="lp-node"><div className="t">Encrypt <em className="st"><span className="p">queued</span><span className="a">building note…</span><span className="d">note built</span></em></div><div className="d">Amount, owner and blinding are sealed into a note only your key can open.</div></div><div className="lp-node"><div className="t">Commit <em className="st"><span className="p">queued</span><span className="a">adding to tree…</span><span className="d">leaf 4 821</span></em></div><div className="d">The commitment joins the Merkle tree. The chain sees a hash, never an amount.</div></div><div className="lp-node"><div className="t">Confirm <em className="st"><span className="p">queued</span><span className="a">confirming…</span><span className="d">confirmed</span></em></div><div className="d">Your private balance updates. Any amount, withdrawable whenever you want.</div></div></div><div className="lp-card"><h4>Shield privately</h4><div className="sub">Robinhood Chain · wallet 2.418 ETH</div><div className="lp-field"><label>Asset</label><div>ETH · Robinhood Chain<i className="hatch" aria-hidden="true" /></div></div><div className="lp-field"><label>Amount</label><div><span className="type">1.000 ETH</span><i className="caret" aria-hidden="true" /></div></div><div className="lp-field"><label>Fee</label><div>0.0003 ETH · relayer<i className="hatch" aria-hidden="true" /></div></div><div className="prog"><i /></div><div className="go"><span className="g0">Shield privately</span><span className="g1">Shielding…</span><span className="g2">Shielded · +1.000 ETH private</span></div></div><div className="lp-mini lp-tree"><b>Merkle tree</b><span>new leaf → root · 4 levels</span><div className="r r3"><i /><i /><i /><i /><i /><i className="p" /><i /><i /></div><div className="r r2"><i /><i /><i className="p" /><i /></div><div className="r r1"><i /><i className="p" /></div><div className="r r0"><i className="p" /></div></div></div>
          <div className="lp-win-grid lp-scene" data-scene="swap"><div className="lp-flow"><div className="lp-node"><div className="t">Prove <em className="st"><span className="p">queued</span><span className="a">building groth16…</span><span className="d">1.4 s</span></em></div><div className="d">Your browser proves you own a note worth 0.500 ETH. No address is revealed.</div></div><div className="lp-node"><div className="t">Burner <em className="st"><span className="p">queued</span><span className="a">funding…</span><span className="d">funded</span></em></div><div className="d">A one-time burner receives the ETH. It has never transacted before.</div></div><div className="lp-node"><div className="t">Route <em className="st"><span className="p">queued</span><span className="a">Uniswap V3…</span><span className="d"><span data-q-amt="0.5" data-q-fee="0.003" data-q-unit="USDG" data-q-dec="2" data-q-prefix="">1,134.20 USDG</span></span></em></div><div className="d">The burner swaps on Uniswap V3 at the public price. 1% slippage cap.</div></div><div className="lp-node"><div className="t">Re-shield <em className="st"><span className="p">queued</span><span className="a">re-shielding…</span><span className="d">note updated</span></em></div><div className="d">The USDG goes straight back into the pool as a fresh note.</div></div></div><div className="lp-card"><h4>Swap privately</h4><div className="sub">Private balance · 1.300 ETH on Robinhood Chain</div><div className="lp-field"><label>From</label><div>0.500 ETH<i className="hatch" aria-hidden="true" /></div></div><div className="lp-field"><label>To</label><div><span data-q-amt="0.5" data-q-fee="0.003" data-q-unit="USDG" data-q-dec="2" data-q-prefix="≈ ">≈ 1,134.20 USDG</span><i className="hatch" aria-hidden="true" /></div></div><div className="lp-field"><label>Price</label><div><span data-q-amt="1" data-q-fee="0" data-q-unit="USDG / ETH" data-q-dec="2" data-q-prefix="">2,268.40 USDG / ETH</span>&nbsp;· 1% slippage<i className="hatch" aria-hidden="true" /></div></div><div className="prog"><i /></div><div className="go"><span className="g0">Swap privately</span><span className="g1">Swapping…</span><span className="g2">Re-shielded · nothing links the trade</span></div></div><div className="lp-mini lp-quote"><b>Quote</b><span>Uniswap V3 · refreshes every 5 s</span><div className="q"><em data-tick="2268.40">2,268.40</em><small>USDG / ETH</small><i className="spin">⇄</i></div><svg viewBox="0 0 272 40" preserveAspectRatio="none" aria-hidden="true"><polyline points="0,34 18,30 36,32 54,24 72,26 90,20 108,22 126,16 144,18 162,12 180,14 198,10 216,12 234,6 252,8 272,4" /></svg></div></div>
          <div className="lp-win-grid lp-scene" data-scene="recover"><div className="lp-flow"><div className="lp-node"><div className="t">Derive <em className="st"><span className="p">queued</span><span className="a">deriving…</span><span className="d">128 burners</span></em></div><div className="d">Every burner key you ever used is re-derived from your signature. No backup needed.</div></div><div className="lp-node"><div className="t">Scan <em className="st"><span className="p">queued</span><span className="a">checking chains…</span><span className="d">4 chains</span></em></div><div className="d">Each burner is checked on every pool chain for stranded funds.</div></div><div className="lp-node"><div className="t">Sweep <em className="st"><span className="p">queued</span><span className="a">sweeping…</span><span className="d">0.25 ETH swept</span></em></div><div className="d">Stranded funds are swept back into your private balance.</div></div><div className="lp-node"><div className="t">Intents <em className="st"><span className="p">queued</span><span className="a">verifying…</span><span className="d">3 verified</span></em></div><div className="d">Every bridge intent in your encrypted registry is re-checked with 1Click.</div></div></div><div className="lp-card"><h4>Recover</h4><div className="sub">Scanning 4 chains · 3 intents in registry</div><div className="lp-field"><label>burner 0x4a1e…c0d2</label><div className="mono">0.25 ETH stranded<i className="hatch" aria-hidden="true" /></div></div><div className="lp-field"><label>burner 0x77b0…9e1f</label><div className="mono">empty<i className="hatch" aria-hidden="true" /></div></div><div className="lp-field"><label>bridge → Solana · 1Click</label><div className="mono">delivered<i className="hatch" aria-hidden="true" /></div></div><div className="prog"><i /></div><div className="go"><span className="g0">Recover</span><span className="g1">Scanning…</span><span className="g2">Swept to private balance</span></div></div><div className="lp-mini lp-scan"><b>Scanning from signature</b><span>burners derived · 4 chains · intent registry</span><div className="q"><em><b data-counter>0</b> / 128</em><small>burners checked</small></div><u><em /></u><div className="found">1 stranded burner found · 3 intents verified</div></div></div>
            <div className="lp-term" aria-hidden="true">
              <div className="td"><i /><i /><i /></div>
              <div className="tset" data-for="bridge"><div className="tl l0"><span className="c">$</span> blackpool bridge --from <b data-r="fromSlug">robinhood</b> --to <b data-r="toSlug">solana</b> --amount <b data-r="shield">1.000 ETH</b></div>
              <div className="tl l1">proof     groth16 · 1.6 s · built on your device</div>
              <div className="tl l2">intent    1Click deposit <b data-r="recipient">7Gx4…kQ2m</b> funded by one-time burner</div>
              <div className="tl l3 ok">status    delivered · <b data-r="out">2,259.40 USDC</b> · no trail</div></div>
              <div className="tset" data-for="shield"><div className="tl l0"><span className="c">$</span> blackpool shield --chain robinhood --amount 1 ETH</div><div className="tl l1">note      commitment 0x8f3a…c21e</div><div className="tl l2">tree      leaf 4 821 · root updated</div><div className="tl l3 ok">status    shielded · private balance +1.000 ETH</div></div>
              <div className="tset" data-for="send"><div className="tl l0"><span className="c">$</span> blackpool send --to 0x9f3c…41e7 --amount 0.25 ETH</div><div className="tl l1">proof     groth16 · 1.4 s · built on your device</div><div className="tl l2">relayer   submitted · gas paid from the note</div><div className="tl l3 ok">status    delivered · nothing to trace</div></div>
              <div className="tset" data-for="swap"><div className="tl l0"><span className="c">$</span> blackpool swap --from eth --to usdg --amount 0.5</div><div className="tl l1">burner    one-time 0x77b0…9e1f funded</div><div className="tl l2">router    Uniswap V3 · <span data-q-amt="0.5" data-q-fee="0.003" data-q-unit="USDG" data-q-dec="2" data-q-prefix="">1,134.20 USDG</span> out</div><div className="tl l3 ok">status    re-shielded · nothing links the trade</div></div>
              <div className="tset" data-for="recover"><div className="tl l0"><span className="c">$</span> blackpool recover --scan</div><div className="tl l1">registry  128 burners decrypted</div><div className="tl l2">found     0x4a1e…c0d2 · 0.25 ETH stranded</div><div className="tl l3 ok">status    swept to private balance</div></div>
            </div>
          </div>
          <div className="lp-win-tag"><i />Live · Private bridge</div>
          <div className="lp-win-done"><span className="ok">Run complete</span><button type="button" className="lp-replay">Replay</button></div>
        </div>

        <section className="lp-sec" id="how">
          <p className="lp-eyebrow" data-anim="">Introducing Blackpool</p>
          <h2 className="lp-h2" data-anim="" data-delay="1">Every step of a payment,<br /><span className="dim">none of the exposure</span></h2>

          <div className="lp-bento">
            <Link href="/app" className="lp-bc wide" data-anim="" data-delay="0">
              <span className="k">Shield</span><h3>Deposit into a per-token anonymity pool</h3><span className="arrow">↗</span>
              <div className="vis"><div className="lp-stack"><div className="lp-ghost"><span>Private balance</span><b>0.812 ETH → 1.812 ETH</b></div><div className="lp-mock">
                <div className="row"><span>Shielding 1.000 ETH</span><span className="mono">Base</span></div>
                <div className="bar"><i /></div>
                <div className="row seq"><span><span className="chk">✓</span>Note encrypted to your account</span></div>
                <div className="row seq"><span><span className="chk">✓</span>Commitment added to the Merkle tree</span></div>
                <div className="row seq"><span><span className="chk">✓</span>Private balance updated</span><span className="mono">+1.000</span></div>
              </div></div></div>
            </Link>
            <Link href="/app" className="lp-bc wide" data-anim="" data-delay="1">
              <span className="k">Private send</span><h3>Pay any address without linking it to you</h3><span className="arrow">↗</span>
              <div className="vis"><div className="lp-stack"><div className="lp-ghost"><span>Recipient</span><b>0x9f3c…41e7 · Base</b></div><div className="lp-mock">
                <div className="row"><span className="big">0.25 ETH</span><span className="chip">relayer pays gas</span></div>
                <div className="row seq"><span><span className="chk">✓</span>Proof generated on your device</span></div>
                <div className="row seq"><span><span className="chk">✓</span>Submitted by the relayer</span></div>
                <div className="row seq"><span><span className="chk">✓</span>Delivered to 0x9f3c…41e7</span></div>
              </div></div></div>
            </Link>
            <Link href="/app" className="lp-bc" data-anim="" data-delay="2">
              <span className="k">Swap</span><h3>Trade inside the pool, settle back privately</h3><span className="arrow">↗</span>
              <div className="vis"><div className="lp-mock">
                <div className="row"><span className="tok"><img src="/token_logos/eth.png" alt="" />0.5 ETH</span><span className="swap">⇄</span><span className="tok"><img src="/token_logos/usdc.png" alt="" /><span data-q-amt="0.5" data-q-fee="0.003" data-q-unit="USDC" data-q-dec="0" data-q-prefix="">1,134 USDC</span></span></div>
                <div className="row"><span className="mono">Uniswap V3 · one-time burner · re-shielded</span></div>
              </div></div>
            </Link>
            <Link href="/app" className="lp-bc" data-anim="" data-delay="0">
              <span className="k">Private bridge</span><h3>Cross chains through intents, not bridges</h3><span className="arrow">↗</span>
              <div className="vis"><div className="lp-mock">
                <div className="vroute"><span className="chip"><img src="/token_logos/robinhood.png?v=2" alt="" />Robinhood Chain · 1.000 ETH shielded</span><span className="vline"><i /></span><span className="chip mid">One-time burner pays the 1Click deposit</span><span className="vline"><i /></span><span className="chip dst"><img src="/token_logos/solana.png" alt="" />Solana · <span data-q-amt="1" data-q-fee="0.004" data-q-unit="USDC" data-q-dec="2" data-q-prefix="">2,259.40 USDC</span>&nbsp;delivered</span></div>
                <div className="row"><span className="mono">origin chain never carries the recipient</span><span className="mono">~25 s</span></div>
              </div></div>
            </Link>
            <Link href="/recover" className="lp-bc" data-anim="" data-delay="1">
              <span className="k">Recovery</span><h3>Funds recoverable from your signature alone</h3><span className="arrow">↗</span>
              <div className="vis"><div className="lp-mock">
                <div className="row"><span className="mono">burner 0x4a1e…c0d2</span><span className="chip ok">swept</span></div>
                <div className="row"><span className="mono">burner 0x77b0…9e1f</span><span className="chip pend">empty</span></div>
                <div className="row"><span className="mono cur">bridge → Solana</span><span className="chip ok">delivered</span></div>
              </div></div>
            </Link>
          </div>
        </section>

        <section className="lp-sec">
          <p className="lp-grid-head" data-anim="">How people use Blackpool</p>
          <div className="lp-lgrid">
            {LINKS.map((l, i) => (<Link href={l.h} className="lp-lg" key={l.t} data-anim="" data-delay={String(i % 4)}><Icon k={l.i} c={l.c} /><span>{l.t}</span></Link>))}
          </div>
        </section>

        <section className="lp-sec">
          <div className="lp-pgrid">
            <div className="lp-pc feat" data-anim="" data-delay="0">
              <div className="art" />
              <div className="body">
                <span className="tag">Principle</span>
                <p>“No fixed denominations, no mixer queues, no waiting periods. <span className="dim">Any amount, whenever you want it back.</span>”</p>
                <div className="who"><span><b>Pool design</b>2-in / 2-out shielded notes with change</span></div>
              </div>
            </div>
            <div className="lp-pc" data-anim="" data-delay="1">
              <span className="tag">Principle</span>
              <p>“Your signature derives everything, on your device. <span className="dim">It never leaves your browser, every proof is built locally, and nothing that can spend your notes is stored.</span>”</p>
              <div className="who"><span><b>Non-custodial</b>Pools are contracts; nothing that can spend your notes is stored</span></div>
            </div>
            <div className="lp-pc" data-anim="" data-delay="2">
              <span className="tag">Principle</span>
              <p>“The relayer pays the gas, <span className="dim">so the paying wallet is never yours.</span>”</p>
              <div className="who"><span><b>Relayed transactions</b>The relayer only sees finished proofs; a flat fee comes from the note itself</span></div>
            </div>
            <div className="lp-pc" data-anim="" data-delay="0">
              <span className="tag">Principle</span>
              <p>“Bridges should not know who is on the other side. <span className="dim">Intents keep the recipient off the origin chain.</span>”</p>
              <div className="who"><span><b>NEAR Intents routing</b>One-off solver deposit address per transfer</span></div>
            </div>
            <div className="lp-pc" data-anim="" data-delay="1">
              <span className="tag">Principle</span>
              <p>“If a step fails, the money is still yours. <span className="dim">Every burner and bridge is recoverable from any device.</span>”</p>
              <div className="who"><span><b>Recovery from any device</b>Burner keys encrypted client-side, bridges tracked to the end</span></div>
            </div>
          </div>
        </section>

        <section className="lp-sec lp-agents" id="agents">
          <div className="lp-ag" data-anim="">
            <div className="lp-ag-copy">
              <p className="lp-ag-eyebrow">Built for agents</p>
              <h2>Your agent can pay privately too.</h2>
              <p>The Blackpool CLI answers in JSON with stable exit codes and runs as an MCP server, listed in the official MCP Registry and on Glama. One file, AGENTS.md, tells an agent everything: setup, every command, limits, recipes, errors and the safety rules.</p>
              <div className="lp-ag-cta">
                <Link href="/agents" className="lp-btn pri">Read AGENTS.md</Link>
                <a href="/AGENTS.md" download="AGENTS.md" className="lp-btn">Download</a>
              </div>
              <div className="lp-ag-listed" aria-label="Where the MCP server is listed">
                <a href="https://registry.modelcontextprotocol.io/v0.1/servers/cash.blackpool%2Fblackpool/versions/latest" target="_blank" rel="noopener noreferrer"><i />MCP Registry<span>cash.blackpool/blackpool</span></a>
                <a href="https://glama.ai/mcp/servers/blackpooldev/blackpool" target="_blank" rel="noopener noreferrer"><i />Glama<span>9 tools · verified</span></a>
                <a href="https://www.npmjs.com/package/@blackpool/cli" target="_blank" rel="noopener noreferrer"><i />npm<span>@blackpool/cli</span></a>
              </div>
              <p className="lp-ag-more"><Link href="/guides/private-payments-for-ai-agents">Guide: give your agent a private wallet over MCP <span aria-hidden="true">→</span></Link></p>
            </div>
            <div className="lp-ag-term" aria-label="Example agent session">
              <div className="td"><i /><i /><i /><span>agent</span></div>
              <pre><span className="c">$</span> npm i -g @blackpool/cli{"\n"}<span className="c">$</span> export BLACKPOOL_JSON=1{"\n"}<span className="c">$</span> blackpool send 0x9f3c…41e7 10 --pool usdc{"\n"}<span className="ok">{'{"ok":true,"command":"send","received":"8.965",'}</span>{"\n"}<span className="ok">{' "symbol":"USDC","txHash":"0x5b1e…a04c"}'}</span></pre>
            </div>
          </div>
        </section>

        <section className="lp-sec lp-faq" id="faq">
          <div className="lp-faq-head" data-anim="">
            <h2 className="lp-h2">Questions, answered.</h2>
            <p>The short version. Everything else is in the <Link href="/docs#faq">docs</Link>.</p>
          </div>
          <div className="lp-faq-grid" data-anim="" data-delay="1">
            {FAQ.filter((f) => f.home).map((f) => (
              <details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>
            ))}
          </div>
          <JsonLd data={siteGraph()} />
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) }) }} />
        </section>

        <section className="lp-cta" data-anim="" data-blur="">
          <h2 className="lp-h2">Move value privately.<br /><span className="dim">Start with one signature.</span></h2>
          <p>Connect a wallet, sign once, and your private account exists on every supported chain.</p>
          <Link href="/app" className="lp-btn pri lg">Launch app</Link>
        </section>

        <div className="lp-toast" role="status"><button type="button" className="x" aria-label="Dismiss">✕</button><Link href="/changelog">See new features from Blackpool<span>View changelog ›</span></Link></div>

        <footer className="lp-foot">
          <div className="lp-foot-grid" data-anim="">
            <div className="lp-foot-brand">
              <div className="lp-brand"><Mark className="lp-mark" size={26} />Blackpool</div>
              <p className="tagline">Private payments that leave no trail</p>
              <div className="lp-badge">
                <span className="lp-badge-seal">ZK</span>
                <span><b>Zero-knowledge proofs</b><br />Non-custodial by design</span>
              </div>
            </div>
            <div><h5>Product</h5><ul><li><Link href="/app">App</Link></li><li><a href="/docs#shield">Shield &amp; send</a></li><li><a href="/docs#swap">Swap</a></li><li><a href="/docs#bridge">Private bridge</a></li><li><Link href="/recover">Recovery</Link></li></ul></div>
            <div><h5>Chains</h5><ul><li><Link href="/private-payments/robinhood-chain">Robinhood Chain</Link></li><li><Link href="/private-payments/base">Base</Link></li><li><Link href="/private-payments/arbitrum">Arbitrum</Link></li><li><Link href="/private-payments/bnb-chain">BNB Chain</Link></li><li><a href="/docs#chain-ethereum">Ethereum</a></li><li><a href="/docs#chain-solana">Solana</a></li></ul></div>
            <div><h5>Developers</h5><ul><li><Link href="/docs">Docs</Link></li><li><a href="/docs#cli">CLI</a></li><li><Link href="/agents">Agents (AGENTS.md)</Link></li><li><a href="/agents#9-mcp-servers">MCP server</a></li><li><a href="/docs#api">API</a></li><li><a href="/docs#security">Security model</a></li><li><Link href="/analytics">Analytics</Link></li><li><Link href="/changelog">Changelog</Link></li></ul></div>
            <div><h5>Resources</h5><ul><li><a href="#faq">FAQ</a></li><li><Link href="/guides/send-crypto-privately">Send crypto privately</Link></li><li><Link href="/guides/private-payments-for-ai-agents">Payments for AI agents</Link></li><li><a href="https://github.com/blackpooldev/blackpool" target="_blank" rel="noopener noreferrer">GitHub</a></li><li><a href="https://www.npmjs.com/package/@blackpool/cli" target="_blank" rel="noopener noreferrer">npm package</a></li><li><a href="/docs#contracts">Contract addresses</a></li><li><a href="https://github.com/blackpooldev/blackpool/blob/main/SECURITY.md" target="_blank" rel="noopener noreferrer">Security policy</a></li><li><Link href="/status">Status</Link></li><li><a href="mailto:hello@blackpool.cash">Contact</a></li></ul></div>
          </div>
          <div className="lp-foot-bottom">
            <nav><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><a href="/docs#security">Security</a><Link href="/status">Status</Link></nav>
            <div className="lp-social"><a href="https://github.com/blackpooldev/blackpool" target="_blank" rel="noopener noreferrer" aria-label="GitHub">GitHub</a></div>
          </div>
          <p className="lp-copy">© {new Date().getFullYear()} Blackpool. All rights reserved.</p>
          <FootMark />
        </footer>
      </div>
    </main>
  );
}
