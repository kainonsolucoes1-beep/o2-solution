import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Filter, X, ChevronDown, ChevronRight } from 'lucide-react'
import api from '../api'
import { statusLabel } from '../utils/statusLabel'
import { parseUTC } from '../utils/date'
import { useTheme } from '../ThemeContext'
import { isGoogle, GOOGLE_COLOR } from '../utils/canal'
import SinoSlot, { VerComoSlot } from '../components/SinoSlot'

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
  cotacao_periodo_qtd: number
  cotacao_mes_valor: number
  cotacao_mes_qtd: number
  virtuais_periodo: number
  vs_virtuais_periodo: number
  virtuais_mes: number
  vs_virtuais_mes: number
  meta_leads: number
  meta_pct: number
  projecao_mes: number
  dias_uteis_mes: number
  ranking: { name: string; count: number; pct: number; bar_pct: number }[]
  ranking_origem_por_operador: Record<string, {
    bases: { label: string; count: number }[]
    conversion_points: { label: string; count: number }[]
  }>
  evolucao_diaria: { day: number; date: string; count: number }[]
  captacao_hoje_por_fonte: { name: string; count: number; propostas_valor: number }[]
  captacao_hoje_origem: {
    bases: { label: string; count: number }[]
    discadora?: { label: string; count: number }[]
    conversion_points: { label: string; count: number }[]
    canais: { label: string; count: number; conversion_points: { label: string; count: number }[] }[]
  }
  captacao_hoje_origem_por_operador: Record<string, {
    bases: { label: string; count: number }[]
    conversion_points: { label: string; count: number }[]
  }>
}

// Mini-gráfico de tendência dos cards do topo.
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null
  const w = 100, h = 30
  const max = Math.max(...values), min = Math.min(...values)
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 3 - ((v - min) / (max - min || 1)) * (h - 8)])
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true" style={{ width: 96, height: 30, flexShrink: 0 }}>
      <path d={`${line} L${w} ${h} L0 ${h} Z`} fill="var(--accent)" opacity={0.1} />
      <path d={line} fill="none" stroke="var(--accent)" strokeWidth={1.6} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  )
}

// cores dos grupos do "De onde vieram" (SDR/Discadora em âmbar,
// Google sempre em GOOGLE_COLOR, igual às outras telas)
const CANAL_COLORS = ['#3B82F6', '#10B981', '#EC4899', '#14B8A6', '#6366F1']

const CARD: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 1px 2px rgba(16,24,40,0.05)' }
const TITLE: React.CSSProperties = { margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }
const NUM: React.CSSProperties = { fontVariantNumeric: 'tabular-nums' }
const fmtBrl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmt1 = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

const O2_NAMES = new Set(['clara', 'maria eduarda', 'kauany', 'gabrieli', 'o2 solution', 'o2solution'])

type RankItem = { name: string; count: number; pct: number; bar_pct: number }
function mergeO2Ranking(ranking: RankItem[]): RankItem[] {
  const map: Record<string, number> = {}
  for (const r of ranking) {
    const key = O2_NAMES.has(r.name.toLowerCase()) ? 'o2 Solution' : r.name
    map[key] = (map[key] ?? 0) + r.count
  }
  const total = Object.values(map).reduce((a, b) => a + b, 0) || 1
  const sorted = Object.entries(map)
    .map(([name, count]) => ({ name, count, pct: Math.round(count / total * 1000) / 10, bar_pct: 0 }))
    .sort((a, b) => b.count - a.count)
  const maxCount = sorted[0]?.count || 1
  return sorted.map(r => ({ ...r, bar_pct: Math.round(r.count / maxCount * 100) }))
}

function origemItemsFor(map: PerformanceData['ranking_origem_por_operador'], name: string) {
  const o = map[name]
  if (!o) return []
  return [
    ...o.conversion_points.map(it => ({ ...it, dot: '#3B82F6' })),
    ...o.bases.map(it => ({ ...it, dot: '#F59E0B' })),
  ].sort((a, b) => b.count - a.count)
}

