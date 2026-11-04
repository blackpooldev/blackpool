import Link from "next/link";
import Mark from "../components/Mark";
import ChangelogClient from "./ChangelogClient";
import { AREAS, ENTRIES, label } from "./entries";
import "./changelog.css";

export const metadata = {
  title: "Changelog — Blackpool",
  description: "New features and improvements to Blackpool.",
};

export default function Changelog() {
  return (
    <main className="cl">
      <header className="cl-nav">
        <div className="cl-nav-in">
          <Link href="/" className="cl-brand"><Mark size={24} />Blackpool<span className="cl-brand-sub">Changelog</span></Link>
          <nav className="cl-nav-links"><Link href="/">Home</Link><Link href="/docs">Docs</Link><Link href="/agents">Agents</Link><Link href="/analytics">Analytics</Link><Link href="/recover">Recover</Link></nav>
          <Link href="/app" className="cl-btn">Launch app</Link>
        </div>
      </header>

      <div className="cl-wrap">
        <div className="cl-head">
          <h1>Changelog</h1>
          <p>New features and improvements to Blackpool.</p>
        </div>

        <ChangelogClient areas={AREAS} total={ENTRIES.length}>
          {ENTRIES.map((e) => (
            <article className="cl-entry" id={e.slug} key={e.slug} data-areas={e.areas.join(" ")} data-anim="">
              <div className="cl-date"><span className="mono">{e.date}</span><i className="cl-dot" /></div>
              <div className="cl-body">
                <div className="cl-tags"><span className="cl-tag kind"><i />{e.kind}</span>{e.areas.map((a) => <span className="cl-tag" key={a}>{label(a)}</span>)}</div>
                <h2><a href={`#${e.slug}`}>{e.title}</a></h2>
                <p className="cl-lead">{e.lead}</p>
                <div className="cl-vis">{e.vis}</div>
                <ul className="cl-bullets">{e.bullets.map((b) => <li key={b}>{b}</li>)}</ul>
                <div className="cl-links">
                  <Link href={e.primary.href} className="cl-read">{e.primary.text} <span>→</span></Link>
                  {e.docs && <a href={e.docs} className="cl-docs">Docs <span>↗</span></a>}
                </div>
              </div>
            </article>
          ))}
        </ChangelogClient>

        <section className="cl-cta">
          <h2>Move value privately.<br /><span>Start with one signature.</span></h2>
          <p>Connect a wallet, sign once, and your private account exists on every supported chain.</p>
          <Link href="/app" className="cl-btn lg">Launch app</Link>
        </section>
        <p className="cl-foot">© {new Date().getFullYear()} Blackpool. Dates reflect when each capability went live on blackpool.cash.</p>
      </div>
    </main>
  );
}
