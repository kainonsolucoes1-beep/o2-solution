import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  LineChart, Line, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import {
  Users, ShoppingCart, TrendingUp, DollarSign, TrendingDown, Tag,
  ChevronDown, ChevronRight, X, ChevronLeft,
  Clock, CheckSquare, FileText, Handshake, Timer, XCircle, Filter, ArrowLeftRight,
  Briefcase, ArrowUpRight,
} from 'lucide-react'
import api from '../api'
import { statusLabel } from '../utils/statusLabel'
import { parseUTC } from '../utils/date'

const TABS = ['Visão Geral', 'Pipeline', 'Performance', 'Projeção'] as const
type Tab = typeof TABS[number]

// ── Visão Geral types ────────────────────────────────────────────────────────
interface Kpis {
  captacoes: number; vendas: number; conversao: number
  receita_potencial: number; perda_financeira: number; ticket_medio: number
}
interface DiarioItem  { dia: number; captacoes: number; vendas: number }
interface OrigemItem  { origem: string; captacoes: number; pct: number }
interface ModalidadeItem { modalidade: string; captacoes: number; vendas: number; conversao: number; pct: number }
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
interface AgendaItem { id: string; name: string; status: string | null; scheduled_at: string }
interface PipelineAlerts {
  vencidos: AlertLead[]; uncontacted: AlertLead[]
  vencidos_count?: number; uncontacted_count?: number
  avg_time_in_funnel?: number; avg_first_contact_minutes?: number; contacted_count?: number
  pf_count?: number; pme_count?: number
}
interface MotivoItem { reason: string; count: number; pct: number; total_value: number }

// ── Grouping constants ───────────────────────────────────────────────────────
const O2_NAMES       = new Set(['clara', 'maria eduarda', 'kauany', 'gabrieli', 'o2 solution', 'o2solution'])
const ORGANICO_EXTRA = new Set(['site', 'chatgpt.com', 'chatgpt', 'google', 'instagram', 'facebook', 'whatsapp'])
const isOrganico     = (o: string) => o.toLowerCase().includes('org') || ORGANICO_EXTRA.has(o.toLowerCase())
const TEAM_OPTIONS   = [
  { label: 'São Paulo', value: 'Equipe São Paulo' },
  { label: 'Recife',    value: 'Equipe Pernambuco' },
]

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
function pctDiff(cur: number, prev: number): number | null {
  if (prev === 0) return cur > 0 ? 100 : null
  return Math.round((cur - prev) / prev * 100)
}
function TrendBadge({ value, invert }: { value: number; invert?: boolean }) {
  const up = value >= 0
  const good = invert ? !up : up
  const color = good ? '#10B981' : '#EF4444'
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 10, fontWeight: 700, color, whiteSpace: 'nowrap' }}>
      {up ? '▲' : '▼'}{Math.abs(value)}%
    </span>
  )
}
const _gcNow        = new Date()
const _gcToday      = `${_gcNow.getFullYear()}-${String(_gcNow.getMonth() + 1).padStart(2, '0')}-${String(_gcNow.getDate()).padStart(2, '0')}`
const _gcMonthStart = `${_gcNow.getFullYear()}-${String(_gcNow.getMonth() + 1).padStart(2, '0')}-01`

// ── Card config ──────────────────────────────────────────────────────────────
const CARD_CFG = [
  { key: 'captacoes',        label: 'Captações',        icon: Users,        color: '#3B82F6', bg: '#EFF6FF', sub: '#1E40AF', fmt: (v: number) => String(v), clickable: false },
  { key: 'vendas',           label: 'Vendas',           icon: ShoppingCart, color: '#10B981', bg: '#ECFDF5', sub: '#065F46', fmt: (v: number) => String(v), clickable: true  },
  { key: 'conversao',        label: 'Conversão',        icon: TrendingUp,   color: '#7C3AED', bg: '#F5F3FF', sub: '#4C1D95', fmt: (v: number) => `${v}%`,   clickable: false },
  { key: 'receita_potencial',label: 'Receita Potencial',icon: DollarSign,   color: '#059669', bg: '#ECFDF5', sub: '#065F46', fmt: fmtBrl,                   clickable: true  },
  { key: 'perda_financeira', label: 'Perda Financeira', icon: TrendingDown, color: '#EF4444', bg: '#FEF2F2', sub: '#991B1B', fmt: fmtBrl,                   clickable: true  },
  { key: 'ticket_medio',     label: 'Ticket Médio',     icon: Tag,          color: '#F59E0B', bg: '#FFFBEB', sub: '#92400E', fmt: fmtBrl,                   clickable: false },
] as const

