import Link from "next/link";
import NoticeCA from "./NoticeCA";
import { TOKEN } from "./token";
import "./notice.css";

// Site-wide notice against impersonation: the one token contract and the one X account.
export const X_URL = "https://x.com/intheblackpool";

export default function OfficialNotice() {
  return (
    <div className="bp-notice bp-notice-live" role="note">
      <div className="bp-notice-body">
        <span className="bp-notice-ca">
          <i aria-hidden="true" />
          <span><Link href="/token">${TOKEN.ticker}</Link> contract<span className="bp-notice-chain"> on {TOKEN.chain}</span></span>
          <NoticeCA address={TOKEN.address} />
        </span>
        <span>Our only X account is <a href={X_URL} target="_blank" rel="noopener noreferrer">@intheblackpool</a>.</span>
      </div>
    </div>
  );
}
