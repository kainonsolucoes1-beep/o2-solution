import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList,
} from 'recharts'
import {
  Clock, Users, FileText, TrendingUp, CheckCircle2, XCircle,
  AlertTriangle, PhoneOff, Timer, Target, ArrowUpRight, ArrowDownRight,
} from 'lucide-react'
import api from '../api'

interface KpiData { count: number; vs_previous_month: number }
interface KpisOverview {
  pendente: KpiData; qualificado: KpiData; proposta: KpiData
  negociacao: KpiData; fechado: KpiData; perdido: KpiData
}
interface FunnelStage { stage: string; count: number; percentage: number; color: string }
interface Conversion  { from: string; to: string; rate: number }
interface HealthMetrics {
  vencidos: number; uncontacted: number; avg_time_in_funnel: number
  leads_monthly: number; meta_monthly: number
}

const KPI_CONFIG = [
  { key: 'pendente',    label: 'Pendente',    color: '#3B82F6', bg: '#EFF6FF',  Icon: Clock,         invert: false },
  { key: 'qualificado', label: 'Qualificado', color: '#10B981', bg: '#ECFDF5',  Icon: Users,         invert: false },
  { key: 'proposta',    label: 'Proposta',    color: '#F59E0B', bg: '#FFFBEB',  Icon: FileText,      invert: false },
  { key: 'negociacao',  label: 'Negociação',  color: '#8B5CF6', bg: '#F5F3FF',  Icon: TrendingUp,    invert: false },
  { key: 'fechado',     label: 'Fechado',     color: '#059669', bg: '#ECFDF5',  Icon: CheckCircle2,  invert: false },
  { key: 'perdido',     label: 'Perdido',     color: '#EF4444', bg: '#FEF2F2',  Icon: XCircle,       invert: true  },
]

function KpiCard({ label, color, bg, Icon, count, vs }: {
  label: string; color: string; bg: string
  Icon: React.ElementType; count: number; vs: number; invert: boolean
}) {
  const good = vs >= 0
  const trendColor = good ? '#10B981' : '#EF4444'
  return (
    <div
      className="bg-white rounded-xl p-5 flex flex-col gap-3"
      style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)', transition: 'transform 200ms' }}
      onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.02)')}
      onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
    >
      <div style={{ width: 36, height: 36, borderRadius: 9, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={18} color={color} />
      </div>
      <div>
        <p style={{ fontSize: 12, color: '#6B7280', fontWeight: 500, marginBottom: 4 }}>{label}</p>
        <p style={{ fontSize: 32, fontWeight: 700, color: '#111827', lineHeight: 1 }}>{count}</p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {good
          ? <ArrowUpRight size={14} color={trendColor} />
          : <ArrowDownRight size={14} color={trendColor} />
        }
        <span style={{ fontSize: 12, fontWeight: 600, color: trendColor }}>
          {vs > 0 ? '+' : ''}{vs}%
        </span>
        <span style={{ fontSize: 11, color: '#9CA3AF' }}>vs mês anterior</span>
      </div>
    </div>
  )
}

