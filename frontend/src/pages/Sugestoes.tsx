import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, Circle, History, Image as ImageIcon, ImagePlus, Loader, Pencil, Send, Trash2, X } from 'lucide-react'
import api from '../api'
import { useTheme } from '../ThemeContext'
import { parseUTC } from '../utils/date'
import SinoSlot, { VerComoSlot } from '../components/SinoSlot'

type Status = 'pendente' | 'andamento' | 'concluido'

interface Imagem { id: string; nome: string; tipo: string; tamanho: number; url: string }
interface Evento { acao: 'criada' | 'editada' | 'status'; detalhe: string | null; por: string | null; em: string | null }
interface Sugestao {
  id: string
  texto: string
  status: Status
  autor: string | null
  criado_em: string | null
  editado_em: string | null
  status_em: string | null
  status_por: string | null
  pode_editar: boolean
  imagens: Imagem[]
  historico: Evento[]
}
interface ListaResp { is_admin: boolean; contagem: Record<Status, number>; sugestoes: Sugestao[] }

const STATUS_CFG: { key: Status; label: string; color: string; bg: string; Icon: typeof Circle }[] = [
  { key: 'pendente', label: 'Pendente', color: '#B45309', bg: 'var(--warning-weak)', Icon: Circle },
  { key: 'andamento', label: 'Em andamento', color: '#2563EB', bg: 'var(--accent-weak)', Icon: Loader },
  { key: 'concluido', label: 'Concluído', color: '#059669', bg: 'var(--success-weak)', Icon: CheckCircle2 },
]
const MAX_IMAGENS = 5
const MAX_BYTES = 10 * 1024 * 1024
const ACAO_LABEL: Record<Evento['acao'], string> = { criada: 'criou', editada: 'editou', status: 'mudou o status' }

const fmtQuando = (iso: string | null) => {
  if (!iso) return '—'
  const d = new Date(parseUTC(iso))
  return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}
const errMsg = (err: unknown, fallback: string) => {
  const d = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  return typeof d === 'string' ? d : fallback
}
// valida no navegador antes de enviar (o backend valida de novo)
function validarArquivos(files: File[], jaTem: number): string | null {
  if (jaTem + files.length > MAX_IMAGENS) return `No máximo ${MAX_IMAGENS} imagens por sugestão.`
  const ruim = files.find(f => !['image/jpeg', 'image/png'].includes(f.type))
  if (ruim) return `"${ruim.name}" não é JPEG nem PNG.`
  const grande = files.find(f => f.size > MAX_BYTES)
  if (grande) return `"${grande.name}" passa de 10 MB.`
  return null
}

