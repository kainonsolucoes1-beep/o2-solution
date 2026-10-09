import { useCallback, useEffect, useMemo, useState } from 'react'
import { Archive, ArchiveRestore, Check, Copy, History, Pencil, Plus, RotateCcw, Save, Search, X } from 'lucide-react'
import api from '../api'
import { useTheme } from '../ThemeContext'
import { parseUTC } from '../utils/date'

interface Script {
  id: string
  titulo: string
  categoria: string
  conteudo: string
  versao: number
  arquivado: boolean
  criado_por: string | null
  criado_em: string | null
  atualizado_por: string | null
  atualizado_em: string | null
}

interface Versao {
  id: string
  versao: number
  acao: 'criado' | 'editado' | 'restaurado' | 'arquivado' | 'reativado'
  detalhe: string | null
  titulo: string
  categoria: string
  conteudo: string
  por: string | null
  em: string | null
}

interface ListaResp { pode_editar: boolean; is_admin: boolean; scripts: Script[] }

const ACAO_LABEL: Record<Versao['acao'], string> = {
  criado: 'Criou', editado: 'Editou', restaurado: 'Restaurou', arquivado: 'Arquivou', reativado: 'Reativou',
}
const SUGESTOES = ['Abordagem', 'Follow-up', 'Objeções', 'WhatsApp', 'Fechamento']
const NOVO = '__novo__'

