import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, User, Tag, Activity, CalendarClock, CalendarPlus, StickyNote, History, Pencil, Phone, Mail, Wallet, Lock, type LucideIcon } from 'lucide-react'
import api from '../api'
import { statusLabel } from '../utils/statusLabel'
import { parseUTC } from '../utils/date'

function WhatsAppIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.6 6.32A7.85 7.85 0 0 0 12.05 4a7.94 7.94 0 0 0-6.9 11.9L4 20l4.2-1.1a7.9 7.9 0 0 0 3.8 1h.03a7.94 7.94 0 0 0 5.57-13.58zM12.06 18.4h-.02a6.58 6.58 0 0 1-3.36-.92l-.24-.14-2.5.66.67-2.44-.16-.25a6.6 6.6 0 1 1 12.24-3.5 6.56 6.56 0 0 1-6.63 6.6zm3.6-4.94c-.2-.1-1.17-.58-1.35-.64-.18-.07-.31-.1-.45.1-.13.2-.5.64-.62.77-.11.13-.23.15-.42.05-.2-.1-.83-.3-1.58-.97a5.9 5.9 0 0 1-1.1-1.36c-.11-.2 0-.3.09-.4.1-.1.2-.23.3-.35.1-.11.13-.2.2-.32.06-.13.03-.25-.02-.35-.05-.1-.45-1.08-.62-1.48-.16-.4-.33-.33-.45-.34h-.38c-.13 0-.35.05-.53.25s-.7.68-.7 1.66.72 1.93.82 2.06c.1.13 1.4 2.15 3.4 3 .48.2.85.33 1.14.42.48.15.92.13 1.26.08.39-.06 1.17-.48 1.34-.94.16-.46.16-.85.11-.94-.05-.09-.18-.14-.38-.24z"/>
    </svg>
  )
}

function normalizePhoneDigits(phone: string) {
  const digits = phone.replace(/\D/g, '')
  if (digits.length > 11 && digits.startsWith('55')) return digits
  return digits ? `55${digits}` : ''
}

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

function SectionCard({ title, icon: Icon, accent = '#2563EB', action, children }: { title?: string; icon?: LucideIcon; accent?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div style={{ position: 'relative', border: '1px solid var(--border-lt)', borderRadius: 14, padding: '16px 18px 16px 20px', background: 'var(--bg-card)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
      {title && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: accent }} />}
      {title && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 7, margin: '0 0 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            {Icon && <Icon size={14} color={accent} strokeWidth={2.5} />}
            <p style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--text-3b)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
              {title}
            </p>
          </div>
          {action}
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

function EditInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-3b)', textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.85 }}>
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
      <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-3b)', textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.85 }}>
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

