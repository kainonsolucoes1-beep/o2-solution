import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, User, Tag, Activity, CalendarClock, Clock3, MessageCircle, History, StickyNote, Pencil, Phone, Mail, Wallet, ChevronDown, ChevronRight, MoreVertical, Trash2, type LucideIcon } from 'lucide-react'
import api from '../api'
import { statusLabel } from '../utils/statusLabel'
import { parseUTC } from '../utils/date'
import { useTheme } from '../ThemeContext'

function WhatsAppIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.6 6.32A7.85 7.85 0 0 0 12.05 4a7.94 7.94 0 0 0-6.9 11.9L4 20l4.2-1.1a7.9 7.9 0 0 0 3.8 1h.03a7.94 7.94 0 0 0 5.57-13.58zM12.06 18.4h-.02a6.58 6.58 0 0 1-3.36-.92l-.24-.14-2.5.66.67-2.44-.16-.25a6.6 6.6 0 1 1 12.24-3.5 6.56 6.56 0 0 1-6.63 6.6zm3.6-4.94c-.2-.1-1.17-.58-1.35-.64-.18-.07-.31-.1-.45.1-.13.2-.5.64-.62.77-.11.13-.23.15-.42.05-.2-.1-.83-.3-1.58-.97a5.9 5.9 0 0 1-1.1-1.36c-.11-.2 0-.3.09-.4.1-.1.2-.23.3-.35.1-.11.13-.2.2-.32.06-.13.03-.25-.02-.35-.05-.1-.45-1.08-.62-1.48-.16-.4-.33-.33-.45-.34h-.38c-.13 0-.35.05-.53.25s-.7.68-.7 1.66.72 1.93.82 2.06c.1.13 1.4 2.15 3.4 3 .48.2.85.33 1.14.42.48.15.92.13 1.26.08.39-.06 1.17-.48 1.34-.94.16-.46.16-.85.11-.94-.05-.09-.18-.14-.38-.24z"/>
    </svg>
  )
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
type ActivityEvent =
  | { kind: 'status'; at: string; status: string | null; by: string | null; isCreation: boolean; durationMs: number; ongoing: boolean }
  | { kind: 'note'; at: string; content: string; by: string }
  | { kind: 'schedule'; at: string; scheduledAt: string; by: string | null; active: boolean }

const PERCEPTION_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  'Quente': { bg: 'rgba(220,38,38,0.12)',  color: '#DC2626', label: 'Quente' },
  'Morno':  { bg: 'rgba(217,119,6,0.12)',  color: '#D97706', label: 'Morno' },
  'Frio':   { bg: 'rgba(37,99,235,0.12)',  color: '#2563EB', label: 'Frio' },
}

// pontos de conversao fixos, disponiveis mesmo sem nenhum lead ainda usar esse valor
const EXTRA_CONVERSION_POINTS = ['Campanha WhatsApp']

const STATUS_OPTIONS = [
  { value: 'novo',        label: 'Novo' },
  { value: 'qualificado', label: 'Agendado' },
  { value: 'proposta',    label: 'Proposta' },
  { value: 'fechado',     label: 'Fechado' },
  { value: 'convertido',  label: 'Convertido' },
  { value: 'sale_not_performed', label: 'Perdido' },
]

const CLOSED_SUB_OPTIONS = [
  { value: 'waiting_billing', label: 'Aguardando Faturamento' },
  { value: 'sale_performed',  label: 'Venda Realizada' },
]

