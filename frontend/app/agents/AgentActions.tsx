"use client";
import { useState } from "react";

/** Download / copy actions for AGENTS.md. Clipboard only; nothing is stored. */
export default function AgentActions({ rawUrl, prompt }: { rawUrl: string; prompt: string }) {
  const [done, setDone] = useState<string | null>(null);
  const copy = async (key: string, text: string) => {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const t = document.createElement("textarea"); t.value = text; t.style.position = "fixed"; t.style.opacity = "0";
      document.body.appendChild(t); t.select(); try { document.execCommand("copy"); } catch { /* ignore */ } t.remove();
    }
    setDone(key); setTimeout(() => setDone((k) => (k === key ? null : k)), 1600);
  };
  return (
    <div className="ag-actions">
      <a className="ag-btn pri" href="/AGENTS.md" download="AGENTS.md">Download AGENTS.md</a>
      <button type="button" className="ag-btn" onClick={() => copy("prompt", prompt)}>{done === "prompt" ? "Copied" : "Copy for your agent"}</button>
      <button type="button" className="ag-btn" onClick={() => copy("url", rawUrl)}>{done === "url" ? "Copied" : "Copy URL"}</button>
      <a className="ag-btn ghost" href="/AGENTS.md" target="_blank" rel="noopener noreferrer">View raw</a>
    </div>
  );
}
