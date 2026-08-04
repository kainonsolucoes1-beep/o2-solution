import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { User, Tag, CalendarClock, Clock3, MessageCircle, History, Wallet, ChevronDown, ChevronRight, type LucideIcon } from 'lucide-react'
import api from '../api'
import { statusLabel } from '../utils/statusLabel'
import { parseUTC } from '../utils/date'
import { fmtDate, fmtDateOnly, fmtDuration, fmtClock, fmtRelative } from '../utils/leadFormat'
import { STATUS_STYLE } from '../utils/leadStatus'
import { useTheme } from '../ThemeContext'
import LeadDetailHeader from '../components/LeadDetailHeader'
import LeadNextStepPanel from '../components/LeadNextStepPanel'
import LeadActivityTimeline from '../components/LeadActivityTimeline'
import SectionCard from '../components/SectionCard'
import EditPencil from '../components/EditPencil'

interface LeadItem {
  id: string
  name: string
  email: string | null
  phone: string | null
  company: string | null
  attendant: string | null
  origem: string | null
  conversion_point: string | null
  base: string | null
  current_plan: string | null
  status: string | null
  perception: string | null
  value_potential: number | null
  receita_real_recebida: number | null
  receita_real_a_receber: number | null
  receita_promotora: string | null
  receita_operadora: string | null
  receita_categoria: string | null
  visibility_tag: string | null
  operadoras_enviadas: string | null
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

// evento unificado do feed de Atividade: mudanca de status, nota ou agendamento, todos numa so linha do tempo
export type ActivityEvent =
  | { kind: 'status'; at: string; status: string | null; by: string | null; isCreation: boolean; durationMs: number; ongoing: boolean }
  | { kind: 'note'; at: string; content: string; by: string }
  | { kind: 'schedule'; at: string; scheduledAt: string; by: string | null; active: boolean }

// pontos de conversao fixos, disponiveis mesmo sem nenhum lead ainda usar esse valor
const EXTRA_CONVERSION_POINTS = ['Campanha WhatsApp']

function fmtBRL(n: number | null) {
  if (n == null || n === 0) return '—'
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function _normalizePlan(v: string) {
  return v.trim().toLowerCase()
}

function KpiCard({ icon: Icon, label, value, caption, accent }: { icon: LucideIcon; label: string; value: string; caption?: string; accent?: boolean }) {
  return (
    <SectionCard compact>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3b)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {label}
        </div>
        <div style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 7, background: 'var(--bg-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={13} color="var(--text-3b)" strokeWidth={2} style={{ opacity: 0.6 }} />
        </div>
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color: accent ? '#2563EB' : 'var(--text-1)', fontVariantNumeric: 'tabular-nums', marginTop: 6 }}>
        {value}
      </div>
      {caption && (
        <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 3 }}>
          {caption}
        </div>
      )}
    </SectionCard>
  )
}

function Field({ label, value, small }: { label: string; value: string; small?: boolean }) {
  const empty = value === '—' || value === 'Não informado' || value === 'Não definido'
  return (
    <div className="flex flex-col gap-1">
      <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--text-3b)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </span>
      <span style={{ fontSize: small ? 12.5 : 14, color: empty ? 'var(--text-subtle)' : 'var(--text-1)', fontWeight: empty ? 400 : 600 }}>
        {value}
      </span>
    </div>
  )
}

function EditInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--text-3b)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </span>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ fontSize: 13, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-2)', width: '100%', boxSizing: 'border-box' }}
      />
    </div>
  )
}

function SelectField({ label, value, options, onChange, saving }: { label: string; value: string; options: string[]; onChange: (v: string) => void; saving?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--text-3b)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </span>
      <select
        value={value}
        disabled={saving}
        onChange={e => onChange(e.target.value)}
        style={{ fontSize: 13, padding: '7px 9px', borderRadius: 8, border: '1px solid var(--border-in)', background: 'var(--bg-input)', color: 'var(--text-2)', width: '100%', boxSizing: 'border-box', height: 34, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}
      >
        {!options.includes(value) && <option value={value}>{value || '—'}</option>}
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}

function DateField({ label, value, onChange, saving }: { label: string; value: string; onChange: (v: string) => void; saving?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--text-3b)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </span>
      <input
        type="date"
        defaultValue={value}
        disabled={saving}
        onBlur={e => e.target.value && e.target.value !== value && onChange(e.target.value)}
        style={{ fontSize: 13, padding: '6px 9px', borderRadius: 8, border: '1px solid var(--border-in)', background: 'var(--bg-input)', color: 'var(--text-2)', width: '100%', boxSizing: 'border-box', height: 34, cursor: saving ? 'not-allowed' : 'text', opacity: saving ? 0.6 : 1 }}
      />
    </div>
  )
}

