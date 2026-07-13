import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, User, Tag, Activity, CalendarClock, StickyNote, History, type LucideIcon } from 'lucide-react'
import api from '../api'
import { statusLabel } from '../utils/statusLabel'
import { parseUTC } from '../utils/date'

interface LeadItem {
  id: string
  name: string
  email: string | null
  phone: string | null
  company: string | null
  attendant: string | null
  origem: string | null
  conversion_point: string | null
  current_plan: string | null
  status: string | null
  perception: string | null
  value_potential: number | null
  modalidade: string | null
  document: string | null
  created_at: string
}

interface Note {
  id: string
  content: string
  created_by: string
  created_at: string
}

interface StatusHistoryItem {
  id: string
  from_status: string | null
  to_status: string
  changed_at: string
  changed_by: string | null
}

interface ScheduleItem {
  id: string
  scheduled_at: string
  is_active: boolean
  created_by: string | null
  created_at: string
}

interface Me {
  id: string
  username: string
  first_name: string | null
  role: string
}

const PERCEPTION_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  'Quente': { bg: 'rgba(220,38,38,0.12)',  color: '#DC2626', label: 'Quente' },
  'Morno':  { bg: 'rgba(217,119,6,0.12)',  color: '#D97706', label: 'Morno' },
  'Frio':   { bg: 'rgba(37,99,235,0.12)',  color: '#2563EB', label: 'Frio' },
}

const STATUS_OPTIONS = [
  { value: 'novo',        label: 'Novo' },
  { value: 'qualificado', label: 'Qualificado' },
  { value: 'proposta',    label: 'Proposta' },
  { value: 'fechado',     label: 'Fechado' },
  { value: 'convertido',  label: 'Convertido' },
]

// mesmas cores usadas nos cards do funil (Pipeline.tsx)
const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  novo:                 { bg: '#EFF6FF', color: '#3B82F6' },
  new:                  { bg: '#EFF6FF', color: '#3B82F6' },
  pending:              { bg: '#EFF6FF', color: '#3B82F6' },
  qualificado:          { bg: '#ECFDF5', color: '#10B981' },
  qualified:            { bg: '#ECFDF5', color: '#10B981' },
  scheduled:            { bg: '#ECFDF5', color: '#10B981' },
  proposta:             { bg: '#FFFBEB', color: '#F59E0B' },
  proposal_sent:        { bg: '#FFFBEB', color: '#F59E0B' },
  'proposal sent':      { bg: '#FFFBEB', color: '#F59E0B' },
  negociacao:           { bg: '#F5F3FF', color: '#8B5CF6' },
  'negociação':         { bg: '#F5F3FF', color: '#8B5CF6' },
  waiting_billing:      { bg: '#ECFDF5', color: '#059669' },
  'waiting billing':    { bg: '#ECFDF5', color: '#059669' },
  fechado:              { bg: '#ECFDF5', color: '#059669' },
  closed:               { bg: '#ECFDF5', color: '#059669' },
  won:                  { bg: '#ECFDF5', color: '#059669' },
  convertido:           { bg: '#ECFDF5', color: '#059669' },
  sale_performed:       { bg: '#ECFDF5', color: '#059669' },
  'sale performed':     { bg: '#ECFDF5', color: '#059669' },
  sale_not_performed:   { bg: '#FEF2F2', color: '#EF4444' },
  'sale not performed': { bg: '#FEF2F2', color: '#EF4444' },
}

function statusColor(s: string | null) {
  if (!s) return { bg: 'rgba(107,114,128,0.12)', color: '#6B7280' }
  return STATUS_STYLE[s.toLowerCase()] ?? { bg: 'rgba(107,114,128,0.12)', color: '#6B7280' }
}

