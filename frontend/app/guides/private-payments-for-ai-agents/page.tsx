import Link from "next/link";
import SubPage from "../../components/SubPage";
import JsonLd, { article, breadcrumbs, faqPage } from "../../components/JsonLd";
import { pageMeta } from "../../components/seo";

const PATH = "/guides/private-payments-for-ai-agents";
const TITLE = "Private payments for AI agents";
const DESC = "Give an AI agent a wallet that can pay without exposing its history: set up the Blackpool MCP server, choose which tools the agent may use, and keep its payments private on four chains.";

export const metadata = pageMeta(PATH, `${TITLE} (MCP) — Blackpool`, DESC, "article");

const CONFIG = `{
  "mcpServers": {
    "blackpool": {
      "command": "npx",
      "args": ["-y", "@blackpool/cli@latest", "mcp"],
      "env": {
        "BLACKPOOL_KEY": "0x<agent-wallet-private-key>",
        "BLACKPOOL_MCP_TOOLS": "balance,send,bridges"
      }
    }
  }
}`;

const FAQ = [
  { q: "Which agent apps does it work with?", a: "Any app that supports the Model Context Protocol over stdio, which covers most desktop chat apps, coding assistants and agent frameworks. Apps that only support remote servers can use the hosted read-only endpoint for quotes, fees and status." },
  { q: "Does the wallet key leave the machine?", a: "No. The local server runs on the same machine as the agent app, builds proofs there and only sends finished proofs to the relayer. The hosted endpoint never receives keys or signatures." },
  { q: "How do I stop the agent from spending too much?", a: "Fund the agent wallet with only what it may spend, and expose only the tools it needs with BLACKPOOL_MCP_TOOLS, or use BLACKPOOL_MCP_READONLY=1 to allow reads only." },
  { q: "Where is the server listed?", a: "In the official MCP Registry as cash.blackpool/blackpool and on Glama, where the server is built and tested from the open-source repository." },
];

export default function AgentsGuide() {
  return (
    <SubPage sub="Guides" title={`${TITLE} (MCP)`} lead={DESC} updated="November 6, 2026">
      <JsonLd data={[article(PATH, TITLE, DESC, "2026-11-06"), breadcrumbs([["Home", "/"], [TITLE, PATH]]), faqPage(FAQ)]} />

      <section>
        <h2>Why an agent&apos;s wallet needs privacy</h2>
        <p>An agent that pays for things from a normal wallet publishes everything it does: which services it uses, who it pays, how much and how often. Anyone can follow that address, copy its strategy or see its balance. With Blackpool the agent keeps a private balance and pays any address from it, so its payments stop forming a public trail.</p>
      </section>

      <section>
        <h2>Set up the MCP server</h2>
        <p>The Blackpool CLI runs as a Model Context Protocol server. Add it to your agent app&apos;s MCP configuration:</p>
        <pre className="sp-pre"><code>{CONFIG}</code></pre>
        <p>Use a separate wallet for the agent and fund it with the asset to shield plus a little gas for deposits. The server starts without a key, so the agent can read fees and routes before you fund anything.</p>
      </section>

      <section>
        <h2>What the agent can do</h2>
        <table className="st-table">
          <thead><tr><th>Tool</th><th>What it does</th></tr></thead>
          <tbody>
            <tr><td><code>blackpool_balance</code></td><td>Private and public balances, per pool or on every chain</td></tr>
            <tr><td><code>blackpool_deposit</code></td><td>Shield funds from the agent wallet</td></tr>
            <tr><td><code>blackpool_send</code></td><td>Pay any address privately; the relayer pays gas</td></tr>
            <tr><td><code>blackpool_swap</code></td><td>Swap between the native coin and a stablecoin inside the pool</td></tr>
            <tr><td><code>blackpool_bridge</code></td><td>Move value privately to another chain, Solana included</td></tr>
            <tr><td><code>blackpool_bridges</code>, <code>blackpool_assets</code></td><td>Bridge history and available routes</td></tr>
            <tr><td><code>blackpool_recover</code></td><td>Sweep anything left on one-time burners back</td></tr>
          </tbody>
        </table>
        <p>Every tool returns the same JSON as the CLI, with <code>ok</code> and a clear error when something is refused.</p>
      </section>

      <section>
        <h2>Keep the agent on a short leash</h2>
        <ul>
          <li><b>Allow-list tools:</b> <code>BLACKPOOL_MCP_TOOLS=balance,send</code> exposes only those two.</li>
          <li><b>Read-only mode:</b> <code>BLACKPOOL_MCP_READONLY=1</code> lets the agent look but not move funds.</li>
          <li><b>Limit the balance:</b> the agent can only spend what the agent wallet holds.</li>
          <li><b>No blind retries:</b> after a timeout the agent should check <code>blackpool_balance</code> or <code>blackpool_bridges</code> before trying again. The full rules are in <Link href="/agents">AGENTS.md</Link>.</li>
        </ul>
      </section>

      <section>
        <h2>Plan with the hosted server</h2>
        <p>A read-only server runs at <code>https://mcp.blackpool.cash/mcp</code> with no sign-in. It answers fees, minimums, bridge quotes, analytics and status, and serves the agent guide. It never receives keys, so agents can use it to plan and the local server to act.</p>
      </section>

      <section>
        <h2>Questions</h2>
        {FAQ.map((f) => (<div key={f.q}><h3>{f.q}</h3><p>{f.a}</p></div>))}
      </section>

      <section>
        <h2>Next</h2>
        <p>Read the full <Link href="/agents">agent guide</Link>, see the chains in <Link href="/private-payments">private payments on every chain</Link>, or install the package from <a href="https://www.npmjs.com/package/@blackpool/cli" target="_blank" rel="noopener noreferrer">npm</a>.</p>
      </section>
    </SubPage>
  );
}