const OPERADORAS_OPTIONS = [
  'Amil', 'Bradesco', 'Hapvida', 'Medsenior', 'Prevent Senior', 'Trasmontano', 'SulAmérica',
  'Alice', 'Bio Vida', 'Porto Saúde', 'Porto Bairros', 'Select',
]

function OperadorasField({ value, saving, onChange }: { value: string | null; saving?: boolean; onChange: (v: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  const selected = new Set((value ?? '').split(',').map(s => s.trim()).filter(Boolean))
  function toggle(op: string) {
    const next = new Set(selected)
    next.has(op) ? next.delete(op) : next.add(op)
    onChange([...next].join(','))
  }
  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={() => setExpanded(v => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
      >
        {expanded ? <ChevronDown size={12} color="var(--text-3b)" /> : <ChevronRight size={12} color="var(--text-3b)" />}
        <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--text-3b)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Operadoras Enviadas{selected.size > 0 ? ` (${selected.size})` : ''}
        </span>
      </button>
      {!expanded && selected.size > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginLeft: 17 }}>
          {[...selected].map(op => (
            <span
              key={op}
              style={{
                fontSize: 12.5, fontWeight: 700, textDecoration: 'underline',
                color: '#2563EB', background: '#EFF6FF', border: '1px solid #BFDBFE',
                borderRadius: 99, padding: '3px 12px',
              }}
            >
              {op}
            </span>
          ))}
        </div>
      )}
      {expanded && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, opacity: saving ? 0.6 : 1, pointerEvents: saving ? 'none' : 'auto' }}>
          {OPERADORAS_OPTIONS.map(op => {
            const active = selected.has(op)
            return (
              <button
                key={op}
                onClick={() => toggle(op)}
                style={{
                  fontSize: 11.5, fontWeight: 600, padding: '4px 11px', borderRadius: 99,
                  border: `1px solid ${active ? '#2563EB' : 'var(--border-in)'}`,
                  background: active ? '#EFF6FF' : 'var(--bg-input)',
                  color: active ? '#2563EB' : 'var(--text-2)',
                  cursor: 'pointer',
                }}
              >
                {op}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function PlanField({ value }: { value: string | null }) {
  const semPlano = value != null && _normalizePlan(value) === 'não possui plano'
  return (
    <div className="flex flex-col gap-1">
      <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--text-3b)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Plano Atual
      </span>
      {!value ? (
        <span style={{ fontSize: 13.5, color: 'var(--text-subtle)', fontStyle: 'normal' }}>Não informado</span>
      ) : semPlano ? (
        <span style={{ display: 'inline-flex', alignSelf: 'flex-start', background: 'rgba(220,38,38,0.12)', color: '#DC2626', padding: '2px 10px', borderRadius: 99, fontSize: 12, fontWeight: 700 }}>
          Não possui plano
        </span>
      ) : (
        <span style={{ fontSize: 13.5, color: 'var(--text-2)', fontWeight: 500 }}>{value}</span>
      )}
    </div>
  )
}

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { dark } = useTheme()

  const [lead, setLead]                   = useState<LeadItem | null>(null)
  const [notFound, setNotFound]           = useState(false)
  const [me, setMe]                       = useState<Me | null>(null)
  const [status, setStatus]               = useState('novo')
  const [editingStatus, setEditingStatus] = useState(false)
  const [statusSubMenu, setStatusSubMenu] = useState<'fechado' | 'perdido' | null>(null)
  const [savingStatus, setSavingStatus]   = useState(false)
  const [notes, setNotes]                 = useState<Note[]>([])
  const [loadingNotes, setLoadingNotes]   = useState(true)
  const [noteText, setNoteText]           = useState('')
  const [savingNote, setSavingNote]       = useState(false)
  const [toast, setToast]                 = useState<{ msg: string; ok: boolean } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting]           = useState(false)
  const [menuOpen, setMenuOpen]           = useState(false)
  const [history, setHistory]             = useState<StatusHistoryItem[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [schedules, setSchedules]         = useState<ScheduleItem[]>([])
  const [loadingSchedules, setLoadingSchedules] = useState(true)
  const [scheduleInput, setScheduleInput] = useState('')
  const [savingSchedule, setSavingSchedule] = useState(false)
  const [cancelingSchedule, setCancelingSchedule] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState(false)
  const [, setTick]                       = useState(0)
  const [editingInfo, setEditingInfo]     = useState(false)
  const [savingInfo, setSavingInfo]       = useState(false)
  const [infoDraft, setInfoDraft]         = useState({ name: '', company: '', email: '', phone: '', attendant: '', document: '', visibility_tag: '' })
  const [origins, setOrigins]             = useState<string[]>([])
  const [conversionPoints, setConversionPoints] = useState<string[]>([])
  const [modalidades, setModalidades]     = useState<string[]>(['PF', 'PME'])
  const [savingOrigin, setSavingOrigin]   = useState(false)
  const [savingModalidade, setSavingModalidade] = useState(false)
  const [savingConvPoint, setSavingConvPoint] = useState(false)
  const [savingPerception, setSavingPerception] = useState(false)
  const [editingPerception, setEditingPerception] = useState(false)
  const [savingCreatedAt, setSavingCreatedAt] = useState(false)
  const [savingOperadoras, setSavingOperadoras] = useState(false)
  const [savingRealign, setSavingRealign] = useState(false)
  const [editingDetalhes, setEditingDetalhes] = useState(false)
  const [savingDetalhes, setSavingDetalhes] = useState(false)
  const [detalhesDraft, setDetalhesDraft] = useState({ current_plan: '', value_potential: '' })
  const agendaRef = useRef<HTMLDivElement>(null)

  const isAdmin = me !== null && (me.role === 'admin' || me.username === 'lucas@o2solution.com.br')
  const canSeeFinancials = me !== null && (me.role === 'admin' || me.role === 'diretor')
  const conversionPointOptions = Array.from(new Set([...conversionPoints, ...EXTRA_CONVERSION_POINTS])).sort()

  useEffect(() => {
    if (!id) return
    api.get<LeadItem>(`/api/v1/leads/${id}`)
      .then(r => { setLead(r.data); setStatus(r.data.status ?? 'novo') })
      .catch(err => { if (err.response?.status === 404) setNotFound(true) })
    api.get<Me>('/api/v1/auth/me').then(r => setMe(r.data)).catch(() => {})
    api.get<string[]>('/api/v1/leads/origins').then(r => setOrigins(r.data)).catch(() => {})
    api.get<string[]>('/api/v1/leads/conversion-points').then(r => setConversionPoints(r.data)).catch(() => {})
    api.get<string[]>('/api/v1/leads/modalidades').then(r => setModalidades(r.data)).catch(() => {})
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

  function handleStatusChange(newStatus: string, lostReason?: string) {
    if (!id) return
    setSavingStatus(true)
    api.post(`/api/v1/leads/${id}/status`, { status: newStatus, ...(lostReason ? { lost_reason: lostReason } : {}) })
      .then(() => {
        setStatus(newStatus)
        setEditingStatus(false)
        setStatusSubMenu(null)
        setToast({ msg: 'Status atualizado com sucesso', ok: true })
        return api.get<{ history: StatusHistoryItem[] }>(`/api/v1/leads/${id}/status-history`)
      })
      .then(r => setHistory(r.data.history))
      .catch(() => setToast({ msg: 'Erro ao atualizar status', ok: false }))
      .finally(() => setSavingStatus(false))
  }

  function startEditInfo() {
    if (!lead) return
    setInfoDraft({
      name: lead.name ?? '', company: lead.company ?? '', email: lead.email ?? '',
      phone: lead.phone ?? '', attendant: lead.attendant ?? '', document: lead.document ?? '',
      visibility_tag: lead.visibility_tag ?? '',
    })
    setEditingInfo(true)
  }

  function handleSaveInfo() {
    if (!id) return
    setSavingInfo(true)
    api.post(`/api/v1/leads/${id}/info`, infoDraft)
      .then(() => {
        setLead(prev => prev ? { ...prev, ...infoDraft } : prev)
        setEditingInfo(false)
        setToast({ msg: 'Informações atualizadas com sucesso', ok: true })
      })
      .catch(() => setToast({ msg: 'Erro ao atualizar informações', ok: false }))
      .finally(() => setSavingInfo(false))
  }

  function handleQuickUpdate(field: 'origem' | 'modalidade' | 'conversion_point' | 'perception' | 'operadoras_enviadas', value: string) {
    if (!id) return
    const setSaving = field === 'origem' ? setSavingOrigin : field === 'modalidade' ? setSavingModalidade : field === 'conversion_point' ? setSavingConvPoint : field === 'operadoras_enviadas' ? setSavingOperadoras : setSavingPerception
    const apiField = field === 'origem' ? 'origin' : field
    setSaving(true)
    api.post(`/api/v1/leads/${id}/info`, { [apiField]: value })
      .then(() => {
        setLead(prev => prev ? { ...prev, [field]: value } : prev)
        setToast({ msg: 'Atualizado com sucesso', ok: true })
      })
      .catch(() => setToast({ msg: 'Erro ao atualizar', ok: false }))
      .finally(() => setSaving(false))
  }

  function handleUpdateCreatedAt(dateStr: string) {
    if (!id || !dateStr) return
    setSavingCreatedAt(true)
    api.post(`/api/v1/leads/${id}/info`, { created_at: dateStr })
      .then(() => Promise.all([
        api.get<LeadItem>(`/api/v1/leads/${id}`),
        api.get<{ history: StatusHistoryItem[] }>(`/api/v1/leads/${id}/status-history`),
      ]))
      .then(([leadRes, histRes]) => {
        setLead(leadRes.data)
        setHistory(histRes.data.history)
        setToast({ msg: 'Data de criação atualizada', ok: true })
      })
      .catch(() => setToast({ msg: 'Erro ao atualizar a data de criação', ok: false }))
      .finally(() => setSavingCreatedAt(false))
  }

  function handleRealignHistory() {
    if (!id) return
    setSavingRealign(true)
    api.post<{ history: StatusHistoryItem[] }>(`/api/v1/leads/${id}/realign-history`)
      .then(r => { setHistory(r.data.history); setToast({ msg: 'Histórico realinhado com a data de criação', ok: true }) })
      .catch(err => setToast({ msg: err.response?.data?.detail || 'Erro ao corrigir histórico', ok: false }))
      .finally(() => setSavingRealign(false))
  }

  function startEditDetalhes() {
    if (!lead) return
    setDetalhesDraft({
      current_plan: lead.current_plan ?? '',
      value_potential: lead.value_potential != null ? String(lead.value_potential) : '',
    })
    setEditingDetalhes(true)
  }

  function handleSaveDetalhes() {
    if (!id) return
    setSavingDetalhes(true)
    const payload: { current_plan: string | null; value_potential?: number } = {
      current_plan: detalhesDraft.current_plan.trim() || null,
    }
    if (detalhesDraft.value_potential.trim()) payload.value_potential = Number(detalhesDraft.value_potential)
    api.post(`/api/v1/leads/${id}/info`, payload)
      .then(() => api.get<LeadItem>(`/api/v1/leads/${id}`))
      .then(r => { setLead(r.data); setEditingDetalhes(false); setToast({ msg: 'Detalhes atualizados com sucesso', ok: true }) })
      .catch(() => setToast({ msg: 'Erro ao atualizar detalhes', ok: false }))
      .finally(() => setSavingDetalhes(false))
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
        setEditingSchedule(false)
        setToast({ msg: 'Agendamento salvo com sucesso', ok: true })
        return api.get<{ schedules: ScheduleItem[] }>(`/api/v1/leads/${id}/schedule-history`)
      })
      .then(r => setSchedules(r.data.schedules))
      .catch(() => setToast({ msg: 'Erro ao salvar agendamento', ok: false }))
      .finally(() => setSavingSchedule(false))
  }

  function handleCancelSchedule() {
    if (!id) return
    setCancelingSchedule(true)
    api.delete(`/api/v1/leads/${id}/schedule`)
      .then(() => {
        setToast({ msg: 'Agendamento removido', ok: true })
        return api.get<{ schedules: ScheduleItem[] }>(`/api/v1/leads/${id}/schedule-history`)
      })
      .then(r => setSchedules(r.data.schedules))
      .catch(() => setToast({ msg: 'Erro ao remover agendamento', ok: false }))
      .finally(() => setCancelingSchedule(false))
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
  const statusDurationLabel = (history.length > 0 && statusLabel(status) !== 'Venda Realizada')
    ? fmtClock(Date.now() - parseUTC(history[history.length - 1].changed_at))
    : null

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

  // ── Atividade: timeline de status + notas + agendamentos, unificados por data (mais recente primeiro) ──
  const activity: ActivityEvent[] = [
    ...timeline.map(t => ({ kind: 'status' as const, at: t.at, status: t.status, by: t.by, isCreation: t.isCreation, durationMs: t.durationMs, ongoing: t.ongoing })),
    ...notes.map(n => ({ kind: 'note' as const, at: n.created_at, content: n.content, by: n.created_by })),
    ...schedules.map(s => ({ kind: 'schedule' as const, at: s.created_at, scheduledAt: s.scheduled_at, by: s.created_by, active: s.is_active })),
  ].sort((a, b) => parseUTC(b.at) - parseUTC(a.at))

  const loadingActivity = loadingNotes || loadingHistory || loadingSchedules
  const lastActivityAt = activity.length > 0 ? activity[0].at : lead.created_at
  const activeSchedule = schedules.find(s => s.is_active)
  const acaoRapidaEditing = editingStatus || editingPerception || editingSchedule
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const interacoes7d = activity.filter(ev => parseUTC(ev.at) >= sevenDaysAgo).length

  const kpis = [
    { icon: Wallet, label: 'Valor da Cotação', value: fmtBRL(lead.value_potential), caption: lead.value_potential ? undefined : 'Não informado', accent: true },
    { icon: Clock3, label: 'Tempo no Funil', value: fmtDuration(Date.now() - parseUTC(lead.created_at)), caption: 'Desde a criação' },
    { icon: MessageCircle, label: 'Interações', value: String(interacoes7d), caption: 'Últimos 7 dias' },
    { icon: CalendarClock, label: 'Agendamentos', value: activeSchedule ? '1' : '0', caption: 'Pendentes' },
    { icon: History, label: 'Última Alteração', value: fmtRelative(lastActivityAt), caption: fmtDate(lastActivityAt) },
  ]

  const telHref = lead.phone ? `tel:${lead.phone.replace(/\D/g, '')}` : null
  const mailHref = lead.email ? `mailto:${lead.email}` : null

  return (
    <div style={{ background: dark ? 'transparent' : '#EEF1F5', minHeight: '100%', ...(dark ? {} : { ['--bg-input' as string]: '#FBFCFE' }) } as React.CSSProperties}>
    <div style={{ maxWidth: 1440, margin: '0 auto', padding: '20px 24px 60px' }}>
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

      <LeadDetailHeader
        name={lead.name}
        sinceLabel={fmtDateOnly(lead.created_at)}
        lastInteractionLabel={fmtRelative(lastActivityAt)}
        attendantLabel={lead.attendant ?? 'Não informado'}
        telHref={telHref}
        mailHref={mailHref}
        isAdmin={isAdmin}
        menuOpen={menuOpen}
        onToggleMenu={() => setMenuOpen(v => !v)}
        onCloseMenu={() => setMenuOpen(false)}
        onRequestDelete={() => { setMenuOpen(false); setConfirmDelete(true) }}
        onBack={() => navigate(-1)}
      />

      {confirmDelete && (
        <div onClick={() => !deleting && setConfirmDelete(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-card)', borderRadius: 16, width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', padding: 24 }}>
            <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 8px' }}>Excluir este lead?</p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px' }}>
              Esta ação não pode ser desfeita. O lead e todo o histórico associado (notas, agendamentos, status) serão excluídos permanentemente.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                style={{ padding: '9px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600, background: 'var(--bg-card)', color: 'var(--text-2)', border: '1px solid var(--border-in)', cursor: deleting ? 'not-allowed' : 'pointer' }}
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{ padding: '9px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600, background: '#DC2626', color: 'white', border: 'none', cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.6 : 1 }}
              >
                {deleting ? 'Excluindo…' : 'Sim, excluir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3" style={{ marginBottom: 20 }}>
        {kpis.map(k => <KpiCard key={k.label} icon={k.icon} label={k.label} value={k.value} caption={k.caption} accent={k.accent} />)}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5 items-start">
        <div className="flex flex-col gap-5">

          <SectionCard title="Perfil" icon={User} action={
            editingInfo ? (
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setEditingInfo(false)} style={{ fontSize: 12, color: 'var(--text-subtle)', background: 'none', border: 'none', cursor: 'pointer' }}>
                  Cancelar
                </button>
                <button onClick={handleSaveInfo} disabled={savingInfo} style={{ fontSize: 12, color: '#3B82F6', background: 'none', border: 'none', cursor: savingInfo ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
                  {savingInfo ? 'Salvando…' : 'Salvar'}
                </button>
              </div>
            ) : (
              <EditPencil onClick={startEditInfo} title="Editar perfil" />
            )
          }>
            {editingInfo ? (
              <div className="flex flex-col gap-4">
                <EditInput label="Nome"      value={infoDraft.name}      onChange={v => setInfoDraft(d => ({ ...d, name: v }))} />
                <EditInput label="Empresa"   value={infoDraft.company}   onChange={v => setInfoDraft(d => ({ ...d, company: v }))} />
                <EditInput label="Email"     value={infoDraft.email}     onChange={v => setInfoDraft(d => ({ ...d, email: v }))} />
                <EditInput label="Telefone"  value={infoDraft.phone}     onChange={v => setInfoDraft(d => ({ ...d, phone: v }))} />
                <EditInput label="Documento" value={infoDraft.document}  onChange={v => setInfoDraft(d => ({ ...d, document: v }))} />
                <EditInput label="Atendente" value={infoDraft.attendant} onChange={v => setInfoDraft(d => ({ ...d, attendant: v }))} />
                <EditInput label="Perfil" value={infoDraft.visibility_tag} onChange={v => setInfoDraft(d => ({ ...d, visibility_tag: v }))} />
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <Field label="Empresa"   value={lead.company ?? 'Não informado'} />
                <Field label="E-mail"    value={lead.email ?? 'Não informado'} small />
                <Field label="Telefone"  value={lead.phone ?? 'Não informado'} />
                <Field label="Documento" value={lead.document ?? 'Não informado'} />
                {lead.visibility_tag && <Field label="Perfil" value={lead.visibility_tag} />}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Detalhes do Lead" icon={Tag} action={
            editingDetalhes ? (
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setEditingDetalhes(false)} style={{ fontSize: 12, color: 'var(--text-subtle)', background: 'none', border: 'none', cursor: 'pointer' }}>
                  Cancelar
                </button>
                <button onClick={handleSaveDetalhes} disabled={savingDetalhes} style={{ fontSize: 12, color: '#3B82F6', background: 'none', border: 'none', cursor: savingDetalhes ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
                  {savingDetalhes ? 'Salvando…' : 'Salvar'}
                </button>
              </div>
            ) : (
              <EditPencil onClick={startEditDetalhes} title="Editar detalhes" />
            )
          }>
            <div className="flex flex-col gap-4">
              <SelectField label="Origem" value={lead.origem ?? ''} options={origins} saving={savingOrigin} onChange={v => handleQuickUpdate('origem', v)} />
              <SelectField label="Modalidade" value={lead.modalidade ?? ''} options={modalidades} saving={savingModalidade} onChange={v => handleQuickUpdate('modalidade', v)} />
              <SelectField label="Ponto de Conversão" value={lead.conversion_point ?? ''} options={conversionPointOptions} saving={savingConvPoint} onChange={v => handleQuickUpdate('conversion_point', v)} />
              {editingDetalhes ? (
                <EditInput label="Plano Atual" value={detalhesDraft.current_plan} onChange={v => setDetalhesDraft(d => ({ ...d, current_plan: v }))} />
              ) : (
                <PlanField value={lead.current_plan} />
              )}
              <OperadorasField value={lead.operadoras_enviadas} saving={savingOperadoras} onChange={v => handleQuickUpdate('operadoras_enviadas', v)} />
              {editingDetalhes && (
                <EditInput label="Valor da Cotação" value={detalhesDraft.value_potential} onChange={v => setDetalhesDraft(d => ({ ...d, value_potential: v }))} />
              )}
              {editingDetalhes && isAdmin && (
                <DateField
                  label="Data de Criação"
                  value={lead.created_at.slice(0, 10)}
                  saving={savingCreatedAt}
                  onChange={handleUpdateCreatedAt}
                />
              )}
            </div>
          </SectionCard>

          {canSeeFinancials && (() => {
            const recebida = lead.receita_real_recebida ?? 0
            const aReceber = lead.receita_real_a_receber ?? 0
            const total = recebida + aReceber
            const hasData = total > 0
            const pct = hasData ? Math.round(recebida / total * 100) : 0
            const vendaDetails: [string, string][] = [
              ['Plataforma', lead.receita_promotora ?? ''],
              ['Operadora', lead.receita_operadora ?? ''],
              ['Categoria', lead.receita_categoria ?? ''],
            ].filter(([, v]) => v) as [string, string][]
            if (!hasData) return null
            return (
              <SectionCard title="Receita" icon={Wallet}>
                <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 10, padding: '12px 14px' }}>
                        <div style={{ fontSize: 9.5, fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Recebida</div>
                        <div style={{ fontSize: 17, fontWeight: 800, color: '#059669', marginTop: 4 }}>{fmtBRL(recebida)}</div>
                      </div>
                      <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: '12px 14px' }}>
                        <div style={{ fontSize: 9.5, fontWeight: 700, color: '#D97706', textTransform: 'uppercase', letterSpacing: '0.05em' }}>A Receber</div>
                        <div style={{ fontSize: 17, fontWeight: 800, color: '#D97706', marginTop: 4 }}>{fmtBRL(aReceber)}</div>
                      </div>
                    </div>
                    <div style={{ marginTop: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-3b)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total do negócio</span>
                        <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-1)' }}>{fmtBRL(total)}</span>
                      </div>
                      <div style={{ height: 6, borderRadius: 99, background: '#FFFBEB', overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 99, background: '#059669' }} />
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 6 }}>{pct}% já recebido</div>
                    </div>
                    {vendaDetails.length > 0 && (
                      <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border-in)' }}>
                        <p style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--text-3b)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }}>
                          Detalhes da venda
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {vendaDetails.map(([label, value]) => (
                            <div key={label} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                              <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 800, color: 'var(--text-3b)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
                              <span style={{ textAlign: 'right', fontSize: 12.5, color: 'var(--text-2)', fontWeight: 500 }}>{value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                </>
              </SectionCard>
            )
          })()}

        </div>

        <div className="flex flex-col gap-5">

          <LeadNextStepPanel
            editing={acaoRapidaEditing}
            onToggleEditing={() => {
              const next = !acaoRapidaEditing
              setEditingStatus(next)
              setEditingPerception(next)
              setEditingSchedule(next)
              if (next) setStatusSubMenu(null)
            }}

            status={status}
            sStyle={sStyle}
            editingStatus={editingStatus}
            statusSubMenu={statusSubMenu}
            savingStatus={savingStatus}
            statusDurationLabel={statusDurationLabel}
            onStatusOptionClick={value => {
              if (value === 'fechado') { setStatusSubMenu('fechado'); return }
              if (value === 'sale_not_performed') { setStatusSubMenu('perdido'); return }
              handleStatusChange(value)
            }}
            onClosedSubClick={value => handleStatusChange(value)}
            onLostReasonClick={reason => handleStatusChange('sale_not_performed', reason)}
            onBackToStatusOptions={() => setStatusSubMenu(null)}
            onCancelStatusEdit={() => setEditingStatus(false)}

            perception={lead.perception}
            editingPerception={editingPerception}
            savingPerception={savingPerception}
            onPerceptionClick={key => { handleQuickUpdate('perception', key); setEditingPerception(false) }}
            onCancelPerceptionEdit={() => setEditingPerception(false)}

            agendaRef={agendaRef}
            editingSchedule={editingSchedule}
            scheduleInput={scheduleInput}
            onScheduleInputChange={setScheduleInput}
            savingSchedule={savingSchedule}
            loadingSchedules={loadingSchedules}
            activeSchedule={activeSchedule}
            cancelingSchedule={cancelingSchedule}
            onSaveSchedule={handleSchedule}
            onCancelScheduleEdit={() => setEditingSchedule(false)}
            onRemoveSchedule={handleCancelSchedule}
          />

          <LeadActivityTimeline
            isAdmin={isAdmin}
            savingRealign={savingRealign}
            onRealignHistory={handleRealignHistory}
            noteText={noteText}
            onNoteTextChange={setNoteText}
            savingNote={savingNote}
            onSaveNote={handleSaveNote}
            loadingActivity={loadingActivity}
            activity={activity}
          />

        </div>
      </div>

    </div>
    </div>
  )
}
