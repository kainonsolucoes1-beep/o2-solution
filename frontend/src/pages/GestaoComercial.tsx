import { useState, useEffect } from 'react'
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import {
  Users, ShoppingCart, TrendingUp, DollarSign, TrendingDown, Tag, ChevronDown, ChevronRight,
} from 'lucide-react'
import api from '../api'

const TABS = ['Visão Geral', 'Pipeline', 'Performance'] as const
type Tab = typeof TABS[number]

interface Kpis {
  captacoes: number; vendas: number; conversao: number
  receita: number; perda_financeira: number; ticket_medio: number
}
interface DiarioItem { dia: number; captacoes: number; vendas: number }
interface OrigemItem { origem: string; captacoes: number; pct: number }
interface MensalItem { mes: string; mes_label: string; captacoes: number; vendas: number; receita: number }

interface GrupoOrigem {
  nome: string
  captacoes: number
  pct: number
  color: string
  subs: { nome: string; captacoes: number; pct: number }[]
}

// Names that belong to "o2 Solution" group within SDR
const O2_NAMES = new Set(['clara', 'maria eduarda', 'kauany', 'gabrieli', 'o2 solution', 'o2solution'])
const ORGANICO_EXTRA = new Set(['site', 'chatgpt.com', 'chatgpt', 'google', 'instagram', 'facebook', 'whatsapp'])
const isOrganico = (o: string) => o.toLowerCase().includes('org') || ORGANICO_EXTRA.has(o.toLowerCase())

function groupOrigens(origens: OrigemItem[]): GrupoOrigem[] {
  const sdrSubs: Record<string, number> = {}
  let o2total = 0
  const orgSubs: Record<string, number> = {}

  for (const o of origens) {
    const lower = o.origem.toLowerCase()
    if (isOrganico(o.origem)) {
      orgSubs[o.origem] = (orgSubs[o.origem] ?? 0) + o.captacoes
    } else if (O2_NAMES.has(lower)) {
      o2total += o.captacoes
    } else {
      sdrSubs[o.origem] = (sdrSubs[o.origem] ?? 0) + o.captacoes
    }
  }

  if (o2total > 0) sdrSubs['o2 Solution'] = (sdrSubs['o2 Solution'] ?? 0) + o2total

  const sdrTotal = Object.values(sdrSubs).reduce((a, b) => a + b, 0)
  const orgTotal = Object.values(orgSubs).reduce((a, b) => a + b, 0)
  const total = sdrTotal + orgTotal || 1

  const toSubs = (map: Record<string, number>, groupTotal: number) =>
    Object.entries(map)
      .map(([nome, captacoes]) => ({ nome, captacoes, pct: groupTotal > 0 ? Math.round(captacoes / groupTotal * 100) : 0 }))
      .sort((a, b) => b.captacoes - a.captacoes)

  return [
    { nome: 'SDR', captacoes: sdrTotal, pct: Math.round(sdrTotal / total * 100), color: '#3B82F6', subs: toSubs(sdrSubs, sdrTotal) },
    { nome: 'Orgânico', captacoes: orgTotal, pct: Math.round(orgTotal / total * 100), color: '#10B981', subs: toSubs(orgSubs, orgTotal) },
  ]
}

function fmtBrl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}
function nowMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const CARD_CFG = [
  { key: 'captacoes',        label: 'Captações',       icon: Users,        color: '#3B82F6', bg: '#EFF6FF', sub: '#1E40AF', fmt: (v: number) => String(v) },
  { key: 'vendas',           label: 'Vendas',           icon: ShoppingCart, color: '#10B981', bg: '#ECFDF5', sub: '#065F46', fmt: (v: number) => String(v) },
  { key: 'conversao',        label: 'Conversão',        icon: TrendingUp,   color: '#7C3AED', bg: '#F5F3FF', sub: '#4C1D95', fmt: (v: number) => `${v}%` },
  { key: 'receita',          label: 'Receita',          icon: DollarSign,   color: '#059669', bg: '#ECFDF5', sub: '#065F46', fmt: fmtBrl },
  { key: 'perda_financeira', label: 'Perda Financeira', icon: TrendingDown, color: '#EF4444', bg: '#FEF2F2', sub: '#991B1B', fmt: fmtBrl },
  { key: 'ticket_medio',     label: 'Ticket Médio',     icon: Tag,          color: '#F59E0B', bg: '#FFFBEB', sub: '#92400E', fmt: fmtBrl },
] as const

