import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { Filter, X, Trash2, RotateCcw, Plus } from 'lucide-react'
import api from '../api'
import { statusLabel } from '../utils/statusLabel'
import { parseUTC } from '../utils/date'
import SectionTitle from '../components/SectionTitle'
import Combobox from '../components/Combobox'
import { useTheme } from '../ThemeContext'

interface Me {
  id: string
  username: string
  first_name: string | null
  role: string
}

type Operator = string

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
  is_renutrucao: boolean
  lost_reason: string | null
  lost_message: string | null
  created_at: string
  updated_at: string | null
  modalidade: string | null
}

interface ReportResponse {
  total: number
  page: number
  limit: number
  leads: LeadItem[]
}

interface ReportStats {
  total: number
  fechados: number
  perdidos: number
  quentes: number
}

// avatar neutro (cinza-azulado) pra todo mundo, em vez de girar por uma paleta saturada
function avatarColor(_name: string) {
  return '#94A3B8'
}
function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

type SortKey = keyof LeadItem

const LIMIT = 10

const today = new Date().toISOString().slice(0, 10)
const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  .toISOString()
  .slice(0, 10)

const FILTERS_STORAGE_KEY = 'leadsReportFilters'

const STATUS_PERDIDO = 'sale_not_performed'
const STATUS_FECHADO = 'waiting_billing,sale_performed,fechado,closed,won,convertido'
const STATUS_AGUARDANDO_FATURAMENTO = 'waiting_billing'
const STATUS_VENDA_REALIZADA = 'sale_performed,fechado,closed,won,convertido'

const TEAM_OPTIONS = [
  { label: 'São Paulo', value: 'Equipe São Paulo' },
  { label: 'Recife', value: 'Equipe Pernambuco' },
]

interface StoredFilters {
  dateFrom: string
  dateTo: string
  origem: string
  modalidadeFilter: string
  statusFilter: string
  perceptionFilter: string
  search: string
  lostReasonFilter: string
  closedSubStatus: string
  teamFilter: string
}

function loadStoredFilters(): Partial<StoredFilters> {
  try {
    const raw = localStorage.getItem(FILTERS_STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

const STATUS_STYLE: Record<string, { color: string }> = {
  novo: { color: '#3B82F6' },
  new: { color: '#3B82F6' },
  pending: { color: '#3B82F6' },
  qualificado: { color: '#7C3AED' },
  qualified: { color: '#7C3AED' },
  scheduled: { color: '#7C3AED' },
  proposta: { color: '#D97706' },
  proposal_sent: { color: '#D97706' },
  waiting_billing: { color: '#0D9488' },
  sale_performed: { color: '#059669' },
  fechado: { color: '#059669' },
  closed: { color: '#059669' },
  won: { color: '#059669' },
  convertido: { color: '#059669' },
  converted: { color: '#059669' },
  sale_not_performed: { color: '#DC2626' },
}

const PERCEPTION_STYLE: Record<string, { color: string }> = {
  quente: { color: '#DC2626' },
  morno: { color: '#D97706' },
  frio: { color: '#60A5FA' },
}

function PerceptionBadge({ perception }: { perception: string | null }) {
  if (!perception) return <span style={{ color: 'var(--text-subtle)', fontSize: 13 }}>—</span>
  const s = PERCEPTION_STYLE[perception.toLowerCase()] ?? { color: '#6B7280' }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
      {perception}
    </span>
  )
}

function fmtDate(iso: string) {
  return new Date(parseUTC(iso)).toLocaleDateString('pt-BR')
}

function fmtBRL(n: number | null) {
  if (n == null) return '—'
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function StatusBadge({ status }: { status: string | null }) {
  const key = (status ?? 'novo').toLowerCase()
  const s = STATUS_STYLE[key] ?? { color: '#6B7280' }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
      {statusLabel(status)}
    </span>
  )
}

function getPagesRange(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  if (current <= 4) return [1, 2, 3, 4, 5, '...', total]
  if (current >= total - 3) return [1, '...', total - 4, total - 3, total - 2, total - 1, total]
  return [1, '...', current - 1, current, current + 1, '...', total]
}

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'created_at',     label: 'Criado em' },
  { key: 'updated_at',     label: 'Atualizado em' },
  { key: 'name',           label: 'Cliente' },
  { key: 'origem',         label: 'Origem' },
  { key: 'modalidade',     label: 'Modalidade' },
  { key: 'perception',     label: 'Temperatura' },
  { key: 'status',         label: 'Status' },
]

