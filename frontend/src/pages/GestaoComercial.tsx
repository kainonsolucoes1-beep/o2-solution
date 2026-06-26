import { useState, useEffect } from 'react'
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import {
  Users, ShoppingCart, TrendingUp, DollarSign, TrendingDown, Tag,
  ChevronDown, ChevronRight, X, ChevronLeft,
} from 'lucide-react'
import api from '../api'

const TABS = ['Visão Geral', 'Pipeline', 'Performance'] as const
type Tab = typeof TABS[number]

// ── Interfaces ──────────────────────────────────────────────────────────────
interface Kpis {
  captacoes: number; vendas: number; conversao: number
  receita_potencial: number; perda_financeira: number; ticket_medio: number
}
interface DiarioItem  { dia: number; captacoes: number; vendas: number }
interface OrigemItem  { origem: string; captacoes: number; pct: number }
interface MensalItem  { mes: string; mes_label: string; captacoes: number; vendas: number; receita: number }
interface DrillRawRow  { origem: string; status: string; total_value: number; count: number }
interface DrillRow extends DrillRawRow { grupo: 'SDR' | 'Orgânico'; operador: string }
interface ContractItem { nome: string; origem: string; status: string; valor: number; motivo?: string | null }
type DrillTipo = 'receita_potencial' | 'vendas' | 'perda'

// ── Grouping constants ───────────────────────────────────────────────────────
const O2_NAMES      = new Set(['clara', 'maria eduarda', 'kauany', 'gabrieli', 'o2 solution', 'o2solution'])
const ORGANICO_EXTRA = new Set(['site', 'chatgpt.com', 'chatgpt', 'google', 'instagram', 'facebook', 'whatsapp'])
const isOrganico    = (o: string) => o.toLowerCase().includes('org') || ORGANICO_EXTRA.has(o.toLowerCase())

interface GrupoOrigem {
  nome: string; captacoes: number; pct: number; color: string
  subs: { nome: string; captacoes: number; pct: number }[]
}
function groupOrigens(origens: OrigemItem[]): GrupoOrigem[] {
  const sdrSubs: Record<string, number> = {}
  let o2total = 0
  const orgSubs: Record<string, number> = {}
  for (const o of origens) {
    const lower = o.origem.toLowerCase()
    if (isOrganico(o.origem)) { orgSubs[o.origem] = (orgSubs[o.origem] ?? 0) + o.captacoes }
    else if (O2_NAMES.has(lower)) { o2total += o.captacoes }
    else { sdrSubs[o.origem] = (sdrSubs[o.origem] ?? 0) + o.captacoes }
  }
  if (o2total > 0) sdrSubs['o2 Solution'] = (sdrSubs['o2 Solution'] ?? 0) + o2total
  const sdrTotal = Object.values(sdrSubs).reduce((a, b) => a + b, 0)
  const orgTotal = Object.values(orgSubs).reduce((a, b) => a + b, 0)
  const total = sdrTotal + orgTotal || 1
  const toSubs = (map: Record<string, number>, gt: number) =>
    Object.entries(map).map(([nome, captacoes]) => ({ nome, captacoes, pct: gt > 0 ? Math.round(captacoes / gt * 100) : 0 })).sort((a, b) => b.captacoes - a.captacoes)
  return [
    { nome: 'SDR',      captacoes: sdrTotal, pct: Math.round(sdrTotal / total * 100), color: '#3B82F6', subs: toSubs(sdrSubs, sdrTotal) },
    { nome: 'Orgânico', captacoes: orgTotal, pct: Math.round(orgTotal / total * 100), color: '#10B981', subs: toSubs(orgSubs, orgTotal) },
  ]
}

