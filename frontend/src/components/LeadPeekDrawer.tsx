import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { X, CalendarClock, Clock3, StickyNote, ArrowUpRight, RotateCcw, Plus, Pencil, Phone, MessageCircle, Copy, Check, Info, Activity } from 'lucide-react'
import api from '../api'
import { statusLabel } from '../utils/statusLabel'
import { reportStatusColor, reportPerceptionColor, tint, personColor } from '../utils/reportColors'
import { fmtDateShort } from '../utils/leadFormat'
import { parseUTC } from '../utils/date'
import EmissaoModal from './EmissaoModal'

interface PeekLead {
  id: string
  name: string
  phone: string | null
  email: string | null
  origem: string | null
  modalidade: string | null
  status: string | null
  perception: string | null
  value_potential: number | null
  created_at?: string | null
  retrabalhado_em?: string | null
  is_renutrucao?: boolean
  vidas?: number | null
  idades_resumo?: string | null
}

interface TimelineEvent {
  kind: 'status' | 'nota' | 'agendamento'
  at: string
  status?: string
  text?: string
  by?: string | null
  scheduled_at?: string | null
}

interface Peek {
  agendamento: string | null
  ultima_nota: { id: string; text: string; by: string | null; at: string | null; edited_by: string | null; pode_editar: boolean } | null
  pode_anotar: boolean
  timeline: TimelineEvent[]
  dias_sem_interacao: number | null
  dias_no_status: number | null
  dono_renutricao: string | null
  atendente: string | null
  ponto_conversao: string | null
  plano_atual: string | null
  operadoras: string[]
  retrabalhado_em: string | null
  lost_reason: string | null
}

function ago(iso: string | null): string {
  if (!iso) return '—'
  const days = Math.floor((Date.now() - parseUTC(iso)) / 86400000)
  if (days <= 0) return 'hoje'
  if (days === 1) return 'ontem'
  if (days < 30) return `há ${days} dias`
  const m = Math.floor(days / 30)
  return m < 12 ? `há ${m} ${m === 1 ? 'mês' : 'meses'}` : `há ${Math.floor(m / 12)} ano(s)`
}


function initials(name: string) {
  const p = name.trim().split(/\s+/)
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase()
}

