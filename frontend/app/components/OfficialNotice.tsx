import "./notice.css";

// Site-wide notice against impersonation. ops/token-prep.py flips TOKEN_LAUNCHED at launch.
const TOKEN_LAUNCHED = false;
export const X_URL = "https://x.com/intheblackpool";

export default function OfficialNotice() {
  return (
    <div className="bp-notice" role="note">
      <i aria-hidden="true" />
      <span>
        Our only X account is <a href={X_URL} target="_blank" rel="noopener noreferrer">@intheblackpool</a>.{" "}
        {TOKEN_LAUNCHED
          ? <>The only Blackpool token contract is the one on <a href="/token">blackpool.cash/token</a>.</>
          : <>Blackpool has not launched a token: any token using the name is not ours.</>}
      </span>
    </div>
  );
}
