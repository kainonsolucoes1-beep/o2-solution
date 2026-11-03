import { useState, type ReactNode } from 'react'
import { Copy, Check } from 'lucide-react'

// Estrutura visual das abas de Configurações > API (Chaves, Documentação,
// Sincronizações): sumário lateral, cabeçalho e seções no padrão da página
// pública /integracao/.

export type DocToc = { group: string; items: { id: string; label: string; method?: 'GET' | 'POST' }[] }[]

export function goToDoc(id: string) {
  document.getElementById(`apidoc-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

export function DocShell({ toc, eyebrow, title, lead, meta, children }: {
  toc: DocToc; eyebrow: string; title: string; lead: ReactNode; meta?: ReactNode[]; children: ReactNode
}) {
  return (
    <div className="apidoc">
      <style>{APIDOC_CSS}</style>
      <nav className="apidoc-toc" aria-label="Sumário">
        {toc.map(g => (
          <div key={g.group}>
            <p>{g.group}</p>
            {g.items.map(it => (
              <button key={it.id} onClick={() => goToDoc(it.id)}>
                {it.method && <Method m={it.method} />}{it.label}
              </button>
            ))}
          </div>
        ))}
      </nav>
      <div className="apidoc-main">
        <header className="apidoc-hero">
          <p className="apidoc-eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="apidoc-lead">{lead}</p>
          {meta && meta.length > 0 && <div className="apidoc-meta">{meta.map((m, i) => <span key={i}>{m}</span>)}</div>}
        </header>
        {children}
      </div>
    </div>
  )
}

export function Section({ id, title, intro, children }: { id: string; title: string; intro?: ReactNode; children?: ReactNode }) {
  return (
    <section id={`apidoc-${id}`}>
      <h2>{title}</h2>
      {intro && <p>{intro}</p>}
      {children}
    </section>
  )
}

export function C({ children }: { children: ReactNode }) {
  return <code className="apidoc-ic">{children}</code>
}

export function Method({ m }: { m: 'GET' | 'POST' }) {
  return <span className={`apidoc-method ${m === 'GET' ? 'get' : 'post'}`}>{m}</span>
}

// Realce simples: "string" seguida de ":" é chave; outras strings em verde;
// comentários (// ou #) em cinza; palavras-chave da linguagem em azul.
const KEYWORDS = new Set(['const', 'await', 'if', 'else', 'import', 'elif', 'pass'])
function highlight(code: string): ReactNode[] {
  const out: ReactNode[] = []
  // comentário só depois de espaço, senão o "//" de https:// viraria comentário
  const re = /("(?:[^"\\]|\\.)*")(\s*:)?|((?<=\s)(?:\/\/|#)[^\n]*)|\b([a-z]+)\b/g
  let last = 0, m: RegExpExecArray | null, i = 0
  while ((m = re.exec(code))) {
    if (m[4] && !KEYWORDS.has(m[4])) continue
    if (m.index > last) out.push(code.slice(last, m.index))
    if (m[1]) {
      out.push(<span key={i++} className={m[2] ? 'k' : 's'}>{m[1]}</span>)
      if (m[2]) out.push(m[2])
    } else if (m[3]) {
      out.push(<span key={i++} className="c">{m[3]}</span>)
    } else {
      out.push(<span key={i++} className="k">{m[4]}</span>)
    }
    last = re.lastIndex
  }
  if (last < code.length) out.push(code.slice(last))
  return out
}

export function CodeBlock({ title, code, withKeys }: { title: string; code: string; withKeys?: (c: string) => string | null }) {
  const [copied, setCopied] = useState<'' | 'plain' | 'keys'>('')
  const real = withKeys ? withKeys(code) : null
  function copy(kind: 'plain' | 'keys', text: string) {
    navigator.clipboard.writeText(text).then(() => { setCopied(kind); setTimeout(() => setCopied(''), 1600) }).catch(() => {})
  }
  return (
    <div className="apidoc-code">
      <div className="apidoc-code-head">
        <span>{title}</span>
        <div style={{ display: 'flex', gap: 6 }}>
          {real && (
            <button className="apidoc-copy" onClick={() => copy('keys', real)} title="Copia o comando já com as chaves reais desta conta">
              {copied === 'keys' ? <><Check size={12} /> Copiado</> : <>Copiar com minhas chaves</>}
            </button>
          )}
          <button className="apidoc-copy" onClick={() => copy('plain', code)}>
            {copied === 'plain' ? <><Check size={12} /> Copiado</> : <><Copy size={12} /> Copiar</>}
          </button>
        </div>
      </div>
      <pre>{highlight(code)}</pre>
    </div>
  )
}

export function Endpoint({ m, path, children }: { m: 'GET' | 'POST'; path: string; children: ReactNode }) {
  return (
    <div className="apidoc-endpoint">
      <div className="apidoc-endpoint-head"><Method m={m} /><span className="apidoc-path">{path}</span></div>
      <div className="apidoc-endpoint-body">{children}</div>
    </div>
  )
}

export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="apidoc-table">
      <table>
        <thead><tr>{head.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

export function Req() { return <span className="apidoc-req">obrigatório</span> }
export function Opt({ children = 'opcional' }: { children?: string }) { return <span className="apidoc-opt">{children}</span> }


const APIDOC_CSS = `
.apidoc { --get: #047857; --get-bg: rgba(4,120,87,.10); --post: #1D4ED8; --post-bg: rgba(29,78,216,.10);
  --code-bg: #0F172A; --code-text: #E2E8F0; --code-muted: #94A3B8; --code-key: #93C5FD; --code-str: #86EFAC;
  display: grid; grid-template-columns: 190px minmax(0, 1fr); gap: 36px; color: var(--text-1); font-size: 14.5px; line-height: 1.6; }
html.dark .apidoc { --get: #34D399; --get-bg: rgba(52,211,153,.12); --post: #93C5FD; --post-bg: rgba(147,197,253,.12); --code-bg: #0A0E16; }
.apidoc code, .apidoc pre, .apidoc-path, .apidoc-method { font-family: "JetBrains Mono", ui-monospace, Consolas, monospace; }
.apidoc-ic { font-size: .86em; background: var(--bg-subtle); border: 1px solid var(--border); border-radius: 5px; padding: 1px 5px; color: var(--text-1); word-break: break-word; }
.apidoc a { color: var(--accent); text-decoration: none; }
.apidoc a:hover { text-decoration: underline; }

.apidoc-toc { position: sticky; top: 16px; align-self: start; max-height: calc(100vh - 32px); overflow-y: auto; padding-top: 4px; }
.apidoc .apidoc-toc p { font-size: 11px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; color: var(--accent); margin: 22px 0 4px 10px; }
.apidoc .apidoc-toc > div:first-child p { margin-top: 0; }
.apidoc-toc button { display: flex; align-items: center; gap: 8px; width: 100%; text-align: left; background: none; border: none; cursor: pointer;
  color: var(--text-3); font: inherit; font-size: 13px; padding: 5px 10px; border-radius: 7px; }
.apidoc-toc button:hover { background: var(--bg-subtle); }

.apidoc-main { min-width: 0; padding-bottom: 40px; }
.apidoc-hero { padding-bottom: 22px; border-bottom: 1px solid var(--border); }
.apidoc-eyebrow { font-size: 12px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--accent); margin: 0; }
.apidoc h1 { font-size: 28px; line-height: 1.15; letter-spacing: -.02em; margin: 8px 0 10px; font-weight: 700; color: var(--text-1); }
.apidoc-lead { font-size: 15.5px; color: var(--text-3); max-width: 700px; margin: 0; }
.apidoc-meta { display: flex; flex-wrap: wrap; gap: 6px 18px; margin-top: 14px; font-size: 12.5px; color: var(--text-muted); }

.apidoc-share { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 20px; padding: 12px 14px; border-radius: 12px;
  background: var(--accent-weak); border: 1px solid color-mix(in srgb, var(--accent) 25%, transparent); }
.apidoc-share strong { display: block; font-size: 13.5px; color: var(--text-1); }
.apidoc-share span { display: block; font-size: 12.5px; color: var(--text-muted); }
.apidoc-keys { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 12px; font-size: 12.5px; color: var(--text-muted); }

.apidoc-btn { display: inline-flex; align-items: center; gap: 5px; font: inherit; font-size: 12.5px; font-weight: 600; color: var(--text-3);
  background: var(--bg-card); border: 1px solid var(--border-in); border-radius: 7px; padding: 6px 11px; cursor: pointer; text-decoration: none !important; }
.apidoc-btn:hover { color: var(--text-1); }

.apidoc section { padding-top: 34px; scroll-margin-top: 16px; }
.apidoc h2 { font-size: 20px; letter-spacing: -.01em; margin: 0 0 6px; font-weight: 700; color: var(--text-1); }
.apidoc h3 { font-size: 15px; margin: 22px 0 8px; font-weight: 650; color: var(--text-1); }
.apidoc p { margin: 0 0 12px; color: var(--text-3); }
.apidoc ul, .apidoc ol { color: var(--text-3); padding-left: 20px; margin: 0 0 12px; }
.apidoc li { margin: 4px 0; }
.apidoc strong { color: var(--text-1); }

.apidoc-baseurl { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; margin: 12px 0; }
.apidoc-baseurl .label { font-size: 11.5px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: .06em; }
.apidoc-baseurl code { font-size: 14px; font-weight: 500; flex: 1; min-width: 0; word-break: break-all; color: var(--text-1); }

.apidoc-callout { border-radius: 10px; padding: 12px 16px; margin: 14px 0; font-size: 13.5px; color: var(--text-2); }
.apidoc-callout.warn { background: var(--warning-weak); border: 1px solid color-mix(in srgb, var(--warning) 30%, transparent); }

.apidoc-endpoint { background: var(--bg-card); border: 1px solid var(--border); border-radius: 14px; margin: 14px 0 8px; overflow: hidden; }
.apidoc-endpoint-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 12px 16px; border-bottom: 1px solid var(--border); background: var(--bg-subtle); }
.apidoc-endpoint-body { padding: 14px 16px 4px; }
.apidoc-method { font-weight: 600; font-size: 11.5px; line-height: 1; padding: 5px 8px; border-radius: 6px; letter-spacing: .03em; }
.apidoc-method.get { color: var(--get); background: var(--get-bg); }
.apidoc-method.post { color: var(--post); background: var(--post-bg); }
.apidoc-path { font-weight: 500; font-size: 14px; color: var(--text-1); word-break: break-all; }

.apidoc-table { overflow-x: auto; border: 1px solid var(--border); border-radius: 10px; margin: 10px 0 14px; background: var(--bg-card); }
.apidoc table { width: 100%; border-collapse: collapse; font-size: 13px; }
.apidoc th { text-align: left; font-size: 11px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--text-muted); background: var(--bg-subtle); padding: 8px 12px; border-bottom: 1px solid var(--border); white-space: nowrap; }
.apidoc td { padding: 9px 12px; border-bottom: 1px solid var(--border); vertical-align: top; color: var(--text-3); }
.apidoc tr:last-child td { border-bottom: none; }
.apidoc td:first-child .apidoc-ic { white-space: nowrap; }
.apidoc-req { font-size: 10.5px; font-weight: 600; color: var(--danger); margin-left: 6px; white-space: nowrap; }
.apidoc-opt { font-size: 10.5px; color: var(--text-muted); margin-left: 6px; white-space: nowrap; }
.apidoc .type { font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 12px; color: var(--text-muted); white-space: nowrap; }
.apidoc .status { font-family: "JetBrains Mono", ui-monospace, monospace; font-weight: 600; font-size: 12.5px; white-space: nowrap; }
.apidoc .s2 { color: var(--get); } .apidoc .s4 { color: var(--warning); } .apidoc .s5 { color: var(--danger); }

