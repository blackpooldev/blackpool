"use client";
import { useEffect, useState } from "react";

/** Filter chips (?area=…) + reveal-on-scroll for the entries. No storage: state lives in the URL only. */
export default function ChangelogClient({ areas }: { areas: Array<{ key: string; label: string }> }) {
  const [area, setArea] = useState("all");

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("area");
    if (q && areas.some((a) => a.key === q)) setArea(q);
  }, [areas]);

  useEffect(() => {
    const list = document.querySelector<HTMLElement>(".cl-list");
    if (!list) return;
    list.setAttribute("data-area", area);
    const visible = list.querySelectorAll<HTMLElement>(area === "all" ? ".cl-entry" : `.cl-entry[data-areas~="${area}"]`).length;
    list.toggleAttribute("data-empty", visible === 0);
    const url = new URL(window.location.href);
    if (area === "all") url.searchParams.delete("area"); else url.searchParams.set("area", area);
    window.history.replaceState(null, "", url.toString());
  }, [area]);

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

  return (
    <div className="cl-filter" role="tablist" aria-label="Filter by area">
      <button type="button" role="tab" aria-selected={area === "all"} className={area === "all" ? "on" : ""} onClick={() => setArea("all")}>All</button>
      {areas.map((a) => (
        <button type="button" role="tab" key={a.key} aria-selected={area === a.key} className={area === a.key ? "on" : ""} onClick={() => setArea(a.key)}>{a.label}</button>
      ))}
    </div>
  );
}
