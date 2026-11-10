"use client";
import { useState } from "react";
import "./notice-ca.css";

/** The token contract in the site-wide notice. The whole chip copies the full address. Clipboard only. */
export default function NoticeCA({ address }: { address: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(address); } catch {
      const t = document.createElement("textarea"); t.value = address; t.style.position = "fixed"; t.style.opacity = "0";
      document.body.appendChild(t); t.select(); try { document.execCommand("copy"); } catch { /* ignore */ } t.remove();
    }
    setDone(true); setTimeout(() => setDone(false), 1500);
  };
  return (
    <button type="button" className="bp-ca" onClick={copy} aria-label={`Copy the contract address ${address}`}>
      <code className="bp-ca-full">{address}</code>
      <code className="bp-ca-short">{address.slice(0, 6)}…{address.slice(-4)}</code>
      <span className="bp-ca-act">{done ? "Copied" : "Copy"}</span>
    </button>
  );
}