export default function GestaoComercial() {
  const [activeTab, setActiveTab] = useState<Tab>('Visão Geral')
  const [month, setMonth] = useState(nowMonth())

  const [kpis, setKpis] = useState<Kpis | null>(null)
  const [diario, setDiario] = useState<DiarioItem[]>([])
  const [origens, setOrigens] = useState<OrigemItem[]>([])
  const [mensal, setMensal] = useState<MensalItem[]>([])
  const [loading, setLoading] = useState(false)

  const [expandedGrupo, setExpandedGrupo] = useState<string | null>(null)

  useEffect(() => {
    if (activeTab !== 'Visão Geral') return
    setLoading(true)
    Promise.all([
      api.get<Kpis>(`/api/v1/gestao-comercial/visao-geral?month=${month}`),
      api.get<DiarioItem[]>(`/api/v1/gestao-comercial/evolucao-diaria?month=${month}`),
      api.get<OrigemItem[]>(`/api/v1/gestao-comercial/origens-captacao?month=${month}`),
      api.get<MensalItem[]>('/api/v1/gestao-comercial/comparativo-mensal'),
    ]).then(([k, d, o, m]) => {
      setKpis(k.data); setDiario(d.data); setOrigens(o.data); setMensal(m.data)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [activeTab, month])

  const grupos = groupOrigens(origens)
  const maxCap = grupos.reduce((m, g) => Math.max(m, g.captacoes), 1)

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Gestão Comercial</h1>
        <p style={{ fontSize: 13, color: 'var(--text-subtle)', marginTop: 4 }}>Acompanhe resultados, pipeline e performance da equipe</p>
      </div>

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 28, borderBottom: '2px solid var(--border)' }}>
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
              type="month" value={month} onChange={e => setMonth(e.target.value)}
              style={{
                padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)',
                fontSize: 13, color: 'var(--text-1)', background: 'var(--bg-card)', cursor: 'pointer',
              }}
            />
          </div>

          {/* KPI cards — 3x2 grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 28 }}>
            {CARD_CFG.map(({ key, label, icon: Icon, color, bg, sub, fmt }) => {
              const value = kpis ? (kpis as Record<string, number>)[key] : 0
              return (
                <div key={key} style={{
                  background: bg, borderRadius: 14, padding: '20px 22px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.07)', borderLeft: `4px solid ${color}`,
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

          {/* Charts — 2 columns */}
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

            {/* Origens de Captação — expandable */}
            <div className="bg-white rounded-xl" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)', padding: '20px 20px 16px' }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', margin: '0 0 4px' }}>Origens de Captação</p>
              <p style={{ fontSize: 11, color: 'var(--text-subtle)', margin: '0 0 20px' }}>Clique no canal para ver o detalhamento</p>

              {grupos.map(g => {
                const open = expandedGrupo === g.nome
                const barW = maxCap > 0 ? Math.max((g.captacoes / maxCap) * 100, 2) : 0
                const subMax = g.subs.reduce((m, s) => Math.max(m, s.captacoes), 1)

                return (
                  <div key={g.nome} style={{ marginBottom: 10 }}>
                    {/* Group row — clickable */}
                    <button
                      onClick={() => setExpandedGrupo(open ? null : g.nome)}
                      style={{
                        width: '100%', background: open ? g.color + '10' : 'transparent',
                        border: `1px solid ${open ? g.color + '40' : 'var(--border)'}`,
                        borderRadius: 10, padding: '10px 14px', cursor: 'pointer',
                        transition: 'background 150ms, border-color 150ms',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 10, height: 10, borderRadius: '50%', background: g.color }} />
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{g.nome}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>{g.pct}%</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 14, fontWeight: 800, color: g.color }}>{g.captacoes}</span>
                          {open ? <ChevronDown size={14} color={g.color} /> : <ChevronRight size={14} color="#94A3B8" />}
                        </div>
                      </div>
                      <div style={{ background: '#F1F5F9', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                        <div style={{ width: `${barW}%`, height: '100%', background: g.color, borderRadius: 4, transition: 'width 500ms ease' }} />
                      </div>
                    </button>

                    {/* Sub-items — expanded */}
                    {open && (
                      <div style={{
                        marginTop: 6, padding: '12px 14px',
                        background: '#F8FAFC', borderRadius: 10,
                        border: '1px solid var(--border)',
                        animation: 'fadeIn 150ms ease',
                      }}>
                        {g.subs.length === 0 ? (
                          <p style={{ fontSize: 12, color: 'var(--text-subtle)', margin: 0 }}>Sem dados</p>
                        ) : g.subs.map(s => {
                          const sw = subMax > 0 ? Math.max((s.captacoes / subMax) * 100, 2) : 0
                          return (
                            <div key={s.nome} style={{ marginBottom: 10 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                <span style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 500 }}>{s.nome}</span>
                                <div style={{ display: 'flex', gap: 10 }}>
                                  <span style={{ fontSize: 12, fontWeight: 700, color: g.color }}>{s.captacoes}</span>
                                  <span style={{ fontSize: 11, color: 'var(--text-subtle)', minWidth: 30, textAlign: 'right' }}>{s.pct}%</span>
                                </div>
                              </div>
                              <div style={{ background: '#E2E8F0', borderRadius: 3, height: 5, overflow: 'hidden' }}>
                                <div style={{ width: `${sw}%`, height: '100%', background: g.color + 'BB', borderRadius: 3, transition: 'width 400ms ease' }} />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
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

      {activeTab === 'Pipeline' && <div />}
      {activeTab === 'Performance' && <div />}
    </div>
  )
}
