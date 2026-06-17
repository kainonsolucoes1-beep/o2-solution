import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api from '../api'
import LeadDetailModal from '../components/LeadDetailModal'

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
  status: string | null
  perception: string | null
  value_potential: number | null
  created_at: string
}

interface ReportResponse {
  total: number
  page: number
  limit: number
  leads: LeadItem[]
}

type SortKey = keyof LeadItem

const LIMIT = 10

const today = new Date().toISOString().slice(0, 10)
const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  .toISOString()
  .slice(0, 10)

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  novo:        { bg: '#EFF6FF', color: '#2563EB' },
  qualificado: { bg: '#F0FDF4', color: '#16A34A' },
  proposta:    { bg: '#FFFBEB', color: '#D97706' },
  fechado:     { bg: '#F3F4F6', color: '#6B7280' },
  convertido:  { bg: '#ECFDF5', color: '#059669' },
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR')
}

function fmtBRL(n: number | null) {
  if (n == null) return '—'
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function StatusBadge({ status }: { status: string | null }) {
  const key = (status ?? 'novo').toLowerCase()
  const s = STATUS_STYLE[key] ?? { bg: '#F3F4F6', color: '#6B7280' }
  return (
    <span
      style={{
        background: s.bg,
        color: s.color,
        padding: '2px 10px',
        borderRadius: 99,
        fontSize: 12,
        fontWeight: 600,
        textTransform: 'capitalize',
        whiteSpace: 'nowrap',
      }}
    >
      {status ?? 'novo'}
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
  { key: 'created_at',     label: 'Data' },
  { key: 'name',           label: 'Cliente' },
  { key: 'email',          label: 'Email' },
  { key: 'phone',          label: 'Telefone' },
  { key: 'origem',         label: 'Origem' },
  { key: 'status',         label: 'Status' },
  { key: 'value_potential', label: 'Valor' },
]

export default function LeadsReport() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [me, setMe]               = useState<Me | null>(null)
  const [operators, setOperators] = useState<Operator[]>([])
  const [dateFrom, setDateFrom]   = useState(monthStart)
  const [dateTo, setDateTo]       = useState(today)
  const [origem, setOrigem]       = useState('')
  const [page, setPage]           = useState(1)
  const [report, setReport]       = useState<ReportResponse | null>(null)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [statusFilter] = useState(() => searchParams.get('status') ?? '')
  const [perceptionFilter, setPerceptionFilter] = useState(() => searchParams.get('perception') ?? '')
  const vencidosFilter = searchParams.get('vencidos') === '1'
  const [searched, setSearched]   = useState(false)
  const [sortCol, setSortCol]     = useState<SortKey | null>(null)
  const [sortDir, setSortDir]     = useState<'asc' | 'desc'>('asc')
  const [selectedLead, setSelectedLead] = useState<LeadItem | null>(null)

  useEffect(() => {
    if (!localStorage.getItem('token')) { navigate('/login'); return }
    api.get<Me>('/api/v1/auth/me')
      .then(r => {
        setMe(r.data)
        if (r.data.role === 'admin' || r.data.username === 'lucas') {
          api.get<string[]>('/api/v1/leads/origins').then(u => setOperators(u.data))
        }
      })
      .catch(() => navigate('/login'))
  }, [navigate])

  useEffect(() => {
    if (me && (searchParams.get('status') || searchParams.get('perception') || vencidosFilter)) fetchReport(1)
  }, [me]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (searched) fetchReport(1)
  }, [perceptionFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  const isAdmin = me !== null && (me.role === 'admin' || me.username === 'lucas')

  const fetchReport = useCallback(
    (p: number) => {
      setLoading(true)
      setError('')

      const params: Record<string, string | number | boolean> = {
        date_from: vencidosFilter ? '2000-01-01' : dateFrom,
        date_to:   vencidosFilter ? today : dateTo,
        page:      p,
        limit:     LIMIT,
      }
      if (vencidosFilter) params.vencidos = true
      if (isAdmin && origem) params.origem = origem
      if (statusFilter) params.status = statusFilter
      if (perceptionFilter) params.perception = perceptionFilter

      api
        .get<ReportResponse>('/api/v1/leads/by-period', { params })
        .then(r => {
          setReport(r.data)
          setPage(p)
          setSearched(true)
          setSortCol(null)
        })
        .catch(err => {
          if (err.response?.status === 401) { navigate('/login') }
          else setError('Erro ao buscar leads. Tente novamente.')
        })
        .finally(() => setLoading(false))
    },
    [dateFrom, dateTo, origem, statusFilter, perceptionFilter, vencidosFilter, isAdmin, navigate],
  )

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

  return (
    <>
    <main className="max-w-7xl mx-auto px-4 py-6 flex flex-col gap-6">

        {/* Header */}
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1F2937' }}>Relatório de Leads</h1>
          {vencidosFilter ? (
            <p style={{ fontSize: 13, color: '#EF4444', marginTop: 2, fontWeight: 500 }}>
              ⚠️ Exibindo leads vencidos — sem atenção nas últimas 24h
            </p>
          ) : (
            <p style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}>
              Filtre leads por período e atendente
            </p>
          )}
        </div>

        {/* Filters */}
        <div
          className="bg-white rounded-xl p-6"
          style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}
        >
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex flex-col gap-1">
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#6B7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Data Início
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                style={{ color: '#1F2937' }}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#6B7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Data Fim
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                style={{ color: '#1F2937' }}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#6B7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Atendente
              </label>
              {isAdmin ? (
                <select
                  value={origem}
                  onChange={e => setOrigem(e.target.value)}
                  className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{ color: '#1F2937', minWidth: 170 }}
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
                  style={{ color: '#6B7280', minWidth: 170 }}
                />
              )}
            </div>

            <button
              onClick={handleSearch}
              disabled={loading}
              className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50"
              style={{ height: 38 }}
            >
              {loading ? 'Buscando…' : 'Buscar'}
            </button>
          </div>

          {perceptionFilter !== '' && (
            <div className="flex items-center gap-2 mt-4 pt-4" style={{ borderTop: '1px solid #F3F4F6' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Percepção</span>
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
                      fontSize: 12,
                      fontWeight: 600,
                      padding: '4px 14px',
                      borderRadius: 99,
                      border: `1px solid ${active ? c.border : '#E5E7EB'}`,
                      background: active ? c.bg : 'white',
                      color: active ? c.color : '#6B7280',
                      cursor: 'pointer',
                      transition: 'all 150ms',
                    }}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {error && <p style={{ color: '#EF4444', fontSize: 13 }}>{error}</p>}

        {!searched && !loading && (
          <div
            className="text-center py-16 bg-white rounded-xl"
            style={{ color: '#9CA3AF', fontSize: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}
          >
            Selecione os filtros e clique em <strong>Buscar</strong> para ver os leads.
          </div>
        )}

        {loading && (
          <p className="text-center text-sm py-12" style={{ color: '#9CA3AF' }}>
            Carregando…
          </p>
        )}

        {searched && report && !loading && (
          <>
            {/* Stats */}
            <div style={{ fontSize: 13, color: '#6B7280' }}>
              Mostrando{' '}
              <strong style={{ color: '#1F2937' }}>{report.leads.length}</strong>{' '}
              de{' '}
              <strong style={{ color: '#1F2937' }}>{report.total}</strong>{' '}
              leads
            </div>

            {/* Table */}
            <div
              className="bg-white rounded-xl overflow-hidden"
              style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}
            >
              {report.leads.length === 0 ? (
                <div
                  className="py-16 text-center"
                  style={{ color: '#9CA3AF', fontSize: 14 }}
                >
                  Nenhum lead encontrado para os filtros selecionados.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #E5E7EB', background: '#F9FAFB' }}>
                        {COLUMNS.map(col => (
                          <th
                            key={col.key}
                            onClick={() => handleSort(col.key)}
                            style={{
                              padding: '11px 16px',
                              textAlign: 'left',
                              fontSize: 11,
                              fontWeight: 600,
                              color: '#6B7280',
                              textTransform: 'uppercase',
                              letterSpacing: '0.05em',
                              cursor: 'pointer',
                              userSelect: 'none',
                              whiteSpace: 'nowrap',
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
                      {sortedLeads.map((lead, i) => (
                        <tr
                          key={lead.id}
                          onClick={() => setSelectedLead(lead)}
                          style={{
                            borderBottom:
                              i < sortedLeads.length - 1 ? '1px solid #F3F4F6' : 'none',
                            background: 'white',
                            transition: 'background 120ms',
                            cursor: 'pointer',
                          }}
                          onMouseEnter={e =>
                            (e.currentTarget.style.background = '#F9FAFB')
                          }
                          onMouseLeave={e =>
                            (e.currentTarget.style.background = 'white')
                          }
                        >
                          <td
                            style={{
                              padding: '12px 16px',
                              fontSize: 13,
                              color: '#6B7280',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {fmtDate(lead.created_at)}
                          </td>
                          <td
                            style={{
                              padding: '12px 16px',
                              fontSize: 14,
                              fontWeight: 500,
                              color: '#1F2937',
                            }}
                          >
                            {lead.name}
                          </td>
                          <td style={{ padding: '12px 16px', fontSize: 13, color: '#6B7280' }}>
                            {lead.email ?? '—'}
                          </td>
                          <td
                            style={{
                              padding: '12px 16px',
                              fontSize: 13,
                              color: '#6B7280',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {lead.phone ?? '—'}
                          </td>
                          <td style={{ padding: '12px 16px', fontSize: 13, color: '#6B7280' }}>
                            {lead.origem ?? '—'}
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <StatusBadge status={lead.status} />
                          </td>
                          <td
                            style={{
                              padding: '12px 16px',
                              fontSize: 13,
                              color: '#1F2937',
                              fontWeight: 500,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {fmtBRL(lead.value_potential)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-1 flex-wrap">
                <button
                  onClick={() => fetchReport(page - 1)}
                  disabled={page <= 1 || loading}
                  style={{
                    padding: '5px 12px',
                    borderRadius: 8,
                    fontSize: 13,
                    border: '1px solid #E5E7EB',
                    background: 'white',
                    color: '#1F2937',
                    cursor: page <= 1 ? 'not-allowed' : 'pointer',
                    opacity: page <= 1 ? 0.3 : 1,
                  }}
                >
                  ‹
                </button>

                {getPagesRange(page, totalPages).map((p, i) =>
                  p === '...' ? (
                    <span key={`ellipsis-${i}`} style={{ padding: '5px 4px', color: '#9CA3AF', fontSize: 13 }}>
                      …
                    </span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => fetchReport(p as number)}
                      disabled={loading}
                      style={{
                        padding: '5px 11px',
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: p === page ? 700 : 400,
                        background: p === page ? '#2563EB' : 'white',
                        color: p === page ? 'white' : '#1F2937',
                        border: '1px solid #E5E7EB',
                        cursor: 'pointer',
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
                    padding: '5px 12px',
                    borderRadius: 8,
                    fontSize: 13,
                    border: '1px solid #E5E7EB',
                    background: 'white',
                    color: '#1F2937',
                    cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                    opacity: page >= totalPages ? 0.3 : 1,
                  }}
                >
                  ›
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {selectedLead && (
        <LeadDetailModal
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
          onStatusChange={(id, newStatus) => {
            setReport(prev =>
              prev
                ? { ...prev, leads: prev.leads.map(l => l.id === id ? { ...l, status: newStatus } : l) }
                : prev
            )
            setSelectedLead(prev => prev ? { ...prev, status: newStatus } : null)
          }}
        />
      )}
    </>
  )
}
