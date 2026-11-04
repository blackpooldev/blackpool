"use client";
import { useEffect, useRef } from "react";

/**
 * Footer wordmark as a live halftone (canvas). Original implementation:
 *  - samples "Blackpool" + the mark from an offscreen canvas into a 6px dot grid;
 *  - reveal: dots pop in as a left→right wave when the footer scrolls into view;
 *  - idle: a slow brightness wave keeps it breathing;
 *  - lens: dots near the pointer grow, brighten and get pushed outward, then spring back.
 * Falls back to the CSS-masked text when canvas/JS are unavailable (the span stays until data-ready).
 */
export default function FootMark() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = ref.current; if (!host) return;
    const canvas = host.querySelector("canvas"); const ctx = canvas?.getContext("2d"); if (!canvas || !ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0, dpr = Math.min(2, window.devicePixelRatio || 1), W = 0, H = 0, cell = 6;
    let dots: { x: number; y: number; r: number; a: number; ox: number; oy: number; vx: number; vy: number; dx: number; dy: number }[] = [];
    const pointer = { x: -1e4, y: -1e4, tx: -1e4, ty: -1e4, strength: 0 };
    let revealAt = -1, built = false;
    const img = new Image(); img.src = "/mark.svg"; let imgReady = false; img.onload = () => { imgReady = true; build(); };

    const build = () => {
      W = host.clientWidth; if (!host.isConnected || W < 2) return; // unmounted or not laid out yet
      H = Math.max(80, Math.round(W * 0.235)); cell = W < 600 ? 4 : 6;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); canvas.style.height = `${H}px`;
      // offscreen: draw the wordmark at 1 sample per cell
      const cols = Math.ceil(W / cell), rows = Math.ceil(H / cell);
      const off = document.createElement("canvas"); off.width = cols; off.height = rows; const o = off.getContext("2d"); if (!o) return;
      o.clearRect(0, 0, cols, rows);
      const fs = rows * 1.02; o.font = `600 ${fs}px Inter, system-ui, sans-serif`; o.textBaseline = "alphabetic"; o.fillStyle = "#fff";
      const text = "Blackpool"; const tw = o.measureText(text).width; const mk = imgReady && W >= 600 ? fs * 0.78 : 0; const gap = mk ? fs * 0.06 : 0;
      const total = tw + mk + gap; const scale = Math.min(1, (cols - 2) / total);
      o.save(); o.translate((cols - total * scale) / 2, rows - rows * 0.04); o.scale(scale, scale);
      if (mk) o.drawImage(img, 0, -mk - fs * 0.02, mk, mk);
      o.fillText(text, mk + gap, 0); o.restore();
      const data = o.getImageData(0, 0, cols, rows).data;
      dots = [];
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const a = data[(j * cols + i) * 4 + 3] / 255; if (a < 0.25) continue;
        const x = (i + 0.5) * cell, y = (j + 0.5) * cell; const fade = 0.35 + 0.65 * Math.min(1, j / (rows * 0.75)); // top rows dimmer, like the CSS mask
        dots.push({ x, y, ox: x, oy: y, r: cell * 0.33 * Math.min(1, a + 0.15), a: fade, vx: 0, vy: 0, dx: 0, dy: 0 });
      }
      built = true;
    };

    const draw = (t: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      const ts = t / 1000;
      pointer.x += (pointer.tx - pointer.x) * 0.22; pointer.y += (pointer.ty - pointer.y) * 0.22;
      const reveal = revealAt < 0 ? 0 : Math.min(1.4, (t - revealAt) / 1000);
      for (const d of dots) {
        // reveal wave: each dot pops once the wave front (left→right) passes it
        const front = reveal * (W + 160) / 1.1 - 120; let k = reduce ? 1 : Math.max(0, Math.min(1, (front - d.ox) / 140)); k = 1 - (1 - k) * (1 - k);
        if (k <= 0) continue;
        // lens
        const ddx = d.ox - pointer.x, ddy = d.oy - pointer.y, dist = Math.hypot(ddx, ddy); const R = 120; let lens = 0;
        if (dist < R) { lens = 1 - dist / R; lens = lens * lens; const push = 14 * lens; d.vx += ((ddx / (dist || 1)) * push - d.dx) * 0.18; d.vy += ((ddy / (dist || 1)) * push - d.dy) * 0.18; }
        d.vx += -d.dx * 0.12; d.vy += -d.dy * 0.12; d.vx *= 0.78; d.vy *= 0.78; d.dx += d.vx; d.dy += d.vy;
        const wave = reduce ? 1 : 0.82 + 0.18 * Math.sin(ts * 1.1 + d.ox * 0.012 + d.oy * 0.02);
        const r = d.r * k * (1 + 0.9 * lens) * (0.92 + 0.08 * wave);
        const bright = Math.min(1, d.a * wave + lens * 0.6);
        ctx.globalAlpha = bright; ctx.fillStyle = lens > 0.35 ? "#ffffff" : "#EBECEC";
        ctx.beginPath(); ctx.arc(d.ox + d.dx, d.oy + d.dy, r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };

    const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting && revealAt < 0) { revealAt = performance.now(); host.setAttribute("data-ready", ""); } }, { threshold: 0.2 });
    io.observe(host);
    const onMove = (e: PointerEvent) => { const b = canvas.getBoundingClientRect(); pointer.tx = e.clientX - b.left; pointer.ty = e.clientY - b.top; };
    const onLeave = () => { pointer.tx = -1e4; pointer.ty = -1e4; };
    host.addEventListener("pointermove", onMove); host.addEventListener("pointerleave", onLeave);
    const ro = new ResizeObserver(() => { if (built || imgReady) build(); }); ro.observe(host);
    build(); if (document.fonts?.ready) document.fonts.ready.then(() => build()); raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); io.disconnect(); ro.disconnect(); host.removeEventListener("pointermove", onMove); host.removeEventListener("pointerleave", onLeave); };
  }, []);
  return (
    <div className="lp-wordmark lp-wordmark-live" ref={ref} aria-hidden="true">
      <canvas />
      <span className="lp-wordmark-fallback">Blackpool</span>
    </div>
  );
}
