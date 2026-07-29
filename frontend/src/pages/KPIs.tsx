import { useEffect, useState } from 'react'
import { TrendingUp, ChevronDown, ChevronRight, AlertTriangle, X, ShieldCheck, ShieldX, Users, Trophy, BarChart3, ArrowLeftRight, UserRoundSearch, Building2, Headset, Globe, Cake, HeartPulse, ArrowUp, ArrowDown, type LucideIcon } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, LineChart, Line, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import api from '../api'

interface BreakdownItem {
  label: string
  captacoes: number
  vendas: number
  cancelados: number
  conversao: number
  _qFonte?: string  // organic sub: label is an origin, not conv_point
}

interface LeadVenda {
  nome: string
  valor: number | null
  data: string | null
}

interface FonteData {
  fonte: string
  captacoes: number
  vendas: number
  cancelados: number
  conversao: number
  breakdown: BreakdownItem[]
}

interface AgeBand {
  faixa: string
  captacoes: number
  vendas: number
  cancelados: number
  conversao: number
  pct_cancelamento: number
}

interface BaseStat {
  base: string
  captacoes: number
  vendas: number
  cancelados: number
  conversao: number
  pct_cancelamento: number
}

interface BaseDetalhe {
  base: string
  captacoes: number
  cancelados: number
  base_liquida: number
  vendas: number
  conversao: number
  pct_cancelamento: number
  receita_potencial: number
  ticket_medio: number
  modalidades: { nome: string; count: number; pct: number }[]
  plano: { possui: number; nao_possui: number; sem_informacao: number; pct_possui: number; pct_nao_possui: number }
}

interface ConvPointDetalhe {
  conv_point: string
  captacoes: number
  cancelados: number
  base_liquida: number
  vendas: number
  conversao: number
  pct_perda: number
  receita_potencial: number
  ticket_medio: number
  modalidades: { nome: string; count: number; pct: number }[]
  plano: { possui: number; nao_possui: number; sem_informacao: number; pct_possui: number; pct_nao_possui: number }
}

interface SdrDetalhe {
  nome: string
  captacoes: number
  cancelados: number
  base_liquida: number
  vendas: number
  conversao: number
  pct_perda: number
  receita_potencial: number
  ticket_medio: number
  modalidades: { nome: string; count: number; pct: number }[]
  plano: { possui: number; nao_possui: number; sem_informacao: number; pct_possui: number; pct_nao_possui: number }
}

interface PlanoStat {
  nome: string
  captacoes: number
  vendas: number
  cancelados: number
  conversao: number
}

interface PlanoSaudeData {
  com_informacao: number
  sem_informacao: number
  possui_plano: number
  nao_possui_plano: number
  pct_possui: number
  pct_nao_possui: number
  operadoras: PlanoStat[]
}

interface OrgLead {
  nome: string
  origem?: string
  status: string
  valor: number | null
  tipo: 'venda' | 'perda' | 'ativo'
}

const CHART_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899']
const MEDALS = ['🥇', '🥈', '🥉']

const SDR_NAMES = new Set([
  'isaac', 'julia', 'leticia', 'maria eduarda', 'anny', 'emily', 'emilly',
  'pedro', 'lucas', 'guilherme', 'lucascardoso', 'lucas cardoso', 'rodolfo', 'discadora',
  'gabrieli', 'gabrielli', 'kauany', 'kauanny', 'clara', 'o2 solution',
  'lucas carvalho', 'lucascarvalho', 'thaynara',
])

const ORGANIC_SUB_NAMES = new Set(['chatgpt.com', 'site'])
const O2_MEMBER_NAMES  = new Set(['clara', 'maria eduarda', 'gabrieli', 'kauany'])

const isSdr        = (fonte: string) => SDR_NAMES.has(fonte.toLowerCase())
const isOrganicSub = (fonte: string) => ORGANIC_SUB_NAMES.has(fonte.toLowerCase())
const isO2Member   = (fonte: string) => O2_MEMBER_NAMES.has(fonte.toLowerCase())
const isO2Self     = (fonte: string) => fonte.toLowerCase() === 'o2 solution'

function aggregateSdr(rows: FonteData[]): FonteData {
  const cap = rows.reduce((s, r) => s + r.captacoes, 0)
  const ven = rows.reduce((s, r) => s + r.vendas, 0)
  const can = rows.reduce((s, r) => s + r.cancelados, 0)
  return { fonte: 'SDR', captacoes: cap, vendas: ven, cancelados: can, conversao: cap > 0 ? Math.round(ven / cap * 1000) / 10 : 0, breakdown: [] }
}

function aggregateO2(rows: FonteData[]): FonteData {
  const cap = rows.reduce((s, r) => s + r.captacoes, 0)
  const ven = rows.reduce((s, r) => s + r.vendas, 0)
  const can = rows.reduce((s, r) => s + r.cancelados, 0)
  return { fonte: 'O2 Solution', captacoes: cap, vendas: ven, cancelados: can, conversao: cap > 0 ? Math.round(ven / cap * 1000) / 10 : 0, breakdown: [] }
}

interface PopoverData {
  label: string
  captacoes: number
  vendas: number
  cancelados: number
  conversao: number
  queryFonte?: string
  queryConvPoint?: string
  queryRenutrucao?: boolean
}