const fmtTamanho = (b: number) => b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} KB`
const fmtTipo = (tipo: string, nome: string) => (tipo === 'image/png' || nome.toLowerCase().endsWith('.png')) ? 'PNG' : 'JPG'

// Anexo em linha compacta (nome · tipo · tamanho): clicar abre a imagem
// ampliada; o × (quando pode) remove. Usado nos cards e antes de enviar.
function AnexoLinha({ nome, tipo, tamanho, onAbrir, onRemover }: {
  nome: string; tipo: string; tamanho: number; onAbrir: () => void; onRemover?: () => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 9, border: '1px solid var(--border-lt)', background: 'var(--bg-subtle)', maxWidth: 520 }}>
      <ImageIcon size={15} style={{ flexShrink: 0, color: 'var(--accent)' }} />
      <button onClick={onAbrir} title="Abrir imagem"
        style={{ flex: 1, minWidth: 0, padding: 0, border: 'none', background: 'none', textAlign: 'left', cursor: 'zoom-in', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: 'var(--accent)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {nome}
      </button>
      <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>{fmtTipo(tipo, nome)}</span>
      <span style={{ flexShrink: 0, fontSize: 11, color: 'var(--text-subtle)', minWidth: 48, textAlign: 'right' }}>{fmtTamanho(tamanho)}</span>
      {onRemover && (
        <button onClick={onRemover} aria-label={`Remover ${nome}`} title="Remover"
          style={{ flexShrink: 0, display: 'flex', padding: 2, border: 'none', background: 'none', color: 'var(--text-subtle)', cursor: 'pointer' }}>
          <X size={14} />
        </button>
      )}
    </div>
  )
}

const card: React.CSSProperties = { background: 'var(--bg-card)', borderRadius: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }
const btnSec: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 9, cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-2)', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit' }
const btnPri: React.CSSProperties = { ...btnSec, border: 'none', background: '#2563EB', color: '#fff', fontWeight: 700 }
const textareaStyle: React.CSSProperties = { width: '100%', minHeight: 110, padding: '11px 13px', borderRadius: 10, border: '1px solid var(--border-in)', background: 'var(--bg-input)', color: 'var(--text-1)', fontSize: 13.5, lineHeight: 1.6, resize: 'vertical', fontFamily: 'inherit' }

export default function Sugestoes() {
  const { dark } = useTheme()
  const [status, setStatus] = useState<Status>('pendente')
  const [data, setData] = useState<ListaResp | null>(null)
  const [erro, setErro] = useState('')
  // nova sugestão
  const [texto, setTexto] = useState('')
  const [arquivos, setArquivos] = useState<File[]>([])
  const [enviando, setEnviando] = useState(false)
  const [erroNova, setErroNova] = useState('')
  const inputNova = useRef<HTMLInputElement>(null)
  const [ampliada, setAmpliada] = useState<string | null>(null)

  const load = useCallback(() => {
    api.get<ListaResp>('/api/v1/sugestoes', { params: { status } })
      .then(r => { setData(r.data); setErro('') })
      .catch(err => setErro(errMsg(err, 'Não foi possível carregar as sugestões.')))
  }, [status])

  useEffect(() => { load() }, [load])

  // miniaturas locais das imagens escolhidas, antes de enviar
  const [previews, setPreviews] = useState<string[]>([])
  useEffect(() => {
    const urls = arquivos.map(f => URL.createObjectURL(f))
    setPreviews(urls)
    return () => urls.forEach(u => URL.revokeObjectURL(u))
  }, [arquivos])

  function escolherArquivos(files: FileList | null) {
    const lista = Array.from(files ?? [])
    if (!lista.length) return
    const problema = validarArquivos(lista, arquivos.length)
    if (problema) { setErroNova(problema); return }
    setErroNova('')
    setArquivos(a => [...a, ...lista])
  }

  function enviar() {
    if (!texto.trim()) return
    setEnviando(true); setErroNova('')
    const fd = new FormData()
    fd.append('texto', texto)
    arquivos.forEach(f => fd.append('imagens', f))
    api.post('/api/v1/sugestoes', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      .then(() => {
        setTexto(''); setArquivos([])
        if (status === 'pendente') load(); else setStatus('pendente')
      })
      .catch(err => setErroNova(errMsg(err, 'Não foi possível enviar a sugestão.')))
      .finally(() => setEnviando(false))
  }

  function substituir(s: Sugestao) {
    // depois de mudar o status a sugestão sai desta lista; o resto só atualiza
    if (s.status !== status) load()
    else setData(d => d ? { ...d, sugestoes: d.sugestoes.map(x => x.id === s.id ? s : x) } : d)
  }

  const contagem = data?.contagem

  return (
    <main className="px-4 md:px-8 xl:px-12 py-6 flex flex-col gap-5" style={{ background: dark ? 'transparent' : '#EEF1F5', minHeight: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-2)', margin: 0 }}>Sugestões</h1>
          <p style={{ fontSize: 13, color: 'var(--text-subtle)', marginTop: 3 }}>
            Ideias e pedidos de melhoria para o o2 Sig. Acompanhe o andamento de cada uma.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <VerComoSlot />
          <SinoSlot />
        </div>
      </div>

      {/* nova sugestão */}
      <div style={{ ...card, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label htmlFor="nova-sugestao" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>Nova sugestão</label>
        <textarea
          id="nova-sugestao" value={texto} onChange={e => setTexto(e.target.value)}
          placeholder="Descreva o que você precisa, onde no sistema e por quê. Se ajudar, anexe prints de exemplo."
          style={textareaStyle}
        />
        {arquivos.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {arquivos.map((f, i) => (
              <AnexoLinha key={previews[i] ?? f.name + i} nome={f.name} tipo={f.type} tamanho={f.size}
                onAbrir={() => previews[i] && setAmpliada(previews[i])}
                onRemover={() => setArquivos(a => a.filter((_, j) => j !== i))} />
            ))}
          </div>
        )}
        {erroNova && <p style={{ margin: 0, fontSize: 12.5, color: 'var(--danger)' }}>{erroNova}</p>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <input ref={inputNova} type="file" accept="image/png,image/jpeg" multiple hidden onChange={e => { escolherArquivos(e.target.files); e.target.value = '' }} />
          <button onClick={() => inputNova.current?.click()} disabled={arquivos.length >= MAX_IMAGENS} style={{ ...btnSec, opacity: arquivos.length >= MAX_IMAGENS ? 0.5 : 1 }}>
            <ImagePlus size={14} /> Anexar imagem
          </button>
          <span style={{ fontSize: 11.5, color: 'var(--text-subtle)' }}>JPEG ou PNG · até {MAX_IMAGENS} · 10 MB cada</span>
          <button onClick={enviar} disabled={enviando || !texto.trim()} style={{ ...btnPri, marginLeft: 'auto', opacity: enviando || !texto.trim() ? 0.5 : 1, cursor: enviando || !texto.trim() ? 'not-allowed' : 'pointer' }}>
            <Send size={13} /> {enviando ? 'Enviando…' : 'Enviar sugestão'}
          </button>
        </div>
      </div>

      {/* filtro por status */}
      <div role="tablist" aria-label="Status das sugestões" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {STATUS_CFG.map(c => {
          const ativo = status === c.key
          return (
            <button key={c.key} role="tab" aria-selected={ativo} onClick={() => setStatus(c.key)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 15px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
                border: `1px solid ${ativo ? c.color : 'var(--border)'}`, background: ativo ? c.bg : 'var(--bg-card)', color: ativo ? c.color : 'var(--text-2)', fontSize: 13, fontWeight: 700 }}>
              <c.Icon size={14} /> {c.label}
              <span style={{ fontSize: 11.5, fontWeight: 700, padding: '1px 8px', borderRadius: 999, background: ativo ? 'var(--bg-card)' : 'var(--bg-subtle)', color: ativo ? c.color : 'var(--text-muted)' }}>{contagem?.[c.key] ?? '–'}</span>
            </button>
          )
        })}
      </div>

      {erro && <p style={{ margin: 0, fontSize: 13, color: 'var(--danger)' }}>{erro}</p>}

      {!data ? (
        <p style={{ fontSize: 13, color: 'var(--text-subtle)' }}>Carregando…</p>
      ) : data.sugestoes.length === 0 ? (
        <div style={{ ...card, padding: '28px 18px', textAlign: 'center', fontSize: 13, color: 'var(--text-subtle)' }}>
          Nenhuma sugestão {STATUS_CFG.find(c => c.key === status)!.label.toLowerCase()}.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {data.sugestoes.map(s => (
            <SugestaoCard key={s.id} s={s} isAdmin={data.is_admin} onChange={substituir} onRemovida={load} onAmpliar={setAmpliada} />
          ))}
        </div>
      )}

      {ampliada && (
        <div role="dialog" aria-label="Imagem ampliada" onClick={() => setAmpliada(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, cursor: 'zoom-out' }}>
          <img src={ampliada} alt="" style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 10, boxShadow: '0 20px 50px rgba(0,0,0,0.4)' }} />
        </div>
      )}
    </main>
  )
}

function SugestaoCard({ s, isAdmin, onChange, onRemovida, onAmpliar }: {
  s: Sugestao; isAdmin: boolean
  onChange: (s: Sugestao) => void; onRemovida: () => void; onAmpliar: (url: string) => void
}) {
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState(s.texto)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')
  const [histAberto, setHistAberto] = useState(false)
  const inputImg = useRef<HTMLInputElement>(null)
  const cfg = STATUS_CFG.find(c => c.key === s.status)!

  function acao(p: Promise<{ data: Sugestao }>, fallback: string, depois?: () => void) {
    setOcupado(true); setErro('')
    p.then(r => { onChange(r.data); depois?.() })
      .catch(err => setErro(errMsg(err, fallback)))
      .finally(() => setOcupado(false))
  }

  function salvarTexto() {
    if (!texto.trim()) return
    acao(api.put<Sugestao>(`/api/v1/sugestoes/${s.id}`, { texto }), 'Não foi possível salvar.', () => setEditando(false))
  }

  function adicionarImagens(files: FileList | null) {
    const lista = Array.from(files ?? [])
    if (!lista.length) return
    const problema = validarArquivos(lista, s.imagens.length)
    if (problema) { setErro(problema); return }
    const fd = new FormData()
    lista.forEach(f => fd.append('imagens', f))
    acao(api.post<Sugestao>(`/api/v1/sugestoes/${s.id}/imagens`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }), 'Não foi possível anexar.')
  }

  function excluir() {
    if (!window.confirm('Excluir esta sugestão? As imagens e o histórico também saem, e não dá para desfazer.')) return
    setOcupado(true); setErro('')
    api.delete(`/api/v1/sugestoes/${s.id}`)
      .then(onRemovida)
      .catch(err => { setErro(errMsg(err, 'Não foi possível excluir.')); setOcupado(false) })
  }

  return (
    <div style={{ ...card, padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10, opacity: ocupado ? 0.7 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, color: 'var(--text-subtle)' }}>
          <b style={{ fontWeight: 700, color: 'var(--text-1)' }}>{s.autor ?? '—'}</b> · {fmtQuando(s.criado_em)}
          {s.editado_em && <span style={{ fontStyle: 'italic' }}> · editada</span>}
        </span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: cfg.bg, color: cfg.color }}>
          <cfg.Icon size={12} /> {cfg.label}
        </span>
      </div>

      {editando ? (
        <textarea value={texto} onChange={e => setTexto(e.target.value)} aria-label="Editar sugestão" autoFocus style={textareaStyle} />
      ) : (
        <div style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--text-2)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{s.texto}</div>
      )}

      {s.imagens.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {s.imagens.map(img => (
            <AnexoLinha key={img.id} nome={img.nome} tipo={img.tipo} tamanho={img.tamanho}
              onAbrir={() => onAmpliar(img.url)}
              onRemover={s.pode_editar
                ? () => { if (window.confirm('Remover esta imagem?')) acao(api.delete<Sugestao>(`/api/v1/sugestoes/${s.id}/imagens/${img.id}`), 'Não foi possível remover.') }
                : undefined} />
          ))}
        </div>
      )}

      {erro && <p style={{ margin: 0, fontSize: 12.5, color: 'var(--danger)' }}>{erro}</p>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', borderTop: '1px solid var(--border-lt)', paddingTop: 10 }}>
        {editando ? (
          <>
            <button onClick={salvarTexto} disabled={ocupado || !texto.trim()} style={{ ...btnPri, opacity: ocupado || !texto.trim() ? 0.5 : 1 }}>Salvar</button>
            <button onClick={() => { setEditando(false); setTexto(s.texto); setErro('') }} style={btnSec}>Cancelar</button>
          </>
        ) : (
          <>
            {s.pode_editar && <button onClick={() => { setTexto(s.texto); setEditando(true) }} style={btnSec}><Pencil size={13} /> Editar</button>}
            {s.pode_editar && s.imagens.length < MAX_IMAGENS && (
              <>
                <input ref={inputImg} type="file" accept="image/png,image/jpeg" multiple hidden onChange={e => { adicionarImagens(e.target.files); e.target.value = '' }} />
                <button onClick={() => inputImg.current?.click()} style={btnSec}><ImagePlus size={13} /> Anexar imagem</button>
              </>
            )}
            <button onClick={() => setHistAberto(h => !h)} aria-expanded={histAberto} style={btnSec}><History size={13} /> Histórico</button>
          </>
        )}

        {isAdmin && !editando && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11.5, color: 'var(--text-subtle)' }}>Mover para:</span>
            {STATUS_CFG.filter(c => c.key !== s.status).map(c => (
              <button key={c.key} disabled={ocupado}
                onClick={() => acao(api.patch<Sugestao>(`/api/v1/sugestoes/${s.id}/status`, { status: c.key }), 'Não foi possível mudar o status.')}
                style={{ ...btnSec, color: c.color, borderColor: c.color }}>
                <c.Icon size={13} /> {c.label}
              </button>
            ))}
            <button onClick={excluir} disabled={ocupado} aria-label="Excluir sugestão" title="Excluir sugestão" style={{ ...btnSec, color: 'var(--danger)' }}>
              <Trash2 size={13} />
            </button>
          </div>
        )}
      </div>

      {histAberto && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12, color: 'var(--text-2)' }}>
          {s.historico.map((e, i) => (
            <div key={i}>
              <b style={{ fontWeight: 600 }}>{e.por ?? '—'}</b> {ACAO_LABEL[e.acao]}{e.detalhe ? ` (${e.detalhe})` : ''}
              <span style={{ color: 'var(--text-subtle)' }}> · {fmtQuando(e.em)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