function fmtBRL0(n: number | null) {
  if (n == null || n === 0) return null
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

// telefone pro WhatsApp: só dígitos, com 55 na frente quando vier só DDD + número
function waNumber(phone: string | null): string | null {
  const d = (phone ?? '').replace(/\D/g, '')
  if (d.length < 10) return null
  return d.length <= 11 ? `55${d}` : d
}

const LABEL: CSSProperties = { fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-subtle)' }
const LINK_BTN: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 4px', border: 'none', background: 'none', color: 'var(--accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }
const NAV_BTN: CSSProperties = { width: 28, height: 28, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }

interface Props {
  lead: PeekLead
  onClose: () => void
  onOpenFull: () => void
  // navegação pela lista do relatório (opcional)
  position?: { index: number; total: number }
  onPrev?: () => void
  onNext?: () => void
  navLoading?: boolean
  // avisa a tela de origem (ex.: tabela do relatório) que o status mudou
  onStatusChanged?: (leadId: string, status: string) => void
}

// Trocar status pelo painel (10/11/2026) -- mesmas opções e submenus da ficha
// (LeadNextStepPanel): Fechado pergunta o tipo, Perdido pede o motivo e Emissão
// abre a mesma janela da operadora.
const STATUS_OPCOES = [
  { value: 'novo', label: 'Novo' },
  { value: 'aguardando_dados', label: 'Aguardando dados' },
  { value: 'sem_retorno', label: 'Sem retorno' },
  { value: 'proposta', label: 'Proposta' },
  { value: 'pendencia', label: 'Pendência' },
  { value: 'documentacao_pendente', label: 'Aguardando documentação' },
  { value: 'emissao', label: 'Emissão' },
  { value: 'fechado', label: 'Fechado' },
  { value: 'convertido', label: 'Convertido' },
  { value: 'sale_not_performed', label: 'Perdido' },
]
const FECHADO_OPCOES = [
  { value: 'waiting_billing', label: 'Aguardando faturamento' },
  { value: 'sale_performed', label: 'Venda realizada' },
]
const MOTIVOS_PERDA = [
  'Cliente não retornou contato', 'Trocou de número', 'Declinou', 'Finalizado automaticamente',
  'Localização', 'Preço', 'Sem interesse', 'Sem perfil', 'Sem retorno',
]

export default function LeadPeekDrawer({ lead, onClose, onOpenFull, onPrev, onNext, onStatusChanged }: Props) {
  const [peek, setPeek] = useState<Peek | null>(null)
  const [loading, setLoading] = useState(true)
  const [entered, setEntered] = useState(false)
  // anotar/editar sem abrir a ficha: 'nova' = nota nova, 'editar' = última nota
  const [notaModo, setNotaModo] = useState<'nova' | 'editar' | null>(null)
  const [notaTexto, setNotaTexto] = useState('')
  const [notaSalvando, setNotaSalvando] = useState(false)
  const [notaErro, setNotaErro] = useState('')
  const [tlTodos, setTlTodos] = useState(false)
  const [copiado, setCopiado] = useState(false)
  // troca de status pelo painel
  const [statusLocal, setStatusLocal] = useState<string | null>(null)
  const [statusMenu, setStatusMenu] = useState<null | 'opcoes' | 'fechado' | 'perdido'>(null)
  const [emissaoOpen, setEmissaoOpen] = useState(false)
  const [statusSalvando, setStatusSalvando] = useState(false)
  const [statusErro, setStatusErro] = useState('')
  const bodyRef = useRef<HTMLDivElement>(null)

  // atalhos sempre com as funções da renderização mais recente
  const keysRef = useRef({ notaModo, onClose, onPrev, onNext })
  keysRef.current = { notaModo, onClose, onPrev, onNext }

  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true))
    const onKey = (e: KeyboardEvent) => {
      const k = keysRef.current
      const tag = (e.target as HTMLElement | null)?.tagName
      const digitando = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
      if (e.key === 'Escape') {
        // Esc com o campo de anotação aberto só fecha o campo, não o painel
        if (k.notaModo) { setNotaModo(null); setNotaErro('') } else k.onClose()
        return
      }
      if (digitando) return
      if ((e.key === 'ArrowDown' || e.key === 'j') && k.onNext) { e.preventDefault(); k.onNext() }
      if ((e.key === 'ArrowUp' || e.key === 'k') && k.onPrev) { e.preventDefault(); k.onPrev() }
    }
    document.addEventListener('keydown', onKey)
    return () => { cancelAnimationFrame(raf); document.removeEventListener('keydown', onKey) }
  }, [])

  const carregar = useCallback((silencioso = false) => {
    let alive = true
    if (!silencioso) setLoading(true)
    api.get<Peek>(`/api/v1/leads/${lead.id}/peek`)
      .then(r => { if (alive) setPeek(r.data) })
      .catch(() => { if (alive && !silencioso) setPeek(null) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [lead.id])

  useEffect(() => carregar(), [carregar])

  // trocou de lead (anterior/próximo): volta pro topo e fecha o que estava aberto
  useEffect(() => {
    setNotaModo(null); setNotaErro(''); setTlTodos(false); setCopiado(false)
    setStatusLocal(null); setStatusMenu(null); setEmissaoOpen(false); setStatusErro('')
    bodyRef.current?.scrollTo({ top: 0 })
  }, [lead.id])

  function mudarStatus(value: string, lostReason?: string, extra?: Record<string, unknown>) {
    setStatusSalvando(true)
    setStatusErro('')
    api.post(`/api/v1/leads/${lead.id}/status`, { status: value, ...(lostReason ? { lost_reason: lostReason } : {}), ...(extra ?? {}) })
      .then(() => {
        setStatusLocal(value)
        setStatusMenu(null)
        setEmissaoOpen(false)
        onStatusChanged?.(lead.id, value)
        carregar(true)
      })
      .catch(err => {
        const d = err?.response?.data?.detail
        setStatusErro(typeof d === 'string' ? d : 'Não foi possível alterar o status.')
      })
      .finally(() => setStatusSalvando(false))
  }

  function escolherStatus(value: string) {
    if (value === 'fechado') { setStatusMenu('fechado'); return }
    if (value === 'sale_not_performed') { setStatusMenu('perdido'); return }
    if (value === 'emissao') { setEmissaoOpen(true); return }
    mudarStatus(value)
  }

  function abrirNota(modo: 'nova' | 'editar') {
    setNotaModo(modo)
    setNotaTexto(modo === 'editar' ? (peek?.ultima_nota?.text ?? '') : '')
    setNotaErro('')
  }

  function salvarNota() {
    const content = notaTexto.trim()
    if (!content || !notaModo) return
    setNotaSalvando(true)
    setNotaErro('')
    const req = notaModo === 'editar' && peek?.ultima_nota
      ? api.patch(`/api/v1/leads/${lead.id}/notes/${peek.ultima_nota.id}`, { content })
      : api.post(`/api/v1/leads/${lead.id}/notes`, { content })
    req
      .then(res => {
        // nota nova em Novo / Sem retorno / Aguardando dados leva o lead pra Agendado
        const st = (res?.data as { status_atualizado?: string | null } | undefined)?.status_atualizado
        if (st) { setStatusLocal(st); onStatusChanged?.(lead.id, st) }
        setNotaModo(null); setNotaTexto(''); carregar(true)
      })
      .catch(err => {
        const d = err?.response?.data?.detail
        setNotaErro(typeof d === 'string' ? d : 'Não foi possível salvar a anotação.')
      })
      .finally(() => setNotaSalvando(false))
  }

  function copiarTelefone() {
    if (!lead.phone) return
    navigator.clipboard?.writeText(lead.phone).then(() => {
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1600)
    }).catch(() => { /* sem permissão de área de transferência */ })
  }

  const statusAtual = statusLocal ?? lead.status
  const sc = { color: reportStatusColor(statusAtual) }
  const pcCor = reportPerceptionColor(lead.perception)
  const valor = fmtBRL0(lead.value_potential)
  const wa = waNumber(lead.phone)

  const dsi = peek?.dias_sem_interacao ?? null
  const esfriando = dsi != null && dsi > 7 && !peek?.agendamento

  const eventos = peek?.timeline ?? []
  const eventosVisiveis = tlTodos ? eventos : eventos.slice(0, 5)

  // próximo passo: retorno agendado, esfriando, ou situação do status
  const proximo = peek?.agendamento
    ? { cor: 'var(--success)', titulo: 'Retorno agendado', sub: 'Próximo contato', quando: fmtDateShort(peek.agendamento), icon: <CalendarClock size={17} /> }
    : esfriando
      ? { cor: 'var(--warning)', titulo: 'Esfriando', sub: `Sem contato há ${dsi} dias e sem retorno agendado`, quando: '', icon: <Activity size={17} /> }
      : { cor: sc.color, titulo: 'Sem retorno agendado', sub: dsi === 0 ? 'Contato recente' : dsi != null ? `Último contato ${dsi === 1 ? 'ontem' : `há ${dsi} dias`}` : '—', quando: '', icon: <CalendarClock size={17} /> }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', justifyContent: 'flex-end', background: `rgba(15,23,42,${entered ? 0.32 : 0})`, transition: 'background 180ms ease' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        role="dialog" aria-label={`Lead ${lead.name}`}
        style={{
          width: 'min(440px, 100%)', height: '100%', display: 'flex', flexDirection: 'column', position: 'relative',
          background: 'var(--bg-card)', boxShadow: '-16px 0 44px rgba(0,0,0,0.22)', borderLeft: '1px solid var(--border)',
          transform: entered ? 'translateX(0)' : 'translateX(32px)', opacity: entered ? 1 : 0,
          transition: 'transform 220ms cubic-bezier(.2,.8,.2,1), opacity 180ms ease',
        }}
      >
        {/* barra de navegação (setas, "2 de 70", atalhos) retirada a pedido em 10/11/2026;
            fica só o X flutuando no canto. As teclas ↑/↓ e Esc continuam funcionando. */}
        <button onClick={onClose} aria-label="Fechar" title="Fechar (Esc)" style={{ ...NAV_BTN, position: 'absolute', top: 12, right: 12, zIndex: 3, background: 'var(--bg-card)' }}><X size={15} /></button>

        <div ref={bodyRef} style={{ flex: 1, overflowY: 'auto' }}>
          {/* cabeçalho com faixa na cor do status */}
          <div style={{ padding: '18px 52px 16px 20px', background: `linear-gradient(180deg, ${tint(sc.color, 10)}, transparent 80px)` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ width: 46, height: 46, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, color: '#fff', background: sc.color }}>
                {initials(lead.name)}
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-1)', lineHeight: 1.25, overflowWrap: 'anywhere' }}>{lead.name}</div>
                <div style={{ fontSize: 12.5, color: 'var(--text-subtle)', marginTop: 2 }}>
                  {[lead.phone || lead.email, lead.origem].filter(Boolean).join(' · ') || '—'}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, padding: '3px 9px', borderRadius: 20, border: `1px solid ${tint(sc.color, 35)}`, background: 'var(--bg-card)', color: sc.color }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />{statusLabel(statusAtual)}
              </span>
              {pcCor && <Tag style={{ background: tint(pcCor, 12), color: pcCor }}>{lead.perception}</Tag>}
              {valor && <Tag strong>{valor}</Tag>}
              {lead.modalidade && <Tag>{lead.modalidade}</Tag>}
              {lead.vidas != null && lead.vidas > 0 && <Tag>{lead.vidas} {lead.vidas === 1 ? 'vida' : 'vidas'}</Tag>}
              {lead.is_renutrucao && <Tag style={{ background: 'var(--accent-weak)', color: 'var(--accent-strong, var(--accent))' }}>Renutrição</Tag>}
            </div>

            {/* ações rápidas */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginTop: 14 }}>
              <QuickAction href={wa ? `https://wa.me/${wa}` : undefined} icon={<MessageCircle size={17} style={{ color: '#16A34A' }} />} label="WhatsApp" />
              <QuickAction href={lead.phone ? `tel:${lead.phone.replace(/[^\d+]/g, '')}` : undefined} icon={<Phone size={16} />} label="Ligar" />
              <QuickAction onClick={peek?.pode_anotar ? () => abrirNota('nova') : undefined} icon={<StickyNote size={16} />} label="Anotar" />
              <QuickAction onClick={lead.phone ? copiarTelefone : undefined} icon={copiado ? <Check size={16} style={{ color: 'var(--success)' }} /> : <Copy size={16} />} label={copiado ? 'Copiado' : 'Copiar tel.'} />
            </div>
          </div>

          {loading ? (
            <div style={{ padding: '6px 20px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[64, 58, 90, 120].map((h, i) => <div key={i} style={{ height: h, borderRadius: 10, background: 'var(--bg-subtle)', opacity: 0.7 }} />)}
            </div>
          ) : !peek ? (
            <p style={{ textAlign: 'center', color: 'var(--text-subtle)', fontSize: 12.5, padding: '32px 0' }}>Não foi possível carregar o resumo.</p>
          ) : (
            <>
              {/* próximo passo + indicadores */}
              <Sec>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 11, border: `1px solid ${tint(proximo.cor, 30)}`, background: tint(proximo.cor, 9) }}>
                  <span style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-card)', color: proximo.cor }}>{proximo.icon}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{proximo.titulo}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>{proximo.sub}</div>
                  </div>
                  {proximo.quando && <div style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: proximo.cor, whiteSpace: 'nowrap' }}>{proximo.quando}</div>}
                </div>
                {/* trocar status sem abrir a ficha (no lugar dos indicadores Sem contato / Neste status / Entrada) */}
                <div style={{ marginTop: 10, border: '1px solid var(--border)', borderRadius: 11, padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Status</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: sc.color }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: sc.color }} />{statusLabel(statusAtual)}
                    </span>
                    {peek.pode_anotar && (
                      <button
                        onClick={() => { setStatusMenu(statusMenu ? null : 'opcoes'); setStatusErro('') }}
                        disabled={statusSalvando}
                        style={{ ...LINK_BTN, marginLeft: 'auto' }}
                      >
                        {statusSalvando ? 'Salvando…' : statusMenu ? 'Cancelar' : <><Pencil size={12} /> Alterar status</>}
                      </button>
                    )}
                  </div>
                  {statusMenu && (
                    <div style={{ marginTop: 10, borderTop: '1px solid var(--border-lt)', paddingTop: 10 }}>
                      {statusMenu === 'opcoes' && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6 }}>
                          {STATUS_OPCOES.map(o => {
                            const atual = (statusAtual || '').toLowerCase() === o.value
                            const cor = reportStatusColor(o.value)
                            return (
                              <button
                                key={o.value}
                                onClick={() => !atual && escolherStatus(o.value)}
                                disabled={statusSalvando || atual}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: 7, padding: '7px 9px', borderRadius: 8, textAlign: 'left',
                                  border: `1px solid ${atual ? tint(cor, 45) : 'var(--border)'}`, background: atual ? tint(cor, 12) : 'var(--bg-card)',
                                  color: 'var(--text-1)', fontSize: 12.5, fontWeight: atual ? 700 : 500, cursor: atual ? 'default' : 'pointer', fontFamily: 'inherit',
                                }}
                              >
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: cor, flexShrink: 0 }} />
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.label}</span>
                              </button>
                            )
                          })}
                        </div>
                      )}
                      {statusMenu === 'fechado' && (
                        <>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Fechado como:</div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6 }}>
                            {FECHADO_OPCOES.map(o => (
                              <button key={o.value} onClick={() => mudarStatus(o.value)} disabled={statusSalvando}
                                style={{ padding: '8px 9px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-1)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                                {o.label}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                      {statusMenu === 'perdido' && (
                        <>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Motivo da perda:</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {MOTIVOS_PERDA.map(m => (
                              <button key={m} onClick={() => mudarStatus('sale_not_performed', m)} disabled={statusSalvando}
                                style={{ padding: '6px 10px', borderRadius: 20, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-1)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                                {m}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                      {statusMenu !== 'opcoes' && (
                        <button onClick={() => setStatusMenu('opcoes')} style={{ ...LINK_BTN, marginTop: 8, padding: 0 }}>‹ Voltar às opções</button>
                      )}
                    </div>
                  )}
                  {statusErro && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--danger)' }}>{statusErro}</div>}
                </div>
              </Sec>

              {/* última nota -- dá pra anotar e editar a última sem abrir a ficha */}
              <Sec>
                <SecTitle icon={<StickyNote size={13} />} title="Última anotação">
                  {peek.pode_anotar && !notaModo && (
                    <button onClick={() => abrirNota('nova')} style={{ ...LINK_BTN, marginLeft: 'auto' }}>
                      <Plus size={13} /> Anotar
                    </button>
                  )}
                </SecTitle>
                {notaModo ? (
                  <div style={{ border: '1px solid var(--accent)', boxShadow: `0 0 0 3px ${tint('var(--accent)', 16)}`, borderRadius: 10, overflow: 'hidden' }}>
                    <textarea
                      autoFocus value={notaTexto} onChange={e => setNotaTexto(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) salvarNota() }}
                      placeholder={notaModo === 'nova' ? 'Escreva a anotação… (Ctrl+Enter salva)' : ''}
                      aria-label={notaModo === 'nova' ? 'Nova anotação' : 'Editar anotação'}
                      style={{ display: 'block', width: '100%', minHeight: 88, padding: '10px 12px', border: 'none', outline: 'none', background: 'var(--bg-input)', color: 'var(--text-1)', fontSize: 12.5, lineHeight: 1.5, resize: 'vertical', fontFamily: 'inherit' }}
                    />
                    {notaErro && <p style={{ margin: 0, padding: '0 12px 6px', fontSize: 11.5, color: 'var(--danger)', background: 'var(--bg-input)' }}>{notaErro}</p>}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, padding: '7px 8px', borderTop: '1px solid var(--border-lt)', background: 'var(--bg-subtle)' }}>
                      <button onClick={() => { setNotaModo(null); setNotaErro('') }} style={{ padding: '6px 11px', borderRadius: 7, border: 'none', background: 'none', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                        Cancelar
                      </button>
                      <button
                        onClick={salvarNota} disabled={notaSalvando || !notaTexto.trim()}
                        style={{ padding: '6px 13px', borderRadius: 7, border: 'none', background: 'var(--accent)', color: 'var(--accent-contrast, #fff)', fontSize: 12, fontWeight: 600, cursor: notaSalvando || !notaTexto.trim() ? 'not-allowed' : 'pointer', opacity: notaSalvando || !notaTexto.trim() ? 0.5 : 1, fontFamily: 'inherit' }}
                      >
                        {notaSalvando ? 'Salvando…' : notaModo === 'nova' ? 'Salvar anotação' : 'Salvar edição'}
                      </button>
                    </div>
                  </div>
                ) : peek.ultima_nota ? (
                  <div style={{ fontSize: 13, color: 'var(--text-1)', lineHeight: 1.5, padding: '11px 13px', borderRadius: 10, background: 'var(--bg-subtle)', border: '1px solid var(--border-lt)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                    {peek.ultima_nota.text}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: 'var(--text-subtle)', marginTop: 8, whiteSpace: 'normal' }}>
                      <span>
                        {[peek.ultima_nota.by, peek.ultima_nota.at ? ago(peek.ultima_nota.at) : null].filter(Boolean).join(' · ')}
                        {peek.ultima_nota.edited_by && <span title={`Editado por ${peek.ultima_nota.edited_by}`} style={{ fontStyle: 'italic' }}> · editado</span>}
                      </span>
                      {peek.pode_anotar && peek.ultima_nota.pode_editar && (
                        <button onClick={() => abrirNota('editar')} style={{ ...LINK_BTN, marginLeft: 'auto', fontSize: 11.5 }}>
                          <Pencil size={11} /> Editar
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <p style={{ fontSize: 12.5, color: 'var(--text-subtle)', margin: 0 }}>Nenhuma anotação registrada.</p>
                )}
              </Sec>

              {/* linha do tempo */}
              {eventos.length > 0 && (
                <Sec>
                  <SecTitle icon={<Clock3 size={13} />} title="Linha do tempo">
                    <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--text-subtle)' }}>{eventos.length} evento{eventos.length !== 1 ? 's' : ''}</span>
                  </SecTitle>
                  <div style={{ position: 'relative', paddingLeft: 20 }}>
                    <span style={{ position: 'absolute', left: 4, top: 6, bottom: 6, width: 2, borderRadius: 2, background: 'var(--border-lt)' }} />
                    {eventosVisiveis.map((e, i) => {
                      const cor = e.kind === 'status' ? reportStatusColor(e.status) : e.kind === 'agendamento' ? 'var(--success)' : 'var(--accent)'
                      const tipo = e.kind === 'status' ? 'Status' : e.kind === 'agendamento' ? 'Retorno' : 'Anotação'
                      const label = e.kind === 'status' ? `Status → ${statusLabel(e.status ?? null)}`
                        : e.kind === 'nota' ? (e.text || 'Nota registrada')
                        : `Retorno marcado para ${e.scheduled_at ? fmtDateShort(e.scheduled_at) : '—'}`
                      return (
                        <div key={i} style={{ position: 'relative', paddingBottom: i === eventosVisiveis.length - 1 ? 0 : 13 }}>
                          <span style={{ position: 'absolute', left: -20, top: 5, width: 10, height: 10, borderRadius: '50%', background: cor, boxShadow: '0 0 0 3px var(--bg-card)' }} />
                          <div style={{ fontSize: 13, color: 'var(--text-1)', lineHeight: 1.45, overflowWrap: 'anywhere', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{label}</div>
                          <div style={{ fontSize: 11.5, color: 'var(--text-subtle)', marginTop: 1 }}>
                            <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: cor, marginRight: 6 }}>{tipo}</span>
                            {[e.by, ago(e.at)].filter(Boolean).join(' · ')}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {eventos.length > 5 && (
                    <button onClick={() => setTlTodos(t => !t)} style={{ ...LINK_BTN, padding: '8px 0 0' }}>
                      {tlTodos ? 'Mostrar menos' : `Ver mais ${eventos.length - 5}`}
                    </button>
                  )}
                </Sec>
              )}

              {/* detalhes / negociação / posse */}
              <Sec>
                <SecTitle icon={<Info size={13} />} title="Detalhes" />
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '10px 16px', fontSize: 13, alignItems: 'center' }}>
                  <Dt>Operadoras enviadas</Dt>
                  <Dd>
                    <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 5, justifyContent: 'flex-end' }}>
                      {peek.operadoras.length ? peek.operadoras.map(o => (
                        <span key={o} style={chipOp}>{o}</span>
                      )) : <span style={{ ...chipOp, background: 'var(--bg-subtle)', color: 'var(--text-subtle)' }}>Nenhuma</span>}
                    </span>
                  </Dd>
                  {peek.ponto_conversao && <><Dt>Ponto de conversão</Dt><Dd>{peek.ponto_conversao}</Dd></>}
                  {peek.plano_atual && <><Dt>Plano atual</Dt><Dd>{peek.plano_atual}</Dd></>}
                  {peek.atendente && <><Dt>Atendente</Dt><Dd><Pessoa nome={peek.atendente} /></Dd></>}
                  {peek.dono_renutricao && <><Dt>Dono (renutrição)</Dt><Dd><Pessoa nome={peek.dono_renutricao} /></Dd></>}
                  {peek.lost_reason && <><Dt>Motivo da perda</Dt><Dd>{peek.lost_reason}</Dd></>}
                  {lead.email && <><Dt>E-mail</Dt><Dd>{lead.email}</Dd></>}
                  {lead.idades_resumo && <><Dt>Idades</Dt><Dd>{lead.idades_resumo}</Dd></>}
                </div>
                {peek.retrabalhado_em && (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color: 'var(--warning)', background: 'var(--warning-weak)', borderRadius: 999, padding: '3px 10px', marginTop: 12 }}>
                    <RotateCcw size={11} /> Reativado {ago(peek.retrabalhado_em)}
                  </div>
                )}
              </Sec>
            </>
          )}
        </div>

        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-lt)', flexShrink: 0 }}>
          <button
            onClick={onOpenFull}
            style={{ width: '100%', height: 42, background: 'var(--accent)', color: 'var(--accent-contrast, #fff)', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontFamily: 'inherit' }}
          >
            Abrir ficha completa <ArrowUpRight size={16} />
          </button>
        </div>
      </div>

      {/* Emissão pede operadora e valor -- mesma janela da ficha */}
      {emissaoOpen && (
        <EmissaoModal
          leadName={lead.name}
          statusLabel={statusLabel(statusAtual)}
          defaultValor={lead.value_potential != null ? lead.value_potential.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''}
          saving={statusSalvando}
          onCancel={() => setEmissaoOpen(false)}
          onConfirm={({ operadora, valor, observacao }) => {
            const v = Number(valor.replace(/\./g, '').replace(',', '.'))
            mudarStatus('emissao', undefined, {
              operadora,
              ...(valor.trim() && !Number.isNaN(v) ? { valor_contrato: v } : {}),
              ...(observacao.trim() ? { observacao: observacao.trim() } : {}),
            })
          }}
        />
      )}
    </div>
  )
}

function Sec({ children }: { children: ReactNode }) {
  return <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border-lt)' }}>{children}</div>
}

function SecTitle({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, color: 'var(--text-subtle)' }}>
      {icon}
      <span style={LABEL}>{title}</span>
      {children}
    </div>
  )
}

