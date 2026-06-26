import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  LineChart, Line, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import {
  Users, ShoppingCart, TrendingUp, DollarSign, TrendingDown, Tag,
  ChevronDown, ChevronRight, X, ChevronLeft,
  Clock, CheckSquare, FileText, Handshake, Timer, XCircle,
} from 'lucide-react'
import api from '../api'

const TABS = ['Visão Geral', 'Pipeline', 'Performance'] as const
type Tab = typeof TABS[number]

// ── Visão Geral types ────────────────────────────────────────────────────────
interface Kpis {
  captacoes: number; vendas: number; conversao: number
  receita_potencial: number; perda_financeira: number; ticket_medio: number
}
interface DiarioItem  { dia: number; captacoes: number; vendas: number }
interface OrigemItem  { origem: string; captacoes: number; pct: number }
interface MensalItem  { mes: string; mes_label: string; captacoes: number; vendas: number; receita: number }
interface DrillRawRow { origem: string; status: string; total_value: number; count: number }
interface DrillRow extends DrillRawRow { grupo: 'SDR' | 'Orgânico'; operador: string }
interface ContractItem { nome: string; origem: string; status: string; valor: number; motivo?: string | null }
type DrillTipo = 'receita_potencial' | 'vendas' | 'perda'

// ── Pipeline types ───────────────────────────────────────────────────────────
interface PipelineOverview {
  novo: number; qualificado: number; proposta: number; negociacao: number; fechado: number; perdido: number
  novo_value: number; qualificado_value: number; proposta_value: number
  negociacao_value: number; fechado_value: number; perdido_value: number
}
interface AlertLead { id: string; name: string; hours_without_action?: number; status?: string }
interface PipelineAlerts {
  vencidos: AlertLead[]; uncontacted: AlertLead[]
  vencidos_count?: number; uncontacted_count?: number
  avg_time_in_funnel?: number; avg_first_contact_minutes?: number; contacted_count?: number
}
interface MotivoItem { reason: string; count: number; pct: number; total_value: number }

// ── Grouping constants ───────────────────────────────────────────────────────
const O2_NAMES       = new Set(['clara', 'maria eduarda', 'kauany', 'gabrieli', 'o2 solution', 'o2solution'])
const ORGANICO_EXTRA = new Set(['site', 'chatgpt.com', 'chatgpt', 'google', 'instagram', 'facebook', 'whatsapp'])
const isOrganico     = (o: string) => o.toLowerCase().includes('org') || ORGANICO_EXTRA.has(o.toLowerCase())

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
  scheduled: 'Agendado', reuniao: 'Reunião', meeting: 'Reunião',
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

// ── Shared helpers ───────────────────────────────────────────────────────────
function fmtBrl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function nowMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
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

const GROUP_COLORS: Record<string, string> = { SDR: '#3B82F6', 'Orgânico': '#10B981' }
const STAGE_COLORS = ['#3B82F6', '#8B5CF6', '#F59E0B', '#10B981', '#EF4444', '#EC4899', '#06B6D4']
const CONV_COLORS  = ['#3B82F6', '#10B981', '#F59E0B', '#059669']