function PlanField({ value }: { value: string | null }) {
  const semPlano = value != null && _normalizePlan(value) === 'não possui plano'
  return (
    <div className="flex flex-col gap-2">
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
  const [cancelingSchedule, setCancelingSchedule] = useState(false)
  const [, setTick]                       = useState(0)
  const [editingInfo, setEditingInfo]     = useState(false)
  const [savingInfo, setSavingInfo]       = useState(false)
  const [infoDraft, setInfoDraft]         = useState({ name: '', company: '', email: '', phone: '', attendant: '', document: '' })
  const [origins, setOrigins]             = useState<string[]>([])
  const [savingOrigin, setSavingOrigin]   = useState(false)
  const [savingModalidade, setSavingModalidade] = useState(false)
  const agendaRef = useRef<HTMLDivElement>(null)

  const isAdmin = me !== null && (me.role === 'admin' || me.username === 'lucas@o2solution.com.br')
  const canSeeFinancials = me !== null && (me.role === 'admin' || me.role === 'diretor')

  useEffect(() => {
    if (!id) return
    api.get<LeadItem>(`/api/v1/leads/${id}`)
      .then(r => { setLead(r.data); setStatus(r.data.status ?? 'novo') })
      .catch(err => { if (err.response?.status === 404) setNotFound(true) })
    api.get<Me>('/api/v1/auth/me').then(r => setMe(r.data)).catch(() => {})
    api.get<string[]>('/api/v1/leads/origins').then(r => setOrigins(r.data)).catch(() => {})
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

  function startEditInfo() {
    if (!lead) return
    setInfoDraft({
      name: lead.name ?? '', company: lead.company ?? '', email: lead.email ?? '',
      phone: lead.phone ?? '', attendant: lead.attendant ?? '', document: lead.document ?? '',
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

  function handleQuickUpdate(field: 'origem' | 'modalidade', value: string) {
    if (!id) return
    const setSaving = field === 'origem' ? setSavingOrigin : setSavingModalidade
    const apiField = field === 'origem' ? 'origin' : 'modalidade'
    setSaving(true)
    api.post(`/api/v1/leads/${id}/info`, { [apiField]: value })
      .then(() => {
        setLead(prev => prev ? { ...prev, [field]: value } : prev)
        setToast({ msg: 'Atualizado com sucesso', ok: true })
      })
      .catch(() => setToast({ msg: 'Erro ao atualizar', ok: false }))
      .finally(() => setSaving(false))
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

  const telHref = lead.phone ? `tel:${lead.phone.replace(/\D/g, '')}` : null
  const waHref = lead.phone ? `https://wa.me/${normalizePhoneDigits(lead.phone)}` : null
  const mailHref = lead.email ? `mailto:${lead.email}` : null
  const actionBtnStyle = (enabled: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 7, padding: '9px 15px', borderRadius: 10,
    fontSize: 13, fontWeight: 600, border: '1px solid var(--border)', background: 'var(--bg-card)',
    color: 'var(--text-2)', textDecoration: 'none', cursor: enabled ? 'pointer' : 'not-allowed',
    opacity: enabled ? 1 : 0.4, boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
  })

  return (
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

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button
            onClick={() => navigate(-1)}
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, flexShrink: 0 }}
          >
            <ArrowLeft size={16} />
          </button>
          <div style={{
            flexShrink: 0, width: 50, height: 50, borderRadius: '50%',
            background: 'linear-gradient(135deg, #60A5FA, #2563EB)',
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 17, fontWeight: 700, letterSpacing: '0.02em',
            boxShadow: '0 2px 8px rgba(37,99,235,0.35)',
          }}>
            {initials(lead.name)}
          </div>
          <div>
            <p style={{ fontSize: 21, fontWeight: 800, color: 'var(--text-1)', margin: 0, letterSpacing: '-0.01em' }}>{lead.name}</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 9 }}>
              <span style={{ background: sStyle.bg, color: sStyle.color, padding: '4px 13px', borderRadius: 99, fontSize: 12.5, fontWeight: 700 }}>
                {statusLabel(status)}
              </span>
              {history.length > 0 && statusLabel(status) !== 'Venda Realizada' && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', background: 'var(--bg-subtle)', padding: '4px 12px', borderRadius: 99, fontVariantNumeric: 'tabular-nums' }}>
                  ⏱ {fmtClock(Date.now() - parseUTC(history[history.length - 1].changed_at))}
                </span>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <a href={telHref ?? undefined} style={actionBtnStyle(!!telHref)} onClick={e => { if (!telHref) e.preventDefault() }}>
            <Phone size={15} /> Ligar
          </a>
          <a href={waHref ?? undefined} target="_blank" rel="noreferrer" style={{ ...actionBtnStyle(!!waHref), borderColor: waHref ? '#86EFAC' : 'var(--border)', color: waHref ? '#16A34A' : 'var(--text-2)', background: waHref ? '#F0FDF4' : 'var(--bg-card)' }} onClick={e => { if (!waHref) e.preventDefault() }}>
            <WhatsAppIcon /> WhatsApp
          </a>
          <a href={mailHref ?? undefined} style={actionBtnStyle(!!mailHref)} onClick={e => { if (!mailHref) e.preventDefault() }}>
            <Mail size={15} /> E-mail
          </a>
          <button
            onClick={() => agendaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
            style={{ ...actionBtnStyle(true), background: '#2563EB', borderColor: '#2563EB', color: '#fff', boxShadow: '0 2px 8px rgba(37,99,235,0.3)' }}
          >
            <CalendarPlus size={15} /> Agendar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr_300px] gap-5 items-start">
        <div className="flex flex-col gap-5">

          <SectionCard title="Informações" icon={User} accent="#2563EB" action={
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
              <button onClick={startEditInfo} title="Editar informações" style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-subtle)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500, padding: 2, opacity: 0.7, transition: 'opacity 150ms, color 150ms' }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = '#3B82F6' }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '0.7'; e.currentTarget.style.color = 'var(--text-subtle)' }}
              >
                <Pencil size={12} /> Editar
              </button>
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
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <Field label="Empresa"   value={lead.company ?? '—'} />
                <Field label="E-mail"    value={lead.email ?? '—'} />
                <Field label="Telefone"  value={lead.phone ?? '—'} />
                <Field label="Documento" value={lead.document ?? '—'} />
                <Field label="Atendente" value={lead.attendant ?? '—'} />
                {lead.perception && PERCEPTION_STYLE[lead.perception] && (
                  <div className="flex flex-col gap-2">
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-3b)', textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.85 }}>
                      Percepção
                    </span>
                    <span style={{ display: 'inline-flex', alignSelf: 'flex-start', background: PERCEPTION_STYLE[lead.perception].bg, color: PERCEPTION_STYLE[lead.perception].color, padding: '4px 14px', borderRadius: 99, fontSize: 13, fontWeight: 700 }}>
                      {PERCEPTION_STYLE[lead.perception].label}
                    </span>
                  </div>
                )}
              </div>
            )}
          </SectionCard>

          {canSeeFinancials && (() => {
            const recebida = lead.receita_real_recebida ?? 0
            const aReceber = lead.receita_real_a_receber ?? 0
            const total = recebida + aReceber
            const hasData = total > 0
            const pct = hasData ? Math.round(recebida / total * 100) : 0
            return (
              <SectionCard title="Receita Gerada" icon={Wallet} accent="#059669">
                {hasData ? (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 10, padding: '12px 14px' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Recebida</div>
                        <div style={{ fontSize: 17, fontWeight: 800, color: '#059669', marginTop: 4 }}>{fmtBRL(recebida)}</div>
                      </div>
                      <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: '12px 14px' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#D97706', textTransform: 'uppercase', letterSpacing: '0.05em' }}>A Receber</div>
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
                  </>
                ) : (
                  <p style={{ fontSize: 13, color: 'var(--text-subtle)', textAlign: 'center', padding: '10px 0', margin: 0 }}>
                    Nenhuma receita gerada ainda.
                  </p>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: 'var(--text-subtle)', background: 'var(--bg-subtle)', borderRadius: 6, padding: '3px 8px', width: 'fit-content', marginTop: 14 }}>
                  <Lock size={10} /> Visível apenas para Admin e Diretor
                </div>
              </SectionCard>
            )
          })()}

        </div>

        <div className="flex flex-col gap-5">

          <SectionCard title="Detalhes do Lead" icon={Tag} accent="#4F46E5">
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: '16px 20px', marginTop: 8 }}>
              <SelectField label="Origem" value={lead.origem ?? ''} options={origins} saving={savingOrigin} onChange={v => handleQuickUpdate('origem', v)} />
              <SelectField label="Modalidade" value={lead.modalidade ?? ''} options={['PF', 'PME']} saving={savingModalidade} onChange={v => handleQuickUpdate('modalidade', v)} />
              <div style={{ gridColumn: '1 / -1', marginTop: 12 }}>
                <Field label="Ponto de Conversão" value={lead.conversion_point ?? '—'} />
              </div>
              <div style={{ marginTop: 12 }}><PlanField value={lead.current_plan} /></div>
              <div style={{ marginTop: 12 }}><Field label="Valor da Cotação" value={fmtBRL(lead.value_potential)} /></div>
              <div style={{ marginTop: 12 }}><Field label="Data de Criação" value={fmtDate(lead.created_at)} /></div>
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

        <div className="flex flex-col gap-5">

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

          <div ref={agendaRef}>
          <SectionCard title="Agendamento" icon={CalendarClock} accent="#7C3AED">
            <div className="flex flex-col gap-2">
              {loadingSchedules ? (
                <p style={{ fontSize: 13, color: 'var(--text-subtle)' }}>Carregando…</p>
              ) : (
                <>
                  {(() => {
                    const active = schedules.find(s => s.is_active)
                    return active ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ display: 'inline-flex', alignSelf: 'flex-start', background: 'rgba(37,99,235,0.12)', color: '#2563EB', padding: '4px 14px', borderRadius: 99, fontSize: 13, fontWeight: 700 }}>
                          Agendado para {fmtDate(active.scheduled_at)}
                        </span>
                        <button
                          onClick={handleCancelSchedule}
                          disabled={cancelingSchedule}
                          style={{ fontSize: 12, color: '#DC2626', background: 'none', border: 'none', cursor: cancelingSchedule ? 'not-allowed' : 'pointer', fontWeight: 500 }}
                        >
                          {cancelingSchedule ? 'Removendo…' : 'Remover'}
                        </button>
                      </div>
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
          </div>

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
