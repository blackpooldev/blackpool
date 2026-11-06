import Link from "next/link";
import SubPage from "../components/SubPage";
import JsonLd, { breadcrumbs } from "../components/JsonLd";
import { pageMeta } from "../components/seo";
import { CHAIN_PAGES } from "./chains";

const DESC = "Private crypto payments on Robinhood Chain, Base, Arbitrum and BNB Chain: shield once, then send, swap and bridge with zero-knowledge proofs, with no custody and no gas from your wallet.";

export const metadata = pageMeta("/private-payments", "Private crypto payments on every chain — Blackpool", DESC);

export default function PrivatePayments() {
  return (
    <SubPage sub="Private payments" title="Private crypto payments on every chain" lead={DESC}>
      <JsonLd data={breadcrumbs([["Home", "/"], ["Private payments", "/private-payments"]])} />
      <section>
        <h2>Pick a chain</h2>
        <ul>
          {CHAIN_PAGES.map((c) => (
            <li key={c.slug}><Link href={`/private-payments/${c.slug}`}>{c.title}</Link>: {c.pools.map((p) => p.asset).join(", ")} pools, private swaps on {c.dex}.</li>
          ))}
        </ul>
        <p>Private bridges also deliver to Ethereum and Solana, which have no Blackpool pool of their own.</p>
      </section>
      <section>
        <h2>The same account everywhere</h2>
        <p>One wallet signature creates your private account on every chain at once. Your keys are derived from it on your device, so signing again on any device restores the same balances.</p>
      </section>
      <section>
        <h2>Guides</h2>
        <ul>
          <li><Link href="/guides/send-crypto-privately">How to send crypto without exposing your wallet</Link></li>
          <li><Link href="/guides/private-payments-for-ai-agents">Private payments for AI agents (MCP)</Link></li>
        </ul>
      </section>
    </SubPage>
  );
}
