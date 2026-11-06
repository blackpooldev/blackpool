import Link from "next/link";
import SubPage from "../../components/SubPage";
import JsonLd, { article, breadcrumbs, faqPage } from "../../components/JsonLd";
import { pageMeta } from "../../components/seo";

const PATH = "/guides/send-crypto-privately";
const TITLE = "How to send crypto without exposing your wallet";
const DESC = "Why every on-chain payment shows your wallet, which ways around it actually work, and how to send ETH, USDC, USDT or BNB privately with a zero-knowledge privacy pool.";

export const metadata = pageMeta(PATH, `${TITLE} — Blackpool`, DESC, "article");

const FAQ = [
  { q: "Is a new wallet enough to stay private?", a: "Usually not. A new wallet has to be funded from somewhere, and that funding transaction links it straight back to the wallet that paid for it." },
  { q: "Can anyone tell which deposit paid a recipient?", a: "Not from the proof. Observers see deposits going into the pool and payments coming out of it, but the proof does not say which deposit funded which payment. Timing and unusual amounts can still give hints, which is why the tips below matter." },
  { q: "Does the recipient need Blackpool?", a: "No. The recipient receives an ordinary transfer to their address. They do not need an account, an app or any setup." },
  { q: "Is it legal to send crypto privately?", a: "Financial privacy is legal in most places, the same way a bank does not publish your transfers. Rules differ by country and you remain responsible for complying with yours. Blackpool's terms do not allow using it to move proceeds of crime." },
];

export default function SendPrivately() {
  return (
    <SubPage sub="Guides" title={TITLE} lead={DESC} updated="November 6, 2026">
      <JsonLd data={[article(PATH, TITLE, DESC, "2026-11-06"), breadcrumbs([["Home", "/"], [TITLE, PATH]]), faqPage(FAQ)]} />

      <section>
        <h2>Why a normal transfer exposes you</h2>
        <p>Public blockchains record every transfer with its sender, recipient and amount, forever. When you pay someone from your wallet, they can open a block explorer and see your balance, every payment you ever made and everyone who paid you. So can anyone they share the address with. For salaries, supplier payments, donations or simply paying a friend, that is far more than the other side needs to know.</p>
      </section>

      <section>
        <h2>What people try, and where it breaks</h2>
        <ul>
          <li><b>A fresh wallet.</b> It has to be funded, and the funding transaction links it back to you.</li>
          <li><b>Going through an exchange.</b> It breaks the on-chain link, but the exchange holds your funds and knows both sides of the payment.</li>
          <li><b>Fixed-size mixers.</b> They only work with set amounts and long waits, and the money is out of your hands in the meantime.</li>
          <li><b>A privacy pool.</b> You keep custody, can send any amount, and the link between your deposit and your payments is hidden by a zero-knowledge proof. This is the approach Blackpool uses.</li>
        </ul>
      </section>

      <section>
        <h2>How a privacy pool works</h2>
        <ul>
          <li><b>Shield:</b> you deposit into the pool from your wallet. This transaction is public; it is the last time your address shows up.</li>
          <li><b>Prove:</b> to spend, your device builds a zero-knowledge proof that you own funds in the pool, without revealing which deposit is yours.</li>
          <li><b>Relay:</b> a relayer submits the proof and pays the gas. The recipient and amount are fixed inside the proof, so the relayer cannot change them.</li>
          <li><b>Receive:</b> the recipient gets a normal transfer from the pool, with nothing on-chain pointing back to your wallet.</li>
        </ul>
        <p>Details are in the <Link href="/docs">docs</Link> and the <Link href="/docs#security">security model</Link>.</p>
      </section>

      <section>
        <h2>Step by step with Blackpool</h2>
        <ul>
          <li>Open <Link href="/app">blackpool.cash/app</Link> and connect your wallet (MetaMask, Rabby, Coinbase Wallet or a mobile wallet browser).</li>
          <li>Pick a chain: <Link href="/private-payments/robinhood-chain">Robinhood Chain</Link>, <Link href="/private-payments/base">Base</Link>, <Link href="/private-payments/arbitrum">Arbitrum</Link> or <Link href="/private-payments/bnb-chain">BNB Chain</Link>.</li>
          <li>Sign once. This creates your private account; nothing is stored in your browser.</li>
          <li>Shield the amount you want to use. You pay network gas for this one step.</li>
          <li>Choose Send privately, enter the recipient and the amount, and confirm. The relayer pays the gas and the fee comes out of the amount.</li>
        </ul>
      </section>

      <section>
        <h2>Tips that keep it private</h2>
        <ul>
          <li><b>Do not send the exact amount you just shielded</b>, right after shielding it. Matching amounts and timing are the easiest way to link the two.</li>
          <li><b>Wait a while</b> between shielding and sending, and shield round amounts that you spend in different pieces.</li>
          <li><b>Do not send back to your own public wallet</b> if the goal is to keep that wallet separate.</li>
          <li><b>Bridge privately</b> if the payment belongs on another chain, instead of bridging from your public wallet first.</li>
        </ul>
      </section>

      <section>
        <h2>Questions</h2>
        {FAQ.map((f) => (<div key={f.q}><h3>{f.q}</h3><p>{f.a}</p></div>))}
      </section>

      <div className="sp-note"><p>The pool contracts have not had an external audit yet. Start with amounts you are comfortable with.</p></div>
    </SubPage>
  );
}
