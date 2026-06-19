import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { TrendingUp, TrendingDown, DollarSign, Users, Zap, Target, Calendar, X } from 'lucide-react'
import api from '../api'
import { statusLabel } from '../utils/statusLabel'

interface FeedItem {
  id: string
  lead_id: string
  lead_name: string
  from_status: string | null
  to_status: string
  changed_by: string | null
  changed_at: string
}

interface PerformanceData {
  captacao_hoje: number
  vs_ontem: number
  captacao_mes: number
  vs_mes_anterior_captacao: number
  valor_carteira: number
  vs_carteira: number
  ticket_medio: number
  vs_ticket: number
  meta_leads: number
  meta_pct: number
  projecao_mes: number
  ranking: { name: string; count: number; pct: number; bar_pct: number }[]
  evolucao_diaria: { day: number; date: string; count: number }[]
  captacao_hoje_por_fonte: { name: string; count: number }[]
}

function fmtBrl(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function Trend({ value, label }: { value: number; label: string }) {
  const up = value >= 0
  const color = up ? '#10B981' : '#EF4444'
  const Icon = up ? TrendingUp : TrendingDown
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <Icon size={13} color={color} />
      <span style={{ fontSize: 12, fontWeight: 600, color }}>
        {value > 0 ? '+' : ''}{value}%
      </span>
      <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>{label}</span>
    </div>
  )
}