function HealthCard({ icon: Icon, label, value, sub, color, bg }: {
  icon: React.ElementType; label: string; value: string | number
  sub?: string; color: string; bg: string
}) {
  return (
    <div className="bg-white rounded-xl p-5 flex flex-col gap-3" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
      <div style={{ width: 36, height: 36, borderRadius: 9, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={18} color={color} />
      </div>
      <div>
        <p style={{ fontSize: 12, color: '#6B7280', fontWeight: 500, marginBottom: 4 }}>{label}</p>
        <p style={{ fontSize: 28, fontWeight: 700, color: '#111827', lineHeight: 1 }}>{value}</p>
        {sub && <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>{sub}</p>}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [kpis, setKpis]       = useState<KpisOverview | null>(null)
  const [funnel, setFunnel]   = useState<FunnelStage[]>([])
  const [convs, setConvs]     = useState<Conversion[]>([])
  const [health, setHealth]   = useState<HealthMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  const fetchAll = useCallback(() => {
    if (!localStorage.getItem('token')) { navigate('/login'); return }
    setLoading(true)
    Promise.all([
      api.get<KpisOverview>('/api/v1/dashboard/kpis-overview'),
      api.get<{ stages: FunnelStage[] }>('/api/v1/dashboard/funnel-distribution'),
      api.get<{ conversions: Conversion[] }>('/api/v1/dashboard/funnel-conversions'),
      api.get<HealthMetrics>('/api/v1/dashboard/health-metrics'),
    ])
      .then(([k, f, c, h]) => {
        setKpis(k.data)
        setFunnel(f.data.stages)
        setConvs(c.data.conversions)
        setHealth(h.data)
      })
      .catch(err => {
        if (err.response?.status === 401) { localStorage.removeItem('token'); navigate('/login') }
        else setError('Erro ao carregar dashboard.')
      })
      .finally(() => setLoading(false))
  }, [navigate])

  useEffect(() => { fetchAll() }, [fetchAll])

  if (loading) return (
    <p className="text-center text-sm mt-20" style={{ color: '#9CA3AF' }}>Carregando...</p>
  )
  if (error || !kpis || !health) return (
    <p className="text-center text-sm mt-20" style={{ color: '#EF4444' }}>{error || 'Sem dados.'}</p>
  )

  const metaPct = health.meta_monthly > 0
    ? Math.min(100, Math.round(health.leads_monthly / health.meta_monthly * 100))
    : 0
  const metaColor = metaPct >= 80 ? '#10B981' : metaPct >= 50 ? '#F59E0B' : '#EF4444'

  return (
    <main className="max-w-7xl mx-auto px-4 py-6 flex flex-col gap-6">

      {/* Header */}
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827' }}>Dashboard</h1>
        <p style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}>Visão geral do funil de vendas</p>
      </div>

      {/* Linha 1 — KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {KPI_CONFIG.map(cfg => {
          const data = kpis[cfg.key as keyof KpisOverview]
          return (
            <KpiCard
              key={cfg.key}
              label={cfg.label}
              color={cfg.color}
              bg={cfg.bg}
              Icon={cfg.Icon}
              count={data.count}
              vs={cfg.invert ? -data.vs_previous_month : data.vs_previous_month}
              invert={cfg.invert}
            />
          )
        })}
      </div>

      {/* Linha 2 — Gráficos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Distribuição do Funil */}
        <div className="bg-white rounded-xl p-6 flex flex-col gap-4" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Distribuição do Funil
          </h2>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={funnel} layout="vertical" margin={{ top: 0, right: 60, left: 10, bottom: 0 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="stage" tick={{ fontSize: 12, fill: '#6B7280' }} width={90} />
              <Tooltip
                formatter={(v: number, _: string, p: any) => [`${v} leads (${p.payload.percentage}%)`, '']}
                contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.12)', fontSize: 12 }}
              />
              <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={28}>
                {funnel.map((s) => <Cell key={s.stage} fill={s.color} />)}
                <LabelList
                  dataKey="count"
                  position="right"
                  style={{ fontSize: 12, fontWeight: 600, fill: '#374151' }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Conversões do Funil */}
        <div className="bg-white rounded-xl p-6 flex flex-col gap-4" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Conversões do Funil
          </h2>
          <div className="flex flex-col gap-4 mt-2">
            {convs.map((c, i) => {
              const colors = ['#3B82F6', '#10B981', '#F59E0B', '#059669']
              return (
                <div key={i} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>
                      {c.from} → {c.to}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: colors[i] }}>{c.rate}%</span>
                  </div>
                  <div style={{ background: '#F3F4F6', borderRadius: 99, height: 8, overflow: 'hidden' }}>
                    <div style={{ width: `${c.rate}%`, height: '100%', background: colors[i], borderRadius: 99, transition: 'width 500ms ease' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

      </div>

      {/* Linha 3 — Saúde */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">

        <HealthCard
          icon={AlertTriangle}
          label="Leads Vencidos"
          value={health.vencidos}
          sub="7+ dias parados"
          color={health.vencidos > 0 ? '#EF4444' : '#10B981'}
          bg={health.vencidos > 0 ? '#FEF2F2' : '#ECFDF5'}
        />

        <HealthCard
          icon={PhoneOff}
          label="Não Contatados"
          value={health.uncontacted}
          sub="24h+ sem movimento"
          color={health.uncontacted > 0 ? '#F59E0B' : '#10B981'}
          bg={health.uncontacted > 0 ? '#FFFBEB' : '#ECFDF5'}
        />

        <HealthCard
          icon={Timer}
          label="Tempo Médio no Funil"
          value={`${health.avg_time_in_funnel}d`}
          sub="média geral"
          color="#6366F1"
          bg="#EEF2FF"
        />

        <div className="bg-white rounded-xl p-5 flex flex-col gap-3" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: '#F5F3FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Target size={18} color="#8B5CF6" />
          </div>
          <div>
            <p style={{ fontSize: 12, color: '#6B7280', fontWeight: 500, marginBottom: 4 }}>Meta do Mês</p>
            <p style={{ fontSize: 28, fontWeight: 700, color: metaColor, lineHeight: 1 }}>{metaPct}%</p>
            <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>
              {health.leads_monthly} de {health.meta_monthly} leads
            </p>
          </div>
          <div style={{ background: '#F3F4F6', borderRadius: 99, height: 6, overflow: 'hidden' }}>
            <div style={{ width: `${metaPct}%`, height: '100%', background: metaColor, borderRadius: 99, transition: 'width 500ms ease' }} />
          </div>
        </div>

      </div>

    </main>
  )
}
