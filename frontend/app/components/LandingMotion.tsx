"use client";
import { useEffect } from "react";

/**
 * Landing motion (original implementation):
 *  - reveal-on-scroll: every [data-anim] starts hidden (CSS) and gets data-inview once it intersects, staggered by
 *    data-delay; bento cards also get their mini-animations from the same attribute (CSS keyframes).
 *  - hero runner: cycles .lp-window[data-step] 0..5 (reset, shield, prove, relay, deliver, complete) and the
 *    Replay button restarts it. Pure attribute toggling; all visuals live in landing.css.
 *  - progressive enhancement: without JS nothing is hidden (the .anim-ready class gates the hidden state).
 */
export default function LandingMotion() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".lp");
    if (!root) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { root.querySelectorAll("[data-anim]").forEach((el) => el.setAttribute("data-inview", "")); return; }
    root.classList.add("anim-ready");

    // nav: data-scrolled once the page has moved (reference: header morphs after scroll)
    const nav = root.querySelector<HTMLElement>(".lp-nav");
    const onScroll = () => { if (nav) nav.toggleAttribute("data-scrolled", window.scrollY > 8); };
    onScroll(); window.addEventListener("scroll", onScroll, { passive: true });
    // mobile menu + changelog toast (session-only, no storage)
    const menu = root.querySelector<HTMLButtonElement>(".lp-menu");
    const onMenu = () => { const open = !nav?.hasAttribute("data-open"); nav?.toggleAttribute("data-open", open); menu?.setAttribute("aria-expanded", String(open)); };
    menu?.addEventListener("click", onMenu);
    const onDrawerLink = () => { nav?.removeAttribute("data-open"); menu?.setAttribute("aria-expanded", "false"); };
    const drawerLinks = Array.from(root.querySelectorAll<HTMLElement>(".lp-drawer a")); drawerLinks.forEach((a) => a.addEventListener("click", onDrawerLink));
    const toast = root.querySelector<HTMLElement>(".lp-toast"); const toastX = toast?.querySelector<HTMLButtonElement>(".x");
    const toastTimer = setTimeout(() => toast?.setAttribute("data-show", ""), 1400);
    const onToastX = () => toast?.setAttribute("data-hide", "");
    toastX?.addEventListener("click", onToastX);

    // bento: hover replays the card's mini-sequence (alternating keyframe alias restarts it) + cursor spotlight
    const cards = Array.from(root.querySelectorAll<HTMLElement>(".lp-bc"));
    const plays = new WeakMap<HTMLElement, number>();
    const onEnter = (e: Event) => { const c = e.currentTarget as HTMLElement; const n = (plays.get(c) ?? 0) + 1; plays.set(c, n); c.setAttribute("data-play", n % 2 ? "a" : "b"); };
    const onMove = (e: MouseEvent) => { const c = e.currentTarget as HTMLElement; const r = c.getBoundingClientRect(); c.style.setProperty("--sx", `${e.clientX - r.left}px`); c.style.setProperty("--sy", `${e.clientY - r.top}px`); };
    cards.forEach((c) => { c.addEventListener("mouseenter", onEnter); c.addEventListener("mousemove", onMove); });
    const visible = new Set<HTMLElement>();
    const cio = new IntersectionObserver((es) => { for (const e of es) { if (e.isIntersecting) visible.add(e.target as HTMLElement); else visible.delete(e.target as HTMLElement); } }, { threshold: 0.5 });
    cards.forEach((c) => cio.observe(c));
    let loopIdx = 0;
    const loop = setInterval(() => { const vis = cards.filter((c) => visible.has(c) && !c.matches(":hover")); if (!vis.length) return; const c = vis[loopIdx % vis.length]; loopIdx += 1; const n = (plays.get(c) ?? 0) + 1; plays.set(c, n); c.setAttribute("data-play", n % 2 ? "a" : "b"); }, 2600);

    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.setAttribute("data-inview", ""); io.unobserve(e.target); }
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
    root.querySelectorAll("[data-anim]").forEach((el) => io.observe(el));

    const win = root.querySelector<HTMLElement>(".lp-window");
    const SCENES = ["shield", "send", "swap", "bridge", "recover"] as const; // hero rotates through all five stories
    const HOLD: Record<string, number[]> = { shield: [600, 1400, 1500, 1600, 1300, 3000], send: [600, 1300, 1500, 1300, 1400, 3000], swap: [600, 1400, 1300, 1800, 1500, 3000], bridge: [600, 1300, 1600, 1700, 1800, 3400], recover: [600, 1500, 1900, 1500, 1500, 3000] };
    // bridge routes — rotate every bridge run
    // live prices: relayer API first, public spot as fallback; sane constants until the first response lands
    const API = process.env.NEXT_PUBLIC_API_URL || "";
    const px: Record<string, number> = { ETH: 2268.4, SOL: 156.2 };
    const fmtN = (v: number, dec = 2) => v.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
    const usdOut = (amt: number, fee: number, unit: string, dec = 2) => `${fmtN(amt * px.ETH * (1 - fee), dec)} ${unit}`;
    const ROUTES: Array<{ shield: string; from: string; asset: string; to: string; toAsset: string; toLogo: string; recipient: string; out: () => string }> = [
      { shield: "1.000 ETH", from: "Robinhood Chain", asset: "ETH", to: "Solana", toAsset: "USDC", toLogo: "/token_logos/solana.png", recipient: "7Gx4…kQ2m", out: () => usdOut(1, 0.004, "USDC") },
      { shield: "500 USDC", from: "Base", asset: "USDC", to: "Arbitrum", toAsset: "USDC", toLogo: "/token_logos/arbitrum.png", recipient: "0x4a1e…c0d2", out: () => "498.90 USDC" },
      { shield: "0.500 ETH", from: "Arbitrum", asset: "ETH", to: "Base", toAsset: "ETH", toLogo: "/token_logos/base.png", recipient: "0x77b0…9e1f", out: () => "0.4987 ETH" },
      { shield: "1,200 USDT", from: "BNB Chain", asset: "USDT", to: "Ethereum", toAsset: "USDT", toLogo: "/token_logos/ethereum.png", recipient: "0x3c9d…f21a", out: () => "1,194.60 USDT" },
      { shield: "0.400 ETH", from: "Base", asset: "ETH", to: "Robinhood Chain", toAsset: "USDG", toLogo: "/token_logos/robinhood.png?v=2", recipient: "0x9f3c…41e7", out: () => usdOut(0.4, 0.004, "USDG") },
      { shield: "300 USDG", from: "Robinhood Chain", asset: "USDG", to: "Solana", toAsset: "SOL", toLogo: "/token_logos/solana.png", recipient: "9Hq2…vT8c", out: () => `${fmtN((300 * 0.996) / px.SOL, 3)} SOL` },
    ];
    // every [data-usd] / [data-q-*] figure on the page follows the price
    const applyPx = () => {
      root.querySelectorAll<HTMLElement>("[data-usd]").forEach((el) => { el.textContent = `≈ $${fmtN(parseFloat(el.dataset.usd || "0") * px.ETH, 0)}`; });
      root.querySelectorAll<HTMLElement>("[data-q-amt]").forEach((el) => { const amt = parseFloat(el.dataset.qAmt || "0"), fee = parseFloat(el.dataset.qFee || "0"), dec = parseInt(el.dataset.qDec || "2", 10); el.textContent = `${el.dataset.qPrefix || ""}${fmtN(amt * px.ETH * (1 - fee), dec)} ${el.dataset.qUnit || ""}`.trim(); });
      quoteBase = px.ETH; const tk = win?.querySelector<HTMLElement>("[data-tick]"); if (tk) tk.textContent = fmtN(px.ETH);
    };
    let quoteBase = px.ETH;
    const fetchPx = async () => {
      let ok = false;
      if (API) { try { const r = await fetch(`${API}/api/price?symbols=ETH,SOL`, { signal: AbortSignal.timeout(3500) }); const j = await r.json(); if (typeof j?.prices?.ETH === "number") { px.ETH = j.prices.ETH; ok = true; if (typeof j.prices.SOL === "number") px.SOL = j.prices.SOL; else { try { const s = await fetch("https://api.coinbase.com/v2/prices/SOL-USD/spot", { signal: AbortSignal.timeout(3500) }).then((r) => r.json()); const ps = parseFloat(s?.data?.amount); if (ps > 0) px.SOL = ps; } catch { /* keep */ } } } } catch { /* fall through */ } }
      if (!ok) { try { const [e, s] = await Promise.all(["ETH", "SOL"].map((sym) => fetch(`https://api.coinbase.com/v2/prices/${sym}-USD/spot`, { signal: AbortSignal.timeout(3500) }).then((r) => r.json()))); const pe = parseFloat(e?.data?.amount), ps = parseFloat(s?.data?.amount); if (pe > 0) { px.ETH = pe; ok = true; } if (ps > 0) px.SOL = ps; } catch { /* keep constants */ } }
      if (ok) { applyPx(); fill(); }
    };
    const pxTimer = setInterval(fetchPx, 60_000);
    const slug = (n: string) => ({ "Robinhood Chain": "robinhood", "BNB Chain": "bsc" } as Record<string, string>)[n] || n.toLowerCase();
    let route = 0;
    const fill = () => {
      const r = ROUTES[route]; if (!win) return;
      win?.querySelectorAll<HTMLElement>("[data-r]").forEach((el) => {
        const k = el.dataset.r as keyof typeof r;
        if (k === "toLogo") (el as HTMLImageElement).src = r.toLogo;
        else if ((k as string) === "fromSlug" || (k as string) === "toSlug") el.textContent = slug(r[(k as string) === "fromSlug" ? "from" : "to"]);
        else if (k === "out") el.textContent = r.out();
        else el.textContent = r[k] as string;
      });
    };
    let notes = 12;
    // "last sync N s ago" ticker — small idle motion in the console header
    let sync = 4; const syncEl = win?.querySelector<HTMLElement>("[data-sync]");
    const syncTimer = setInterval(() => { sync = sync >= 9 ? 1 : sync + 1; if (syncEl) syncEl.textContent = String(sync); }, 1000);
    let scene = 0; let step = 0; let timer: ReturnType<typeof setTimeout> | undefined;
    const apply = () => { win?.setAttribute("data-scene", SCENES[scene]); win?.setAttribute("data-step", String(step)); if (step > 0) win?.setAttribute("data-started", ""); };
    // scene-specific live numbers: the swap quote drifts while routing; the recovery counter climbs while scanning
    const tickEl = () => win?.querySelector<HTMLElement>("[data-tick]"); const cntEl = () => win?.querySelector<HTMLElement>("[data-counter]");
    let quote = quoteBase, counted = 0;
    const live = setInterval(() => {
      const sc = SCENES[scene];
      if (sc === "swap") { const el = tickEl(); if (el) { if (step >= 1 && step <= 3) quote = quoteBase + Math.sin(Date.now() / 900) * quoteBase * 0.0014 + (Math.random() - 0.5) * quoteBase * 0.0005; else quote = quoteBase; el.textContent = quote.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); } }
      if (sc === "recover") { const el = cntEl(); if (el) { if (step === 0) counted = 0; else if (step === 1) counted = Math.min(86, counted + 7); else counted = Math.min(128, counted + 9); el.textContent = String(counted); } }
    }, 160);
    const tick = () => {
      if (step === 5) { scene = (scene + 1) % SCENES.length; step = 0; if (SCENES[scene] === "bridge") { route = (route + 1) % ROUTES.length; fill(); } } else { step += 1; }
      if (step === 5 && win) { notes += 1; win.querySelectorAll<HTMLElement>('[data-count="notes"]').forEach((el) => { el.textContent = String(notes); }); win.querySelectorAll<HTMLElement>('[data-count="unspent"]').forEach((el) => { el.textContent = String(notes - 2); }); win.setAttribute("data-cycle", win.getAttribute("data-cycle") === "b" ? "a" : "b"); }
      apply(); timer = setTimeout(tick, HOLD[SCENES[scene]][step]);
    };
    if (win) { fill(); apply(); timer = setTimeout(tick, 2600); }
    applyPx(); fetchPx();
    // console stage: scale the 1180/980px composition to the window width (reference scales its dashboard shot)
    const fit = () => { if (!win) return; const sw = parseFloat(getComputedStyle(win).getPropertyValue("--sw")) || 1180; win.style.setProperty("--k", String(win.clientWidth / sw)); };
    fit(); const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null; if (win && ro) ro.observe(win);
    const restart = (delay = 400) => { if (timer) clearTimeout(timer); step = 0; apply(); timer = setTimeout(tick, delay); };
    const replay = win?.querySelector<HTMLButtonElement>(".lp-replay");
    const onReplay = () => { if (SCENES[scene] === "bridge") { route = (route + 1) % ROUTES.length; fill(); } restart(400); };
    replay?.addEventListener("click", onReplay);
    const tabs = Array.from(win?.querySelectorAll<HTMLButtonElement>(".lp-win-tabs button") ?? []);
    const onTab = (e: Event) => { const el = e.currentTarget as HTMLButtonElement; const i = SCENES.indexOf(el.dataset.scene as (typeof SCENES)[number]); if (i >= 0) { scene = i; restart(900); } };
    tabs.forEach((b) => b.addEventListener("click", onTab));

    return () => { io.disconnect(); ro?.disconnect(); cio.disconnect(); clearInterval(loop); clearInterval(syncTimer); clearInterval(live); clearInterval(pxTimer); if (timer) clearTimeout(timer); replay?.removeEventListener("click", onReplay); tabs.forEach((b) => b.removeEventListener("click", onTab)); window.removeEventListener("scroll", onScroll); menu?.removeEventListener("click", onMenu); drawerLinks.forEach((a) => a.removeEventListener("click", onDrawerLink)); clearTimeout(toastTimer); toastX?.removeEventListener("click", onToastX); cards.forEach((c) => { c.removeEventListener("mouseenter", onEnter); c.removeEventListener("mousemove", onMove); }); };
  }, []);
  return null;
}