// "De onde vieram" de um operador: inline, empurra o resto da lista pra baixo.
function RankOrigemInline({ name, items }: { name: string; items: { label: string; count: number; dot: string }[] }) {
  if (items.length === 0) return null
  return (
    <div style={{ margin: '0 20px 10px 66px', padding: '10px 12px', background: 'var(--bg-subtle)', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <p style={{ margin: '0 0 2px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-subtle)' }}>De onde vieram os leads de {name}</p>
      {items.map(it => (
        <div key={it.label} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--text-2)' }}>
          <span style={{ width: 7, height: 7, borderRadius: 2, background: it.dot, flexShrink: 0 }} />
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span>
          <span style={{ fontWeight: 700, color: 'var(--text-1)', flexShrink: 0, width: 18, textAlign: 'right' }}>{it.count}</span>
        </div>
      ))}
    </div>
  )
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const fmtBR = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
const fmtBRShort = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

// Feriados nacionais do Brasil (fixos + móveis a partir da Páscoa). Usado no
// atalho "dia útil anterior" e pra marcar dia útil no gráfico/ritmo.
function easterSunday(year: number): Date {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}
function brHolidays(year: number): Set<string> {
  const easter = easterSunday(year)
  const shift = (n: number) => { const x = new Date(easter); x.setDate(x.getDate() + n); return iso(x) }
  return new Set([
    `${year}-01-01`, `${year}-04-21`, `${year}-05-01`, `${year}-09-07`,
    `${year}-10-12`, `${year}-11-02`, `${year}-11-15`, `${year}-11-20`, `${year}-12-25`,
    shift(-48), shift(-47), shift(-2), shift(60), // carnaval seg/ter, sexta santa, corpus christi
  ])
}
function isBusinessDay(d: Date): boolean {
  const dow = d.getDay()
  return dow !== 0 && dow !== 6 && !brHolidays(d.getFullYear()).has(iso(d))
}
function lastBusinessDayISO(from: Date): string {
  const d = new Date(from)
  d.setDate(d.getDate() - 1)
  for (let guard = 0; guard < 40; guard++) {
    if (isBusinessDay(d)) return iso(d)
    d.setDate(d.getDate() - 1)
  }
  return iso(d)
}


const todayStr = new Date().toISOString().slice(0, 10)

export default function Dashboard() {
  const navigate = useNavigate()
  const { dark } = useTheme()
  const [data, setData] = useState<PerformanceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<{ from: string; to: string } | null>(null)
  // 'dia' = hoje (ou o dia/período do filtro); 'mes' = acumulado do mês
  const [period, setPeriod] = useState<'dia' | 'mes'>('dia')
  // 'base' = SDR; senão, o nome do canal aberto (Google, Orgânico...)
  const [origemOpen, setOrigemOpen] = useState<string | null>(null)
  const [rankOpen, setRankOpen] = useState<string | null>(null)
  const [rankSort, setRankSort] = useState<'count' | 'valor'>('count')
  const [hoverDay, setHoverDay] = useState<number | null>(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const [draftFrom, setDraftFrom] = useState('')
  const [draftTo, setDraftTo] = useState('')
  const [filterErr, setFilterErr] = useState('')
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [feedOpen, setFeedOpen] = useState(false)

  // Contadores de geração — ignora resposta se, quando ela chega, já não é
  // mais a última chamada em andamento (evita resposta antiga de um dia
  // anterior sobrescrever a tela depois de trocar a data rápido, inclusive
  // contra o polling de 45s abaixo).
  const fetchAllGenRef = useRef(0)
  const fetchSideGenRef = useRef(0)

  const fetchAll = useCallback((f: { from: string; to: string } | null, silent = false) => {
    if (!localStorage.getItem('token')) { navigate('/login'); return }
    const gen = ++fetchAllGenRef.current
    if (!silent) setLoading(true)
    const params: Record<string, string> = {}
    if (f) { params.date = f.from; if (f.to !== f.from) params.date_to = f.to }
    api.get<PerformanceData>('/api/v1/dashboard/performance', { params })
      .then(r => { if (fetchAllGenRef.current === gen) { setData(r.data); if (!silent) setOrigemOpen(null) } })
      .catch(err => {
        if (fetchAllGenRef.current !== gen) return
        if (err.response?.status === 401) { localStorage.removeItem('token'); navigate('/login') }
        else if (!silent) setError('Erro ao carregar dashboard.')
      })
      .finally(() => { if (fetchAllGenRef.current === gen && !silent) setLoading(false) })
  }, [navigate])

  const fetchSide = useCallback(() => {
    const gen = ++fetchSideGenRef.current
    api.get<FeedItem[]>('/api/v1/dashboard/activity-feed')
      .then(r => { if (fetchSideGenRef.current === gen) setFeed(r.data) })
      .catch(() => {})
  }, [])

  useEffect(() => { fetchAll(filter) }, [fetchAll, filter])
  useEffect(() => { fetchSide() }, [fetchSide])

  useEffect(() => {
    if (filter) return   // vista histórica não precisa de polling
    const id = setInterval(() => { fetchAll(null, true); fetchSide() }, 45000)
    return () => clearInterval(id)
  }, [fetchAll, fetchSide, filter])

  useEffect(() => {
    if (!filterOpen) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setFilterOpen(false) }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [filterOpen])

  function openFilter() {
    setDraftFrom(filter?.from ?? todayStr)
    setDraftTo(filter?.to ?? todayStr)
    setFilterErr('')
    setFilterOpen(o => !o)
  }

  function applyRange() {
    if (!draftFrom || !draftTo) { setFilterErr('Escolha as duas datas.'); return }
    const a = draftFrom <= draftTo ? draftFrom : draftTo
    const b = draftFrom <= draftTo ? draftTo : draftFrom
    if (a.slice(0, 7) !== b.slice(0, 7)) { setFilterErr('As duas datas precisam ser do mesmo mês.'); return }
    setFilterErr('')
    setFilter(a === todayStr && b === todayStr ? null : { from: a, to: b })
    setFilterOpen(false)
  }

  function applyLastBusinessDay() {
    const d = lastBusinessDayISO(new Date())
    setFilter({ from: d, to: d })
    setFilterOpen(false)
  }

  function clearFilter() {
    setFilter(null)
    setFilterOpen(false)
  }


  if (loading) return <p className="text-center text-sm mt-20" style={{ color: 'var(--text-subtle)' }}>Carregando...</p>
  if (error || !data) return <p className="text-center text-sm mt-20" style={{ color: '#EF4444' }}>{error || 'Sem dados.'}</p>

  const metaLeads = data.meta_leads ?? 200
  const single = !!filter && filter.from === filter.to
  const refDate = filter ? new Date(filter.to + 'T12:00:00') : new Date()
  const mesCurto = refDate.toLocaleString('pt-BR', { month: 'long' })
  const mesLabel = mesCurto.charAt(0).toUpperCase() + mesCurto.slice(1)
  const diaLabel = !filter ? 'Hoje' : single ? fmtBR(filter.from) : `${fmtBRShort(filter.from)} – ${fmtBRShort(filter.to)}`
  const isDia = period === 'dia'
  const periodoLabel = isDia ? diaLabel.toLowerCase() === 'hoje' ? 'hoje' : diaLabel : mesCurto

  // Calendário do mês de referência
  const ano = refDate.getFullYear(), mes = refDate.getMonth(), refDay = refDate.getDate()
  const diasNoMes = new Date(ano, mes + 1, 0).getDate()
  const util = (d: number) => isBusinessDay(new Date(ano, mes, d))
  let decorridos = 0
  for (let d = 1; d <= refDay; d++) if (util(d)) decorridos++
  const dataLonga = refDate.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  // Meta + projeção
  const captMes = data.captacao_mes ?? 0
  const projecao = data.projecao_mes ?? 0
  const projDelta = projecao - metaLeads
  const projPct = metaLeads > 0 ? Math.round(projecao / metaLeads * 100) : 0
  const diasUteisMes = data.dias_uteis_mes ?? 0
  const metaPorDia = diasUteisMes > 0 ? metaLeads / diasUteisMes : 0
  const ritmoAtual = decorridos > 0 ? captMes / decorridos : 0
  const faltam = Math.max(metaLeads - captMes, 0)

  // Cards do topo
  const evo = data.evolucao_diaria
  const evoIdx = evo.findIndex(d => d.day === refDay)
  const sparkDia = (evoIdx >= 0 ? evo.slice(Math.max(0, evoIdx - 13), evoIdx + 1) : evo.slice(-14)).map(d => d.count)
  let acc = 0
  const sparkMes = evo.map(d => (acc += d.count))
  const propostasDia = data.captacao_hoje_por_fonte.reduce((s, op) => s + (op.propostas_valor || 0), 0)
  const cotValor = isDia ? propostasDia : data.cotacao_mes_valor
  const cotQtd = isDia ? data.cotacao_periodo_qtd : data.cotacao_mes_qtd
  const vsDia = !filter ? 'vs. ontem' : 'vs. período anterior'
  const kpis: { label: string; value: string; delta?: number; foot?: string; spark?: number[]; onClick?: () => void }[] = [
    {
      label: 'Captação',
      value: String(isDia ? data.captacao_hoje : captMes),
      delta: isDia ? data.vs_ontem : data.vs_mes_anterior_captacao,
      foot: isDia ? vsDia : 'vs. mês anterior',
      spark: isDia ? sparkDia : sparkMes,
    },
    isDia
      ? { label: 'Cotação enviada', value: fmtBrl(propostasDia), foot: 'leads do dia com cotação enviada' }
      : { label: 'Em carteira', value: fmtBrl(data.valor_carteira), delta: data.vs_carteira, foot: 'vs. mês anterior' },
    {
      label: 'Ticket médio',
      value: cotQtd > 0 ? fmtBrl(cotValor / cotQtd) : '—',
      foot: isDia ? `das cotações enviadas ${periodoLabel === 'hoje' ? 'hoje' : 'no período'}` : 'das cotações enviadas no mês',
    },
    {
      label: 'Virtuais agendadas',
      value: String(isDia ? data.virtuais_periodo : data.virtuais_mes),
      delta: isDia ? data.vs_virtuais_periodo : data.vs_virtuais_mes,
      foot: isDia ? vsDia : 'vs. mês anterior',
    },
  ]

  // Gráfico de captação por dia
  const dayMap: Record<number, { date: string; count: number }> = {}
  for (const d of evo) dayMap[d.day] = d
  const barMax = Math.max(...evo.map(d => d.count), Math.ceil(metaPorDia), 1) * 1.12
  const hv = hoverDay !== null && dayMap[hoverDay] ? hoverDay : null
  const chartText = hv
    ? `${hv} de ${mesCurto} · ${dayMap[hv].count} lead${dayMap[hv].count !== 1 ? 's' : ''}${util(hv) ? '' : ' · fim de semana/feriado'}`
    : `${captMes} leads em ${refDay} dia${refDay !== 1 ? 's' : ''} · média ${fmt1(ritmoAtual)} por dia útil`

  // Ranking
  type Row = { name: string; count: number; valor?: number; pct?: number }
  const rowsDia: Row[] = data.captacao_hoje_por_fonte.map(op => ({ name: op.name, count: op.count, valor: op.propostas_valor }))
  const rowsMes: Row[] = mergeO2Ranking(data.ranking).map(op => ({ name: op.name, count: op.count, pct: op.pct }))
  const rows = isDia
    ? [...rowsDia].sort((a, b) => rankSort === 'valor' ? (b.valor ?? 0) - (a.valor ?? 0) : b.count - a.count)
    : rowsMes
  const rowTop = Math.max(...rows.map(r => r.count), 1)
  const origemMap = isDia ? data.captacao_hoje_origem_por_operador : data.ranking_origem_por_operador
  const rkCols = '1fr 96px 140px'
  const sortBtn = (key: 'count' | 'valor', label: string) => (
    <button
      onClick={() => isDia && setRankSort(key)}
      style={{ background: 'none', border: 'none', padding: 0, fontFamily: 'inherit', fontSize: 11.5, cursor: isDia ? 'pointer' : 'default', textAlign: 'right',
        fontWeight: isDia && rankSort === key ? 650 : 550, color: isDia && rankSort === key ? 'var(--text-1)' : 'var(--text-muted)' }}
    >
      {label}{isDia && rankSort === key ? ' ↓' : ''}
    </button>
  )

  // De onde vieram (sempre o dia/período): um grupo por canal + Discadora + SDR
  const bases = data.captacao_hoje_origem.bases
  const discadora = data.captacao_hoje_origem.discadora ?? []
  const grupos = [
    ...data.captacao_hoje_origem.canais.map((c, i) => ({
      key: c.label, label: c.label, count: c.count, items: c.conversion_points,
      color: isGoogle(c.label) ? GOOGLE_COLOR : CANAL_COLORS[i % CANAL_COLORS.length],
    })),
    ...(discadora.length ? [{ key: 'discadora', label: 'Discadora', count: discadora.reduce((s, it) => s + it.count, 0), items: discadora, color: '#F59E0B' }] : []),
    ...(bases.length ? [{ key: 'base', label: 'SDR', count: bases.reduce((s, it) => s + it.count, 0), items: bases, color: '#B45309' }] : []),
  ]
  const origemTotal = grupos.reduce((s, g) => s + g.count, 0)

  const segBtn = (key: 'dia' | 'mes', label: string) => (
    <button
      onClick={() => setPeriod(key)}
      style={{ height: 32, padding: '0 14px', border: 'none', borderRadius: 7, fontFamily: 'inherit', fontSize: 13, fontWeight: 550, cursor: 'pointer',
        background: period === key ? 'var(--bg-card)' : 'transparent', color: period === key ? 'var(--text-1)' : 'var(--text-muted)',
        boxShadow: period === key ? '0 1px 2px rgba(0,0,0,0.12)' : 'none' }}
    >
      {label}
    </button>
  )

  return (
    <main className="px-4 md:px-8 xl:px-12 py-6 flex flex-col gap-4" style={{ background: dark ? 'transparent' : '#EEF1F5', minHeight: '100%' }}>

      <header style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', paddingBottom: 4 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {!filter && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-muted)' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--success)', boxShadow: '0 0 0 3px var(--success-weak)' }} />
              Ao vivo
            </span>
          )}
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 650, letterSpacing: '-0.02em', color: 'var(--text-1)' }}>Dashboard</h1>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
            {dataLonga.charAt(0).toUpperCase() + dataLonga.slice(1)} · dia útil {decorridos} de {diasUteisMes}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', position: 'relative' }}>
          {filter && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 99, padding: '4px 10px 4px 12px' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#2563EB' }}>{diaLabel}</span>
              <button onClick={clearFilter} aria-label="Limpar filtro" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2563EB', display: 'flex', alignItems: 'center', padding: 0 }}>
                <X size={13} />
              </button>
            </div>
          )}
          <VerComoSlot />
          <div role="group" aria-label="Período" style={{ display: 'flex', padding: 3, gap: 2, background: 'var(--bg-subtle)', borderRadius: 9 }}>
            {segBtn('dia', diaLabel)}
            {segBtn('mes', mesLabel)}
          </div>
          <div style={{ position: 'relative' }}>
            <button
              onClick={openFilter}
              style={{ display: 'flex', alignItems: 'center', gap: 6, height: 38, padding: '0 14px', borderRadius: 9, border: `1px solid ${filter ? '#2563EB' : 'var(--border)'}`, background: filter ? 'rgba(37,99,235,0.08)' : 'var(--bg-card)', color: filter ? '#2563EB' : 'var(--text-muted)', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
            >
              <Filter size={14} />
              Filtros
            </button>
            {filterOpen && (
              <>
                <div onClick={() => setFilterOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 19 }} />
                <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 20, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, boxShadow: '0 8px 28px rgba(15,23,42,0.16)', width: 292 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Filtros</p>

                  <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3b)', marginBottom: 7 }}>
                    Entre datas <span style={{ fontWeight: 400, color: 'var(--text-subtle)' }}>· mesmo mês</span>
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input type="date" value={draftFrom} max={todayStr}
                      onChange={e => { setDraftFrom(e.target.value); setFilterErr('') }}
                      style={{ flex: 1, minWidth: 0, fontSize: 12.5, padding: '6px 8px', borderRadius: 7, border: '1px solid var(--border-in)', color: 'var(--text-2)', background: 'var(--bg-input)', outline: 'none' }} />
                    <input type="date" value={draftTo} max={todayStr} min={draftFrom || undefined}
                      onChange={e => { setDraftTo(e.target.value); setFilterErr('') }}
                      style={{ flex: 1, minWidth: 0, fontSize: 12.5, padding: '6px 8px', borderRadius: 7, border: '1px solid var(--border-in)', color: 'var(--text-2)', background: 'var(--bg-input)', outline: 'none' }} />
                  </div>
                  {filterErr && <p style={{ fontSize: 11, color: '#EF4444', marginTop: 6 }}>{filterErr}</p>}
                  <button onClick={applyRange}
                    style={{ width: '100%', marginTop: 10, padding: '8px 12px', borderRadius: 8, border: 'none', background: '#2563EB', color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                    Aplicar
                  </button>

                  <div style={{ height: 1, background: 'var(--border-lt)', margin: '14px 0' }} />

                  <button onClick={applyLastBusinessDay}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-3b)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                    Dia útil anterior
                  </button>
                  <p style={{ fontSize: 10.5, color: 'var(--text-subtle)', marginTop: 5 }}>Pula sábado, domingo e feriados nacionais.</p>

                  {filter && (
                    <button onClick={clearFilter}
                      style={{ width: '100%', marginTop: 12, padding: '4px', border: 'none', background: 'none', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      Limpar filtro
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
          <SinoSlot />
        </div>
      </header>

      {/* Indicadores */}
      <section aria-label="Indicadores" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 12 }}>
        {kpis.map(k => {
          const up = (k.delta ?? 0) >= 0
          const body = (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-muted)' }}>{k.label}</span>
                {k.delta !== undefined && k.delta !== 0 && (
                  <span style={{ ...NUM, fontSize: 11.5, fontWeight: 600, padding: '2px 7px', borderRadius: 999, color: up ? 'var(--success)' : 'var(--danger)', background: up ? 'var(--success-weak)' : 'var(--danger-weak)' }}>
                    {up ? '↑' : '↓'} {Math.abs(k.delta)}%
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ ...NUM, fontSize: 26, fontWeight: 650, letterSpacing: '-0.02em', lineHeight: 1, color: 'var(--text-1)', whiteSpace: 'nowrap' }}>{k.value}</span>
                {k.spark && <Sparkline values={k.spark} />}
              </div>
              <span style={{ fontSize: 11.5, color: 'var(--text-subtle)', minHeight: 15 }}>{k.foot}</span>
            </>
          )
          const style: React.CSSProperties = { ...CARD, padding: '16px 18px 14px', display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left', fontFamily: 'inherit', width: '100%' }
          return k.onClick
            ? <button key={k.label} className="bg-white" onClick={k.onClick} style={{ ...style, cursor: 'pointer' }}>{body}</button>
            : <div key={k.label} className="bg-white" style={style}>{body}</div>
        })}
      </section>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {/* Captação por dia */}
        <section aria-label="Captação por dia" className="bg-white" style={{ ...CARD, flex: '999 1 560px', minWidth: 0, padding: '18px 20px 14px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 18 }}>
            <div>
              <h2 style={TITLE}>Captação por dia</h2>
              <p style={{ ...NUM, margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>{chartText}</p>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 11.5, color: 'var(--text-muted)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: 'var(--accent)' }} />Dia útil</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: 'var(--border-in)' }} />Fim de semana / feriado</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 14, borderTop: '1.5px dashed var(--warning)' }} />Ritmo da meta</span>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <div onMouseLeave={() => setHoverDay(null)} style={{ position: 'relative', height: 220, minWidth: 520, display: 'flex', alignItems: 'flex-end', gap: 4, borderBottom: '1px solid var(--border)' }}>
              {metaPorDia > 0 && (
                <div aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, bottom: `${(metaPorDia / barMax) * 100}%`, borderTop: '1.5px dashed var(--warning)', pointerEvents: 'none' }} />
              )}
              {Array.from({ length: diasNoMes }, (_, i) => i + 1).map(d => {
                const item = dayMap[d]
                const fut = !item
                const active = hv === d
                const h = fut ? 4 : Math.max((item.count / barMax) * 100, 1.5)
                return (
                  <div key={d} style={{ flex: 1, height: '100%', position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                    {active && (
                      <div style={{ ...NUM, position: 'absolute', left: '50%', bottom: `calc(${h}% + 8px)`, transform: 'translateX(-50%)', background: 'var(--text-1)', color: 'var(--bg-card)', fontSize: 11.5, fontWeight: 600, padding: '4px 8px', borderRadius: 6, whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 2 }}>
                        {d}/{String(mes + 1).padStart(2, '0')} · {item.count}
                      </div>
                    )}
                    <button
                      disabled={fut}
                      onMouseEnter={() => setHoverDay(d)}
                      onFocus={() => setHoverDay(d)}
                      onClick={() => item && navigate(`/leads-report?date_from=${item.date}&date_to=${item.date}`)}
                      aria-label={fut ? `Dia ${d}` : `Dia ${d}: ${item.count} leads`}
                      title={fut ? undefined : 'Ver os leads do dia'}
                      style={{
                        width: '100%', height: `${h}%`, minHeight: 3, padding: 0, borderRadius: '4px 4px 1px 1px',
                        border: fut ? '1px dashed var(--border)' : 'none',
                        background: fut ? 'transparent' : util(d) ? 'var(--accent)' : 'var(--border-in)',
                        opacity: hv !== null && !active ? 0.45 : 1, cursor: fut ? 'default' : 'pointer', transition: 'opacity 150ms',
                      }}
                    />
                  </div>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 4, minWidth: 520, marginTop: 6 }}>
              {Array.from({ length: diasNoMes }, (_, i) => i + 1).map(d => (
                <span key={d} style={{ ...NUM, flex: 1, textAlign: 'center', fontSize: 10.5, color: d === refDay ? 'var(--text-1)' : 'var(--text-subtle)', fontWeight: d === refDay ? 600 : 400 }}>
                  {d === 1 || d % 5 === 0 || d === refDay ? d : ''}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Meta do mês */}
        <section aria-label="Meta do mês" className="bg-white" style={{ ...CARD, flex: '1 1 320px', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
            <h2 style={TITLE}>Meta de {mesCurto}</h2>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{decorridos} de {diasUteisMes} dias úteis</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ ...NUM, fontSize: 44, fontWeight: 650, letterSpacing: '-0.03em', lineHeight: 1, color: 'var(--text-1)' }}>{data.meta_pct}%</span>
            <span style={{ ...NUM, fontSize: 13, color: 'var(--text-muted)' }}>{captMes} de {metaLeads} leads</span>
          </div>
          <div>
            <div style={{ position: 'relative', height: 10, borderRadius: 999, background: 'var(--bg-subtle)', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', inset: 0, width: `${Math.min(Math.max(projPct, 0), 100)}%`, background: 'var(--accent)', opacity: 0.25, borderRadius: 999 }} />
              <div style={{ position: 'absolute', inset: 0, width: `${Math.min(data.meta_pct, 100)}%`, background: 'var(--accent)', borderRadius: 999, transition: 'width 700ms ease' }} />
            </div>
            <div style={{ ...NUM, display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11.5, color: 'var(--text-subtle)' }}>
              <span>Realizado {captMes}</span><span>Projeção {projecao}</span><span>Meta {metaLeads}</span>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1, background: 'var(--border)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            {[
              { label: 'Projeção do mês', value: String(projecao), extra: projDelta === 0 ? '' : projDelta > 0 ? `+${projDelta}` : `−${Math.abs(projDelta)}`, extraColor: projDelta >= 0 ? 'var(--success)' : 'var(--danger)' },
              { label: 'Faltam', value: `${faltam} lead${faltam !== 1 ? 's' : ''}` },
              { label: 'Ritmo atual', value: fmt1(ritmoAtual), unit: ' /dia útil' },
              { label: 'Ritmo necessário', value: metaPorDia > 0 ? String(Math.ceil(metaPorDia)) : '—', unit: ' /dia útil' },
            ].map(c => (
              <div key={c.label} className="bg-white" style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{c.label}</span>
                <span style={{ ...NUM, fontSize: 18, fontWeight: 600, color: 'var(--text-1)' }}>
                  {c.value}
                  {c.extra && <span style={{ fontSize: 12, fontWeight: 600, marginLeft: 6, color: c.extraColor }}>{c.extra}</span>}
                  {c.unit && <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' }}>{c.unit}</span>}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' }}>
        {/* Ranking */}
        <section aria-label="Ranking de operadores" className="bg-white" style={{ ...CARD, flex: '999 1 560px', minWidth: 0, overflow: 'hidden' }}>
          <div style={{ padding: '18px 20px 12px' }}>
            <h2 style={TITLE}>Ranking de operadores · {periodoLabel}</h2>
          </div>
          {rows.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-subtle)', padding: '0 20px 20px', margin: 0 }}>Sem captações {isDia ? (filter && !single ? 'no período' : filter ? 'nesse dia' : 'hoje') : 'no mês'}.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <div style={{ minWidth: 440 }}>
                <div style={{ display: 'grid', gridTemplateColumns: rkCols, gap: 12, alignItems: 'center', padding: '9px 20px', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', background: 'var(--bg-subtle)' }}>
                  <span style={{ fontSize: 11.5, fontWeight: 550, color: 'var(--text-muted)' }}>Operador</span>
                  <span style={{ textAlign: 'right' }}>{sortBtn('count', 'Captação')}</span>
                  <span style={{ textAlign: 'right' }}>{isDia ? sortBtn('valor', 'Cotação enviada') : <span style={{ fontSize: 11.5, fontWeight: 550, color: 'var(--text-muted)' }}>Participação</span>}</span>
                </div>
                {rows.map((r, i) => {
                  const items = origemItemsFor(origemMap, r.name)
                  const open = rankOpen === r.name
                  const semOp = r.name === 'Sem operador'
                  return (
                    <div key={r.name} style={{ borderBottom: '1px solid var(--border-lt)' }}>
                      <button
                        onClick={() => items.length && setRankOpen(o => o === r.name ? null : r.name)}
                        aria-expanded={items.length ? open : undefined}
                        style={{ display: 'grid', gridTemplateColumns: rkCols, gap: 12, alignItems: 'center', width: '100%', padding: '10px 20px', border: 'none', background: open ? 'var(--bg-hover)' : 'transparent', fontFamily: 'inherit', textAlign: 'left', cursor: items.length ? 'pointer' : 'default' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                        onMouseLeave={e => (e.currentTarget.style.background = open ? 'var(--bg-hover)' : 'transparent')}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                          <span style={{ ...NUM, width: 16, fontSize: 12, color: 'var(--text-subtle)', flexShrink: 0 }}>{i + 1}</span>
                          <span style={{ width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, background: 'var(--accent-weak)', color: 'var(--accent)', flexShrink: 0 }}>
                            {semOp ? '—' : r.name.slice(0, 2).toUpperCase()}
                          </span>
                          <span style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0, flex: 1 }}>
                            <span style={{ fontSize: 13, fontWeight: 550, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                            <span style={{ height: 3, borderRadius: 3, background: 'var(--bg-subtle)', overflow: 'hidden', maxWidth: 160 }}>
                              <span style={{ display: 'block', height: '100%', width: `${(r.count / rowTop) * 100}%`, background: 'var(--accent)' }} />
                            </span>
                          </span>
                        </span>
                        <span style={{ ...NUM, textAlign: 'right', fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{r.count}</span>
                        <span style={{ ...NUM, textAlign: 'right', fontSize: 13, color: 'var(--text-2)' }}>
                          {isDia ? (r.valor && r.valor > 0 ? fmtBrl(r.valor) : <span style={{ color: 'var(--text-subtle)' }}>—</span>) : `${r.pct}%`}
                        </span>
                      </button>
                      {open && <RankOrigemInline name={r.name} items={items} />}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </section>

        {/* De onde vieram */}
        <section aria-label="De onde vieram" className="bg-white" style={{ ...CARD, flex: '1 1 320px', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
            <h2 style={TITLE}>De onde vieram · {diaLabel.toLowerCase() === 'hoje' ? 'hoje' : diaLabel}</h2>
            <span style={{ ...NUM, fontSize: 12, color: 'var(--text-muted)' }}>{origemTotal} lead{origemTotal !== 1 ? 's' : ''}</span>
          </div>
          {grupos.length === 0 ? (
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-subtle)' }}>Sem captações {filter && !single ? 'no período' : 'no dia'}.</p>
          ) : (
            <>
              <div style={{ display: 'flex', height: 12, borderRadius: 999, overflow: 'hidden', gap: 2 }}>
                {grupos.map(g => (
                  <span key={g.key} style={{ width: `${(g.count / origemTotal) * 100}%`, background: g.color, opacity: origemOpen && origemOpen !== g.key ? 0.4 : 1, transition: 'opacity 150ms' }} />
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {grupos.map(g => {
                  const sel = origemOpen === g.key
                  const gMax = Math.max(...g.items.map(it => it.count), 1)
                  return (
                    <div key={g.key}>
                      <button
                        onClick={() => setOrigemOpen(o => o === g.key ? null : g.key)}
                        aria-expanded={sel}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 8px', border: 'none', borderRadius: 8, background: sel ? 'var(--bg-hover)' : 'transparent', color: 'var(--text-1)', fontFamily: 'inherit', fontSize: 13, cursor: 'pointer', textAlign: 'left', opacity: origemOpen && !sel ? 0.55 : 1 }}
                      >
                        <span style={{ width: 9, height: 9, borderRadius: 3, background: g.color, flexShrink: 0 }} />
                        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.label}</span>
                        <span style={{ ...NUM, fontWeight: 600 }}>{g.count}</span>
                        <span style={{ ...NUM, width: 40, textAlign: 'right', color: 'var(--text-muted)', fontSize: 12 }}>{Math.round((g.count / origemTotal) * 100)}%</span>
                      </button>
                      {sel && g.items.length > 0 && (
                        <div style={{ margin: '2px 8px 8px 27px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {g.items.map(it => (
                            <div key={it.label} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: 'var(--text-2)', padding: '3px 0' }}>
                              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span>
                              <span style={{ width: 56, height: 5, borderRadius: 999, background: 'var(--bg-subtle)', overflow: 'hidden', flexShrink: 0 }}>
                                <span style={{ display: 'block', height: '100%', width: `${(it.count / gMax) * 100}%`, background: g.color, borderRadius: 999 }} />
                              </span>
                              <span style={{ ...NUM, fontWeight: 600, color: 'var(--text-1)', width: 22, textAlign: 'right', flexShrink: 0 }}>{it.count}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </section>
      </div>

      {/* Feed de atividades */}
      <div className="bg-white" style={{ ...CARD, overflow: 'hidden' }}>
        <button
          onClick={() => setFeedOpen(o => !o)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 20px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            borderBottom: feedOpen ? '1px solid var(--border-lt)' : 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {feedOpen ? <ChevronDown size={15} color="var(--text-muted)" /> : <ChevronRight size={15} color="var(--text-muted)" />}
            <span style={TITLE}>Atividades recentes</span>
            {feed.length > 0 && (
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-weak)', borderRadius: 99, padding: '1px 8px' }}>
                {feed.length}
              </span>
            )}
          </div>
        </button>

        {feedOpen && (
          <div style={{ padding: '8px 20px 16px' }}>
            {feed.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-subtle)', paddingTop: 8 }}>Nenhuma atividade registrada.</p>
            ) : (
              feed.map((item, i) => {
                const dt = new Date(parseUTC(item.changed_at))
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
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
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
              })
            )}
          </div>
        )}
      </div>

    </main>
  )
}
