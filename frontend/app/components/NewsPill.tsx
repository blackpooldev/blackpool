"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type Item = { slug: string; text: string; href: string };

/** Landing "New" pill: cycles through the latest changelog highlights. Pauses on hover/focus and when the tab is hidden. */
export default function NewsPill({ items, every = 4200 }: { items: Item[]; every?: number }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (items.length < 2 || paused) return;
    const t = setInterval(() => { if (!document.hidden) setI((n) => (n + 1) % items.length); }, every);
    return () => clearInterval(t);
  }, [items.length, paused, every]);
  if (!items.length) return null;
  const cur = items[i];
  return (
    <Link href={cur.href} className="lp-pill np" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)} aria-label={`New: ${cur.text}`}>
      <b>New</b>
      <span className="txt np-stack" aria-hidden="true">
        {items.map((it, n) => <span key={it.slug} className={n === i ? "on" : n === (i + items.length - 1) % items.length ? "out" : ""}>{it.text}</span>)}
      </span>
      <span className="go">Try it</span>
    </Link>
  );
}
