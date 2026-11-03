import type { ReactNode } from "react";

// Areas drive the filter chips; each entry lists the areas it touches.
export const AREAS: Array<{ key: string; label: string }> = [
  { key: "shield", label: "Shield" },
  { key: "send", label: "Private send" },
  { key: "swap", label: "Swap" },
  { key: "bridge", label: "Private bridge" },
  { key: "recovery", label: "Recovery" },
  { key: "analytics", label: "Analytics" },
  { key: "cli", label: "CLI" },
  { key: "docs", label: "Docs" },
];
export const label = (k: string) => AREAS.find((a) => a.key === k)?.label ?? k;

export type Entry = {
  slug: string; date: string; kind: "New feature" | "Improvement"; areas: string[];
  title: string; lead: string; bullets: string[];
  primary: { href: string; text: string }; docs?: string; vis: ReactNode;
  pill?: string; // short line for the rotating "New" pill on the landing (newest first)
};

export const ENTRIES: Entry[] = [
  {
    slug: "bridges-in-wallet", date: "Nov 3, 2026", kind: "Improvement", areas: ["bridge"],
    pill: "Your private bridges now live in the wallet panel",
    title: "Private bridges in the wallet panel",
    lead: "Open the wallet button to see your private bridges; the form keeps one line while a bridge is running.",
    bullets: [
      "The wallet button shows how many bridges are in flight. Its panel lists the latest bridges with status, amount received and a Track link, plus History & recovery for older ones.",
      "On phones the panel opens as a sheet from the bottom of the screen.",
      "While a bridge runs, a single line above the form shows it; a delivered bridge stays there for a few minutes.",
    ],
    primary: { href: "/app", text: "Open the app" }, docs: "/docs",
    vis: (
      <div className="cl-mock">
        <div className="cl-mock-h">Wallet<span>Private bridges</span></div>
        <div className="cl-row"><span>0.004 ETH Arbitrum → Base</span><span className="cl-pill pend">Bridging</span></div>
        <div className="cl-row"><span>0.00657 ETH Base → Robinhood</span><span className="cl-pill ok">Delivered</span></div>
        <div className="cl-row"><span>History &amp; recovery</span><span className="cl-pill ok">/recover</span></div>
      </div>
    ),
  },
  {
    slug: "lower-bnb-minimum", date: "Nov 3, 2026", kind: "Improvement", areas: ["shield", "bridge", "cli"],
    pill: "BNB minimum deposit is now 0.01 BNB",
    title: "Lower BNB minimum, steadier network switching",
    lead: "Shielding into the BNB pool now starts at 0.01 BNB, and switching networks no longer gets stuck.",
    bullets: [
      "The minimum deposit for the BNB pool is 0.01 BNB, down from 0.02. The withdraw fee at the minimum is about 10%; the other pools are unchanged.",
      "The network button asks the wallet directly and reads its real network afterwards, so it no longer stays on \"Switching...\" with wallets that skip the network-change event. A cancelled or unanswered switch shows a short note.",
      "The running step in the progress window has a new animation, and a delivered bridge is shown once, in the Recent bridges card.",
      "CLI 0.4.1 applies the same BNB minimum.",
    ],
    primary: { href: "/app", text: "Open the app" }, docs: "/docs#fees",
    vis: (
      <div className="cl-mock">
        <div className="cl-mock-h">BNB pool<span>BNB Chain</span></div>
        <div className="cl-row"><span>Minimum deposit</span><span className="cl-pill ok">0.01 BNB</span></div>
        <div className="cl-row"><span>Withdraw fee</span><span className="cl-pill pend">0.001 + 0.35%</span></div>
        <div className="cl-row"><span>Network switch</span><span className="cl-pill ok">no more stuck</span></div>
      </div>
    ),
  },
  {
    slug: "safe-admin", date: "Nov 3, 2026", kind: "Improvement", areas: ["shield", "send", "swap", "bridge"],
    pill: "Pool admin is now a 2-of-3 multisig",
    title: "Pools controlled by a multisig",
    lead: "Upgrading or pausing any pool now takes two of three independent signatures.",
    bullets: [
      "Every pool on Robinhood Chain, Base, Arbitrum and BNB Chain is administered by one Safe, 0x401027251176A8AFec701fE37412edeC45ec6FdB, the same address on all four chains.",
      "The launch admin key handed over and holds no rights. The admin still cannot move notes; it can only pause or upgrade, now with two signatures.",
    ],
    primary: { href: "/docs#security", text: "Read the security model" }, docs: "/docs#contracts",
    vis: (
      <div className="cl-mock">
        <div className="cl-mock-h">Admin<span>Safe · 2 of 3</span></div>
        <div className="cl-row"><span>Robinhood · Base · Arbitrum · BNB</span><span className="cl-pill ok">same Safe</span></div>
        <div className="cl-row"><span>Upgrade or pause</span><span className="cl-pill pend">2 signatures</span></div>
        <div className="cl-row"><span>Move user notes</span><span className="cl-pill ok">impossible</span></div>
      </div>
    ),
  },
  {
    slug: "client-side-proving", date: "Nov 3, 2026", kind: "New feature", areas: ["shield", "send", "swap", "bridge", "cli"],
    pill: "Proofs are now built on your device",
    title: "Client-side proving",
    lead: "Your keys and every zero-knowledge proof stay on your device. The relayer only ever sees finished proofs.",
    bullets: [
      "The web app proves in a background worker and CLI 0.4.0 proves in Node. Your sign-in signature is never sent anywhere; your balance is computed on your device from public pool data.",
      "The relayer checks its fee, simulates and broadcasts the finished proof, so it cannot change the recipient or the amount. The proving key (about 20 MB) downloads once and is checked against its SHA-256.",
      "No browser storage: wallet state, keys and notes live in memory and are gone when the tab closes.",
    ],
    primary: { href: "/docs#security", text: "Read the security model" }, docs: "/docs#api",
    vis: (
      <div className="cl-mock">
        <div className="cl-mock-h">Proving<span>groth16 · on this device</span></div>
        <div className="cl-row"><span>Keys and notes</span><span className="cl-pill ok">this device</span></div>
        <div className="cl-row"><span>Proof</span><span className="cl-pill ok">this device</span></div>
        <div className="cl-row"><span>Relayer receives</span><span className="cl-pill pend">proof only</span></div>
      </div>
    ),
  },
  {
    slug: "mcp-servers", date: "Nov 3, 2026", kind: "New feature", areas: ["cli", "docs"],
    pill: "Blackpool as MCP tools for your agent",
    title: "MCP servers",
    lead: "Agent apps can use Blackpool as tools over the Model Context Protocol, no shell required.",
    bullets: [
      "Local server in the CLI (npx -y @blackpool/cli@latest mcp): balance, deposit, send, swap, bridge, bridges, assets and recover, with the wallet key kept on your machine and an allow-list per tool.",
      "Hosted read-only server at mcp.blackpool.cash/mcp: status, fees and minimums, bridge assets and quotes, analytics and the agent guide.",
    ],
    primary: { href: "/agents#9-mcp-servers", text: "Set it up" }, docs: "/AGENTS.md",
    vis: (
      <div className="cl-mock">
        <div className="cl-mock-h">MCP<span>stdio · streamable HTTP</span></div>
        <div className="cl-row"><span className="mono">blackpool_balance</span><span className="cl-pill ok">read-only</span></div>
        <div className="cl-row"><span className="mono">blackpool_send</span><span className="cl-pill pend">destructive</span></div>
        <div className="cl-row"><span className="mono">blackpool_bridge_quote</span><span className="cl-pill ok">hosted</span></div>
      </div>
    ),
  },
  {
    slug: "built-for-agents", date: "Nov 3, 2026", kind: "New feature", areas: ["cli", "docs"],
    pill: "AGENTS.md: private payments for AI agents",
    title: "Built for agents",
    lead: "CLI 0.2.0 speaks JSON, and AGENTS.md tells an agent everything it needs in one file.",
    bullets: [
      "--json prints one object on stdout with stable fields per command; progress goes to stderr; exit codes 0, 1 and 2.",
      "New: blackpool address, bridge --no-wait, BLACKPOOL_HOME, automatic waits on rate limits. AGENTS.md lives at blackpool.cash/AGENTS.md and ships inside the npm package.",
    ],
    primary: { href: "/docs#agents", text: "Read the agent guide" }, docs: "/AGENTS.md",
    vis: (
      <div className="cl-mock">
        <div className="cl-mock-h">Agent<span>@blackpool/cli 0.2.0 · --json</span></div>
        <div className="cl-code"><span className="c">$</span> blackpool send 0x9f3c…41e7 10 --pool usdc --json</div>
        <div className="cl-code">{'{"ok":true,"command":"send","received":"8.965","symbol":"USDC"}'}</div>
        <div className="cl-status ok">exit 0 · relayer paid the gas</div>
      </div>
    ),
  },
  {
    slug: "sign-in-message-v2", date: "Nov 3, 2026", kind: "Improvement", areas: ["shield"],
    title: "A sign-in message that says what it does",
    lead: "The message you sign now states that your private account keys are derived from it, and where it is safe to sign.",
    bullets: [
      "It cannot move funds from your wallet or approve spending, and you should only sign it on blackpool.cash or the Blackpool CLI.",
      "Accounts are derived from the message, so this is a new account space; it shipped before any public deposits.",
    ],
    primary: { href: "/app", text: "Launch app" }, docs: "/docs#concepts",
    vis: (
      <div className="cl-mock">
        <div className="cl-mock-h">Signature request<span>blackpool.cash</span></div>
        <div className="cl-row"><span>Gas free: no transaction is sent</span></div>
        <div className="cl-row"><span>Your private account keys are derived from this signature</span></div>
        <div className="cl-row"><span>Only sign it on blackpool.cash or the Blackpool CLI</span></div>
      </div>
    ),
  },
  {
    slug: "status-privacy-terms", date: "Nov 3, 2026", kind: "New feature", areas: ["docs"],
    pill: "Live status for every chain and service",
    title: "Status, privacy and terms",
    lead: "A live status page, and plain answers to what Blackpool processes and stores.",
    bullets: [
      "Status checks the relayer API, the indexer, relayer gas and every chain's RPC from your browser each time it loads.",
      "Privacy lists exactly what the API receives, the three things it stores and what is public on-chain. The docs now describe server-assisted proving, admin key and audit status as they are.",
    ],
    primary: { href: "/status", text: "Open status" }, docs: "/privacy",
    vis: (
      <div className="cl-mock">
        <div className="cl-mock-h">Status<span>checked from your browser</span></div>
        <div className="cl-row"><span>Relayer API</span><span className="cl-pill ok">operational</span></div>
        <div className="cl-row"><span>Indexer</span><span className="cl-pill ok">operational</span></div>
        <div className="cl-row"><span>Robinhood Chain · relayer gas</span><span className="cl-pill ok">funded</span></div>
        <div className="cl-row"><span>BNB Chain · RPC</span><span className="cl-pill ok">operational</span></div>
      </div>
    ),
  },
  {
    slug: "analytics-by-day", date: "Nov 3, 2026", kind: "Improvement", areas: ["analytics"],
    pill: "Public analytics, now dated per day",
    title: "Analytics by day",
    lead: "Every shielded note is now dated by its block, so activity shows per day while the pools are young.",
    bullets: [
      "The activity chart switches from days to months on its own once there is more than six weeks of history.",
      "Pools show their latest indexed block, and relayer fees are shown in USD next to the exact per-token amounts.",
    ],
    primary: { href: "/analytics", text: "Open analytics" },
    vis: (
      <div className="cl-mock wide">
        <div className="cl-tiles">
          <div><span>Shielded notes</span><b>14</b></div>
          <div><span>Relayer fees</span><b>$1.27</b></div>
          <div><span>Chains</span><b>4</b></div>
        </div>
        <div className="cl-mock-f">First day of live data on Robinhood Chain</div>
      </div>
    ),
  },
  {
    slug: "wallet-network", date: "Nov 3, 2026", kind: "Improvement", areas: ["shield"],
    title: "Follows your wallet's network",
    lead: "The app no longer shows one chain while your wallet sits on another.",
    bullets: [
      "On connect, a wallet on an unsupported network is asked to switch to Robinhood Chain; every deposit checks the network again before you sign.",
      "If you decline, the network switcher says so and a banner offers a one-click switch. Deposits on Robinhood Chain confirm in seconds.",
    ],
    primary: { href: "/app", text: "Open in app" }, docs: "/docs#shield",
    vis: (
      <div className="cl-mock">
        <div className="cl-mock-h">Shield<span>wallet on Ethereum mainnet</span></div>
        <div className="cl-row"><span>Your wallet is on an unsupported network</span><span className="cl-pill pend">switch</span></div>
        <div className="cl-row"><span><i className="cl-chk">✓</i>Switched to Robinhood Chain</span></div>
        <div className="cl-status ok">Deposit confirmed · 0.001 ETH shielded</div>
      </div>
    ),
  },
  {
    slug: "relayer-reliability", date: "Nov 3, 2026", kind: "Improvement", areas: ["send", "swap", "bridge"],
    title: "Steadier relayer",
    lead: "Long flows no longer stop half-way because of our own limits.",
    bullets: [
      "Rate limits count what an operation costs, not its HTTP method; the app waits and retries when it is told to slow down.",
      "Relayer broadcasts queue per chain, so simultaneous sends never collide on a nonce, and bridge minimums read in tokens, not raw units.",
    ],
    primary: { href: "/app", text: "Open in app" }, docs: "/docs#api",
    vis: (
      <div className="cl-mock">
        <div className="cl-mock-h">Private bridge<span>Robinhood Chain → Base</span></div>
        <div className="cl-row"><span><i className="cl-chk">✓</i>Generate proof</span></div>
        <div className="cl-row"><span><i className="cl-chk">✓</i>Bridge via NEAR Intents</span><span className="mono">retried after 4 s</span></div>
        <div className="cl-row"><span className="cur">Delivering to recipient</span><span className="cl-pill run">running</span></div>
      </div>
    ),
  },
  {
    slug: "cli-on-npm", date: "Nov 3, 2026", kind: "New feature", areas: ["cli"],
    pill: "@blackpool/cli is live on npm",
    title: "The CLI is on npm",
    lead: "@blackpool/cli gives scripts and agents the same private payments as the app.",
    bullets: [
      "Install with npm i -g @blackpool/cli, or run it once with npx @blackpool/cli help.",
      "Balance, shield, send, swap, bridge and recover on all four chains; --chain all sweeps every chain in one go.",
    ],
    primary: { href: "https://www.npmjs.com/package/@blackpool/cli", text: "View on npm" }, docs: "/docs#cli",
    vis: (
      <div className="cl-mock">
        <div className="cl-mock-h">Terminal<span>@blackpool/cli 0.1.0</span></div>
        <div className="cl-code"><span className="c">$</span> npm i -g @blackpool/cli</div>
        <div className="cl-code"><span className="c">$</span> blackpool balance --chain robinhood</div>
        <div className="cl-code"><span className="c">$</span> blackpool recover --chain all</div>
      </div>
    ),
  },
  {
    slug: "recover-redesign", date: "Nov 3, 2026", kind: "Improvement", areas: ["recovery"],
    pill: "Recover any stuck swap from one signature",
    title: "A new Recover page",
    lead: "One signature, four chains, every burner you ever registered.",
    bullets: [
      "Recover reads the encrypted burner registry page by page, so there is no cap on how many burners an account can have.",
      "The legacy fixed-slot scan is gone: fewer RPC calls, faster results.",
    ],
    primary: { href: "/recover", text: "Open recovery" }, docs: "/docs#recovery",
    vis: (
      <div className="cl-mock">
        <div className="cl-mock-h">Recover funds<span>Robinhood Chain · Base · Arbitrum · BNB Chain</span></div>
        <div className="cl-kv"><span>Signature</span><b>1 · stays in this browser</b></div>
        <div className="cl-kv"><span>Burner registry</span><b>decrypted locally</b></div>
        <div className="cl-status ok">2 burners swept back to your wallet</div>
      </div>
    ),
  },
  {
    slug: "four-chains-live", date: "Nov 2, 2026", kind: "New feature", areas: ["shield", "send"],
    pill: "Live on Robinhood Chain, Base, Arbitrum and BNB Chain",
    title: "Live on four chains",
    lead: "Nine pools on Robinhood Chain, Base, Arbitrum and BNB Chain, every contract source-verified.",
    bullets: [
      "ETH and USDG on Robinhood Chain, ETH and USDC on Base and Arbitrum, BNB, USDC and USDT on BNB Chain.",
      "All implementations are verified on Sourcify; the full address book is in the docs.",
    ],
    primary: { href: "/app", text: "Launch app" }, docs: "/docs#contracts",
    vis: (
      <div className="cl-mock">
        <div className="cl-mock-h">Pools<span>9 live</span></div>
        <div className="cl-row"><span>Robinhood Chain</span><span className="mono">ETH · USDG</span></div>
        <div className="cl-row"><span>Base</span><span className="mono">ETH · USDC</span></div>
        <div className="cl-row"><span>Arbitrum</span><span className="mono">ETH · USDC</span></div>
        <div className="cl-row"><span>BNB Chain</span><span className="mono">BNB · USDC · USDT</span></div>
      </div>
    ),
  },
  {
    slug: "one-signature", date: "Nov 2, 2026", kind: "Improvement", areas: ["recovery", "shield"],
    title: "One signature",
    lead: "Signing in now takes a single wallet prompt, in the app, on Recover and in the CLI.",
    bullets: [
      "The registry signature is derived from your sign-in signature instead of asking the wallet a second time.",
      "The sign-in message says what it does: no transaction, your private keys come from it, it cannot touch your wallet, and where to sign it.",
    ],
    primary: { href: "/app", text: "Launch app" }, docs: "/docs#concepts",
    vis: (
      <div className="cl-mock">
        <div className="cl-mock-h">Sign in<span>1 of 1</span></div>
        <div className="cl-row"><span>Welcome to Blackpool</span><span className="cl-pill ok">signed</span></div>
        <div className="cl-row"><span>Registry access</span><span className="mono">derived, no prompt</span></div>
      </div>
    ),
  },
  {
    slug: "private-bridge-routes", date: "Nov 2, 2026", kind: "New feature", areas: ["bridge"],
    pill: "Private bridging to Solana via NEAR Intents",
    title: "Private bridge routes",
    lead: "Bridge a shielded note to Solana, Ethereum, Base, Arbitrum or Robinhood Chain through NEAR Intents.",
    bullets: [
      "The proof pays a one-time burner; the burner funds a one-off 1Click deposit address, so the origin chain never carries the recipient.",
      "Every intent is written to your encrypted registry, so a bridge that stalls mid-way is recoverable from any device.",
    ],
    primary: { href: "/app", text: "Open in app" }, docs: "/docs#bridge",
    vis: (
      <div className="cl-mock">
        <div className="cl-mock-h">Bridge privately<span>From Robinhood Chain · private ETH</span></div>
        <div className="cl-route">
          <span className="cl-chip"><img src="/token_logos/robinhood.png?v=2" alt="" />Robinhood</span><i className="cl-line" />
          <span className="cl-chip">NEAR Intents</span><i className="cl-line" />
          <span className="cl-chip dst"><img src="/token_logos/solana.png" alt="" />Solana</span>
        </div>
        <div className="cl-kv"><span>Recipient</span><b className="mono">7Gx4…kQ2m</b></div>
        <div className="cl-kv"><span>You receive</span><b>≈ 2,259 USDC</b></div>
        <div className="cl-status ok">Delivered on Solana · no trail</div>
      </div>
    ),
  },
  {
    slug: "public-analytics", date: "Nov 2, 2026", kind: "New feature", areas: ["analytics"],
    title: "Public analytics",
    lead: "Protocol numbers derived only from data that is already on-chain.",
    bullets: [
      "Shielded notes, pools, chains and relayer fees, refreshed every minute from the indexer.",
      "No TVL in USD, by design: deposit amounts are encrypted on-chain, so a pool-wide total cannot be verified and is not shown.",
    ],
    primary: { href: "/analytics", text: "Open analytics" }, docs: "/docs#api",
    vis: (
      <div className="cl-mock wide">
        <div className="cl-tiles">
          <div><span>Shielded notes</span><b>12,480</b></div>
          <div><span>Pools</span><b>7</b></div>
          <div><span>Chains</span><b>4</b></div>
        </div>
        <div className="cl-bars">
          <div><span>Base</span><i style={{ width: "100%", background: "#4C7FE3" }} /><b>6,214</b></div>
          <div><span>Robinhood Chain</span><i style={{ width: "58%", background: "#27A563" }} /><b>3,590</b></div>
          <div><span>Arbitrum</span><i style={{ width: "31%", background: "#7B68E0" }} /><b>1,902</b></div>
          <div><span>BNB Chain</span><i style={{ width: "12%", background: "#C2842A" }} /><b>774</b></div>
        </div>
        <div className="cl-mock-f">Illustrative numbers · live data populates from the first shielded note</div>
      </div>
    ),
  },
  {
    slug: "documentation", date: "Nov 2, 2026", kind: "New feature", areas: ["docs"],
    title: "Documentation",
    lead: "Thirteen anchored sections, from core concepts to the security model.",
    bullets: [
      "Shield, Private send, Swap, Private bridge and Recovery each get a walk-through plus the exact relayer endpoints behind them.",
      "Fees, chains & assets and the CLI reference live on the same page, so every section is linkable.",
    ],
    primary: { href: "/docs", text: "Read the docs" },
    vis: (
      <div className="cl-mock">
        <div className="cl-mock-h">Docs<span>blackpool.cash/docs</span></div>
        <div className="cl-chips">
          {["Overview", "Core concepts", "Shield", "Private send", "Swap", "Private bridge", "Recovery", "Chains & assets", "Fees", "CLI", "API", "Security model", "FAQ"].map((s, i) => (
            <span className={"cl-chip" + (i === 5 ? " on" : "")} key={s}>{s}</span>
          ))}
        </div>
        <div className="cl-code"><span className="c">$</span> blackpool bridge --chain robinhood --to solana --amount 1 ETH</div>
      </div>
    ),
  },
  {
    slug: "deterministic-recovery", date: "Nov 1, 2026", kind: "New feature", areas: ["recovery", "bridge"],
    title: "Recovery from any device",
    lead: "Every burner and bridge is recoverable from your signature alone, on any device.",
    bullets: [
      "Every burner is registered, encrypted in your browser, before it is funded; the registry lists every burner and intent you ever created.",
      "Sweep a stuck burner or check an intent's status from any device. The registry only ever stores ciphertext.",
    ],
    primary: { href: "/recover", text: "Open recovery" }, docs: "/docs#recovery",
    vis: (
      <div className="cl-mock">
        <div className="cl-mock-h">Recovery<span>unlocked by one signature</span></div>
        <div className="cl-row"><span className="mono">burner 0x4a1e…c0d2</span><span className="cl-pill ok">swept</span></div>
        <div className="cl-row"><span className="mono">burner 0x77b0…9e1f</span><span className="cl-pill pend">empty</span></div>
        <div className="cl-row"><span className="mono">bridge → Solana · 1Click</span><span className="cl-pill ok">delivered</span></div>
        <div className="cl-row"><span className="mono cur">bridge → Base · 1Click</span><span className="cl-pill run">pending</span></div>
      </div>
    ),
  },
  {
    slug: "swap-inside-the-pool", date: "Nov 1, 2026", kind: "New feature", areas: ["swap"],
    title: "Swap inside the pool",
    lead: "Trade ETH ⇄ USDC through Uniswap V3 and settle back into the pool privately.",
    bullets: [
      "A one-time burner executes the trade, then the output is re-shielded as a fresh note.",
      "Nothing on-chain links the trade to your deposit.",
    ],
    primary: { href: "/app", text: "Open in app" }, docs: "/docs#swap",
    vis: (
      <div className="cl-mock">
        <div className="cl-mock-h">Swap<span>Uniswap V3 · one-time burner · re-shielded</span></div>
        <div className="cl-swap">
          <span className="cl-tok"><img src="/token_logos/eth.png" alt="" />0.5 ETH</span>
          <span className="cl-arrow">⇄</span>
          <span className="cl-tok"><img src="/token_logos/usdc.png" alt="" />1,134 USDC</span>
        </div>
        <div className="cl-status ok">Re-shielded · private balance updated</div>
      </div>
    ),
  },
  {
    slug: "introducing-blackpool", date: "Nov 1, 2026", kind: "New feature", areas: ["shield", "send"],
    title: "Introducing Blackpool",
    lead: "Private payments that leave no trail: per-token anonymity pools on Base, Robinhood Chain, Arbitrum and BNB Chain.",
    bullets: [
      "No fixed denominations, no mixer queues, no waiting periods. Any amount, whenever you want it back.",
      "The relayer builds the proof and pays the gas, so your wallet never touches the spend.",
    ],
    primary: { href: "/app", text: "Launch app" }, docs: "/docs#overview",
    vis: (
      <div className="cl-mock">
        <div className="cl-mock-h">Private balance<span>1.284 ETH on Base</span></div>
        <div className="cl-row"><span><i className="cl-chk">✓</i>Note encrypted to your account</span><span className="mono">Shield</span></div>
        <div className="cl-row"><span><i className="cl-chk">✓</i>Commitment added to the Merkle tree</span></div>
        <div className="cl-row"><span><i className="cl-chk">✓</i>Sent to 0x9f3c…41e7 · relayer paid gas</span><span className="mono">Send</span></div>
        <div className="cl-progress"><i /></div>
      </div>
    ),
  },
];

// Rotating highlights for the landing pill: every entry that has pill text, newest first.
export const HIGHLIGHTS = ENTRIES.filter((e) => e.pill).slice(0, 7).map((e) => ({ slug: e.slug, text: e.pill as string, href: e.primary.href }));
