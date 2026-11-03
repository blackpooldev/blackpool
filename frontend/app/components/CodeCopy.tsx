"use client";
import { useEffect } from "react";

/** Adds a Copy button to every highlighted code block (pre.hl) on the page. Clipboard only. */
export default function CodeCopy() {
  useEffect(() => {
    document.querySelectorAll<HTMLPreElement>("pre.hl").forEach((pre) => {
      if (pre.parentElement?.classList.contains("hl-wrap")) return;
      const wrap = document.createElement("div");
      wrap.className = "hl-wrap";
      pre.parentNode?.insertBefore(wrap, pre);
      wrap.appendChild(pre);
      const btn = document.createElement("button");
      btn.type = "button"; btn.className = "hl-copy"; btn.textContent = "Copy"; btn.setAttribute("aria-label", "Copy code");
      btn.addEventListener("click", async () => {
        const text = pre.querySelector("code")?.textContent ?? pre.textContent ?? "";
        try { await navigator.clipboard.writeText(text); } catch {
          const t = document.createElement("textarea"); t.value = text; t.style.position = "fixed"; t.style.opacity = "0";
          document.body.appendChild(t); t.select(); try { document.execCommand("copy"); } catch { /* ignore */ } t.remove();
        }
        btn.textContent = "Copied"; btn.classList.add("ok");
        setTimeout(() => { btn.textContent = "Copy"; btn.classList.remove("ok"); }, 1500);
      });
      wrap.appendChild(btn);
    });
  }, []);
  return null;
}
