import { FAQ } from "../faq";
import Link from "next/link";
import Mark from "../components/Mark";
import "./docs.css";
import CodeCopy from "../components/CodeCopy";
import { highlight } from "../lib/highlight";

export const metadata = {
  title: "Docs — Blackpool",
  description: "How Blackpool's zero-knowledge privacy pools work: shield, private send, swap, bridge, recovery, CLI and API.",
};

const NAV = [
  ["overview", "Overview"], ["concepts", "Core concepts"], ["shield", "Shield"], ["send", "Private send"],
  ["swap", "Swap"], ["bridge", "Private bridge"], ["recovery", "Recovery"], ["chains", "Chains & assets"],
  ["fees", "Fees & limits"], ["cli", "CLI"], ["agents", "Agents"], ["api", "API"], ["security", "Security model"], ["faq", "FAQ"],
];

function Code({ children, lang = "sh" }: { children: string; lang?: string }) {
  return <pre className="hl" data-lang={lang === "sh" ? "shell" : lang}><code dangerouslySetInnerHTML={{ __html: highlight(children, lang) }} /></pre>;
}

export default function Docs() {
  return (
    <main className="dc">
      <header className="dc-nav">
        <div className="dc-nav-in">
          <Link href="/" className="dc-brand"><Mark size={24} />Blackpool<span className="dc-brand-docs">Docs</span></Link>
          <nav className="dc-nav-links"><Link href="/">Home</Link><Link href="/recover">Recover</Link><Link href="/changelog">Changelog</Link><a href="#cli">CLI</a><Link href="/agents">Agents</Link><a href="#api">API</a></nav>
          <Link href="/app" className="dc-btn">Launch app</Link>
        </div>
      </header>

      <div className="dc-body">
        <aside className="dc-side">
          <div className="dc-side-h">Documentation</div>
          <nav>{NAV.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}</nav>
          <div className="dc-side-foot">Contents track the running code, not a spec.</div>
        </aside>

        <article className="dc-main">
          <p className="dc-eyebrow">Documentation</p>
          <h1>Private payments that leave no trail</h1>
          <p className="dc-lead">Blackpool is a set of zero-knowledge privacy pools on EVM chains. You shield funds into a pool, then send, swap or bridge them without any on-chain link between the money that went in and the money that comes out. Nothing is held for you: every balance is a note only your wallet can spend.</p>

          <section id="overview">
            <h2>Overview</h2>
            <p>Each supported chain runs one pool per asset (native coin plus a stablecoin). Deposits add an encrypted <em>note</em> to a Merkle tree; spending a note means proving, in zero knowledge, that you own a leaf of that tree without revealing which one. Blackpool uses Groth16 proofs, built by the relayer API from your signature-derived keys, and a relayer that submits transactions so your wallet never has to appear on-chain again after the deposit.</p>
            <div className="dc-grid">
              <div><b>Non-custodial</b><span>Pools are smart contracts. No operator can move or freeze your notes.</span></div>
              <div><b>No fixed denominations</b><span>Shield any amount above the pool minimum. Partial spends return change as a new note.</span></div>
              <div><b>No waiting periods</b><span>Anonymity comes from the pool size, not from timers.</span></div>
              <div><b>One signature</b><span>Your private account is derived from a single wallet signature, so it exists on every chain at once.</span></div>
            </div>
          </section>

          <section id="concepts">
            <h2>Core concepts</h2>
            <h3>Private account</h3>
            <p>When you connect a wallet, you sign a fixed message once. The signature is hashed into your spending key and your encryption key, so the same wallet reproduces the same account on any device. The app keeps the signature in memory only (no browser storage) and never sends it anywhere. Your keys, your balance and every zero-knowledge proof are computed on your device; the relayer receives finished proofs only. See the <a href="#security">security model</a>.</p>
            <h3>Notes, commitments and nullifiers</h3>
            <p>A note is <code>(amount, owner, blinding)</code>. Its <em>commitment</em> is inserted in the pool's Merkle tree. To spend, you publish a <em>nullifier</em> (a hash that commits to the note without revealing it) and a proof that the note exists in the tree and that inputs equal outputs plus fees. The contract rejects a nullifier it has seen before, which is what prevents double spends.</p>
            <h3>Relayer</h3>
            <p>Every private operation is a <code>transact</code> call on the pool. The relayer pays gas and broadcasts it; the fee is taken inside the proof from the amount you are moving, so you never need gas in a fresh address. The relayer learns the public destination of a withdrawal but not who funded it.</p>
          </section>

          <section id="shield">
            <h2>Shield (deposit)</h2>
            <p>Shielding moves public funds into the pool. The app prepares a proof for a new note worth the deposit, your wallet sends the token (or native coin) to the pool contract together with that proof, and the commitment is appended to the tree. Shielding is the only step your wallet signs on-chain.</p>
            <ol className="dc-steps">
              <li><b>Prepare</b> — the API builds an output note for you and a Groth16 proof (<code>POST /api/deposit/prepare</code>).</li>
              <li><b>Broadcast</b> — your wallet calls <code>transact</code> with the deposit amount (ERC-20s need a one-time approval).</li>
              <li><b>Confirm</b> — the pool emits the new commitment and an encrypted copy of the note that only your viewing key can read.</li>
            </ol>
            <p className="dc-note">Your private balance is the sum of your unspent notes, found by scanning the pool's encrypted notes with your keys. Balances are never stored anywhere, in plaintext or otherwise.</p>
          </section>

          <section id="send">
            <h2>Private send</h2>
            <p>A private send spends one or more notes and pays an external address. The relayer submits it, so the recipient sees a plain transfer from the pool contract with no connection to your wallet. Up to two recipients can be paid in one proof; any remainder returns to you as change.</p>
            <Code>{`Recipient   0x9f3c…41e7
Amount      0.25 ETH
Fee         0.00015 ETH + 0.35%   (paid from the pool, no gas needed)
Result      pool → recipient. Nothing on-chain links the two.`}</Code>
          </section>

          <section id="swap">
            <h2>Swap</h2>
            <p>Swaps happen inside the pool's privacy set. The app creates a random one-time burner wallet, registers its key (encrypted in your browser) in the burner registry, withdraws to it privately, swaps on the chain's DEX — Uniswap V3 on Robinhood Chain, Base and Arbitrum, PancakeSwap V3 on BNB Chain — and re-shields the output into the destination pool. The burner is used once; because it is registered before it is funded, it can always be recovered from your signature.</p>
            <p>Gas for the burner is capped per chain to realistic values; the app refuses to start a swap whose output would fall under the destination pool's minimum after slippage.</p>
          </section>

          <section id="bridge">
            <h2>Private bridge</h2>
            <p>Cross-chain moves use <strong>NEAR Intents (1Click)</strong>. Blackpool asks for a quote, receives a one-off deposit address controlled by the solver network, and pays it from the pool through a burner. Solvers deliver the destination asset to your recipient. The origin chain never sees the recipient, and the destination chain never sees the origin.</p>
            <ul className="dc-list">
              <li>Destinations include EVM chains (Base, Ethereum, Arbitrum, BNB Chain, Robinhood Chain) and <strong>Solana</strong> (SOL, USDC, USDT).</li>
              <li>Every bridge is recorded server-side in an <em>intent registry</em> keyed to your account, with a refund address on the origin chain in case a quote expires.</li>
              <li>Status is tracked until <code>SUCCESS</code> or <code>REFUNDED</code>; you can follow any intent on the public NEAR Intents explorer.</li>
            </ul>
          </section>

          <section id="recovery">
            <h2>Recovery</h2>
            <p>Anything that can get stuck is recoverable from your signature alone. The <Link href="/recover">Recover</Link> page lists every burner wallet registered to your account (with live balances on all four chains) and every bridge intent, and lets you sweep or re-shield funds from any device. No seed phrases, no exports: the same wallet signature regenerates everything.</p>
          </section>

          <section id="chains">
            <h2>Chains &amp; assets</h2>
            <table className="dc-table">
              <thead><tr><th>Chain</th><th>Pools</th><th>Swap</th><th>Private bridge</th></tr></thead>
              <tbody>
                <tr id="chain-robinhood"><td>Robinhood Chain</td><td>ETH · USDG</td><td>Uniswap V3</td><td>in / out</td></tr>
                <tr id="chain-base"><td>Base</td><td>ETH · USDC</td><td>Uniswap V3</td><td>in / out</td></tr>
                <tr id="chain-arbitrum"><td>Arbitrum</td><td>ETH · USDC</td><td>Uniswap V3</td><td>in / out</td></tr>
                <tr id="chain-bsc"><td>BNB Chain</td><td>BNB · USDC · USDT</td><td>PancakeSwap V3</td><td>in / out</td></tr>
                <tr id="chain-ethereum"><td>Ethereum</td><td>—</td><td>—</td><td>destination only</td></tr>
                <tr id="chain-solana"><td>Solana</td><td>—</td><td>—</td><td>destination only (SOL, USDC, USDT)</td></tr>
              </tbody>
            </table>
            <h3 id="contracts">Contract addresses</h3>
            <table className="dc-table">
              <thead><tr><th>Chain</th><th>Pool</th><th>Address</th></tr></thead>
              <tbody>
                <tr><td>Robinhood Chain</td><td>ETH</td><td><a href="https://robin.etherscan.io/address/0x993490DCc199A41D5A2A412e30bA205FD43B9D69" target="_blank" rel="noopener noreferrer"><code>0x993490DCc199A41D5A2A412e30bA205FD43B9D69</code></a></td></tr>
                <tr><td>Robinhood Chain</td><td>USDG</td><td><a href="https://robin.etherscan.io/address/0xeBfC2287Efc2FEDc51e24124A582bcb6CcDD5300" target="_blank" rel="noopener noreferrer"><code>0xeBfC2287Efc2FEDc51e24124A582bcb6CcDD5300</code></a></td></tr>
                <tr><td>Base</td><td>ETH</td><td><a href="https://basescan.org/address/0xEC0FB87E77Fb18Abbbda726E69adFc561b148A02" target="_blank" rel="noopener noreferrer"><code>0xEC0FB87E77Fb18Abbbda726E69adFc561b148A02</code></a></td></tr>
                <tr><td>Base</td><td>USDC</td><td><a href="https://basescan.org/address/0x71716bCc48Ec226De36fa07d11959b1C27e9EC19" target="_blank" rel="noopener noreferrer"><code>0x71716bCc48Ec226De36fa07d11959b1C27e9EC19</code></a></td></tr>
                <tr><td>Arbitrum</td><td>ETH</td><td><a href="https://arbiscan.io/address/0xEC0FB87E77Fb18Abbbda726E69adFc561b148A02" target="_blank" rel="noopener noreferrer"><code>0xEC0FB87E77Fb18Abbbda726E69adFc561b148A02</code></a></td></tr>
                <tr><td>Arbitrum</td><td>USDC</td><td><a href="https://arbiscan.io/address/0x59E4f3A645cD9d23c99e12a00e541B77331B8Ad4" target="_blank" rel="noopener noreferrer"><code>0x59E4f3A645cD9d23c99e12a00e541B77331B8Ad4</code></a></td></tr>
                <tr><td>BNB Chain</td><td>BNB</td><td><a href="https://bscscan.com/address/0xEC0FB87E77Fb18Abbbda726E69adFc561b148A02" target="_blank" rel="noopener noreferrer"><code>0xEC0FB87E77Fb18Abbbda726E69adFc561b148A02</code></a></td></tr>
                <tr><td>BNB Chain</td><td>USDC</td><td><a href="https://bscscan.com/address/0x59E4f3A645cD9d23c99e12a00e541B77331B8Ad4" target="_blank" rel="noopener noreferrer"><code>0x59E4f3A645cD9d23c99e12a00e541B77331B8Ad4</code></a></td></tr>
                <tr><td>BNB Chain</td><td>USDT</td><td><a href="https://bscscan.com/address/0x3A3225C54b6D326C855eEa77d76a6F143Df6555D" target="_blank" rel="noopener noreferrer"><code>0x3A3225C54b6D326C855eEa77d76a6F143Df6555D</code></a></td></tr>
              </tbody>
            </table>
            <p className="dc-note">Every pool is a UUPS proxy; the admin can upgrade and pause, nothing else. The same address can be a different contract on another chain (same deployer and nonce), so always read an address together with its chain. Full address book (implementations, verifiers, hashers, deploy blocks): <a href="https://github.com/blackpooldev/blackpool/blob/main/deploy/ADDRESSES.md" target="_blank" rel="noopener noreferrer">deploy/ADDRESSES.md</a>. Blackpool uses public RPC endpoints only.</p>
          </section>

          <section id="fees">
            <h2>Fees &amp; limits</h2>
            <table className="dc-table">
              <thead><tr><th>Pool</th><th>Flat fee</th><th>Rate</th><th>Minimum deposit</th></tr></thead>
              <tbody>
                <tr><td>ETH (Robinhood Chain, Base, Arbitrum)</td><td>0.00015 ETH</td><td>0.35%</td><td>0.001 ETH</td></tr>
                <tr><td>BNB (BNB Chain)</td><td>0.001 BNB</td><td>0.35%</td><td>0.01 BNB</td></tr>
                <tr><td>USDC (Base)</td><td>1 USDC</td><td>0.35%</td><td>3 USDC</td></tr>
                <tr><td>USDG (Robinhood Chain)</td><td>0.5 USDG</td><td>0.35%</td><td>3 USDG</td></tr>
                <tr><td>USDC (Arbitrum, BNB Chain) · USDT (BNB Chain)</td><td>0.5</td><td>0.35%</td><td>3</td></tr>
              </tbody>
            </table>
            <p>Fees are deducted inside the proof from the amount you move and cover relayer gas. A spend must be more than twice its own fee. Bridges pay the pool fee plus the solver's quoted rate; there is no additional Blackpool fee on bridges, and each route has its own solver minimum, which the app shows before you confirm.</p>
          </section>

          <section id="cli">
            <h2>CLI</h2>
            <p>The CLI does everything the app does, with the same local proving: it signs the sign-in message, derives your keys, scans your notes and generates proofs on your machine, then hands finished proofs to the relayer. Your wallet key is read from <code>BLACKPOOL_KEY</code> or stored locally with <code>chmod 600</code>; neither the key nor the signature leaves your machine. The proving key (about 20 MB) is downloaded once to <code>~/.blackpool/zk/</code> and checked against its SHA-256.</p>
            <Code>{`npm i -g @blackpool/cli
blackpool login                         # hidden prompt, or set BLACKPOOL_KEY
blackpool balance --chain base
blackpool deposit 25 --pool usdc        # shield
blackpool send 0xRECIPIENT 2.5          # private send, relayer pays gas
blackpool swap 0.001 --from eth         # private ETH → USDC via Uniswap V3
blackpool bridge 0.05 --to sol_usdc --recipient <solana address>
blackpool bridges                       # list your intents and their status
blackpool recover                       # sweep stranded burners`}</Code>
            <p>Every command accepts <code>--chain base|robinhood|arbitrum|bsc</code> (default <code>base</code>).</p>
          </section>

          <section id="agents">
            <h2>Agents</h2>
            <p>The CLI is built to be driven by AI agents and scripts: no prompts when <code>BLACKPOOL_KEY</code> is set, one JSON object on stdout with <code>--json</code>, progress on stderr, and stable exit codes (<code>0</code> ok, <code>1</code> failed, <code>2</code> usage). Read the full guide on the <Link href="/agents">Agents page</Link>, or point your agent straight at <a href="/AGENTS.md" target="_blank" rel="noopener noreferrer"><code>blackpool.cash/AGENTS.md</code></a> — it carries every command, the JSON fields each one returns, minimums, retry rules and the security notes in one file.</p>
            <Code>{`export BLACKPOOL_KEY=0x...        # dedicated agent wallet, never your main one
export BLACKPOOL_JSON=1           # JSON on stdout for every command
blackpool address                 # fund this with gas + the asset to shield
blackpool deposit 25 --pool usdc  # shield once
blackpool send 0xRECIPIENT 10 --pool usdc
{"ok":true,"command":"send","received":"8.965","fee":"1.035","symbol":"USDC","txHash":"0x…"}`}</Code>
            <table className="dc-table">
              <thead><tr><th>Rule</th><th>Why</th></tr></thead>
              <tbody>
                <tr><td>Retry <code>balance</code>, <code>assets</code>, <code>bridges</code>, <code>recover</code> freely</td><td>Read-only or idempotent.</td></tr>
                <tr><td>Never blindly retry <code>deposit</code>, <code>send</code>, <code>swap</code>, <code>bridge</code></td><td>A timeout can mean it landed; check <code>balance --wait</code> or <code>bridges</code> first.</td></tr>
                <tr><td>Give commands at least 3 minutes</td><td>Each private operation builds a proof (about 30–90 s).</td></tr>
                <tr><td>Use <code>bridge --no-wait</code> in loops</td><td>Returns once the solver has the funds; poll <code>bridges</code> later.</td></tr>
                <tr><td>Agent app with MCP support</td><td>Run the local server <code>npx -y @blackpool/cli@latest mcp</code> (all tools, key stays local) or connect the read-only <code>https://mcp.blackpool.cash/mcp</code>.</td></tr>
                <tr><td>Treat <code>~/.blackpool/config.json</code> like a key</td><td>It caches the sign-in signature, which can spend the private balance. <code>BLACKPOOL_HOME</code> moves it.</td></tr>
              </tbody>
            </table>
          </section>

          <section id="api">
            <h2>API</h2>
            <p>Base URL: <code>https://api.blackpool.cash</code>. The API never receives your sign-in signature or keys. Clients read public pool data, prove locally and post finished proofs to <code>/api/relay</code>; the relayer checks its fee, simulates and broadcasts. Registry calls carry a separate registry-auth signature derived from the sign-in signature, from which the sign-in signature cannot be recovered. Rate limits per IP: 40 relay operations per minute (deposit, withdraw, swaps, burner gas) and 600 reads per minute; a <code>429</code> response includes <code>retryAfter</code> in seconds.</p>
            <table className="dc-table">
              <thead><tr><th>Endpoint</th><th>Purpose</th></tr></thead>
              <tbody>
                <tr><td><code>GET /api/health</code></td><td>Relayer status, pools and relayer gas per chain</td></tr>
                <tr><td><code>GET /api/assets</code></td><td>Supported pools and bridge assets</td></tr>
                <tr><td><code>GET /api/price</code></td><td>ETH and BNB spot prices</td></tr>
                <tr><td><code>GET /api/analytics</code>, <code>/api/revenue</code></td><td>Public protocol numbers and exact relayer fees</td></tr>
                <tr><td><code>GET /api/zk/config</code></td><td>Pools, fees and fee recipient for clients that prove locally</td></tr>
                <tr><td><code>GET /api/zk/pool</code></td><td>One consistent snapshot of a pool: root, every leaf and encrypted note, every spent nullifier (all public on-chain data)</td></tr>
                <tr><td><code>GET /api/zk/allowance</code></td><td>Token allowance of a depositor, before an ERC-20 shield</td></tr>
                <tr><td><code>POST /api/relay</code></td><td>Validate, simulate and broadcast a finished withdraw proof; the relayer pays gas</td></tr>
                <tr><td><code>POST /api/swap/quote</code></td><td>Live solver quote for a private swap or bridge; the client then proves a withdraw to the returned deposit address</td></tr>
                <tr><td><code>POST /api/bridge/quote</code></td><td>Bridge price preview</td></tr>
                <tr><td><code>GET /api/intent-status</code></td><td>Status of a bridge by deposit address</td></tr>
                <tr><td><code>POST /api/intents</code></td><td>All bridges for the signed-in account</td></tr>
                <tr><td><code>POST /api/burner/register</code>, <code>/list</code>, <code>/mark-swept</code></td><td>Encrypted burner registry for recovery (paginated list)</td></tr>
                <tr><td><code>POST /api/burner-gas</code></td><td>Relayer tops up a burner's gas (active swaps only, capped)</td></tr>
              </tbody>
            </table>
            <p>Deprecated: <code>POST /api/balance</code>, <code>/api/withdraw</code>, <code>/api/deposit/prepare</code>, <code>/api/swap</code> and <code>/api/swap-private</code> took the sign-in signature and proved on the server. They remain only for CLI 0.3 and older and are removed on 2026-12-03; update with <code>npm i -g @blackpool/cli@latest</code>.</p>
          </section>

          <section id="security">
            <h2>Security model</h2>
            <h3>What is hidden</h3>
            <p>The link between a deposit and any later spend; your balance; which note a spend consumes; the origin of a bridged payment on its destination chain.</p>
            <h3>What is public</h3>
            <p>That a deposit of a given amount entered a pool; that a withdrawal of a given amount left it to a given address; the fee paid. Anonymity grows with the number and variety of notes in a pool — a very unusual amount is easier to correlate.</p>
            <h3>Trust assumptions</h3>
            <p><b>Client-side proving.</b> Your device derives your keys from the sign-in signature, finds your notes in public pool data and generates every proof (the web app in a background worker, the CLI in Node). The relayer receives only the finished proof and its public inputs, so it cannot spend, redirect or resize your payment: changing any field invalidates the proof. What the relayer can do is refuse or delay a relay, and like any server it sees your IP address and the public data of the transactions it broadcasts. Pool data comes from our indexer; your device rebuilds the Merkle tree from it and the contract only accepts proofs against roots it has seen, so stale or wrong data makes a transaction fail rather than misdirect funds.</p>
            <p><b>Admin.</b> Every pool is a UUPS proxy whose admin is a 2-of-3 Safe, <code>0x401027251176A8AFec701fE37412edeC45ec6FdB</code>, the same address on every chain. It can upgrade and pause pools; it cannot move notes. Any upgrade needs two of the three owners to sign.</p>
            <p><b>Audit status.</b> The contracts and circuits have not been externally audited yet.</p>
            <p><b>Bridges</b> rely on NEAR Intents solvers for delivery, with refunds to the origin chain on failure.</p>
          </section>

          <section id="faq">
            <h2>FAQ</h2>
            {FAQ.map((f) => (<details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>))}
          </section>

          <footer className="dc-foot">
            <span>© {new Date().getFullYear()} Blackpool</span>
            <nav><Link href="/">Home</Link><Link href="/app">App</Link><Link href="/recover">Recover</Link></nav>
          </footer>
        </article>
        <CodeCopy />
      </div>
    </main>
  );
}
