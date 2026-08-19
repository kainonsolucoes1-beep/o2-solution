import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../api'
import { statusLabel } from '../utils/statusLabel'
import { parseUTC } from '../utils/date'
import { fmtDate, fmtDateOnly, fmtDuration, fmtClock, fmtRelative, fmtBRL, parseBRNumber } from '../utils/leadFormat'
import { STATUS_STYLE, PERCEPTION_STYLE } from '../utils/leadStatus'
import { useTheme } from '../ThemeContext'
import LeadDetailHeader from '../components/LeadDetailHeader'
import LeadNextStepPanel from '../components/LeadNextStepPanel'
import LeadActivityTimeline from '../components/LeadActivityTimeline'
import LeadNegotiationPanel from '../components/LeadNegotiationPanel'
import LeadCurrentStatusPanel from '../components/LeadCurrentStatusPanel'
import LeadRegistrationPanel from '../components/LeadRegistrationPanel'
import LeadFinanceiroPanel from '../components/LeadFinanceiroPanel'

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
  receita_titular: string | null
  receita_promotora: string | null
  receita_modalidade: string | null
  receita_operadora: string | null
  receita_categoria: string | null
  receita_data_venda: string | null
  receita_origem: string | null
  visibility_tag: string | null
  operadoras_enviadas: string | null
  modalidade: string | null
  document: string | null
  created_at: string
  retrabalhado_em: string | null
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

export type ActivityFilter = 'Todos' | 'Status' | 'Notas'

// pontos de conversao fixos, disponiveis mesmo sem nenhum lead ainda usar esse valor
const EXTRA_CONVERSION_POINTS = ['Campanha WhatsApp']

