import Link from "next/link";
import SubPage from "../components/SubPage";
import JsonLd, { breadcrumbs } from "../components/JsonLd";
import CopyAddress from "../components/CopyAddress";
import { pageMeta } from "../components/seo";
import { TOKEN, tokenExplorerUrl, tokenChartUrl } from "../components/token";
import "./token.css";

const TITLE = `$${TOKEN.ticker} on ${TOKEN.chain}`;
const DESC = `The official Blackpool token on ${TOKEN.chain}, launched on the ${TOKEN.launchpad} launchpad. Its one contract address is on this page and at the top of blackpool.cash.`;

export const metadata = pageMeta("/token", `${TITLE} — Blackpool`, DESC);

export default function TokenPage() {
  const a = TOKEN.address;
  return (
    <SubPage sub="Token" title={TITLE} lead={DESC} updated={TOKEN.launchDate || undefined}>
      <JsonLd data={breadcrumbs([["Home", "/"], ["Token", "/token"]])} />

      <section>
        <h2>Contract address</h2>
        <CopyAddress address={a} />
        <div className="tk-actions">
          <a className="tk-btn pri" href={TOKEN.buyUrl} target="_blank" rel="noopener noreferrer">Buy on {TOKEN.launchpad}</a>
          <a className="tk-btn" href={tokenExplorerUrl(a)} target="_blank" rel="noopener noreferrer">View on explorer</a>
          <a className="tk-btn" href={tokenChartUrl(a)} target="_blank" rel="noopener noreferrer">Chart</a>
        </div>
        <table className="st-table">
          <tbody>
            <tr><td>Token</td><td>{TOKEN.name} (${TOKEN.ticker})</td></tr>
            <tr><td>Chain</td><td>{TOKEN.chain} · chain ID {TOKEN.chainId}</td></tr>
            <tr><td>Decimals</td><td>{TOKEN.decimals}</td></tr>
            <tr><td>Launchpad</td><td><a href={TOKEN.buyUrl} target="_blank" rel="noopener noreferrer">{TOKEN.launchpad}</a></td></tr>
            {TOKEN.launchDate && <tr><td>Launched</td><td>{TOKEN.launchDate}</td></tr>}
            <tr><td>Utility</td><td>Soon</td></tr>
          </tbody>
        </table>
      </section>

      <div className="sp-note"><p>Blackpool has one token contract: the address on this page, also shown at the top of blackpool.cash. Treat any other contract, airdrop or &ldquo;claim&rdquo; link as a scam, and never share your wallet&apos;s recovery phrase with anyone.</p></div>

      <section>
        <h2>Official links</h2>
        <ul>
          <li>Website: <Link href="/token">blackpool.cash/token</Link></li>
          <li>X: <a href="https://x.com/intheblackpool" target="_blank" rel="noopener noreferrer">@intheblackpool</a></li>
          <li>Launchpad: <a href={TOKEN.buyUrl} target="_blank" rel="noopener noreferrer">{TOKEN.launchpad}</a></li>
          <li>Source code: <a href="https://github.com/blackpooldev/blackpool" target="_blank" rel="noopener noreferrer">github.com/blackpooldev/blackpool</a></li>
        </ul>
      </section>

      <section>
        <h2>Do I need the token to use Blackpool?</h2>
        <p>No. Shielding, private sends, swaps and bridges work the same without it, and every fee is paid in the asset you move. See <Link href="/private-payments">private payments on every chain</Link>.</p>
      </section>

      <section>
        <h2>Risk</h2>
        <p>Tokens are volatile and can lose all of their value. Nothing on this page is financial advice, and you are responsible for following the rules where you live.</p>
      </section>
    </SubPage>
  );
}
