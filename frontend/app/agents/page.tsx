import fs from "node:fs";
import { pageMeta } from "../components/seo";
import path from "node:path";
import Link from "next/link";
import { marked } from "marked";
import Mark from "../components/Mark";
import AgentActions from "./AgentActions";
import CodeCopy from "../components/CodeCopy";
import { highlight } from "../lib/highlight";
import "../changelog/changelog.css";
import "../components/subpage.css";
import "./agents.css";

export const metadata = pageMeta("/agents", "AGENTS.md: private crypto payments for AI agents — Blackpool", "AGENTS.md: everything an AI agent needs to make private payments with the Blackpool CLI — setup, commands, JSON output, limits, recipes, errors and security.");

const RAW_URL = "https://blackpool.cash/AGENTS.md";
// Strip tags until nothing changes (a single pass can leave e.g. "<scr<b>ipt>" behind), then drop stray brackets.
const stripTags = (s: string) => { let prev; do { prev = s; s = s.replace(/<[^<>]*>/g, ""); } while (s !== prev); return s.replace(/[<>]/g, ""); };
const slug = (s: string) => stripTags(s.toLowerCase()).replace(/`/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const isOwnSite = (href: string) => { try { const h = new URL(href).hostname; return h === "blackpool.cash" || h.endsWith(".blackpool.cash"); } catch { return false; } };

// AGENTS.md is the single source: read at build time, rendered here, served raw at /AGENTS.md.
function load() {
  const md = fs.readFileSync(path.join(process.cwd(), "public", "AGENTS.md"), "utf8");
  // The page draws its own title and link panel, so drop the file's H1, intro paragraph and link table.
  const body = md.slice(md.indexOf("\n## "));
  const prompt = /Paste this into your agent's instructions:\s*```text\n([\s\S]*?)```/.exec(md)?.[1].trim() ?? "";
  const toc: Array<{ id: string; text: string }> = [];
  const renderer = new marked.Renderer();
  renderer.heading = function ({ tokens, depth }) {
    const text = this.parser.parseInline(tokens);
    const id = slug(text);
    if (depth === 2) toc.push({ id, text: stripTags(text) });
    return `<h${depth} id="${id}"><a href="#${id}">${text}</a></h${depth}>\n`;
  };
  renderer.link = function ({ href, title, tokens }) {
    const text = this.parser.parseInline(tokens);
    const ext = /^https?:\/\//.test(href) && !isOwnSite(href);
    return `<a href="${href}"${title ? ` title="${title}"` : ""}${ext ? ' target="_blank" rel="noopener noreferrer"' : ""}>${text}</a>`;
  };
  renderer.table = function (token) {
    const head = token.header.map((c) => `<th>${this.parser.parseInline(c.tokens)}</th>`).join("");
    const rows = token.rows.map((r) => `<tr>${r.map((c) => `<td>${this.parser.parseInline(c.tokens)}</td>`).join("")}</tr>`).join("");
    return `<div class="ag-table"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
  };
  const LABEL: Record<string, string> = { sh: "shell", bash: "shell", "": "shell", js: "javascript", javascript: "javascript", py: "python", python: "python", json: "json", text: "text" };
  renderer.code = function ({ text, lang }) {
    const l = (lang || "").trim().split(/\s+/)[0];
    return `<pre class="hl" data-lang="${LABEL[l] ?? l}"><code>${highlight(text, l)}</code></pre>\n`;
  };
  const html = marked.parse(body, { renderer, gfm: true, async: false }) as string;
  const bytes = Buffer.byteLength(md, "utf8");
  return { html, toc, prompt, size: `${(bytes / 1024).toFixed(1)} KB`, lines: md.split("\n").length };
}

export default function Agents() {
  const { html, toc, prompt, size, lines } = load();
  return (
    <main className="cl ag">
      <header className="cl-nav">
        <div className="cl-nav-in">
          <Link href="/" className="cl-brand"><Mark size={24} />Blackpool<span className="cl-brand-sub">Agents</span></Link>
          <nav className="cl-nav-links"><Link href="/">Home</Link><Link href="/docs">Docs</Link><Link href="/agents">Agents</Link><Link href="/analytics">Analytics</Link><Link href="/changelog">Changelog</Link></nav>
          <Link href="/app" className="cl-btn">Launch app</Link>
        </div>
      </header>

      <div className="cl-wrap">
        <div className="cl-head ag-head">
          <p className="ag-eyebrow mono">AGENTS.md</p>
          <h1>Private payments for agents</h1>
          <p className="ag-lead">One file gives an AI agent everything it needs to pay, swap and bridge privately with the Blackpool CLI: setup, every command and the JSON it returns, limits, recipes, error handling and the security rules. Hand it the file or the URL.</p>
          <AgentActions rawUrl={RAW_URL} prompt={prompt} />
          <div className="ag-facts">
            <span><b>Markdown</b> · {size} · {lines} lines</span>
            <span><b>Readable by any agent</b> · no JavaScript, no bot challenge</span>
            <span><b>MCP</b> · <a href="#9-mcp-servers">local and hosted servers</a></span>
            <span><b>Also in</b> <a href="https://www.npmjs.com/package/@blackpool/cli" target="_blank" rel="noopener noreferrer">the npm package</a> · <a href="https://github.com/blackpooldev/blackpool/blob/main/AGENTS.md" target="_blank" rel="noopener noreferrer">GitHub</a> · <a href="/llms.txt">llms.txt</a></span>
          </div>
        </div>

        <section className="ag-start">
          <div className="ag-card">
            <div className="ag-card-h"><span>1</span>Give your agent the guide</div>
            <pre className="ag-cmd hl-inline"><code dangerouslySetInnerHTML={{ __html: highlight(`curl -fsSL ${RAW_URL} -o AGENTS.md`, "sh") }} /></pre>
            <p>Or paste the instructions block (Copy for your agent) into its system prompt.</p>
          </div>
          <div className="ag-card">
            <div className="ag-card-h"><span>2</span>Install the CLI</div>
            <pre className="ag-cmd hl-inline"><code dangerouslySetInnerHTML={{ __html: highlight("npm i -g @blackpool/cli", "sh") }} /></pre>
            <p>Node.js 18+. Or run any command with <code>npx -y @blackpool/cli@latest</code>.</p>
          </div>
          <div className="ag-card">
            <div className="ag-card-h"><span>3</span>Give it a wallet</div>
            <pre className="ag-cmd hl-inline"><code dangerouslySetInnerHTML={{ __html: highlight("export BLACKPOOL_KEY=0x…\nexport BLACKPOOL_JSON=1", "sh") }} /></pre>
            <p>A dedicated agent wallet, never your main one. Every command then answers in JSON.</p>
          </div>
        </section>

        <div className="ag-doc">
          <aside className="ag-toc">
            <div className="ag-toc-h">On this page</div>
            <nav>{toc.map((t) => <a key={t.id} href={`#${t.id}`}>{t.text}</a>)}</nav>
            <a className="ag-toc-dl" href="/AGENTS.md" download="AGENTS.md">Download AGENTS.md ↓</a>
          </aside>
          <article className="ag-md" dangerouslySetInnerHTML={{ __html: html }} />
          <CodeCopy />
        </div>

        <footer className="sp-foot ag-foot">
          <span>© {new Date().getFullYear()} Blackpool</span>
          <nav><Link href="/docs#agents">Docs</Link><Link href="/status">Status</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><a href="mailto:hello@blackpool.cash">hello@blackpool.cash</a></nav>
        </footer>
      </div>
    </main>
  );
}