const LOST_REASONS = [
  'Cliente não retornou contato',
  'Dados incorretos',
  'Finalizado automaticamente',
  'Preço',
  'Sem interesse',
  'Sem perfil',
  'Sem retorno',
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

function fmtDateOnly(iso: string) {
  return new Date(parseUTC(iso)).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
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

function fmtRelative(iso: string) {
  return `há ${fmtDuration(Date.now() - parseUTC(iso))}`
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

function SectionCard({ title, icon: Icon, action, compact, children }: { title?: string; icon?: LucideIcon; action?: ReactNode; compact?: boolean; children: ReactNode }) {
  const { dark } = useTheme()
  return (
    <div style={{
      border: `1px solid ${dark ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.04)'}`,
      borderRadius: 14, padding: compact ? '11px 15px' : '18px 20px', background: 'var(--bg-card)',
      boxShadow: dark ? '0 1px 2px rgba(0,0,0,0.14)' : '0 1px 2px rgba(15,23,42,0.05)',
    }}>
      {title && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 7, margin: '0 0 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            {Icon && <Icon size={14} color="var(--text-3b)" strokeWidth={2} style={{ opacity: 0.55 }} />}
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

function KpiCard({ icon: Icon, label, value, caption, accent }: { icon: LucideIcon; label: string; value: string; caption?: string; accent?: boolean }) {
  return (
    <SectionCard compact>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3b)', textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.75 }}>
          {label}
        </div>
        <div style={{ flexShrink: 0, width: 26, height: 26, borderRadius: 7, background: 'var(--bg-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={13} color="var(--text-3b)" strokeWidth={2} style={{ opacity: 0.6 }} />
        </div>
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: accent ? '#2563EB' : 'var(--text-1)', fontVariantNumeric: 'tabular-nums', marginTop: 6 }}>
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
      <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-3b)', textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.5 }}>
        {label}
      </span>
      <span style={{ fontSize: small ? 12.5 : 14, color: empty ? 'var(--text-subtle)' : 'var(--text-1)', fontWeight: empty ? 400 : 600 }}>
        {value}
      </span>
    </div>
  )
}

function EditPencil({ onClick, title }: { onClick: () => void; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title ?? 'Editar'}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 6, color: 'var(--text-subtle)', background: 'none', border: 'none', cursor: 'pointer', opacity: 0.7, transition: 'opacity 150ms, color 150ms', flexShrink: 0 }}
      onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = '#3B82F6' }}
      onMouseLeave={e => { e.currentTarget.style.opacity = '0.7'; e.currentTarget.style.color = 'var(--text-subtle)' }}
    >
      <Pencil size={13} />
    </button>
  )
}


function EditInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-3b)', textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.5 }}>
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
      <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-3b)', textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.5 }}>
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
      <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-3b)', textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.5 }}>
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
        <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-3b)', textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.5 }}>
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
      <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-3b)', textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.5 }}>
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
  const waHref = 'https://app.hbcconecta.com.br/index.html#/atendimentos/chat/'
  const mailHref = lead.email ? `mailto:${lead.email}` : null
  const actionBtnStyle = (enabled: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 7, padding: '9px 15px', borderRadius: 10,
    fontSize: 13, fontWeight: 600, border: '1px solid var(--border-in)', background: 'var(--bg-card)',
    color: 'var(--text-2)', textDecoration: 'none', cursor: enabled ? 'pointer' : 'not-allowed',
    opacity: enabled ? 1 : 0.4, boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
  })

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

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
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
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 21, fontWeight: 800, color: 'var(--text-1)', margin: 0, letterSpacing: '-0.01em', overflowWrap: 'break-word' }}>{lead.name}</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginTop: 8, fontSize: 12, color: 'var(--text-subtle)' }}>
              <span>Lead desde <b style={{ color: 'var(--text-2)', fontWeight: 700 }}>{fmtDateOnly(lead.created_at)}</b></span>
              <span>Última interação <b style={{ color: 'var(--text-2)', fontWeight: 700 }}>{fmtRelative(lastActivityAt)}</b></span>
              <span>Consultor <b style={{ color: 'var(--text-2)', fontWeight: 700 }}>{lead.attendant ?? 'Não informado'}</b></span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <a href={telHref ?? undefined} style={actionBtnStyle(!!telHref)} onClick={e => { if (!telHref) e.preventDefault() }}>
            <Phone size={15} /> Ligar
          </a>
          <a href={waHref ?? undefined} target="_blank" rel="noreferrer" style={actionBtnStyle(!!waHref)} onClick={e => { if (!waHref) e.preventDefault() }}>
            <WhatsAppIcon /> WhatsApp
          </a>
          <a href={mailHref ?? undefined} style={actionBtnStyle(!!mailHref)} onClick={e => { if (!mailHref) e.preventDefault() }}>
            <Mail size={15} /> E-mail
          </a>
          {isAdmin && (
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setMenuOpen(v => !v)}
                title="Mais opções"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, borderRadius: 10, border: '1px solid var(--border-in)', background: 'var(--bg-card)', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <MoreVertical size={16} />
              </button>
              {menuOpen && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 90 }} onClick={() => setMenuOpen(false)} />
                  <div style={{ position: 'absolute', right: 0, top: 44, zIndex: 100, background: 'var(--bg-card)', border: '1px solid rgba(15,23,42,0.08)', borderRadius: 10, boxShadow: '0 8px 24px rgba(15,23,42,0.14)', minWidth: 160, overflow: 'hidden' }}>
                    <button
                      onClick={() => { setMenuOpen(false); setConfirmDelete(true) }}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: '#DC2626', textAlign: 'left' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                    >
                      <Trash2 size={14} /> Excluir lead
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

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
              {editingDetalhes ? (
                <EditInput label="Valor da Cotação" value={detalhesDraft.value_potential} onChange={v => setDetalhesDraft(d => ({ ...d, value_potential: v }))} />
              ) : (
                <Field label="Valor da Cotação" value={lead.value_potential ? fmtBRL(lead.value_potential) : 'Não informado'} />
              )}
              {isAdmin ? (
                <DateField
                  label="Data de Criação"
                  value={lead.created_at.slice(0, 10)}
                  saving={savingCreatedAt}
                  onChange={handleUpdateCreatedAt}
                />
              ) : (
                <Field label="Data de Criação" value={fmtDate(lead.created_at)} />
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
                        <p style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-3b)', textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.5, margin: '0 0 10px' }}>
                          Detalhes da venda
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {vendaDetails.map(([label, value]) => (
                            <div key={label} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                              <span style={{ flexShrink: 0, fontSize: 9.5, fontWeight: 700, color: 'var(--text-3b)', textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.5 }}>{label}</span>
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

          <SectionCard title="Ação Rápida" icon={Activity}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">

              <div>
                <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-3b)', textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.5 }}>
                  Status
                </div>
                <div style={{ marginTop: 8 }}>
                  {editingStatus ? (
                    statusSubMenu === 'fechado' ? (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        {CLOSED_SUB_OPTIONS.map(opt => {
                          const s = STATUS_STYLE[opt.value] ?? { bg: '#F3F4F6', color: '#6B7280' }
                          return (
                            <button
                              key={opt.value}
                              disabled={savingStatus}
                              onClick={() => handleStatusChange(opt.value)}
                              style={{
                                background: s.bg, color: s.color, border: `1.5px solid ${s.color}`,
                                padding: '4px 14px', borderRadius: 99,
                                fontSize: 13, fontWeight: 600, cursor: savingStatus ? 'not-allowed' : 'pointer',
                                opacity: savingStatus ? 0.6 : 1, transition: 'all 150ms',
                              }}
                            >
                              {opt.label}
                            </button>
                          )
                        })}
                        <button
                          onClick={() => setStatusSubMenu(null)}
                          style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--text-subtle)', cursor: 'pointer', padding: '4px 8px' }}
                        >
                          Voltar
                        </button>
                      </div>
                    ) : statusSubMenu === 'perdido' ? (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        {LOST_REASONS.map(reason => {
                          const s = STATUS_STYLE.sale_not_performed
                          return (
                            <button
                              key={reason}
                              disabled={savingStatus}
                              onClick={() => handleStatusChange('sale_not_performed', reason)}
                              style={{
                                background: s.bg, color: s.color, border: `1.5px solid ${s.color}`,
                                padding: '4px 14px', borderRadius: 99,
                                fontSize: 13, fontWeight: 600, cursor: savingStatus ? 'not-allowed' : 'pointer',
                                opacity: savingStatus ? 0.6 : 1, transition: 'all 150ms',
                              }}
                            >
                              {reason}
                            </button>
                          )
                        })}
                        <button
                          onClick={() => setStatusSubMenu(null)}
                          style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--text-subtle)', cursor: 'pointer', padding: '4px 8px' }}
                        >
                          Voltar
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {STATUS_OPTIONS.map(opt => {
                          const s = STATUS_STYLE[opt.value] ?? { bg: '#F3F4F6', color: '#6B7280' }
                          const active = status === opt.value
                          return (
                            <button
                              key={opt.value}
                              disabled={savingStatus}
                              onClick={() => {
                                if (opt.value === 'fechado') { setStatusSubMenu('fechado'); return }
                                if (opt.value === 'sale_not_performed') { setStatusSubMenu('perdido'); return }
                                handleStatusChange(opt.value)
                              }}
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
                    )
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ background: sStyle.bg, color: sStyle.color, padding: '4px 14px', borderRadius: 99, fontSize: 13, fontWeight: 600 }}>
                        {statusLabel(status)}
                      </span>
                      {history.length > 0 && statusLabel(status) !== 'Venda Realizada' && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)', background: 'var(--bg-subtle)', padding: '3px 10px', borderRadius: 99, fontVariantNumeric: 'tabular-nums' }}>
                          {fmtClock(Date.now() - parseUTC(history[history.length - 1].changed_at))}
                        </span>
                      )}
                      <EditPencil onClick={() => { setEditingStatus(true); setStatusSubMenu(null) }} title="Editar status" />
                    </div>
                  )}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-3b)', textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.5 }}>
                  Temperatura
                </div>
                <div style={{ marginTop: 8 }}>
                  {editingPerception ? (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      {Object.keys(PERCEPTION_STYLE).map(key => {
                        const s = PERCEPTION_STYLE[key]
                        const active = lead.perception === key
                        return (
                          <button
                            key={key}
                            disabled={savingPerception}
                            onClick={() => { handleQuickUpdate('perception', key); setEditingPerception(false) }}
                            style={{
                              background: active ? s.color : s.bg,
                              color: active ? 'white' : s.color,
                              border: `1.5px solid ${s.color}`,
                              padding: '4px 14px', borderRadius: 99,
                              fontSize: 13, fontWeight: 600, cursor: savingPerception ? 'not-allowed' : 'pointer',
                              opacity: savingPerception ? 0.6 : 1,
                              transition: 'all 150ms',
                            }}
                          >
                            {s.label}
                          </button>
                        )
                      })}
                      <button
                        onClick={() => setEditingPerception(false)}
                        style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--text-subtle)', cursor: 'pointer', padding: '4px 8px' }}
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {lead.perception && PERCEPTION_STYLE[lead.perception] ? (
                        <span style={{ background: PERCEPTION_STYLE[lead.perception].bg, color: PERCEPTION_STYLE[lead.perception].color, padding: '4px 14px', borderRadius: 99, fontSize: 13, fontWeight: 600 }}>
                          {PERCEPTION_STYLE[lead.perception].label}
                        </span>
                      ) : (
                        <span style={{ fontSize: 13, color: 'var(--text-subtle)', fontStyle: 'normal' }}>Sem temperatura</span>
                      )}
                      <EditPencil onClick={() => setEditingPerception(true)} title="Editar temperatura" />
                    </div>
                  )}
                </div>
              </div>

              <div ref={agendaRef}>
                <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-3b)', textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.5 }}>
                  Agendar
                </div>
                <div style={{ marginTop: 8 }}>
                  {editingSchedule ? (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <input
                        type="datetime-local"
                        value={scheduleInput}
                        onChange={e => setScheduleInput(e.target.value)}
                        style={{ padding: '6px 9px', height: 34, borderRadius: 8, border: '1px solid var(--border-in)', fontSize: 13, color: 'var(--text-2)', background: 'var(--bg-input)', boxSizing: 'border-box' }}
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
                        {savingSchedule ? 'Salvando…' : activeSchedule ? 'Reagendar' : 'Agendar'}
                      </button>
                      <button
                        onClick={() => setEditingSchedule(false)}
                        style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--text-subtle)', cursor: 'pointer', padding: '4px 8px' }}
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : loadingSchedules ? (
                    <p style={{ fontSize: 13, color: 'var(--text-subtle)' }}>Carregando…</p>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {activeSchedule ? (
                        <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)' }}>{fmtDate(activeSchedule.scheduled_at)}</span>
                      ) : (
                        <span style={{ fontSize: 13, color: 'var(--text-subtle)', fontStyle: 'normal' }}>Nada agendado</span>
                      )}
                      <EditPencil onClick={() => setEditingSchedule(true)} title={activeSchedule ? 'Reagendar' : 'Agendar'} />
                      {activeSchedule && (
                        <button
                          onClick={handleCancelSchedule}
                          disabled={cancelingSchedule}
                          style={{ fontSize: 11.5, color: '#DC2626', background: 'none', border: 'none', cursor: cancelingSchedule ? 'not-allowed' : 'pointer', fontWeight: 500 }}
                        >
                          {cancelingSchedule ? 'Removendo…' : 'Remover'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

            </div>
          </SectionCard>

          <SectionCard title="Atividade" icon={History} action={
            isAdmin && (
              <button
                onClick={handleRealignHistory}
                disabled={savingRealign}
                title="Alinha o histórico de status com a Data de Criação, preservando o intervalo entre as etapas"
                style={{ fontSize: 12, color: 'var(--text-subtle)', background: 'none', border: 'none', cursor: savingRealign ? 'not-allowed' : 'pointer', fontWeight: 500 }}
              >
                {savingRealign ? 'Corrigindo…' : 'Corrigir histórico'}
              </button>
            )
          }>
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

              {loadingActivity ? (
                <p style={{ fontSize: 13, color: 'var(--text-subtle)' }}>Carregando…</p>
              ) : activity.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--text-subtle)' }}>Sem atividade registrada.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {activity.map((ev, i) => {
                    const isFirst = i === 0
                    const rowStyle: React.CSSProperties = { display: 'flex', gap: 12, paddingTop: isFirst ? 0 : 16, marginTop: isFirst ? 0 : 16, borderTop: isFirst ? 'none' : '1px solid var(--border-lt)' }
                    const bubbleStyle = (bg: string): React.CSSProperties => ({ flexShrink: 0, width: 28, height: 28, borderRadius: 8, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' })

                    if (ev.kind === 'status') {
                      const c = statusColor(ev.status)
                      const isVendaRealizada = statusLabel(ev.status) === 'Venda Realizada'
                      return (
                        <div key={`s-${i}`} style={rowStyle}>
                          <div style={bubbleStyle(c.bg)}>
                            <Activity size={13} color={c.color} strokeWidth={2.25} />
                          </div>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
                              <b style={{ color: 'var(--text-1)', fontWeight: 700 }}>{ev.by ?? 'Sistema'}</b>{' '}
                              {ev.isCreation ? (
                                <>criou o lead como <b style={{ color: c.color, fontWeight: 700 }}>{statusLabel(ev.status)}</b></>
                              ) : (
                                <>moveu para <b style={{ color: c.color, fontWeight: 700 }}>{statusLabel(ev.status)}</b></>
                              )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
                              <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>{fmtDate(ev.at)}</span>
                              {!(ev.ongoing && isVendaRealizada) && (
                                <span style={{
                                  fontSize: 10.5, fontWeight: 700, color: ev.ongoing ? c.color : 'var(--text-subtle)',
                                  background: ev.ongoing ? c.bg : 'var(--bg-hover)', padding: '1px 8px', borderRadius: 99,
                                }}>
                                  {fmtDuration(ev.durationMs)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    }
                    if (ev.kind === 'note') {
                      return (
                        <div key={`n-${i}`} style={rowStyle}>
                          <div style={bubbleStyle('var(--bg-subtle)')}>
                            <StickyNote size={13} color="var(--text-3b)" strokeWidth={2.25} />
                          </div>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
                              <b style={{ color: 'var(--text-1)', fontWeight: 700 }}>{ev.by}</b> adicionou uma nota
                            </div>
                            <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '6px 0 0', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: 'var(--bg-subtle)', borderRadius: 8, padding: '9px 12px' }}>
                              {ev.content}
                            </p>
                            <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 5 }}>{fmtDate(ev.at)}</div>
                          </div>
                        </div>
                      )
                    }
                    return (
                      <div key={`a-${i}`} style={rowStyle}>
                        <div style={bubbleStyle('#EFF6FF')}>
                          <CalendarClock size={13} color="#2563EB" strokeWidth={2.25} />
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
                            <b style={{ color: 'var(--text-1)', fontWeight: 700 }}>{ev.by ?? 'Sistema'}</b> agendou um retorno para{' '}
                            <b style={{ color: '#2563EB', fontWeight: 700 }}>{fmtDate(ev.scheduledAt)}</b>
                            {!ev.active && <span style={{ color: 'var(--text-subtle)', fontStyle: 'normal' }}> (substituído)</span>}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 5 }}>{fmtDate(ev.at)}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </SectionCard>

        </div>
      </div>

    </div>
    </div>
  )
}