// ── Drill helpers ────────────────────────────────────────────────────────────
const STAGE_LABELS: Record<string, string> = {
  novo: 'Novo', new: 'Novo', em_atendimento: 'Em Atendimento', attending: 'Em Atendimento',
  qualificacao: 'Qualificação', primeiro_contato: '1º Contato', agendamento: 'Agendamento',
  scheduled: 'Agendado',
  reuniao: 'Reunião', meeting: 'Reunião',
  proposta: 'Enviada', proposal: 'Enviada', proposal_sent: 'Enviada',
  negociacao: 'Negociação', negotiation: 'Negociação',
  waiting_billing: 'Aguard. Faturamento', sale_performed: 'Venda Realizada',
  fechado: 'Fechado', closed: 'Fechado', won: 'Ganho', convertido: 'Convertido',
}
const STAGE_ORDER: Record<string, number> = {
  scheduled: 1, proposal_sent: 2, proposta: 2, waiting_billing: 3, sale_performed: 4,
  fechado: 5, closed: 5, won: 5, convertido: 5,
}
const stageLabel = (s: string) => STAGE_LABELS[s?.toLowerCase()] ?? s
const stageOrder = (s: string) => STAGE_ORDER[s?.toLowerCase()] ?? 99

function normalizeDrill(raw: DrillRawRow[]): DrillRow[] {
  return raw.map(r => ({
    ...r,
    grupo: isOrganico(r.origem) ? 'Orgânico' : 'SDR',
    operador: O2_NAMES.has(r.origem.toLowerCase()) ? 'o2 Solution' : r.origem,
  }))
}

function filterDrill(rows: DrillRow[], path: string[]) {
  if (path.length === 0) return rows
  const rows1 = rows.filter(r => r.grupo === path[0])
  if (path.length === 1) return rows1
  return rows1.filter(r => r.operador === path[1])
}

function sumByKey<T>(rows: T[], keyFn: (r: T) => string, valFn: (r: T) => number) {
  const map: Record<string, number> = {}
  for (const r of rows) { const k = keyFn(r); map[k] = (map[k] ?? 0) + valFn(r) }
  return Object.entries(map).map(([key, total]) => ({ key, total })).sort((a, b) => b.total - a.total)
}

// ── Card config ──────────────────────────────────────────────────────────────
const CARD_CFG = [
  { key: 'captacoes',        label: 'Captações',        icon: Users,        color: '#3B82F6', bg: '#EFF6FF', sub: '#1E40AF', fmt: (v: number) => String(v), clickable: false },
  { key: 'vendas',           label: 'Vendas',           icon: ShoppingCart, color: '#10B981', bg: '#ECFDF5', sub: '#065F46', fmt: (v: number) => String(v), clickable: true  },
  { key: 'conversao',        label: 'Conversão',        icon: TrendingUp,   color: '#7C3AED', bg: '#F5F3FF', sub: '#4C1D95', fmt: (v: number) => `${v}%`,   clickable: false },
  { key: 'receita_potencial',label: 'Receita Potencial',icon: DollarSign,   color: '#059669', bg: '#ECFDF5', sub: '#065F46', fmt: fmtBrl,                   clickable: true  },
  { key: 'perda_financeira', label: 'Perda Financeira', icon: TrendingDown, color: '#EF4444', bg: '#FEF2F2', sub: '#991B1B', fmt: fmtBrl,                   clickable: true  },
  { key: 'ticket_medio',     label: 'Ticket Médio',     icon: Tag,          color: '#F59E0B', bg: '#FFFBEB', sub: '#92400E', fmt: fmtBrl,                   clickable: false },
] as const

const KEY_TO_TIPO: Record<string, DrillTipo> = {
  vendas: 'vendas', receita_potencial: 'receita_potencial', perda_financeira: 'perda',
}

const DRILL_CFG: Record<DrillTipo, { title: string; desc: string; totalColor: string }> = {
  receita_potencial: { title: 'Receita Potencial', desc: 'Todos os leads com valor, exceto Perdidos', totalColor: '#059669' },
  vendas:            { title: 'Vendas',             desc: 'Leads com venda concluída',                totalColor: '#10B981' },
  perda:             { title: 'Perda Financeira',   desc: 'Leads perdidos com valor potencial',       totalColor: '#EF4444' },
}

