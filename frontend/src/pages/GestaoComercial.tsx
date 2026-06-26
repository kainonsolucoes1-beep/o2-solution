import { useState, useEffect } from 'react'
import {
  LineChart, Line, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import {
  Users, ShoppingCart, TrendingUp, DollarSign, TrendingDown, Tag,
} from 'lucide-react'
import api from '../api'

const TABS = ['Visão Geral', 'Pipeline', 'Performance'] as const
type Tab = typeof TABS[number]

interface Kpis {
  captacoes: number
  vendas: number
  conversao: number
  receita: number
  perda_financeira: number
  ticket_medio: number
}

interface DiarioItem { dia: number; captacoes: number; vendas: number }
interface OrigemItem { origem: string; captacoes: number; pct: number }
interface MensalItem { mes: string; mes_label: string; captacoes: number; vendas: number; receita: number }

function fmtBrl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

function nowMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const CARD_CFG = [
  { key: 'captacoes',       label: 'Captações',        icon: Users,         color: '#3B82F6', bg: '#EFF6FF', sub: '#1E40AF', fmt: (v: number) => String(v) },
  { key: 'vendas',          label: 'Vendas',            icon: ShoppingCart,  color: '#10B981', bg: '#ECFDF5', sub: '#065F46', fmt: (v: number) => String(v) },
  { key: 'conversao',       label: 'Conversão',         icon: TrendingUp,    color: '#7C3AED', bg: '#F5F3FF', sub: '#4C1D95', fmt: (v: number) => `${v}%` },
  { key: 'receita',         label: 'Receita',           icon: DollarSign,    color: '#059669', bg: '#ECFDF5', sub: '#065F46', fmt: fmtBrl },
  { key: 'perda_financeira',label: 'Perda Financeira',  icon: TrendingDown,  color: '#EF4444', bg: '#FEF2F2', sub: '#991B1B', fmt: fmtBrl },
  { key: 'ticket_medio',    label: 'Ticket Médio',      icon: Tag,           color: '#F59E0B', bg: '#FFFBEB', sub: '#92400E', fmt: fmtBrl },
] as const

const CHART_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899']

export default function GestaoComercial() {
  const [activeTab, setActiveTab] = useState<Tab>('Visão Geral')
  const [month, setMonth] = useState(nowMonth())

  const [kpis, setKpis] = useState<Kpis | null>(null)
  const [diario, setDiario] = useState<DiarioItem[]>([])
  const [origens, setOrigens] = useState<OrigemItem[]>([])
  const [mensal, setMensal] = useState<MensalItem[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (activeTab !== 'Visão Geral') return
    setLoading(true)
    Promise.all([
      api.get<Kpis>(`/api/v1/gestao-comercial/visao-geral?month=${month}`),
      api.get<DiarioItem[]>(`/api/v1/gestao-comercial/evolucao-diaria?month=${month}`),
      api.get<OrigemItem[]>(`/api/v1/gestao-comercial/origens-captacao?month=${month}`),
      api.get<MensalItem[]>('/api/v1/gestao-comercial/comparativo-mensal'),
    ]).then(([k, d, o, m]) => {
      setKpis(k.data)
      setDiario(d.data)
      setOrigens(o.data)
      setMensal(m.data)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [activeTab, month])

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Gestão Comercial</h1>
        <p style={{ fontSize: 13, color: 'var(--text-subtle)', marginTop: 4 }}>Acompanhe resultados, pipeline e performance da equipe</p>
      </div>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 28, borderBottom: '2px solid var(--border)', paddingBottom: 0 }}>
        {TABS.map(tab => {
          const active = activeTab === tab
          return (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              padding: '9px 20px', fontSize: 13, fontWeight: active ? 700 : 500,
              color: active ? '#2563EB' : 'var(--text-subtle)',
              background: 'none', border: 'none', cursor: 'pointer',
              borderBottom: active ? '2px solid #2563EB' : '2px solid transparent',
              marginBottom: -2, borderRadius: 0, transition: 'color 150ms, border-color 150ms',
            }}>
              {tab}
            </button>
          )
        })}
      </div>

      {/* ── VISÃO GERAL ── */}
      {activeTab === 'Visão Geral' && (
        <div>
          {/* Month picker */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
            <input
              type="month"
              value={month}
              onChange={e => setMonth(e.target.value)}
              style={{
                padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)',
                fontSize: 13, color: 'var(--text-1)', background: 'var(--bg-card)',
                cursor: 'pointer',
              }}
            />
          </div>

          {/* KPI cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 28 }}>
            {CARD_CFG.map(({ key, label, icon: Icon, color, bg, sub, fmt }) => {
              const value = kpis ? (kpis as Record<string, number>)[key] : 0
              return (
                <div key={key} style={{
                  background: bg, borderRadius: 14,
                  padding: '20px 22px', boxShadow: '0 1px 3px rgba(0,0,0,0.07)',
                  borderLeft: `4px solid ${color}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: sub, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
                    <div style={{ width: 34, height: 34, borderRadius: 9, background: color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon size={16} color={color} />
                    </div>
                  </div>
                  <p style={{ fontSize: 26, fontWeight: 800, color, margin: 0, lineHeight: 1 }}>
                    {loading ? '—' : fmt(value)}
                  </p>
                </div>
              )
            })}
          </div>

          {/* Charts */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>

            {/* Evolução diária */}
            <div className="bg-white rounded-xl" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)', padding: '20px 20px 12px' }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', margin: '0 0 4px' }}>Evolução Diária</p>
              <p style={{ fontSize: 11, color: 'var(--text-subtle)', margin: '0 0 16px' }}>Captações e vendas por dia do mês</p>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={diario} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis dataKey="dia" tick={{ fontSize: 10, fill: '#94A3B8' }} interval={4} />
                  <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }}
                    formatter={(val: number, name: string) => [val, name === 'captacoes' ? 'Captações' : 'Vendas']}
                    labelFormatter={(l: number) => `Dia ${l}`}
                  />
                  <Legend formatter={(v) => v === 'captacoes' ? 'Captações' : 'Vendas'} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="captacoes" stroke="#3B82F6" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="vendas" stroke="#10B981" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Origens de captação */}
            <div className="bg-white rounded-xl" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)', padding: '20px 20px 12px' }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', margin: '0 0 4px' }}>Origens de Captação</p>
              <p style={{ fontSize: 11, color: 'var(--text-subtle)', margin: '0 0 16px' }}>Volume por canal no mês</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={origens} layout="vertical" margin={{ top: 0, right: 32, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#94A3B8' }} />
                  <YAxis type="category" dataKey="origem" tick={{ fontSize: 10, fill: '#64748B' }} width={70} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }}
                    formatter={(val: number, _: string, entry: { payload: OrigemItem }) => [`${val} (${entry.payload.pct}%)`, 'Captações']}
                  />
                  <Bar dataKey="captacoes" radius={[0, 4, 4, 0]}>
                    {origens.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Comparativo mensal — full width */}
          <div className="bg-white rounded-xl" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)', padding: '20px 20px 12px' }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', margin: '0 0 4px' }}>Comparativo Mensal</p>
            <p style={{ fontSize: 11, color: 'var(--text-subtle)', margin: '0 0 16px' }}>Captações e vendas dos últimos 6 meses</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={mensal} margin={{ top: 4, right: 24, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="mes_label" tick={{ fontSize: 11, fill: '#94A3B8' }} />
                <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }}
                  formatter={(val: number, name: string) => [val, name === 'captacoes' ? 'Captações' : 'Vendas']}
                />
                <Legend formatter={(v) => v === 'captacoes' ? 'Captações' : 'Vendas'} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="captacoes" fill="#3B82F6" radius={[4, 4, 0, 0]} maxBarSize={40} />
                <Bar dataKey="vendas" fill="#10B981" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {activeTab === 'Pipeline' && (
        <div style={{ color: 'var(--text-subtle)', fontSize: 13 }} />
      )}

      {activeTab === 'Performance' && (
        <div style={{ color: 'var(--text-subtle)', fontSize: 13 }} />
      )}
    </div>
  )
}
