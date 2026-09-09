import { useEffect, useState, type CSSProperties } from 'react'
import { X, CalendarClock, Clock3, StickyNote, ArrowRight, RotateCcw } from 'lucide-react'
import api from '../api'
import { statusLabel } from '../utils/statusLabel'
import { statusColor, PERCEPTION_STYLE } from '../utils/leadStatus'
import { fmtDateShort } from '../utils/leadFormat'
import { parseUTC } from '../utils/date'

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
  ultima_nota: { text: string; by: string | null; at: string | null } | null
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

const LABEL: CSSProperties = { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-subtle)' }

export default function LeadPeekDrawer({ lead, onClose, onOpenFull }: { lead: PeekLead; onClose: () => void; onOpenFull: () => void }) {
  const [peek, setPeek] = useState<Peek | null>(null)
  const [loading, setLoading] = useState(true)
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true))
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => { cancelAnimationFrame(raf); document.removeEventListener('keydown', onKey) }
  }, [onClose])

  useEffect(() => {
    let alive = true
    setLoading(true)
    api.get<Peek>(`/api/v1/leads/${lead.id}/peek`)
      .then(r => { if (alive) setPeek(r.data) })
      .catch(() => { if (alive) setPeek(null) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [lead.id])

  const sc = statusColor(lead.status)
  const pc = lead.perception ? PERCEPTION_STYLE[lead.perception] : null
  const valor = fmtBRL0(lead.value_potential)

  const dsi = peek?.dias_sem_interacao ?? null
  const esfriando = dsi != null && dsi > 7 && !peek?.agendamento

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', justifyContent: 'flex-end', background: `rgba(15,23,42,${entered ? 0.4 : 0})`, transition: 'background 160ms ease' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        width: 'min(400px, 100%)', height: '100%', display: 'flex', flexDirection: 'column',
        background: 'var(--bg-card)', boxShadow: '-18px 0 44px rgba(0,0,0,0.22)',
        transform: entered ? 'translateX(0)' : 'translateX(24px)', opacity: entered ? 1 : 0,
        transition: 'transform 180ms ease, opacity 180ms ease',
      }}>
        {/* header */}
        <div style={{ padding: '18px 20px 16px', borderBottom: '1px solid var(--border-lt)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <span style={{ width: 40, height: 40, borderRadius: 11, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff', background: '#94A3B8' }}>
              {initials(lead.name)}
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--text-1)' }}>{lead.name}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-subtle)', marginTop: 1 }}>
                {[lead.phone || lead.email, lead.origem].filter(Boolean).join(' · ') || '—'}
              </div>
            </div>
            <button onClick={onClose} aria-label="Fechar" style={{ flexShrink: 0, width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-subtle)', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <X size={15} />
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 7, background: sc.bg, color: sc.color }}>{statusLabel(lead.status)}</span>
            {pc && <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 7, background: pc.bg, color: pc.color }}>{pc.label}</span>}
            {valor && <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 7, background: 'var(--bg-subtle)', color: 'var(--text-2)' }}>{valor}</span>}
            {lead.modalidade && <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 7, background: 'var(--bg-subtle)', color: 'var(--text-muted)' }}>{lead.modalidade}</span>}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {loading ? (
            <p style={{ textAlign: 'center', color: 'var(--text-subtle)', fontSize: 12.5, padding: '32px 0' }}>Carregando…</p>
          ) : !peek ? (
            <p style={{ textAlign: 'center', color: 'var(--text-subtle)', fontSize: 12.5, padding: '32px 0' }}>Não foi possível carregar o resumo.</p>
          ) : (
            <>
              {/* próximo passo */}
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 13px', borderRadius: 10,
                background: peek.agendamento ? 'var(--success-weak)' : esfriando ? 'var(--warning-weak)' : 'var(--bg-subtle)',
              }}>
                <CalendarClock size={16} style={{ flexShrink: 0, marginTop: 1, color: peek.agendamento ? 'var(--success)' : esfriando ? 'var(--warning)' : 'var(--text-muted)' }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>
                    {peek.agendamento ? `Retorno agendado · ${fmtDateShort(peek.agendamento)}` : 'Sem retorno agendado'}
                  </div>
                  {!peek.agendamento && dsi != null && (
                    <div style={{ fontSize: 11.5, color: esfriando ? 'var(--warning)' : 'var(--text-muted)', marginTop: 2 }}>
                      {esfriando ? `Esfriando — sem contato há ${dsi} dias` : 'Contato recente'}
                    </div>
                  )}
                </div>
              </div>

              {/* situação */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div style={{ padding: '10px 11px', borderRadius: 10, background: 'var(--bg-subtle)' }}>
                  <div style={LABEL}>Sem contato</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', marginTop: 3 }}>{dsi == null ? '—' : dsi === 0 ? 'hoje' : `${dsi} dia${dsi === 1 ? '' : 's'}`}</div>
                </div>
                <div style={{ padding: '10px 11px', borderRadius: 10, background: 'var(--bg-subtle)' }}>
                  <div style={LABEL}>Neste status</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', marginTop: 3 }}>{peek.dias_no_status == null ? '—' : peek.dias_no_status === 0 ? 'hoje' : `${peek.dias_no_status} dia${peek.dias_no_status === 1 ? '' : 's'}`}</div>
                </div>
              </div>

              {/* última nota */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
                  <StickyNote size={13} style={{ color: 'var(--text-muted)' }} />
                  <span style={LABEL}>Última anotação</span>
                </div>
                {peek.ultima_nota ? (
                  <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.5, padding: '10px 12px', borderRadius: 10, background: 'var(--bg-subtle)' }}>
                    {peek.ultima_nota.text}
                    <div style={{ fontSize: 10.5, color: 'var(--text-subtle)', marginTop: 6 }}>
                      {[peek.ultima_nota.by, peek.ultima_nota.at ? ago(peek.ultima_nota.at) : null].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                ) : (
                  <p style={{ fontSize: 12, color: 'var(--text-subtle)', margin: 0 }}>Nenhuma anotação registrada.</p>
                )}
              </div>

              {/* linha do tempo */}
              {peek.timeline.length > 0 && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 9 }}>
                    <Clock3 size={13} style={{ color: 'var(--text-muted)' }} />
                    <span style={LABEL}>Linha do tempo</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                    {peek.timeline.map((e, i) => {
                      const label = e.kind === 'status' ? `Status → ${statusLabel(e.status)}`
                        : e.kind === 'nota' ? (e.text || 'Nota registrada')
                        : `Retorno marcado para ${e.scheduled_at ? fmtDateShort(e.scheduled_at) : '—'}`
                      const dot = e.kind === 'status' ? 'var(--accent)' : e.kind === 'agendamento' ? 'var(--success)' : 'var(--text-subtle)'
                      return (
                        <div key={i} style={{ display: 'flex', gap: 9, fontSize: 12, color: 'var(--text-2)' }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: dot, marginTop: 5, flexShrink: 0 }} />
                          <div style={{ minWidth: 0 }}>
                            <span>{label}</span>
                            <span style={{ color: 'var(--text-subtle)' }}> · {ago(e.at)}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* negociação / posse */}
              {(peek.plano_atual || peek.operadoras.length > 0 || peek.ponto_conversao || peek.lost_reason || peek.dono_renutricao || peek.atendente || peek.retrabalhado_em) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--border-lt)', paddingTop: 14 }}>
                  {peek.plano_atual && <Row label="Plano atual" value={peek.plano_atual} />}
                  {peek.operadoras.length > 0 && (
                    <div>
                      <div style={LABEL}>Operadoras enviadas</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 5 }}>
                        {peek.operadoras.map(o => (
                          <span key={o} style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: 'var(--accent-weak)', color: 'var(--accent)' }}>{o}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {peek.ponto_conversao && <Row label="Ponto de conversão" value={peek.ponto_conversao} />}
                  {peek.lost_reason && <Row label="Motivo da perda" value={peek.lost_reason} />}
                  {peek.dono_renutricao && <Row label="Dono (renutrição)" value={peek.dono_renutricao} />}
                  {peek.atendente && <Row label="Atendente" value={peek.atendente} />}
                  {peek.retrabalhado_em && (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color: 'var(--warning)', background: 'var(--warning-weak)', borderRadius: 999, padding: '3px 10px', alignSelf: 'flex-start' }}>
                      <RotateCcw size={11} /> Reativado {ago(peek.retrabalhado_em)}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border-lt)' }}>
          <button
            onClick={onOpenFull}
            style={{ width: '100%', padding: '11px 0', background: '#2563EB', color: '#fff', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}
          >
            Abrir ficha completa <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12.5 }}>
      <span style={{ color: 'var(--text-3b)' }}>{label}</span>
      <span style={{ color: 'var(--text-1)', fontWeight: 600, textAlign: 'right', minWidth: 0 }}>{value}</span>
    </div>
  )
}
