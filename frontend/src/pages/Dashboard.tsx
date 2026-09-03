import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { TrendingUp, TrendingDown, Zap, Filter, X, ChevronDown, ChevronRight } from 'lucide-react'
import api from '../api'
import { statusLabel } from '../utils/statusLabel'
import { parseUTC } from '../utils/date'
import { useTheme } from '../ThemeContext'

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
  dias_uteis_mes: number
  ranking: { name: string; count: number; pct: number; bar_pct: number }[]
  evolucao_diaria: { day: number; date: string; count: number }[]
  captacao_hoje_por_fonte: { name: string; count: number }[]
  captacao_hoje_origem: {
    bases: { label: string; count: number }[]
    conversion_points: { label: string; count: number }[]
  }
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
  label, value, trend, trendLabel, Icon, iconBg, iconColor, subtitle, chart,
}: {
  label: string; value: string; trend?: number; trendLabel?: string
  Icon: React.ElementType; iconBg: string; iconColor: string; subtitle?: string
  chart?: React.ReactNode
}) {
  return (
    <div
      className="bg-white rounded-xl flex flex-col gap-3"
      style={{
        padding: '20px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        border: '1px solid transparent',
        transition: 'transform 200ms, box-shadow 200ms',
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.1)' }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08)' }}
    >
      <div style={{ width: 38, height: 38, borderRadius: 10, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={19} color={iconColor} />
      </div>
      <div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, marginBottom: 4 }}>{label}</p>
        <p style={{ fontSize: 26, fontWeight: 700, color: 'var(--text-1)', lineHeight: 1, letterSpacing: '-0.5px' }}>{value}</p>
        {subtitle && <p style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 4 }}>{subtitle}</p>}
      </div>
      {chart}
      {trend !== undefined && trendLabel !== undefined && <Trend value={trend} label={trendLabel} />}
    </div>
  )
}

// Mini-gráfico dos últimos dias — substitui o "0% vs ontem" na captação do dia.
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null
  const w = 120, h = 34
  const max = Math.max(...values, 1)
  const x = (i: number) => (i / (values.length - 1)) * (w - 2) + 1
  const y = (v: number) => (h - 3) - (v / max) * (h - 8)
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const area = `1,${h} ${pts} ${w - 1},${h}`
  const last = values.length - 1
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height: 34, marginTop: 2 }}>
      <polygon points={area} fill="rgba(59,130,246,0.12)" />
      <polyline points={pts} fill="none" stroke="#3B82F6" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last)} cy={y(values[last])} r={2.6} fill="#3B82F6" />
    </svg>
  )
}

// Subseção de "De onde vieram". Vira accordion (fechado por padrão) quando a
// lista é longa — o que acontece ao filtrar intervalos grandes.
function OrigemGroup({ dot, label, items }: { dot: string; label: string; items: { label: string; count: number }[] }) {
  const long = items.length > 6
  const [open, setOpen] = useState(!long)
  return (
    <div>
      <button
        type="button"
        onClick={() => long && setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, width: '100%',
          background: 'none', border: 'none', padding: 0, textAlign: 'left',
          cursor: long ? 'pointer' : 'default',
          fontSize: 10, fontWeight: 700, color: 'var(--text-2)',
          textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: open ? 4 : 0,
        }}
      >
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: dot, flexShrink: 0 }} />
        {label}
        <span style={{ color: 'var(--text-subtle)' }}>· {items.length}</span>
        {long && (
          <span style={{ marginLeft: 'auto', display: 'flex' }}>
            {open ? <ChevronDown size={12} color="var(--text-subtle)" /> : <ChevronRight size={12} color="var(--text-subtle)" />}
          </span>
        )}
      </button>
      {open && items.map(it => (
        <div key={it.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12, color: 'var(--text-2)', padding: '2px 0' }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span>
          <span style={{ fontWeight: 700, color: 'var(--text-1)', flexShrink: 0 }}>{it.count}</span>
        </div>
      ))}
    </div>
  )
}

function ZoneHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-subtle)', marginTop: 4 }}>
      <span style={{ flexShrink: 0 }}>{children}</span>
      <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
    </div>
  )
}

const H2_STYLE: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }

const MEDALS = ['🥇', '🥈', '🥉']
const BAR_COLORS = ['#F59E0B', '#6B7280', '#B45309', '#3B82F6', '#8B5CF6']

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

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const fmtBR = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
const fmtBRShort = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

