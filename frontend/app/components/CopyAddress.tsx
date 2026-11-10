"use client";
import { useState } from "react";

/** A contract address with a copy button. Clipboard only. */
export default function CopyAddress({ address }: { address: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(address); } catch {
      const t = document.createElement("textarea"); t.value = address; t.style.position = "fixed"; t.style.opacity = "0";
      document.body.appendChild(t); t.select(); try { document.execCommand("copy"); } catch { /* ignore */ } t.remove();
    }
    setDone(true); setTimeout(() => setDone(false), 1500);
  };
  return (
    <div className="tk-addr">
      <code>{address}</code>
      <button type="button" onClick={copy} aria-label="Copy contract address">{done ? "Copied" : "Copy"}</button>
    </div>
  );
}