const MAIN_CARD_CFG = [
  { key: 'captacoes',        label: 'Captações',        icon: Users,        color: '#3B82F6', bg: '#EFF6FF', sub: '#1E40AF', fmt: (v: number) => String(v), clickable: false, invert: false },
  { key: 'vendas',           label: 'Vendas',           icon: ShoppingCart, color: '#10B981', bg: '#ECFDF5', sub: '#065F46', fmt: (v: number) => String(v), clickable: true,  invert: false },
  { key: 'qualificados',     label: 'Qualificados',     icon: CheckSquare,  color: '#8B5CF6', bg: '#F5F3FF', sub: '#4C1D95', fmt: (v: number) => String(v), clickable: true,  invert: false },
  { key: 'receita_potencial',label: 'Receita Potencial',icon: DollarSign,   color: '#059669', bg: '#ECFDF5', sub: '#065F46', fmt: fmtBrl,                   clickable: true,  invert: false },
  { key: 'perda_financeira', label: 'Perda Financeira', icon: TrendingDown, color: '#EF4444', bg: '#FEF2F2', sub: '#991B1B', fmt: fmtBrl,                   clickable: true,  invert: true  },
  { key: 'ticket_medio',     label: 'Ticket Médio',     icon: Tag,          color: '#F59E0B', bg: '#FFFBEB', sub: '#92400E', fmt: fmtBrl,                   clickable: false, invert: false },
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
function PipelineTab({ dateFrom, dateTo, selectedSources, teamParam }: { dateFrom: string; dateTo: string; selectedSources: string[]; teamParam: string }) {
  const navigate = useNavigate()

  const [overview, setOverview]               = useState<PipelineOverview | null>(null)
  const [alerts, setAlerts]                   = useState<PipelineAlerts | null>(null)
  const [loading, setLoading]                 = useState(true)
  const [error, setError]                     = useState('')
  const [showLostModal, setShowLostModal]     = useState(false)
  const [motivos, setMotivos]                 = useState<MotivoItem[]>([])
  const [motivosLoading, setMotivosLoading]   = useState(false)
  const [role, setRole]                       = useState<string | null>(null)
  const [agendaHoje, setAgendaHoje]           = useState<AgendaItem[]>([])
  const isUsuario = role === 'usuario'

  useEffect(() => {
    api.get<{ role: string }>('/api/v1/auth/me').then(r => setRole(r.data.role)).catch(() => {})
  }, [])

  useEffect(() => {
    if (role !== 'usuario') return
    const todayStr = new Date().toISOString().slice(0, 10)
    api.get<{ items: AgendaItem[] }>(`/api/v1/agenda?date_from=${todayStr}&date_to=${todayStr}`)
      .then(r => setAgendaHoje(r.data.items))
      .catch(() => setAgendaHoje([]))
  }, [role])

  const fetchAll = useCallback(() => {
    const qs = new URLSearchParams({ date_from: dateFrom, date_to: dateTo })
    if (selectedSources.length > 0) qs.set('source', selectedSources.join(','))
    if (teamParam) qs.set('team', teamParam)
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
  }, [navigate, dateFrom, dateTo, selectedSources, teamParam])

  useEffect(() => { fetchAll() }, [fetchAll])

  function openLostModal() {
    setShowLostModal(true); setMotivosLoading(true)
    const params: Record<string, string> = { date_from: dateFrom, date_to: dateTo }
    if (selectedSources.length > 0) params.origin = selectedSources.join(',')
    if (teamParam) params.team = teamParam
    api.get<MotivoItem[]>('/api/v1/kpis/motivos-cancelamento', { params })
      .then(r => setMotivos(r.data)).catch(() => setMotivos([]))
      .finally(() => setMotivosLoading(false))
  }

  const cardNav = (params: Record<string, string>) => {
    const p = new URLSearchParams({ date_from: dateFrom, date_to: dateTo, ...params })
    if (selectedSources.length > 0) p.set('origem', selectedSources.join(','))
    if (teamParam) p.set('team', teamParam)
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
        {!isUsuario && (
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
        )}

        {/* Meus Agendamentos de Hoje + Leads Vencidos — visão simplificada pra quem atende */}
        {isUsuario && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div className="bg-white rounded-xl" style={{ padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
              📅 Meus Agendamentos de Hoje
            </h2>
            <p style={{ fontSize: 11, color: 'var(--text-subtle)', marginBottom: 16 }}>Clique num lead pra abrir a ficha</p>
            {agendaHoje.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-subtle)', textAlign: 'center', padding: '20px 0' }}>Nenhum agendamento pra hoje.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {agendaHoje.map(item => (
                  <div key={item.id}
                    onClick={() => navigate(`/leads/${item.id}`)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px', borderRadius: 10, cursor: 'pointer', transition: 'background 150ms' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#2563EB', background: '#EFF6FF', borderRadius: 8, padding: '4px 0', width: 50, textAlign: 'center', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                      {new Date(parseUTC(item.scheduled_at)).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-2)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                    <span style={{ fontSize: 11.5, color: 'var(--text-subtle)', flexShrink: 0 }}>{statusLabel(item.status)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl" style={{ padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <h2 style={{ fontSize: 13, fontWeight: 600, color: '#EF4444', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
              ⚠️ Leads Vencidos
            </h2>
            <p style={{ fontSize: 11, color: 'var(--text-subtle)', marginBottom: 16 }}>Sem atenção nas últimas 24h · {alerts.vencidos_count ?? alerts.vencidos.length} leads</p>
            {alerts.vencidos.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-subtle)', textAlign: 'center', padding: '20px 0' }}>Nenhum lead vencido 🎉</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {alerts.vencidos.map(lead => (
                  <div key={lead.id}
                    onClick={() => navigate(`/leads/${lead.id}`)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px', borderRadius: 10, cursor: 'pointer', transition: 'background 150ms' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#DC2626', background: '#FEF2F2', borderRadius: 8, padding: '4px 0', width: 50, textAlign: 'center', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                      {lead.hours_without_action ?? 0}h
                    </span>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-2)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.name}</span>
                    <span style={{ fontSize: 11.5, color: 'var(--text-subtle)', flexShrink: 0 }}>{statusLabel(lead.status)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        )}

        {/* Alertas + Tempos */}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${isUsuario ? 3 : 4}, 1fr)`, gap: 20 }}>
          {!isUsuario && (
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
          )}

          <div className="bg-white rounded-xl" style={{ padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderLeft: '4px solid #10B981' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 15 }}>⚡</span>
              <h2 style={{ fontSize: 13, fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Desempenho no Atendimento</h2>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-subtle)', marginBottom: 8 }}>Tempo médio em "Novo" antes de avançar no funil</p>
            {(() => {
              const minutes = alerts.avg_first_contact_minutes ?? 0
              return minutes >= 60 ? (
                <p style={{ fontSize: 36, fontWeight: 700, color: '#10B981', lineHeight: 1 }}>{(minutes / 60).toFixed(1)}<span style={{ fontSize: 16, fontWeight: 500, marginLeft: 4 }}>h</span></p>
              ) : (
                <p style={{ fontSize: 36, fontWeight: 700, color: '#10B981', lineHeight: 1 }}>{minutes}<span style={{ fontSize: 16, fontWeight: 500, marginLeft: 4 }}>min</span></p>
              )
            })()}
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

          {(() => {
            const pf = alerts.pf_count ?? 0
            const pme = alerts.pme_count ?? 0
            const total = pf + pme
            const lider = pme >= pf ? 'PME' : 'PF'
            const liderCount = pme >= pf ? pme : pf
            const pct = total > 0 ? Math.round(liderCount / total * 100) : 0
            return (
              <div className="bg-white rounded-xl" style={{ padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderLeft: '4px solid #F59E0B', display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Briefcase size={15} color="#F59E0B" />
                  <h2 style={{ fontSize: 13, fontWeight: 700, color: '#B45309', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Captação do Período</h2>
                </div>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                  {total > 0 ? (
                    <p style={{ fontSize: 36, fontWeight: 700, color: '#F59E0B', lineHeight: 1, margin: 0 }}>{lider}<span style={{ fontSize: 16, fontWeight: 500, marginLeft: 4 }}>{pct}%</span></p>
                  ) : (
                    <p style={{ fontSize: 13, color: 'var(--text-subtle)', margin: 0 }}>Sem captações de PF/PME no período</p>
                  )}
                </div>
              </div>
            )
          })()}
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
// Performance sub-tab component
// ════════════════════════════════════════════════════════════════════════════
interface OperadorPerf {
  operador: string
  tipo: 'operador' | 'canal'
  captacoes: number
  cancelados: number
  vendas: number
  receita: number
  conversao: number
  cancel_rate: number
  ticket_medio: number
}
interface PerformanceHistorico { operadores: OperadorPerf[]; trend: MensalItem[]; trend_por_operador: Record<string, MensalItem[]> }

const convColor = (pct: number) => pct >= 30 ? '#059669' : pct >= 15 ? '#F59E0B' : '#3B82F6'
function prevMonthStr(month: string) {
  const [y, m] = month.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}

const O2_PERF_NAMES = new Set(['clara', 'maria eduarda', 'kauany', 'gabrieli', 'o2 solution', 'o2solution'])
function mergeO2Operadores(rows: OperadorPerf[]): OperadorPerf[] {
  const map = new Map<string, OperadorPerf>()
  for (const r of rows) {
    const key = O2_PERF_NAMES.has(r.operador.toLowerCase()) ? 'o2 Solution' : r.operador
    const acc = map.get(key)
    if (acc) {
      acc.captacoes  += r.captacoes
      acc.cancelados += r.cancelados
      acc.vendas     += r.vendas
      acc.receita    += r.receita
    } else {
      map.set(key, { ...r, operador: key })
    }
  }
  return [...map.values()].map(r => ({
    ...r,
    conversao: r.captacoes > 0 ? +(r.vendas / r.captacoes * 100).toFixed(1) : 0,
    cancel_rate: r.captacoes > 0 ? +(r.cancelados / r.captacoes * 100).toFixed(1) : 0,
    ticket_medio: r.vendas > 0 ? r.receita / r.vendas : 0,
  }))
}

const ExpandToggle = ({ expanded, hidden, onClick }: { expanded: boolean; hidden: number; onClick: () => void }) => (
  <button
    onClick={onClick}
    aria-expanded={expanded}
    style={{ display: 'flex', alignItems: 'center', gap: 4, minHeight: 36, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', padding: '0 4px', transition: 'color 150ms' }}
    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-2)' }}
    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)' }}
  >
    <ChevronDown size={14} style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }} />
    {expanded ? 'Ver menos' : `Ver mais (${hidden})`}
  </button>
)

function ProjecaoTab() {
  return (
    <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-muted)' }}>
      <p style={{ fontSize: 14 }}>Aba em construção.</p>
    </div>
  )
}

interface PerfLead { nome: string; origem?: string; status: string; valor: number | null; tipo: string }

function DestaqueCard({ accent, label, value, sub, context, onClick }: { accent: string; label: string; value: string; sub: string; context: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } : undefined}
      style={{
        background: 'var(--bg-card)', borderRadius: 9, padding: '16px 18px', minHeight: 140,
        border: '1px solid #DFE4E9', borderLeft: `2px solid ${accent}`,
        cursor: onClick ? 'pointer' : 'default',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        transition: 'background 150ms',
      }}
      onMouseEnter={onClick ? e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)' } : undefined}
      onMouseLeave={onClick ? e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-card)' } : undefined}
    >
      <div style={{ height: 48 }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', margin: '0 0 6px' }}>{label}</p>
        <p style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-1)', margin: 0, lineHeight: 1.1 }}>{value}</p>
      </div>
      <div style={{ minHeight: 34, marginTop: 8, paddingTop: 9, borderTop: '1px solid #EEF2F6' }}>
        <p title={sub} style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', margin: '0 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</p>
        <p style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-2)', margin: 0 }}>{context}</p>
      </div>
    </div>
  )
}

function PerformanceTab({ dateFrom, dateTo, teamParam }: { dateFrom: string; dateTo: string; teamParam: string }) {
  const navigate = useNavigate()
  const [lifetimeData, setLifetimeData] = useState<OperadorPerf[]>([])
  const [trend, setTrend]           = useState<MensalItem[]>([])
  const [loadingLifetime, setLoadingLifetime] = useState(true)
  const [sortBy, setSortBy]         = useState<'receita' | 'captacoes' | 'vendas' | 'cancelados'>('receita')
  const [expRanking, setExpRanking] = useState(false)
  const [expLeaderboard, setExpLeaderboard] = useState(false)
  const [insightsExpanded, setInsightsExpanded] = useState(true)
  const [tipoFilter, setTipoFilter]     = useState<'todos' | 'operador' | 'canal'>('todos')
  const [quickFilter, setQuickFilter]   = useState<'todos' | 'vendas' | 'atencao'>('todos')
  const [perfPopup, setPerfPopup]           = useState<string | null>(null)
  const [perfLeads, setPerfLeads]           = useState<PerfLead[]>([])
  const [perfLoading, setPerfLoading]       = useState(false)
  const [perfStatusFilter, setPerfStatusFilter] = useState<string | null>(null)
  const [perfTrend, setPerfTrend]           = useState<MensalItem[] | null>(null)
  const [perfPopupOrigens, setPerfPopupOrigens] = useState<string | undefined>(undefined)
  const [perfPopupStatusGroup, setPerfPopupStatusGroup] = useState<string | undefined>(undefined)

  const data    = lifetimeData
  const loading = loadingLifetime

  function openPerfModal(title: string, origens?: string, statusGroup?: string, withTrend?: boolean) {
    setPerfPopup(title); setPerfLeads([]); setPerfLoading(true); setPerfStatusFilter(null); setPerfTrend(null)
    setPerfPopupOrigens(origens); setPerfPopupStatusGroup(statusGroup)
    const p = new URLSearchParams({ date_from: dateFrom, date_to: dateTo })
    if (origens) p.set('origens', origens)
    if (statusGroup) p.set('status_group', statusGroup)
    if (teamParam) p.set('team', teamParam)
    api.get<PerfLead[]>(`/api/v1/kpis/leads-conv-point?${p}`)
      .then(r => setPerfLeads(r.data)).catch(() => setPerfLeads([]))
      .finally(() => setPerfLoading(false))
    if (withTrend && origens) {
      const pt = new URLSearchParams({ origens, date_from: dateFrom, date_to: dateTo })
      if (teamParam) pt.set('team', teamParam)
      api.get<PerformanceHistorico>(`/api/v1/gestao-comercial/performance-historico?${pt}`)
        .then(r => setPerfTrend(r.data.trend)).catch(() => setPerfTrend([]))
    }
  }

  function goToLeadsReportFromPopup() {
    const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo })
    if (perfPopupOrigens) params.set('origem', perfPopupOrigens)
    if (perfPopupStatusGroup === 'venda') params.set('status', 'waiting_billing,sale_performed,fechado,closed,won,convertido')
    if (teamParam) params.set('team', teamParam)
    navigate(`/leads-report?${params}`)
  }

  useEffect(() => {
    if (!perfPopup) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setPerfPopup(null) }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [perfPopup])

  // histórico do período selecionado (filtro global de datas + equipe) + tendência mensal
  useEffect(() => {
    setLoadingLifetime(true)
    const p = new URLSearchParams({ date_from: dateFrom, date_to: dateTo })
    if (teamParam) p.set('team', teamParam)
    api.get<PerformanceHistorico>(`/api/v1/gestao-comercial/performance-historico?${p}`)
      .then(r => {
        setLifetimeData(mergeO2Operadores(r.data.operadores))
        setTrend(r.data.trend)
      })
      .catch(() => { setLifetimeData([]); setTrend([]) })
      .finally(() => setLoadingLifetime(false))
  }, [dateFrom, dateTo, teamParam])

  // ── derivados ──────────────────────────────────────────────────────────
  const totalCap      = data.reduce((s, r) => s + r.captacoes, 0)
  const totalVendas   = data.reduce((s, r) => s + r.vendas, 0)
  const totalRec      = data.reduce((s, r) => s + r.receita, 0)
  const avgConv       = totalCap > 0 ? +(totalVendas / totalCap * 100).toFixed(1) : 0
  const avgTicket     = totalVendas > 0 ? totalRec / totalVendas : 0
  const melhorMesReceita = trend.length > 1 ? [...trend].sort((a, b) => b.receita - a.receita)[0] : null
  const melhorMesVendas  = trend.length > 1 ? [...trend].sort((a, b) => b.vendas - a.vendas)[0] : null

  const qualified  = data.filter(r => r.captacoes >= 3)
  const byReceita  = [...data].sort((a, b) => b.receita - a.receita)
  const byConv     = [...qualified].sort((a, b) => b.conversao - a.conversao)
  const topConv    = byConv.filter(r => r.vendas > 0)[0] ?? null
  const byVendas   = [...data].sort((a, b) => b.vendas - a.vendas)
  const atencao    = [...qualified].sort((a, b) => a.conversao - b.conversao)[0] ?? null
  const sorted     = useMemo(() => [...data].sort((a, b) => b[sortBy] - a[sortBy]), [data, sortBy])

  const filteredSorted = useMemo(() => {
    let rows = sorted
    if (tipoFilter !== 'todos') rows = rows.filter(r => r.tipo === tipoFilter)
    if (quickFilter === 'vendas') rows = rows.filter(r => r.vendas > 0)
    if (quickFilter === 'atencao') rows = rows.filter(r => r.captacoes >= 3 && r.conversao < avgConv)
    return rows
  }, [sorted, tipoFilter, quickFilter, avgConv])

  // ── insights ──────────────────────────────────────────────────────────
  const insights = useMemo(() => {
    if (!data.length) return []
    const list: { type: 'ok' | 'warn'; text: string }[] = []
    // top vendedor — só quando há primeiro lugar isolado (sem empate)
    if (byVendas[0] && totalVendas > 0 && byVendas[0].vendas > (byVendas[1]?.vendas ?? 0)) {
      const pct = Math.round(byVendas[0].vendas / totalVendas * 100)
      list.push({ type: 'ok', text: `${byVendas[0].operador} fechou ${pct}% das vendas da equipe no período.` })
    }
    // melhor conversão (somente quem tem ≥1 venda, primeiro lugar isolado)
    const byConvVendas = [...data].filter(r => r.vendas > 0).sort((a, b) => b.conversao - a.conversao)
    if (byConvVendas[0] && byConvVendas[0].conversao > (byConvVendas[1]?.conversao ?? 0)) {
      list.push({ type: 'ok', text: `${byConvVendas[0].operador} lidera a conversão com ${byConvVendas[0].conversao}%, acima da média da equipe (${avgConv}%).` })
    }
    if (atencao && avgConv > 0 && atencao.conversao < avgConv * 0.85)
      list.push({ type: 'warn', text: `${atencao.operador} tem conversão de ${atencao.conversao}%, abaixo da média da equipe (${avgConv}%).` })
    const hclt = [...byConv].find(r => r.vendas > 0 && r.conversao > avgConv && (r.receita / r.vendas) < avgTicket * 0.75)
    if (hclt)
      list.push({ type: 'warn', text: `${hclt.operador} tem boa conversão (${hclt.conversao}%), mas ticket médio abaixo da equipe (${fmtBrl(Math.round(hclt.receita / hclt.vendas))}).` })
    if (melhorMesReceita && melhorMesReceita.receita > 0) {
      const mesmoMesVendas = melhorMesVendas?.mes === melhorMesReceita.mes
      list.push({ type: 'ok', text: mesmoMesVendas
        ? `${melhorMesReceita.mes_label} foi o melhor mês do período, com ${fmtBrl(melhorMesReceita.receita)} em receita e ${melhorMesReceita.vendas} vendas.`
        : `${melhorMesReceita.mes_label} foi o melhor mês em receita (${fmtBrl(melhorMesReceita.receita)}); ${melhorMesVendas?.mes_label} teve o maior número de vendas (${melhorMesVendas?.vendas}).` })
    }
    return list
  }, [data, byVendas, atencao, avgConv, avgTicket, byConv, totalVendas, melhorMesReceita, melhorMesVendas])

  const secLabel = (txt: string, compact?: boolean) => (
    <p style={{ fontSize: compact ? 14 : 15, fontWeight: compact ? 650 : 600, color: 'var(--text-1)', margin: '0 0 16px' }}>{txt}</p>
  )

  if (loading) return <p style={{ padding: '48px 0', textAlign: 'center', fontSize: 13, color: 'var(--text-subtle)' }}>Carregando...</p>
  if (!data.length) return <p style={{ padding: '48px 0', textAlign: 'center', fontSize: 13, color: 'var(--text-subtle)' }}>Nenhum dado para o período.</p>

  const numOportunidades = insights.filter(i => i.type === 'ok').length
  const numAtencao       = insights.filter(i => i.type === 'warn').length

  return (
    <>
    <div style={{ display: 'flex', flexDirection: 'column' }}>

      {/* ── Resumo do período (faixa única, com detalhe expansível) ── */}
      {(insights.length > 0 || totalCap > 0) && (() => {
        const indicadores = [
          numOportunidades > 0 ? { value: numOportunidades, label: `oportunidade${numOportunidades !== 1 ? 's' : ''}` } : null,
          numAtencao > 0 ? { value: numAtencao, label: `ponto${numAtencao !== 1 ? 's' : ''} de atenção` } : null,
          totalCap > 0 ? { value: `${avgConv}%`, label: 'conversão média' } : null,
        ].filter((v): v is NonNullable<typeof v> => v !== null)

        return (
          <div style={{ background: 'var(--bg-card)', border: '1px solid #DFE4E9', borderRadius: 9, padding: '12px 16px' }}>
            <div className="grid grid-cols-1 md:grid-cols-[auto_1fr_auto] items-center" style={{ gap: 22 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#2563EB', flexShrink: 0 }} />
                <div>
                  <p style={{ fontSize: 13, fontWeight: 650, color: 'var(--text-1)', margin: 0 }}>Resumo do período</p>
                  <p style={{ fontSize: 10, color: 'var(--text-subtle)', margin: '3px 0 0' }}>Leitura automática dos principais movimentos</p>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', gap: 22, flexWrap: 'wrap' }}>
                {indicadores.map((ind, i) => (
                  <span key={i} style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    <b style={{ color: 'var(--text-1)' }}>{ind.value}</b> {ind.label}
                  </span>
                ))}
              </div>

              {insights.length > 0 && (
                <button
                  onClick={() => setInsightsExpanded(v => !v)}
                  aria-expanded={insightsExpanded}
                  style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 600, color: '#2563EB', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0, minHeight: 32, padding: '0 4px', justifySelf: 'end' }}
                >
                  {insightsExpanded ? 'Recolher' : 'Ver análise completa'}
                  <ChevronDown size={12} style={{ transform: insightsExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }} />
                </button>
              )}
            </div>

            {insightsExpanded && insights.length > 0 && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #E8EDF3', display: 'flex', flexDirection: 'column', gap: 9 }}>
                {insights.map((ins, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, lineHeight: 1.45, color: '#475569', maxWidth: 640 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: ins.type === 'ok' ? '#10B981' : '#F59E0B', flexShrink: 0, marginTop: 6 }} />
                    <span>{ins.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })()}

      {/* ── Evolução Geral + Destaques lado a lado ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.53fr_1fr]" style={{ gap: 20, alignItems: 'stretch', marginTop: 20 }}>
        <div style={{ background: 'var(--bg-card)', borderRadius: 9, paddingTop: 17, paddingLeft: 17, paddingRight: 17, paddingBottom: 20, border: '1px solid #DFE4E9' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 12 }}>
            <div>
              <p style={{ fontSize: 14, fontWeight: 650, color: 'var(--text-1)', margin: '0 0 3px' }}>Captações × Vendas</p>
              <p style={{ fontSize: 12.5, color: 'var(--text-subtle)', margin: 0 }}>Evolução mensal desde o primeiro lead registrado</p>
            </div>
            <div style={{ display: 'flex', gap: 14, flexShrink: 0 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#3B82F6', flexShrink: 0 }} /> Captações
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10B981', flexShrink: 0 }} /> Vendas
              </span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={trend} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="4 4" stroke="#E9EDF1" vertical={false} />
              <XAxis dataKey="mes_label" tick={{ fontSize: 11, fill: '#94A3B8' }} interval={Math.max(0, Math.ceil(trend.length / 12) - 1)} />
              <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }}
                formatter={(val: number, name: string) => [val, name === 'captacoes' ? 'Captações' : 'Vendas']} />
              <Line type="monotone" dataKey="captacoes" stroke="#3B82F6" strokeWidth={2.25} dot={false} />
              <Line type="monotone" dataKey="vendas"    stroke="#10B981" strokeWidth={2.25} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div style={{ paddingTop: 20 }}>
          {secLabel('Destaques', true)}
          <div className="grid grid-cols-2 grid-rows-2 gap-x-2 gap-y-1.5 lg:h-[calc(100%-47px)]">
            {byReceita[0] && (
              <DestaqueCard
                accent="#10B981" label="Maior receita" value={fmtBrl(byReceita[0].receita)}
                sub={byReceita[0].operador} context={`${byReceita[0].vendas} venda${byReceita[0].vendas !== 1 ? 's' : ''} · ${byReceita[0].conversao}% conversão`}
                onClick={() => openPerfModal(`Leads de ${byReceita[0].operador}`, byReceita[0].operador)}
              />
            )}
            {topConv ? (
              <DestaqueCard
                accent="#6366F1" label="Maior conversão" value={`${topConv.conversao}%`}
                sub={topConv.operador} context={`${topConv.captacoes} captações · ${topConv.vendas} vendas`}
                onClick={() => openPerfModal(`Leads de ${topConv.operador}`, topConv.operador)}
              />
            ) : (
              <div style={{ background: 'var(--bg-card)', borderRadius: 9, padding: 16, minHeight: 140, border: '1px solid #DFE4E9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <p style={{ fontSize: 12.5, color: 'var(--text-muted)', textAlign: 'center', fontWeight: 500 }}>Ninguém converteu ainda</p>
              </div>
            )}
            {byVendas[0] && (
              <DestaqueCard
                accent="#2563EB" label="Mais vendas" value={String(byVendas[0].vendas)}
                sub={byVendas[0].operador} context={`${fmtBrl(byVendas[0].receita)} em receita`}
                onClick={() => openPerfModal(`Vendas de ${byVendas[0].operador}`, byVendas[0].operador, 'venda')}
              />
            )}
            {atencao ? (
              <DestaqueCard
                accent="#F59E0B" label="Precisa de atenção" value={`${atencao.conversao}%`}
                sub={atencao.operador} context={`${atencao.captacoes} captações · ${atencao.vendas} vendas`}
                onClick={() => openPerfModal(`Leads de ${atencao.operador}`, atencao.operador)}
              />
            ) : (
              <div style={{ background: 'var(--bg-card)', borderRadius: 9, padding: 16, minHeight: 140, border: '1px solid #DFE4E9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <p style={{ fontSize: 12.5, color: 'var(--text-muted)', textAlign: 'center', fontWeight: 500 }}>Todos acima da média</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Comparativo da Equipe: leaderboard editorial, uma barra por operador/canal ── */}
      <div style={{ marginTop: 20 }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid #DFE4E9', borderRadius: 9, overflow: 'hidden' }}>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between" style={{ gap: 10, padding: '14px 18px', borderBottom: '1px solid #E7EBEF' }}>
            <div>
              <p style={{ fontSize: 14, fontWeight: 650, color: 'var(--text-1)', margin: '0 0 3px' }}>Quem performou melhor no período?</p>
              <p style={{ fontSize: 12, color: 'var(--text-subtle)', margin: 0 }}>Comparação consolidada entre receita, conversão e posição relativa à média da equipe</p>
              <p style={{ fontSize: 10.5, color: 'var(--text-subtle)', margin: '4px 0 0' }}>Barras proporcionais à maior receita do período.</p>
            </div>
            <div style={{ flexShrink: 0 }}>
              <span style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Referência</span>
              <b style={{ fontSize: 12, fontWeight: 650, color: 'var(--text-2)' }}>Média da equipe: {avgConv}% de conversão</b>
            </div>
          </div>

          <div>
            {(expLeaderboard ? byReceita : byReceita.slice(0, 3)).map((row, idx, visible) => {
              const barWidth = byReceita[0].receita > 0 ? Math.round(row.receita / byReceita[0].receita * 100) : 0
              return (
                <div key={row.operador}
                  onClick={() => openPerfModal(`Histórico de ${row.operador}`, row.operador, undefined, true)}
                  tabIndex={0}
                  role="button"
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPerfModal(`Histórico de ${row.operador}`, row.operador, undefined, true) } }}
                  className="grid grid-cols-1 md:grid-cols-[minmax(0,1.15fr)_minmax(140px,1fr)_minmax(160px,1fr)] items-center"
                  style={{
                    gap: 14, padding: '14px 18px', cursor: 'pointer',
                    borderBottom: idx < visible.length - 1 ? '1px solid #E7EBEF' : 'none',
                    background: 'transparent',
                    transition: 'background 150ms',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                >
                  <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 11 }}>
                    <span style={{
                      width: 24, height: 24, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: 6,
                      fontSize: 10, fontWeight: 750, border: '1px solid #E5E9ED',
                      color: '#687684', background: '#F1F3F5',
                    }}>{idx + 1}</span>
                    <div style={{ minWidth: 0 }}>
                      <b style={{ display: 'block', overflow: 'hidden', color: 'var(--text-1)', fontSize: 13, fontWeight: 680, textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.operador}</b>
                      <span style={{ display: 'inline-block', marginTop: 3, fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4, color: row.tipo === 'operador' ? '#2563EB' : 'var(--text-muted)', background: row.tipo === 'operador' ? '#EFF6FF' : 'var(--bg-subtle)' }}>
                        {row.tipo === 'operador' ? 'Operador' : 'Canal'}
                      </span>
                    </div>
                  </div>

                  <div style={{ minWidth: 0 }} aria-label={`Apoio visual normalizado para ${row.operador}; não representa uma métrica adicional`}>
                    <div style={{ height: 9, background: '#EDF0F3', borderRadius: 5, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${barWidth}%`, background: '#10B981', opacity: 0.84, borderRadius: 5 }} />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '74px 1fr', gap: 14 }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: '0 0 3px', color: '#8995A1', fontSize: 9, fontWeight: 750, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Conversão</p>
                      <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap' }}>{row.conversao}%</p>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: '0 0 3px', color: '#8995A1', fontSize: 9, fontWeight: 750, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Receita</p>
                      <p style={{ margin: 0, color: 'var(--text-2)', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap' }}>{fmtBrl(row.receita)}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          {byReceita.length > 3 && (
            <div style={{ padding: '10px 16px', borderTop: '1px solid #E7EBEF' }}>
              <ExpandToggle expanded={expLeaderboard} hidden={byReceita.length - 3} onClick={() => setExpLeaderboard(v => !v)} />
            </div>
          )}
        </div>
      </div>

      {/* ── Ranking de Operadores: tabela filtrável ── */}
      <div style={{ marginTop: 20 }}>
        {secLabel('Ranking de operadores')}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
          <select value={tipoFilter} onChange={e => setTipoFilter(e.target.value as 'todos' | 'operador' | 'canal')} style={{ height: 34, fontSize: 12, padding: '0 12px', borderRadius: 6, border: '1px solid #DFE4E9', background: 'var(--bg-card)', color: 'var(--text-2)', cursor: 'pointer' }}>
            <option value="todos">Tipo: Todos</option>
            <option value="operador">Só operadores</option>
            <option value="canal">Só canais</option>
          </select>
          <div style={{ display: 'flex', height: 34, border: '1px solid #DFE4E9', borderRadius: 6, overflow: 'hidden' }}>
            {([
              { key: 'todos', label: 'Todos' },
              { key: 'vendas', label: 'Só com vendas' },
              { key: 'atencao', label: 'Precisam de atenção' },
            ] as const).map((o, i) => (
              <button key={o.key} onClick={() => setQuickFilter(o.key)}
                onMouseEnter={e => { if (quickFilter !== o.key) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)' }}
                onMouseLeave={e => { if (quickFilter !== o.key) (e.currentTarget as HTMLElement).style.background = quickFilter === o.key ? '#EFF6FF' : 'var(--bg-card)' }}
                style={{
                  fontSize: 12, fontWeight: 600, padding: '0 14px', border: 'none', cursor: 'pointer',
                  borderRight: i < 2 ? '1px solid #DFE4E9' : 'none',
                  background: quickFilter === o.key ? '#EFF6FF' : 'var(--bg-card)',
                  color: quickFilter === o.key ? '#2563EB' : 'var(--text-muted)',
                  transition: 'background 150ms',
                }}>
                {o.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginLeft: 'auto' }}>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Ordenar</span>
            {([
              { key: 'receita', label: 'Receita' },
              { key: 'captacoes', label: 'Captações' },
              { key: 'vendas', label: 'Vendas' },
              { key: 'cancelados', label: 'Cancelamentos' },
            ] as const).map(o => (
              <button key={o.key} onClick={() => setSortBy(o.key)}
                onMouseEnter={e => { if (sortBy !== o.key) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)' }}
                onMouseLeave={e => { if (sortBy !== o.key) (e.currentTarget as HTMLElement).style.background = sortBy === o.key ? '#EFF6FF' : 'var(--bg-card)' }}
                style={{
                  height: 34, fontSize: 12, fontWeight: 600, padding: '0 14px', borderRadius: 6,
                  border: `1px solid ${sortBy === o.key ? '#BFDBFE' : '#DFE4E9'}`,
                  background: sortBy === o.key ? '#EFF6FF' : 'var(--bg-card)',
                  color: sortBy === o.key ? '#2563EB' : 'var(--text-muted)', cursor: 'pointer',
                  transition: 'background 150ms, border-color 150ms',
                }}>
                Por {o.label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ background: 'var(--bg-card)', borderRadius: 9, border: '1px solid #DFE4E9', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }} tabIndex={0} role="region" aria-label="Tabela de ranking de operadores, role horizontalmente para ver todas as colunas">
          <table style={{ width: '100%', minWidth: 900, borderCollapse: 'collapse' }} aria-label="Ranking de operadores">
            <thead>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #DFE4E9' }}>
                {(['Operador', 'Tipo', 'Captações', 'Cancelados', 'Taxa Cancel.', 'Vendas', 'Ticket Médio', 'Conversão'] as const).map((h, i) => (
                  <th key={h} scope="col" style={{ padding: '12px 16px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: i < 2 ? 'left' : 'right', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(expRanking ? filteredSorted : filteredSorted.slice(0, 3)).map((r, i) => (
                <tr key={r.operador}
                  onClick={() => openPerfModal(`Histórico de ${r.operador}`, r.operador, undefined, true)}
                  tabIndex={0}
                  role="button"
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPerfModal(`Histórico de ${r.operador}`, r.operador, undefined, true) } }}
                  style={{
                    borderTop: i === 0 ? 'none' : '1px solid #DFE4E9', cursor: 'pointer',
                    background: i % 2 === 1 ? 'var(--bg-subtle, rgba(0,0,0,0.015))' : 'transparent',
                    transition: 'background 150ms',
                  }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = i % 2 === 1 ? 'var(--bg-subtle, rgba(0,0,0,0.015))' : 'transparent'}
                >
                  <td style={{ padding: '15px 16px', fontSize: 13, fontWeight: 700, color: '#2563EB' }}>{r.operador}</td>
                  <td style={{ padding: '15px 16px', textAlign: 'left' }}>
                    <span style={{ display: 'inline-block', fontSize: 10.5, fontWeight: 600, padding: '4px 8px', borderRadius: 4, color: r.tipo === 'operador' ? '#2563EB' : 'var(--text-muted)', background: r.tipo === 'operador' ? '#EFF6FF' : 'var(--bg-subtle)' }}>
                      {r.tipo === 'operador' ? 'Operador' : 'Canal'}
                    </span>
                  </td>
                  <td style={{ padding: '15px 16px', fontSize: 13, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-2)' }}>{r.captacoes}</td>
                  <td style={{ padding: '15px 16px', fontSize: 13, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: r.cancelados > 0 ? 700 : 400, color: r.cancelados > 0 ? '#EF4444' : 'var(--text-muted)' }}>{r.cancelados}</td>
                  <td style={{ padding: '15px 16px', fontSize: 13, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>{r.cancel_rate}%</td>
                  <td style={{ padding: '15px 16px', fontSize: 13, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: r.vendas > 0 ? '#059669' : 'var(--text-muted)' }}>{r.vendas}</td>
                  <td style={{ padding: '15px 16px', fontSize: 13, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-2)' }}>{r.ticket_medio > 0 ? fmtBrl(r.ticket_medio) : '—'}</td>
                  <td style={{ padding: '15px 16px', textAlign: 'right' }}>
                    <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 600, padding: '4px 8px', borderRadius: 999, color: convColor(r.conversao), background: convColor(r.conversao) + '15' }}>{r.conversao}%</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          {filteredSorted.length > 3 && (
            <div style={{ padding: '10px 16px', borderTop: '1px solid #DFE4E9' }}>
              <ExpandToggle expanded={expRanking} hidden={filteredSorted.length - 3} onClick={() => setExpRanking(v => !v)} />
            </div>
          )}
        </div>
      </div>

    </div>

      {/* Modal: Leads Performance */}
      {perfPopup && (
        <div onClick={() => setPerfPopup(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-card,#fff)', borderRadius: 18, width: '100%', maxWidth: 560, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ padding: '20px 24px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>{perfPopup}</p>
                <button
                  onClick={goToLeadsReportFromPopup}
                  title="Ver no Relatório de Leads"
                  style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-subtle)', padding: 2, opacity: 0.6, transition: 'opacity 150ms, color 150ms' }}
                  onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = '#2563EB' }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = '0.6'; e.currentTarget.style.color = 'var(--text-subtle)' }}
                >
                  <ArrowUpRight size={14} />
                </button>
              </div>
              <button onClick={() => setPerfPopup(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-subtle)', padding: 4 }}><X size={18} /></button>
            </div>
            <div style={{ padding: '16px 24px 24px' }}>
              {perfTrend && perfTrend.length > 0 && (
                <div style={{ marginBottom: 18 }}>
                  <ResponsiveContainer width="100%" height={140}>
                    <LineChart data={perfTrend} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                      <XAxis dataKey="mes_label" tick={{ fontSize: 9, fill: '#94A3B8' }} interval={Math.max(0, Math.ceil(perfTrend.length / 6) - 1)} />
                      <YAxis tick={{ fontSize: 9, fill: '#94A3B8' }} />
                      <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E2E8F0' }}
                        formatter={(val: number, name: string) => [val, name === 'captacoes' ? 'Captações' : 'Vendas']} />
                      <Line type="monotone" dataKey="captacoes" stroke="#3B82F6" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="vendas"    stroke="#10B981" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
              {perfLoading ? (
                <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 0' }}>Carregando…</p>
              ) : perfLeads.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 0' }}>Nenhum lead encontrado</p>
              ) : (() => {
                const statusList = [...new Set(perfLeads.map(l => l.status))]
                const filtered   = perfStatusFilter ? perfLeads.filter(l => l.status === perfStatusFilter) : perfLeads
                const tipoCor    = (tipo: string) => tipo === 'venda' ? '#059669' : tipo === 'perda' ? '#EF4444' : '#6B7280'
                return (
                  <>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
                      <button onClick={() => setPerfStatusFilter(null)} style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer', background: perfStatusFilter === null ? '#1D4ED8' : 'var(--bg-2)', color: perfStatusFilter === null ? '#fff' : 'var(--text-muted)' }}>
                        Todos ({perfLeads.length})
                      </button>
                      {statusList.map(st => {
                        const count = perfLeads.filter(l => l.status === st).length
                        const active = perfStatusFilter === st
                        const cor = tipoCor(perfLeads.find(l => l.status === st)?.tipo ?? '')
                        return (
                          <button key={st} onClick={() => setPerfStatusFilter(active ? null : st)} style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6, border: `1px solid ${cor}40`, cursor: 'pointer', background: active ? cor : cor + '15', color: active ? '#fff' : cor }}>
                            {st} ({count})
                          </button>
                        )
                      })}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {filtered.map((l, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 10, background: 'var(--bg-subtle,#F8FAFC)', border: '1px solid var(--border)' }}>
                          <div>
                            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{l.nome}</p>
                            {l.origem && <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>{l.origem}</p>}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            {l.valor != null && <span style={{ fontSize: 12, fontWeight: 600, color: '#059669' }}>{l.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 })}</span>}
                            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: tipoCor(l.tipo) + '18', color: tipoCor(l.tipo) }}>{l.status}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )
              })()}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Comparação entre meses ───────────────────────────────────────────────────
function MonthPanel({ month, untilDay }: { month: string; untilDay?: number }) {
  const [kpis, setKpis]       = useState<Kpis | null>(null)
  const [diario, setDiario]   = useState<DiarioItem[]>([])
  const [origens, setOrigens] = useState<OrigemItem[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedGrupo, setExpandedGrupo] = useState<string | null>(null)
  const [orgConvPoints, setOrgConvPoints] = useState<{conversion_point: string, count: number, pct: number}[]>([])
  const [orgConvPointsLoading, setOrgConvPointsLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    const suffix = untilDay ? `&until_day=${untilDay}` : ''
    Promise.all([
      api.get<Kpis>(`/api/v1/gestao-comercial/visao-geral?month=${month}${suffix}`),
      api.get<DiarioItem[]>(`/api/v1/gestao-comercial/evolucao-diaria?month=${month}${suffix}`),
      api.get<OrigemItem[]>(`/api/v1/gestao-comercial/origens-captacao?month=${month}${suffix}`),
    ]).then(([k, d, o]) => { setKpis(k.data); setDiario(d.data); setOrigens(o.data) })
      .catch(() => {}).finally(() => setLoading(false))
  }, [month, untilDay])

  const grupos = groupOrigens(origens)
  const maxCap = grupos.reduce((m, g) => Math.max(m, g.captacoes), 1)
  const monthLabel = new Date(month + '-01T12:00:00').toLocaleString('pt-BR', { month: 'long', year: 'numeric' })
    + (untilDay ? ` (dias 1–${untilDay})` : '')

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', textTransform: 'capitalize', margin: '0 0 12px' }}>{monthLabel}</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 16 }}>
        {CARD_CFG.map(({ key, label, icon: Icon, color, bg, sub, fmt }) => {
          const value = kpis ? (kpis as Record<string, number>)[key] : 0
          return (
            <div key={key} style={{ background: bg, borderRadius: 10, padding: '12px 14px', borderLeft: `3px solid ${color}` }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: sub, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{label}</span>
                <Icon size={13} color={color} />
              </div>
              <p style={{ fontSize: 17, fontWeight: 800, color, margin: 0 }}>{loading ? '—' : fmt(value)}</p>
            </div>
          )
        })}
      </div>

      <div className="bg-white rounded-xl" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)', padding: '14px 14px 8px', marginBottom: 16 }}>
        <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)', margin: '0 0 10px' }}>Evolução Diária</p>
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={diario} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
            <XAxis dataKey="dia" tick={{ fontSize: 9, fill: '#94A3B8' }} interval={4} />
            <YAxis tick={{ fontSize: 9, fill: '#94A3B8' }} />
            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E2E8F0' }}
              formatter={(val: number, name: string) => [val, name === 'captacoes' ? 'Captações' : 'Vendas']}
              labelFormatter={(l: number) => `Dia ${l}`} />
            <Line type="monotone" dataKey="captacoes" stroke="#3B82F6" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="vendas"    stroke="#10B981" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-xl" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)', padding: '14px 14px 12px' }}>
        <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)', margin: '0 0 10px' }}>Origens de Captação</p>
        {grupos.map(g => {
          const open = expandedGrupo === g.nome
          const barW = maxCap > 0 ? Math.max((g.captacoes / maxCap) * 100, 2) : 0
          return (
            <div key={g.nome} style={{ marginBottom: 8 }}>
              <button onClick={() => {
                const isOpening = expandedGrupo !== g.nome
                setExpandedGrupo(isOpening ? g.nome : null)
                if (isOpening && g.nome === 'Orgânico') {
                  setOrgConvPoints([]); setOrgConvPointsLoading(true)
                  const origensStr = g.subs.map(s => s.nome).join(',')
                  const p = new URLSearchParams({ month })
                  if (origensStr) p.set('origens', origensStr)
                  api.get<{conversion_point: string, count: number, pct: number}[]>(`/api/v1/gestao-comercial/conversion-points?${p}`)
                    .then(r => setOrgConvPoints(r.data)).catch(() => setOrgConvPoints([]))
                    .finally(() => setOrgConvPointsLoading(false))
                }
              }} style={{ width: '100%', background: open ? g.color + '10' : 'transparent', border: `1px solid ${open ? g.color + '40' : 'var(--border)'}`, borderRadius: 8, padding: '8px 10px', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: g.color }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>{g.nome}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-subtle)' }}>{g.pct}%</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: g.color }}>{g.captacoes}</span>
                    {open ? <ChevronDown size={12} color={g.color} /> : <ChevronRight size={12} color="#94A3B8" />}
                  </div>
                </div>
                <div style={{ background: '#F1F5F9', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                  <div style={{ width: `${barW}%`, height: '100%', background: g.color, borderRadius: 4 }} />
                </div>
              </button>
              {open && (
                <div style={{ marginTop: 5, padding: '8px 10px', background: '#F8FAFC', borderRadius: 8, border: '1px solid var(--border)' }}>
                  {g.nome === 'Orgânico' ? (
                    orgConvPointsLoading ? (
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0', textAlign: 'center' }}>Carregando...</p>
                    ) : orgConvPoints.length === 0 ? (
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0', textAlign: 'center' }}>Nenhum ponto de conversão registrado</p>
                    ) : orgConvPoints.map(cp => (
                      <div key={cp.conversion_point} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 0', color: 'var(--text-2)' }}>
                        <span>{cp.conversion_point}</span>
                        <span style={{ fontWeight: 700, color: g.color }}>{cp.count} ({cp.pct}%)</span>
                      </div>
                    ))
                  ) : (
                    g.subs.map(s => (
                      <div key={s.nome} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 0', color: 'var(--text-2)' }}>
                        <span>{s.nome}</span>
                        <span style={{ fontWeight: 700, color: g.color }}>{s.captacoes} ({s.pct}%)</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function daysInMonth(month: string) {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}
function daysElapsed(month: string) {
  return month === nowMonth() ? _gcNow.getDate() : daysInMonth(month)
}

function ComparisonModal({ onClose }: { onClose: () => void }) {
  const [monthA, setMonthA] = useState(prevMonthStr(nowMonth()))
  const [monthB, setMonthB] = useState(nowMonth())
  const [exactMode, setExactMode] = useState(false)

  const dayLimit = exactMode ? Math.min(daysElapsed(monthA), daysElapsed(monthB)) : undefined

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-card, #fff)', borderRadius: 16, width: '100%', maxWidth: 1100, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--bg-card, #fff)', zIndex: 1 }}>
          <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Comparação entre meses</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button
              onClick={() => setExactMode(v => !v)}
              title="Compara o mesmo número de dias em ambos os meses, evitando comparar um mês inteiro com um mês parcial"
              style={{
                fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
                border: `1px solid ${exactMode ? '#3B82F6' : 'var(--border-in)'}`,
                background: exactMode ? '#3B82F6' : 'transparent',
                color: exactMode ? '#fff' : 'var(--text-2)',
              }}
            >
              Comparar períodos exatos{dayLimit ? ` (1–${dayLimit})` : ''}
            </button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
              <X size={20} />
            </button>
          </div>
        </div>
        <div style={{ padding: '16px 24px', display: 'flex', gap: 16, borderBottom: '1px solid var(--border)' }}>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', margin: '0 0 5px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Mês A</p>
            <input type="month" value={monthA} onChange={e => setMonthA(e.target.value)}
              style={{ width: '100%', fontSize: 13, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border-in)', color: 'var(--text-3)', background: 'var(--bg-input)', boxSizing: 'border-box' }} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', margin: '0 0 5px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Mês B</p>
            <input type="month" value={monthB} onChange={e => setMonthB(e.target.value)}
              style={{ width: '100%', fontSize: 13, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border-in)', color: 'var(--text-3)', background: 'var(--bg-input)', boxSizing: 'border-box' }} />
          </div>
        </div>
        <div style={{ padding: 24, display: 'flex', gap: 20 }}>
          <MonthPanel month={monthA} untilDay={dayLimit} />
          <div style={{ width: 1, background: 'var(--border)', flexShrink: 0 }} />
          <MonthPanel month={monthB} untilDay={dayLimit} />
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Main component
// ════════════════════════════════════════════════════════════════════════════
export default function GestaoComercial() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab]     = useState<Tab>('Visão Geral')
  const [dateFrom, setDateFrom]       = useState(_gcMonthStart)
  const [dateTo, setDateTo]           = useState(_gcToday)
  const [filterOpen, setFilterOpen]   = useState(false)
  const [filterMode, setFilterMode]   = useState<'range' | 'month'>('range')
  const [showComparison, setShowComparison] = useState(false)
  const [selectedSources, setSelectedSources] = useState<string[]>([])
  const [sources, setSources]         = useState<string[]>([])
  const [teamFilter, setTeamFilter]   = useState('')
  const month = dateFrom.slice(0, 7)
  const teamParam = teamFilter

  useEffect(() => {
    api.get<string[]>('/api/v1/leads/origins').then(r => setSources(r.data)).catch(() => {})
  }, [])


  function applyMonth(val: string) {
    const [y, m] = val.split('-').map(Number)
    const lastDay = new Date(y, m, 0).getDate()
    setDateFrom(`${val}-01`)
    setDateTo(`${val}-${String(lastDay).padStart(2, '0')}`)
  }

  const filterLabel = (() => {
    const fmt = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
    if (dateFrom === _gcMonthStart && dateTo === _gcToday) return 'Este mês'
    if (dateFrom.slice(0, 7) === dateTo.slice(0, 7) && dateFrom.endsWith('-01')) {
      return new Date(dateFrom + 'T12:00:00').toLocaleString('pt-BR', { month: 'long', year: 'numeric' })
    }
    return `${fmt(dateFrom)} – ${fmt(dateTo)}`
  })()

  const [kpis, setKpis]       = useState<Kpis | null>(null)
  const [prevKpis, setPrevKpis] = useState<Kpis | null>(null)
  const [diario, setDiario]   = useState<DiarioItem[]>([])
  const [origens, setOrigens] = useState<OrigemItem[]>([])
  const [mensal, setMensal]   = useState<MensalItem[]>([])
  const [modalidades, setModalidades] = useState<ModalidadeItem[]>([])
  const [loading, setLoading] = useState(false)
  const [qualificados, setQualificados] = useState(0)
  const [prevQualificados, setPrevQualificados] = useState(0)

  const [expandedGrupo, setExpandedGrupo] = useState<string | null>(null)

  const [stagePopup, setStagePopup]               = useState<{stage: string, leads: PerfLead[], loading: boolean, x: number, y: number, convPoint?: string, origens?: string} | null>(null)
  const [orgConvPoints, setOrgConvPoints]         = useState<{conversion_point: string, count: number, pct: number}[]>([])
  const [orgConvPointsLoading, setOrgConvPointsLoading] = useState(false)

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
    // limita o mês anterior ao mesmo dia do mês corrente, senão um mês em andamento
    // sempre perde feio na comparação contra o mês anterior completo
    const untilDay = Number(dateTo.slice(8, 10))
    const teamSuffix = teamParam ? `&team=${encodeURIComponent(teamParam)}` : ''
    // usa o intervalo real escolhido (start/end), nao mais month+until_day — que so
    // funcionava corretamente quando dateFrom/dateTo caiam no mesmo mes
    const rangeParams = `start=${dateFrom}&end=${dateTo}`
    Promise.all([
      api.get<Kpis>(`/api/v1/gestao-comercial/visao-geral?${rangeParams}${teamSuffix}`),
      api.get<DiarioItem[]>(`/api/v1/gestao-comercial/evolucao-diaria?${rangeParams}${teamSuffix}`),
      api.get<OrigemItem[]>(`/api/v1/gestao-comercial/origens-captacao?${rangeParams}${teamSuffix}`),
      api.get<MensalItem[]>(`/api/v1/gestao-comercial/comparativo-mensal?${new URLSearchParams(teamParam ? { team: teamParam } : {})}`),
      api.get<ModalidadeItem[]>(`/api/v1/gestao-comercial/modalidades-captacao?${rangeParams}${teamSuffix}`),
      api.get<Kpis>(`/api/v1/gestao-comercial/visao-geral?month=${prevMonthStr(month)}&until_day=${untilDay}${teamSuffix}`),
    ]).then(([k, d, o, m, mod, pk]) => {
      setKpis(k.data); setDiario(d.data); setOrigens(o.data); setMensal(m.data); setModalidades(mod.data); setPrevKpis(pk.data)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [activeTab, month, dateTo, teamParam])

  useEffect(() => {
    if (activeTab !== 'Visão Geral') return
    const teamSuffix = teamParam ? `&team=${encodeURIComponent(teamParam)}` : ''
    api.get<PipelineOverview>(`/api/v1/pipeline/overview?date_from=${dateFrom}&date_to=${dateTo}${teamSuffix}`)
      .then(r => setQualificados(r.data.negociacao)).catch(() => {})
    // mesmo período (mesmos dias-do-mês) do mês anterior, não um mês completo
    const prevRef = new Date(dateFrom + 'T12:00:00')
    prevRef.setMonth(prevRef.getMonth() - 1)
    const y = prevRef.getFullYear(), m = prevRef.getMonth()
    const lastDayPrev = new Date(y, m + 1, 0).getDate()
    const pad = (n: number) => String(n).padStart(2, '0')
    const clampDay = (dateStr: string) => pad(Math.min(Number(dateStr.slice(8, 10)), lastDayPrev))
    const prevFromStr = `${y}-${pad(m + 1)}-${clampDay(dateFrom)}`
    const prevToStr = `${y}-${pad(m + 1)}-${clampDay(dateTo)}`
    api.get<PipelineOverview>(`/api/v1/pipeline/overview?date_from=${prevFromStr}&date_to=${prevToStr}${teamSuffix}`)
      .then(r => setPrevQualificados(r.data.negociacao)).catch(() => {})
  }, [activeTab, dateFrom, dateTo, teamParam])

  function openDrill(tipo: DrillTipo) {
    setDrillTipo(tipo); setDrillPath([]); setSelectedStage(null)
    setShowDrill(true); setDrillLoading(true); setDrillRows([])
    const p = new URLSearchParams({ month, tipo })
    if (teamParam) p.set('team', teamParam)
    api.get<DrillRawRow[]>(`/api/v1/gestao-comercial/receita-potencial-drill?${p}`)
      .then(r => setDrillRows(normalizeDrill(r.data))).catch(() => {}).finally(() => setDrillLoading(false))
  }

  function openStagePopup(label: string, e: React.MouseEvent, convPoint?: string) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const x = rect.right + 290 < window.innerWidth ? rect.right + 10 : rect.left - 290
    const y = Math.min(rect.top, window.innerHeight - 320)
    const origens = convPoint ? undefined : (label === 'o2 Solution' ? [...O2_NAMES].join(',') : label)
    setStagePopup({ stage: label, leads: [], loading: true, x, y, convPoint, origens })
    const p = new URLSearchParams({ month })
    if (convPoint) p.set('conv_point', convPoint)
    else if (origens) p.set('origens', origens)
    if (teamParam) p.set('team', teamParam)
    api.get<PerfLead[]>(`/api/v1/kpis/leads-conv-point?${p}`)
      .then(r => setStagePopup(prev => prev ? { ...prev, leads: r.data, loading: false } : null))
      .catch(() => setStagePopup(prev => prev ? { ...prev, leads: [], loading: false } : null))
  }

  function goToLeadsReport(convPoint?: string, origens?: string) {
    const [y1, m1] = month.split('-').map(Number)
    const lastDay = new Date(y1, m1, 0).getDate()
    const params = new URLSearchParams({ date_from: `${month}-01`, date_to: `${month}-${String(lastDay).padStart(2, '0')}` })
    if (convPoint) params.set('conversion_point', convPoint)
    else if (origens) params.set('origem', origens)
    if (teamParam) params.set('team', teamParam)
    navigate(`/leads-report?${params}`)
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
    if (teamParam) params.set('team', teamParam)
    api.get<ContractItem[]>(`/api/v1/gestao-comercial/receita-contratos?${params}`)
      .then(r => setContracts(r.data)).catch(() => setContracts([]))
      .finally(() => setContractsLoading(false))
  }

  useEffect(() => { setDrillRows([]); setSelectedStage(null) }, [month])
  useEffect(() => {
    if (drillTipo === 'vendas' && drillPath.length === 2) return
    setSelectedStage(null)
  }, [drillPath, drillTipo])

  const navItems: { key: string; label: string; total: number; color: string }[] = (() => {
    if (drillPath.length === 0)
      return ['SDR', 'Orgânico'].map(g => ({ key: g, label: g, total: drillRows.filter(r => r.grupo === g).reduce((s, r) => s + r.total_value, 0), color: GROUP_COLORS[g] })).filter(i => i.total > 0)
    if (drillPath.length === 1)
      return sumByKey(filterDrill(drillRows, drillPath), r => r.operador, r => r.total_value).map(({ key, total }) => ({ key, label: key, total, color: GROUP_COLORS[drillPath[0]] ?? '#8B5CF6' }))
    return []
  })()
  const maxNav      = navItems[0]?.total ?? 1
  const breadcrumb  = ['Total', ...drillPath, ...(selectedStage && selectedStage !== '__ALL__' ? [stageLabel(selectedStage)] : [])]
  const grupos      = groupOrigens(origens)
  const maxCap      = grupos.reduce((m, g) => Math.max(m, g.captacoes), 1)

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1360, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Gestão Comercial</h1>
        <p style={{ fontSize: 13, color: 'var(--text-subtle)', marginTop: 4 }}>Acompanhe resultados, pipeline e performance da equipe</p>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '2px solid var(--border)' }}>
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

      {/* ── FILTRO GLOBAL ── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 16, position: 'relative' }}>
        {(activeTab === 'Visão Geral' || activeTab === 'Pipeline' || activeTab === 'Performance') && (
          <button
            onClick={() => setShowComparison(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13, fontWeight: 500, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
          >
            <ArrowLeftRight size={14} />
            Ver comparação
          </button>
        )}
        <button
          onClick={() => setFilterOpen(o => !o)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13, fontWeight: 500, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
        >
          <Filter size={14} />
          {filterLabel}
          <ChevronDown size={13} style={{ transform: filterOpen ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }} />
        </button>

        {filterOpen && (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setFilterOpen(false)} />
            <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 50, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', minWidth: 280 }}>

              {/* Seletores de modo */}
              <div style={{ display: 'flex', gap: 4, marginBottom: 14, background: 'var(--bg-input)', borderRadius: 8, padding: 3 }}>
                {(['range', 'month'] as const).map(mode => (
                  <button key={mode} onClick={() => setFilterMode(mode)} style={{ flex: 1, padding: '5px 0', borderRadius: 6, border: 'none', background: filterMode === mode ? 'var(--bg-card)' : 'transparent', color: filterMode === mode ? 'var(--text-1)' : 'var(--text-muted)', cursor: 'pointer', fontSize: 12, fontWeight: filterMode === mode ? 600 : 400, boxShadow: filterMode === mode ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 150ms' }}>
                    {mode === 'range' ? 'Entre datas' : 'Por mês'}
                  </button>
                ))}
              </div>

              {filterMode === 'range' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', margin: '0 0 5px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>De</p>
                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                      style={{ width: '100%', fontSize: 13, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border-in)', color: 'var(--text-3)', background: 'var(--bg-input)', cursor: 'pointer', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', margin: '0 0 5px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Até</p>
                    <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                      style={{ width: '100%', fontSize: 13, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border-in)', color: 'var(--text-3)', background: 'var(--bg-input)', cursor: 'pointer', boxSizing: 'border-box' }} />
                  </div>
                </div>
              )}

              {filterMode === 'month' && (
                <div>
                  <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', margin: '0 0 5px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Mês</p>
                  <input type="month" value={month} onChange={e => applyMonth(e.target.value)}
                    style={{ width: '100%', fontSize: 13, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border-in)', color: 'var(--text-3)', background: 'var(--bg-input)', cursor: 'pointer', boxSizing: 'border-box' }} />
                </div>
              )}

              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border-lt)' }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', margin: '0 0 5px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Equipe</p>
                <div style={{ display: 'flex', gap: 4, background: 'var(--bg-input)', borderRadius: 8, padding: 3 }}>
                  <button onClick={() => setTeamFilter('')} style={{ flex: 1, padding: '5px 0', borderRadius: 6, border: 'none', background: teamFilter === '' ? 'var(--bg-card)' : 'transparent', color: teamFilter === '' ? 'var(--text-1)' : 'var(--text-muted)', cursor: 'pointer', fontSize: 12, fontWeight: teamFilter === '' ? 600 : 400, boxShadow: teamFilter === '' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 150ms' }}>
                    Todas
                  </button>
                  {TEAM_OPTIONS.map(t => (
                    <button key={t.value} onClick={() => setTeamFilter(t.value)} style={{ flex: 1, padding: '5px 0', borderRadius: 6, border: 'none', background: teamFilter === t.value ? 'var(--bg-card)' : 'transparent', color: teamFilter === t.value ? 'var(--text-1)' : 'var(--text-muted)', cursor: 'pointer', fontSize: 12, fontWeight: teamFilter === t.value ? 600 : 400, boxShadow: teamFilter === t.value ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 150ms' }}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {activeTab === 'Pipeline' && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border-lt)' }}>
                  <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', margin: '0 0 5px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Origem</p>
                  <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid var(--border-in)', borderRadius: 8 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid var(--border-lt)' }}>
                      <input type="checkbox" checked={selectedSources.length === 0} onChange={() => setSelectedSources([])} readOnly />
                      <span style={{ color: 'var(--text-2)' }}>Todas as origens</span>
                    </label>
                    {sources.map(s => (
                      <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer', fontSize: 13 }}>
                        <input type="checkbox" checked={selectedSources.includes(s)}
                          onChange={() => setSelectedSources(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])} />
                        <span style={{ color: 'var(--text-2)' }}>{s}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={() => {
                  setFilterMode('range'); setDateFrom(_gcMonthStart); setDateTo(_gcToday)
                  setTeamFilter(''); setSelectedSources([]); setFilterOpen(false)
                }}
                style={{ width: '100%', marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border-lt)', borderLeft: 'none', borderRight: 'none', borderBottom: 'none', background: 'none', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'center' }}
              >
                Limpar filtro
              </button>

            </div>
          </>
        )}
      </div>

      {/* ── VISÃO GERAL ── */}
      {activeTab === 'Visão Geral' && (
        <div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 28 }}>
            {MAIN_CARD_CFG.map(({ key, label, icon: Icon, color, bg, sub, fmt, clickable, invert }) => {
              const value = key === 'qualificados' ? qualificados : (kpis ? (kpis as Record<string, number>)[key] : 0)
              const prevValue = key === 'qualificados' ? prevQualificados : (prevKpis ? (prevKpis as Record<string, number>)[key] : undefined)
              const trend = prevValue !== undefined ? pctDiff(value, prevValue) : null
              const onCardClick = !clickable ? undefined
                : key === 'qualificados' ? () => navigate(`/leads-report?date_from=${dateFrom}&date_to=${dateTo}&perception=${encodeURIComponent('Quente,Morno')}`)
                : () => openDrill(KEY_TO_TIPO[key])
              return (
                <div key={key}
                  onClick={onCardClick}
                  style={{ background: bg, borderRadius: 14, padding: '20px 22px', boxShadow: '0 1px 3px rgba(0,0,0,0.07)', borderLeft: `4px solid ${color}`, cursor: clickable ? 'pointer' : 'default', transition: clickable ? 'transform 120ms, box-shadow 120ms' : undefined }}
                  onMouseEnter={e => { if (clickable) { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = `0 4px 16px ${color}33` } }}
                  onMouseLeave={e => { if (clickable) { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 3px rgba(0,0,0,0.07)' } }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: sub, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {trend !== null && <TrendBadge value={trend} invert={invert} />}
                      <div style={{ width: 34, height: 34, borderRadius: 9, background: color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon size={16} color={color} />
                      </div>
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
                    <button onClick={() => {
                      const isOpening = expandedGrupo !== g.nome
                      setExpandedGrupo(isOpening ? g.nome : null); setStagePopup(null)
                      if (isOpening && g.nome === 'Orgânico') {
                        setOrgConvPoints([]); setOrgConvPointsLoading(true)
                        const origens = g.subs.map(s => s.nome).join(',')
                        const p = new URLSearchParams({ month })
                        if (origens) p.set('origens', origens)
                        if (teamParam) p.set('team', teamParam)
                        api.get<{conversion_point: string, count: number, pct: number}[]>(`/api/v1/gestao-comercial/conversion-points?${p}`)
                          .then(r => setOrgConvPoints(r.data)).catch(() => setOrgConvPoints([]))
                          .finally(() => setOrgConvPointsLoading(false))
                      }
                    }} style={{ width: '100%', background: open ? g.color + '10' : 'transparent', border: `1px solid ${open ? g.color + '40' : 'var(--border)'}`, borderRadius: 10, padding: '10px 14px', cursor: 'pointer', transition: 'all 150ms' }}>
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
                        {g.nome === 'Orgânico' ? (
                          orgConvPointsLoading ? (
                            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0', textAlign: 'center' }}>Carregando...</p>
                          ) : orgConvPoints.length === 0 ? (
                            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0', textAlign: 'center' }}>Nenhum ponto de conversão registrado</p>
                          ) : orgConvPoints.map(cp => {
                            const maxCount = orgConvPoints[0].count
                            const sw = Math.max((cp.count / maxCount) * 100, 2)
                            return (
                              <div key={cp.conversion_point} style={{ marginBottom: 10, cursor: 'pointer', borderRadius: 8, padding: '6px 4px', transition: 'background 150ms' }}
                                onClick={e => openStagePopup(cp.conversion_point, e, cp.conversion_point)}
                                onMouseEnter={e => (e.currentTarget.style.background = g.color + '12')}
                                onMouseLeave={e => (e.currentTarget.style.background = '')}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                  <span style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 500 }}>{cp.conversion_point}</span>
                                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: g.color }}>{cp.count}</span>
                                    <span style={{ fontSize: 11, color: 'var(--text-subtle)', minWidth: 30, textAlign: 'right' }}>{cp.pct}%</span>
                                    <ChevronRight size={12} color={g.color} />
                                  </div>
                                </div>
                                <div style={{ background: '#E2E8F0', borderRadius: 3, height: 5, overflow: 'hidden' }}>
                                  <div style={{ width: `${sw}%`, height: '100%', background: g.color + 'BB', borderRadius: 3, transition: 'width 400ms ease' }} />
                                </div>
                              </div>
                            )
                          })
                        ) : (
                          g.subs.map(s => {
                            const sw = Math.max((s.captacoes / subMax) * 100, 2)
                            return (
                              <div key={s.nome} style={{ marginBottom: 10, cursor: 'pointer', borderRadius: 8, padding: '6px 4px', transition: 'background 150ms' }}
                                onClick={e => openStagePopup(s.nome, e)}
                                onMouseEnter={e => (e.currentTarget.style.background = g.color + '12')}
                                onMouseLeave={e => (e.currentTarget.style.background = '')}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                  <span style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 500 }}>{s.nome}</span>
                                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: g.color }}>{s.captacoes}</span>
                                    <span style={{ fontSize: 11, color: 'var(--text-subtle)', minWidth: 30, textAlign: 'right' }}>{s.pct}%</span>
                                    <ChevronRight size={12} color={g.color} />
                                  </div>
                                </div>
                                <div style={{ background: '#E2E8F0', borderRadius: 3, height: 5, overflow: 'hidden' }}>
                                  <div style={{ width: `${sw}%`, height: '100%', background: g.color + 'BB', borderRadius: 3, transition: 'width 400ms ease' }} />
                                </div>
                              </div>
                            )
                          })
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="bg-white rounded-xl" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)', padding: '20px 20px 16px', marginBottom: 20 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', margin: '0 0 4px' }}>Modalidade</p>
            <p style={{ fontSize: 11, color: 'var(--text-subtle)', margin: '0 0 16px' }}>Captações, vendas e conversão por tipo de plano</p>
            {modalidades.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>Nenhum dado de modalidade neste período</p>
            ) : (
              (() => {
                const maxModCap = modalidades.reduce((m, x) => Math.max(m, x.captacoes), 1)
                return modalidades.map(m => {
                  const barW = Math.max((m.captacoes / maxModCap) * 100, 2)
                  return (
                    <div key={m.modalidade} style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }}>{m.modalidade}</span>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                          <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>{m.captacoes} captações</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#10B981' }}>{m.vendas} vendas</span>
                          <span style={{ fontSize: 11, color: 'var(--text-subtle)', minWidth: 34, textAlign: 'right' }}>{m.conversao}%</span>
                        </div>
                      </div>
                      <div style={{ background: '#F1F5F9', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                        <div style={{ width: `${barW}%`, height: '100%', background: '#3B82F6', borderRadius: 4, transition: 'width 400ms ease' }} />
                      </div>
                    </div>
                  )
                })
              })()
            )}
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
      {activeTab === 'Pipeline' && <PipelineTab dateFrom={dateFrom} dateTo={dateTo} selectedSources={selectedSources} teamParam={teamParam} />}

      {activeTab === 'Performance' && <PerformanceTab dateFrom={dateFrom} dateTo={dateTo} teamParam={teamParam} />}

      {activeTab === 'Projeção' && <ProjecaoTab />}

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
                          <button key={item.key} onClick={() => {
                              const newPath = [...drillPath, item.key]
                              setDrillPath(newPath)
                              if (drillTipo === 'vendas' && newPath.length === 2) {
                                const newFiltered = filterDrill(drillRows, newPath)
                                const origins = [...new Set(newFiltered.map(r => r.origem))]
                                setSelectedStage('__ALL__')
                                setContractsLoading(true)
                                const params = new URLSearchParams({ month, tipo: drillTipo })
                                if (origins.length > 0) params.set('origens', origins.join(','))
                                if (teamParam) params.set('team', teamParam)
                                api.get<ContractItem[]>(`/api/v1/gestao-comercial/receita-contratos?${params}`)
                                  .then(r => setContracts(r.data)).catch(() => setContracts([]))
                                  .finally(() => setContractsLoading(false))
                              }
                            }}
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
                    <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px' }}>Contratos{selectedStage && selectedStage !== '__ALL__' ? ` — ${stageLabel(selectedStage)}` : ''}</p>
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

      {/* ── STAGE POPUP ── */}
      {stagePopup && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 299 }} onClick={() => setStagePopup(null)} />
          <div style={{ position: 'fixed', left: stagePopup.x, top: stagePopup.y, zIndex: 300, background: 'var(--bg-card,#fff)', borderRadius: 14, padding: '16px 18px', boxShadow: '0 8px 32px rgba(0,0,0,0.18)', border: '1px solid var(--border)', minWidth: 240, maxWidth: 300, maxHeight: 340, overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{stagePopup.stage}</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                {!stagePopup.loading && <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-subtle)', padding: '2px 8px', borderRadius: 99, whiteSpace: 'nowrap' }}>{stagePopup.leads.length} lead{stagePopup.leads.length !== 1 ? 's' : ''}</span>}
                <button
                  onClick={() => goToLeadsReport(stagePopup.convPoint, stagePopup.origens)}
                  title="Ver no Relatório de Leads"
                  style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-subtle)', padding: 2, opacity: 0.6, transition: 'opacity 150ms, color 150ms' }}
                  onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = '#2563EB' }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = '0.6'; e.currentTarget.style.color = 'var(--text-subtle)' }}
                >
                  <ArrowUpRight size={14} />
                </button>
              </div>
            </div>
            {stagePopup.loading ? (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>Carregando...</p>
            ) : stagePopup.leads.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>Nenhum lead encontrado</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {stagePopup.leads.map((l, i) => (
                  <div key={i} style={{ padding: '8px 12px', background: 'var(--bg-subtle,#F8FAFC)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }}>{l.nome}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>{l.status}</p>
                    {l.valor != null && <p style={{ margin: '2px 0 0', fontSize: 11, color: '#059669', fontWeight: 600 }}>{l.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 })}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {showComparison && <ComparisonModal onClose={() => setShowComparison(false)} />}
    </div>
  )
}
