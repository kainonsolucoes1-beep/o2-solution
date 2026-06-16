import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import api from '../api'
import NavBar from '../components/NavBar'

// ─── Types ───────────────────────────────────────────────────────────────────

interface TodayMetrics {
  leads_today: number
  meta_daily: number
  meta_monthly: number
  leads_monthly: number
  value_pipeline: number
  average_ticket: number
  qualified_leads: number
  conversion_rate: number
}

interface Operator { name: string; leads_today: number }
interface DayLeads  { date: string; leads: number }
interface RankingRow { name: string; leads: number; qualified: number }

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function pct(value: number, meta: number) {
  return meta > 0 ? Math.min(100, Math.round((value / meta) * 100)) : 0
}

function barColor(p: number) {
  if (p >= 100) return '#10B981'
  if (p >= 60)  return '#F59E0B'
  return '#EF4444'
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl shadow p-4 flex flex-col gap-1">
      <span className="text-xs text-gray-400 uppercase tracking-wide">{label}</span>
      <span className="text-2xl font-bold text-gray-800">{value}</span>
      {sub && <span className="text-xs text-gray-400">{sub}</span>}
    </div>
  )
}

function ProgressBar({ label, value, meta }: { label: string; value: number; meta: number }) {
  const p = pct(value, meta)
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs text-gray-500">
        <span>{label}</span>
        <span className="font-semibold" style={{ color: barColor(p) }}>{p}%</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-3">
        <div
          className="h-3 rounded-full transition-all"
          style={{ width: `${p}%`, backgroundColor: barColor(p) }}
        />
      </div>
      <div className="flex justify-between text-xs text-gray-400">
        <span>{value} captados</span>
        <span>meta {meta}</span>
      </div>
    </div>
  )
}

function TopThree({ operators }: { operators: Operator[] }) {
  const medals = ['🥇', '🥈', '🥉']
  return (
    <div className="flex flex-col gap-1">
      {operators.map((op, i) => (
        <div key={op.name} className="flex items-center justify-between text-sm">
          <span>{medals[i] ?? '·'} {op.name}</span>
          <span className="font-semibold text-gray-700">{op.leads_today}</span>
        </div>
      ))}
      {operators.length === 0 && (
        <span className="text-xs text-gray-400">Sem dados hoje</span>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate = useNavigate()

  const [metrics, setMetrics]   = useState<TodayMetrics | null>(null)
  const [topOps, setTopOps]     = useState<Operator[]>([])
  const [last7, setLast7]       = useState<DayLeads[]>([])
  const [ranking, setRanking]   = useState<RankingRow[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')

  const fetchAll = useCallback(() => {
    if (!localStorage.getItem('token')) { navigate('/login'); return }
    setLoading(true)

    Promise.all([
      api.get<TodayMetrics>('/api/v1/dashboard/today-metrics'),
      api.get<{ operators: Operator[] }>('/api/v1/dashboard/top-operators'),
      api.get<{ days: DayLeads[] }>('/api/v1/dashboard/last-7-days'),
      api.get<{ ranking: RankingRow[] }>('/api/v1/dashboard/operators-ranking'),
    ])
      .then(([m, ops, days, rank]) => {
        setMetrics(m.data)
        setTopOps(ops.data.operators)
        setLast7(days.data.days)
        setRanking(rank.data.ranking)
      })
      .catch((err) => {
        if (err.response?.status === 401) {
          localStorage.removeItem('token')
          navigate('/login')
        } else {
          setError('Erro ao carregar dashboard.')
        }
      })
      .finally(() => setLoading(false))
  }, [navigate])

  useEffect(() => { fetchAll() }, [fetchAll])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <NavBar />
        <p className="text-center text-gray-400 text-sm mt-20">Carregando...</p>
      </div>
    )
  }

  if (error || !metrics) {
    return (
      <div className="min-h-screen bg-gray-50">
        <NavBar />
        <p className="text-center text-red-500 text-sm mt-20">{error || 'Sem dados.'}</p>
      </div>
    )
  }

  const pctDaily   = pct(metrics.leads_today, metrics.meta_daily)
  const pctMonthly = pct(metrics.leads_monthly, metrics.meta_monthly)

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar />
      <main className="max-w-7xl mx-auto px-4 py-6 flex flex-col gap-6">

        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <KpiCard
            label="Leads Hoje"
            value={String(metrics.leads_today)}
            sub={`meta diária: ${metrics.meta_daily}`}
          />
          <KpiCard
            label="Meta Diária"
            value={`${pctDaily}%`}
            sub={`${metrics.leads_today} / ${metrics.meta_daily}`}
          />
          <KpiCard
            label="Meta Mensal"
            value={`${pctMonthly}%`}
            sub={`${metrics.leads_monthly} / ${metrics.meta_monthly}`}
          />
          <KpiCard
            label="Valor em Carteira"
            value={`R$ ${fmt(metrics.value_pipeline)}`}
          />
          <KpiCard
            label="Ticket Médio"
            value={`R$ ${fmt(metrics.average_ticket)}`}
          />
          <KpiCard
            label="Qualificados Hoje"
            value={String(metrics.qualified_leads)}
          />
          <KpiCard
            label="Taxa de Conversão"
            value={`${metrics.conversion_rate}%`}
          />
          <div className="bg-white rounded-xl shadow p-4 flex flex-col gap-2">
            <span className="text-xs text-gray-400 uppercase tracking-wide">Ranking do Dia</span>
            <TopThree operators={topOps} />
          </div>
        </div>

        {/* ── Progress Bars ── */}
        <div className="bg-white rounded-xl shadow p-5 flex flex-col gap-5">
          <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Progresso de Metas</h3>
          <ProgressBar label="Meta Diária" value={metrics.leads_today} meta={metrics.meta_daily} />
          <ProgressBar label="Meta Mensal" value={metrics.leads_monthly} meta={metrics.meta_monthly} />
        </div>

        {/* ── Charts ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Line chart — últimos 7 dias */}
          <div className="bg-white rounded-xl shadow p-5 flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Leads — Últimos 7 Dias</h3>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={last7} margin={{ top: 4, right: 16, left: -16, bottom: 0 }}>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: '#9CA3AF' }}
                  tickFormatter={(v) => v.slice(5)}
                />
                <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} allowDecimals={false} />
                <Tooltip
                  formatter={(v: number) => [v, 'Leads']}
                  labelFormatter={(l) => `Data: ${l}`}
                />
                <Line
                  type="monotone"
                  dataKey="leads"
                  stroke="#10B981"
                  strokeWidth={2}
                  dot={{ r: 4, fill: '#10B981' }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Bar chart — ranking operadores */}
          <div className="bg-white rounded-xl shadow p-5 flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Ranking Operadores</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={ranking} margin={{ top: 4, right: 16, left: -16, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9CA3AF' }} />
                <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="leads" name="Total" radius={[4, 4, 0, 0]}>
                  {ranking.map((_, i) => (
                    <Cell key={i} fill={i === 0 ? '#10B981' : i === 1 ? '#F59E0B' : '#6B7280'} />
                  ))}
                </Bar>
                <Bar dataKey="qualified" name="Qualificados" fill="#3B82F6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

        </div>
      </main>
    </div>
  )
}
