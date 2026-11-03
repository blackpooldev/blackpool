// Build-time syntax highlighting for docs and AGENTS.md code blocks, in the landing palette:
// commands white, flags blue, strings green, numbers/booleans amber, keywords and env vars purple, comments dim.
// No runtime dependency: returns HTML spans (class names hl-*) styled in globals.css.

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const span = (cls: string, s: string) => `<span class="hl-${cls}">${esc(s)}</span>`;

type Rule = [RegExp, string | ((m: string) => string)];

function run(src: string, rules: Rule[]): string {
  let out = "", i = 0, plain = "";
  const flush = () => { if (plain) { out += esc(plain); plain = ""; } };
  outer: while (i < src.length) {
    for (const [re, cls] of rules) {
      re.lastIndex = i;
      const m = re.exec(src);
      if (m && m.index === i && m[0].length) {
        flush();
        out += typeof cls === "function" ? cls(m[0]) : span(cls, m[0]);
        i += m[0].length;
        continue outer;
      }
    }
    plain += src[i++];
  }
  flush();
  return out;
}

const STR = /"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`/y;
const NUM = /\b(?:0x[0-9a-fA-F…]+|\d[\d_]*(?:\.\d+)?)\b/y;

const JSON_RULES: Rule[] = [
  [/"(?:\\.|[^"\\\n])*"(?=\s*:)/y, "key"],
  [/"(?:\\.|[^"\\\n])*"/y, "s"],
  [/\b(?:true|false|null)\b/y, "n"],
  [/-?\b\d+(?:\.\d+)?\b/y, "n"],
  [/[{}[\],:]/y, "pun"],
];

const SH_CMDS = new Set(["blackpool", "npm", "npx", "curl", "export", "node", "jq", "echo", "if", "then", "fi", "while", "do", "done", "read", "break", "bc", "python", "python3", "git"]);
function shLine(line: string): string {
  const t = line.trimStart();
  if (/^[{["]/.test(t)) return run(line, JSON_RULES);
  let expectCmd = true;
  const rules: Rule[] = [
    [/\$(?= )/y, (m) => { expectCmd = true; return span("p", m); }],
    [/(?:^|(?<=\s))#.*/y, "c"],
    [/→[^#\n]*/y, (m) => span("o", m)],
    [/\|\||&&|[|;]|\$\(|\)|\[|\]|<|>|\(\(|\)\)/y, (m) => { if (["|", "||", "&&", ";", "$(", "(("].includes(m)) expectCmd = true; return span("pun", m); }],
    [STR, (m) => { expectCmd = false; return span("s", m); }],
    [/https?:\/\/[^\s"'`)]+/y, (m) => { expectCmd = false; return span("u", m); }],
    [/(?<![\w-])--?[A-Za-z][\w-]*/y, (m) => { expectCmd = false; return span("f", m); }],
    [/\b[A-Z][A-Z0-9_]{2,}(?==|\b)/y, (m) => { expectCmd = false; return span("v", m); }],
    [/[A-Za-z_][\w.@/-]*/y, (m) => { const isCmd = expectCmd && (SH_CMDS.has(m) || /^[a-z]/.test(m)); const wasCmd = expectCmd; expectCmd = false; if (isCmd) return span("cmd", m); if (!wasCmd && /^(?:address|balance|deposit|send|swap|bridge|bridges|assets|recover|login|logout|version|latest|help)$/.test(m)) return span("sub", m); return esc(m); }],
    [NUM, (m) => { expectCmd = false; return span("n", m); }],
  ];
  return run(line, rules);
}

const JS_KW = /\b(?:import|from|export|const|let|var|function|return|async|await|new|throw|try|catch|finally|if|else|for|of|in|while|true|false|null|undefined|typeof|default)\b/y;
const PY_KW = /\b(?:import|from|def|return|try|except|as|with|for|in|if|elif|else|raise|True|False|None|and|or|not|lambda|class|pass)\b/y;

function code(src: string, kw: RegExp, comment: RegExp): string {
  return run(src, [
    [comment, "c"],
    [STR, "s"],
    [kw, "k"],
    [/\b[A-Z][A-Z0-9_]{2,}\b/y, "v"],
    [/\b[A-Za-z_]\w*(?=\()/y, "fn"],
    [NUM, "n"],
    [/[{}[\]();,.=<>+\-*/!?:&|]/y, "pun"],
  ]);
}

export function highlight(src: string, lang = ""): string {
  const l = lang.toLowerCase();
  if (l === "json") return run(src, JSON_RULES);
  if (l === "js" || l === "javascript" || l === "ts" || l === "typescript") return code(src, JS_KW, /\/\/[^\n]*|\/\*[\s\S]*?\*\//y);
  if (l === "py" || l === "python") return code(src, PY_KW, /#[^\n]*/y);
  if (l === "text" || l === "txt") return esc(src);
  return src.split("\n").map(shLine).join("\n"); // sh / bash / unlabelled
}