function fmtBrl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}
function nowMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const GROUP_COLORS: Record<string, string> = { SDR: '#3B82F6', 'Orgânico': '#10B981' }
const STAGE_COLORS = ['#3B82F6', '#8B5CF6', '#F59E0B', '#10B981', '#EF4444', '#EC4899', '#06B6D4']

// ── Component ────────────────────────────────────────────────────────────────
export default function GestaoComercial() {
  const [activeTab, setActiveTab] = useState<Tab>('Visão Geral')
  const [month, setMonth]         = useState(nowMonth())

  const [kpis, setKpis]       = useState<Kpis | null>(null)
  const [diario, setDiario]   = useState<DiarioItem[]>([])
  const [origens, setOrigens] = useState<OrigemItem[]>([])
  const [mensal, setMensal]   = useState<MensalItem[]>([])
  const [loading, setLoading] = useState(false)

  const [expandedGrupo, setExpandedGrupo] = useState<string | null>(null)

  // drill modal
  const [showDrill, setShowDrill]               = useState(false)
  const [drillTipo, setDrillTipo]               = useState<DrillTipo>('receita_potencial')
  const [drillRows, setDrillRows]               = useState<DrillRow[]>([])
  const [drillLoading, setDrillLoading]         = useState(false)
  const [drillPath, setDrillPath]               = useState<string[]>([])
  const [selectedStage, setSelectedStage]       = useState<string | null>(null)
  const [contracts, setContracts]               = useState<ContractItem[]>([])
  const [contractsLoading, setContractsLoading] = useState(false)

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

  function openDrill(tipo: DrillTipo) {
    setDrillTipo(tipo)
    setDrillPath([])
    setSelectedStage(null)
    setShowDrill(true)
    setDrillLoading(true)
    setDrillRows([])
    api.get<DrillRawRow[]>(`/api/v1/gestao-comercial/receita-potencial-drill?month=${month}&tipo=${tipo}`)
      .then(r => setDrillRows(normalizeDrill(r.data)))
      .catch(() => {})
      .finally(() => setDrillLoading(false))
  }

  function openStage(status: string) {
    setSelectedStage(status)
    setContractsLoading(true)
    const origins = [...new Set(filtered.map(r => r.origem))]
    const params = new URLSearchParams({ month, status, tipo: drillTipo })
    if (origins.length > 0) params.set('origens', origins.join(','))
    api.get<ContractItem[]>(`/api/v1/gestao-comercial/receita-contratos?${params}`)
      .then(r => setContracts(r.data))
      .catch(() => setContracts([]))
      .finally(() => setContractsLoading(false))
  }

  // reset drill cache and stage when month changes
  useEffect(() => { setDrillRows([]); setSelectedStage(null) }, [month])
  // reset stage when path changes
  useEffect(() => { setSelectedStage(null) }, [drillPath])

  const grupos  = groupOrigens(origens)
  const maxCap  = grupos.reduce((m, g) => Math.max(m, g.captacoes), 1)

  // ── Drill modal derived data ─────────────────────────────────────────────
  const filtered       = filterDrill(drillRows, drillPath)
  const totalFiltered  = filtered.reduce((s, r) => s + r.total_value, 0)
  const stages         = sumByKey(filtered, r => r.status, r => r.total_value).sort((a, b) => stageOrder(a.key) - stageOrder(b.key))
  const maxStage       = stages[0]?.total ?? 1

  // top navigation items (what to show in the clickable section)
  const navItems: { key: string; label: string; total: number; color: string }[] = (() => {
    if (drillPath.length === 0) {
      // show SDR vs Orgânico
      return ['SDR', 'Orgânico'].map(g => ({
        key: g, label: g,
        total: drillRows.filter(r => r.grupo === g).reduce((s, r) => s + r.total_value, 0),
        color: GROUP_COLORS[g],
      })).filter(i => i.total > 0)
    }
    if (drillPath.length === 1) {
      // show operators within group
      const grouped = filterDrill(drillRows, drillPath)
      return sumByKey(grouped, r => r.operador, r => r.total_value).map(({ key, total }) => ({
        key, label: key, total, color: GROUP_COLORS[drillPath[0]] ?? '#8B5CF6',
      }))
    }
    return []
  })()

  const maxNav = navItems[0]?.total ?? 1

  // breadcrumb labels
  const breadcrumb = ['Total', ...drillPath, ...(selectedStage ? [stageLabel(selectedStage)] : [])]

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
            }}>{tab}</button>
          )
        })}
      </div>

      {/* ── VISÃO GERAL ── */}
      {activeTab === 'Visão Geral' && (
        <div>
          {/* Month picker */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
            <input type="month" value={month} onChange={e => setMonth(e.target.value)} style={{
              padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)',
              fontSize: 13, color: 'var(--text-1)', background: 'var(--bg-card)', cursor: 'pointer',
            }} />
          </div>

          {/* KPI cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 28 }}>
            {CARD_CFG.map(({ key, label, icon: Icon, color, bg, sub, fmt, clickable }) => {
              const value = kpis ? (kpis as Record<string, number>)[key] : 0
              return (
                <div
                  key={key}
                  onClick={clickable ? () => openDrill(KEY_TO_TIPO[key]) : undefined}
                  style={{
                    background: bg, borderRadius: 14, padding: '20px 22px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.07)', borderLeft: `4px solid ${color}`,
                    cursor: clickable ? 'pointer' : 'default',
                    transition: clickable ? 'transform 120ms, box-shadow 120ms' : undefined,
                  }}
                  onMouseEnter={e => { if (clickable) { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = `0 4px 16px ${color}33` } }}
                  onMouseLeave={e => { if (clickable) { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 3px rgba(0,0,0,0.07)' } }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: sub, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 34, height: 34, borderRadius: 9, background: color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Icon size={16} color={color} />
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                    <p style={{ fontSize: 26, fontWeight: 800, color, margin: 0, lineHeight: 1 }}>
                      {loading ? '—' : fmt(value)}
                    </p>
                    {clickable && <span style={{ fontSize: 11, color: color, fontWeight: 600, marginBottom: 2 }}>Ver detalhes →</span>}
                  </div>
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
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }}
                    formatter={(val: number, name: string) => [val, name === 'captacoes' ? 'Captações' : 'Vendas']}
                    labelFormatter={(l: number) => `Dia ${l}`} />
                  <Legend formatter={(v) => v === 'captacoes' ? 'Captações' : 'Vendas'} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="captacoes" stroke="#3B82F6" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="vendas"    stroke="#10B981" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Origens de Captação — expandable */}
            <div className="bg-white rounded-xl" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)', padding: '20px 20px 16px' }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', margin: '0 0 4px' }}>Origens de Captação</p>
              <p style={{ fontSize: 11, color: 'var(--text-subtle)', margin: '0 0 20px' }}>Clique no canal para ver o detalhamento</p>
              {grupos.map(g => {
                const open   = expandedGrupo === g.nome
                const barW   = maxCap > 0 ? Math.max((g.captacoes / maxCap) * 100, 2) : 0
                const subMax = g.subs.reduce((m, s) => Math.max(m, s.captacoes), 1)
                return (
                  <div key={g.nome} style={{ marginBottom: 10 }}>
                    <button onClick={() => setExpandedGrupo(open ? null : g.nome)} style={{
                      width: '100%', background: open ? g.color + '10' : 'transparent',
                      border: `1px solid ${open ? g.color + '40' : 'var(--border)'}`,
                      borderRadius: 10, padding: '10px 14px', cursor: 'pointer', transition: 'all 150ms',
                    }}>
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
                    {open && (
                      <div style={{ marginTop: 6, padding: '12px 14px', background: '#F8FAFC', borderRadius: 10, border: '1px solid var(--border)' }}>
                        {g.subs.map(s => {
                          const sw = Math.max((s.captacoes / subMax) * 100, 2)
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

          {/* Comparativo mensal */}
          <div className="bg-white rounded-xl" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)', padding: '20px 20px 12px' }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', margin: '0 0 4px' }}>Comparativo Mensal</p>
            <p style={{ fontSize: 11, color: 'var(--text-subtle)', margin: '0 0 16px' }}>Captações e vendas dos últimos 6 meses</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={mensal} margin={{ top: 4, right: 24, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="mes_label" tick={{ fontSize: 11, fill: '#94A3B8' }} />
                <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }}
                  formatter={(val: number, name: string) => [val, name === 'captacoes' ? 'Captações' : 'Vendas']} />
                <Legend formatter={(v) => v === 'captacoes' ? 'Captações' : 'Vendas'} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="captacoes" fill="#3B82F6" radius={[4, 4, 0, 0]} maxBarSize={40} />
                <Bar dataKey="vendas"    fill="#10B981" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {activeTab === 'Pipeline'    && <div />}
      {activeTab === 'Performance' && <div />}

      {/* ── DRILL MODAL ── */}
      {showDrill && (
        <div
          onClick={() => setShowDrill(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 100, padding: 24,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--bg-card, #fff)', borderRadius: 18, width: '100%', maxWidth: 620,
              maxHeight: '85vh', overflowY: 'auto',
              boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
            }}
          >
            {/* Modal header */}
            <div style={{ padding: '20px 24px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>{DRILL_CFG[drillTipo].title}</p>
                <p style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 2 }}>{DRILL_CFG[drillTipo].desc}</p>
              </div>
              <button onClick={() => setShowDrill(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-subtle)', padding: 4 }}>
                <X size={18} />
              </button>
            </div>

            {/* Breadcrumb */}
            <div style={{ padding: '12px 24px 0', display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
              {breadcrumb.map((label, i) => {
                const isLast = i === breadcrumb.length - 1
                const targetPath = breadcrumb.slice(1, i + 1)
                return (
                  <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {i > 0 && <ChevronRight size={12} color="#94A3B8" />}
                    <button
                      onClick={() => !isLast && setDrillPath(targetPath.slice(0, i))}
                      style={{
                        background: 'none', border: 'none', cursor: isLast ? 'default' : 'pointer',
                        fontSize: 12, fontWeight: isLast ? 700 : 400,
                        color: isLast ? '#2563EB' : 'var(--text-subtle)',
                        padding: 0,
                      }}
                    >{label}</button>
                  </span>
                )
              })}
            </div>

            {drillLoading ? (
              <p style={{ padding: '40px 24px', textAlign: 'center', fontSize: 13, color: 'var(--text-subtle)' }}>Carregando...</p>
            ) : (
              <div style={{ padding: '16px 24px 24px' }}>
                {/* Current total */}
                <div style={{ marginBottom: 20, padding: '14px 18px', background: '#F0FDF4', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, color: '#065F46', fontWeight: 600 }}>
                    {drillPath.length === 0 ? 'Total geral' : drillPath.join(' › ')}
                  </span>
                  <span style={{ fontSize: 22, fontWeight: 800, color: DRILL_CFG[drillTipo].totalColor }}>{fmtBrl(totalFiltered)}</span>
                </div>

                {/* Navigation items (groups or operators) */}
                {navItems.length > 0 && (
                  <div style={{ marginBottom: 24 }}>
                    <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px' }}>
                      {drillPath.length === 0 ? 'Por canal' : 'Por operador'}
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {navItems.map(item => {
                        const w = maxNav > 0 ? Math.max((item.total / maxNav) * 100, 2) : 0
                        const pct = totalFiltered > 0 ? Math.round(item.total / totalFiltered * 100) : 0
                        return (
                          <button
                            key={item.key}
                            onClick={() => drillPath.length < 2 && setDrillPath([...drillPath, item.key])}
                            disabled={drillPath.length >= 2}
                            style={{
                              width: '100%', textAlign: 'left', background: '#F8FAFC',
                              border: '1px solid var(--border)', borderRadius: 10,
                              padding: '10px 14px', cursor: 'pointer', transition: 'all 120ms',
                            }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = item.color + '10'; (e.currentTarget as HTMLElement).style.borderColor = item.color + '50' }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#F8FAFC'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.color, flexShrink: 0 }} />
                                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{item.label}</span>
                                <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>{pct}%</span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 13, fontWeight: 700, color: item.color }}>{fmtBrl(item.total)}</span>
                                <ChevronRight size={13} color="#94A3B8" />
                              </div>
                            </div>
                            <div style={{ background: '#E2E8F0', borderRadius: 3, height: 5, overflow: 'hidden' }}>
                              <div style={{ width: `${w}%`, height: '100%', background: item.color, borderRadius: 3, transition: 'width 400ms ease' }} />
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Contracts view — shown when a stage is selected */}
                {selectedStage ? (
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px' }}>
                      Contratos — {stageLabel(selectedStage)}
                    </p>
                    {contractsLoading ? (
                      <p style={{ fontSize: 13, color: 'var(--text-subtle)', textAlign: 'center', padding: '16px 0' }}>Carregando...</p>
                    ) : contracts.length === 0 ? (
                      <p style={{ fontSize: 13, color: 'var(--text-subtle)', textAlign: 'center', padding: '16px 0' }}>Nenhum contrato encontrado</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {contracts.map((c, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#F8FAFC', borderRadius: 10, border: '1px solid var(--border)' }}>
                            <div style={{ minWidth: 0 }}>
                              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nome}</p>
                              <p style={{ fontSize: 11, color: 'var(--text-subtle)', margin: '2px 0 0' }}>
                                {c.origem}{drillTipo === 'perda' && c.motivo ? ` · ${c.motivo}` : ''}
                              </p>
                            </div>
                            <span style={{ fontSize: 14, fontWeight: 700, color: DRILL_CFG[drillTipo].totalColor, flexShrink: 0, marginLeft: 12 }}>{fmtBrl(c.valor)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  /* Por Etapa — shown when no stage selected */
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px' }}>Por etapa</p>
                    {stages.length === 0 ? (
                      <p style={{ fontSize: 13, color: 'var(--text-subtle)', textAlign: 'center', padding: '16px 0' }}>Nenhum dado</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {stages.map(({ key, total }, i) => {
                          const w   = Math.max((total / maxStage) * 100, 2)
                          const pct = totalFiltered > 0 ? Math.round(total / totalFiltered * 100) : 0
                          const col = STAGE_COLORS[i % STAGE_COLORS.length]
                          return (
                            <button
                              key={key}
                              onClick={() => openStage(key)}
                              style={{ width: '100%', textAlign: 'left', padding: '10px 14px', background: '#F8FAFC', borderRadius: 10, border: '1px solid var(--border)', cursor: 'pointer', transition: 'all 120ms' }}
                              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = col + '10'; (e.currentTarget as HTMLElement).style.borderColor = col + '50' }}
                              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#F8FAFC'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>{stageLabel(key)}</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <span style={{ fontSize: 13, fontWeight: 700, color: col }}>{fmtBrl(total)}</span>
                                  <span style={{ fontSize: 11, color: 'var(--text-subtle)', minWidth: 34, textAlign: 'right' }}>{pct}%</span>
                                  <ChevronRight size={13} color="#94A3B8" />
                                </div>
                              </div>
                              <div style={{ background: '#E2E8F0', borderRadius: 3, height: 5, overflow: 'hidden' }}>
                                <div style={{ width: `${w}%`, height: '100%', background: col, borderRadius: 3, transition: 'width 400ms ease' }} />
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Back button */}
                {(drillPath.length > 0 || selectedStage) && (
                  <button
                    onClick={() => {
                      if (selectedStage) { setSelectedStage(null) }
                      else { setDrillPath(p => p.slice(0, -1)) }
                    }}
                    style={{
                      marginTop: 20, display: 'flex', alignItems: 'center', gap: 6,
                      background: 'none', border: '1px solid var(--border)', borderRadius: 8,
                      padding: '7px 14px', cursor: 'pointer', fontSize: 12, color: 'var(--text-subtle)',
                    }}
                  >
                    <ChevronLeft size={13} /> Voltar
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