// ════════════════════════════════════════════════════════════════════════════
// Pipeline sub-tab component
// ════════════════════════════════════════════════════════════════════════════
function PipelineTab() {
  const navigate = useNavigate()
  const _now = new Date()
  const todayStr   = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}-${String(_now.getDate()).padStart(2, '0')}`
  const monthStart = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}-01`

  const [dateFrom, setDateFrom]               = useState(monthStart)
  const [dateTo, setDateTo]                   = useState(todayStr)
  const [selectedSources, setSelectedSources] = useState<string[]>([])
  const [sourcesOpen, setSourcesOpen]         = useState(false)
  const [sources, setSources]                 = useState<string[]>([])
  const [overview, setOverview]               = useState<PipelineOverview | null>(null)
  const [alerts, setAlerts]                   = useState<PipelineAlerts | null>(null)
  const [loading, setLoading]                 = useState(true)
  const [error, setError]                     = useState('')
  const [showLostModal, setShowLostModal]     = useState(false)
  const [motivos, setMotivos]                 = useState<MotivoItem[]>([])
  const [motivosLoading, setMotivosLoading]   = useState(false)

  useEffect(() => {
    api.get<string[]>('/api/v1/leads/origins').then(r => setSources(r.data)).catch(() => {})
  }, [])

  const fetchAll = useCallback(() => {
    const qs = new URLSearchParams({ date_from: dateFrom, date_to: dateTo })
    if (selectedSources.length > 0) qs.set('source', selectedSources.join(','))
    setLoading(true)
    Promise.all([
      api.get<PipelineOverview>(`/api/v1/pipeline/overview?${qs}`),
      api.get<PipelineAlerts>(`/api/v1/pipeline/alerts?${qs}`),
    ])
      .then(([ov, al]) => { setOverview(ov.data); setAlerts(al.data) })
      .catch(err => {
        if (err.response?.status === 401) { localStorage.removeItem('token'); navigate('/login') }
        else setError('Erro ao carregar pipeline.')
      })
      .finally(() => setLoading(false))
  }, [navigate, dateFrom, dateTo, selectedSources])

  useEffect(() => { fetchAll() }, [fetchAll])

  function openLostModal() {
    setShowLostModal(true); setMotivosLoading(true)
    const params: Record<string, string> = { date_from: dateFrom, date_to: dateTo }
    if (selectedSources.length > 0) params.origin = selectedSources.join(',')
    api.get<MotivoItem[]>('/api/v1/kpis/motivos-cancelamento', { params })
      .then(r => setMotivos(r.data)).catch(() => setMotivos([]))
      .finally(() => setMotivosLoading(false))
  }

  const cardNav = (params: Record<string, string>) => {
    const p = new URLSearchParams({ date_from: dateFrom, date_to: dateTo, ...params })
    if (selectedSources.length > 0) p.set('origem', selectedSources.join(','))
    return `?${p.toString()}`
  }

  if (loading) return <p style={{ padding: '40px 0', textAlign: 'center', fontSize: 13, color: 'var(--text-subtle)' }}>Carregando...</p>
  if (error || !overview || !alerts) return <p style={{ padding: '40px 0', textAlign: 'center', fontSize: 13, color: '#EF4444' }}>{error || 'Sem dados.'}</p>

  const overviewCards = [
    { label: 'Pendente',    value: overview.novo,        color: '#3B82F6', bg: '#EFF6FF', icon: '📥', nav: cardNav({ status: 'pending,novo,new' }) },
    { label: 'Agendado',    value: overview.qualificado, color: '#10B981', bg: '#ECFDF5', icon: '✅', nav: cardNav({ status: 'scheduled,qualificado,qualified' }) },
    { label: 'Enviada',     value: overview.proposta,    color: '#F59E0B', bg: '#FFFBEB', icon: '📄', nav: cardNav({ status: 'proposal_sent' }) },
    { label: 'Qualificado', value: overview.negociacao,  color: '#8B5CF6', bg: '#F5F3FF', icon: '🔥', nav: cardNav({ perception: 'Quente,Morno' }) },
    { label: 'Fechado',     value: overview.fechado,     color: '#059669', bg: '#ECFDF5', icon: '🏆', nav: cardNav({ status: 'waiting_billing,sale_performed,fechado,closed,won,convertido' }) },
    { label: 'Perdido',     value: overview.perdido,     color: '#EF4444', bg: '#FEF2F2', icon: '❌', nav: cardNav({ status: 'sale_not_performed' }), onOpen: openLostModal },
  ]

  const distTotal  = overview.novo + overview.qualificado + overview.proposta + overview.negociacao + overview.fechado + overview.perdido
  const qualOL     = overview.qualificado + overview.proposta + overview.negociacao + overview.fechado
  const propOL     = overview.proposta + overview.negociacao + overview.fechado
  const negOL      = overview.negociacao + overview.fechado

  const convs = [
    { from: 'Pendente',    to: 'Agendado',    fromCount: distTotal, toCount: qualOL,          rate: distTotal > 0 ? +((qualOL / distTotal) * 100).toFixed(1) : 0, color: CONV_COLORS[0], Icon: Clock,       note: `${overview.novo} ainda pendentes · ${overview.perdido} perdidos sem converter`, nav: cardNav({ status: 'pending,novo,new' }) },
    { from: 'Agendado',    to: 'Enviada',     fromCount: qualOL,    toCount: propOL,          rate: qualOL > 0 ? +((propOL / qualOL) * 100).toFixed(1) : 0,       color: CONV_COLORS[1], Icon: CheckSquare, note: `${overview.qualificado} ainda agendados`,                                    nav: cardNav({ status: 'scheduled,qualificado,qualified' }) },
    { from: 'Enviada',     to: 'Qualificado', fromCount: propOL,    toCount: negOL,           rate: propOL > 0 ? +((negOL / propOL) * 100).toFixed(1) : 0,        color: CONV_COLORS[2], Icon: FileText,    note: `${overview.proposta} propostas enviadas`,                                    nav: cardNav({ status: 'proposal_sent' }) },
    { from: 'Qualificado', to: 'Fechado',     fromCount: negOL,     toCount: overview.fechado,rate: negOL > 0 ? +((overview.fechado / negOL) * 100).toFixed(1) : 0, color: CONV_COLORS[3], Icon: Handshake,  note: `${overview.negociacao} qualificados`,                                        nav: cardNav({ perception: 'Quente,Morno' }) },
    { from: 'Total',       to: 'Perdido',     fromCount: distTotal, toCount: overview.perdido, rate: distTotal > 0 ? +((overview.perdido / distTotal) * 100).toFixed(1) : 0, color: '#EF4444', Icon: XCircle, note: `${overview.perdido} leads perdidos no período`,                            nav: cardNav({ status: 'sale_not_performed' }) },
  ]

  const mainConvs  = convs.slice(0, 4)
  const lostConv   = convs[4]
  const totalRate  = distTotal > 0 ? +((overview.fechado / distTotal) * 100).toFixed(1) : 0
  const worstConv  = mainConvs.reduce((a, b) => a.rate <= b.rate ? a : b)
  const bestConv   = mainConvs.reduce((a, b) => a.rate >= b.rate ? a : b)

  const finCards = [
    { label: 'Valor Total',   value: [overview.novo_value, overview.qualificado_value, overview.proposta_value, overview.negociacao_value, overview.fechado_value, overview.perdido_value].reduce((a, b) => a + b, 0), color: 'var(--text-3)', bg: 'var(--bg-subtle)', border: 'var(--border)', nav: null },
    { label: 'Agendado',      value: overview.qualificado_value, color: '#10B981', bg: '#ECFDF5', border: '#A7F3D0', nav: cardNav({ status: 'scheduled,qualificado,qualified' }) },
    { label: 'Enviada',       value: overview.proposta_value,    color: '#F59E0B', bg: '#FFFBEB', border: '#FDE68A', nav: cardNav({ status: 'proposal_sent' }) },
    { label: 'Qualificado',   value: overview.negociacao_value,  color: '#8B5CF6', bg: '#F5F3FF', border: '#DDD6FE', nav: cardNav({ perception: 'Quente,Morno' }) },
    { label: 'Fechado',       value: overview.fechado_value,     color: '#059669', bg: '#ECFDF5', border: '#A7F3D0', nav: cardNav({ status: 'waiting_billing,sale_performed,fechado,closed,won,convertido' }) },
    { label: 'Perdido',       value: overview.perdido_value,     color: '#EF4444', bg: '#FEF2F2', border: '#FECACA', nav: cardNav({ status: 'sale_not_performed' }) },
  ]

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Filtros */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>De</span>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            style={{ fontSize: 13, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border-in)', color: 'var(--text-3)', background: 'var(--bg-input)', cursor: 'pointer' }} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>Até</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            style={{ fontSize: 13, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border-in)', color: 'var(--text-3)', background: 'var(--bg-input)', cursor: 'pointer' }} />
          <div style={{ position: 'relative' }}>
            <button onClick={() => setSourcesOpen(o => !o)}
              style={{ fontSize: 13, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border-in)', color: selectedSources.length > 0 ? 'var(--text-3)' : 'var(--text-subtle)', background: 'var(--bg-input)', cursor: 'pointer', minWidth: 160, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span>{selectedSources.length === 0 ? 'Todas as origens' : selectedSources.length === 1 ? selectedSources[0] : `${selectedSources.length} origens`}</span>
              <ChevronDown size={13} />
            </button>
            {sourcesOpen && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setSourcesOpen(false)} />
                <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, background: 'var(--bg-card, white)', border: '1px solid var(--border-in)', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 100, minWidth: 220, maxHeight: 280, overflowY: 'auto' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #F1F5F9' }}>
                    <input type="checkbox" checked={selectedSources.length === 0} onChange={() => setSelectedSources([])} readOnly />
                    <span style={{ color: 'var(--text-2)' }}>Todas as origens</span>
                  </label>
                  {sources.map(s => (
                    <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13 }}>
                      <input type="checkbox" checked={selectedSources.includes(s)}
                        onChange={() => setSelectedSources(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])} />
                      <span style={{ color: 'var(--text-2)' }}>{s}</span>
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Overview cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 16 }}>
          {overviewCards.map(card => (
            <div key={card.label}
              className="bg-white rounded-xl p-5 flex flex-col gap-2"
              style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.1)', transition: 'transform 200ms', cursor: 'pointer' }}
              onClick={() => (card as any).onOpen ? (card as any).onOpen() : navigate(`/leads-report${card.nav}`)}
              onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.05)')}
              onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: card.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{card.icon}</div>
              <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>{card.label}</span>
              <span style={{ fontSize: 36, fontWeight: 700, color: card.color, lineHeight: 1 }}>{card.value}</span>
            </div>
          ))}
        </div>

        {/* Distribuição + Conversões */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {/* Distribuição Financeira */}
          <div className="bg-white rounded-xl" style={{ padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 20 }}>
              Distribuição Financeira do Pipeline
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {finCards.map((fc, i) => (
                <div key={i}
                  onClick={() => fc.nav && navigate(`/leads-report${fc.nav}`)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderRadius: 10, background: fc.bg, border: `1px solid ${fc.border}`, cursor: fc.nav ? 'pointer' : 'default', transition: 'opacity 150ms' }}
                  onMouseEnter={e => { if (fc.nav) e.currentTarget.style.opacity = '0.85' }}
                  onMouseLeave={e => { if (fc.nav) e.currentTarget.style.opacity = '1' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: fc.color }}>{fc.label}</span>
                  <span style={{ fontSize: 18, fontWeight: 700, color: fc.color }}>{fmtBrl(fc.value)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Conversões */}
          <div className="bg-white rounded-xl" style={{ padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16 }}>
              Conversões do Funil
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1, background: 'var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
              {[
                { label: 'Conversão Total', value: `${totalRate}%`, sub: 'Pendente → Fechado', color: '#059669' },
                { label: 'Leads Perdidos',  value: `${lostConv.rate}%`, sub: `${overview.perdido} leads no período`, color: '#EF4444' },
                { label: 'Maior Gargalo',   value: `${worstConv.from} → ${worstConv.to}`, sub: `${worstConv.rate}% de conversão`, color: '#F59E0B', small: true },
              ].map(({ label, value, sub, color, small }) => (
                <div key={label} style={{ background: 'var(--bg-subtle)', padding: '14px 16px' }}>
                  <p style={{ fontSize: 11, color: 'var(--text-subtle)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>{label}</p>
                  <p style={{ fontSize: small ? 13 : 22, fontWeight: 700, color, lineHeight: 1.2, margin: 0 }}>{value}</p>
                  <p style={{ fontSize: 10, color: 'var(--text-subtle)', marginTop: 4 }}>{sub}</p>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {mainConvs.map((c, i) => (
                <div key={i}
                  onClick={() => navigate(`/leads-report${c.nav}`)}
                  style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '13px 8px', cursor: 'pointer', borderBottom: i < mainConvs.length - 1 ? '1px solid var(--border)' : 'none', borderRadius: 8, transition: 'background 150ms' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <div style={{ width: 56, textAlign: 'right', flexShrink: 0 }}>
                    <span style={{ fontSize: 20, fontWeight: 700, color: c.color }}>{c.rate}<span style={{ fontSize: 12, marginLeft: 1 }}>%</span></span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-3)' }}>{c.from} → {c.to}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-subtle)', display: 'block', marginTop: 2 }}>{c.fromCount} → {c.toCount} leads</span>
                  </div>
                </div>
              ))}
              <div onClick={() => navigate(`/leads-report${lostConv.nav}`)}
                style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '13px 8px', cursor: 'pointer', marginTop: 8, borderTop: '1px dashed var(--border)', borderRadius: 8, transition: 'background 150ms' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <div style={{ width: 56, textAlign: 'right', flexShrink: 0 }}>
                  <span style={{ fontSize: 20, fontWeight: 700, color: '#EF4444' }}>{lostConv.rate}<span style={{ fontSize: 12, marginLeft: 1 }}>%</span></span>
                </div>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-3)' }}>Total → Perdido</span>
                  <span style={{ fontSize: 11, color: 'var(--text-subtle)', display: 'block', marginTop: 2 }}>{overview.perdido} leads perdidos no período</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Alertas + Tempos */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
          <div className="bg-white rounded-xl" style={{ padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderLeft: '4px solid #EF4444', cursor: 'pointer', transition: 'transform 200ms' }}
            onClick={() => navigate('/leads-report' + cardNav({ vencidos: '1' }))}
            onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.02)')}
            onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 15 }}>⚠️</span>
              <h2 style={{ fontSize: 13, fontWeight: 700, color: '#EF4444', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Leads Vencidos</h2>
              <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: '#EF4444', background: '#FEF2F2', padding: '2px 8px', borderRadius: 99 }}>{alerts.vencidos_count ?? alerts.vencidos.length} leads</span>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-subtle)', marginBottom: 8 }}>Qualquer status sem atenção nas últimas 24h</p>
            <p style={{ fontSize: 12, color: '#3B82F6', fontWeight: 500 }}>Ver no Relatório →</p>
          </div>

          <div className="bg-white rounded-xl" style={{ padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderLeft: '4px solid #10B981' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 15 }}>⚡</span>
              <h2 style={{ fontSize: 13, fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Desempenho no Atendimento</h2>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-subtle)', marginBottom: 8 }}>Tempo médio em "Novo" antes de avançar no funil</p>
            <p style={{ fontSize: 36, fontWeight: 700, color: '#10B981', lineHeight: 1 }}>{alerts.avg_first_contact_minutes ?? 0}<span style={{ fontSize: 16, fontWeight: 500, marginLeft: 4 }}>min</span></p>
            <p style={{ fontSize: 12, color: 'var(--text-subtle)', marginTop: 6 }}>{alerts.contacted_count ?? 0} leads atendidos no período</p>
          </div>

          <div className="bg-white rounded-xl" style={{ padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderLeft: '4px solid #6366F1' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Timer size={15} color="#6366F1" />
              <h2 style={{ fontSize: 13, fontWeight: 700, color: '#4338CA', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Tempo Médio para o Fechamento</h2>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-subtle)', marginBottom: 8 }}>Média do ciclo completo (fechado + perdido)</p>
            <p style={{ fontSize: 36, fontWeight: 700, color: '#6366F1', lineHeight: 1 }}>{alerts.avg_time_in_funnel ?? 0}<span style={{ fontSize: 16, fontWeight: 500, marginLeft: 4 }}>dias</span></p>
            {(alerts.avg_time_in_funnel ?? 0) === 0 && <p style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 6 }}>Sem leads finalizados no período</p>}
          </div>
        </div>
      </div>

      {/* Lost modal */}
      {showLostModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setShowLostModal(false)}>
          <div style={{ background: 'var(--bg-card, white)', borderRadius: 16, width: '100%', maxWidth: 520, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-2)', margin: 0 }}>Motivos de Cancelamento</h2>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>{dateFrom} até {dateTo} · {overview.perdido} leads perdidos</p>
              </div>
              <button onClick={() => setShowLostModal(false)} style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--text-muted)', cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ padding: '16px 24px 24px' }}>
              {motivosLoading ? (
                <p style={{ textAlign: 'center', padding: '24px 0', fontSize: 13, color: 'var(--text-subtle)' }}>Carregando...</p>
              ) : motivos.length === 0 ? (
                <p style={{ textAlign: 'center', padding: '24px 0', fontSize: 13, color: 'var(--text-subtle)' }}>Nenhum motivo registrado no período.</p>
              ) : (
                <>
                  <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '14px 16px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#EF4444' }}>Total R$ perdido</span>
                    <span style={{ fontSize: 20, fontWeight: 700, color: '#EF4444' }}>{fmtBrl(motivos.reduce((s, m) => s + m.total_value, 0))}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {motivos.map((m, i) => (
                      <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', flex: 1 }}>{m.reason}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: '#EF4444', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 99, padding: '2px 10px' }}>{m.count} lead{m.count !== 1 ? 's' : ''}</span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-3)', minWidth: 90, textAlign: 'right' }}>{fmtBrl(m.total_value)}</span>
                          </div>
                        </div>
                        <div style={{ height: 5, background: 'var(--bg-subtle)', borderRadius: 99, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${m.pct}%`, background: '#EF4444', borderRadius: 99, opacity: 0.7 }} />
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>{m.pct}% dos cancelamentos</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                    <button onClick={() => { setShowLostModal(false); navigate(`/leads-report${cardNav({ status: 'sale_not_performed' })}`) }}
                      style={{ fontSize: 13, color: '#3B82F6', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                      Ver todos os leads perdidos no Relatório →
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Main component
// ════════════════════════════════════════════════════════════════════════════
export default function GestaoComercial() {
  const [activeTab, setActiveTab] = useState<Tab>('Visão Geral')
  const [month, setMonth]         = useState(nowMonth())

  const [kpis, setKpis]       = useState<Kpis | null>(null)
  const [diario, setDiario]   = useState<DiarioItem[]>([])
  const [origens, setOrigens] = useState<OrigemItem[]>([])
  const [mensal, setMensal]   = useState<MensalItem[]>([])
  const [loading, setLoading] = useState(false)

  const [expandedGrupo, setExpandedGrupo] = useState<string | null>(null)

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
    setDrillTipo(tipo); setDrillPath([]); setSelectedStage(null)
    setShowDrill(true); setDrillLoading(true); setDrillRows([])
    api.get<DrillRawRow[]>(`/api/v1/gestao-comercial/receita-potencial-drill?month=${month}&tipo=${tipo}`)
      .then(r => setDrillRows(normalizeDrill(r.data))).catch(() => {}).finally(() => setDrillLoading(false))
  }

  const filtered      = filterDrill(drillRows, drillPath)
  const totalFiltered = filtered.reduce((s, r) => s + r.total_value, 0)
  const stages        = sumByKey(filtered, r => r.status, r => r.total_value).sort((a, b) => stageOrder(a.key) - stageOrder(b.key))
  const maxStage      = stages[0]?.total ?? 1

  function openStage(status: string) {
    setSelectedStage(status); setContractsLoading(true)
    const origins = [...new Set(filtered.map(r => r.origem))]
    const params  = new URLSearchParams({ month, status, tipo: drillTipo })
    if (origins.length > 0) params.set('origens', origins.join(','))
    api.get<ContractItem[]>(`/api/v1/gestao-comercial/receita-contratos?${params}`)
      .then(r => setContracts(r.data)).catch(() => setContracts([]))
      .finally(() => setContractsLoading(false))
  }

  useEffect(() => { setDrillRows([]); setSelectedStage(null) }, [month])
  useEffect(() => { setSelectedStage(null) }, [drillPath])

  const navItems: { key: string; label: string; total: number; color: string }[] = (() => {
    if (drillPath.length === 0)
      return ['SDR', 'Orgânico'].map(g => ({ key: g, label: g, total: drillRows.filter(r => r.grupo === g).reduce((s, r) => s + r.total_value, 0), color: GROUP_COLORS[g] })).filter(i => i.total > 0)
    if (drillPath.length === 1)
      return sumByKey(filterDrill(drillRows, drillPath), r => r.operador, r => r.total_value).map(({ key, total }) => ({ key, label: key, total, color: GROUP_COLORS[drillPath[0]] ?? '#8B5CF6' }))
    return []
  })()
  const maxNav      = navItems[0]?.total ?? 1
  const breadcrumb  = ['Total', ...drillPath, ...(selectedStage ? [stageLabel(selectedStage)] : [])]
  const grupos      = groupOrigens(origens)
  const maxCap      = grupos.reduce((m, g) => Math.max(m, g.captacoes), 1)

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Gestão Comercial</h1>
        <p style={{ fontSize: 13, color: 'var(--text-subtle)', marginTop: 4 }}>Acompanhe resultados, pipeline e performance da equipe</p>
      </div>

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
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
            <input type="month" value={month} onChange={e => setMonth(e.target.value)} style={{
              padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)',
              fontSize: 13, color: 'var(--text-1)', background: 'var(--bg-card)', cursor: 'pointer',
            }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 28 }}>
            {CARD_CFG.map(({ key, label, icon: Icon, color, bg, sub, fmt, clickable }) => {
              const value = kpis ? (kpis as Record<string, number>)[key] : 0
              return (
                <div key={key}
                  onClick={clickable ? () => openDrill(KEY_TO_TIPO[key]) : undefined}
                  style={{ background: bg, borderRadius: 14, padding: '20px 22px', boxShadow: '0 1px 3px rgba(0,0,0,0.07)', borderLeft: `4px solid ${color}`, cursor: clickable ? 'pointer' : 'default', transition: clickable ? 'transform 120ms, box-shadow 120ms' : undefined }}
                  onMouseEnter={e => { if (clickable) { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = `0 4px 16px ${color}33` } }}
                  onMouseLeave={e => { if (clickable) { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 3px rgba(0,0,0,0.07)' } }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: sub, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
                    <div style={{ width: 34, height: 34, borderRadius: 9, background: color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon size={16} color={color} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                    <p style={{ fontSize: 26, fontWeight: 800, color, margin: 0, lineHeight: 1 }}>{loading ? '—' : fmt(value)}</p>
                    {clickable && <span style={{ fontSize: 11, color, fontWeight: 600, marginBottom: 2 }}>Ver detalhes →</span>}
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
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

            <div className="bg-white rounded-xl" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)', padding: '20px 20px 16px' }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', margin: '0 0 4px' }}>Origens de Captação</p>
              <p style={{ fontSize: 11, color: 'var(--text-subtle)', margin: '0 0 20px' }}>Clique no canal para ver o detalhamento</p>
              {grupos.map(g => {
                const open   = expandedGrupo === g.nome
                const barW   = maxCap > 0 ? Math.max((g.captacoes / maxCap) * 100, 2) : 0
                const subMax = g.subs.reduce((m, s) => Math.max(m, s.captacoes), 1)
                return (
                  <div key={g.nome} style={{ marginBottom: 10 }}>
                    <button onClick={() => setExpandedGrupo(open ? null : g.nome)} style={{ width: '100%', background: open ? g.color + '10' : 'transparent', border: `1px solid ${open ? g.color + '40' : 'var(--border)'}`, borderRadius: 10, padding: '10px 14px', cursor: 'pointer', transition: 'all 150ms' }}>
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

      {/* ── PIPELINE ── */}
      {activeTab === 'Pipeline' && <PipelineTab />}

      {activeTab === 'Performance' && <div />}

      {/* ── DRILL MODAL ── */}
      {showDrill && (
        <div onClick={() => setShowDrill(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-card, #fff)', borderRadius: 18, width: '100%', maxWidth: 620, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ padding: '20px 24px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>{DRILL_CFG[drillTipo].title}</p>
                <p style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 2 }}>{DRILL_CFG[drillTipo].desc}</p>
              </div>
              <button onClick={() => setShowDrill(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-subtle)', padding: 4 }}><X size={18} /></button>
            </div>
            <div style={{ padding: '12px 24px 0', display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
              {breadcrumb.map((label, i) => {
                const isLast = i === breadcrumb.length - 1
                return (
                  <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {i > 0 && <ChevronRight size={12} color="#94A3B8" />}
                    <button onClick={() => { if (!isLast) { if (selectedStage && i === breadcrumb.length - 2) { setSelectedStage(null) } else { setDrillPath(drillPath.slice(0, i)) } } }}
                      style={{ background: 'none', border: 'none', cursor: isLast ? 'default' : 'pointer', fontSize: 12, fontWeight: isLast ? 700 : 400, color: isLast ? '#2563EB' : 'var(--text-subtle)', padding: 0 }}>
                      {label}
                    </button>
                  </span>
                )
              })}
            </div>
            {drillLoading ? (
              <p style={{ padding: '40px 24px', textAlign: 'center', fontSize: 13, color: 'var(--text-subtle)' }}>Carregando...</p>
            ) : (
              <div style={{ padding: '16px 24px 24px' }}>
                <div style={{ marginBottom: 20, padding: '14px 18px', background: '#F0FDF4', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, color: '#065F46', fontWeight: 600 }}>{drillPath.length === 0 ? 'Total geral' : drillPath.join(' › ')}</span>
                  <span style={{ fontSize: 22, fontWeight: 800, color: DRILL_CFG[drillTipo].totalColor }}>{fmtBrl(totalFiltered)}</span>
                </div>
                {navItems.length > 0 && (
                  <div style={{ marginBottom: 24 }}>
                    <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px' }}>
                      {drillPath.length === 0 ? 'Por canal' : 'Por operador'}
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {navItems.map(item => {
                        const w   = maxNav > 0 ? Math.max((item.total / maxNav) * 100, 2) : 0
                        const pct = totalFiltered > 0 ? Math.round(item.total / totalFiltered * 100) : 0
                        return (
                          <button key={item.key} onClick={() => setDrillPath([...drillPath, item.key])}
                            style={{ width: '100%', textAlign: 'left', background: '#F8FAFC', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', cursor: 'pointer', transition: 'all 120ms' }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = item.color + '10'; (e.currentTarget as HTMLElement).style.borderColor = item.color + '50' }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#F8FAFC'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}>
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
                {selectedStage ? (
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px' }}>Contratos — {stageLabel(selectedStage)}</p>
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
                              <p style={{ fontSize: 11, color: 'var(--text-subtle)', margin: '2px 0 0' }}>{c.origem}{drillTipo === 'perda' && c.motivo ? ` · ${c.motivo}` : ''}</p>
                            </div>
                            <span style={{ fontSize: 14, fontWeight: 700, color: DRILL_CFG[drillTipo].totalColor, flexShrink: 0, marginLeft: 12 }}>{fmtBrl(c.valor)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
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
                            <button key={key} onClick={() => openStage(key)}
                              style={{ width: '100%', textAlign: 'left', padding: '10px 14px', background: '#F8FAFC', borderRadius: 10, border: '1px solid var(--border)', cursor: 'pointer', transition: 'all 120ms' }}
                              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = col + '10'; (e.currentTarget as HTMLElement).style.borderColor = col + '50' }}
                              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '#F8FAFC'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>{stageLabel(key)}</span>
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
                {(drillPath.length > 0 || selectedStage) && (
                  <button onClick={() => { if (selectedStage) setSelectedStage(null); else setDrillPath(p => p.slice(0, -1)) }}
                    style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 12, color: 'var(--text-subtle)' }}>
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