export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { dark } = useTheme()

  const [lead, setLead]                   = useState<LeadItem | null>(null)
  const [notFound, setNotFound]           = useState(false)
  const [me, setMe]                       = useState<Me | null>(null)
  const [status, setStatus]               = useState('novo')
  const [editingStatus, setEditingStatus] = useState(false)
  const [statusSubMenu, setStatusSubMenu] = useState<'fechado' | 'perdido' | 'finalizar' | 'venda_realizada' | null>(null)
  const [savingStatus, setSavingStatus]   = useState(false)
  const [notes, setNotes]                 = useState<Note[]>([])
  const [loadingNotes, setLoadingNotes]   = useState(true)
  const [noteText, setNoteText]           = useState('')
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('Todos')
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
  const [editingProposta, setEditingProposta] = useState(false)
  const [propostaValor, setPropostaValor] = useState('')
  const [savingProposta, setSavingProposta] = useState(false)
  const [vendaValor, setVendaValor] = useState('')
  const [vendaData, setVendaData] = useState('')
  const [savingVenda, setSavingVenda] = useState(false)
  const [faturando, setFaturando] = useState(false)
  const [retrabalhando, setRetrabalhando] = useState(false)
  const [finalizarFlow, setFinalizarFlow] = useState(false)
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

  function handleRegistrarVenda() {
    if (!id || !vendaValor.trim() || !vendaData) return
    setSavingVenda(true)
    api.post(`/api/v1/leads/${id}/venda`, { valor: parseBRNumber(vendaValor), data_venda: vendaData })
      .then(() => handleStatusChange('waiting_billing'))
      .catch(() => setToast({ msg: 'Erro ao registrar venda', ok: false }))
      .finally(() => setSavingVenda(false))
  }

  function handleFaturar() {
    if (!id) return
    setFaturando(true)
    api.post(`/api/v1/leads/${id}/faturar`)
      .then(() => handleStatusChange('sale_performed'))
      .catch(() => setToast({ msg: 'Erro ao faturar', ok: false }))
      .finally(() => setFaturando(false))
  }

  function handleRetrabalhar() {
    if (!id) return
    setRetrabalhando(true)
    api.post(`/api/v1/leads/${id}/retrabalhar`)
      .then(() => {
        setStatus('novo')
        setToast({ msg: 'Lead retrabalhado com sucesso', ok: true })
        return Promise.all([
          api.get<LeadItem>(`/api/v1/leads/${id}`),
          api.get<{ history: StatusHistoryItem[] }>(`/api/v1/leads/${id}/status-history`),
          api.get<{ notes: Note[] }>(`/api/v1/leads/${id}/notes`),
        ])
      })
      .then(([leadRes, histRes, notesRes]) => {
        setLead(leadRes.data)
        setHistory(histRes.data.history)
        setNotes(notesRes.data.notes)
      })
      .catch(() => setToast({ msg: 'Erro ao retrabalhar lead', ok: false }))
      .finally(() => setRetrabalhando(false))
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
    if (detalhesDraft.value_potential.trim()) payload.value_potential = parseBRNumber(detalhesDraft.value_potential)
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

  function closeAllEditing() {
    setEditingStatus(false)
    setEditingPerception(false)
    setEditingSchedule(false)
    setEditingProposta(false)
    setStatusSubMenu(null)
    setFinalizarFlow(false)
  }

  function handleRegistrarProposta() {
    if (!id) return
    setSavingProposta(true)
    const payload: { value_potential?: number } = {}
    if (propostaValor.trim()) payload.value_potential = parseBRNumber(propostaValor)
    api.post(`/api/v1/leads/${id}/info`, payload)
      .then(() => api.get<LeadItem>(`/api/v1/leads/${id}`))
      .then(r => { setLead(r.data); setEditingProposta(false) })
      .then(() => handleStatusChange('proposta'))
      .catch(() => setToast({ msg: 'Erro ao registrar proposta', ok: false }))
      .finally(() => setSavingProposta(false))
  }

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

  const visibleActivity = activityFilter === 'Todos' ? activity
    : activity.filter(ev => activityFilter === 'Status' ? ev.kind === 'status' : ev.kind === 'note')

  const loadingActivity = loadingNotes || loadingHistory || loadingSchedules
  const lastActivityAt = activity.length > 0 ? activity[0].at : lead.created_at
  const activeSchedule = schedules.find(s => s.is_active)
  const acaoRapidaEditing = editingStatus || editingPerception || editingSchedule
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const interacoes7d = activity.filter(ev => parseUTC(ev.at) >= sevenDaysAgo).length

  const perception = lead.perception && PERCEPTION_STYLE[lead.perception] ? PERCEPTION_STYLE[lead.perception] : null
  const funnelTimeLabel = fmtDuration(Date.now() - parseUTC(lead.created_at))
  const scheduleLabel = activeSchedule ? fmtDate(activeSchedule.scheduled_at) : 'Nada agendado'

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
        statusLabel={statusLabel(status)}
        sStyle={sStyle}
        perceptionLabel={perception?.label ?? null}
        perceptionStyle={perception}
        phoneLabel={lead.phone ?? 'Não informado'}
        emailLabel={lead.email ?? 'Não informado'}
        attendantLabel={lead.attendant ?? 'Não informado'}
        origemLabel={lead.origem ?? 'Não informado'}
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

      <LeadNextStepPanel
        editing={acaoRapidaEditing}
        telHref={telHref}
        mailHref={mailHref}
        onToggleEditing={() => {
          const next = !acaoRapidaEditing
          setEditingStatus(next)
          setEditingPerception(next)
          setEditingSchedule(next)
          setEditingProposta(false)
          setFinalizarFlow(false)
          if (next) setStatusSubMenu(null)
        }}
        onOpenSchedule={() => {
          setEditingSchedule(true)
          setEditingStatus(false)
          setEditingPerception(true)
          setEditingProposta(false)
          setStatusSubMenu(null)
        }}
        onOpenProposta={() => {
          setEditingProposta(true)
          setEditingStatus(false)
          setEditingPerception(true)
          setEditingSchedule(true)
          setStatusSubMenu(null)
          setPropostaValor(lead?.value_potential != null ? String(lead.value_potential) : '')
        }}
        onOpenFinalizar={() => {
          setEditingStatus(true)
          setEditingPerception(false)
          setEditingSchedule(false)
          setEditingProposta(false)
          setFinalizarFlow(true)
          setStatusSubMenu('finalizar')
        }}

        status={status}
        editingStatus={editingStatus}
        statusSubMenu={statusSubMenu}
        savingStatus={savingStatus}
        onStatusOptionClick={value => {
          if (value === 'fechado') { setStatusSubMenu('fechado'); return }
          if (value === 'sale_not_performed') { setStatusSubMenu('perdido'); return }
          handleStatusChange(value)
        }}
        onClosedSubClick={value => handleStatusChange(value)}
        onLostReasonClick={reason => handleStatusChange('sale_not_performed', reason)}
        onBackToStatusOptions={() => setStatusSubMenu(finalizarFlow ? 'finalizar' : null)}
        onCancelStatusEdit={closeAllEditing}
        onVendaRealizadaClick={() => setStatusSubMenu('venda_realizada')}
        onBackToFinalizar={() => setStatusSubMenu('finalizar')}

        perception={lead.perception}
        editingPerception={editingPerception}
        savingPerception={savingPerception}
        onPerceptionClick={key => { handleQuickUpdate('perception', key); setEditingPerception(false) }}
        onCancelPerceptionEdit={closeAllEditing}

        agendaRef={agendaRef}
        editingSchedule={editingSchedule}
        scheduleInput={scheduleInput}
        onScheduleInputChange={setScheduleInput}
        savingSchedule={savingSchedule}
        loadingSchedules={loadingSchedules}
        activeSchedule={activeSchedule}
        cancelingSchedule={cancelingSchedule}
        onSaveSchedule={handleSchedule}
        onCancelScheduleEdit={closeAllEditing}
        onRemoveSchedule={handleCancelSchedule}

        editingProposta={editingProposta}
        propostaValor={propostaValor}
        onPropostaValorChange={setPropostaValor}
        savingProposta={savingProposta}
        onSaveProposta={handleRegistrarProposta}
        onCancelPropostaEdit={closeAllEditing}

        vendaValor={vendaValor}
        onVendaValorChange={setVendaValor}
        vendaData={vendaData}
        onVendaDataChange={setVendaData}
        savingVenda={savingVenda}
        onSaveVenda={handleRegistrarVenda}
        faturando={faturando}
        onFaturar={handleFaturar}
        onRetrabalhar={handleRetrabalhar}
        retrabalhando={retrabalhando}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] items-start" style={{ marginTop: 20, gap: 20 }}>
        <div>
          <LeadActivityTimeline
            isAdmin={isAdmin}
            savingRealign={savingRealign}
            onRealignHistory={handleRealignHistory}
            noteText={noteText}
            onNoteTextChange={setNoteText}
            savingNote={savingNote}
            onSaveNote={handleSaveNote}
            loadingActivity={loadingActivity}
            activity={visibleActivity}
            filter={activityFilter}
            onFilterChange={setActivityFilter}
          />
        </div>

        <div className="flex flex-col" style={{ gap: 12 }}>

          <div style={{
            background: 'var(--bg-card)', border: `1px solid ${dark ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.04)'}`,
            borderRadius: 10, padding: '11px 15px', boxShadow: dark ? '0 1px 2px rgba(0,0,0,0.14)' : '0 1px 2px rgba(15,23,42,0.05)',
          }}>
            <p style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3b)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 3px' }}>
              Consulta auxiliar
            </p>
            <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', margin: 0, letterSpacing: '-0.01em' }}>
              Contexto da venda
            </p>
          </div>

          <LeadNegotiationPanel
            perceptionLabel={perception?.label ?? null}
            perceptionStyle={perception}
            modalidade={lead.modalidade ?? ''}
            modalidadeOptions={modalidades}
            savingModalidade={savingModalidade}
            onModalidadeChange={v => handleQuickUpdate('modalidade', v)}
            planoAtual={lead.current_plan}
            valorCotacaoLabel={fmtBRL(lead.value_potential)}
            operadoras={lead.operadoras_enviadas}
            savingOperadoras={savingOperadoras}
            onOperadorasChange={v => handleQuickUpdate('operadoras_enviadas', v)}
            editingDetalhes={editingDetalhes}
            savingDetalhes={savingDetalhes}
            detalhesDraft={detalhesDraft}
            onDraftChange={(field, value) => setDetalhesDraft(d => ({ ...d, [field]: value }))}
            onStartEdit={startEditDetalhes}
            onCancelEdit={() => setEditingDetalhes(false)}
            onSaveEdit={handleSaveDetalhes}
            isAdmin={isAdmin}
            createdAtValue={lead.created_at.slice(0, 10)}
            savingCreatedAt={savingCreatedAt}
            onUpdateCreatedAt={handleUpdateCreatedAt}
          />

          <LeadCurrentStatusPanel
            attendantLabel={lead.attendant ?? 'Não informado'}
            lastInteractionLabel={fmtRelative(lastActivityAt)}
            funnelTimeLabel={funnelTimeLabel}
            scheduleLabel={scheduleLabel}
            interactionsLabel={String(interacoes7d)}
            lastChangeLabel={fmtRelative(lastActivityAt)}
            lastChangeDate={fmtDate(lastActivityAt)}
            statusDurationLabel={statusDurationLabel}
            retrabalhadoEmLabel={lead.retrabalhado_em ? fmtDate(lead.retrabalhado_em) : null}
          />

          <LeadRegistrationPanel
            origem={lead.origem ?? ''}
            origemOptions={origins}
            savingOrigem={savingOrigin}
            onOrigemChange={v => handleQuickUpdate('origem', v)}
            conversionPoint={lead.conversion_point ?? ''}
            conversionPointOptions={conversionPointOptions}
            savingConversionPoint={savingConvPoint}
            onConversionPointChange={v => handleQuickUpdate('conversion_point', v)}
            leadSinceLabel={fmtDateOnly(lead.created_at)}
            documentoLabel={lead.document ?? 'Não informado'}
            empresaLabel={lead.company ?? 'Não informado'}
            visibilityTag={lead.visibility_tag}
            editingInfo={editingInfo}
            savingInfo={savingInfo}
            infoDraft={infoDraft}
            onDraftChange={(field, value) => setInfoDraft(d => ({ ...d, [field]: value }))}
            onStartEdit={startEditInfo}
            onCancelEdit={() => setEditingInfo(false)}
            onSaveEdit={handleSaveInfo}
          />

          {canSeeFinancials && id && (
            <LeadFinanceiroPanel
              leadId={id}
              modalidadeOptions={modalidades}
              titularLabel={lead.receita_titular ?? 'Não informado'}
              promotoraLabel={lead.receita_promotora ?? 'Não informado'}
              modalidadeLabel={lead.receita_modalidade ?? 'Não informado'}
              operadoraLabel={lead.receita_operadora ?? 'Não informado'}
              categoriaLabel={lead.receita_categoria ?? 'Não informado'}
              dataVendaLabel={lead.receita_data_venda ? fmtDateOnly(lead.receita_data_venda) : 'Não informado'}
              dataVendaRaw={lead.receita_data_venda}
              onSaved={() => api.get<LeadItem>(`/api/v1/leads/${id}`).then(r => setLead(r.data))}
            />
          )}

        </div>
      </div>

    </div>
    </div>
  )
}
