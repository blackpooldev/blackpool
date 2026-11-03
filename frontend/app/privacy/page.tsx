import Link from "next/link";
import SubPage from "../components/SubPage";

export const metadata = {
  title: "Privacy — Blackpool",
  description: "What Blackpool processes, what it stores, and what is public on-chain.",
};

export default function Privacy() {
  return (
    <SubPage
      sub="Privacy"
      title="Privacy"
      lead="Blackpool has no accounts and no trackers. This page lists exactly what the website and the relayer API process, what they keep, and what is public on-chain no matter who runs the software."
      updated="November 3, 2026"
    >
      <section>
        <h2>The short version</h2>
        <ul>
          <li>No sign-up, no names, no email addresses (unless you write to us), no cookies, no analytics scripts, no browser storage for your account.</li>
          <li>To build proofs and read your private balance, the API receives your sign-in signature with each request. It uses it in memory for that request and does not store or log it.</li>
          <li>We keep three small databases: an encrypted burner registry, a bridge record per private bridge, and a ledger of fees. None of them contains your wallet address.</li>
          <li>Deposits and withdrawals are public blockchain transactions. Blackpool hides the link between them, not the transactions themselves.</li>
        </ul>
      </section>

      <section>
        <h2>The website</h2>
        <p>blackpool.cash is a static site served through Cloudflare. It sets no cookies, loads no analytics or advertising scripts and keeps no account data in browser storage: your sign-in signature lives in memory and is gone when you close the tab. Your browser talks directly to public RPC endpoints of each chain (Robinhood Chain, Base, Arbitrum, BNB Chain) to read balances and confirm transactions; those providers see your IP address and the public addresses being queried.</p>
      </section>

      <section>
        <h2>The relayer API</h2>
        <p>The app and the CLI call <code>api.blackpool.cash</code> for every private operation. Depending on the operation it receives:</p>
        <ul>
          <li><b>Your sign-in signature.</b> Your private account keys are derived from it. The API derives them in memory to decrypt your notes, compute your balance and build the zero-knowledge proof for a send, swap or bridge. The signature and the keys are not written to disk or logs. Because the API sees them while it works, using the hosted API means trusting it with them for the duration of a request; see the <Link href="/docs#security">security model</Link>.</li>
          <li><b>What you ask it to do.</b> Amounts, assets, chains and recipient addresses for the operation.</li>
          <li><b>Your wallet address</b> when you prepare a deposit, because the deposit transaction is sent from it.</li>
          <li><b>Network metadata.</b> Your IP address is used for rate limiting in memory (a one-minute window). Our hosting providers (Cloudflare and Railway) keep standard request logs — time, path, status, IP address — for a limited period under their own policies.</li>
        </ul>
      </section>

      <section>
        <h2>What we store</h2>
        <h3>Burner registry</h3>
        <p>Swaps and bridges use one-time burner wallets. Each burner's private key is encrypted in your browser before it is sent and stored as ciphertext together with the burner address, chain, token and timestamps. Rows are filed under a pseudonymous identifier derived from your signature, not under your wallet address. This is what lets <Link href="/recover">Recover</Link> find a stalled burner from any device.</p>
        <h3>Bridge records</h3>
        <p>For each private bridge we keep the solver deposit address, origin chain, assets, amounts, destination recipient, refund address, transaction hashes and status, filed under the same pseudonymous identifier. It powers bridge status and refunds in the app.</p>
        <h3>Fee ledger</h3>
        <p>For every relayed transaction that charged a fee: chain, pool, fee amount and transaction hash. It feeds the public <Link href="/analytics">analytics</Link>. It contains no user identifier.</p>
      </section>

      <section>
        <h2>What is public on-chain</h2>
        <p>Anyone can see that your wallet deposited a given amount into a pool, that a withdrawal of a given amount left a pool to a given address, and the fee paid. Encrypted notes and commitments are public but unreadable without your keys. Blockchain data cannot be deleted by anyone.</p>
      </section>

      <section>
        <h2>Third parties</h2>
        <ul>
          <li><b>NEAR Intents (1Click)</b> receives the quote request, deposit address and destination recipient for private bridges.</li>
          <li><b>Public RPC providers</b> of each chain, called by your browser and by the API.</li>
          <li><b>CoinGecko</b> for ETH and BNB prices, called by the API without any user data.</li>
          <li><b>Cloudflare</b> (DNS, CDN, email forwarding) and <b>Railway</b> (API hosting).</li>
        </ul>
        <p>We do not sell or share data with anyone else.</p>
      </section>

      <section>
        <h2>Your choices</h2>
        <p>You can use the open-source contracts and circuits without the hosted API. Registry and bridge rows can only be tied to you through your signature-derived identifier; if you want yours deleted, email us and we will walk you through identifying them and remove them. Deleting burner rows makes those burners unrecoverable through Recover.</p>
      </section>

      <section>
        <h2>Changes and contact</h2>
        <p>We will update this page when what we process changes, and note the date above. Questions: <a href="mailto:hello@blackpool.cash">hello@blackpool.cash</a>.</p>
      </section>
    </SubPage>
  );
}