export default function LeadsReport() {
  const { dark } = useTheme()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [me, setMe]               = useState<Me | null>(null)
  const [operators, setOperators] = useState<Operator[]>([])
  const [modalidades, setModalidades] = useState<string[]>([])
  const [conversionPoints, setConversionPoints] = useState<string[]>([])
  const [lostReasons, setLostReasons] = useState<string[]>([])
  const storedFilters = loadStoredFilters()
  // Se a URL chegou com filtros (ex: clique num card do Pipeline), ela representa uma
  // pesquisa nova e completa: os campos que ela nao especifica devem cair no padrao,
  // nao no filtro salvo de uma pesquisa anterior (que podia conflitar e zerar o resultado).
  const cameFromUrlFilters = searchParams.toString().length > 0
  const [dateFrom, setDateFrom]   = useState(() => searchParams.get('date_from') ?? (cameFromUrlFilters ? monthStart : storedFilters.dateFrom ?? monthStart))
  const [dateTo, setDateTo]       = useState(() => searchParams.get('date_to') ?? (cameFromUrlFilters ? today : storedFilters.dateTo ?? today))
  const [origem, setOrigem]       = useState(() => searchParams.get('origem') ?? (cameFromUrlFilters ? '' : storedFilters.origem ?? ''))
  const [modalidadeFilter, setModalidadeFilter] = useState(() => searchParams.get('modalidade') ?? (cameFromUrlFilters ? '' : storedFilters.modalidadeFilter ?? ''))
  const [conversionPointFilter, setConversionPointFilter] = useState(() => searchParams.get('conversion_point') ?? '')
  const [search, setSearch]       = useState(() => searchParams.get('search') ?? (cameFromUrlFilters ? '' : storedFilters.search ?? ''))
  const [page, setPage]           = useState(1)
  const [report, setReport]       = useState<ReportResponse | null>(null)
  const [stats, setStats]         = useState<ReportStats | null>(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get('status') ?? (cameFromUrlFilters ? '' : storedFilters.statusFilter ?? ''))
  const [perceptionFilter, setPerceptionFilter] = useState(() => searchParams.get('perception') ?? (cameFromUrlFilters ? '' : storedFilters.perceptionFilter ?? ''))
  const [lostReasonFilter, setLostReasonFilter] = useState(() => searchParams.get('lost_reason') ?? (cameFromUrlFilters ? '' : storedFilters.lostReasonFilter ?? ''))
  const [closedSubStatus, setClosedSubStatus] = useState(() => (cameFromUrlFilters ? '' : storedFilters.closedSubStatus ?? ''))
  const [teamFilter, setTeamFilter] = useState(() => searchParams.get('team') ?? (cameFromUrlFilters ? '' : storedFilters.teamFilter ?? ''))
  const vencidosFilter = searchParams.get('vencidos') === '1'
  const [searched, setSearched]   = useState(false)
  const [sortCol, setSortCol]     = useState<SortKey | null>(null)
  const [sortDir, setSortDir]     = useState<'asc' | 'desc'>('asc')
  const [filterOpen, setFilterOpen] = useState(false)
  const [selected, setSelected]   = useState<Set<string>>(new Set())
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [deleting, setDeleting]   = useState(false)
  const [newLeadOpen, setNewLeadOpen] = useState(false)
  const [savingNewLead, setSavingNewLead] = useState(false)
  const [newLeadError, setNewLeadError] = useState('')
  const [newLead, setNewLead] = useState({
    name: '', company: '', email: '', phone: '', document: '',
    origin: '', modalidade: '', categoria: '', conversion_point: '', value_potential: '', attendant: '', notes: '', visibility_tag: '',
  })

  function resetNewLead() {
    setNewLead({ name: '', company: '', email: '', phone: '', document: '', origin: '', modalidade: '', categoria: '', conversion_point: '', value_potential: '', attendant: '', notes: '', visibility_tag: '' })
    setNewLeadError('')
  }

  function handleCreateLead() {
    if (!newLead.name.trim()) { setNewLeadError('Nome é obrigatório'); return }
    setSavingNewLead(true)
    setNewLeadError('')
    api.post<{ id: string }>('/api/v1/leads', {
      name: newLead.name.trim(),
      company: newLead.company.trim() || null,
      email: newLead.email.trim() || null,
      phone: newLead.phone.trim() || null,
      document: newLead.document.trim() || null,
      origin: newLead.origin || null,
      modalidade: newLead.modalidade || null,
      categoria: newLead.categoria || null,
      conversion_point: newLead.conversion_point || null,
      value_potential: newLead.value_potential ? Number(newLead.value_potential) : null,
      attendant: newLead.attendant.trim() || null,
      notes: newLead.notes.trim() || null,
      visibility_tag: newLead.visibility_tag.trim() || null,
    })
      .then(r => {
        setNewLeadOpen(false)
        resetNewLead()
        navigate(`/leads/${r.data.id}`)
      })
      .catch(err => setNewLeadError(err.response?.data?.detail || 'Erro ao criar lead'))
      .finally(() => setSavingNewLead(false))
  }

  useEffect(() => {
    if (!filterOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setFilterOpen(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [filterOpen])

  useEffect(() => {
    const toStore: StoredFilters = { dateFrom, dateTo, origem, modalidadeFilter, statusFilter, perceptionFilter, search, lostReasonFilter, closedSubStatus, teamFilter }
    localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(toStore))
  }, [dateFrom, dateTo, origem, modalidadeFilter, statusFilter, perceptionFilter, search, lostReasonFilter, closedSubStatus, teamFilter])

  const [clearTrigger, setClearTrigger] = useState(0)

  function clearFilters() {
    setDateFrom(monthStart)
    setDateTo(today)
    setOrigem('')
    setModalidadeFilter('')
    setStatusFilter('')
    setPerceptionFilter('')
    setConversionPointFilter('')
    setSearch('')
    setLostReasonFilter('')
    setClosedSubStatus('')
    setTeamFilter('')
    setFilterOpen(false)
    setClearTrigger(c => c + 1)
  }

  useEffect(() => {
    if (!localStorage.getItem('token')) { navigate('/login'); return }
    api.get<Me>('/api/v1/auth/me')
      .then(r => {
        setMe(r.data)
        api.get<string[]>('/api/v1/leads/origins').then(u => setOperators(u.data))
        api.get<string[]>('/api/v1/leads/modalidades').then(u => setModalidades(u.data))
        api.get<string[]>('/api/v1/leads/conversion-points').then(u => setConversionPoints(u.data))
        if (r.data.role === 'admin' || r.data.username === 'lucas@o2solution.com.br') {
          api.get<string[]>('/api/v1/leads/lost-reasons').then(u => setLostReasons(u.data))
        }
      })
      .catch(() => navigate('/login'))
  }, [navigate])

  useEffect(() => {
    if (statusFilter !== STATUS_PERDIDO) setLostReasonFilter('')
    if (statusFilter !== STATUS_FECHADO) setClosedSubStatus('')
  }, [statusFilter])

  useEffect(() => {
    if (me) fetchReport(1)
  }, [me]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (searched) fetchReport(1)
  }, [perceptionFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (searched) fetchReport(1)
  }, [conversionPointFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  const isAdmin = me !== null && (me.role === 'admin' || me.username === 'lucas@o2solution.com.br')

  const fetchReport = useCallback(
    (p: number) => {
      setLoading(true)
      setError('')

      const params: Record<string, string | number | boolean> = {
        date_from: dateFrom,
        date_to:   dateTo,
        page:      p,
        limit:     LIMIT,
      }
      if (vencidosFilter) params.vencidos = true
      if (isAdmin && origem) params.origem = origem
      if (statusFilter) params.status = closedSubStatus || statusFilter
      if (perceptionFilter) params.perception = perceptionFilter
      if (isAdmin && modalidadeFilter) params.modalidade = modalidadeFilter
      if (conversionPointFilter) params.conversion_point = conversionPointFilter
      if (statusFilter === STATUS_PERDIDO && lostReasonFilter) params.lost_reason = lostReasonFilter
      if (teamFilter) params.team = teamFilter
      if (search.trim()) params.search = search.trim()

      api
        .get<ReportResponse>('/api/v1/leads/by-period', { params })
        .then(r => {
          setReport(r.data)
          setPage(p)
          setSearched(true)
          setSortCol(null)
          setSelected(new Set())
        })
        .catch(err => {
          if (err.response?.status === 401) { navigate('/login') }
          else setError('Erro ao buscar leads. Tente novamente.')
        })
        .finally(() => setLoading(false))

      api.get<ReportStats>('/api/v1/leads/report-stats', { params })
        .then(r => setStats(r.data))
        .catch(() => setStats(null))
    },
    [dateFrom, dateTo, origem, statusFilter, perceptionFilter, modalidadeFilter, conversionPointFilter, lostReasonFilter, closedSubStatus, teamFilter, search, vencidosFilter, isAdmin, navigate],
  )

  useEffect(() => {
    if (clearTrigger > 0) fetchReport(1)
  }, [clearTrigger]) // eslint-disable-line react-hooks/exhaustive-deps

  const [exporting, setExporting] = useState(false)

  async function exportExcel() {
    setExporting(true)
    try {
      const params: Record<string, string | number | boolean> = {
        date_from: dateFrom,
        date_to:   dateTo,
        page:      1,
        limit:     9999,
      }
      if (vencidosFilter) params.vencidos = true
      if (isAdmin && origem) params.origem = origem
      if (statusFilter) params.status = closedSubStatus || statusFilter
      if (perceptionFilter) params.perception = perceptionFilter
      if (isAdmin && modalidadeFilter) params.modalidade = modalidadeFilter
      if (conversionPointFilter) params.conversion_point = conversionPointFilter
      if (statusFilter === STATUS_PERDIDO && lostReasonFilter) params.lost_reason = lostReasonFilter
      if (teamFilter) params.team = teamFilter
      if (search.trim()) params.search = search.trim()

      const { data } = await api.get<ReportResponse>('/api/v1/leads/by-period', { params })
      const rows = data.leads.map(l => ({
        'Criado em':       fmtDate(l.created_at),
        'Atualizado em':   l.updated_at ? fmtDate(l.updated_at) : '',
        'Cliente':         l.name,
        'Email':           l.email ?? '',
        'Telefone':        l.phone ?? '',
        'Origem':          l.origem ?? '',
        'Modalidade':      l.modalidade ?? '',
        'Status':          statusLabel(l.status),
        'Motivo de perda': l.lost_reason ?? '',
        'Valor (R$)':      l.value_potential ?? '',
        'Renutrição':      l.is_renutrucao ? 'Sim' : 'Não',
      }))
      const ws   = XLSX.utils.json_to_sheet(rows)
      const wb   = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Leads')
      const filename = `leads_${dateFrom}_${dateTo}.xlsx`
      XLSX.writeFile(wb, filename)
    } catch (err) {
      if ((err as { response?: { status?: number } }).response?.status === 401) navigate('/login')
      else setError('Erro ao exportar. Tente novamente.')
    } finally {
      setExporting(false)
    }
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    setSelected(prev => {
      if (!report) return prev
      const allSelected = report.leads.every(l => prev.has(l.id))
      if (allSelected) return new Set()
      return new Set(report.leads.map(l => l.id))
    })
  }

  async function deleteSelected() {
    setDeleting(true)
    try {
      await api.delete('/api/v1/leads/bulk', { data: { ids: [...selected] } })
      setConfirmDeleteOpen(false)
      fetchReport(page)
    } catch {
      setError('Erro ao excluir leads. Tente novamente.')
    } finally {
      setDeleting(false)
    }
  }

  function handleSearch() { fetchReport(1) }

  function handleSort(col: SortKey) {
    if (sortCol === col) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortCol(col)
      setSortDir('asc')
    }
  }

  const sortedLeads = report
    ? [...report.leads].sort((a, b) => {
        if (!sortCol) return 0
        let av: unknown = a[sortCol]
        let bv: unknown = b[sortCol]
        if (av == null) av = ''
        if (bv == null) bv = ''
        const as = typeof av === 'string' ? av.toLowerCase() : av
        const bs = typeof bv === 'string' ? bv.toLowerCase() : bv
        if (as! < bs!) return sortDir === 'asc' ? -1 : 1
        if (as! > bs!) return sortDir === 'asc' ? 1 : -1
        return 0
      })
    : []

  const totalPages = report ? Math.ceil(report.total / LIMIT) : 0
  const myName = me ? (me.first_name ?? me.username) : ''

  const labelStyle = { fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }

  return (
    <>
    <main className="px-4 md:px-8 xl:px-12 py-6 flex flex-col gap-6" style={{ background: dark ? 'transparent' : '#EEF1F5', minHeight: '100%' }}>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-2)', margin: 0 }}>Relatório de Leads</h1>
              {report && (
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-subtle)' }}>{report.total} lead{report.total !== 1 ? 's' : ''}</span>
              )}
            </div>
            {vencidosFilter && (
              <p style={{ fontSize: 13, color: '#EF4444', marginTop: 2, fontWeight: 500 }}>
                ⚠️ Exibindo leads vencidos — sem atenção nas últimas 24h
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {conversionPointFilter && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.2)', borderRadius: 99, padding: '4px 10px 4px 12px' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#7C3AED' }}>Ponto de conversão: {conversionPointFilter}</span>
                <button onClick={() => setConversionPointFilter('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7C3AED', display: 'flex', alignItems: 'center', padding: 0 }}>
                  <X size={13} />
                </button>
              </div>
            )}
            {isAdmin && selected.size > 0 && (
              <button
                onClick={() => setConfirmDeleteOpen(true)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '9px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                  background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA',
                  cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                }}
              >
                <Trash2 size={15} />
                Excluir ({selected.size})
              </button>
            )}
            <button
              onClick={() => { resetNewLead(); setNewLeadOpen(true) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '9px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                background: '#2563EB', color: '#fff', border: '1px solid #2563EB',
                cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
              }}
            >
              <Plus size={15} />
              Novo Lead
            </button>
            <button
              onClick={() => setFilterOpen(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '9px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                background: 'var(--bg-card)', color: 'var(--text-2)', border: '1px solid var(--border)',
                cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
              }}
            >
              <Filter size={15} />
              Filtros
            </button>
          </div>
        </div>

        {stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
            {([
              { label: 'Total',     value: stats.total,     accent: '#7C93C4' },
              { label: 'Fechados',  value: stats.fechados,  accent: '#6FA88C' },
              { label: 'Perdidos',  value: stats.perdidos,  accent: '#C48787' },
              { label: 'Quentes',   value: stats.quentes,   accent: '#C4A06F' },
            ] as const).map(s => (
              <div key={s.label} style={{ position: 'relative', overflow: 'hidden', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px' }}>
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: s.accent }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', marginBottom: 8 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.accent, flexShrink: 0 }} />
                  {s.label}
                </div>
                <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
              </div>
            ))}
          </div>
        )}

        {error && <p style={{ color: '#EF4444', fontSize: 13 }}>{error}</p>}

        {!searched && !loading && (
          <div
            className="text-center py-16 bg-white rounded-xl"
            style={{ color: 'var(--text-subtle)', fontSize: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}
          >
            Selecione os filtros e clique em <strong>Buscar</strong> para ver os leads.
          </div>
        )}

        {loading && (
          <p className="text-center text-sm py-12" style={{ color: 'var(--text-subtle)' }}>
            Carregando…
          </p>
        )}

        {searched && report && !loading && (
          <>
            <div className="rounded-xl" style={{ background: 'var(--bg-page)' }}>
              {report.leads.length === 0 ? (
                <div className="py-16 text-center bg-white rounded-xl" style={{ color: 'var(--text-subtle)', fontSize: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                  Nenhum lead encontrado para os filtros selecionados.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 8px' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-hover)' }}>
                        {isAdmin && (
                          <th style={{ padding: '11px 12px', border: '1px solid var(--border)', borderLeft: '1px solid var(--border)', borderTopLeftRadius: 10, borderBottomLeftRadius: 10, width: 1 }}>
                            <input
                              type="checkbox"
                              checked={report !== null && report.leads.length > 0 && report.leads.every(l => selected.has(l.id))}
                              onChange={toggleSelectAll}
                              style={{ cursor: 'pointer' }}
                            />
                          </th>
                        )}
                        {COLUMNS.map((col, i) => (
                          <th
                            key={col.key}
                            onClick={() => handleSort(col.key)}
                            style={{
                              padding: '11px 16px', textAlign: 'left',
                              fontSize: 11, fontWeight: 800, color: 'var(--text-2)',
                              textTransform: 'uppercase', letterSpacing: '0.05em',
                              cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
                              border: '1px solid var(--border)',
                              borderLeft: i === 0 && !isAdmin ? '1px solid var(--border)' : i === 0 ? 'none' : 'none',
                              borderRight: i === COLUMNS.length - 1 ? '1px solid var(--border)' : 'none',
                              borderTopLeftRadius: i === 0 && !isAdmin ? 10 : 0,
                              borderBottomLeftRadius: i === 0 && !isAdmin ? 10 : 0,
                              borderTopRightRadius: i === COLUMNS.length - 1 ? 10 : 0,
                              borderBottomRightRadius: i === COLUMNS.length - 1 ? 10 : 0,
                            }}
                          >
                            {col.label}
                            {sortCol === col.key && (
                              <span style={{ marginLeft: 4, opacity: 0.7 }}>
                                {sortDir === 'asc' ? '↑' : '↓'}
                              </span>
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedLeads.map(lead => (
                        <tr
                          key={lead.id}
                          onClick={() => navigate(`/leads/${lead.id}`)}
                          style={{
                            background: 'var(--bg-card)',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                            transition: 'background 120ms',
                            cursor: 'pointer',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-card)')}
                        >
                          {isAdmin && (
                            <td
                              onClick={e => e.stopPropagation()}
                              style={{ padding: '12px 12px', borderTopLeftRadius: 10, borderBottomLeftRadius: 10 }}
                            >
                              <input
                                type="checkbox"
                                checked={selected.has(lead.id)}
                                onChange={() => toggleSelect(lead.id)}
                                style={{ cursor: 'pointer' }}
                              />
                            </td>
                          )}
                          <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-2)', whiteSpace: 'nowrap', borderTopLeftRadius: isAdmin ? 0 : 10, borderBottomLeftRadius: isAdmin ? 0 : 10 }}>
                            {fmtDate(lead.created_at)}
                          </td>
                          <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                            {lead.updated_at ? fmtDate(lead.updated_at) : '—'}
                          </td>
                          <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 500, color: 'var(--text-2)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span style={{
                                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 12, fontWeight: 700, color: '#fff',
                                background: avatarColor(lead.name),
                              }}>
                                {initials(lead.name)}
                              </span>
                              {lead.name}
                              {lead.is_renutrucao && (
                                <span style={{
                                  fontSize: 10, fontWeight: 700, color: '#7C3AED',
                                  background: '#F5F3FF', border: '1px solid #DDD6FE',
                                  borderRadius: 20, padding: '2px 8px',
                                  letterSpacing: '0.04em', whiteSpace: 'nowrap',
                                }}>
                                  RENUTRIÇÃO
                                </span>
                              )}
                            </div>
                          </td>
                          <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-2)' }}>
                            {lead.origem ?? '—'}
                          </td>
                          <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-2)' }}>
                            {lead.modalidade ?? '—'}
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <PerceptionBadge perception={lead.perception} />
                          </td>
                          <td style={{ padding: '12px 16px', borderTopRightRadius: 10, borderBottomRightRadius: 10 }}>
                            <StatusBadge status={lead.status} />
                            {lead.lost_reason && (
                              <div style={{ fontSize: 11, color: '#EF4444', fontWeight: 500, marginTop: 4, whiteSpace: 'nowrap' }}>
                                {lead.lost_reason}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-1 flex-wrap">
                <button
                  onClick={() => fetchReport(page - 1)}
                  disabled={page <= 1 || loading}
                  style={{
                    padding: '5px 12px', borderRadius: 8, fontSize: 13,
                    border: '1px solid var(--border)', background: 'var(--bg-card)',
                    color: 'var(--text-2)', cursor: page <= 1 ? 'not-allowed' : 'pointer',
                    opacity: page <= 1 ? 0.3 : 1,
                  }}
                >
                  ‹
                </button>

                {getPagesRange(page, totalPages).map((p, i) =>
                  p === '...' ? (
                    <span key={`ellipsis-${i}`} style={{ padding: '5px 4px', color: 'var(--text-subtle)', fontSize: 13 }}>
                      …
                    </span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => fetchReport(p as number)}
                      disabled={loading}
                      style={{
                        padding: '5px 11px', borderRadius: 8, fontSize: 13,
                        fontWeight: p === page ? 700 : 400,
                        background: p === page ? '#2563EB' : 'var(--bg-card)',
                        color: p === page ? 'white' : 'var(--text-2)',
                        border: '1px solid var(--border)', cursor: 'pointer',
                      }}
                    >
                      {p}
                    </button>
                  ),
                )}

                <button
                  onClick={() => fetchReport(page + 1)}
                  disabled={page >= totalPages || loading}
                  style={{
                    padding: '5px 12px', borderRadius: 8, fontSize: 13,
                    border: '1px solid var(--border)', background: 'var(--bg-card)',
                    color: 'var(--text-2)', cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                    opacity: page >= totalPages ? 0.3 : 1,
                  }}
                >
                  ›
                </button>
              </div>
            )}

            <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-subtle)' }}>
              Mostrando{' '}
              <strong style={{ color: 'var(--text-muted)' }}>{report.leads.length}</strong>{' '}
              de{' '}
              <strong style={{ color: 'var(--text-muted)' }}>{report.total}</strong>{' '}
              leads
            </p>
          </>
        )}

        {filterOpen && (
          <div onClick={() => setFilterOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24, overflowY: 'auto' }}>
            <style>{`@keyframes filterModalIn { from { opacity: 0; transform: translateY(-10px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }`}</style>
            <div
              onClick={e => e.stopPropagation()}
              style={{
                background: 'var(--bg-card, #fff)', borderRadius: 20, width: '100%', maxWidth: 940,
                boxShadow: '0 24px 70px rgba(0,0,0,0.3)', animation: 'filterModalIn 180ms ease-out',
                overflow: 'hidden',
              }}
            >
              <div style={{
                padding: '22px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'linear-gradient(135deg, rgba(37,99,235,0.08), rgba(124,58,237,0.05))',
                borderBottom: '1px solid var(--border)',
              }}>
                <p style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-1)', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 32, height: 32, borderRadius: 10, background: '#2563EB', color: 'white',
                  }}>
                    <Filter size={16} />
                  </span>
                  Filtros
                </p>
                <button onClick={() => setFilterOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 6, borderRadius: 8, display: 'flex' }}>
                  <X size={20} />
                </button>
              </div>

              <div style={{ padding: '24px 28px 28px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
                  <div className="flex flex-col gap-1">
                    <label style={labelStyle}>Data Início</label>
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={e => setDateFrom(e.target.value)}
                      className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      style={{ color: 'var(--text-2)', width: '100%' }}
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label style={labelStyle}>Data Fim</label>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={e => setDateTo(e.target.value)}
                      className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      style={{ color: 'var(--text-2)', width: '100%' }}
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label style={labelStyle}>Atendente</label>
                    {isAdmin ? (
                      <select
                        value={origem}
                        onChange={e => setOrigem(e.target.value)}
                        className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        style={{ color: 'var(--text-2)', width: '100%' }}
                      >
                        <option value="">Todos</option>
                        {operators.map(op => (
                          <option key={op} value={op}>{op}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={myName}
                        disabled
                        className="border rounded-lg px-3 py-2 text-sm bg-gray-50"
                        style={{ color: 'var(--text-muted)', width: '100%' }}
                      />
                    )}
                  </div>

                  {isAdmin && (
                    <div className="flex flex-col gap-1">
                      <label style={labelStyle}>Modalidade</label>
                      <select
                        value={modalidadeFilter}
                        onChange={e => setModalidadeFilter(e.target.value)}
                        className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        style={{ color: 'var(--text-2)', width: '100%' }}
                      >
                        <option value="">Todas</option>
                        {modalidades.map(m => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="flex flex-col gap-1">
                    <label style={labelStyle}>Status</label>
                    <select
                      value={statusFilter}
                      onChange={e => setStatusFilter(e.target.value)}
                      className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      style={{ color: 'var(--text-2)', width: '100%' }}
                    >
                      <option value="">Todos</option>
                      <option value="pending,novo,new">Pendente</option>
                      <option value="scheduled,qualificado,qualified">Agendado</option>
                      <option value="proposal_sent">Proposta</option>
                      <option value={STATUS_FECHADO}>Fechado</option>
                      <option value={STATUS_PERDIDO}>Perdido</option>
                    </select>
                  </div>

                  {isAdmin && (
                    <div className="flex flex-col gap-1">
                      <label style={labelStyle}>Equipe</label>
                      <select
                        value={teamFilter}
                        onChange={e => setTeamFilter(e.target.value)}
                        className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        style={{ color: 'var(--text-2)', width: '100%' }}
                      >
                        <option value="">Todas</option>
                        {TEAM_OPTIONS.map(t => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {statusFilter === STATUS_PERDIDO && (
                    <div className="flex flex-col gap-1">
                      <label style={labelStyle}>Motivo</label>
                      <select
                        value={lostReasonFilter}
                        onChange={e => setLostReasonFilter(e.target.value)}
                        className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        style={{ color: 'var(--text-2)', width: '100%' }}
                      >
                        <option value="">Todos</option>
                        {lostReasons.map(r => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {statusFilter === STATUS_FECHADO && (
                    <div className="flex flex-col gap-1">
                      <label style={labelStyle}>Etapa</label>
                      <select
                        value={closedSubStatus}
                        onChange={e => setClosedSubStatus(e.target.value)}
                        className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        style={{ color: 'var(--text-2)', width: '100%' }}
                      >
                        <option value="">Todos</option>
                        <option value={STATUS_AGUARDANDO_FATURAMENTO}>Aguardando Faturamento</option>
                        <option value={STATUS_VENDA_REALIZADA}>Venda Realizada</option>
                      </select>
                    </div>
                  )}

                  <div className="flex flex-col gap-1" style={{ gridColumn: '1 / -1' }}>
                    <label style={labelStyle}>Buscar</label>
                    <input
                      type="text"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { handleSearch(); setFilterOpen(false) } }}
                      placeholder="Nome, CPF/CNPJ, telefone ou email"
                      className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      style={{ color: 'var(--text-2)', width: '100%' }}
                    />
                  </div>
                </div>

                {perceptionFilter !== '' && (
                  <div className="flex items-center gap-2 mt-4 pt-4" style={{ borderTop: '1px solid var(--border-lt)' }}>
                    <span style={labelStyle}>Percepção</span>
                    {[
                      { label: 'Ambos', value: 'Quente,Morno' },
                      { label: 'Quente', value: 'Quente' },
                      { label: 'Morno', value: 'Morno' },
                    ].map(opt => {
                      const active = perceptionFilter === opt.value
                      const colors: Record<string, { bg: string; color: string; border: string }> = {
                        Quente: { bg: '#FEF2F2', color: '#DC2626', border: '#FECACA' },
                        Morno:  { bg: '#FFFBEB', color: '#D97706', border: '#FDE68A' },
                        Ambos:  { bg: '#EFF6FF', color: '#2563EB', border: '#BFDBFE' },
                      }
                      const c = colors[opt.label]
                      return (
                        <button
                          key={opt.value}
                          onClick={() => setPerceptionFilter(opt.value)}
                          style={{
                            fontSize: 12, fontWeight: 600, padding: '4px 14px', borderRadius: 99,
                            border: `1px solid ${active ? c.border : 'var(--border)'}`,
                            background: active ? c.bg : 'var(--bg-card)',
                            color: active ? c.color : 'var(--text-muted)',
                            cursor: 'pointer', transition: 'all 150ms',
                          }}
                        >
                          {opt.label}
                        </button>
                      )
                    })}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 22, paddingTop: 18, borderTop: '1px solid var(--border-lt)' }}>
                  <button
                    onClick={clearFilters}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '9px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                      background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)',
                      cursor: 'pointer', transition: 'all 150ms',
                    }}
                  >
                    <RotateCcw size={14} />
                    Limpar Filtros
                  </button>

                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      onClick={exportExcel}
                      disabled={exporting || !report || report.total === 0}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '9px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600,
                        background: exporting ? '#D1FAE5' : '#059669', color: exporting ? '#065F46' : 'white',
                        border: 'none', cursor: exporting || !report || report.total === 0 ? 'not-allowed' : 'pointer',
                        opacity: !report || report.total === 0 ? 0.4 : 1, transition: 'background 150ms',
                      }}
                    >
                      {exporting ? '⏳ Exportando...' : '⬇ Exportar Excel'}
                    </button>
                    <button
                      onClick={() => { handleSearch(); setFilterOpen(false) }}
                      disabled={loading}
                      className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50"
                      style={{ height: 38 }}
                    >
                      {loading ? 'Buscando…' : 'Buscar'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {confirmDeleteOpen && (
          <div onClick={() => !deleting && setConfirmDeleteOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-card, #fff)', borderRadius: 16, width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', padding: '24px' }}>
              <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 8px' }}>Excluir {selected.size} lead{selected.size !== 1 ? 's' : ''}?</p>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px' }}>
                Esta ação não pode ser desfeita. Os leads selecionados e todo o histórico associado (notas, agendamentos, status) serão excluídos permanentemente.
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  onClick={() => setConfirmDeleteOpen(false)}
                  disabled={deleting}
                  style={{ padding: '9px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600, background: 'var(--bg-card)', color: 'var(--text-2)', border: '1px solid var(--border)', cursor: deleting ? 'not-allowed' : 'pointer' }}
                >
                  Cancelar
                </button>
                <button
                  onClick={deleteSelected}
                  disabled={deleting}
                  style={{ padding: '9px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600, background: '#DC2626', color: 'white', border: 'none', cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.6 : 1 }}
                >
                  {deleting ? 'Excluindo…' : 'Excluir'}
                </button>
              </div>
            </div>
          </div>
        )}

        {newLeadOpen && (
          <div onClick={() => !savingNewLead && setNewLeadOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-card, #fff)', borderRadius: 20, width: '100%', maxWidth: 620, maxHeight: '90vh', boxShadow: '0 24px 70px rgba(0,0,0,0.3)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{
                padding: '20px 26px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'linear-gradient(135deg, rgba(37,99,235,0.08), rgba(124,58,237,0.05))',
                borderBottom: '1px solid var(--border)', flexShrink: 0,
              }}>
                <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-1)', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 9, background: '#2563EB', color: 'white' }}>
                    <Plus size={15} />
                  </span>
                  Novo Lead
                </p>
                <button onClick={() => !savingNewLead && setNewLeadOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 6, borderRadius: 8, display: 'flex' }}>
                  <X size={20} />
                </button>
              </div>

              <div style={{ padding: '22px 26px 26px', display: 'flex', flexDirection: 'column', gap: 22, overflowY: 'auto', minHeight: 0 }}>
                {newLeadError && <p style={{ color: '#EF4444', fontSize: 13, margin: 0 }}>{newLeadError}</p>}

                <div className="flex flex-col" style={{ gap: 12 }}>
                  <SectionTitle style={{ fontSize: 11 }}>Identificação</SectionTitle>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <div className="flex flex-col gap-1" style={{ gridColumn: '1 / -1' }}>
                      <label style={labelStyle}>Nome *</label>
                      <input value={newLead.name} onChange={e => setNewLead(d => ({ ...d, name: e.target.value }))}
                        className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" style={{ color: 'var(--text-2)', width: '100%' }} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label style={labelStyle}>Empresa</label>
                      <input value={newLead.company} onChange={e => setNewLead(d => ({ ...d, company: e.target.value }))}
                        className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" style={{ color: 'var(--text-2)', width: '100%' }} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label style={labelStyle}>Documento</label>
                      <input value={newLead.document} onChange={e => setNewLead(d => ({ ...d, document: e.target.value }))}
                        className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" style={{ color: 'var(--text-2)', width: '100%' }} />
                    </div>
                  </div>
                </div>

                <div className="flex flex-col" style={{ gap: 12, paddingTop: 20, borderTop: '1px solid var(--border-lt)' }}>
                  <SectionTitle style={{ fontSize: 11 }}>Contato</SectionTitle>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <div className="flex flex-col gap-1">
                      <label style={labelStyle}>E-mail</label>
                      <input type="email" value={newLead.email} onChange={e => setNewLead(d => ({ ...d, email: e.target.value }))}
                        className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" style={{ color: 'var(--text-2)', width: '100%' }} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label style={labelStyle}>Telefone</label>
                      <input value={newLead.phone} onChange={e => setNewLead(d => ({ ...d, phone: e.target.value }))}
                        className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" style={{ color: 'var(--text-2)', width: '100%' }} />
                    </div>
                  </div>
                </div>

                <div className="flex flex-col" style={{ gap: 12, paddingTop: 20, borderTop: '1px solid var(--border-lt)' }}>
                  <SectionTitle style={{ fontSize: 11 }}>Qualificação Comercial</SectionTitle>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <div className="flex flex-col gap-1">
                      <label style={labelStyle}>Origem</label>
                      <Combobox value={newLead.origin} onChange={v => setNewLead(d => ({ ...d, origin: v }))} options={operators} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label style={labelStyle}>Modalidade</label>
                      <Combobox value={newLead.modalidade} onChange={v => setNewLead(d => ({ ...d, modalidade: v }))} options={modalidades} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label style={labelStyle}>Categoria</label>
                      <Combobox value={newLead.categoria} onChange={v => setNewLead(d => ({ ...d, categoria: v }))} options={['Com coparticipação', 'Sem coparticipação']} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label style={labelStyle}>Ponto de Conversão</label>
                      <Combobox value={newLead.conversion_point} onChange={v => setNewLead(d => ({ ...d, conversion_point: v }))} options={conversionPoints} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label style={labelStyle}>Valor da Cotação</label>
                      <input type="number" step="0.01" value={newLead.value_potential} onChange={e => setNewLead(d => ({ ...d, value_potential: e.target.value }))}
                        className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" style={{ color: 'var(--text-2)', width: '100%' }} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label style={labelStyle}>Atendente</label>
                      <input value={newLead.attendant} onChange={e => setNewLead(d => ({ ...d, attendant: e.target.value }))}
                        className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" style={{ color: 'var(--text-2)', width: '100%' }} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label style={labelStyle}>Perfil</label>
                      <input value={newLead.visibility_tag} onChange={e => setNewLead(d => ({ ...d, visibility_tag: e.target.value }))}
                        placeholder="Ex: ADM"
                        className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" style={{ color: 'var(--text-2)', width: '100%' }} />
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-1" style={{ paddingTop: 20, borderTop: '1px solid var(--border-lt)' }}>
                  <label style={labelStyle}>Notas</label>
                  <textarea value={newLead.notes} onChange={e => setNewLead(d => ({ ...d, notes: e.target.value }))} rows={3}
                    className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" style={{ color: 'var(--text-2)', width: '100%', resize: 'vertical', fontFamily: 'inherit' }} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 18, borderTop: '1px solid var(--border-lt)' }}>
                  <button
                    onClick={() => setNewLeadOpen(false)}
                    disabled={savingNewLead}
                    style={{ padding: '9px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600, background: 'var(--bg-card)', color: 'var(--text-2)', border: '1px solid var(--border)', cursor: savingNewLead ? 'not-allowed' : 'pointer' }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleCreateLead}
                    disabled={savingNewLead}
                    style={{ padding: '9px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600, background: '#2563EB', color: 'white', border: 'none', cursor: savingNewLead ? 'not-allowed' : 'pointer', opacity: savingNewLead ? 0.6 : 1 }}
                  >
                    {savingNewLead ? 'Salvando…' : 'Criar Lead'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  )
}
