import Link from "next/link";
import { notFound } from "next/navigation";
import SubPage from "../../components/SubPage";
import JsonLd, { article, breadcrumbs, faqPage } from "../../components/JsonLd";
import { pageMeta } from "../../components/seo";
import { CHAIN_PAGES, chainBySlug, type ChainPage } from "../chains";

const UPDATED = "2026-11-06";
export const dynamicParams = false;

export function generateStaticParams() {
  return CHAIN_PAGES.map((c) => ({ chain: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ chain: string }> }) {
  const c = chainBySlug((await params).chain);
  if (!c) return {};
  const path = `/private-payments/${c.slug}`;
  return pageMeta(path, `${c.title} — Blackpool`, c.description, "article");
}

function exampleFee(c: ChainPage) {
  const p = c.pools.find((x) => x.asset !== c.pools[0].asset) ?? c.pools[0];
  const flat = parseFloat(p.flatFee);
  const fee = +(flat + 10 * 0.0035).toFixed(3);
  return { asset: p.asset, fee, gets: +(10 - fee).toFixed(3) };
}

function faqFor(c: ChainPage) {
  const gas = c.pools[0].asset;
  const ex = exampleFee(c);
  return [
    { q: `Can people see who I paid on ${c.short}?`, a: `They can see that funds went into the Blackpool pool and that a payment came out of it, but not which deposit paid which recipient. The deposit is a public transaction; the link between it and your later payments is what the zero-knowledge proof hides.` },
    { q: `Do I need ${gas} for gas to send privately?`, a: `Only to shield, because that transaction comes from your own wallet. After that the relayer pays the gas for every private send, swap and bridge, and its fee is taken from the amount you move.` },
    { q: "Is Blackpool custodial?", a: "No. Funds sit in the pool contract and only a proof made with your keys can spend them. The relayer can submit a transaction or decline to, but it cannot change the recipient or the amount, because both are fixed inside the proof." },
    { q: `What does a private send on ${c.short} cost?`, a: `The pool's flat fee plus 0.35% of the amount, taken from the amount. Sending 10 ${ex.asset} costs ${ex.fee} ${ex.asset}, so the recipient gets ${ex.gets} ${ex.asset}. Shielding has no Blackpool fee, only network gas.` },
  ];
}

export default async function ChainLanding({ params }: { params: Promise<{ chain: string }> }) {
  const c = chainBySlug((await params).chain);
  if (!c) notFound();
  const path = `/private-payments/${c.slug}`;
  const faq = faqFor(c);
  const others = CHAIN_PAGES.filter((x) => x.slug !== c.slug);
  const assets = c.pools.map((p) => p.asset).join(c.pools.length > 2 ? ", " : " and ").replace(/, ([^,]*)$/, " and $1");

  return (
    <SubPage sub={c.name} title={c.title} lead={`${c.description} ${c.about}`}>
      <JsonLd data={[article(path, c.title, c.description, UPDATED), breadcrumbs([["Home", "/"], ["Private payments", "/private-payments"], [c.name, path]]), faqPage(faq)]} />

      <section>
        <h2>What you can do on {c.short}</h2>
        <ul>
          <li><b>Shield</b> {assets} from your wallet into a private balance. This is the only step that shows your address on-chain.</li>
          <li><b>Send privately</b> to any address on {c.short}. The recipient gets a normal transfer from the pool; nothing on-chain points back to your wallet.</li>
          <li><b>Swap privately</b> between {c.pools[0].asset} and the stablecoin{c.pools.length > 2 ? "s" : ""} through {c.dex}, with the output going straight back into your private balance.</li>
          <li><b>Bridge privately</b> to other chains through NEAR Intents, from the {c.bridgeFrom.map((o) => <code key={o}>{o}</code>).reduce((a, b) => <>{a}, {b}</>)} pool{c.bridgeFrom.length > 1 ? "s" : ""}.</li>
        </ul>
      </section>

      <section>
        <h2>Pools, fees and minimums</h2>
        <table className="st-table">
          <thead><tr><th>Pool</th><th>Min deposit</th><th>Min send, swap or bridge</th><th>Flat fee</th></tr></thead>
          <tbody>{c.pools.map((p) => <tr key={p.asset}><td>{p.asset}</td><td>{p.minDeposit}</td><td>{p.minSpend}</td><td>{p.flatFee}</td></tr>)}</tbody>
        </table>
        <p>Every private spend pays the flat fee plus 0.35% of the amount, deducted from the amount. Shielding has no Blackpool fee. Bridges add the solver&apos;s own quote, which the app shows before you confirm.</p>
      </section>

      <section>
        <h2>How it stays private</h2>
        <ul>
          <li>Your device builds a zero-knowledge proof that you own funds in the pool, without saying which deposit they came from.</li>
          <li>A relayer submits the transaction and pays the gas, so your wallet never signs or pays for a private spend.</li>
          <li>The recipient, the amount and the fee are fixed inside the proof, so nobody in between can change them.</li>
          <li>Your keys come from one wallet signature and stay on your device; the server never sees them. See the <Link href="/docs#security">security model</Link>.</li>
        </ul>
      </section>

      <section>
        <h2>Get started</h2>
        <p><b>In the browser:</b> open <Link href="/app">the app</Link>, connect a wallet, choose {c.name} in the network menu, sign once and shield. After that, use Send privately, Swap or Private bridge.</p>
        <p><b>From a terminal or an AI agent:</b> the <Link href="/docs#cli">Blackpool CLI</Link> does the same with JSON output:</p>
        <pre className="sp-pre"><code>{`npm i -g @blackpool/cli\nblackpool deposit 0.01 --chain ${c.cliChain}\n${c.example}`}</code></pre>
        {c.notes.map((n) => <p key={n}>{n}</p>)}
      </section>

      <section>
        <h2>Questions</h2>
        {faq.map((f) => (<div key={f.q}><h3>{f.q}</h3><p>{f.a}</p></div>))}
      </section>

      <div className="sp-note"><p>The pool contracts have not had an external audit yet, and each pool&apos;s admin is a 2-of-3 multisig that can pause or upgrade it but cannot move funds. Size your balances accordingly.</p></div>

      <section>
        <h2>Other chains</h2>
        <ul>{others.map((o) => <li key={o.slug}><Link href={`/private-payments/${o.slug}`}>{o.title}</Link></li>)}</ul>
        <p>Guides: <Link href="/guides/send-crypto-privately">how to send crypto without exposing your wallet</Link> · <Link href="/guides/private-payments-for-ai-agents">private payments for AI agents</Link>.</p>
      </section>
    </SubPage>
  );
}
