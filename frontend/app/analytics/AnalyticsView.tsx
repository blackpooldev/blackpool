"use client";
import { useEffect, useMemo, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "";

type Payload = {
  success: boolean;
  totals: { notes: number; pools: number; chains: number };
  by_chain: Record<string, number>;
  by_pool: Record<string, { chain: string; pool: string; notes: number; latestBlock?: number | null }>;
  series: Array<Record<string, number | string>>;
  seriesUnit?: "day" | "month";
  recent: Array<{ chain: string; pool: string; index: number; blockNumber: number; txHash: string | null }>;
  revenue?: {
    totals?: Record<string, { value?: string | number }>;
    counts?: Record<string, number>;
    usd?: { total_usd?: number } | null;
  };
  generatedAt?: string;
};

// Fixed categorical order (never cycled); validated for the dark surface (OKLCH band, CVD ΔE ≥ 13).
const CHAINS: Array<{ key: string; label: string; color: string; explorer?: string }> = [
  { key: "base", label: "Base", color: "#4C7FE3", explorer: "https://basescan.org/tx/" },
  { key: "robinhood", label: "Robinhood Chain", color: "#27A563", explorer: "https://robin.etherscan.io/tx/" },
  { key: "arbitrum", label: "Arbitrum", color: "#7B68E0", explorer: "https://arbiscan.io/tx/" },
  { key: "bsc", label: "BNB Chain", color: "#C2842A", explorer: "https://bscscan.com/tx/" },
  { key: "ethereum", label: "Ethereum", color: "#1FA2BC", explorer: "https://etherscan.io/tx/" },
];
const OTHER = { key: "other", label: "Other", color: "#D65252" };
const chainMeta = (k: string) => CHAINS.find((c) => c.key === k) || { ...OTHER, key: k, label: k };
const fmt = (n: number | undefined) => (n === undefined || Number.isNaN(n) ? "—" : new Intl.NumberFormat("en-US").format(n));
const short = (h: string) => (h ? `${h.slice(0, 6)}…${h.slice(-4)}` : "—");

export default function AnalyticsView() {
  const [data, setData] = useState<Payload | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "empty">("loading");
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`${API}/api/analytics`, { cache: "no-store" });
        const j = (await r.json()) as Payload;
        if (!alive) return;
        if (j && j.success && j.totals) { setData(j); setState("ok"); } else setState("empty");
      } catch { if (alive) setState("empty"); }
    })();
    return () => { alive = false; };
  }, []);

  const chains = useMemo(() => {
    const keys = Object.keys(data?.by_chain || {});
    return keys.sort((a, b) => (data!.by_chain[b] || 0) - (data!.by_chain[a] || 0));
  }, [data]);
  const seriesKeys = useMemo(() => {
    const ks = new Set<string>();
    (data?.series || []).forEach((row) => Object.keys(row).forEach((k) => k !== "period" && ks.add(k)));
    return CHAINS.map((c) => c.key).filter((k) => ks.has(k)).concat([...ks].filter((k) => !CHAINS.some((c) => c.key === k)));
  }, [data]);
  const feeTotals = data?.revenue?.totals || {};
  const feeUsd = data?.revenue?.usd?.total_usd;
  const feeParts = Object.entries(feeTotals).filter(([, v]) => Number(v?.value) > 0)
    .map(([sym, v]) => `${Number(v.value).toLocaleString("en-US", { maximumSignificantDigits: 4 })} ${sym}`);
  const feeTx = Object.values(data?.revenue?.counts || {}).reduce((a, n) => a + n, 0);
  const feeValue = feeUsd !== undefined && feeUsd !== null ? `$${feeUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : feeParts.length ? feeParts[0] : data ? "$0.00" : "—";
  const feeSub = feeParts.length ? `${feeParts.join(" · ")} · ${fmt(feeTx)} fee txs` : "Exact, wei-precise";
  const unit = data?.seriesUnit || "month";
  const hasSeries = !!data && (data.series || []).some((r) => Object.entries(r).some(([k, v]) => k !== "period" && Number(v) > 0));

  return (
    <div className="an-body">
      <div className="an-head">
        <p className="an-eyebrow">Protocol analytics</p>
        <h1>Public numbers only</h1>
        <p className="an-lead">Everything here is derived from data that is already on-chain: commitments, tree indices, block numbers and relayer fees. Deposit amounts are encrypted on-chain, so there is deliberately no “TVL in USD” — a number nobody can verify is not a number worth showing.</p>
      </div>

      {state === "empty" && (
        <div className="an-empty">
          <span className="an-dot" />Pools are not live yet. Analytics populate automatically from the first shielded note.
        </div>
      )}

      <section className="an-tiles" aria-label="Totals">
        <Tile label="Shielded notes" value={fmt(data?.totals.notes)} sub="Commitments across all pools" />
        <Tile label="Pools" value={fmt(data?.totals.pools)} sub="Live privacy pools" />
        <Tile label="Chains" value={fmt(data?.totals.chains)} sub="Networks with a pool" />
        <Tile label="Relayer fees" value={feeValue} sub={feeSub} />
      </section>

      <section className="an-grid">
        <div className="an-card an-card-wide">
          <div className="an-card-h"><h2>New shielded notes</h2><span>per {unit} · stacked per chain</span></div>
          {hasSeries ? <BarChart rows={data!.series} keys={seriesKeys} unit={unit} /> : <Placeholder h={260} />}
          {seriesKeys.length > 0 && (
            <div className="an-legend">{seriesKeys.map((k) => { const m = chainMeta(k); return <span key={k}><i style={{ background: m.color }} />{m.label}</span>; })}</div>
          )}
        </div>
        <div className="an-card">
          <div className="an-card-h"><h2>Notes by chain</h2><span>share of all commitments</span></div>
          {data && chains.length ? <Bars chains={chains} data={data.by_chain} /> : <Placeholder h={220} />}
        </div>
      </section>

      <section className="an-grid an-grid-2">
        <div className="an-card">
          <div className="an-card-h"><h2>Pools</h2><span>{data ? `${Object.keys(data.by_pool).length} pools` : ""}</span></div>
          <table className="an-table">
            <thead><tr><th>Chain</th><th>Pool</th><th className="num">Notes</th><th className="num">Last block</th></tr></thead>
            <tbody>
              {data ? Object.values(data.by_pool).sort((a, b) => b.notes - a.notes).map((p) => {
                const m = chainMeta(p.chain);
                return (<tr key={`${p.chain}:${p.pool}`}><td><i className="an-swatch" style={{ background: m.color }} />{m.label}</td><td className="mono">{p.pool.toUpperCase()}</td><td className="num">{fmt(p.notes)}</td><td className="num mono">{p.latestBlock ? fmt(p.latestBlock) : "—"}</td></tr>);
              }) : <tr><td colSpan={4} className="an-muted">No pools indexed yet.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="an-card">
          <div className="an-card-h"><h2>Recent shields</h2><span>latest commitments</span></div>
          <table className="an-table">
            <thead><tr><th>Chain</th><th>Pool</th><th className="num">Index</th><th className="num">Block</th><th>Tx</th></tr></thead>
            <tbody>
              {data && data.recent?.length ? data.recent.slice(0, 12).map((r, i) => {
                const m = chainMeta(r.chain);
                return (<tr key={i}><td><i className="an-swatch" style={{ background: m.color }} />{m.label}</td><td className="mono">{r.pool.toUpperCase()}</td><td className="num mono">{r.index}</td><td className="num mono">{fmt(r.blockNumber)}</td><td className="mono">{r.txHash && "explorer" in m && m.explorer ? <a href={`${m.explorer}${r.txHash}`} target="_blank" rel="noopener noreferrer">{short(r.txHash)}</a> : short(r.txHash || "")}</td></tr>);
              }) : <tr><td colSpan={5} className="an-muted">Nothing to show yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <p className="an-foot">{data?.generatedAt ? `Generated ${new Date(data.generatedAt).toLocaleString()} · refreshed every minute` : "Data refreshes every minute once pools are live."} · Source: pool contracts via the Blackpool indexer. Amounts are never read; only public commitments are counted.</p>
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return <div className="an-tile"><span className="an-tile-l">{label}</span><span className="an-tile-v">{value}</span><span className="an-tile-s">{sub}</span></div>;
}
function Placeholder({ h }: { h: number }) {
  return <div className="an-ph" style={{ height: h }}><span>Waiting for the first shielded note</span></div>;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function periodLabel(p: string, unit: "day" | "month") {
  const [y, m, d] = p.split("-").map(Number);
  return unit === "day" ? `${MONTHS[(m || 1) - 1]} ${d}` : `${MONTHS[(m || 1) - 1]} ${String(y).slice(2)}`;
}

function BarChart({ rows, keys, unit }: { rows: Array<Record<string, number | string>>; keys: string[]; unit: "day" | "month" }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720, H = 260, P = { l: 44, r: 16, t: 14, b: 28 };
  // rows carry new notes per period per chain (already increments)
  const inc = rows.map((r) => { const o: Record<string, number> = {}; for (const k of keys) o[k] = Math.max(0, Number(r[k] || 0)); return o; });
  const totals = inc.map((o) => keys.reduce((a, k) => a + o[k], 0));
  const max = Math.max(1, ...totals);
  const iw = (W - P.l - P.r) / Math.max(1, rows.length); const bw = Math.max(4, Math.min(28, iw * 0.62));
  const y = (v: number) => P.t + (H - P.t - P.b) * (1 - v / max);
  const ticks = [0, 0.5, 1].map((f) => Math.round(max * f));
  const labelEvery = Math.ceil(rows.length / 6);
  return (
    <div className="an-chart" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`New shielded notes per ${unit}, stacked per chain`}>
        {ticks.map((t) => <g key={t}><line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} className="an-grid-l" /><text x={P.l - 8} y={y(t) + 4} className="an-axis" textAnchor="end">{fmt(t)}</text></g>)}
        {rows.map((r, i) => {
          const x = P.l + i * iw + (iw - bw) / 2; let acc = 0; const segs = keys.map((k) => { const v = inc[i][k]; const y0 = y(acc + v), h = y(acc) - y(acc + v); acc += v; return { k, y0, h, v }; }).filter((s) => s.h > 0);
          const dim = hover !== null && hover !== i;
          return (
            <g key={i} className="an-barg" opacity={dim ? 0.45 : 1}>
              {segs.map((s, si) => <rect key={s.k} x={x} y={s.y0} width={bw} height={Math.max(1, s.h)} rx={si === segs.length - 1 ? 3 : 0} fill={chainMeta(s.k).color} className="an-barseg" style={{ animationDelay: `${i * 25}ms` }} />)}
              {(i % labelEvery === 0 || i === rows.length - 1) && <text x={x + bw / 2} y={H - 8} className="an-axis" textAnchor="middle">{periodLabel(String(r.period), unit)}</text>}
              <rect x={P.l + i * iw} width={iw} y={P.t} height={H - P.t - P.b} fill="transparent" onMouseEnter={() => setHover(i)} />
            </g>);
        })}
      </svg>
      {hover !== null && (
        <div className="an-tip" style={{ left: `${((P.l + hover * iw + iw / 2) / W) * 100}%` }}>
          <b>{periodLabel(String(rows[hover].period), unit)} · {fmt(totals[hover])} new notes</b>
          {keys.map((k) => <div key={k}><i style={{ background: chainMeta(k).color }} />{chainMeta(k).label}<span>{fmt(inc[hover][k])}</span></div>)}
        </div>
      )}
    </div>
  );
}

function Bars({ chains, data }: { chains: string[]; data: Record<string, number> }) {
  const total = chains.reduce((a, k) => a + (data[k] || 0), 0) || 1;
  const max = Math.max(1, ...chains.map((k) => data[k] || 0));
  return (
    <div className="an-bars">
      {chains.map((k) => { const m = chainMeta(k); const v = data[k] || 0; return (
        <div key={k} className="an-bar" title={`${m.label}: ${fmt(v)} notes`}>
          <span className="an-bar-l"><i style={{ background: m.color }} />{m.label}</span>
          <span className="an-bar-t"><i style={{ width: `${(v / max) * 100}%`, background: m.color }} /></span>
          <span className="an-bar-v">{fmt(v)}<small>{Math.round((v / total) * 100)}%</small></span>
        </div>); })}
    </div>
  );
}
