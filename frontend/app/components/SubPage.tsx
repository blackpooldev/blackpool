import type { ReactNode } from "react";
import Link from "next/link";
import Mark from "./Mark";
import OfficialNotice from "./OfficialNotice";
import "../changelog/changelog.css";
import "./subpage.css";

/** Shell for secondary pages (privacy, terms, status): the changelog/landing language — ruled head, light display title. */
export default function SubPage({ sub, title, lead, updated, children }: { sub: string; title: string; lead: ReactNode; updated?: string; children: ReactNode }) {
  return (
    <main className="cl sp">
      <OfficialNotice />
      <header className="cl-nav">
        <div className="cl-nav-in">
          <Link href="/" className="cl-brand"><Mark size={24} />Blackpool<span className="cl-brand-sub">{sub}</span></Link>
          <nav className="cl-nav-links"><Link href="/">Home</Link><Link href="/docs">Docs</Link><Link href="/agents">Agents</Link><Link href="/analytics">Analytics</Link><Link href="/changelog">Changelog</Link></nav>
          <Link href="/app" className="cl-btn">Launch app</Link>
        </div>
      </header>
      <div className="cl-wrap">
        <div className="cl-head">
          <h1>{title}</h1>
          <p className="sp-lead">{lead}</p>
          {updated && <p className="sp-updated mono">Last updated {updated}</p>}
        </div>
        <div className="sp-body">{children}</div>
        <footer className="sp-foot">
          <span>© {new Date().getFullYear()} Blackpool</span>
          <nav><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/status">Status</Link><Link href="/docs#security">Security</Link><a href="https://x.com/intheblackpool" target="_blank" rel="noopener noreferrer">X</a><a href="mailto:hello@blackpool.cash">hello@blackpool.cash</a></nav>
        </footer>
      </div>
    </main>
  );
}