function KpiCard({
  label, value, trend, trendLabel, Icon, iconBg, iconColor, large,
}: {
  label: string; value: string; trend: number; trendLabel: string
  Icon: React.ElementType; iconBg: string; iconColor: string; large?: boolean
}) {
  return (
    <div
      className="bg-white rounded-xl flex flex-col gap-3"
      style={{
        padding: large ? '24px' : '20px',
        boxShadow: large ? '0 2px 12px rgba(0,0,0,0.1)' : '0 1px 3px rgba(0,0,0,0.08)',
        border: large ? '2px solid var(--kpi-accent-border)' : '1px solid transparent',
        transition: 'transform 200ms, box-shadow 200ms',
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.1)' }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = large ? '0 2px 12px rgba(0,0,0,0.1)' : '0 1px 3px rgba(0,0,0,0.08)' }}
    >
      <div style={{ width: 38, height: 38, borderRadius: 10, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={19} color={iconColor} />
      </div>
      <div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, marginBottom: 4 }}>{label}</p>
        <p style={{ fontSize: large ? 28 : 26, fontWeight: 700, color: 'var(--text-1)', lineHeight: 1, letterSpacing: '-0.5px' }}>{value}</p>
      </div>
      <Trend value={trend} label={trendLabel} />
    </div>
  )
}

const MEDALS = ['🥇', '🥈', '🥉']
const BAR_COLORS = ['#F59E0B', '#6B7280', '#B45309', '#3B82F6', '#8B5CF6']


const todayStr = new Date().toISOString().slice(0, 10)

export default function Dashboard() {
  const navigate = useNavigate()
  const [data, setData] = useState<PerformanceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [showPicker, setShowPicker] = useState(false)
  const [feed, setFeed] = useState<FeedItem[]>([])

  const fetchAll = useCallback((date?: string | null) => {
    if (!localStorage.getItem('token')) { navigate('/login'); return }
    setLoading(true)
    const params = date ? { date } : {}
    api.get<PerformanceData>('/api/v1/dashboard/performance', { params })
      .then(r => setData(r.data))
      .catch(err => {
        if (err.response?.status === 401) { localStorage.removeItem('token'); navigate('/login') }
        else setError('Erro ao carregar dashboard.')
      })
      .finally(() => setLoading(false))
  }, [navigate])

  useEffect(() => { fetchAll(selectedDate) }, [fetchAll, selectedDate])

  useEffect(() => {
    api.get<FeedItem[]>('/api/v1/dashboard/activity-feed')
      .then(r => setFeed(r.data))
      .catch(() => {})
  }, [])

  function handleDateChange(d: string) {
    setShowPicker(false)
    setSelectedDate(d === todayStr ? null : d)
  }

  function resetDate() {
    setSelectedDate(null)
    setShowPicker(false)
  }


  if (loading) return <p className="text-center text-sm mt-20" style={{ color: 'var(--text-subtle)' }}>Carregando...</p>
  if (error || !data) return <p className="text-center text-sm mt-20" style={{ color: '#EF4444' }}>{error || 'Sem dados.'}</p>

  const metaLeads = data.meta_leads ?? 200
  const metaColor = data.meta_pct >= 80 ? '#10B981' : data.meta_pct >= 50 ? '#F59E0B' : '#EF4444'
  const projecaoColor = (data.projecao_mes ?? 0) >= metaLeads ? '#10B981' : '#F59E0B'
  const faltam = Math.max(0, metaLeads - (data.captacao_mes ?? 0))
  const refDate = selectedDate ? new Date(selectedDate + 'T12:00:00') : new Date()
  const mesNome = refDate.toLocaleString('pt-BR', { month: 'long', year: 'numeric' })
  const dateFmtDisplay = selectedDate
    ? new Date(selectedDate + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : null

  return (
    <main className="px-4 md:px-8 xl:px-12 py-6 flex flex-col gap-6">

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-1)' }}>Dashboard</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>Performance operacional em tempo real</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
          {selectedDate && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 99, padding: '4px 10px 4px 12px' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#2563EB' }}>{dateFmtDisplay}</span>
              <button onClick={resetDate} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2563EB', display: 'flex', alignItems: 'center', padding: 0 }}>
                <X size={13} />
              </button>
            </div>
          )}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowPicker(p => !p)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}
            >
              <Calendar size={14} />
              {!selectedDate && 'Ver dia anterior'}
            </button>
            {showPicker && (
              <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 20, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.12)' }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Selecionar data</p>
                <input
                  type="date"
                  max={todayStr}
                  defaultValue={selectedDate ?? todayStr}
                  autoFocus
                  onChange={e => handleDateChange(e.target.value)}
                  style={{ fontSize: 13, padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border-in)', color: 'var(--text-2)', background: 'var(--bg-input)', outline: 'none' }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 xl:gap-6">
        <KpiCard
          label={selectedDate ? `Captação — ${dateFmtDisplay}` : 'Captação Hoje'}
          value={String(data.captacao_hoje)}
          trend={data.vs_ontem}
          trendLabel="vs ontem"
          Icon={Zap}
          iconBg="#EFF6FF" iconColor="#3B82F6"
        />
        <KpiCard
          label="Captação do Mês"
          value={String(data.captacao_mes)}
          trend={data.vs_mes_anterior_captacao}
          trendLabel="vs mês anterior"
          Icon={Users}
          iconBg="#ECFDF5" iconColor="#10B981"
        />
        <KpiCard
          label="Valor em Carteira"
          value={fmtBrl(data.valor_carteira)}
          trend={data.vs_carteira}
          trendLabel="vs mês anterior"
          Icon={DollarSign}
          iconBg="#F5F3FF" iconColor="#8B5CF6"
          large
        />
        <KpiCard
          label="Ticket Médio"
          value={fmtBrl(data.ticket_medio)}
          trend={data.vs_ticket}
          trendLabel="vs mês anterior"
          Icon={Target}
          iconBg="#FFFBEB" iconColor="#F59E0B"
        />
      </div>

      {/* Captação hoje por fonte — mini-cards */}
      {data.captacao_hoje_por_fonte && data.captacao_hoje_por_fonte.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {selectedDate ? `Captação por Fonte — ${dateFmtDisplay}` : 'Captação Hoje por Fonte'}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
            {data.captacao_hoje_por_fonte.map((f, i) => {
              const borderColors = ['#F59E0B', '#9CA3AF', '#B45309', '#3B82F6', '#8B5CF6', '#10B981']
              const numColors    = ['#D97706', '#6B7280', '#92400E', '#2563EB', '#7C3AED', '#059669']
              const badges       = ['1°', '2°', '3°']
              const border = borderColors[Math.min(i, borderColors.length - 1)]
              const numColor = numColors[Math.min(i, numColors.length - 1)]
              return (
                <div
                  key={f.name}
                  className="bg-white rounded-xl flex flex-col gap-1"
                  style={{
                    padding: '14px 16px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                    borderLeft: `4px solid ${border}`,
                    transition: 'transform 180ms, box-shadow 180ms',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.1)' }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08)' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11, color: 'var(--text-subtle)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>{f.name}</span>
                    {i < 3 && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: border, background: `${border}18`, borderRadius: 99, padding: '1px 6px', flexShrink: 0 }}>
                        {badges[i]}
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: 28, fontWeight: 700, color: numColor, lineHeight: 1, letterSpacing: '-0.5px' }}>{f.count}</p>
                  <p style={{ fontSize: 11, color: border, fontWeight: 600, opacity: 0.75 }}>
                    {data.captacao_hoje > 0 ? `${Math.round(f.count / data.captacao_hoje * 100)}% do dia` : '—'}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Ranking + Meta/Projeção */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 xl:gap-6 items-start">

        {/* Ranking */}
        <div className="md:col-span-3 bg-white rounded-xl p-6 flex flex-col gap-5" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Ranking de Operadores — {mesNome}
          </h2>
          {data.ranking.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-subtle)' }}>Sem captações no período.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {data.ranking.map((op, i) => (
                <div
                  key={op.name}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, transition: 'opacity 150ms' }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = '0.75')}
                  onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                >
                  <span style={{ fontSize: i < 3 ? 20 : 13, width: 28, textAlign: 'center', flexShrink: 0, color: 'var(--text-subtle)', fontWeight: 700 }}>
                    {i < 3 ? MEDALS[i] : `${i + 1}°`}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {op.name}
                      </span>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0, marginLeft: 8 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{op.count}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-subtle)', minWidth: 36, textAlign: 'right' }}>{op.pct}%</span>
                      </div>
                    </div>
                    <div style={{ background: 'var(--bg-subtle)', borderRadius: 99, height: 7, overflow: 'hidden' }}>
                      <div style={{
                        width: `${op.bar_pct}%`, height: '100%', borderRadius: 99,
                        background: BAR_COLORS[Math.min(i, BAR_COLORS.length - 1)],
                        transition: 'width 600ms ease',
                      }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Meta + Projeção */}
        <div className="md:col-span-2 flex flex-col gap-4">

          <div className="bg-white rounded-xl p-6 flex flex-col gap-4" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
            <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Meta Mensal
            </h2>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-1)', lineHeight: 1 }}>{data.captacao_mes ?? 0}</p>
                <p style={{ fontSize: 12, color: 'var(--text-subtle)', marginTop: 4 }}>de {metaLeads} leads</p>
              </div>
              <p style={{ fontSize: 30, fontWeight: 700, color: metaColor, lineHeight: 1 }}>{data.meta_pct}%</p>
            </div>
            <div style={{ background: 'var(--bg-subtle)', borderRadius: 99, height: 10, overflow: 'hidden' }}>
              <div style={{ width: `${data.meta_pct}%`, height: '100%', background: metaColor, borderRadius: 99, transition: 'width 700ms ease' }} />
            </div>
            <p style={{ fontSize: 12, color: faltam === 0 ? '#10B981' : 'var(--text-muted)', fontWeight: faltam === 0 ? 600 : 400 }}>
              {faltam === 0 ? 'Meta atingida! 🎉' : `Faltam ${faltam} leads para a meta`}
            </p>
          </div>

          <div className="bg-white rounded-xl p-6 flex flex-col gap-3" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
            <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Projeção do Mês
            </h2>
            <p style={{ fontSize: 30, fontWeight: 700, color: projecaoColor, lineHeight: 1 }}>{data.projecao_mes ?? 0} leads</p>
            <p style={{ fontSize: 12, color: projecaoColor, fontWeight: 600 }}>
              {(data.projecao_mes ?? 0) >= metaLeads
                ? `+${(data.projecao_mes ?? 0) - metaLeads} acima da meta`
                : `${metaLeads - (data.projecao_mes ?? 0)} abaixo da meta`}
            </p>
            <p style={{ fontSize: 11, color: 'var(--text-subtle)' }}>Baseado no ritmo atual de fechamentos</p>
          </div>

        </div>
      </div>

      {/* Evolução diária */}
      <div className="bg-white rounded-xl p-6 flex flex-col gap-4" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Evolução da Captação — {mesNome}
          </h2>
          <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>Clique no número do dia para ver os leads</span>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart
            data={data.evolucao_diaria}
            margin={{ top: 5, right: 20, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="captGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-lt)" vertical={false} />
            <XAxis
              dataKey="day"
              tickLine={false}
              axisLine={false}
              tick={(props: { x: number; y: number; payload: { value: number } }) => {
                const { x, y, payload } = props
                const item = data.evolucao_diaria.find(d => d.day === payload.value)
                return (
                  <text
                    x={x} y={y} dy={14}
                    textAnchor="middle"
                    fontSize={11}
                    fill={item ? '#3B82F6' : 'var(--text-subtle)'}
                    style={{ cursor: item ? 'pointer' : 'default', fontWeight: item ? 600 : 400, textDecoration: item ? 'underline' : 'none' }}
                    onClick={() => item && navigate(`/leads-report?date_from=${item.date}&date_to=${item.date}`)}
                  >
                    {payload.value}
                  </text>
                )
              }}
            />
            <YAxis tick={{ fontSize: 11, fill: 'var(--text-subtle)' }} tickLine={false} axisLine={false} allowDecimals={false} width={30} />
            <Tooltip
              contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', boxShadow: '0 2px 8px rgba(0,0,0,0.12)', fontSize: 12, background: 'var(--bg-card)', color: 'var(--text-2)' }}
              formatter={(v: number) => [v, 'Leads']}
              labelFormatter={(l) => `Dia ${l}`}
            />
            <Area
              type="monotone"
              dataKey="count"
              stroke="#3B82F6"
              strokeWidth={2}
              fill="url(#captGrad)"
              dot={{ r: 3, fill: '#3B82F6', strokeWidth: 0 }}
              activeDot={{ r: 6, fill: '#2563EB', stroke: '#fff', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Feed de atividades */}
      <div className="bg-white rounded-xl p-6 flex flex-col gap-4" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Atividades Recentes
        </h2>
        {feed.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-subtle)' }}>Nenhuma atividade registrada.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {feed.map((item, i) => {
              const dt = new Date(item.changed_at)
              const dtStr = dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
                + ' ' + dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
              return (
                <div
                  key={item.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 0',
                    borderBottom: i < feed.length - 1 ? '1px solid var(--border-lt)' : 'none',
                  }}
                >
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#3B82F6', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>
                      {item.lead_name}
                    </span>
                    <span style={{ fontSize: 13, color: 'var(--text-subtle)', marginLeft: 6 }}>
                      {item.from_status
                        ? <>{statusLabel(item.from_status)} <span style={{ color: 'var(--text-subtle)' }}>→</span> <strong style={{ color: 'var(--text-2)' }}>{statusLabel(item.to_status)}</strong></>
                        : <>entrou como <strong style={{ color: 'var(--text-2)' }}>{statusLabel(item.to_status)}</strong></>
                      }
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>{dtStr}</span>
                    {item.changed_by && (
                      <span style={{ fontSize: 11, color: 'var(--text-subtle)', fontStyle: 'italic' }}>{item.changed_by}</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

    </main>
  )
}
