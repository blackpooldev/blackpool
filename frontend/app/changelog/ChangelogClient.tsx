"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** Changelog list: filter chips (?area=…), pages of PER_PAGE entries (?page=N), and reveal-on-scroll.
 *  Every entry is in the static HTML; this only decides which ones show. No storage: state lives in the URL. */
export const PER_PAGE = 5;

function matching(list: HTMLElement | null, area: string): HTMLElement[] {
  if (!list) return [];
  return Array.from(list.querySelectorAll<HTMLElement>(".cl-entry"))
    .filter((el) => area === "all" || (el.dataset.areas || "").split(" ").includes(area));
}

// 1 … 4 5 6 … 12 (always first, last, and the current page's neighbours)
function pageItems(page: number, pages: number): Array<number | "gap"> {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const keep = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
  const out: Array<number | "gap"> = [];
  let last = 0;
  for (const n of Array.from(keep).sort((a, b) => a - b)) { if (n - last > 1) out.push("gap"); out.push(n); last = n; }
  return out;
}

export default function ChangelogClient({ areas, total, children }: {
  areas: Array<{ key: string; label: string }>; total: number; children: ReactNode;
}) {
  const [area, setArea] = useState("all");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(Math.max(1, Math.ceil(total / PER_PAGE)));
  const [ready, setReady] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const jumpTo = useRef<string | null>(null) // entry id from the URL hash, scrolled to once its page shows
  const userMove = useRef(false)

  // initial state from the URL: ?area, ?page, and #entry (opens the page that holds it)
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    let a = sp.get("area") || "all";
    if (a !== "all" && !areas.some((x) => x.key === a)) a = "all";
    let p = Math.max(1, parseInt(sp.get("page") || "1", 10) || 1);
    const hash = decodeURIComponent(window.location.hash.slice(1));
    if (hash && document.getElementById(hash)) {
      if (!matching(listRef.current, a).some((el) => el.id === hash)) a = "all";
      const i = matching(listRef.current, a).findIndex((el) => el.id === hash);
      if (i >= 0) { p = Math.floor(i / PER_PAGE) + 1; jumpTo.current = hash; }
    }
    setArea(a); setPage(p); setReady(true);
  }, [areas]);

  // show the current page of the current area
  useEffect(() => {
    const list = listRef.current;
    if (!list || !ready) return;
    const match = matching(list, area);
    const n = Math.max(1, Math.ceil(match.length / PER_PAGE));
    if (page > n) { setPage(n); return; }
    setPages(n);
    const shown = match.slice((page - 1) * PER_PAGE, page * PER_PAGE);
    const set = new Set(shown);
    list.querySelectorAll<HTMLElement>(".cl-entry").forEach((el) => { el.hidden = !set.has(el); el.removeAttribute("data-first"); });
    if (shown[0]) shown[0].setAttribute("data-first", "");
    list.setAttribute("data-ready", "");
    list.toggleAttribute("data-empty", match.length === 0);

    const url = new URL(window.location.href);
    if (area === "all") url.searchParams.delete("area"); else url.searchParams.set("area", area);
    if (page === 1) url.searchParams.delete("page"); else url.searchParams.set("page", String(page));
    if (userMove.current) url.hash = "";
    window.history.replaceState(null, "", url.toString());

    if (jumpTo.current) {
      const id = jumpTo.current; jumpTo.current = null;
      requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start" }));
    } else if (userMove.current) {
      const top = list.getBoundingClientRect().top + window.scrollY - 130;
      if (window.scrollY > top) window.scrollTo({ top, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    }
    userMove.current = false;
  }, [area, page, ready]);

  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".cl");
    if (!root) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { root.querySelectorAll("[data-anim]").forEach((el) => el.setAttribute("data-inview", "")); return; }
    root.classList.add("anim-ready");
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.setAttribute("data-inview", ""); io.unobserve(e.target); }
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    root.querySelectorAll("[data-anim]").forEach((el) => io.observe(el));
    const nav = root.querySelector<HTMLElement>(".cl-nav");
    const onScroll = () => { if (nav) nav.toggleAttribute("data-scrolled", window.scrollY > 8); };
    onScroll(); window.addEventListener("scroll", onScroll, { passive: true });
    return () => { io.disconnect(); window.removeEventListener("scroll", onScroll); };
  }, []);

  const pickArea = (a: string) => { userMove.current = true; setArea(a); setPage(1); };
  const go = (p: number) => { if (p < 1 || p > pages || p === page) return; userMove.current = true; setPage(p); };

  return (
    <>
      <div className="cl-filter" role="tablist" aria-label="Filter by area">
        <button type="button" role="tab" aria-selected={area === "all"} className={area === "all" ? "on" : ""} onClick={() => pickArea("all")}>All</button>
        {areas.map((a) => (
          <button type="button" role="tab" key={a.key} aria-selected={area === a.key} className={area === a.key ? "on" : ""} onClick={() => pickArea(a.key)}>{a.label}</button>
        ))}
      </div>

      <div className="cl-list" ref={listRef} data-area={area}>
        {children}
        <p className="cl-empty">Nothing in this area yet.</p>
      </div>

      {pages > 1 && (
        <nav className="cl-pager" aria-label="Changelog pages">
          <button type="button" className="cl-pg-step" aria-label="Newer entries" onClick={() => go(page - 1)} disabled={page === 1}><span aria-hidden>←</span><span className="cl-pg-word">Newer</span></button>
          <div className="cl-pg-nums">
            {pageItems(page, pages).map((n, i) => n === "gap"
              ? <span className="cl-pg-gap" key={`g${i}`}>…</span>
              : <button type="button" key={n} className={n === page ? "on" : ""} aria-current={n === page ? "page" : undefined} aria-label={`Page ${n}`} onClick={() => go(n)}>{n}</button>)}
          </div>
          <button type="button" className="cl-pg-step" aria-label="Older entries" onClick={() => go(page + 1)} disabled={page === pages}><span className="cl-pg-word">Older</span><span aria-hidden>→</span></button>
        </nav>
      )}
    </>
  );
}
