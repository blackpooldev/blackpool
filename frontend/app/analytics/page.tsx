import Link from "next/link";
import { pageMeta } from "../components/seo";
import Mark from "../components/Mark";
import AnalyticsView from "./AnalyticsView";
import "./analytics.css";

export const metadata = pageMeta("/analytics", "Privacy pool analytics — Blackpool", "Public, on-chain protocol analytics for Blackpool privacy pools: shielded notes, growth per chain, pools and relayer fees.");

export default function Analytics() {
  return (
    <main className="an">
      <header className="an-nav">
        <div className="an-nav-in">
          <Link href="/" className="an-brand"><Mark size={24} />Blackpool<span className="an-brand-sub">Analytics</span></Link>
          <nav className="an-nav-links"><Link href="/">Home</Link><Link href="/docs">Docs</Link><Link href="/agents">Agents</Link><Link href="/recover">Recover</Link><Link href="/changelog">Changelog</Link></nav>
          <Link href="/app" className="an-btn">Launch app</Link>
        </div>
      </header>
      <AnalyticsView />
    </main>
  );
}