function Tag({ children, style, strong }: { children: ReactNode; style?: CSSProperties; strong?: boolean }) {
  return (
    <span style={{ fontSize: 11.5, fontWeight: strong ? 700 : 600, padding: '3px 9px', borderRadius: 7, background: 'var(--bg-subtle)', color: strong ? 'var(--text-1)' : 'var(--text-muted)', ...style }}>
      {children}
    </span>
  )
}

function QuickAction({ icon, label, onClick, href }: { icon: ReactNode; label: string; onClick?: () => void; href?: string }) {
  const off = !onClick && !href
  const style: CSSProperties = {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '9px 4px', borderRadius: 10,
    border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-3b)', fontSize: 11.5, fontWeight: 500,
    cursor: off ? 'not-allowed' : 'pointer', opacity: off ? 0.45 : 1, textDecoration: 'none', fontFamily: 'inherit', transition: 'all 120ms',
  }
  const hoverIn = (e: React.MouseEvent<HTMLElement>) => { if (!off) { const st = e.currentTarget.style; st.borderColor = 'var(--accent-line, var(--accent))'; st.background = 'var(--accent-weak)'; st.color = 'var(--accent-strong, var(--accent))' } }
  const hoverOut = (e: React.MouseEvent<HTMLElement>) => { const st = e.currentTarget.style; st.borderColor = 'var(--border)'; st.background = 'var(--bg-card)'; st.color = 'var(--text-3b)' }
  if (href) {
    return <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" style={style} onMouseEnter={hoverIn} onMouseLeave={hoverOut}>{icon}{label}</a>
  }
  return <button onClick={onClick} disabled={off} style={style} onMouseEnter={hoverIn} onMouseLeave={hoverOut}>{icon}{label}</button>
}

const chipOp: CSSProperties = { fontSize: 11.5, fontWeight: 600, padding: '2px 8px', borderRadius: 5, background: 'var(--lr-ops-bg, #EEF2FF)', color: 'var(--lr-ops-tx, #4F46E5)', lineHeight: 1.5 }

function Pessoa({ nome }: { nome: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
      <span style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9.5, fontWeight: 700, color: '#fff', background: personColor(nome) }}>
        {nome.trim()[0]?.toUpperCase()}
      </span>
      {nome}
    </span>
  )
}

function Dt({ children }: { children: ReactNode }) {
  return <span style={{ color: 'var(--text-subtle)', fontWeight: 400 }}>{children}</span>
}

function Dd({ children }: { children: ReactNode }) {
  return <span style={{ color: 'var(--text-1)', fontWeight: 500, textAlign: 'right', minWidth: 0, overflowWrap: 'anywhere' }}>{children}</span>
}