function card(bg: string, border: string): React.CSSProperties {
  return { background: bg, borderRadius: 12, padding: '20px 24px', border: `1px solid ${border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }
}

// Identidade visual por indicador: mesmo ícone/cor usado no card fechado e nos destaques internos
const SECTION_META = {
  bases:       { color: '#2563EB', bg: '#EFF6FF', icon: Building2 },
  sdr:         { color: '#7C3AED', bg: '#F5F3FF', icon: Headset },
  organico:    { color: '#059669', bg: '#ECFDF5', icon: Globe },
  idades:      { color: '#D97706', bg: '#FFFBEB', icon: Cake },
  plano_saude: { color: '#DB2777', bg: '#FDF2F8', icon: HeartPulse },
} as const

function SectionIcon({ section }: { section: keyof typeof SECTION_META }) {
  const { color, bg, icon: Icon } = SECTION_META[section]
  return (
    <div style={{ width: 40, height: 40, borderRadius: 11, background: bg, color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Icon size={19} />
    </div>
  )
}

function prevMonthOf(m: string): string {
  const [y, mo] = m.split('-').map(Number)
  const d = new Date(y, mo - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

interface HeroTrendProps {
  curr: number
  prev: number | null
  prevLabel?: string
  mode?: 'pct' | 'pp'
  invert?: boolean // quando subir é ruim (ex: cancelamentos)
}
function HeroTrend({ curr, prev, prevLabel, mode = 'pct', invert = false }: HeroTrendProps) {
  if (prev === null) return <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>sem dado do mês anterior</div>
  const isFlat = curr === prev
  const compareLine = <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', marginTop: 2 }}>vs mês anterior ({prevLabel ?? prev})</div>
  if (isFlat) return (
    <div>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)' }}>Estável</span>
      {compareLine}
    </div>
  )
  const isUp = curr > prev
  const good = invert ? !isUp : isUp
  const color = good ? '#059669' : '#DC2626'
  const Icon = isUp ? ArrowUp : ArrowDown
  const label = mode === 'pp'
    ? `${isUp ? '+' : ''}${Math.round((curr - prev) * 10) / 10}pp`
    : prev === 0 ? '+100%' : `${isUp ? '+' : ''}${Math.round(((curr - prev) / prev) * 1000) / 10}%`
  return (
    <div>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11.5, fontWeight: 700, color }}>
        <Icon size={11} />{label}
      </span>
      {compareLine}
    </div>
  )
}

const UNDER_CONSTRUCTION: boolean = true

export default function KPIs() {
  const navigate = useNavigate()
  const now = new Date()
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const [month, setMonth] = useState(defaultMonth)
  const [data, setData] = useState<FonteData[]>([])
  const [loading, setLoading] = useState(true)
  const [sdrOpen, setSdrOpen] = useState(false)
  const [o2Open, setO2Open] = useState(false)
  const [expandedFontes, setExpandedFontes] = useState<Set<string>>(new Set())
  const toggleFonte = (f: string) => setExpandedFontes(prev => { const s = new Set(prev); s.has(f) ? s.delete(f) : s.add(f); return s })
  const [motivos, setMotivos] = useState<{ reason: string; count: number; pct: number }[]>([])
  const [receitaPotencial, setReceitaPotencial] = useState(0)
  const [popover, setPopover] = useState<PopoverData | null>(null)
  const [popoverLeads, setPopoverLeads] = useState<LeadVenda[] | null>(null)
  const [popoverLeadsLoading, setPopoverLeadsLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('Indicadores Chave')
  const [basesData, setBasesData] = useState<BaseStat[]>([])
  const [basesLoading, setBasesLoading] = useState(true)
  const [openSection, setOpenSection] = useState<string | null>(null)
  const [orgPopup, setOrgPopup] = useState<string | null>(null)
  const [orgLeads, setOrgLeads] = useState<OrgLead[]>([])
  const [orgLeadsLoading, setOrgLeadsLoading] = useState(false)
  const [orgStatusFilter, setOrgStatusFilter] = useState<string | null>(null)
  const [basePopup, setBasePopup] = useState<string | null>(null)
  const [baseLeads, setBaseLeads] = useState<OrgLead[]>([])
  const [baseLeadsLoading, setBaseLeadsLoading] = useState(false)
  const [baseStatusFilter, setBaseStatusFilter] = useState<string | null>(null)
  const [sdrPopup, setSdrPopup] = useState<string | null>(null)
  const [sdrLeads, setSdrLeads] = useState<OrgLead[]>([])
  const [sdrLeadsLoading, setSdrLeadsLoading] = useState(false)
  const [sdrStatusFilter, setSdrStatusFilter] = useState<string | null>(null)
  const [ageBands, setAgeBands] = useState<AgeBand[]>([])
  const [ageBandsLoading, setAgeBandsLoading] = useState(true)
  const [ageSemIdade, setAgeSemIdade] = useState(0)
  const [ageComIdade, setAgeComIdade] = useState(0)
  const [agePopup, setAgePopup] = useState<string | null>(null)
  const [ageLeads, setAgeLeads] = useState<{ nome: string; idade: number; status: string; tipo: 'venda' | 'perda' | 'ativo'; valor: number | null }[]>([])
  const [ageLeadsLoading, setAgeLeadsLoading] = useState(false)
  const [planoSaude, setPlanoSaude] = useState<PlanoSaudeData | null>(null)
  const [planoSaudeLoading, setPlanoSaudeLoading] = useState(true)
  const [planoPopup, setPlanoPopup] = useState<string | null>(null)
  const [planoLeads, setPlanoLeads] = useState<OrgLead[]>([])
  const [planoLeadsLoading, setPlanoLeadsLoading] = useState(false)
  const [baseDrawer, setBaseDrawer] = useState<string | null>(null)
  const [baseDrawerData, setBaseDrawerData] = useState<BaseDetalhe | null>(null)
  const [baseDrawerLoading, setBaseDrawerLoading] = useState(false)
  const [prevSummary, setPrevSummary] = useState<{ cap: number; ven: number; can: number } | null>(null)

  function openBaseDrawer(base: string) {
    setBaseDrawer(base)
    setBaseDrawerData(null)
    setBaseDrawerLoading(true)
    api.get<BaseDetalhe>(`/api/v1/kpis/bases-detalhe?${new URLSearchParams({ month, base })}`)
      .then(r => setBaseDrawerData(r.data))
      .catch(() => setBaseDrawerData(null))
      .finally(() => setBaseDrawerLoading(false))
  }

  const [convPointDrawer, setConvPointDrawer] = useState<string | null>(null)
  const [convPointDrawerData, setConvPointDrawerData] = useState<ConvPointDetalhe | null>(null)
  const [convPointDrawerLoading, setConvPointDrawerLoading] = useState(false)

  function openConvPointDrawer(convPoint: string, origens: string[]) {
    setConvPointDrawer(convPoint)
    setConvPointDrawerData(null)
    setConvPointDrawerLoading(true)
    const qp = new URLSearchParams({ month, conv_point: convPoint })
    if (origens.length > 0) qp.set('origens', origens.join(','))
    api.get<ConvPointDetalhe>(`/api/v1/kpis/conv-point-detalhe?${qp}`)
      .then(r => setConvPointDrawerData(r.data))
      .catch(() => setConvPointDrawerData(null))
      .finally(() => setConvPointDrawerLoading(false))
  }

  const [convCompare, setConvCompare] = useState(false)
  const [convCompareLevel, setConvCompareLevel] = useState<'month' | 'week' | 'day'>('month')
  const [convComparePoint, setConvComparePoint] = useState<string | null>(null)
  const [convCompareDaily, setConvCompareDaily] = useState<{ date: string; dia: number; captacoes: number; vendas: number }[]>([])
  const [convCompareDailyLoading, setConvCompareDailyLoading] = useState(false)
  const [convCompareWeek, setConvCompareWeek] = useState<number | null>(null)

  function openConvPointCompare(convPoint: string, origens: string[]) {
    setConvComparePoint(convPoint)
    setConvCompareLevel('week')
    setConvCompareWeek(null)
    setConvCompareDaily([])
    setConvCompareDailyLoading(true)
    const qp = new URLSearchParams({ month, conv_point: convPoint })
    if (origens.length > 0) qp.set('origens', origens.join(','))
    api.get<{ date: string; dia: number; captacoes: number; vendas: number }[]>(`/api/v1/kpis/conv-point-diario?${qp}`)
      .then(r => setConvCompareDaily(r.data))
      .catch(() => setConvCompareDaily([]))
      .finally(() => setConvCompareDailyLoading(false))
  }

  // no mês corrente, não mostra semanas/dias futuros (ainda sem dados) como se fossem zero
  const convCompareElapsedDaily = month === defaultMonth
    ? convCompareDaily.filter(d => d.dia <= now.getDate())
    : convCompareDaily

  const convCompareWeeks = (() => {
    const weeks = new Map<number, { semana: number; captacoes: number; vendas: number }>()
    for (const d of convCompareElapsedDaily) {
      const w = Math.ceil(d.dia / 7)
      const acc = weeks.get(w) ?? { semana: w, captacoes: 0, vendas: 0 }
      acc.captacoes += d.captacoes
      acc.vendas += d.vendas
      weeks.set(w, acc)
    }
    return [...weeks.values()].sort((a, b) => a.semana - b.semana)
  })()
  const convCompareDays = convCompareWeek === null ? [] : convCompareElapsedDaily.filter(d => Math.ceil(d.dia / 7) === convCompareWeek)

  const [sdrDrawer, setSdrDrawer] = useState<string | null>(null)
  const [sdrDrawerData, setSdrDrawerData] = useState<SdrDetalhe | null>(null)
  const [sdrDrawerLoading, setSdrDrawerLoading] = useState(false)

  function openSdrDrawer(nome: string, origens: string) {
    setSdrDrawer(nome)
    setSdrDrawerData(null)
    setSdrDrawerLoading(true)
    api.get<SdrDetalhe>(`/api/v1/kpis/sdr-detalhe?${new URLSearchParams({ month, nome, origens })}`)
      .then(r => setSdrDrawerData(r.data))
      .catch(() => setSdrDrawerData(null))
      .finally(() => setSdrDrawerLoading(false))
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') { setPopover(null); setOrgPopup(null); setAgePopup(null); setBasePopup(null); setSdrPopup(null); setPlanoPopup(null); setBaseDrawer(null); setConvPointDrawer(null); setSdrDrawer(null); setConvCompare(false) } }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (!popover?.queryFonte) { setPopoverLeads(null); return }
    setPopoverLeadsLoading(true)
    setPopoverLeads(null)
    const params = new URLSearchParams({ month })
    params.set('fonte', popover.queryFonte)
    if (popover.queryConvPoint) params.set('conv_point', popover.queryConvPoint)
    if (popover.queryRenutrucao) params.set('renutrucao', 'true')
    api.get<LeadVenda[]>(`/api/v1/kpis/leads-vendas?${params}`)
      .then(r => setPopoverLeads(r.data))
      .catch(() => setPopoverLeads([]))
      .finally(() => setPopoverLeadsLoading(false))
  }, [popover])

  useEffect(() => {
    setLoading(true)
    api.get<FonteData[]>(`/api/v1/kpis/conversao-fonte?month=${month}`)
      .then(r => setData(r.data))
      .catch(() => setData([]))
      .finally(() => setLoading(false))
    api.get<{ reason: string; count: number; pct: number }[]>(
      `/api/v1/kpis/motivos-cancelamento?month=${month}`
    ).then(r => setMotivos(r.data)).catch(() => {})
    api.get<{ total: number }>(`/api/v1/kpis/receita-potencial?month=${month}`)
      .then(r => setReceitaPotencial(r.data.total)).catch(() => {})
    setBasesLoading(true)
    api.get<BaseStat[]>(`/api/v1/kpis/bases?month=${month}`)
      .then(r => setBasesData(r.data))
      .catch(() => setBasesData([]))
      .finally(() => setBasesLoading(false))
    setAgeBandsLoading(true)
    api.get<{ bands: AgeBand[]; sem_idade: number; com_idade: number }>(`/api/v1/kpis/faixas-etarias?month=${month}`)
      .then(r => { setAgeBands(r.data.bands); setAgeSemIdade(r.data.sem_idade); setAgeComIdade(r.data.com_idade) })
      .catch(() => setAgeBands([]))
      .finally(() => setAgeBandsLoading(false))
    setPlanoSaudeLoading(true)
    api.get<PlanoSaudeData>(`/api/v1/kpis/plano-saude?month=${month}`)
      .then(r => setPlanoSaude(r.data))
      .catch(() => setPlanoSaude(null))
      .finally(() => setPlanoSaudeLoading(false))
    setPrevSummary(null)
    api.get<FonteData[]>(`/api/v1/kpis/conversao-fonte?month=${prevMonthOf(month)}`)
      .then(r => setPrevSummary({
        cap: r.data.reduce((s, d) => s + d.captacoes, 0),
        ven: r.data.reduce((s, d) => s + d.vendas, 0),
        can: r.data.reduce((s, d) => s + d.cancelados, 0),
      }))
      .catch(() => setPrevSummary(null))
  }, [month])

  const sdrRows      = data.filter(d => isSdr(d.fonte))
  const o2MemberRows = sdrRows.filter(r => isO2Member(r.fonte))
  const otherSdrRows = sdrRows.filter(r => !isO2Member(r.fonte) && !isO2Self(r.fonte))
  const organicSubs  = data.filter(d => isOrganicSub(d.fonte))
  const otherRows    = data
    .filter(d => !isSdr(d.fonte) && !isOrganicSub(d.fonte))
    .map(d => {
      if (d.fonte.toLowerCase() === 'orgânico' && organicSubs.length > 0) {
        const subCap = organicSubs.reduce((s, os) => s + os.captacoes, 0)
        const subVen = organicSubs.reduce((s, os) => s + os.vendas, 0)
        const subCan = organicSubs.reduce((s, os) => s + os.cancelados, 0)
        const newCap = d.captacoes + subCap
        const newVen = d.vendas + subVen
        const newCan = d.cancelados + subCan
        return {
          ...d,
          captacoes: newCap,
          vendas: newVen,
          cancelados: newCan,
          conversao: newCap > 0 ? Math.round(newVen / newCap * 1000) / 10 : 0,
          breakdown: [
            ...organicSubs.map(s => ({ label: s.fonte, captacoes: s.captacoes, vendas: s.vendas, cancelados: s.cancelados, conversao: s.conversao, _qFonte: s.fonte })),
            ...d.breakdown,
          ],
        }
      }
      return d
    })
  const sdrAgg = sdrRows.length > 0 ? aggregateSdr(sdrRows) : null
  const o2Agg  = o2MemberRows.length > 0 ? aggregateO2(o2MemberRows) : null

  type RowType = FonteData & { isSdrParent?: boolean; isSdrChild?: boolean; isO2Parent?: boolean; isO2Child?: boolean }
  const allRows: RowType[] = []
  const combined = [
    ...otherRows,
    ...(sdrAgg ? [{ ...sdrAgg, isSdrParent: true }] : []),
  ].sort((a, b) => b.captacoes - a.captacoes)

  for (const row of combined) {
    allRows.push(row)
    if ((row as any).isSdrParent && sdrOpen) {
      const directSdrChildren: RowType[] = otherSdrRows.map(r => ({ ...r, isSdrChild: true }))
      if (o2Agg) directSdrChildren.push({ ...o2Agg, isSdrChild: true, isO2Parent: true })
      directSdrChildren.sort((a, b) => b.captacoes - a.captacoes).forEach(r => {
        allRows.push(r)
        if ((r as any).isO2Parent && o2Open) {
          ;[...o2MemberRows].sort((a, b) => b.captacoes - a.captacoes)
            .forEach(o2r => allRows.push({ ...o2r, isSdrChild: true, isO2Child: true }))
        }
      })
    }
  }

  // Totals from all raw rows (no double-counting)
  const totalCap = data.reduce((s, d) => s + d.captacoes, 0)
  const totalVen = data.reduce((s, d) => s + d.vendas, 0)
  const totalCan = data.reduce((s, d) => s + d.cancelados, 0)
  const taxaConv = totalCap > 0 ? Math.round(totalVen / totalCap * 1000) / 10 : 0
  const pctCan   = totalCap > 0 ? Math.round(totalCan / totalCap * 1000) / 10 : 0

  const melhorFonte = combined.filter(r => r.captacoes >= 3).length > 0
    ? combined.filter(r => r.captacoes >= 3).reduce((best, r) => r.conversao > best.conversao ? r : best)
    : combined.length > 0 ? combined[0] : null

  function fmtBrl(v: number) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
  }

  const funnelRows = combined

  const top5Sdr = [...sdrRows].sort((a, b) => b.captacoes - a.captacoes).slice(0, 5)

  const maxConversao = Math.max(...data.map(d => d.conversao), sdrAgg?.conversao ?? 0, 1)

  const colH: React.CSSProperties = {
    padding: '13px 14px', fontSize: 11, fontWeight: 700,
    color: '#94A3B8', textTransform: 'uppercase',
    letterSpacing: '0.07em', background: '#1E293B',
    borderBottom: '2px solid #334155', textAlign: 'left',
  }

  function renderConversaoBar(conversao: number) {
    const barColor = conversao >= 30 ? '#059669' : conversao >= 15 ? '#F59E0B' : '#3B82F6'
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, height: 8, background: '#F1F5F9', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{
            width: `${(conversao / maxConversao) * 100}%`, height: '100%',
            background: barColor, borderRadius: 4, transition: 'width 400ms ease',
            boxShadow: conversao > 0 ? `0 0 10px ${barColor}99` : 'none',
          }} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', minWidth: 40, textAlign: 'right' }}>{conversao}%</span>
      </div>
    )
  }

  function renderRow(row: RowType, i: number) {
    const isChild      = row.isSdrChild
    const isO2ParentRow = (row as any).isO2Parent
    const isO2ChildRow  = (row as any).isO2Child
    const col: React.CSSProperties = {
      padding: '10px 14px', fontSize: 13, color: 'var(--text-2)',
      borderBottom: '1px solid var(--border)',
      background: isChild ? 'var(--bg-subtle)' : i % 2 === 1 ? 'var(--bg-subtle)' : 'transparent',
    }
    const hasBreakdown = !row.isSdrParent && !isO2ParentRow && row.breakdown?.length > 0
    const breakdownOpen = expandedFontes.has(row.fonte)
    const paddingLeft = isO2ChildRow ? 52 : isChild ? 32 : 14
    const accentColor = row.isSdrParent ? '#3B82F6' : isO2ParentRow ? '#8B5CF6' : isO2ChildRow ? '#A78BFA' : isChild ? '#60A5FA' : row.fonte.toLowerCase().includes('orgân') ? '#10B981' : '#F59E0B'
    // Leaf rows (not aggregate parents) open the popover on click
    const isPopoverRow = !row.isSdrParent && !isO2ParentRow && !(hasBreakdown && !isChild)
    const openPopover = () => setPopover({ label: row.fonte, captacoes: row.captacoes, vendas: row.vendas, cancelados: row.cancelados, conversao: row.conversao, queryFonte: row.fonte })

    return (
      <>
        <tr
          key={isO2ChildRow ? `o2-child-${row.fonte}` : row.isSdrChild ? `sdr-child-${row.fonte}` : row.fonte}
          className="kpis-row"
          onClick={isPopoverRow ? openPopover : undefined}
          style={isPopoverRow ? { cursor: 'pointer' } : undefined}
        >
          <td style={{ ...col, fontWeight: row.isSdrParent ? 700 : isChild ? 400 : 500, color: 'var(--text-1)', paddingLeft, borderLeft: `3px solid ${accentColor}` }}>
            {row.isSdrParent ? (
              <button onClick={() => setSdrOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-1)', fontSize: 13, fontWeight: 700 }}>
                {sdrOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />} SDR
              </button>
            ) : isO2ParentRow ? (
              <button onClick={() => setO2Open(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-1)', fontSize: 13, fontWeight: 400 }}>
                {o2Open ? <ChevronDown size={14} /> : <ChevronRight size={14} />} O2 Solution
              </button>
            ) : hasBreakdown ? (
              <button onClick={e => { e.stopPropagation(); toggleFonte(row.fonte) }} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-1)', fontSize: 13, fontWeight: isChild ? 400 : 500 }}>
                {breakdownOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {row.fonte}
              </button>
            ) : isChild ? (
              <span style={{ color: 'var(--text-2)' }}>{row.fonte}</span>
            ) : row.fonte}
          </td>
          <td style={{ ...col, textAlign: 'right' }}>{row.captacoes}</td>
          <td style={{ ...col, textAlign: 'right', color: '#059669', fontWeight: 600 }}>{row.vendas}</td>
          <td style={{ ...col, textAlign: 'right', color: '#EF4444' }}>{row.cancelados}</td>
          <td style={{ ...col }}>{renderConversaoBar(row.conversao)}</td>
        </tr>
        {hasBreakdown && breakdownOpen && row.breakdown.map(bp => (
          <tr
            key={`bp-${row.fonte}-${bp.label}`}
            className="kpis-bp-row"
            onClick={() => {
              let qFonte: string | undefined, qConvPoint: string | undefined, qRen: boolean | undefined
              if (bp._qFonte !== undefined) { qFonte = bp._qFonte }
              else if (bp.label === '🔄 Renutrição') { qFonte = row.fonte; qRen = true }
              else { qFonte = row.fonte; qConvPoint = bp.label }
              setPopover({ label: bp.label, captacoes: bp.captacoes, vendas: bp.vendas, cancelados: bp.cancelados, conversao: bp.conversao, queryFonte: qFonte, queryConvPoint: qConvPoint, queryRenutrucao: qRen })
            }}
            style={{ cursor: 'pointer' }}
          >
            <td style={{ ...col, paddingLeft: isO2ChildRow ? 68 : isChild ? 52 : 32, fontStyle: 'italic', color: 'var(--text-subtle)', background: 'var(--bg-subtle)' }}>{bp.label}</td>
            <td style={{ ...col, textAlign: 'right', background: 'var(--bg-subtle)' }}>{bp.captacoes}</td>
            <td style={{ ...col, textAlign: 'right', color: '#059669', fontWeight: 600, background: 'var(--bg-subtle)' }}>{bp.vendas}</td>
            <td style={{ ...col, textAlign: 'right', color: '#EF4444', background: 'var(--bg-subtle)' }}>{bp.cancelados}</td>
            <td style={{ ...col, background: 'var(--bg-subtle)' }}>{renderConversaoBar(bp.conversao)}</td>
          </tr>
        ))}
      </>
    )
  }

  const organicFontes = data.filter(d => !isSdr(d.fonte))
  const organicTotal = {
    captacoes: organicFontes.reduce((s, f) => s + f.captacoes, 0),
    vendas:    organicFontes.reduce((s, f) => s + f.vendas, 0),
    cancelados: organicFontes.reduce((s, f) => s + f.cancelados, 0),
  }
  const _allBp = organicFontes.flatMap(f => f.breakdown)
  const _bpLabels = [...new Set(_allBp.map(b => b.label))]
  const organicBp = _bpLabels
    .map(label => {
      const rows = _allBp.filter(b => b.label === label)
      const cap  = rows.reduce((s, b) => s + b.captacoes, 0)
      const ven  = rows.reduce((s, b) => s + b.vendas, 0)
      const can  = rows.reduce((s, b) => s + b.cancelados, 0)
      return { label, captacoes: cap, vendas: ven, cancelados: can, conversao: cap > 0 ? +(ven / cap * 100).toFixed(1) : 0, pct_perda: cap > 0 ? +(can / cap * 100).toFixed(1) : 0 }
    })
    .sort((a, b) => b.captacoes - a.captacoes)
  const organicConv = organicTotal.captacoes > 0 ? +(organicTotal.vendas / organicTotal.captacoes * 100).toFixed(1) : 0
  const organicPerdaPct = organicTotal.captacoes > 0 ? +(organicTotal.cancelados / organicTotal.captacoes * 100).toFixed(1) : 0

  const sdrFontes = data.filter(d => isSdr(d.fonte)).sort((a, b) => b.captacoes - a.captacoes)
  const sdrTotal = {
    captacoes:  sdrFontes.reduce((s, f) => s + f.captacoes, 0),
    vendas:     sdrFontes.reduce((s, f) => s + f.vendas, 0),
    cancelados: sdrFontes.reduce((s, f) => s + f.cancelados, 0),
  }
  const sdrConv      = sdrTotal.captacoes > 0 ? +(sdrTotal.vendas / sdrTotal.captacoes * 100).toFixed(1) : 0
  const sdrPerdaPct  = sdrTotal.captacoes > 0 ? +(sdrTotal.cancelados / sdrTotal.captacoes * 100).toFixed(1) : 0

  // Agrupa Clara, Maria Eduarda, Gabrieli, Kauany (+ o2 solution) em "o2 Solution" para exibição
  const sdrDisplayFontes = (() => {
    const o2Members = sdrFontes.filter(f => isO2Member(f.fonte) || isO2Self(f.fonte))
    const others    = sdrFontes.filter(f => !isO2Member(f.fonte) && !isO2Self(f.fonte))
    const rows = [...others]
    if (o2Members.length > 0) {
      const cap = o2Members.reduce((s, f) => s + f.captacoes, 0)
      const ven = o2Members.reduce((s, f) => s + f.vendas, 0)
      const can = o2Members.reduce((s, f) => s + f.cancelados, 0)
      rows.push({
        fonte: 'o2 Solution',
        captacoes: cap, vendas: ven, cancelados: can,
        conversao: cap > 0 ? +(ven / cap * 100).toFixed(1) : 0,
        breakdown: [],
        _o2Origens: o2Members.map(f => f.fonte),
      } as FonteData & { _o2Origens?: string[] })
    }
    return rows.sort((a, b) => b.captacoes - a.captacoes)
  })()

  const baseTopCapt: BaseStat | undefined = basesData.length > 0
    ? [...basesData].sort((a, b) => b.captacoes - a.captacoes)[0]
    : undefined
  const _filtConv = basesData.filter(b => b.captacoes >= 3).sort((a, b) => b.conversao - a.conversao)
  const baseTopConv: BaseStat | undefined = _filtConv.length > 0 ? _filtConv[0] : undefined
  const baseTopCanc: BaseStat | undefined = basesData.length > 0
    ? [...basesData].sort((a, b) => b.cancelados - a.cancelados)[0]
    : undefined

  const baseHighlights: { label: string; color: string; bg: string; icon: LucideIcon; item: BaseStat | undefined; value: (d: BaseStat) => string }[] = [
    { label: 'Mais Captações',    color: '#3B82F6', bg: '#EFF6FF', icon: Users,          item: baseTopCapt, value: d => `${d.captacoes} leads` },
    { label: 'Melhor Conversão',  color: '#10B981', bg: '#ECFDF5', icon: Trophy,         item: baseTopConv, value: d => `${d.conversao}%` },
    { label: 'Mais Cancelamentos', color: '#EF4444', bg: '#FEF2F2', icon: AlertTriangle, item: baseTopCanc, value: d => `${d.pct_cancelamento}% (${d.cancelados})` },
  ]

  const acHd = (open: boolean): React.CSSProperties => ({
    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '16px 24px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
    borderBottom: open ? '1px solid var(--border)' : 'none',
  })
  const acWrap: React.CSSProperties = {
    marginBottom: 12, border: '1px solid var(--border)', borderRadius: 12,
    overflow: 'hidden', background: 'var(--bg-2)', transition: 'box-shadow .15s ease, transform .15s ease',
  }

  return UNDER_CONSTRUCTION ? (
    <main className="px-4 md:px-8 xl:px-12 py-6" style={{ maxWidth: 1100 }}>
      <style>{`
        .kpi-acc-card:hover { box-shadow: 0 6px 20px -8px rgba(20,30,60,0.16); transform: translateY(-1px); }
      `}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>KPIs</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>Indicadores de performance</p>
        </div>
        <input
          type="month" value={month} onChange={e => setMonth(e.target.value)}
          style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-2)', color: 'var(--text-1)', fontSize: 13 }}
        />
      </div>

      {/* ── Faixa de KPIs agregados ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 24 }}>
        {([
          { label: 'Total de Leads', value: totalCap, color: '#2563EB', trend: <HeroTrend curr={totalCap} prev={prevSummary?.cap ?? null} /> },
          { label: 'Vendas Fechadas', value: totalVen, color: '#059669', trend: <HeroTrend curr={totalVen} prev={prevSummary?.ven ?? null} /> },
          {
            label: 'Conversão Geral', value: `${taxaConv}%`, color: '#7C3AED',
            trend: <HeroTrend curr={taxaConv} prev={prevSummary ? (prevSummary.cap > 0 ? Math.round(prevSummary.ven / prevSummary.cap * 1000) / 10 : 0) : null} mode="pp" prevLabel={prevSummary ? `${prevSummary.cap > 0 ? Math.round(prevSummary.ven / prevSummary.cap * 1000) / 10 : 0}%` : undefined} />,
          },
          {
            label: 'Cancelamentos', value: totalCan, color: '#DC2626',
            trend: (
              <>
                <HeroTrend curr={totalCan} prev={prevSummary?.can ?? null} invert />
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{pctCan}% dos leads</div>
              </>
            ),
          },
          { label: 'Bases Ativas', value: basesData.length, color: '#D97706', trend: <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>destaque: {baseTopCapt?.base ?? '—'}</span> },
        ] as const).map(({ label, value, color, trend }) => (
          <div key={label} style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 18px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: color }} />
            <p style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', margin: '0 0 8px' }}>{label}</p>
            <p style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-1)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{value}</p>
            <div style={{ marginTop: 7 }}>{trend}</div>
          </div>
        ))}
      </div>

      {/* ── Accordion: Performance por Base ── */}
      <div className="kpi-acc-card" style={acWrap}>
        <button style={acHd(openSection === 'bases')} onClick={() => setOpenSection(openSection === 'bases' ? null : 'bases')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <SectionIcon section="bases" />
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Performance por Base</p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '3px 0 0' }}>
                {basesLoading ? 'Carregando…' : `${basesData.length} bases · destaque: ${baseTopCapt?.base ?? '—'}`}
              </p>
            </div>
          </div>
          {openSection === 'bases' ? <ChevronDown size={18} color="var(--text-muted)" /> : <ChevronRight size={18} color="var(--text-muted)" />}
        </button>
        {openSection === 'bases' && (
          <div style={{ padding: '20px 24px 24px' }}>
            {!basesLoading && basesData.length >= 4 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
                {baseHighlights.map(({ label, color, bg, icon: Icon, item, value }) => item ? (
                  <div key={label} style={{ background: bg, borderLeft: `4px solid ${color}`, borderRadius: 10, padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon size={18} color={color} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>{label}</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', marginBottom: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.base}</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color, fontVariantNumeric: 'tabular-nums' }}>{value(item)}</div>
                    </div>
                  </div>
                ) : null)}
              </div>
            )}
            {basesLoading ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>Carregando…</div>
            ) : basesData.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>Nenhuma base com campo "Base:" encontrada neste período</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-hover)' }}>
                    {['Base', 'Análise'].map(h => (
                      <th key={h} style={{ padding: '9px 14px', textAlign: h === 'Base' ? 'left' : 'center', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {basesData.map((b, i) => (
                    <tr key={b.base} style={{
                      borderTop: '1px solid var(--border)', cursor: 'pointer',
                      background: i % 2 === 1 ? 'var(--bg-subtle, rgba(0,0,0,0.015))' : 'transparent',
                    }}
                      onClick={() => {
                        setBasePopup(b.base)
                        setBaseStatusFilter(null)
                        setBaseLeadsLoading(true)
                        setBaseLeads([])
                        api.get<OrgLead[]>(`/api/v1/kpis/leads-base?${new URLSearchParams({ month, base: b.base })}`)
                          .then(r => setBaseLeads(r.data)).catch(() => setBaseLeads([]))
                          .finally(() => setBaseLeadsLoading(false))
                      }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#F0F9FF'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = i % 2 === 1 ? 'var(--bg-subtle, rgba(0,0,0,0.015))' : 'transparent'}
                    >
                      <td style={{ padding: '11px 14px', fontSize: 13, fontWeight: 600, color: '#2563EB' }}>{b.base}</td>
                      <td style={{ padding: '11px 14px', textAlign: 'center' }}>
                        <button
                          onClick={e => { e.stopPropagation(); openBaseDrawer(b.base) }}
                          title="Ver análise detalhada"
                          style={{ background: '#EFF6FF', border: 'none', borderRadius: 8, padding: 7, cursor: 'pointer', display: 'inline-flex', color: '#2563EB' }}
                        >
                          <BarChart3 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* ── Accordion: SDR ── */}
      <div className="kpi-acc-card" style={acWrap}>
        <button style={acHd(openSection === 'sdr')} onClick={() => setOpenSection(openSection === 'sdr' ? null : 'sdr')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <SectionIcon section="sdr" />
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>SDR</p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '3px 0 0' }}>
                {loading ? 'Carregando…' : `${sdrFontes.length} operadores · ${sdrTotal.captacoes} leads · ${sdrTotal.vendas} vendas · ${sdrConv}% conversão`}
              </p>
            </div>
          </div>
          {openSection === 'sdr' ? <ChevronDown size={18} color="var(--text-muted)" /> : <ChevronRight size={18} color="var(--text-muted)" />}
        </button>
        {openSection === 'sdr' && (
          <div style={{ padding: '20px 24px 24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
              {([
                { label: 'Captações', val: String(sdrTotal.captacoes), color: '#3B82F6', bg: '#EFF6FF' },
                { label: 'Vendas',    val: String(sdrTotal.vendas),    color: '#10B981', bg: '#ECFDF5' },
                { label: 'Conversão', val: `${sdrConv}%`,              color: '#7C3AED', bg: '#F5F3FF' },
                { label: '% Perda',   val: `${sdrPerdaPct}%`,          color: '#EF4444', bg: '#FEF2F2' },
              ] as const).map(({ label, val, color, bg }) => (
                <div key={label} style={{ background: bg, borderRadius: 10, padding: '14px 16px', border: `1px solid ${color}25` }}>
                  <p style={{ fontSize: 10, fontWeight: 600, color, textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 6px' }}>{label}</p>
                  <p style={{ fontSize: 22, fontWeight: 800, color, margin: 0 }}>{val}</p>
                </div>
              ))}
            </div>
            {loading ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>Carregando…</div>
            ) : sdrFontes.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>Nenhum dado SDR neste período</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-3, #f5f5f5)' }}>
                    {['SDR', 'Análise', 'Ver Vida do SDR'].map(h => (
                      <th key={h} style={{ padding: '9px 14px', textAlign: h === 'SDR' ? 'left' : 'center', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sdrDisplayFontes.map(f => {
                    const fd = f as FonteData & { _o2Origens?: string[] }
                    const origens = fd._o2Origens ? fd._o2Origens.join(',') : f.fonte
                    return (
                      <tr key={f.fonte} style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }}
                        onClick={() => {
                          setSdrPopup(f.fonte)
                          setSdrStatusFilter(null)
                          setSdrLeadsLoading(true)
                          setSdrLeads([])
                          api.get<OrgLead[]>(`/api/v1/kpis/leads-conv-point?${new URLSearchParams({ month, origens })}`)
                            .then(r => setSdrLeads(r.data)).catch(() => setSdrLeads([]))
                            .finally(() => setSdrLeadsLoading(false))
                        }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#F0F9FF'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}
                      >
                        <td style={{ padding: '11px 14px', fontSize: 13, fontWeight: 600, color: '#2563EB' }}>{f.fonte}</td>
                        <td style={{ padding: '11px 14px', textAlign: 'center' }}>
                          <button
                            onClick={e => { e.stopPropagation(); openSdrDrawer(f.fonte, origens) }}
                            title="Ver análise detalhada"
                            style={{ background: '#EFF6FF', border: 'none', borderRadius: 8, padding: 7, cursor: 'pointer', display: 'inline-flex', color: '#2563EB' }}
                          >
                            <BarChart3 size={15} />
                          </button>
                        </td>
                        <td style={{ padding: '11px 14px', textAlign: 'center' }}>
                          <button
                            onClick={e => { e.stopPropagation(); navigate(`/vida-sdr/${encodeURIComponent(origens)}?nome=${encodeURIComponent(f.fonte)}`) }}
                            title="Ver vida do SDR"
                            style={{ background: '#F5F3FF', border: 'none', borderRadius: 8, padding: 7, cursor: 'pointer', display: 'inline-flex', color: '#7C3AED' }}
                          >
                            <UserRoundSearch size={15} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* ── Accordion: Orgânico ── */}
      <div className="kpi-acc-card" style={acWrap}>
        <button style={acHd(openSection === 'organico')} onClick={() => setOpenSection(openSection === 'organico' ? null : 'organico')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <SectionIcon section="organico" />
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Orgânico</p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '3px 0 0' }}>
                {loading ? 'Carregando…' : `Site · ChatGPT · Orgânico — ${organicTotal.captacoes} leads · ${organicTotal.vendas} vendas · ${organicConv}% conversão`}
              </p>
            </div>
          </div>
          {openSection === 'organico' ? <ChevronDown size={18} color="var(--text-muted)" /> : <ChevronRight size={18} color="var(--text-muted)" />}
        </button>
        {openSection === 'organico' && (
          <div style={{ padding: '20px 24px 24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
              {([
                { label: 'Captações', val: String(organicTotal.captacoes), color: '#3B82F6', bg: '#EFF6FF' },
                { label: 'Vendas',    val: String(organicTotal.vendas),    color: '#10B981', bg: '#ECFDF5' },
                { label: 'Conversão', val: `${organicConv}%`,              color: '#7C3AED', bg: '#F5F3FF' },
                { label: '% Perda',   val: `${organicPerdaPct}%`,          color: '#EF4444', bg: '#FEF2F2' },
              ] as const).map(({ label, val, color, bg }) => (
                <div key={label} style={{ background: bg, borderRadius: 10, padding: '14px 16px', border: `1px solid ${color}25` }}>
                  <p style={{ fontSize: 10, fontWeight: 600, color, textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 6px' }}>{label}</p>
                  <p style={{ fontSize: 22, fontWeight: 800, color, margin: 0 }}>{val}</p>
                </div>
              ))}
            </div>
            {loading ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>Carregando…</div>
            ) : organicBp.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>Nenhum dado orgânico neste período</div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 0 10px' }}>
                  <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, margin: 0 }}>Por Ponto de Conversão</p>
                  <button
                    onClick={() => { setConvCompare(true); setConvCompareLevel('month'); setConvComparePoint(null); setConvCompareWeek(null) }}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}
                  >
                    <ArrowLeftRight size={13} />
                    Comparar
                  </button>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-3, #f5f5f5)' }}>
                      {['Ponto de Conversão', 'Análise'].map(h => (
                        <th key={h} style={{ padding: '9px 14px', textAlign: h === 'Ponto de Conversão' ? 'left' : 'center', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {organicBp.map(b => {
                      const relevantFontes = organicFontes
                        .filter(f => f.breakdown.some(bd => bd.label === b.label))
                        .map(f => f.fonte)
                      return (
                        <tr key={b.label} style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }}
                          onClick={() => {
                            setOrgPopup(b.label)
                            setOrgStatusFilter(null)
                            setOrgLeadsLoading(true)
                            setOrgLeads([])
                            const qp = new URLSearchParams({ month, conv_point: b.label })
                            if (relevantFontes.length > 0) qp.set('origens', relevantFontes.join(','))
                            api.get<OrgLead[]>(`/api/v1/kpis/leads-conv-point?${qp}`)
                              .then(r => setOrgLeads(r.data)).catch(() => setOrgLeads([]))
                              .finally(() => setOrgLeadsLoading(false))
                          }}
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#F0F9FF'}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}
                        >
                          <td style={{ padding: '11px 14px', fontSize: 13, fontWeight: 600, color: '#2563EB' }}>{b.label}</td>
                          <td style={{ padding: '11px 14px', textAlign: 'center' }}>
                            <button
                              onClick={e => { e.stopPropagation(); openConvPointDrawer(b.label, relevantFontes) }}
                              title="Ver análise detalhada"
                              style={{ background: '#EFF6FF', border: 'none', borderRadius: 8, padding: 7, cursor: 'pointer', display: 'inline-flex', color: '#2563EB' }}
                            >
                              <BarChart3 size={15} />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Accordion: Faixas Etárias ── */}
      <div className="kpi-acc-card" style={acWrap}>
        <button style={acHd(openSection === 'idades')} onClick={() => setOpenSection(openSection === 'idades' ? null : 'idades')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <SectionIcon section="idades" />
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Faixas Etárias</p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '3px 0 0' }}>
                {ageBandsLoading ? 'Carregando…' : `${ageComIdade} leads com idade identificada · ${ageSemIdade} sem dados`}
              </p>
            </div>
          </div>
          {openSection === 'idades' ? <ChevronDown size={18} color="var(--text-muted)" /> : <ChevronRight size={18} color="var(--text-muted)" />}
        </button>
        {openSection === 'idades' && (
          <div style={{ padding: '20px 24px 24px' }}>
            {ageBandsLoading ? (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0' }}>Carregando…</p>
            ) : (
              <>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: '#F8FAFC' }}>
                        {['Faixa etária', 'Captações', 'Vendas', 'Cancelamentos', '% Conversão', '% Cancelamento'].map(h => (
                          <th key={h} style={{ padding: '10px 14px', textAlign: h === 'Faixa etária' ? 'left' : 'center', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ageBands.map(b => {
                        const maxCap = Math.max(...ageBands.map(x => x.captacoes), 1)
                        const barW = Math.round(b.captacoes / maxCap * 100)
                        return (
                          <tr key={b.faixa} style={{ borderTop: '1px solid var(--border)', cursor: b.captacoes > 0 ? 'pointer' : 'default' }}
                            onClick={() => {
                              if (b.captacoes === 0) return
                              setAgePopup(b.faixa)
                              setAgeLeads([])
                              setAgeLeadsLoading(true)
                              api.get<typeof ageLeads>(`/api/v1/kpis/leads-faixa-etaria?month=${month}&faixa=${encodeURIComponent(b.faixa)}`)
                                .then(r => setAgeLeads(r.data)).catch(() => setAgeLeads([]))
                                .finally(() => setAgeLeadsLoading(false))
                            }}
                            onMouseEnter={e => { if (b.captacoes > 0) (e.currentTarget as HTMLElement).style.background = '#F0F9FF' }}
                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}
                          >
                            <td style={{ padding: '11px 14px', fontWeight: 700, color: b.captacoes > 0 ? '#2563EB' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>{b.faixa}</td>
                            <td style={{ padding: '11px 14px', textAlign: 'center' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                                <div style={{ width: 60, height: 6, background: '#E5E7EB', borderRadius: 3, flexShrink: 0 }}>
                                  <div style={{ width: `${barW}%`, height: '100%', background: '#3B82F6', borderRadius: 3 }} />
                                </div>
                                <span style={{ fontWeight: 600 }}>{b.captacoes}</span>
                              </div>
                            </td>
                            <td style={{ padding: '11px 14px', textAlign: 'center', fontWeight: 600, color: b.vendas > 0 ? '#059669' : 'var(--text-muted)' }}>{b.vendas}</td>
                            <td style={{ padding: '11px 14px', textAlign: 'center', fontWeight: 600, color: b.cancelados > 0 ? '#EF4444' : 'var(--text-muted)' }}>{b.cancelados}</td>
                            <td style={{ padding: '11px 14px', textAlign: 'center' }}>
                              <span style={{ fontWeight: 700, color: b.conversao >= 20 ? '#059669' : b.conversao >= 10 ? '#F59E0B' : '#6B7280' }}>{b.conversao}%</span>
                            </td>
                            <td style={{ padding: '11px 14px', textAlign: 'center' }}>
                              <span style={{ fontWeight: 700, color: b.pct_cancelamento >= 30 ? '#EF4444' : b.pct_cancelamento >= 15 ? '#F59E0B' : '#6B7280' }}>{b.pct_cancelamento}%</span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: '2px solid var(--border)', background: '#F8FAFC' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 700, fontSize: 12, color: 'var(--text-muted)' }}>TOTAL</td>
                        <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700 }}>{ageComIdade}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: '#059669' }}>{ageBands.reduce((s, b) => s + b.vendas, 0)}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700, color: '#EF4444' }}>{ageBands.reduce((s, b) => s + b.cancelados, 0)}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700 }}>
                          {ageComIdade > 0 ? (ageBands.reduce((s, b) => s + b.vendas, 0) / ageComIdade * 100).toFixed(1) : 0}%
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 700 }}>
                          {ageComIdade > 0 ? (ageBands.reduce((s, b) => s + b.cancelados, 0) / ageComIdade * 100).toFixed(1) : 0}%
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                {ageSemIdade > 0 && (
                  <p style={{ marginTop: 12, fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>
                    {ageSemIdade} leads sem idade registrada não estão incluídos na tabela.
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Accordion: Plano de Saúde ── */}
      <div className="kpi-acc-card" style={acWrap}>
        <button style={acHd(openSection === 'plano_saude')} onClick={() => setOpenSection(openSection === 'plano_saude' ? null : 'plano_saude')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <SectionIcon section="plano_saude" />
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Plano de Saúde</p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '3px 0 0' }}>
                {planoSaudeLoading ? 'Carregando…' : `${planoSaude?.com_informacao ?? 0} leads com informação · ${planoSaude?.sem_informacao ?? 0} sem dados`}
              </p>
            </div>
          </div>
          {openSection === 'plano_saude' ? <ChevronDown size={18} color="var(--text-muted)" /> : <ChevronRight size={18} color="var(--text-muted)" />}
        </button>
        {openSection === 'plano_saude' && (
          <div style={{ padding: '20px 24px 24px' }}>
            {planoSaudeLoading ? (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0' }}>Carregando…</p>
            ) : !planoSaude || planoSaude.com_informacao === 0 ? (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0' }}>Nenhum lead com essa informação neste período</p>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, marginBottom: 10 }}>
                  <div style={{ background: '#ECFDF5', border: '1px solid #05966930', borderRadius: 10, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: '#05966918', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <ShieldCheck size={19} color="#059669" />
                    </div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: '#059669', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Possui Plano</div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                        <span style={{ fontSize: 24, fontWeight: 800, color: '#059669' }}>{planoSaude.possui_plano}</span>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>· {planoSaude.pct_possui}%</span>
                      </div>
                    </div>
                  </div>
                  <div style={{ background: '#FEF2F2', border: '1px solid #DC262630', borderRadius: 10, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: '#DC262618', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <ShieldX size={19} color="#DC2626" />
                    </div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: '#DC2626', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Não Possui Plano</div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                        <span style={{ fontSize: 24, fontWeight: 800, color: '#DC2626' }}>{planoSaude.nao_possui_plano}</span>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>· {planoSaude.pct_nao_possui}%</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  title={`Possui plano: ${planoSaude.possui_plano} (${planoSaude.pct_possui}%) · Não possui: ${planoSaude.nao_possui_plano} (${planoSaude.pct_nao_possui}%)`}
                  style={{ display: 'flex', width: '100%', height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 20 }}
                >
                  <div style={{ width: `${planoSaude.pct_possui}%`, background: '#059669' }} />
                  <div style={{ width: 2, background: 'var(--bg-card, #fff)', flexShrink: 0 }} />
                  <div style={{ width: `${planoSaude.pct_nao_possui}%`, background: '#DC2626' }} />
                </div>

                {planoSaude.operadoras.length > 0 && (
                  <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: 'var(--bg-hover)' }}>
                          {['Operadora atual', 'Captações', 'Vendas', 'Cancelamentos', '% Conversão'].map(h => (
                            <th key={h} style={{ padding: '10px 14px', textAlign: h === 'Operadora atual' ? 'left' : 'center', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {planoSaude.operadoras.map((o, i) => {
                          const maxCap = Math.max(...planoSaude.operadoras.map(x => x.captacoes), 1)
                          const barW = Math.round(o.captacoes / maxCap * 100)
                          return (
                            <tr key={o.nome} style={{
                              borderTop: '1px solid var(--border)', cursor: 'pointer',
                              background: i % 2 === 1 ? 'var(--bg-subtle, rgba(0,0,0,0.015))' : 'transparent',
                            }}
                              onClick={() => {
                                setPlanoPopup(o.nome)
                                setPlanoLeads([])
                                setPlanoLeadsLoading(true)
                                api.get<OrgLead[]>(`/api/v1/kpis/leads-plano-saude?${new URLSearchParams({ month, plano: o.nome })}`)
                                  .then(r => setPlanoLeads(r.data)).catch(() => setPlanoLeads([]))
                                  .finally(() => setPlanoLeadsLoading(false))
                              }}
                              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#F0F9FF'}
                              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = i % 2 === 1 ? 'var(--bg-subtle, rgba(0,0,0,0.015))' : 'transparent'}
                            >
                              <td style={{ padding: '11px 14px', fontWeight: 700, color: '#2563EB', whiteSpace: 'nowrap' }}>{o.nome}</td>
                              <td style={{ padding: '11px 14px', textAlign: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                                  <div style={{ width: 60, height: 6, background: 'var(--border)', borderRadius: 4, flexShrink: 0 }}>
                                    <div style={{ width: `${barW}%`, height: '100%', background: '#3B82F6', borderRadius: 4 }} />
                                  </div>
                                  <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{o.captacoes}</span>
                                </div>
                              </td>
                              <td style={{ padding: '11px 14px', textAlign: 'center', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: o.vendas > 0 ? '#059669' : 'var(--text-muted)' }}>{o.vendas}</td>
                              <td style={{ padding: '11px 14px', textAlign: 'center', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: o.cancelados > 0 ? '#EF4444' : 'var(--text-muted)' }}>{o.cancelados}</td>
                              <td style={{ padding: '11px 14px', textAlign: 'center' }}>
                                <span style={{
                                  fontWeight: 700, fontVariantNumeric: 'tabular-nums', padding: '2px 8px', borderRadius: 99,
                                  color: o.conversao >= 20 ? '#059669' : o.conversao >= 10 ? '#F59E0B' : 'var(--text-muted)',
                                  background: o.conversao >= 20 ? '#05966915' : o.conversao >= 10 ? '#F59E0B15' : 'transparent',
                                }}>{o.conversao}%</span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                {planoSaude.sem_informacao > 0 && (
                  <p style={{ marginTop: 12, fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>
                    {planoSaude.sem_informacao} leads sem essa informação (vieram de canais que não perguntam) não estão incluídos acima.
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Modal: Leads por Operadora Atual ── */}
      {planoPopup && (
        <div onClick={() => setPlanoPopup(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-card, #fff)', borderRadius: 16, width: '100%', maxWidth: 480, maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ padding: '20px 24px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
              <div>
                <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>{planoPopup}</p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{month} · {planoLeads.length} lead{planoLeads.length !== 1 ? 's' : ''}</p>
              </div>
              <button onClick={() => setPlanoPopup(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ padding: '16px 24px 24px' }}>
              {planoLeadsLoading ? (
                <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 0' }}>Carregando…</p>
              ) : planoLeads.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 0' }}>Nenhum lead encontrado</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {planoLeads.map((l, i) => {
                    const tipoCor = l.tipo === 'venda' ? '#059669' : l.tipo === 'perda' ? '#EF4444' : '#6B7280'
                    const tipoBg  = l.tipo === 'venda' ? '#ECFDF5' : l.tipo === 'perda' ? '#FEF2F2' : '#F1F5F9'
                    return (
                      <div key={i} style={{ padding: '10px 14px', background: '#F8FAFC', borderRadius: 10, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>{l.nome}</p>
                          <span style={{ fontSize: 10, background: tipoBg, color: tipoCor, borderRadius: 4, padding: '2px 7px', fontWeight: 700 }}>{l.status}</span>
                        </div>
                        {l.valor ? <span style={{ fontSize: 13, fontWeight: 700, color: '#059669', flexShrink: 0, marginLeft: 8 }}>R$ {l.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span> : null}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Leads por Faixa Etária ── */}
      {agePopup && (
        <div onClick={() => setAgePopup(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-card, #fff)', borderRadius: 16, width: '100%', maxWidth: 480, maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ padding: '20px 24px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
              <div>
                <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Faixa {agePopup} anos</p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{month} · {ageLeads.length} lead{ageLeads.length !== 1 ? 's' : ''} com idade identificada</p>
              </div>
              <button onClick={() => setAgePopup(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ padding: '16px 24px 24px' }}>
              {ageLeadsLoading ? (
                <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 0' }}>Carregando…</p>
              ) : ageLeads.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 0' }}>Nenhum lead encontrado</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {ageLeads.map((l, i) => {
                    const tipoCor = l.tipo === 'venda' ? '#059669' : l.tipo === 'perda' ? '#EF4444' : '#6B7280'
                    const tipoBg  = l.tipo === 'venda' ? '#ECFDF5' : l.tipo === 'perda' ? '#FEF2F2' : '#F1F5F9'
                    return (
                      <div key={i} style={{ padding: '10px 14px', background: '#F8FAFC', borderRadius: 10, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 13, fontWeight: 800, color: '#1D4ED8', background: '#EFF6FF', borderRadius: 6, padding: '3px 9px', flexShrink: 0 }}>{l.idade} anos</span>
                          <div>
                            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>{l.nome}</p>
                            <span style={{ fontSize: 10, background: tipoBg, color: tipoCor, borderRadius: 4, padding: '2px 7px', fontWeight: 700 }}>{l.status}</span>
                          </div>
                        </div>
                        {l.valor ? <span style={{ fontSize: 13, fontWeight: 700, color: '#059669', flexShrink: 0, marginLeft: 8 }}>R$ {l.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span> : null}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Leads por SDR ── */}
      {sdrPopup && (
        <div onClick={() => setSdrPopup(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-card, #fff)', borderRadius: 16, width: '100%', maxWidth: 520, maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ padding: '20px 24px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
              <div>
                <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>{sdrPopup}</p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Leads captados por este SDR · {month}</p>
              </div>
              <button onClick={() => setSdrPopup(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, marginLeft: 12, flexShrink: 0 }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ padding: '16px 24px 24px' }}>
              {sdrLeadsLoading ? (
                <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 0' }}>Carregando…</p>
              ) : sdrLeads.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 0' }}>Nenhum lead encontrado</p>
              ) : (() => {
                const statusList = [...new Set(sdrLeads.map(l => l.status))]
                const filtered   = sdrStatusFilter ? sdrLeads.filter(l => l.status === sdrStatusFilter) : sdrLeads
                return (
                  <>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
                      <button onClick={() => setSdrStatusFilter(null)}
                        style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer', background: sdrStatusFilter === null ? '#1D4ED8' : 'var(--bg-2)', color: sdrStatusFilter === null ? '#fff' : 'var(--text-muted)' }}>
                        Todos ({sdrLeads.length})
                      </button>
                      {statusList.map(st => {
                        const count = sdrLeads.filter(l => l.status === st).length
                        const active = sdrStatusFilter === st
                        const tipoCor = sdrLeads.find(l => l.status === st)?.tipo === 'venda' ? '#059669' : sdrLeads.find(l => l.status === st)?.tipo === 'perda' ? '#EF4444' : '#6B7280'
                        return (
                          <button key={st} onClick={() => setSdrStatusFilter(active ? null : st)}
                            style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6, border: `1px solid ${tipoCor}40`, cursor: 'pointer', background: active ? tipoCor : tipoCor + '15', color: active ? '#fff' : tipoCor }}>
                            {st} ({count})
                          </button>
                        )
                      })}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {filtered.map((l, i) => {
                        const tipoCor = l.tipo === 'venda' ? '#059669' : l.tipo === 'perda' ? '#EF4444' : '#6B7280'
                        const tipoBg  = l.tipo === 'venda' ? '#ECFDF5' : l.tipo === 'perda' ? '#FEF2F2' : '#F1F5F9'
                        return (
                          <div key={i} style={{ padding: '10px 14px', background: '#F8FAFC', borderRadius: 10, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span style={{ fontSize: 10, background: tipoBg, color: tipoCor, borderRadius: 4, padding: '2px 7px', fontWeight: 700, flexShrink: 0 }}>{l.status}</span>
                              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>{l.nome}</p>
                            </div>
                            {l.valor ? <span style={{ fontSize: 13, fontWeight: 700, color: '#059669', flexShrink: 0, marginLeft: 8 }}>R$ {l.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span> : null}
                          </div>
                        )
                      })}
                    </div>
                  </>
                )
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Leads por Base ── */}
      {basePopup && (
        <div onClick={() => setBasePopup(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-card, #fff)', borderRadius: 16, width: '100%', maxWidth: 520, maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ padding: '20px 24px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
              <div>
                <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>{basePopup}</p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Leads captados nesta base · {month}</p>
              </div>
              <button onClick={() => setBasePopup(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, marginLeft: 12, flexShrink: 0 }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ padding: '16px 24px 24px' }}>
              {baseLeadsLoading ? (
                <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 0' }}>Carregando…</p>
              ) : baseLeads.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 0' }}>Nenhum lead encontrado</p>
              ) : (() => {
                const statusList = [...new Set(baseLeads.map(l => l.status))]
                const filtered   = baseStatusFilter ? baseLeads.filter(l => l.status === baseStatusFilter) : baseLeads
                return (
                  <>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
                      <button onClick={() => setBaseStatusFilter(null)}
                        style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer', background: baseStatusFilter === null ? '#1D4ED8' : 'var(--bg-2)', color: baseStatusFilter === null ? '#fff' : 'var(--text-muted)' }}>
                        Todos ({baseLeads.length})
                      </button>
                      {statusList.map(st => {
                        const count = baseLeads.filter(l => l.status === st).length
                        const active = baseStatusFilter === st
                        const tipoCor = baseLeads.find(l => l.status === st)?.tipo === 'venda' ? '#059669' : baseLeads.find(l => l.status === st)?.tipo === 'perda' ? '#EF4444' : '#6B7280'
                        return (
                          <button key={st} onClick={() => setBaseStatusFilter(active ? null : st)}
                            style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6, border: `1px solid ${tipoCor}40`, cursor: 'pointer', background: active ? tipoCor : tipoCor + '15', color: active ? '#fff' : tipoCor }}>
                            {st} ({count})
                          </button>
                        )
                      })}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {filtered.map((l, i) => {
                        const tipoCor = l.tipo === 'venda' ? '#059669' : l.tipo === 'perda' ? '#EF4444' : '#6B7280'
                        const tipoBg  = l.tipo === 'venda' ? '#ECFDF5' : l.tipo === 'perda' ? '#FEF2F2' : '#F1F5F9'
                        return (
                          <div key={i} style={{ padding: '10px 14px', background: '#F8FAFC', borderRadius: 10, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span style={{ fontSize: 10, background: tipoBg, color: tipoCor, borderRadius: 4, padding: '2px 7px', fontWeight: 700, flexShrink: 0 }}>{l.status}</span>
                              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>{l.nome}</p>
                            </div>
                            {l.valor ? <span style={{ fontSize: 13, fontWeight: 700, color: '#059669', flexShrink: 0, marginLeft: 8 }}>R$ {l.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span> : null}
                          </div>
                        )
                      })}
                    </div>
                  </>
                )
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Leads por Ponto de Conversão ── */}
      {orgPopup && (
        <div onClick={() => setOrgPopup(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-card, #fff)', borderRadius: 16, width: '100%', maxWidth: 520, maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ padding: '20px 24px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
              <div>
                <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>{orgPopup}</p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Leads captados neste ponto de conversão · {month}</p>
              </div>
              <button onClick={() => setOrgPopup(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, marginLeft: 12, flexShrink: 0 }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ padding: '16px 24px 24px' }}>
              {orgLeadsLoading ? (
                <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 0' }}>Carregando…</p>
              ) : orgLeads.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 0' }}>Nenhum lead encontrado</p>
              ) : (() => {
                const statusList = [...new Set(orgLeads.map(l => l.status))]
                const filtered   = orgStatusFilter ? orgLeads.filter(l => l.status === orgStatusFilter) : orgLeads
                return (
                  <>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
                      <button onClick={() => setOrgStatusFilter(null)}
                        style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer', background: orgStatusFilter === null ? '#1D4ED8' : 'var(--bg-2)', color: orgStatusFilter === null ? '#fff' : 'var(--text-muted)' }}>
                        Todos ({orgLeads.length})
                      </button>
                      {statusList.map(st => {
                        const count = orgLeads.filter(l => l.status === st).length
                        const active = orgStatusFilter === st
                        const tipoCor = orgLeads.find(l => l.status === st)?.tipo === 'venda' ? '#059669' : orgLeads.find(l => l.status === st)?.tipo === 'perda' ? '#EF4444' : '#6B7280'
                        return (
                          <button key={st} onClick={() => setOrgStatusFilter(active ? null : st)}
                            style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6, border: `1px solid ${tipoCor}40`, cursor: 'pointer', background: active ? tipoCor : tipoCor + '15', color: active ? '#fff' : tipoCor }}>
                            {st} ({count})
                          </button>
                        )
                      })}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {filtered.map((l, i) => {
                        const tipoCor = l.tipo === 'venda' ? '#059669' : l.tipo === 'perda' ? '#EF4444' : '#6B7280'
                        const tipoBg  = l.tipo === 'venda' ? '#ECFDF5' : l.tipo === 'perda' ? '#FEF2F2' : '#F1F5F9'
                        return (
                          <div key={i} style={{ padding: '10px 14px', background: '#F8FAFC', borderRadius: 10, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span style={{ fontSize: 10, background: tipoBg, color: tipoCor, borderRadius: 4, padding: '2px 7px', fontWeight: 700, flexShrink: 0 }}>{l.status}</span>
                              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>{l.nome}</p>
                            </div>
                            {l.valor ? <span style={{ fontSize: 13, fontWeight: 700, color: '#059669', flexShrink: 0, marginLeft: 8 }}>R$ {l.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span> : null}
                          </div>
                        )
                      })}
                    </div>
                  </>
                )
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── Drawer: Análise detalhada da Base ── */}
      {baseDrawer && (
        <>
          <div onClick={() => setBaseDrawer(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100 }} />
          <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: 420, maxWidth: '100vw', zIndex: 101,
            background: 'var(--bg-card, #fff)', boxShadow: '-8px 0 32px rgba(0,0,0,0.2)',
            display: 'flex', flexDirection: 'column', overflowY: 'auto',
          }}>
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>{baseDrawer}</p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{month.split('-').reverse().join('/')}</p>
              </div>
              <button onClick={() => setBaseDrawer(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, marginLeft: 12, flexShrink: 0 }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '20px 24px 32px' }}>
              {baseDrawerLoading ? (
                <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 0' }}>Carregando…</p>
              ) : !baseDrawerData ? (
                <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 0' }}>Não foi possível carregar os dados.</p>
              ) : (
                <>
                  {/* Funil */}
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }}>Funil</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 22 }}>
                    <div style={{ background: '#EFF6FF', borderRadius: 10, padding: '12px 14px' }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: '#3B82F6', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Captados</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: '#1D4ED8' }}>{baseDrawerData.captacoes}</div>
                    </div>
                    <div style={{ background: '#FEF2F2', borderRadius: 10, padding: '12px 14px' }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: '#EF4444', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Perdidos</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: '#DC2626' }}>{baseDrawerData.cancelados}</div>
                    </div>
                    <div style={{ background: '#ECFDF5', borderRadius: 10, padding: '12px 14px' }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: '#10B981', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Base líquida</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: '#059669' }}>{baseDrawerData.base_liquida}</div>
                    </div>
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '-12px 0 20px' }}>
                    Vendas: <strong style={{ color: '#059669' }}>{baseDrawerData.vendas}</strong> ({baseDrawerData.conversao}% conversão) · % Cancelamento: <strong style={{ color: '#EF4444' }}>{baseDrawerData.pct_cancelamento}%</strong>
                  </p>

                  {/* Receita */}
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px', paddingTop: 16, borderTop: '1px solid var(--border-lt)' }}>Receita Potencial</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 20 }}>
                    <div style={{ background: '#FFF7ED', borderRadius: 10, padding: '12px 14px' }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: '#F97316', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Total (base líquida)</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: '#C2410C' }}>{fmtBrl(baseDrawerData.receita_potencial)}</div>
                    </div>
                    <div style={{ background: '#FFF7ED', borderRadius: 10, padding: '12px 14px' }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: '#F97316', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Ticket médio</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: '#C2410C' }}>{fmtBrl(baseDrawerData.ticket_medio)}</div>
                    </div>
                  </div>

                  {/* Modalidade (PF x PME x demais) */}
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px', paddingTop: 16, borderTop: '1px solid var(--border-lt)' }}>Perfil do Cliente (Modalidade)</p>
                  {baseDrawerData.modalidades.length === 0 ? (
                    <p style={{ fontSize: 12, color: 'var(--text-subtle)', marginBottom: 34 }}>Sem dados de modalidade.</p>
                  ) : (
                    <div style={{ marginBottom: 34 }}>
                      {baseDrawerData.modalidades.map((m, i) => (
                        <div key={m.nome} style={{ marginBottom: 10 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 500 }}>{m.nome}</span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>{m.count} · {m.pct}%</span>
                          </div>
                          <div style={{ background: 'var(--border)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                            <div style={{ width: `${m.pct}%`, height: '100%', borderRadius: 4, background: CHART_COLORS[i % CHART_COLORS.length] }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Plano de saúde */}
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }}>Já Possui Plano?</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 8 }}>
                    <div style={{ background: '#ECFDF5', border: '1px solid #05966930', borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <ShieldCheck size={17} color="#059669" />
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: '#059669', lineHeight: 1.2 }}>{baseDrawerData.plano.possui}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Possui · {baseDrawerData.plano.pct_possui}%</div>
                      </div>
                    </div>
                    <div style={{ background: '#FEF2F2', border: '1px solid #DC262630', borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <ShieldX size={17} color="#DC2626" />
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: '#DC2626', lineHeight: 1.2 }}>{baseDrawerData.plano.nao_possui}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Não possui · {baseDrawerData.plano.pct_nao_possui}%</div>
                      </div>
                    </div>
                  </div>
                  {baseDrawerData.plano.sem_informacao > 0 && (
                    <p style={{ fontSize: 11, color: 'var(--text-subtle)' }}>
                      {baseDrawerData.plano.sem_informacao} lead(s) sem essa informação não entram no cálculo acima.
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Drawer: Análise detalhada do Ponto de Conversão ── */}
      {convPointDrawer && (
        <>
          <div onClick={() => setConvPointDrawer(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100 }} />
          <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: 420, maxWidth: '100vw', zIndex: 101,
            background: 'var(--bg-card, #fff)', boxShadow: '-8px 0 32px rgba(0,0,0,0.2)',
            display: 'flex', flexDirection: 'column', overflowY: 'auto',
          }}>
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <p style={{ fontSize: 11, color: '#2563EB', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Análise do Ponto de Conversão</p>
                <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', margin: '4px 0 0' }}>{convPointDrawer}</p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{month.split('-').reverse().join('/')}</p>
              </div>
              <button onClick={() => setConvPointDrawer(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, marginLeft: 12, flexShrink: 0 }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '20px 24px 32px' }}>
              {convPointDrawerLoading ? (
                <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 0' }}>Carregando…</p>
              ) : !convPointDrawerData ? (
                <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 0' }}>Não foi possível carregar os dados.</p>
              ) : (
                <>
                  {/* Funil */}
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }}>Funil</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 22 }}>
                    <div style={{ background: '#EFF6FF', borderRadius: 10, padding: '12px 14px' }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: '#3B82F6', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Captados</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: '#1D4ED8' }}>{convPointDrawerData.captacoes}</div>
                    </div>
                    <div style={{ background: '#FEF2F2', borderRadius: 10, padding: '12px 14px' }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: '#EF4444', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Perdidos</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: '#DC2626' }}>{convPointDrawerData.cancelados}</div>
                    </div>
                    <div style={{ background: '#ECFDF5', borderRadius: 10, padding: '12px 14px' }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: '#10B981', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Base líquida</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: '#059669' }}>{convPointDrawerData.base_liquida}</div>
                    </div>
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '-12px 0 20px' }}>
                    Vendas: <strong style={{ color: '#059669' }}>{convPointDrawerData.vendas}</strong> ({convPointDrawerData.conversao}% conversão) · % Perda: <strong style={{ color: '#EF4444' }}>{convPointDrawerData.pct_perda}%</strong>
                  </p>

                  {/* Receita */}
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px', paddingTop: 16, borderTop: '1px solid var(--border-lt)' }}>Receita Potencial</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 20 }}>
                    <div style={{ background: '#FFF7ED', borderRadius: 10, padding: '12px 14px' }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: '#F97316', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Total (base líquida)</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: '#C2410C' }}>{fmtBrl(convPointDrawerData.receita_potencial)}</div>
                    </div>
                    <div style={{ background: '#FFF7ED', borderRadius: 10, padding: '12px 14px' }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: '#F97316', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Ticket médio</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: '#C2410C' }}>{fmtBrl(convPointDrawerData.ticket_medio)}</div>
                    </div>
                  </div>

                  {/* Modalidade (PF x PME x demais) */}
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px', paddingTop: 16, borderTop: '1px solid var(--border-lt)' }}>Perfil do Cliente (Modalidade)</p>
                  {convPointDrawerData.modalidades.length === 0 ? (
                    <p style={{ fontSize: 12, color: 'var(--text-subtle)', marginBottom: 22 }}>Sem dados de modalidade.</p>
                  ) : (
                    <div style={{ marginBottom: 22 }}>
                      {convPointDrawerData.modalidades.map((m, i) => (
                        <div key={m.nome} style={{ marginBottom: 10 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 500 }}>{m.nome}</span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>{m.count} · {m.pct}%</span>
                          </div>
                          <div style={{ background: 'var(--border)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                            <div style={{ width: `${m.pct}%`, height: '100%', borderRadius: 4, background: CHART_COLORS[i % CHART_COLORS.length] }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Plano de saúde */}
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }}>Já Possui Plano?</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 8 }}>
                    <div style={{ background: '#ECFDF5', border: '1px solid #05966930', borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <ShieldCheck size={17} color="#059669" />
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: '#059669', lineHeight: 1.2 }}>{convPointDrawerData.plano.possui}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Possui · {convPointDrawerData.plano.pct_possui}%</div>
                      </div>
                    </div>
                    <div style={{ background: '#FEF2F2', border: '1px solid #DC262630', borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <ShieldX size={17} color="#DC2626" />
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: '#DC2626', lineHeight: 1.2 }}>{convPointDrawerData.plano.nao_possui}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Não possui · {convPointDrawerData.plano.pct_nao_possui}%</div>
                      </div>
                    </div>
                  </div>
                  {convPointDrawerData.plano.sem_informacao > 0 && (
                    <p style={{ fontSize: 11, color: 'var(--text-subtle)' }}>
                      {convPointDrawerData.plano.sem_informacao} lead(s) sem essa informação não entram no cálculo acima.
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Modal: Comparação entre Pontos de Conversão ── */}
      {convCompare && (
        <div onClick={() => setConvCompare(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-card, #fff)', borderRadius: 16, width: '100%', maxWidth: 640, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Comparação — Pontos de Conversão</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 12 }}>
                  <button
                    onClick={() => { setConvCompareLevel('month'); setConvComparePoint(null); setConvCompareWeek(null) }}
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: convCompareLevel === 'month' ? 'var(--text-1)' : '#2563EB', fontWeight: convCompareLevel === 'month' ? 700 : 500 }}
                  >
                    Mensal
                  </button>
                  {convComparePoint && (
                    <>
                      <span style={{ color: 'var(--text-subtle)' }}>›</span>
                      <button
                        onClick={() => setConvCompareLevel('week')}
                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: convCompareLevel === 'week' ? 'var(--text-1)' : '#2563EB', fontWeight: convCompareLevel === 'week' ? 700 : 500 }}
                      >
                        {convComparePoint}
                      </button>
                    </>
                  )}
                  {convCompareWeek !== null && (
                    <>
                      <span style={{ color: 'var(--text-subtle)' }}>›</span>
                      <span style={{ color: 'var(--text-1)', fontWeight: 700 }}>Semana {convCompareWeek}</span>
                    </>
                  )}
                </div>
              </div>
              <button onClick={() => setConvCompare(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: 24 }}>
              {convCompareLevel === 'month' && (
                organicBp.length === 0 ? (
                  <p style={{ textAlign: 'center', padding: '24px 0', fontSize: 13, color: 'var(--text-muted)' }}>Sem dados no período.</p>
                ) : (
                  <>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 14px' }}>Clique numa barra para ver a evolução semanal</p>
                    <div style={{ cursor: 'pointer' }}>
                      <ResponsiveContainer width="100%" height={Math.max(160, organicBp.length * 46)}>
                        <BarChart
                          data={organicBp} layout="vertical" margin={{ top: 4, right: 30, left: 8, bottom: 4 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
                          <XAxis type="number" tick={{ fontSize: 10, fill: '#94A3B8' }} allowDecimals={false} />
                          <YAxis type="category" dataKey="label" width={150} tick={{ fontSize: 11, fill: 'var(--text-2)' }} />
                          <Tooltip
                            content={({ active, payload }: any) => {
                              if (!active || !payload?.length) return null
                              return (
                                <div style={{ background: 'var(--bg-card, #fff)', border: '1px solid #E2E8F0', borderRadius: 8, padding: '6px 10px', fontSize: 12, color: 'var(--text-2)' }}>
                                  {payload[0].payload.captacoes} captações
                                </div>
                              )
                            }}
                          />
                          <Bar
                            dataKey="captacoes" radius={[0, 4, 4, 0]}
                            onClick={(entry: any) => {
                              const label = entry?.label
                              if (!label) return
                              const relevantFontes = organicFontes.filter(f => f.breakdown.some(bd => bd.label === label)).map(f => f.fonte)
                              openConvPointCompare(label, relevantFontes)
                            }}
                          >
                            {organicBp.map((b, i) => (
                              <Cell key={i} fill={b.conversao >= 30 ? '#059669' : b.conversao >= 15 ? '#F59E0B' : '#3B82F6'} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div style={{ display: 'flex', gap: 16, marginTop: 14, fontSize: 11, color: 'var(--text-muted)' }}>
                      <span><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: '#059669', marginRight: 5 }} />≥30% conversão</span>
                      <span><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: '#F59E0B', marginRight: 5 }} />≥15% conversão</span>
                      <span><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: '#3B82F6', marginRight: 5 }} />&lt;15% conversão</span>
                    </div>
                  </>
                )
              )}

              {convCompareLevel === 'week' && (
                convCompareDailyLoading ? (
                  <p style={{ textAlign: 'center', padding: '24px 0', fontSize: 13, color: 'var(--text-muted)' }}>Carregando…</p>
                ) : convCompareWeeks.length === 0 ? (
                  <p style={{ textAlign: 'center', padding: '24px 0', fontSize: 13, color: 'var(--text-muted)' }}>Sem dados no período.</p>
                ) : (
                  <>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 14px' }}>Evolução semanal</p>
                    <ResponsiveContainer width="100%" height={240}>
                      <LineChart
                        data={convCompareWeeks.map(w => ({ ...w, label: `Semana ${w.semana}` }))}
                        margin={{ top: 4, right: 20, left: -10, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94A3B8' }} />
                        <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} allowDecimals={false} />
                        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }} />
                        <Legend formatter={v => v === 'captacoes' ? 'Captações' : 'Vendas'} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                        <Line
                          type="monotone" dataKey="captacoes" name="captacoes" stroke="#3B82F6" strokeWidth={2}
                          dot={(dp: any) => (
                            <circle key={`c-${dp.payload.semana}`} cx={dp.cx} cy={dp.cy} r={5} fill="#3B82F6" stroke="#fff" strokeWidth={1.5}
                              style={{ cursor: 'pointer' }}
                              onClick={() => { setConvCompareWeek(dp.payload.semana); setConvCompareLevel('day') }} />
                          )}
                          activeDot={{ r: 7 }}
                        />
                        <Line
                          type="monotone" dataKey="vendas" name="vendas" stroke="#10B981" strokeWidth={2}
                          dot={(dp: any) => (
                            <circle key={`v-${dp.payload.semana}`} cx={dp.cx} cy={dp.cy} r={5} fill="#10B981" stroke="#fff" strokeWidth={1.5}
                              style={{ cursor: 'pointer' }}
                              onClick={() => { setConvCompareWeek(dp.payload.semana); setConvCompareLevel('day') }} />
                          )}
                          activeDot={{ r: 7 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                    <p style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 10 }}>Clique num ponto do gráfico para detalhar os dias daquela semana.</p>
                  </>
                )
              )}

              {convCompareLevel === 'day' && (
                convCompareDays.length === 0 ? (
                  <p style={{ textAlign: 'center', padding: '24px 0', fontSize: 13, color: 'var(--text-muted)' }}>Sem dados nesta semana.</p>
                ) : (
                  <>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 14px' }}>Captações diárias de {convComparePoint} · Semana {convCompareWeek}</p>
                    <ResponsiveContainer width="100%" height={240}>
                      <LineChart data={convCompareDays.map(d => ({ ...d, label: `Dia ${d.dia}` }))} margin={{ top: 4, right: 20, left: -10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94A3B8' }} />
                        <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} allowDecimals={false} />
                        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }} />
                        <Legend formatter={v => v === 'captacoes' ? 'Captações' : 'Vendas'} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                        <Line type="monotone" dataKey="captacoes" name="captacoes" stroke="#3B82F6" strokeWidth={2} dot={{ r: 4, fill: '#3B82F6' }} activeDot={{ r: 6 }} />
                        <Line type="monotone" dataKey="vendas" name="vendas" stroke="#10B981" strokeWidth={2} dot={{ r: 4, fill: '#10B981' }} activeDot={{ r: 6 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Drawer: Análise detalhada do SDR ── */}
      {sdrDrawer && (
        <>
          <div onClick={() => setSdrDrawer(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100 }} />
          <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: 420, maxWidth: '100vw', zIndex: 101,
            background: 'var(--bg-card, #fff)', boxShadow: '-8px 0 32px rgba(0,0,0,0.2)',
            display: 'flex', flexDirection: 'column', overflowY: 'auto',
          }}>
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <p style={{ fontSize: 11, color: '#2563EB', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Análise do SDR</p>
                <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', margin: '4px 0 0' }}>{sdrDrawer}</p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{month.split('-').reverse().join('/')}</p>
              </div>
              <button onClick={() => setSdrDrawer(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, marginLeft: 12, flexShrink: 0 }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '20px 24px 32px' }}>
              {sdrDrawerLoading ? (
                <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 0' }}>Carregando…</p>
              ) : !sdrDrawerData ? (
                <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px 0' }}>Não foi possível carregar os dados.</p>
              ) : (
                <>
                  {/* Funil */}
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }}>Funil</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 22 }}>
                    <div style={{ background: '#EFF6FF', borderRadius: 10, padding: '12px 14px' }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: '#3B82F6', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Captados</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: '#1D4ED8' }}>{sdrDrawerData.captacoes}</div>
                    </div>
                    <div style={{ background: '#FEF2F2', borderRadius: 10, padding: '12px 14px' }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: '#EF4444', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Perdidos</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: '#DC2626' }}>{sdrDrawerData.cancelados}</div>
                    </div>
                    <div style={{ background: '#ECFDF5', borderRadius: 10, padding: '12px 14px' }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: '#10B981', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Base líquida</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: '#059669' }}>{sdrDrawerData.base_liquida}</div>
                    </div>
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '-12px 0 20px' }}>
                    Vendas: <strong style={{ color: '#059669' }}>{sdrDrawerData.vendas}</strong> ({sdrDrawerData.conversao}% conversão) · % Perda: <strong style={{ color: '#EF4444' }}>{sdrDrawerData.pct_perda}%</strong>
                  </p>

                  {/* Receita */}
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px', paddingTop: 16, borderTop: '1px solid var(--border-lt)' }}>Receita Potencial</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 20 }}>
                    <div style={{ background: '#FFF7ED', borderRadius: 10, padding: '12px 14px' }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: '#F97316', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Total (base líquida)</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: '#C2410C' }}>{fmtBrl(sdrDrawerData.receita_potencial)}</div>
                    </div>
                    <div style={{ background: '#FFF7ED', borderRadius: 10, padding: '12px 14px' }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: '#F97316', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Ticket médio</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: '#C2410C' }}>{fmtBrl(sdrDrawerData.ticket_medio)}</div>
                    </div>
                  </div>

                  {/* Modalidade (PF x PME x demais) */}
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px', paddingTop: 16, borderTop: '1px solid var(--border-lt)' }}>Perfil do Cliente (Modalidade)</p>
                  {sdrDrawerData.modalidades.length === 0 ? (
                    <p style={{ fontSize: 12, color: 'var(--text-subtle)', marginBottom: 22 }}>Sem dados de modalidade.</p>
                  ) : (
                    <div style={{ marginBottom: 22 }}>
                      {sdrDrawerData.modalidades.map((m, i) => (
                        <div key={m.nome} style={{ marginBottom: 10 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 500 }}>{m.nome}</span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>{m.count} · {m.pct}%</span>
                          </div>
                          <div style={{ background: 'var(--border)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                            <div style={{ width: `${m.pct}%`, height: '100%', borderRadius: 4, background: CHART_COLORS[i % CHART_COLORS.length] }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Plano de saúde */}
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }}>Já Possui Plano?</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 8 }}>
                    <div style={{ background: '#ECFDF5', border: '1px solid #05966930', borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <ShieldCheck size={17} color="#059669" />
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: '#059669', lineHeight: 1.2 }}>{sdrDrawerData.plano.possui}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Possui · {sdrDrawerData.plano.pct_possui}%</div>
                      </div>
                    </div>
                    <div style={{ background: '#FEF2F2', border: '1px solid #DC262630', borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <ShieldX size={17} color="#DC2626" />
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: '#DC2626', lineHeight: 1.2 }}>{sdrDrawerData.plano.nao_possui}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Não possui · {sdrDrawerData.plano.pct_nao_possui}%</div>
                      </div>
                    </div>
                  </div>
                  {sdrDrawerData.plano.sem_informacao > 0 && (
                    <p style={{ fontSize: 11, color: 'var(--text-subtle)' }}>
                      {sdrDrawerData.plano.sem_informacao} lead(s) sem essa informação não entram no cálculo acima.
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </main>
  ) : (
    <main style={{ padding: '24px 32px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>KPIs</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>Indicadores de performance</p>
        </div>
        <input
          type="month"
          value={month}
          onChange={e => setMonth(e.target.value)}
          style={{
            background: 'var(--bg-input)', border: '1px solid var(--border-in)',
            borderRadius: 8, padding: '7px 12px', fontSize: 13,
            color: 'var(--text-2)', cursor: 'pointer',
          }}
        />
      </div>

      {/* Sub-abas */}
      <div style={{ display: 'flex', borderBottom: '2px solid #E2E8F0', marginBottom: 24 }}>
        {(['Indicadores Chave'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            padding: '8px 24px', border: 'none', background: 'none', cursor: 'pointer',
            fontSize: 14, fontWeight: activeTab === tab ? 600 : 400,
            color: activeTab === tab ? '#1E3A5F' : '#64748B',
            borderBottom: activeTab === tab ? '2px solid #1E3A5F' : '2px solid transparent',
            marginBottom: -2,
          }}>{tab}</button>
        ))}
      </div>

      {activeTab === 'Indicadores Chave' && <>
      {/* KPI Cards */}
      {!loading && data.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16, marginBottom: 20 }}>
          <div style={card('#EFF6FF', '#BFDBFE')}>
            <div style={{ fontSize: 11, color: '#3B82F6', fontWeight: 600, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>📈 Captações Totais</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: '#1D4ED8', lineHeight: 1 }}>{totalCap}</div>
            <div style={{ fontSize: 11, color: '#1E40AF', marginTop: 6 }}>Total de leads capturados</div>
          </div>

          <div style={card('#EDE9FE', '#8B5CF6')}>
            <div style={{ fontSize: 11, color: '#6D28D9', fontWeight: 600, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>📊 Taxa de Conversão</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: '#4C1D95', lineHeight: 1 }}>{taxaConv}%</div>
            <div style={{ fontSize: 11, color: '#4C1D95', marginTop: 6 }}>Vendas / Captações</div>
          </div>

          <div style={card('#FEF2F2', '#FECACA')}>
            <div style={{ fontSize: 11, color: '#EF4444', fontWeight: 600, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>❌ Cancelados</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: '#B91C1C', lineHeight: 1 }}>
              {totalCan} <span style={{ fontSize: 16, fontWeight: 400 }}>({pctCan}%)</span>
            </div>
            <div style={{ fontSize: 11, color: '#991B1B', marginTop: 6 }}>Leads perdidos</div>
          </div>

          <div style={card('#ECFDF5', '#A7F3D0')}>
            <div style={{ fontSize: 11, color: '#059669', fontWeight: 600, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>💰 Receita Potencial</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#065F46', lineHeight: 1.2 }}>{fmtBrl(receitaPotencial)}</div>
            <div style={{ fontSize: 11, color: '#065F46', marginTop: 6 }}>Valor total dos leads do mês</div>
          </div>

          <div style={card('#FFF7ED', '#FED7AA')}>
            <div style={{ fontSize: 11, color: '#F97316', fontWeight: 600, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>🎯 Melhor Fonte</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#C2410C', lineHeight: 1.2 }}>{melhorFonte?.fonte ?? '—'}</div>
            <div style={{ fontSize: 11, color: '#92400E', marginTop: 6 }}>{melhorFonte?.conversao ?? 0}% de conversão</div>
          </div>
        </div>
      )}


      {/* Alerts */}
      {!loading && data.length > 0 && pctCan > 20 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 8, padding: '11px 16px', display: 'flex', alignItems: 'center', gap: 10, color: '#EA580C', fontSize: 13, fontWeight: 600 }}>
            <AlertTriangle size={15} /> Alto índice de cancelamentos ({pctCan}%)
          </div>
        </div>
      )}

      {/* Charts */}
      {!loading && data.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 24 }}>

          {/* Ranking de Fontes */}
          <div className="bg-white rounded-xl" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)', padding: '20px 20px', overflowY: 'auto', maxHeight: 340 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', margin: '0 0 16px' }}>Performance por Fonte</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 44px 44px 54px', gap: 4, marginBottom: 8 }}>
              {[
                { label: 'Fonte', align: 'left' },
                { label: 'Cap.', align: 'right' },
                { label: 'Part.', align: 'right' },
                { label: 'Conv.', align: 'right' },
              ].map(h => (
                <span key={h.label} style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: h.align as any }}>{h.label}</span>
              ))}
            </div>
            {[...combined].sort((a, b) => b.captacoes - a.captacoes).map((r, i) => {
              const pct = totalCap > 0 ? +((r.captacoes / totalCap) * 100).toFixed(1) : 0
              const isOrg = r.fonte.toLowerCase().includes('orgân')
              const isSdrRow = r.fonte === 'SDR'
              const dotColor = isOrg ? '#10B981' : isSdrRow ? '#3B82F6' : CHART_COLORS[i % CHART_COLORS.length]
              const convColor = r.conversao >= 10 ? '#059669' : r.conversao >= 5 ? '#F59E0B' : '#EF4444'
              return (
                <div key={r.fonte} style={{ display: 'grid', gridTemplateColumns: '1fr 44px 44px 54px', gap: 4, alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--border-lt)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: isOrg || isSdrRow ? 700 : 500, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.fonte}</span>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', textAlign: 'right' }}>{r.captacoes}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, textAlign: 'right' }}>{pct}%</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: convColor, textAlign: 'right' }}>{r.conversao}%</span>
                </div>
              )
            })}
          </div>

          {/* Funnel — dark, always visible */}
          <div className="rounded-xl" style={{
            background: 'linear-gradient(135deg, #0F172A 0%, #1E1B4B 100%)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            overflow: 'hidden',
          }}>
            <div style={{ padding: '20px 24px 24px' }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: '#CBD5E1', margin: '0 0 20px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Funil de Conversão</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

                {/* Captações por fonte */}
                <div>
                  <p style={{ fontSize: 10, color: '#93C5FD', fontWeight: 700, margin: '0 0 14px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    Captações por fonte
                  </p>
                  {funnelRows.map((r, i) => {
                    const pct = totalCap > 0 ? (r.captacoes / totalCap) * 100 : 0
                    const color = CHART_COLORS[i % CHART_COLORS.length]
                    return (
                      <div key={r.fonte} style={{ marginBottom: 11 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 11, color: '#CBD5E1', maxWidth: '68%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.fonte}</span>
                          <span style={{ fontSize: 11, color: '#93C5FD', fontWeight: 700 }}>{r.captacoes}</span>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 3, height: 5, overflow: 'hidden' }}>
                          <div style={{
                            width: `${pct}%`, height: '100%',
                            background: `linear-gradient(90deg, ${color}, ${color}bb)`,
                            borderRadius: 3, boxShadow: `0 0 8px ${color}55`,
                            transition: 'width 0.7s ease',
                          }} />
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Vendas por fonte */}
                <div>
                  <p style={{ fontSize: 10, color: '#FCD34D', fontWeight: 700, margin: '0 0 14px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    Vendas por fonte
                  </p>
                  {funnelRows.filter(r => r.vendas > 0).length === 0 ? (
                    <p style={{ fontSize: 12, color: '#475569', fontStyle: 'italic' }}>Nenhuma venda no período</p>
                  ) : funnelRows.filter(r => r.vendas > 0).map((r) => {
                    const pct = totalVen > 0 ? (r.vendas / totalVen) * 100 : 0
                    return (
                      <div key={r.fonte} style={{ marginBottom: 11 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 11, color: '#CBD5E1', maxWidth: '68%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.fonte}</span>
                          <span style={{ fontSize: 11, color: '#FCD34D', fontWeight: 700 }}>{r.vendas}</span>
                        </div>
                        <div style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 3, height: 5, overflow: 'hidden' }}>
                          <div style={{
                            width: `${pct}%`, height: '100%',
                            background: 'linear-gradient(90deg, #F59E0B, #FBBF24)',
                            borderRadius: 3, boxShadow: '0 0 8px #F59E0B55',
                            transition: 'width 0.7s ease',
                          }} />
                        </div>
                      </div>
                    )
                  })}
                </div>

              </div>
            </div>
          </div>

          {/* Motivos de Cancelamento */}
          <div className="bg-white rounded-xl" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)', padding: '20px 20px', overflowY: 'auto', maxHeight: 340 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', margin: '0 0 4px' }}>Motivos de Cancelamento</p>
            <p style={{ fontSize: 11, color: 'var(--text-subtle)', margin: '0 0 14px' }}>Top razões do mês selecionado</p>
            {motivos.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-subtle)', textAlign: 'center', padding: '24px 0' }}>Nenhum cancelamento registrado.</p>
            ) : motivos.slice(0, 6).map((m, i) => {
              const barColor = i === 0 ? '#EF4444' : i === 1 ? '#F97316' : '#F59E0B'
              return (
                <div key={m.reason} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '68%' }}>{m.reason}</span>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: barColor }}>{m.count}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-subtle)', minWidth: 36, textAlign: 'right' }}>{m.pct}%</span>
                    </div>
                  </div>
                  <div style={{ background: '#F1F5F9', borderRadius: 4, height: 5, overflow: 'hidden' }}>
                    <div style={{ width: `${m.pct}%`, height: '100%', borderRadius: 4, background: barColor, transition: 'width 500ms ease' }} />
                  </div>
                </div>
              )
            })}
          </div>

        </div>
      )}

      {/* Table — Conversão por Fonte */}
      <div className="bg-white rounded-xl" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)', overflow: 'hidden', marginBottom: top5Sdr.length > 0 ? 24 : 0 }}>
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <TrendingUp size={15} color="#2563EB" />
          </div>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', margin: 0 }}>Conversão por Fonte</p>
            <p style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 2 }}>Leads captados, vendas e cancelamentos no mês selecionado</p>
          </div>
        </div>

        {loading ? (
          <p style={{ padding: '32px 24px', fontSize: 13, color: 'var(--text-subtle)' }}>Carregando...</p>
        ) : data.length === 0 ? (
          <p style={{ padding: '32px 24px', fontSize: 13, color: 'var(--text-subtle)' }}>Nenhum dado para o período selecionado.</p>
        ) : (
          <>
          <style>{`
            .kpis-row:hover > td { background: #EFF6FF !important; transition: background 0.15s ease; }
            .kpis-bp-row:hover > td { background: #F0FDF4 !important; transition: background 0.15s ease; }
          `}</style>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={colH}>Fonte</th>
                <th style={{ ...colH, textAlign: 'right' }}>Captações</th>
                <th style={{ ...colH, textAlign: 'right' }}>Vendas</th>
                <th style={{ ...colH, textAlign: 'right' }}>Cancelados</th>
                <th style={{ ...colH, width: 200 }}>Conversão</th>
              </tr>
            </thead>
            <tbody>
              {allRows.map((row, i) => renderRow(row, i))}
            </tbody>
          </table>
          </>
        )}
      </div>

      {/* Table — Top 5 SDR Performance */}
      {!loading && top5Sdr.length > 0 && (
        <div className="bg-white rounded-xl" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
          <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)' }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', margin: 0 }}>Top 5 Performance SDR</p>
            <p style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 2 }}>Ranking individual dos operadores no mês</p>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-subtle)' }}>
                <th style={{ ...colH, width: 48 }}>#</th>
                <th style={colH}>Nome</th>
                <th style={{ ...colH, textAlign: 'right' }}>Captações</th>
                <th style={{ ...colH, textAlign: 'right' }}>Vendas</th>
                <th style={{ ...colH, textAlign: 'right' }}>Taxa %</th>
              </tr>
            </thead>
            <tbody>
              {top5Sdr.map((r, i) => {
                const col: React.CSSProperties = {
                  padding: '10px 14px', fontSize: 13, color: 'var(--text-2)',
                  borderBottom: i < top5Sdr.length - 1 ? '1px solid var(--border)' : 'none',
                  background: i % 2 === 1 ? 'var(--bg-subtle)' : 'transparent',
                }
                const taxaColor = r.conversao >= 5 ? '#059669' : r.conversao > 0 ? '#F59E0B' : '#EF4444'
                return (
                  <tr key={r.fonte}>
                    <td style={{ ...col, fontSize: 17, textAlign: 'center' }}>{MEDALS[i] ?? i + 1}</td>
                    <td style={{ ...col, fontWeight: 500, color: 'var(--text-1)' }}>{r.fonte}</td>
                    <td style={{ ...col, textAlign: 'right' }}>{r.captacoes}</td>
                    <td style={{ ...col, textAlign: 'right', color: '#059669', fontWeight: 600 }}>{r.vendas}</td>
                    <td style={{ ...col, textAlign: 'right', color: taxaColor, fontWeight: 600 }}>{r.conversao}%</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}


      {/* Popover */}
      {popover && (
        <>
          <style>{`
            @keyframes popoverIn {
              from { opacity: 0; transform: translate(-50%, -48%) scale(0.93); }
              to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
            }
          `}</style>
          <div
            onClick={() => setPopover(null)}
            style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(3px)' }}
          />
          <div style={{
            position: 'fixed', top: '50%', left: '50%',
            zIndex: 50, width: 520,
            background: 'linear-gradient(135deg, #0F172A 0%, #1A1040 100%)',
            border: '1px solid rgba(124,58,237,0.45)',
            borderRadius: 18,
            padding: '32px 36px 28px',
            boxShadow: '0 32px 80px rgba(0,0,0,0.55), 0 0 48px rgba(124,58,237,0.12)',
            animation: 'popoverIn 0.22s cubic-bezier(0.34,1.56,0.64,1) forwards',
          }}>
            <button
              onClick={() => setPopover(null)}
              style={{ position: 'absolute', top: 14, right: 14, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: 6, cursor: 'pointer', color: '#64748B', display: 'flex', alignItems: 'center', lineHeight: 1 }}
            >
              <X size={14} />
            </button>

            <p style={{ fontSize: 11, color: '#7C3AED', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 6px' }}>Indicador</p>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#F1F5F9', margin: '0 0 20px', wordBreak: 'break-all', lineHeight: 1.35 }}>{popover.label}</h2>

            {(popoverLeadsLoading || (popoverLeads !== null)) && (
              <div>
                <p style={{ fontSize: 12, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px' }}>
                  Clientes fechados{popoverLeads ? ` (${popoverLeads.length})` : ' (...)'}
                </p>
                {popoverLeadsLoading ? (
                  <p style={{ fontSize: 12, color: '#334155', textAlign: 'center', padding: '8px 0' }}>Carregando...</p>
                ) : (
                  <div style={{ maxHeight: 180, overflowY: 'auto', paddingRight: 2 }}>
                    {popoverLeads!.map((lead, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: i < popoverLeads!.length - 1 ? '1px solid rgba(255,255,255,0.07)' : 'none' }}>
                        <span style={{ fontSize: 16, fontWeight: 500, color: '#E2E8F0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 14 }}>{lead.nome}</span>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 }}>
                          {lead.valor != null && (
                            <span style={{ fontSize: 16, fontWeight: 700, color: '#6EE7B7', lineHeight: 1.4 }}>
                              {lead.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </span>
                          )}
                          {lead.data && (
                            <span style={{ fontSize: 13, color: '#64748B', lineHeight: 1.4 }}>{lead.data}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
      </>}

    </main>
  )
}