// Feriados nacionais do Brasil (fixos + móveis a partir da Páscoa). Usado só
// para o atalho "dia útil anterior".
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
function lastBusinessDayISO(from: Date): string {
  const d = new Date(from)
  d.setDate(d.getDate() - 1)
  for (let guard = 0; guard < 40; guard++) {
    const dow = d.getDay()
    if (dow !== 0 && dow !== 6 && !brHolidays(d.getFullYear()).has(iso(d))) return iso(d)
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
  const [filterOpen, setFilterOpen] = useState(false)
  const [draftFrom, setDraftFrom] = useState('')
  const [draftTo, setDraftTo] = useState('')
  const [filterErr, setFilterErr] = useState('')
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [feedOpen, setFeedOpen] = useState(false)
  const [rankMonthExpanded, setRankMonthExpanded] = useState(false)

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
      .then(r => { if (fetchAllGenRef.current === gen) setData(r.data) })
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
  const metaColor = data.meta_pct >= 80 ? '#10B981' : data.meta_pct >= 50 ? '#F59E0B' : '#EF4444'
  const single = !!filter && filter.from === filter.to
  const refDate = filter ? new Date(filter.to + 'T12:00:00') : new Date()
  const mesNome = refDate.toLocaleString('pt-BR', { month: 'long', year: 'numeric' })
  const diaLabel = !filter ? 'Hoje' : single ? fmtBR(filter.from) : `${fmtBRShort(filter.from)} – ${fmtBRShort(filter.to)}`
  const capLabel = !filter ? 'Captação Hoje' : single ? `Captação — ${fmtBR(filter.from)}` : 'Captação no período'
  const ranking = mergeO2Ranking(data.ranking)

  // Captação do dia — mini-série dos últimos 7 dias até o dia de referência.
  const refDay = refDate.getDate()
  const evoIdx = data.evolucao_diaria.findIndex(d => d.day === refDay)
  const spark7 = (evoIdx >= 0
    ? data.evolucao_diaria.slice(Math.max(0, evoIdx - 6), evoIdx + 1)
    : data.evolucao_diaria.slice(-7)
  ).map(d => d.count)

  // Meta + projeção — mesma linguagem, mesmo card.
  const captMes = data.captacao_mes ?? 0
  const projecao = data.projecao_mes ?? 0
  const projDelta = projecao - metaLeads
  const projPct = metaLeads > 0 ? Math.round(projecao / metaLeads * 100) : 0
  const diasUteisMes = data.dias_uteis_mes ?? 0
  const metaPorDia = diasUteisMes > 0 ? metaLeads / diasUteisMes : 0

  const rkHead: React.CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-subtle)', paddingBottom: 8 }
  const rkCell: React.CSSProperties = { padding: '9px 0 9px 14px', borderLeft: '1px solid var(--border-lt)', fontSize: 14, fontWeight: 700, color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums', alignSelf: 'center' }

  return (
    <main className="px-4 md:px-8 xl:px-12 py-6 flex flex-col gap-7" style={{ background: dark ? 'transparent' : '#EEF1F5', minHeight: '100%' }}>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-1)' }}>Dashboard</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>Performance operacional em tempo real</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
          {filter && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 99, padding: '4px 10px 4px 12px' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#2563EB' }}>{diaLabel}</span>
              <button onClick={clearFilter} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2563EB', display: 'flex', alignItems: 'center', padding: 0 }}>
                <X size={13} />
              </button>
            </div>
          )}
          <div style={{ position: 'relative' }}>
            <button
              onClick={openFilter}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: `1px solid ${filter ? '#2563EB' : 'var(--border)'}`, background: filter ? 'rgba(37,99,235,0.08)' : 'var(--bg-card)', color: filter ? '#2563EB' : 'var(--text-muted)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}
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
        </div>
      </div>

      {/* ─────────────────────────── FAIXA: HOJE ─────────────────────────── */}
      <section className="flex flex-col gap-4">
        <ZoneHeader>{diaLabel}{!filter && ' · ao vivo'}</ZoneHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 xl:gap-6">
          <KpiCard
            label={capLabel}
            value={String(data.captacao_hoje)}
            Icon={Zap}
            iconBg="#EFF6FF" iconColor="#3B82F6"
            chart={<Sparkline values={spark7} />}
          />

          <div className="bg-white rounded-xl flex flex-col gap-3" style={{ padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
            <p style={{ display: 'flex', alignItems: 'center', gap: 8, ...H2_STYLE, fontSize: 12 }}>
              <span style={{ width: 3, height: 12, borderRadius: 2, background: '#6366F1', flexShrink: 0 }} />
              De onde vieram
            </p>
            {data.captacao_hoje_origem.bases.length === 0 && data.captacao_hoje_origem.conversion_points.length === 0 ? (
              <p style={{ fontSize: 12.5, color: 'var(--text-subtle)' }}>Sem captações {filter && !single ? 'no período' : 'no dia'}.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {data.captacao_hoje_origem.conversion_points.length > 0 && (
                  <OrigemGroup key={`${diaLabel}-conv`} dot="#3B82F6" label="Pontos de conversão" items={data.captacao_hoje_origem.conversion_points} />
                )}
                {data.captacao_hoje_origem.bases.length > 0 && (
                  <OrigemGroup key={`${diaLabel}-base`} dot="#F59E0B" label="Bases (SDR)" items={data.captacao_hoje_origem.bases} />
                )}
              </div>
            )}
          </div>
        </div>

        {/* Ranking de hoje — colunas segmentadas (só divisórias verticais) */}
        <div className="bg-white rounded-xl p-6 flex flex-col gap-3" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <h2 style={H2_STYLE}>Ranking de Operadores — {diaLabel}</h2>
          {data.captacao_hoje_por_fonte.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-subtle)' }}>Sem captações {filter && !single ? 'no período' : filter ? 'nesse dia' : 'hoje'}.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr' }}>
              {['Operador', 'Captação'].map((hd, c) => (
                <div key={hd} style={{ ...rkHead, paddingLeft: c ? 14 : 0, borderLeft: c ? '1px solid var(--border-lt)' : 'none' }}>{hd}</div>
              ))}
              {data.captacao_hoje_por_fonte.map((op, i) => (
                <div key={op.name} style={{ display: 'contents' }}>
                  <span style={{ padding: '9px 0 9px', display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span style={{ fontSize: i < 3 ? 15 : 11, width: 20, textAlign: 'center', flexShrink: 0, color: 'var(--text-subtle)', fontWeight: 700 }}>
                      {i < 3 ? MEDALS[i] : `${i + 1}°`}
                    </span>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{op.name}</span>
                  </span>
                  <span style={{ ...rkCell, color: BAR_COLORS[Math.min(i, BAR_COLORS.length - 1)] }}>{op.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ────────────────────────── FAIXA: MÊS ──────────────────────────── */}
      <section className="flex flex-col gap-4">
        <ZoneHeader>{mesNome} · acumulado</ZoneHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 xl:gap-6 items-start">

          {/* Meta + projeção */}
          <div className="bg-white rounded-xl p-6 flex flex-col gap-4" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
            <h2 style={H2_STYLE}>Meta Mensal</h2>

            <div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-subtle)' }}>Realizado</span>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
                  <b style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }}>{captMes}</b>
                  <span style={{ fontSize: 12, color: 'var(--text-subtle)' }}>de {metaLeads} leads · {data.meta_pct}% da meta</span>
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 15 }}>
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-subtle)' }}>Projeção do mês</span>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
                  <b style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }}>{projecao}</b>
                  <span style={{ fontSize: 12, fontWeight: 600, color: projDelta >= 0 ? '#059669' : '#DC2626' }}>
                    {projDelta >= 0 ? `${projDelta} acima da meta` : `${Math.abs(projDelta)} abaixo da meta`}
                  </span>
                </span>
              </div>
            </div>

            <div style={{ position: 'relative', paddingTop: 9, marginTop: 2 }}>
              <div style={{ position: 'relative', height: 12, borderRadius: 99, background: 'var(--bg-subtle)', overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(data.meta_pct, 100)}%`, height: '100%', borderRadius: 99, background: metaColor, transition: 'width 700ms ease' }} />
              </div>
              <div style={{ position: 'absolute', top: 0, left: `${Math.min(Math.max(projPct, 0), 100)}%`, transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderTop: '6px solid var(--text-2)' }} />
              <div style={{ position: 'absolute', top: 5, right: 0, width: 2, height: 20, background: 'var(--text-subtle)', borderRadius: 2 }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, fontWeight: 600, color: 'var(--text-subtle)', marginTop: -6 }}>
              <span>realizado / projeção</span><span>meta {metaLeads}</span>
            </div>

            <div style={{ marginTop: 14, paddingTop: 13, borderTop: '1px solid var(--border-lt)' }}>
              <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-subtle)', marginBottom: 4 }}>Ritmo necessário</p>
              <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }}>
                {metaPorDia > 0 ? Math.ceil(metaPorDia) : '—'} leads/dia útil
              </span>
            </div>
          </div>

          {/* Ranking do mês */}
          <div className="bg-white rounded-xl flex flex-col" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
            <div style={{ padding: '24px 24px 0' }}>
              <h2 style={{ ...H2_STYLE, marginBottom: 20 }}>Ranking de Operadores</h2>
              {ranking.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--text-subtle)', paddingBottom: 24 }}>Sem captações no período.</p>
              ) : (
                <div className="flex flex-col gap-4" style={{ paddingBottom: 20 }}>
                  {ranking.slice(0, 3).map((op, i) => (
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
                          <div style={{ width: `${op.bar_pct}%`, height: '100%', borderRadius: 99, background: BAR_COLORS[Math.min(i, BAR_COLORS.length - 1)], transition: 'width 600ms ease' }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {ranking.length > 3 && (
              <>
                <button
                  onClick={() => setRankMonthExpanded(o => !o)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '12px 24px', background: 'var(--bg-subtle)', border: 'none',
                    borderTop: '1px solid var(--border-lt)', cursor: 'pointer',
                    width: '100%', textAlign: 'left',
                  }}
                >
                  {rankMonthExpanded ? <ChevronDown size={13} color="var(--text-muted)" /> : <ChevronRight size={13} color="var(--text-muted)" />}
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Outras origens
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#3B82F6', background: 'rgba(59,130,246,0.1)', borderRadius: 99, padding: '1px 7px', marginLeft: 4 }}>
                    {ranking.length - 3}
                  </span>
                </button>
                {rankMonthExpanded && (
                  <div style={{ padding: '8px 24px 16px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 72px 56px', gap: 8, padding: '0 4px 10px', borderBottom: '1px solid var(--border)' }}>
                      {['Origem', 'Captação', 'Part.'].map(h => (
                        <span key={h} style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: h === 'Origem' ? 'left' : 'right' }}>{h}</span>
                      ))}
                    </div>
                    {ranking.slice(3).map((op, idx) => {
                      const i = idx + 3
                      return (
                        <div
                          key={op.name}
                          style={{ display: 'grid', gridTemplateColumns: '1fr 72px 56px', gap: 8, alignItems: 'center', padding: '10px 4px', borderBottom: idx < ranking.length - 4 ? '1px solid var(--border-lt)' : 'none', borderRadius: 6, transition: 'background 150ms' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                            <span style={{ fontSize: 11, width: 20, flexShrink: 0, textAlign: 'center', color: 'var(--text-subtle)', fontWeight: 700 }}>
                              {i + 1}°
                            </span>
                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{op.name}</span>
                          </div>
                          <span style={{ fontSize: 14, fontWeight: 700, color: BAR_COLORS[Math.min(i, BAR_COLORS.length - 1)], textAlign: 'right' }}>{op.count}</span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-subtle)', textAlign: 'right' }}>{op.pct}%</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}
          </div>

        </div>

        {/* Evolução diária */}
        <div className="bg-white rounded-xl p-6 flex flex-col gap-4" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={H2_STYLE}>Evolução da Captação</h2>
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
        <div className="bg-white rounded-xl" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
          <button
            onClick={() => setFeedOpen(o => !o)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 24px', background: 'none', border: 'none', cursor: 'pointer',
              borderBottom: feedOpen ? '1px solid var(--border-lt)' : 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {feedOpen ? <ChevronDown size={15} color="var(--text-muted)" /> : <ChevronRight size={15} color="var(--text-muted)" />}
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Atividades Recentes
              </span>
              {feed.length > 0 && (
                <span style={{ fontSize: 11, fontWeight: 700, color: '#3B82F6', background: 'rgba(59,130,246,0.1)', borderRadius: 99, padding: '1px 8px' }}>
                  {feed.length}
                </span>
              )}
            </div>
          </button>

          {feedOpen && (
            <div style={{ padding: '8px 24px 16px' }}>
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
                })
              )}
            </div>
          )}
        </div>
      </section>

    </main>
  )
}