const fmtQuando = (iso: string | null) => {
  if (!iso) return '—'
  const d = new Date(parseUTC(iso))
  return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

// mensagem do backend: string, ou {msg} no conflito de edição (409)
const errMsg = (err: unknown, fallback: string) => {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (detail && typeof detail === 'object' && 'msg' in detail) return String((detail as { msg: string }).msg)
  return fallback
}

const card: React.CSSProperties = { background: 'var(--bg-card)', borderRadius: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }
const input: React.CSSProperties = { padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border-in)', fontSize: 13, color: 'var(--text-1)', background: 'var(--bg-input)', fontFamily: 'inherit' }
const btnSec: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 13px', borderRadius: 9, cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-2)', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit' }
const btnPri: React.CSSProperties = { ...btnSec, border: 'none', background: '#2563EB', color: '#fff', fontWeight: 700 }

export default function Scripts() {
  const { dark } = useTheme()
  const [data, setData] = useState<ListaResp | null>(null)
  const [arquivados, setArquivados] = useState(false)
  const [busca, setBusca] = useState('')
  const [categoria, setCategoria] = useState<string | null>(null)
  const [selId, setSelId] = useState<string | null>(null)
  const [editando, setEditando] = useState(false)
  const [form, setForm] = useState({ titulo: '', categoria: '', conteudo: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [conflito, setConflito] = useState(false)
  const [copied, setCopied] = useState(false)
  const [historico, setHistorico] = useState<Versao[] | null>(null)
  const [histAberto, setHistAberto] = useState(false)
  const [versaoAberta, setVersaoAberta] = useState<string | null>(null)

  const load = useCallback((manterSel?: string | null) => {
    api.get<ListaResp>('/api/v1/scripts', { params: arquivados ? { arquivados: true } : {} })
      .then(r => {
        setData(r.data)
        if (manterSel !== undefined) setSelId(manterSel)
      })
      .catch(err => setError(errMsg(err, 'Não foi possível carregar os scripts.')))
  }, [arquivados])

  useEffect(() => { load(null) }, [load])

  const scripts = data?.scripts ?? []
  const sel = scripts.find(s => s.id === selId) ?? null
  const categorias = useMemo(() => [...new Set(scripts.map(s => s.categoria))].sort((a, b) => a.localeCompare(b)), [scripts])
  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return scripts.filter(s =>
      (!categoria || s.categoria === categoria) &&
      (!q || s.titulo.toLowerCase().includes(q) || s.conteudo.toLowerCase().includes(q) || s.categoria.toLowerCase().includes(q)),
    )
  }, [scripts, busca, categoria])
  const grupos = useMemo(() => {
    const m = new Map<string, Script[]>()
    for (const s of filtrados) m.set(s.categoria, [...(m.get(s.categoria) ?? []), s])
    return [...m.entries()]
  }, [filtrados])

  // troca de script/modo: limpa estado da tela da direita
  useEffect(() => {
    setCopied(false); setError(''); setConflito(false)
    setHistAberto(false); setHistorico(null); setVersaoAberta(null)
    if (selId === NOVO) { setEditando(true); setForm({ titulo: '', categoria: categoria ?? '', conteudo: '' }) }
    else setEditando(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selId])

  function abrirEdicao() {
    if (!sel) return
    setForm({ titulo: sel.titulo, categoria: sel.categoria, conteudo: sel.conteudo })
    setError(''); setConflito(false); setEditando(true)
  }

  function salvar() {
    setSaving(true); setError(''); setConflito(false)
    const req = selId === NOVO
      ? api.post<Script>('/api/v1/scripts', form)
      : api.put<Script>(`/api/v1/scripts/${selId}`, { ...form, versao: sel?.versao })
    req
      .then(r => { setEditando(false); load(r.data.id) })
      .catch(err => {
        if (err?.response?.status === 409) setConflito(true)
        setError(errMsg(err, 'Não foi possível salvar o script.'))
      })
      .finally(() => setSaving(false))
  }

  function acao(path: 'arquivar' | 'reativar') {
    if (!sel) return
    if (path === 'arquivar' && !window.confirm(`Arquivar "${sel.titulo}"? Ele sai da lista, mas fica guardado com o histórico.`)) return
    setError('')
    api.post(`/api/v1/scripts/${sel.id}/${path}`)
      .then(() => load(null))
      .catch(err => setError(errMsg(err, 'Não foi possível concluir.')))
  }

  function carregarHistorico(id: string) {
    api.get<Versao[]>(`/api/v1/scripts/${id}/historico`)
      .then(r => setHistorico(r.data))
      .catch(err => setError(errMsg(err, 'Não foi possível carregar o histórico.')))
  }

  function toggleHistorico() {
    if (!sel) return
    const abrir = !histAberto
    setHistAberto(abrir)
    if (abrir) carregarHistorico(sel.id)
  }

  function restaurar(v: Versao) {
    if (!sel || !window.confirm(`Restaurar a versão ${v.versao}? O texto atual vira histórico e essa versão passa a valer.`)) return
    setError(''); setConflito(false)
    api.post<Script>(`/api/v1/scripts/${sel.id}/restaurar`, { versao_id: v.id, versao: sel.versao })
      .then(r => { load(r.data.id); carregarHistorico(r.data.id); setVersaoAberta(null) })
      .catch(err => {
        if (err?.response?.status === 409) setConflito(true)
        setError(errMsg(err, 'Não foi possível restaurar a versão.'))
      })
  }

  function copiar() {
    if (!sel) return
    navigator.clipboard.writeText(sel.conteudo).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) }).catch(() => {})
  }

  const podeEditar = !!data?.pode_editar && !arquivados
  const formOk = form.titulo.trim() && form.categoria.trim() && form.conteudo.trim()
  const dirty = selId === NOVO || (!!sel && (form.titulo !== sel.titulo || form.categoria !== sel.categoria || form.conteudo !== sel.conteudo))

  return (
    <main className="px-4 md:px-8 xl:px-12 py-6 flex flex-col gap-5" style={{ background: dark ? 'transparent' : '#EEF1F5', minHeight: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-2)', margin: 0 }}>Scripts{arquivados ? ' · Arquivados' : ''}</h1>
          <p style={{ fontSize: 13, color: 'var(--text-subtle)', marginTop: 3 }}>
            Textos de atendimento da equipe. Toda criação e edição fica registrada no histórico.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {data?.is_admin && (
            <button onClick={() => setArquivados(a => !a)} style={btnSec}>
              {arquivados ? <><X size={13} /> Voltar aos ativos</> : <><Archive size={13} /> Ver arquivados</>}
            </button>
          )}
          {podeEditar && (
            <button onClick={() => setSelId(NOVO)} style={btnPri}><Plus size={14} /> Novo script</button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 360 }}>
          <Search size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-subtle)' }} />
          <input
            value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por título, texto ou categoria"
            aria-label="Buscar scripts" style={{ ...input, width: '100%', paddingLeft: 32 }}
          />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[null, ...categorias].map(c => {
            const ativo = categoria === c
            return (
              <button
                key={c ?? '__todas__'} onClick={() => setCategoria(c)} aria-pressed={ativo}
                style={{ padding: '6px 12px', borderRadius: 999, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                  border: `1px solid ${ativo ? 'var(--accent)' : 'var(--border)'}`, background: ativo ? 'var(--accent-weak)' : 'var(--bg-card)',
                  color: ativo ? 'var(--accent)' : 'var(--text-3b)' }}
              >{c ?? 'Todas'}</button>
            )
          })}
        </div>
      </div>

      {error && !selId && <p style={{ color: 'var(--danger)', fontSize: 13, margin: 0 }}>{error}</p>}

      <div className="grid grid-cols-1 md:grid-cols-[300px_1fr]" style={{ gap: 16, alignItems: 'start' }}>
        {/* Lista agrupada por categoria */}
        <div style={{ ...card, overflow: 'hidden' }}>
          {!data ? (
            <p style={{ fontSize: 12.5, color: 'var(--text-subtle)', padding: 16, margin: 0 }}>Carregando…</p>
          ) : grupos.length === 0 ? (
            <p style={{ fontSize: 12.5, color: 'var(--text-subtle)', padding: 16, margin: 0 }}>
              {scripts.length === 0 ? (arquivados ? 'Nenhum script arquivado.' : 'Nenhum script cadastrado ainda.') : 'Nenhum script encontrado.'}
            </p>
          ) : grupos.map(([cat, itens]) => (
            <div key={cat}>
              <p style={{ margin: 0, padding: '10px 16px 6px', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-subtle)', background: 'var(--bg-subtle)' }}>
                {cat} <span style={{ fontWeight: 600 }}>· {itens.length}</span>
              </p>
              {itens.map(s => (
                <button
                  key={s.id} onClick={() => setSelId(s.id)}
                  style={{ width: '100%', display: 'block', padding: '11px 16px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                    border: 'none', borderBottom: '1px solid var(--border-lt)', background: selId === s.id ? 'var(--accent-weak)' : 'transparent' }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600, color: selId === s.id ? 'var(--accent)' : 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.titulo}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-subtle)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>{s.conteudo}</div>
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Detalhe / edição */}
        <div style={{ ...card, padding: '18px 20px', minWidth: 0 }}>
          {editando ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {selId === NOVO ? 'Novo script' : `Editando · versão ${sel?.versao ?? ''}`}
              </p>
              <input value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} placeholder="Título do script" maxLength={150} aria-label="Título" style={{ ...input, fontSize: 14, fontWeight: 600 }} />
              <input value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))} placeholder="Categoria (ex.: Abordagem, Follow-up, Objeções)" maxLength={60} list="scripts-categorias" aria-label="Categoria" style={input} />
              <datalist id="scripts-categorias">
                {[...new Set([...categorias, ...SUGESTOES])].map(c => <option key={c} value={c} />)}
              </datalist>
              <textarea value={form.conteudo} onChange={e => setForm(f => ({ ...f, conteudo: e.target.value }))} placeholder="Texto do script…" aria-label="Texto" style={{ ...input, width: '100%', minHeight: 260, resize: 'vertical', lineHeight: 1.6 }} />
              {error && (
                <div style={{ fontSize: 12.5, color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  {error}
                  {conflito && <button onClick={() => { setEditando(false); load(selId) }} style={btnSec}><RotateCcw size={13} /> Ver a versão atual</button>}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={salvar} disabled={saving || !formOk || !dirty} style={{ ...btnPri, opacity: saving || !formOk || !dirty ? 0.5 : 1, cursor: saving || !formOk || !dirty ? 'not-allowed' : 'pointer' }}>
                  <Save size={13} /> {saving ? 'Salvando…' : 'Salvar'}
                </button>
                <button onClick={() => { if (selId === NOVO) setSelId(null); else { setEditando(false); setError(''); setConflito(false) } }} style={btnSec}>Cancelar</button>
              </div>
            </div>
          ) : !sel ? (
            <p style={{ fontSize: 13, color: 'var(--text-subtle)', textAlign: 'center', padding: '40px 0', margin: 0 }}>
              Selecione um script à esquerda{podeEditar ? ', ou crie um novo' : ''}.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--accent)' }}>{sel.categoria}</span>
                <h2 style={{ margin: '4px 0 0', fontSize: 18, fontWeight: 700, color: 'var(--text-1)' }}>{sel.titulo}</h2>
                <p style={{ margin: '6px 0 0', fontSize: 11.5, color: 'var(--text-subtle)', lineHeight: 1.6 }}>
                  Criado por <b style={{ fontWeight: 600, color: 'var(--text-3b)' }}>{sel.criado_por ?? '—'}</b> em {fmtQuando(sel.criado_em)}
                  {sel.versao > 1 && <> · última alteração por <b style={{ fontWeight: 600, color: 'var(--text-3b)' }}>{sel.atualizado_por ?? '—'}</b> em {fmtQuando(sel.atualizado_em)}</>}
                  {' '}· versão {sel.versao}
                </p>
              </div>

              <div style={{ whiteSpace: 'pre-wrap', fontSize: 13.5, lineHeight: 1.65, color: 'var(--text-2)', background: 'var(--bg-subtle)', borderRadius: 10, padding: '14px 16px', overflowWrap: 'anywhere' }}>
                {sel.conteudo}
              </div>

              {error && <p style={{ color: 'var(--danger)', fontSize: 12.5, margin: 0 }}>{error}</p>}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={copiar} style={{ ...btnSec, ...(copied ? { background: 'var(--success-weak)', color: 'var(--success)' } : {}) }}>
                  {copied ? <><Check size={13} /> Copiado!</> : <><Copy size={13} /> Copiar texto</>}
                </button>
                {podeEditar && <button onClick={abrirEdicao} style={btnSec}><Pencil size={13} /> Editar</button>}
                <button onClick={toggleHistorico} aria-expanded={histAberto} style={{ ...btnSec, ...(histAberto ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : {}) }}>
                  <History size={13} /> Histórico
                </button>
                {podeEditar && <button onClick={() => acao('arquivar')} style={{ ...btnSec, color: 'var(--danger)', marginLeft: 'auto' }}><Archive size={13} /> Arquivar</button>}
                {arquivados && data?.is_admin && <button onClick={() => acao('reativar')} style={{ ...btnPri, marginLeft: 'auto' }}><ArchiveRestore size={13} /> Reativar</button>}
              </div>

              {histAberto && (
                <div style={{ borderTop: '1px solid var(--border-lt)', paddingTop: 12 }}>
                  <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Histórico de alterações</p>
                  {!historico ? (
                    <p style={{ fontSize: 12.5, color: 'var(--text-subtle)', margin: 0 }}>Carregando…</p>
                  ) : historico.map(v => {
                    const aberto = versaoAberta === v.id
                    const atual = v.versao === sel.versao
                    return (
                      <div key={v.id} style={{ borderBottom: '1px solid var(--border-lt)', padding: '8px 0' }}>
                        <button
                          onClick={() => setVersaoAberta(aberto ? null : v.id)} aria-expanded={aberto}
                          style={{ width: '100%', display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}
                        >
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-subtle)', minWidth: 26 }}>v{v.versao}</span>
                          <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>
                            <b style={{ fontWeight: 600 }}>{v.por ?? '—'}</b> {v.detalhe ?? ACAO_LABEL[v.acao].toLowerCase()}
                          </span>
                          <span style={{ fontSize: 11.5, color: 'var(--text-subtle)' }}>{fmtQuando(v.em)}</span>
                          {atual && <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--success)' }}>ATUAL</span>}
                        </button>
                        {aberto && (
                          <div style={{ marginTop: 8, marginLeft: 34 }}>
                            <p style={{ margin: '0 0 6px', fontSize: 12, color: 'var(--text-3b)' }}><b style={{ fontWeight: 600 }}>{v.titulo}</b> · {v.categoria}</p>
                            <div style={{ whiteSpace: 'pre-wrap', fontSize: 12.5, lineHeight: 1.6, color: 'var(--text-2)', background: 'var(--bg-subtle)', borderRadius: 8, padding: '10px 12px', overflowWrap: 'anywhere' }}>{v.conteudo}</div>
                            {podeEditar && !atual && (
                              <button onClick={() => restaurar(v)} style={{ ...btnSec, marginTop: 8 }}><RotateCcw size={13} /> Restaurar esta versão</button>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
