import Link from "next/link";
import SubPage from "../components/SubPage";

export const metadata = {
  title: "Terms — Blackpool",
  description: "Terms of use for the Blackpool website, app, API and CLI.",
};

export default function Terms() {
  return (
    <SubPage
      sub="Terms"
      title="Terms of use"
      lead="These terms cover the Blackpool website, web app, relayer API and CLI. By using any of them you agree to these terms. If you do not agree, do not use them."
      updated="November 3, 2026"
    >
      <section>
        <h2>1. What Blackpool is</h2>
        <p>Blackpool is open-source software: zero-knowledge privacy pool contracts deployed on public blockchains, plus a website, app, relayer API and CLI that help you use them. Blackpool is not a bank, broker, exchange, money transmitter or custodian, and it does not hold your funds. Pool balances are notes that only your keys can spend.</p>
      </section>

      <section>
        <h2>2. Your responsibilities</h2>
        <ul>
          <li>You are responsible for your wallet, its keys and the signature that derives your private account. Anyone with that signature can spend your notes.</li>
          <li>You are responsible for checking every address, amount, chain and asset before you confirm. Blockchain transactions cannot be reversed.</li>
          <li>You must comply with the laws that apply to you, including sanctions, anti-money-laundering and tax rules.</li>
        </ul>
      </section>

      <section>
        <h2>3. Prohibited use</h2>
        <p>Do not use Blackpool with funds derived from crime, to evade sanctions, to finance terrorism, to defraud anyone, or if you are a sanctioned person or acting for one. Do not attack, overload or try to gain unauthorised access to the API or infrastructure. We may refuse to relay any transaction and block access to the hosted services at any time.</p>
      </section>

      <section>
        <h2>4. Fees</h2>
        <p>Private operations pay a relayer fee deducted inside the proof from the amount you move, as listed in the <Link href="/docs#fees">docs</Link>. Bridges also pay the solver's quoted rate, and every on-chain action pays network gas. Fees may change; the fee shown before you confirm is the one that applies.</p>
      </section>

      <section>
        <h2>5. Third-party services</h2>
        <p>Swaps run through third-party exchanges (Uniswap V3, PancakeSwap V3) and bridges through NEAR Intents solvers. Their availability, pricing and outcomes are outside our control. Failed bridges refund to the origin chain as described in the docs.</p>
      </section>

      <section>
        <h2>6. Risks</h2>
        <ul>
          <li>The contracts and circuits have not been externally audited. They may contain bugs that lead to loss of funds.</li>
          <li>Pools are upgradeable and pausable by an admin key during the launch period.</li>
          <li>The hosted API relays proofs your device builds. It never receives your signature or keys, but it can be unavailable, refuse or delay a relay (see the <Link href="/docs#security">security model</Link>).</li>
          <li>Privacy depends on how many other people use a pool and on your own behaviour. Unusual amounts or timing can be correlated.</li>
          <li>Blockchains, RPC providers and third-party services can fail, fork or change.</li>
        </ul>
        <p>Only use amounts you can afford to lose.</p>
      </section>

      <section>
        <h2>7. No warranty</h2>
        <p>The software and services are provided "as is" and "as available", without warranties of any kind, express or implied, including merchantability, fitness for a particular purpose and non-infringement. The code is licensed under the MIT License.</p>
      </section>

      <section>
        <h2>8. Limitation of liability</h2>
        <p>To the maximum extent permitted by law, Blackpool and its contributors are not liable for any indirect, incidental, special, consequential or punitive damages, or for any loss of funds, profits, data or goodwill, arising from your use of or inability to use the software or services.</p>
      </section>

      <section>
        <h2>9. Changes</h2>
        <p>We may update these terms. The date above shows the latest version; continuing to use Blackpool after a change means you accept it.</p>
      </section>

      <section>
        <h2>10. Contact</h2>
        <p><a href="mailto:hello@blackpool.cash">hello@blackpool.cash</a>. Privacy is covered separately on the <Link href="/privacy">privacy page</Link>.</p>
      </section>
    </SubPage>
  );
}