function fmtDate(iso: string) {
  return new Date(parseUTC(iso)).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function fmtBRL(n: number | null) {
  if (n == null || n === 0) return '—'
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDuration(ms: number) {
  if (ms < 0) ms = 0
  const totalMin = Math.floor(ms / 60000)
  const days = Math.floor(totalMin / 1440)
  const hours = Math.floor((totalMin % 1440) / 60)
  const min = totalMin % 60
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${min}min`
  return `${min}min`
}

function fmtClock(ms: number) {
  if (ms < 0) ms = 0
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h >= 24) return fmtDuration(ms)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function _normalizePlan(v: string) {
  return v.trim().toLowerCase()
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function SectionCard({ title, icon: Icon, accent = '#2563EB', children }: { title?: string; icon?: LucideIcon; accent?: string; children: ReactNode }) {
  return (
    <div style={{ position: 'relative', border: '1px solid var(--border-lt)', borderRadius: 12, padding: '16px 18px 16px 20px', background: 'var(--bg-card)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
      {title && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: accent }} />}
      {title && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, margin: '0 0 14px' }}>
          {Icon && <Icon size={14} color={accent} strokeWidth={2.5} />}
          <p style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--text-3b)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
            {title}
          </p>
        </div>
      )}
      {children}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-3b)', textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.85 }}>
        {label}
      </span>
      <span style={{ fontSize: 14, color: value === '—' ? 'var(--text-subtle)' : 'var(--text-2)', fontWeight: value === '—' ? 400 : 500 }}>
        {value}
      </span>
    </div>
  )
}

function PlanField({ value }: { value: string | null }) {
  const semPlano = value != null && _normalizePlan(value) === 'não possui plano'
  return (
    <div className="flex flex-col gap-1">
      <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-3b)', textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.85 }}>
        Plano Atual
      </span>
      {!value ? (
        <span style={{ fontSize: 14, color: 'var(--text-subtle)' }}>—</span>
      ) : semPlano ? (
        <span style={{ display: 'inline-flex', alignSelf: 'flex-start', background: 'rgba(220,38,38,0.12)', color: '#DC2626', padding: '2px 10px', borderRadius: 99, fontSize: 12, fontWeight: 700 }}>
          Não possui plano
        </span>
      ) : (
        <span style={{ fontSize: 14, color: 'var(--text-2)', fontWeight: 500 }}>{value}</span>
      )}
    </div>
  )
}

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [lead, setLead]                   = useState<LeadItem | null>(null)
  const [notFound, setNotFound]           = useState(false)
  const [me, setMe]                       = useState<Me | null>(null)
  const [status, setStatus]               = useState('novo')
  const [editingStatus, setEditingStatus] = useState(false)
  const [savingStatus, setSavingStatus]   = useState(false)
  const [notes, setNotes]                 = useState<Note[]>([])
  const [loadingNotes, setLoadingNotes]   = useState(true)
  const [noteText, setNoteText]           = useState('')
  const [savingNote, setSavingNote]       = useState(false)
  const [toast, setToast]                 = useState<{ msg: string; ok: boolean } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting]           = useState(false)
  const [history, setHistory]             = useState<StatusHistoryItem[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [schedules, setSchedules]         = useState<ScheduleItem[]>([])
  const [loadingSchedules, setLoadingSchedules] = useState(true)
  const [scheduleInput, setScheduleInput] = useState('')
  const [savingSchedule, setSavingSchedule] = useState(false)
  const [, setTick]                       = useState(0)

  const isAdmin = me !== null && (me.role === 'admin' || me.username === 'lucas@o2solution.com.br')

  useEffect(() => {
    if (!id) return
    api.get<LeadItem>(`/api/v1/leads/${id}`)
      .then(r => { setLead(r.data); setStatus(r.data.status ?? 'novo') })
      .catch(err => { if (err.response?.status === 404) setNotFound(true) })
    api.get<Me>('/api/v1/auth/me').then(r => setMe(r.data)).catch(() => {})
    api.get<{ notes: Note[] }>(`/api/v1/leads/${id}/notes`)
      .then(r => setNotes(r.data.notes))
      .finally(() => setLoadingNotes(false))
    api.get<{ history: StatusHistoryItem[] }>(`/api/v1/leads/${id}/status-history`)
      .then(r => setHistory(r.data.history))
      .finally(() => setLoadingHistory(false))
    api.get<{ schedules: ScheduleItem[] }>(`/api/v1/leads/${id}/schedule-history`)
      .then(r => setSchedules(r.data.schedules))
      .finally(() => setLoadingSchedules(false))
  }, [id])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  useEffect(() => {
    const t = setInterval(() => setTick(v => v + 1), 1000)
    return () => clearInterval(t)
  }, [])

  function handleStatusChange(newStatus: string) {
    if (!id) return
    setSavingStatus(true)
    api.post(`/api/v1/leads/${id}/status`, { status: newStatus })
      .then(() => {
        setStatus(newStatus)
        setEditingStatus(false)
        setToast({ msg: 'Status atualizado com sucesso', ok: true })
        return api.get<{ history: StatusHistoryItem[] }>(`/api/v1/leads/${id}/status-history`)
      })
      .then(r => setHistory(r.data.history))
      .catch(() => setToast({ msg: 'Erro ao atualizar status', ok: false }))
      .finally(() => setSavingStatus(false))
  }

  function handleSaveNote() {
    if (!id || !noteText.trim()) return
    setSavingNote(true)
    api.post(`/api/v1/leads/${id}/notes`, { content: noteText.trim() })
      .then(() => {
        setNoteText('')
        setToast({ msg: 'Nota salva com sucesso', ok: true })
        return api.get<{ notes: Note[] }>(`/api/v1/leads/${id}/notes`)
      })
      .then(r => setNotes(r.data.notes))
      .catch(() => setToast({ msg: 'Erro ao salvar nota', ok: false }))
      .finally(() => setSavingNote(false))
  }

  function handleSchedule() {
    if (!id || !scheduleInput) return
    setSavingSchedule(true)
    api.post(`/api/v1/leads/${id}/schedule`, { scheduled_at: new Date(scheduleInput).toISOString() })
      .then(() => {
        setScheduleInput('')
        setToast({ msg: 'Agendamento salvo com sucesso', ok: true })
        return api.get<{ schedules: ScheduleItem[] }>(`/api/v1/leads/${id}/schedule-history`)
      })
      .then(r => setSchedules(r.data.schedules))
      .catch(() => setToast({ msg: 'Erro ao salvar agendamento', ok: false }))
      .finally(() => setSavingSchedule(false))
  }

  function handleDelete() {
    if (!id) return
    setDeleting(true)
    api.delete(`/api/v1/leads/${id}`)
      .then(() => navigate('/leads-report'))
      .catch(() => { setToast({ msg: 'Erro ao excluir lead', ok: false }); setDeleting(false); setConfirmDelete(false) })
  }

  if (notFound) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <p style={{ fontSize: 15, color: 'var(--text-2)', marginBottom: 16 }}>Lead não encontrado.</p>
        <button onClick={() => navigate('/leads-report')} style={{ padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 500, background: '#2563EB', color: 'white', border: 'none', cursor: 'pointer' }}>
          Voltar ao relatório
        </button>
      </div>
    )
  }

  if (!lead) {
    return <p style={{ padding: 40, textAlign: 'center', color: 'var(--text-subtle)' }}>Carregando…</p>
  }

  const sStyle = STATUS_STYLE[(status ?? 'novo').toLowerCase()] ?? { bg: 'rgba(107,114,128,0.12)', color: '#6B7280' }

  // ── Timeline: tempo gasto em cada etapa ──────────────────────────────────
  const timeline = (() => {
    const points = [
      { status: lead.status, at: lead.created_at, by: null as string | null, isCreation: true },
      ...history.map(h => ({ status: h.to_status, at: h.changed_at, by: h.changed_by, isCreation: false })),
    ]
    // se já existe um registro de criação no próprio histórico, não duplica o ponto inicial
    const firstHistoryAt = history[0]?.changed_at
    const base = firstHistoryAt === lead.created_at ? points.slice(1) : points
    return base.map((p, i) => {
      const nextAt = i < base.length - 1 ? base[i + 1].at : null
      const start = parseUTC(p.at)
      const end = nextAt ? parseUTC(nextAt) : Date.now()
      return { ...p, durationMs: end - start, ongoing: nextAt === null }
    })
  })()

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 24px 60px' }}>
      {toast && (
        <div
          style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 100,
            background: toast.ok ? '#10B981' : '#EF4444',
            color: 'white', padding: '10px 18px', borderRadius: 10,
            fontSize: 13, fontWeight: 600,
            boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
          }}
        >
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => navigate(-1)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-subtle)', display: 'flex', alignItems: 'center', padding: 4, borderRadius: 6 }}
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>{lead.name}</p>
            <p style={{ fontSize: 12, color: 'var(--text-subtle)', margin: '2px 0 0' }}>Detalhe do Lead</p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ background: sStyle.bg, color: sStyle.color, padding: '5px 16px', borderRadius: 99, fontSize: 13, fontWeight: 700 }}>
            {statusLabel(status)}
          </span>
          {history.length > 0 && statusLabel(status) !== 'Venda Realizada' && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-subtle)', fontVariantNumeric: 'tabular-nums' }}>
              ⏱ {fmtClock(Date.now() - parseUTC(history[history.length - 1].changed_at))}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="flex flex-col gap-5">

          <SectionCard title="Informações" icon={User} accent="#2563EB">
            <div style={{ display: 'flex', gap: 18 }}>
              <div style={{
                flexShrink: 0, width: 52, height: 52, borderRadius: '50%',
                background: 'linear-gradient(135deg, #60A5FA, #2563EB)',
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18, fontWeight: 700, letterSpacing: '0.02em',
                boxShadow: '0 2px 8px rgba(37,99,235,0.35)',
              }}>
                {initials(lead.name)}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 20px', flex: 1 }}>
                <Field label="Nome"     value={lead.name} />
                <Field label="Empresa"  value={lead.company ?? '—'} />
                <Field label="Email"    value={lead.email ?? '—'} />
                <Field label="Telefone" value={lead.phone ?? '—'} />
                <Field label="Atendente" value={lead.attendant ?? '—'} />
                {lead.perception && PERCEPTION_STYLE[lead.perception] && (
                  <div className="flex flex-col gap-1">
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-3b)', textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.85 }}>
                      Percepção
                    </span>
                    <span style={{ display: 'inline-flex', alignSelf: 'flex-start', background: PERCEPTION_STYLE[lead.perception].bg, color: PERCEPTION_STYLE[lead.perception].color, padding: '4px 14px', borderRadius: 99, fontSize: 13, fontWeight: 700 }}>
                      {PERCEPTION_STYLE[lead.perception].label}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Status" icon={Activity} accent={sStyle.color}>
            {editingStatus ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {STATUS_OPTIONS.map(opt => {
                  const s = STATUS_STYLE[opt.value] ?? { bg: '#F3F4F6', color: '#6B7280' }
                  const active = status === opt.value
                  return (
                    <button
                      key={opt.value}
                      disabled={savingStatus}
                      onClick={() => handleStatusChange(opt.value)}
                      style={{
                        background: active ? s.color : s.bg,
                        color: active ? 'white' : s.color,
                        border: `1.5px solid ${s.color}`,
                        padding: '4px 14px', borderRadius: 99,
                        fontSize: 13, fontWeight: 600, cursor: savingStatus ? 'not-allowed' : 'pointer',
                        opacity: savingStatus ? 0.6 : 1,
                        transition: 'all 150ms', textTransform: 'capitalize',
                      }}
                    >
                      {opt.label}
                    </button>
                  )
                })}
                <button
                  onClick={() => setEditingStatus(false)}
                  style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--text-subtle)', cursor: 'pointer', padding: '4px 8px' }}
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ background: sStyle.bg, color: sStyle.color, padding: '4px 14px', borderRadius: 99, fontSize: 13, fontWeight: 600 }}>
                  {statusLabel(status)}
                </span>
                <button
                  onClick={() => setEditingStatus(true)}
                  style={{ fontSize: 12, color: '#3B82F6', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}
                >
                  Editar
                </button>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Agendamento" icon={CalendarClock} accent="#7C3AED">
            <div className="flex flex-col gap-2">
              {loadingSchedules ? (
                <p style={{ fontSize: 13, color: 'var(--text-subtle)' }}>Carregando…</p>
              ) : (
                <>
                  {(() => {
                    const active = schedules.find(s => s.is_active)
                    return active ? (
                      <span style={{ display: 'inline-flex', alignSelf: 'flex-start', background: 'rgba(37,99,235,0.12)', color: '#2563EB', padding: '4px 14px', borderRadius: 99, fontSize: 13, fontWeight: 700 }}>
                        Agendado para {fmtDate(active.scheduled_at)}
                      </span>
                    ) : (
                      <span style={{ fontSize: 13, color: 'var(--text-subtle)' }}>Nenhum agendamento ativo.</span>
                    )
                  })()}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                      type="datetime-local"
                      value={scheduleInput}
                      onChange={e => setScheduleInput(e.target.value)}
                      style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, color: 'var(--text-2)', background: 'var(--bg-input)' }}
                    />
                    <button
                      onClick={handleSchedule}
                      disabled={savingSchedule || !scheduleInput}
                      style={{
                        background: savingSchedule || !scheduleInput ? 'var(--bg-subtle)' : '#2563EB',
                        color: savingSchedule || !scheduleInput ? 'var(--text-subtle)' : 'white',
                        border: 'none', borderRadius: 8,
                        padding: '7px 16px', fontSize: 13, fontWeight: 500,
                        cursor: savingSchedule || !scheduleInput ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {savingSchedule ? 'Salvando…' : schedules.some(s => s.is_active) ? 'Reagendar' : 'Agendar'}
                    </button>
                  </div>
                  {schedules.length > 1 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 2 }}>
                      {schedules.filter(s => !s.is_active).map(s => (
                        <span key={s.id} style={{ fontSize: 11, color: 'var(--text-subtle)', textDecoration: 'line-through' }}>
                          {fmtDate(s.scheduled_at)}{s.created_by ? ` · ${s.created_by}` : ''}
                        </span>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </SectionCard>

          <SectionCard title="Notas" icon={StickyNote} accent="#D97706">
            <div className="flex flex-col gap-3">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <textarea
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  placeholder="Adicione uma nota..."
                  rows={3}
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: 8,
                    border: '1px solid var(--border)', fontSize: 13, color: 'var(--text-2)',
                    background: 'var(--bg-input)',
                    resize: 'vertical', outline: 'none', fontFamily: 'inherit',
                    boxSizing: 'border-box',
                  }}
                  onFocus={e => (e.currentTarget.style.borderColor = '#3B82F6')}
                  onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                  <button
                    onClick={handleSaveNote}
                    disabled={savingNote || !noteText.trim()}
                    style={{
                      background: savingNote || !noteText.trim() ? 'var(--bg-subtle)' : '#2563EB',
                      color: savingNote || !noteText.trim() ? 'var(--text-subtle)' : 'white',
                      border: 'none', borderRadius: 8,
                      padding: '7px 16px', fontSize: 13, fontWeight: 500,
                      cursor: savingNote || !noteText.trim() ? 'not-allowed' : 'pointer',
                      transition: 'background 150ms',
                    }}
                  >
                    {savingNote ? 'Salvando…' : 'Salvar Nota'}
                  </button>
                </div>
              </div>

              {loadingNotes ? (
                <p style={{ fontSize: 13, color: 'var(--text-subtle)' }}>Carregando notas…</p>
              ) : notes.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--text-subtle)' }}>Nenhuma nota ainda.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {notes.map(note => (
                    <div key={note.id} style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-subtle)', marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-3b)', fontWeight: 700 }}>{note.created_by}</span>
                        <span>{fmtDate(note.created_at)}</span>
                      </div>
                      <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {note.content}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </SectionCard>

        </div>

        <div className="flex flex-col gap-5">

          <SectionCard title="Detalhes do Lead" icon={Tag} accent="#4F46E5">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 20px' }}>
              <Field label="Origem"             value={lead.origem ?? '—'} />
              <Field label="Ponto de Conversão" value={lead.conversion_point ?? '—'} />
              <Field label="Modalidade"         value={lead.modalidade ?? '—'} />
              <PlanField value={lead.current_plan} />
              <Field label="Valor Potencial"    value={fmtBRL(lead.value_potential)} />
              <Field label="Data Criação"       value={fmtDate(lead.created_at)} />
            </div>
          </SectionCard>

          <SectionCard title="Linha do Tempo · tempo por etapa" icon={History} accent="#059669">
            {loadingHistory ? (
              <p style={{ fontSize: 13, color: 'var(--text-subtle)' }}>Carregando…</p>
            ) : timeline.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-subtle)' }}>Sem histórico registrado.</p>
            ) : (
              <div style={{ position: 'relative', paddingLeft: 20 }}>
                <div style={{ position: 'absolute', left: 6, top: 8, bottom: 8, width: 2, background: 'var(--border)', borderRadius: 2 }} />
                {timeline.map((item, i) => {
                  const c = statusColor(item.status)
                  const isVendaRealizada = statusLabel(item.status) === 'Venda Realizada'
                  return (
                    <div key={i} style={{ position: 'relative', marginBottom: i < timeline.length - 1 ? 18 : 0 }}>
                      <div style={{
                        position: 'absolute', left: -17, top: 4,
                        width: 10, height: 10, borderRadius: '50%',
                        background: c.color, border: '2px solid var(--bg-card)',
                        boxShadow: `0 0 0 2px ${c.color}`,
                      }} />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12, fontWeight: 600, background: c.bg, color: c.color, padding: '2px 10px', borderRadius: 99 }}>
                          {item.isCreation ? `Criado como ${statusLabel(item.status)}` : statusLabel(item.status)}
                        </span>
                        {!(item.ongoing && isVendaRealizada) && (
                          <span style={{
                            fontSize: 11, fontWeight: 700, color: item.ongoing ? c.color : 'var(--text-subtle)',
                            background: item.ongoing ? c.bg : 'var(--bg-hover)', padding: '2px 8px', borderRadius: 99,
                          }}>
                            {item.ongoing ? `em andamento · ${fmtDuration(item.durationMs)}` : fmtDuration(item.durationMs)}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 3 }}>
                        {fmtDate(item.at)}{item.by ? ` · ${item.by}` : ''}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </SectionCard>

        </div>
      </div>

      {isAdmin && (
        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500, background: 'none', color: '#EF4444', border: '1px solid rgba(239,68,68,0.3)', cursor: 'pointer' }}
            >
              Excluir lead
            </button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: '#EF4444', fontWeight: 500 }}>Confirmar exclusão?</span>
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{ padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: '#EF4444', color: 'white', border: 'none', cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.6 : 1 }}
              >
                {deleting ? 'Excluindo…' : 'Sim, excluir'}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                style={{ padding: '6px 14px', borderRadius: 8, fontSize: 13, background: 'none', color: 'var(--text-muted)', border: '1px solid var(--border)', cursor: 'pointer' }}
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
