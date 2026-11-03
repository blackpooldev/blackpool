"use client";
import { useCallback, useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "https://api.blackpool.cash";

type Level = "ok" | "warn" | "down" | "pending";
type Row = { name: string; level: Level; detail: string; ms?: number };

// Relayer gas below this is flagged: a private send costs well under it, but a busy hour can drain it.
const CHAINS: Array<{ key: string; label: string; rpc: string[]; native: string; low: number }> = [
  { key: "robinhood", label: "Robinhood Chain", rpc: ["https://rpc.mainnet.chain.robinhood.com"], native: "ETH", low: 0.002 },
  { key: "base", label: "Base", rpc: ["https://mainnet.base.org", "https://base-rpc.publicnode.com"], native: "ETH", low: 0.002 },
  { key: "arbitrum", label: "Arbitrum", rpc: ["https://arb1.arbitrum.io/rpc", "https://arbitrum-one-rpc.publicnode.com"], native: "ETH", low: 0.002 },
  { key: "bsc", label: "BNB Chain", rpc: ["https://bsc-dataseed.binance.org", "https://bsc-rpc.publicnode.com"], native: "BNB", low: 0.005 },
];
const LABEL: Record<Level, string> = { ok: "Operational", warn: "Degraded", down: "Down", pending: "Checking…" };

async function timed<T>(fn: () => Promise<T>): Promise<{ v: T; ms: number }> {
  const t = performance.now();
  const v = await fn();
  return { v, ms: Math.round(performance.now() - t) };
}
const getJson = async (url: string, init?: RequestInit) => {
  const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15000), ...init });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
  return j;
};

export default function StatusView() {
  const [core, setCore] = useState<Row[]>([]);
  const [chains, setChains] = useState<Array<Row & { gas?: string; block?: number }>>([]);
  const [at, setAt] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async () => {
    setBusy(true);
    setCore([{ name: "Relayer API", level: "pending", detail: "" }, { name: "Indexer", level: "pending", detail: "" }]);
    setChains(CHAINS.map((c) => ({ name: c.label, level: "pending", detail: "" })));

    const health = timed(() => getJson(`${API}/api/health`)).then(
      ({ v, ms }) => ({ ok: !!v?.ok, v, ms }),
      (e) => ({ ok: false, v: null as any, ms: undefined as number | undefined, err: String(e?.message || e) }),
    );
    const indexer = timed(() => getJson(`${API}/api/analytics`)).then(
      ({ v, ms }) => ({ ok: !!v?.success, v, ms }),
      (e) => ({ ok: false, v: null as any, ms: undefined as number | undefined, err: String(e?.message || e) }),
    );
    // A chain is only "down" when every public RPC we know for it fails (each tried twice).
    const blockOf = async (urls: string[]) => {
      for (const url of [...urls, ...urls]) {
        try {
          const { v, ms } = await timed(() => getJson(url, {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
          }));
          if (v?.result) return { block: parseInt(v.result, 16), ms };
        } catch { /* next endpoint */ }
      }
      return { block: undefined as number | undefined, ms: undefined as number | undefined };
    };
    const rpcs = CHAINS.map((c) => blockOf(c.rpc));

    const [h, ix, ...rp] = await Promise.all([health, indexer, ...rpcs]);
    const pools = h.v?.pools ? Object.keys(h.v.pools).length : 0;
    setCore([
      { name: "Relayer API", level: h.ok ? "ok" : "down", detail: h.ok ? `${pools} pools configured` : ("err" in h ? h.err : "unreachable"), ms: h.ms },
      { name: "Indexer", level: ix.ok ? (ix.v?.errors ? "warn" : "ok") : "down", detail: ix.ok ? `${new Intl.NumberFormat("en-US").format(ix.v.totals.notes)} shielded notes indexed${ix.v?.errors ? ` · ${Object.keys(ix.v.errors).length} pool(s) lagging` : ""}` : ("err" in ix ? ix.err : "unreachable"), ms: ix.ms },
    ]);
    setChains(CHAINS.map((c, i) => {
      const gasRaw = h.v?.relayerGas?.[c.key];
      const gas = gasRaw !== undefined ? Number(gasRaw) : undefined;
      const rpcOk = rp[i].block !== undefined;
      const gasOk = gas === undefined ? h.ok : gas >= c.low;
      const level: Level = !rpcOk || !h.ok ? "down" : gasOk ? "ok" : "warn";
      const detail = !rpcOk ? "RPC unreachable" : !h.ok ? "relayer API down" : gasOk ? "Relayer funded" : "Relayer gas low, private sends may queue";
      return { name: c.label, level, detail, ms: rp[i].ms, block: rp[i].block, gas: gas !== undefined ? `${gas.toFixed(4)} ${c.native}` : "—" };
    }));
    setAt(new Date());
    setBusy(false);
  }, []);

  useEffect(() => { run(); }, [run]);

  const all = [...core, ...chains];
  const overall: Level = all.some((r) => r.level === "pending") ? "pending" : all.some((r) => r.level === "down") ? "down" : all.some((r) => r.level === "warn") ? "warn" : "ok";
  const headline = overall === "pending" ? "Checking all systems…" : overall === "ok" ? "All systems operational" : overall === "warn" ? "Some systems degraded" : "Some systems are down";

  return (
    <>
      <section>
        <div className="st-overall"><i className={`st-dot ${overall === "pending" ? "" : overall}`} />{headline}</div>
      </section>

      <section>
        <h2>Services</h2>
        <table className="st-table">
          <thead><tr><th>Service</th><th>Status</th><th>Detail</th><th className="num">Response</th></tr></thead>
          <tbody>
            {core.map((r) => (
              <tr key={r.name}><td>{r.name}</td><td className="st-s"><span><i className={`st-dot ${r.level === "pending" ? "" : r.level}`} />{LABEL[r.level]}</span></td><td>{r.detail}</td><td className="num mono">{r.ms !== undefined ? `${r.ms} ms` : "—"}</td></tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Chains</h2>
        <table className="st-table">
          <thead><tr><th>Chain</th><th>Status</th><th>Detail</th><th className="num">Latest block</th><th className="num">Relayer gas</th></tr></thead>
          <tbody>
            {chains.map((r) => (
              <tr key={r.name}><td>{r.name}</td><td className="st-s"><span><i className={`st-dot ${r.level === "pending" ? "" : r.level}`} />{LABEL[r.level]}</span></td><td>{r.detail}</td><td className="num mono">{r.block ? new Intl.NumberFormat("en-US").format(r.block) : "—"}</td><td className="num mono">{r.gas ?? "—"}</td></tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <p className="st-meta">{at ? `Checked ${at.toISOString().replace("T", " ").slice(0, 16) + " UTC"} from your browser.` : "Running checks…"} If the API is down, funds stay safe in the pools and on burners; private operations resume when it is back.</p>
        <button className="st-refresh" onClick={run} disabled={busy}>{busy ? "Checking…" : "Check again"}</button>
      </section>
    </>
  );
}