.apidoc-code { background: var(--code-bg); border-radius: 10px; margin: 10px 0 14px; overflow: hidden; }
.apidoc-code-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 6px 8px 6px 14px; border-bottom: 1px solid rgba(255,255,255,.07); }
.apidoc-code-head > span { font-size: 11.5px; color: var(--code-muted); font-weight: 500; letter-spacing: .03em; }
.apidoc-copy { display: inline-flex; align-items: center; gap: 4px; font: inherit; font-size: 11.5px; font-weight: 500; color: var(--code-muted);
  background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.10); border-radius: 6px; padding: 4px 9px; cursor: pointer; white-space: nowrap; }
.apidoc-copy:hover { color: #fff; }
.apidoc pre { margin: 0; padding: 13px 16px; overflow-x: auto; color: var(--code-text); font-size: 12.5px; line-height: 1.6; }
.apidoc pre .k { color: var(--code-key); } .apidoc pre .s { color: var(--code-str); } .apidoc pre .c { color: var(--code-muted); }

.apidoc-tabs { display: flex; gap: 4px; margin: 10px 0 -4px; flex-wrap: wrap; }
.apidoc-tab { font: inherit; font-size: 12.5px; font-weight: 500; border: 1px solid var(--border); background: var(--bg-card); color: var(--text-muted); border-radius: 7px; padding: 5px 11px; cursor: pointer; }
.apidoc-tab[aria-selected="true"] { color: var(--accent); border-color: var(--accent); background: var(--accent-weak); }

.apidoc-steps { counter-reset: s; list-style: none; padding: 0 !important; }
.apidoc-steps li { counter-increment: s; position: relative; padding: 2px 0 10px 40px; }
.apidoc-steps li::before { content: counter(s); position: absolute; left: 0; top: 0; width: 26px; height: 26px; border-radius: 50%; background: var(--accent-weak);
  color: var(--accent); font-weight: 600; font-size: 13px; display: flex; align-items: center; justify-content: center; }

.apidoc-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 14px 16px; margin: 12px 0; }
.apidoc .apidoc-muted { color: var(--text-muted); font-size: 13px; margin: 0; }
.apidoc-keyrow + .apidoc-keyrow { border-top: 1px solid var(--border); margin-top: 12px; padding-top: 12px; }
.apidoc-keyrow-label { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; font-size: 13.5px; }
.apidoc-keyrow-value { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.apidoc-keyrow-value > code { flex: 1; min-width: 180px; font-size: 12.5px; padding: 7px 10px; border-radius: 7px; background: var(--bg-subtle); border: 1px solid var(--border); color: var(--text-2); word-break: break-all; }
.apidoc-statusline { display: flex; align-items: center; gap: 10px; font-size: 13.5px; color: var(--text-3); }
.apidoc-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.apidoc-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 14px; }
.apidoc-btn:disabled { opacity: .6; cursor: not-allowed; }
.apidoc-btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.apidoc-btn.primary:hover { color: #fff; filter: brightness(1.05); }
.apidoc-label { display: block; font-size: 12px; font-weight: 600; color: var(--text-3); margin-bottom: 6px; }
.apidoc-input { width: 100%; font: inherit; font-size: 13px; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--border-in); background: var(--bg-input); color: var(--text-2); outline: none; }
textarea.apidoc-input { font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 12px; resize: vertical; }
select.apidoc-input { width: auto; }
.apidoc-callout.ok { background: var(--success-weak); border: 1px solid color-mix(in srgb, var(--success) 30%, transparent); }
.apidoc-callout.err { background: var(--danger-weak); border: 1px solid color-mix(in srgb, var(--danger) 30%, transparent); word-break: break-word; }
.apidoc-link { background: none; border: none; padding: 0; font: inherit; color: var(--accent); cursor: pointer; }
.apidoc-link:hover { text-decoration: underline; }

@media (max-width: 900px) {
  .apidoc { grid-template-columns: 1fr; gap: 0; }
  .apidoc-toc { display: none; }
}
`
