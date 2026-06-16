import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { TrendingUp, Users, DollarSign, Target, User } from 'lucide-react'
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

interface OperatorCapture { name: string; leads_today: number }
interface DayLeads        { date: string; leads: number }
interface RankingRow      { name: string; leads: number; qualified: number }

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmtBRL = (n: number) =>
  n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function pct(value: number, meta: number) {
  return meta > 0 ? Math.min(100, Math.round((value / meta) * 100)) : 0
}

function progressColor(p: number) {
  if (p >= 80) return '#10B981'
  if (p >= 50) return '#F59E0B'
  return '#EF4444'
}

// ─── Components ──────────────────────────────────────────────────────────────

function KpiCard({
  icon, label, value, sub,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
}) {
  return (
    <div
      className="bg-white rounded-xl p-6 flex flex-col gap-2 cursor-default"
      style={{
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        transition: 'transform 200ms',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.02)')}
      onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
    >
      <div className="flex items-center gap-2 text-gray-400">
        {icon}
        <span style={{ fontSize: 13, fontWeight: 400 }}>{label}</span>
      </div>
      <span style={{ fontSize: 32, fontWeight: 700, color: '#1F2937', lineHeight: 1.1 }}>
        {value}
      </span>
      {sub && <span style={{ fontSize: 13, color: '#9CA3AF' }}>{sub}</span>}
    </div>
  )
}

function MetaPanel({
  label, value, meta,
}: {
  label: string
  value: number
  meta: number
}) {
  const p = pct(value, meta)
  const color = progressColor(p)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span style={{ fontSize: 13, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {label}
        </span>
        <span style={{ fontSize: 24, fontWeight: 700, color }}>{p}%</span>
      </div>
      <div style={{ background: '#F3F4F6', borderRadius: 99, height: 8, overflow: 'hidden' }}>
        <div
          style={{
            width: `${p}%`,
            height: '100%',
            background: color,
            borderRadius: 99,
            transition: 'width 400ms ease',
          }}
        />
      </div>
      <span style={{ fontSize: 13, color: '#9CA3AF' }}>
        {value} captados &nbsp;·&nbsp; meta {meta}
      </span>
    </div>
  )
}

function OperatorRow({ name, leads, max }: { name: string; leads: number; max: number }) {
  const barW = leads > 0 && max > 0 ? Math.max(4, Math.round((leads / max) * 100)) : 0
  return (
    <div className="flex items-center gap-3 py-2" style={{ borderBottom: '1px solid #F3F4F6' }}>
      <div
        className="flex items-center justify-center rounded-full bg-blue-50"
        style={{ width: 36, height: 36, flexShrink: 0 }}
      >
        <User size={18} color="#3B82F6" />
      </div>
      <span style={{ fontSize: 14, color: '#1F2937', width: 110, flexShrink: 0 }}>{name}</span>
      <div style={{ flex: 1, background: '#F3F4F6', borderRadius: 99, height: 6 }}>
        <div
          style={{
            width: `${barW}%`,
            height: '100%',
            background: leads > 0 ? '#3B82F6' : '#E5E7EB',
            borderRadius: 99,
            transition: 'width 400ms ease',
          }}
        />
      </div>
      <span style={{ fontSize: 14, fontWeight: 700, color: leads > 0 ? '#1F2937' : '#9CA3AF', width: 60, textAlign: 'right', flexShrink: 0 }}>
        {leads} lead{leads !== 1 ? 's' : ''}
      </span>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate = useNavigate()

  const [metrics, setMetrics]     = useState<TodayMetrics | null>(null)
  const [capture, setCapture]     = useState<OperatorCapture[]>([])
  const [last7, setLast7]         = useState<DayLeads[]>([])
  const [ranking, setRanking]     = useState<RankingRow[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')

  const fetchAll = useCallback(() => {
    if (!localStorage.getItem('token')) { navigate('/login'); return }
    setLoading(true)

    Promise.all([
      api.get<TodayMetrics>('/api/v1/dashboard/today-metrics'),
      api.get<{ operators: OperatorCapture[] }>('/api/v1/dashboard/daily-capture'),
      api.get<{ days: DayLeads[] }>('/api/v1/dashboard/last-7-days'),
      api.get<{ ranking: RankingRow[] }>('/api/v1/dashboard/operators-ranking'),
    ])
      .then(([m, cap, days, rank]) => {
        setMetrics(m.data)
        setCapture(cap.data.operators)
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
      <div className="min-h-screen" style={{ background: '#F9FAFB' }}>
        <NavBar />
        <p className="text-center text-sm mt-20" style={{ color: '#9CA3AF' }}>Carregando...</p>
      </div>
    )
  }

  if (error || !metrics) {
    return (
      <div className="min-h-screen" style={{ background: '#F9FAFB' }}>
        <NavBar />
        <p className="text-center text-sm mt-20" style={{ color: '#EF4444' }}>{error || 'Sem dados.'}</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: '#F9FAFB' }}>
      <NavBar />
      <main className="max-w-7xl mx-auto px-4 py-6 flex flex-col gap-6">

        {/* ── Topo: KPIs + Metas ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* KPI 2x2 */}
          <div className="lg:col-span-2 grid grid-cols-2 gap-4">
            <KpiCard
              icon={<Users size={16} />}
              label="Leads Captados Hoje"
              value={String(metrics.leads_today)}
            />
            <KpiCard
              icon={<TrendingUp size={16} />}
              label="Leads no Mês"
              value={String(metrics.leads_monthly)}
            />
            <KpiCard
              icon={<DollarSign size={16} />}
              label="Valor em Carteira"
              value={`R$ ${fmtBRL(metrics.value_pipeline)}`}
            />
            <KpiCard
              icon={<Target size={16} />}
              label="Ticket Médio"
              value={`R$ ${fmtBRL(metrics.average_ticket)}`}
            />
          </div>

          {/* Painel de Metas (lateral direita) */}
          <div
            className="bg-white rounded-xl flex flex-col justify-center gap-6 p-6"
            style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}
          >
            <MetaPanel label="Meta Diária" value={metrics.leads_today} meta={metrics.meta_daily} />
            <div style={{ borderTop: '1px solid #F3F4F6' }} />
            <MetaPanel label="Meta Mensal" value={metrics.leads_monthly} meta={metrics.meta_monthly} />
          </div>
        </div>

        {/* ── Captação do Dia ── */}
        <div
          className="bg-white rounded-xl p-6"
          style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}
        >
          <h2
            className="mb-4"
            style={{ fontSize: 13, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}
          >
            Captação do Dia
          </h2>
          {capture.length === 0 ? (
            <p style={{ fontSize: 14, color: '#9CA3AF' }}>Nenhum operador registrado hoje.</p>
          ) : (
            <div>
              {capture.map((op) => (
                <OperatorRow
                  key={op.name}
                  name={op.name}
                  leads={op.leads_today}
                  max={Math.max(...capture.map((o) => o.leads_today))}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Gráficos ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Últimos 7 dias */}
          <div
            className="bg-white rounded-xl p-6 flex flex-col gap-4"
            style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}
          >
            <h2 style={{ fontSize: 13, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Leads — Últimos 7 Dias
            </h2>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={last7} margin={{ top: 4, right: 16, left: -20, bottom: 0 }}>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: '#9CA3AF' }}
                  tickFormatter={(v: any) => v.slice(5)}
                />
                <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} allowDecimals={false} />
                <Tooltip
                  formatter={(v: any) => [v, 'Leads']}
                  labelFormatter={(l: any) => `Data: ${l}`}
                  contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }}
                />
                <Line
                  type="monotone"
                  dataKey="leads"
                  stroke="#3B82F6"
                  strokeWidth={2}
                  dot={{ r: 4, fill: '#3B82F6', strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Ranking geral */}
          <div
            className="bg-white rounded-xl p-6 flex flex-col gap-4"
            style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}
          >
            <h2 style={{ fontSize: 13, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Ranking Operadores
            </h2>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={ranking} margin={{ top: 4, right: 16, left: -20, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9CA3AF' }} />
                <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }}
                />
                <Bar dataKey="leads" name="Total" radius={[4, 4, 0, 0]}>
                  {ranking.map((_, i) => (
                    <Cell
                      key={i}
                      fill={i === 0 ? '#3B82F6' : i === 1 ? '#10B981' : '#9CA3AF'}
                    />
                  ))}
                </Bar>
                <Bar dataKey="qualified" name="Qualificados" fill="#F59E0B" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

        </div>
      </main>
    </div>
  )
}
