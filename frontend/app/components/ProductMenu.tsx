"use client";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import Icon from "./Icon";
import { PRODUCT_GROUPS } from "./products";

// Landing nav "Product" dropdown: everything Blackpool offers, in two groups (components/products.ts). Click to open;
// Escape, a click outside or picking an item closes it. The mobile drawer shows the same list inline.

export default function ProductMenu() {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); btn.current?.focus(); } };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <div className="lp-dd" ref={wrap} data-open={open ? "" : undefined}>
      <button ref={btn} type="button" className="lp-dd-btn" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        Product
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.75l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <div className="lp-dd-panel" id={id} role="menu" hidden={!open}>
        <div className="lp-dd-cols">
          {PRODUCT_GROUPS.map((g) => (
            <div className="lp-dd-col" key={g.title}>
              <div className="lp-dd-h">{g.title}</div>
              {g.items.map((it) => (
                <Link href={it.h} className="lp-dd-it" role="menuitem" key={it.t} onClick={() => setOpen(false)}>
                  <Icon k={it.k} c={it.c} size={17} />
                  <span><b>{it.t}</b><small>{it.d}</small></span>
                </Link>
              ))}
            </div>
          ))}
        </div>
        <div className="lp-dd-foot">
          <a href="#product" onClick={() => setOpen(false)}>See it in action</a>
          <Link href="/app" className="lp-dd-go" onClick={() => setOpen(false)}>Launch app <span aria-hidden="true">→</span></Link>
        </div>
      </div>
    </div>
  );
}
