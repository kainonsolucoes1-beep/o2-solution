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
} from 'lucide-react'
import api from '../api'

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
function PipelineTab({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const navigate = useNavigate()

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
        {/* Filtro de origens */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end' }}>
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
// Performance sub-tab component
// ════════════════════════════════════════════════════════════════════════════
interface OperadorPerf {
  operador: string
  captacoes: number
  agendamentos: number
  propostas: number
  vendas: number
  receita: number
  conversao: number
  ranking: number
}

const META_KEY  = (month: string) => `perf_meta_${month}`
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
      acc.captacoes    += r.captacoes
      acc.agendamentos += r.agendamentos
      acc.propostas    += r.propostas
      acc.vendas       += r.vendas
      acc.receita       += r.receita
    } else {
      map.set(key, { ...r, operador: key })
    }
  }
  return [...map.values()].map(r => ({
    ...r,
    conversao: r.captacoes > 0 ? +(r.vendas / r.captacoes * 100).toFixed(1) : 0,
  }))
}

const ExpandToggle = ({ expanded, hidden, onClick }: { expanded: boolean; hidden: number; onClick: () => void }) => (
  <button
    onClick={onClick}
    style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', padding: 0 }}
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

function PerformanceTab({ month }: { month: string }) {
  const [data, setData]             = useState<OperadorPerf[]>([])
  const [prevData, setPrevData]     = useState<OperadorPerf[]>([])
  const [loading, setLoading]       = useState(true)
  const [metaVendas, setMetaVendas] = useState(10)
  const [expConv, setExpConv]       = useState(false)
  const [perfPopup, setPerfPopup]           = useState<string | null>(null)
  const [perfLeads, setPerfLeads]           = useState<PerfLead[]>([])
  const [perfLoading, setPerfLoading]       = useState(false)
  const [perfStatusFilter, setPerfStatusFilter] = useState<string | null>(null)

  function openPerfModal(title: string, origens?: string, statusGroup?: string) {
    setPerfPopup(title); setPerfLeads([]); setPerfLoading(true); setPerfStatusFilter(null)
    const p = new URLSearchParams({ month })
    if (origens) p.set('origens', origens)
    if (statusGroup) p.set('status_group', statusGroup)
    api.get<PerfLead[]>(`/api/v1/kpis/leads-conv-point?${p}`)
      .then(r => setPerfLeads(r.data)).catch(() => setPerfLeads([]))
      .finally(() => setPerfLoading(false))
  }

  useEffect(() => {
    if (!perfPopup) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setPerfPopup(null) }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [perfPopup])
  const [expRec, setExpRec]         = useState(false)
  const [expTable, setExpTable]     = useState(false)

  useEffect(() => {
    try { const p = JSON.parse(localStorage.getItem(META_KEY(month)) ?? '{}'); setMetaVendas(p.vendas ?? 10) } catch {}
  }, [month])
  useEffect(() => {
    localStorage.setItem(META_KEY(month), JSON.stringify({ vendas: metaVendas }))
  }, [month, metaVendas])

  useEffect(() => {
    setLoading(true)
    Promise.all([
      api.get<OperadorPerf[]>(`/api/v1/gestao-comercial/performance-operadores?month=${month}`),
      api.get<OperadorPerf[]>(`/api/v1/gestao-comercial/performance-operadores?month=${prevMonthStr(month)}`),
    ])
      .then(([cur, prv]) => { setData(mergeO2Operadores(cur.data)); setPrevData(mergeO2Operadores(prv.data)) })
      .catch(() => { setData([]); setPrevData([]) })
      .finally(() => setLoading(false))
  }, [month])

  // ── derivados ──────────────────────────────────────────────────────────
  const totalCap      = data.reduce((s, r) => s + r.captacoes, 0)
  const totalVendas   = data.reduce((s, r) => s + r.vendas, 0)
  const totalRec      = data.reduce((s, r) => s + r.receita, 0)
  const avgConv       = totalCap > 0 ? +(totalVendas / totalCap * 100).toFixed(1) : 0
  const metaAtingidos = data.filter(r => r.vendas >= metaVendas).length
  const prevVendas    = prevData.reduce((s, r) => s + r.vendas, 0)
  const avgTicket     = totalVendas > 0 ? totalRec / totalVendas : 0

  const qualified  = data.filter(r => r.captacoes >= 3)
  const byReceita  = [...data].sort((a, b) => b.receita - a.receita)
  const byConv     = [...qualified].sort((a, b) => b.conversao - a.conversao)
  const byVendas   = [...data].sort((a, b) => b.vendas - a.vendas)
  const atencao    = [...qualified].sort((a, b) => a.conversao - b.conversao)[0] ?? null
  const maxConv    = Math.max(...data.map(r => r.conversao), 1)
  const maxRec     = Math.max(...data.map(r => r.receita), 1)

  // ── insights ──────────────────────────────────────────────────────────
  const insights = useMemo(() => {
    if (!data.length) return []
    const list: { type: 'ok' | 'warn'; text: string }[] = []
    // top vendedor — só quando há primeiro lugar isolado (sem empate)
    if (byVendas[0] && totalVendas > 0 && byVendas[0].vendas > (byVendas[1]?.vendas ?? 0)) {
      const pct = Math.round(byVendas[0].vendas / totalVendas * 100)
      list.push({ type: 'ok', text: `${byVendas[0].operador} fechou ${pct}% das vendas da equipe neste mês.` })
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
    if (prevVendas > 0) {
      const diff = Math.round((totalVendas - prevVendas) / prevVendas * 100)
      list.push({ type: diff >= 0 ? 'ok' : 'warn', text: `Equipe está ${Math.abs(diff)}% ${diff >= 0 ? 'acima' : 'abaixo'} do mês anterior em vendas (${prevVendas} → ${totalVendas}).` })
    }
    return list
  }, [data, byVendas, atencao, avgConv, avgTicket, byConv, prevVendas, totalVendas])

  const secLabel = (txt: string) => (
    <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 14px' }}>{txt}</p>
  )
  const inputSt: React.CSSProperties = {
    background: 'var(--bg-input)', border: '1px solid var(--border-in)',
    borderRadius: 8, padding: '6px 10px', fontSize: 13, color: 'var(--text-2)',
  }

  if (loading) return <p style={{ padding: '48px 0', textAlign: 'center', fontSize: 13, color: 'var(--text-subtle)' }}>Carregando...</p>
  if (!data.length) return <p style={{ padding: '48px 0', textAlign: 'center', fontSize: 13, color: 'var(--text-subtle)' }}>Nenhum dado para o período.</p>

  return (
    <>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>

      {/* controles */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Meta Vendas / operador</p>
          <input type="number" min={0} value={metaVendas} onChange={e => setMetaVendas(Math.max(0, +e.target.value))} style={{ ...inputSt, width: 72, textAlign: 'center' }} />
        </div>
      </div>

      {/* ── LINHA 1: Resumo da equipe ── */}
      <div>
        {secLabel('Resumo da Equipe')}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14 }}>
          {([
            { label: 'Captações', val: String(totalCap),      color: '#3B82F6', bg: '#EFF6FF', sub: null },
            { label: 'Vendas',    val: String(totalVendas),   color: '#10B981', bg: '#ECFDF5', sub: null },
            { label: 'Conversão', val: `${avgConv}%`,         color: '#7C3AED', bg: '#F5F3FF', sub: 'captações → vendas' },
            { label: 'Receita',   val: fmtBrl(totalRec),      color: '#059669', bg: '#ECFDF5', sub: null },
            {
              label: 'Meta',
              val: `${metaAtingidos}/${data.length}`,
              color: metaAtingidos === data.length ? '#059669' : metaAtingidos > 0 ? '#D97706' : '#EF4444',
              bg:    metaAtingidos === data.length ? '#ECFDF5' : metaAtingidos > 0 ? '#FFFBEB' : '#FEF2F2',
              sub: 'operadores atingiram',
            },
          ] as const).map(c => {
            const clickable = c.label === 'Captações' || c.label === 'Vendas' || c.label === 'Receita'
            const sg = c.label === 'Vendas' || c.label === 'Receita' ? 'venda' : undefined
            return (
              <div key={c.label}
                onClick={clickable ? () => openPerfModal(c.label, undefined, sg) : undefined}
                style={{ background: c.bg, borderRadius: 14, padding: '20px', border: `1px solid ${c.color}22`, cursor: clickable ? 'pointer' : 'default', transition: clickable ? 'transform 120ms, box-shadow 120ms' : undefined }}
                onMouseEnter={e => { if (clickable) { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = `0 4px 14px ${c.color}33` } }}
                onMouseLeave={e => { if (clickable) { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = '' } }}
              >
                <p style={{ fontSize: 10, fontWeight: 700, color: c.color, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>{c.label}</p>
                <p style={{ fontSize: 28, fontWeight: 800, color: c.color, margin: 0, lineHeight: 1 }}>{c.val}</p>
                {c.sub && <p style={{ fontSize: 10, color: c.color, opacity: 0.75, marginTop: 5 }}>{c.sub}</p>}
                {clickable && <p style={{ fontSize: 10, color: c.color, opacity: 0.6, marginTop: 6, fontWeight: 600 }}>Ver leads →</p>}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── LINHA 2: Destaques ── */}
      <div>
        {secLabel('Quem Está se Destacando')}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
          {byReceita[0] && (
            <div onClick={() => openPerfModal(`Leads de ${byReceita[0].operador}`, byReceita[0].operador)} style={{ background: 'linear-gradient(135deg,#ECFDF5,#D1FAE5)', borderRadius: 14, padding: 20, border: '1px solid #6EE7B7', cursor: 'pointer', transition: 'transform 120ms, box-shadow 120ms' }} onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 14px #6EE7B755' }} onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = '' }}>
              <p style={{ fontSize: 11, color: '#059669', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', margin: '0 0 8px' }}>🏆 Maior Receita</p>
              <p style={{ fontSize: 16, fontWeight: 700, color: '#065F46', margin: '0 0 10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{byReceita[0].operador}</p>
              <p style={{ fontSize: 28, fontWeight: 800, color: '#059669', margin: '0 0 4px', lineHeight: 1 }}>{fmtBrl(byReceita[0].receita)}</p>
              <p style={{ fontSize: 11, color: '#047857' }}>{byReceita[0].vendas} vendas · {byReceita[0].conversao}% conv.</p>
            </div>
          )}
          {byConv[0] && (
            <div onClick={() => openPerfModal(`Leads de ${byConv[0].operador}`, byConv[0].operador)} style={{ background: 'linear-gradient(135deg,#F5F3FF,#EDE9FE)', borderRadius: 14, padding: 20, border: '1px solid #C4B5FD', cursor: 'pointer', transition: 'transform 120ms, box-shadow 120ms' }} onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 14px #C4B5FD55' }} onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = '' }}>
              <p style={{ fontSize: 11, color: '#7C3AED', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', margin: '0 0 8px' }}>🎯 Maior Conversão</p>
              <p style={{ fontSize: 16, fontWeight: 700, color: '#4C1D95', margin: '0 0 10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{byConv[0].operador}</p>
              <p style={{ fontSize: 36, fontWeight: 800, color: '#7C3AED', margin: '0 0 4px', lineHeight: 1 }}>{byConv[0].conversao}%</p>
              <p style={{ fontSize: 11, color: '#6D28D9' }}>{byConv[0].captacoes} captações · {byConv[0].vendas} vendas</p>
            </div>
          )}
          {byVendas[0] && (
            <div onClick={() => openPerfModal(`Leads de ${byVendas[0].operador}`, byVendas[0].operador)} style={{ background: 'linear-gradient(135deg,#EFF6FF,#DBEAFE)', borderRadius: 14, padding: 20, border: '1px solid #93C5FD', cursor: 'pointer', transition: 'transform 120ms, box-shadow 120ms' }} onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 14px #93C5FD55' }} onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = '' }}>
              <p style={{ fontSize: 11, color: '#2563EB', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', margin: '0 0 8px' }}>💼 Mais Vendas</p>
              <p style={{ fontSize: 16, fontWeight: 700, color: '#1E3A8A', margin: '0 0 10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{byVendas[0].operador}</p>
              <p style={{ fontSize: 36, fontWeight: 800, color: '#2563EB', margin: '0 0 4px', lineHeight: 1 }}>{byVendas[0].vendas}</p>
              <p style={{ fontSize: 11, color: '#1D4ED8' }}>{fmtBrl(byVendas[0].receita)} em receita</p>
            </div>
          )}
          {atencao ? (
            <div onClick={() => openPerfModal(`Leads de ${atencao.operador}`, atencao.operador)} style={{ background: 'linear-gradient(135deg,#FFFBEB,#FEF3C7)', borderRadius: 14, padding: 20, border: '1px solid #FCD34D', cursor: 'pointer', transition: 'transform 120ms, box-shadow 120ms' }} onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 14px #FCD34D55' }} onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = '' }}>
              <p style={{ fontSize: 11, color: '#D97706', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', margin: '0 0 8px' }}>⚠️ Precisa de Atenção</p>
              <p style={{ fontSize: 16, fontWeight: 700, color: '#78350F', margin: '0 0 10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{atencao.operador}</p>
              <p style={{ fontSize: 36, fontWeight: 800, color: '#D97706', margin: '0 0 4px', lineHeight: 1 }}>{atencao.conversao}%</p>
              <p style={{ fontSize: 11, color: '#92400E' }}>{atencao.captacoes} captações · {atencao.vendas} vendas</p>
            </div>
          ) : (
            <div style={{ background: '#F0FDF4', borderRadius: 14, padding: 20, border: '1px solid #BBF7D0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <p style={{ fontSize: 13, color: '#166534', textAlign: 'center', fontWeight: 600 }}>✅ Todos acima da média</p>
            </div>
          )}
        </div>
      </div>

      {/* ── LINHA 3: Comparativo ── */}
      <div>
        {secLabel('Comparativo da Equipe')}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

          <div style={{ background: 'var(--bg-card)', borderRadius: 14, padding: '20px 24px', border: '1px solid var(--border)' }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', margin: '0 0 18px' }}>Conversão por Operador</p>
            {(() => {
              const sorted = [...data].sort((a, b) => b.conversao - a.conversao)
              const rows = expConv ? sorted : sorted.slice(0, 3)
              return (
                <>
                  {rows.map(r => (
                    <div key={r.operador} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 9 }}>
                      <span style={{ width: 86, fontSize: 12, color: 'var(--text-2)', textAlign: 'right', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.operador}</span>
                      <div style={{ flex: 1, background: 'var(--bg-subtle)', borderRadius: 6, height: 22, overflow: 'hidden' }}>
                        <div style={{ width: `${maxConv > 0 ? r.conversao / maxConv * 100 : 0}%`, minWidth: r.conversao > 0 ? 40 : 0, height: '100%', borderRadius: 6, background: convColor(r.conversao), display: 'flex', alignItems: 'center', paddingLeft: 8, transition: 'width 600ms ease' }}>
                          {r.conversao > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{r.conversao}%</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                  {sorted.length > 3 && <ExpandToggle expanded={expConv} hidden={sorted.length - 3} onClick={() => setExpConv(v => !v)} />}
                </>
              )
            })()}
          </div>

          <div style={{ background: 'var(--bg-card)', borderRadius: 14, padding: '20px 24px', border: '1px solid var(--border)' }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', margin: '0 0 18px' }}>Receita por Operador</p>
            {(() => {
              const sorted = [...data].sort((a, b) => b.receita - a.receita)
              const rows = expRec ? sorted : sorted.slice(0, 3)
              return (
                <>
                  {rows.map(r => (
                    <div key={r.operador} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 9 }}>
                      <span style={{ width: 86, fontSize: 12, color: 'var(--text-2)', textAlign: 'right', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.operador}</span>
                      <div style={{ flex: 1, background: 'var(--bg-subtle)', borderRadius: 6, height: 22, overflow: 'hidden' }}>
                        <div style={{ width: `${maxRec > 0 ? r.receita / maxRec * 100 : 0}%`, minWidth: r.receita > 0 ? 40 : 0, height: '100%', borderRadius: 6, background: '#059669', display: 'flex', alignItems: 'center', paddingLeft: 8, transition: 'width 600ms ease' }}>
                          {r.receita > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>{fmtBrl(r.receita)}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                  {sorted.length > 3 && <ExpandToggle expanded={expRec} hidden={sorted.length - 3} onClick={() => setExpRec(v => !v)} />}
                </>
              )
            })()}
          </div>
        </div>
      </div>

      {/* ── LINHA 4: Tabela ── */}
      <div>
        {secLabel('Detalhamento por Operador')}
        <div style={{ background: 'var(--bg-card)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {(['Operador', 'Conv.', 'Receita', 'Vendas', 'Meta', 'Status'] as const).map((h, i) => (
                  <th key={h} style={{ padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em', background: '#1E293B', borderBottom: '2px solid #334155', textAlign: i === 0 ? 'left' : 'center' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(() => {
                const sorted = [...data].sort((a, b) => b.vendas - a.vendas)
                const rows = expTable ? sorted : sorted.slice(0, 3)
                return rows.map((r, i, arr) => {
                  const metaPct  = metaVendas > 0 ? Math.min(100, Math.round(r.vendas / metaVendas * 100)) : 0
                  const metaClr  = metaPct >= 100 ? '#059669' : metaPct >= 50 ? '#F59E0B' : '#EF4444'
                  const stTxt    = r.conversao >= avgConv * 1.1 ? 'Acima da média' : r.conversao >= avgConv * 0.9 ? 'Na média' : 'Abaixo da média'
                  const stClr    = r.conversao >= avgConv * 1.1 ? '#059669' : r.conversao >= avgConv * 0.9 ? '#D97706' : '#EF4444'
                  const stBg     = r.conversao >= avgConv * 1.1 ? '#ECFDF5' : r.conversao >= avgConv * 0.9 ? '#FFFBEB' : '#FEF2F2'
                  const td: React.CSSProperties = { padding: '12px 16px', fontSize: 13, color: 'var(--text-2)', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none', background: i % 2 === 1 ? 'var(--bg-subtle)' : 'transparent' }
                  return (
                    <tr key={r.operador}>
                      <td style={{ ...td, fontWeight: 600, color: 'var(--text-1)' }}>{r.operador}</td>
                      <td style={{ ...td, textAlign: 'center', color: convColor(r.conversao), fontWeight: 700 }}>{r.conversao}%</td>
                      <td style={{ ...td, textAlign: 'center' }}>{fmtBrl(r.receita)}</td>
                      <td style={{ ...td, textAlign: 'center', color: '#059669', fontWeight: 700 }}>{r.vendas}</td>
                      <td style={{ ...td, textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                          <div style={{ width: 60, height: 6, background: '#E5E7EB', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ width: `${metaPct}%`, height: '100%', background: metaClr, borderRadius: 4 }} />
                          </div>
                          <span style={{ fontSize: 11, color: metaClr, fontWeight: 600 }}>{r.vendas}/{metaVendas}</span>
                        </div>
                      </td>
                      <td style={{ ...td, textAlign: 'center' }}>
                        <span style={{ background: stBg, color: stClr, fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20 }}>{stTxt}</span>
                      </td>
                    </tr>
                  )
                })
              })()}
            </tbody>
          </table>
          {data.length > 3 && (
            <div style={{ padding: '10px 16px' }}>
              <ExpandToggle expanded={expTable} hidden={data.length - 3} onClick={() => setExpTable(v => !v)} />
            </div>
          )}
        </div>
      </div>

      {/* ── LINHA 5: Insights ── */}
      {insights.length > 0 && (
        <div>
          {secLabel('Insights')}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {insights.map((ins, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, background: ins.type === 'ok' ? '#F0FDF4' : '#FFFBEB', border: `1px solid ${ins.type === 'ok' ? '#BBF7D0' : '#FDE68A'}`, borderRadius: 10, padding: '12px 16px' }}>
                <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{ins.type === 'ok' ? '✅' : '⚠️'}</span>
                <span style={{ fontSize: 13, color: ins.type === 'ok' ? '#166534' : '#92400E', lineHeight: 1.5 }}>{ins.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>

      {/* Modal: Leads Performance */}
      {perfPopup && (
        <div onClick={() => setPerfPopup(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-card,#fff)', borderRadius: 18, width: '100%', maxWidth: 560, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ padding: '20px 24px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>{perfPopup}</p>
              <button onClick={() => setPerfPopup(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-subtle)', padding: 4 }}><X size={18} /></button>
            </div>
            <div style={{ padding: '16px 24px 24px' }}>
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
function MonthPanel({ month }: { month: string }) {
  const [kpis, setKpis]       = useState<Kpis | null>(null)
  const [diario, setDiario]   = useState<DiarioItem[]>([])
  const [origens, setOrigens] = useState<OrigemItem[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedGrupo, setExpandedGrupo] = useState<string | null>(null)
  const [orgConvPoints, setOrgConvPoints] = useState<{conversion_point: string, count: number, pct: number}[]>([])
  const [orgConvPointsLoading, setOrgConvPointsLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      api.get<Kpis>(`/api/v1/gestao-comercial/visao-geral?month=${month}`),
      api.get<DiarioItem[]>(`/api/v1/gestao-comercial/evolucao-diaria?month=${month}`),
      api.get<OrigemItem[]>(`/api/v1/gestao-comercial/origens-captacao?month=${month}`),
    ]).then(([k, d, o]) => { setKpis(k.data); setDiario(d.data); setOrigens(o.data) })
      .catch(() => {}).finally(() => setLoading(false))
  }, [month])

  const grupos = groupOrigens(origens)
  const maxCap = grupos.reduce((m, g) => Math.max(m, g.captacoes), 1)
  const monthLabel = new Date(month + '-01T12:00:00').toLocaleString('pt-BR', { month: 'long', year: 'numeric' })

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

function ComparisonModal({ onClose }: { onClose: () => void }) {
  const [monthA, setMonthA] = useState(nowMonth())
  const [monthB, setMonthB] = useState(prevMonthStr(nowMonth()))

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-card, #fff)', borderRadius: 16, width: '100%', maxWidth: 1100, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--bg-card, #fff)', zIndex: 1 }}>
          <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Comparação entre meses</p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
            <X size={20} />
          </button>
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
          <MonthPanel month={monthA} />
          <div style={{ width: 1, background: 'var(--border)', flexShrink: 0 }} />
          <MonthPanel month={monthB} />
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// Main component
// ════════════════════════════════════════════════════════════════════════════
export default function GestaoComercial() {
  const [activeTab, setActiveTab]     = useState<Tab>('Visão Geral')
  const [dateFrom, setDateFrom]       = useState(_gcMonthStart)
  const [dateTo, setDateTo]           = useState(_gcToday)
  const [filterOpen, setFilterOpen]   = useState(false)
  const [filterMode, setFilterMode]   = useState<'range' | 'month'>('range')
  const [showComparison, setShowComparison] = useState(false)
  const month = dateFrom.slice(0, 7)


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
  const [diario, setDiario]   = useState<DiarioItem[]>([])
  const [origens, setOrigens] = useState<OrigemItem[]>([])
  const [mensal, setMensal]   = useState<MensalItem[]>([])
  const [modalidades, setModalidades] = useState<ModalidadeItem[]>([])
  const [loading, setLoading] = useState(false)

  const [expandedGrupo, setExpandedGrupo] = useState<string | null>(null)

  const [stagePopup, setStagePopup]               = useState<{stage: string, leads: PerfLead[], loading: boolean, x: number, y: number} | null>(null)
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
    Promise.all([
      api.get<Kpis>(`/api/v1/gestao-comercial/visao-geral?month=${month}`),
      api.get<DiarioItem[]>(`/api/v1/gestao-comercial/evolucao-diaria?month=${month}`),
      api.get<OrigemItem[]>(`/api/v1/gestao-comercial/origens-captacao?month=${month}`),
      api.get<MensalItem[]>('/api/v1/gestao-comercial/comparativo-mensal'),
      api.get<ModalidadeItem[]>(`/api/v1/gestao-comercial/modalidades-captacao?month=${month}`),
    ]).then(([k, d, o, m, mod]) => {
      setKpis(k.data); setDiario(d.data); setOrigens(o.data); setMensal(m.data); setModalidades(mod.data)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [activeTab, month])

  function openDrill(tipo: DrillTipo) {
    setDrillTipo(tipo); setDrillPath([]); setSelectedStage(null)
    setShowDrill(true); setDrillLoading(true); setDrillRows([])
    api.get<DrillRawRow[]>(`/api/v1/gestao-comercial/receita-potencial-drill?month=${month}&tipo=${tipo}`)
      .then(r => setDrillRows(normalizeDrill(r.data))).catch(() => {}).finally(() => setDrillLoading(false))
  }

  function openStagePopup(label: string, e: React.MouseEvent, convPoint?: string) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const x = rect.right + 290 < window.innerWidth ? rect.right + 10 : rect.left - 290
    const y = Math.min(rect.top, window.innerHeight - 320)
    setStagePopup({ stage: label, leads: [], loading: true, x, y })
    const p = new URLSearchParams({ month })
    if (convPoint) {
      p.set('conv_point', convPoint)
    } else {
      const origens = label === 'o2 Solution' ? [...O2_NAMES].join(',') : label
      p.set('origens', origens)
    }
    api.get<PerfLead[]>(`/api/v1/kpis/leads-conv-point?${p}`)
      .then(r => setStagePopup(prev => prev ? { ...prev, leads: r.data, loading: false } : null))
      .catch(() => setStagePopup(prev => prev ? { ...prev, leads: [], loading: false } : null))
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

      {/* ── FILTRO GLOBAL ── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 8, position: 'relative' }}>
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

            </div>
          </>
        )}
      </div>

      {/* ── VISÃO GERAL ── */}
      {activeTab === 'Visão Geral' && (
        <div>

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
                    <button onClick={() => {
                      const isOpening = expandedGrupo !== g.nome
                      setExpandedGrupo(isOpening ? g.nome : null); setStagePopup(null)
                      if (isOpening && g.nome === 'Orgânico') {
                        setOrgConvPoints([]); setOrgConvPointsLoading(true)
                        const origens = g.subs.map(s => s.nome).join(',')
                        const p = new URLSearchParams({ month })
                        if (origens) p.set('origens', origens)
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
      {activeTab === 'Pipeline' && <PipelineTab dateFrom={dateFrom} dateTo={dateTo} />}

      {activeTab === 'Performance' && <PerformanceTab month={month} />}

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
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{stagePopup.stage}</p>
              {!stagePopup.loading && <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-subtle)', padding: '2px 8px', borderRadius: 99, whiteSpace: 'nowrap', flexShrink: 0 }}>{stagePopup.leads.length} lead{stagePopup.leads.length !== 1 ? 's' : ''}</span>}
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
