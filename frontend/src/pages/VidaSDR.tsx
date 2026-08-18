import { useEffect, useState, type MouseEvent, type KeyboardEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  ArrowLeft, Loader2, Lock, AlertTriangle, Clock3, TrendingUp, type LucideIcon,
} from 'lucide-react'
import api from '../api'
import SmartPreviewDrawer from '../components/SmartPreviewDrawer'
import {
  buildSmartPreview, fetchSmartPreviewRows, needsRowFetch, MOCK_CUSTO_TOTAL,
  type SmartPreviewId, type SmartPreview,
} from '../utils/vidaSdrPreview'

interface TrendItem { mes: string; mes_label: string; captacoes: number; vendas: number; receita: number | null }
interface RankingEntry { nome: string; receita: number; voce: boolean }
interface Ranking { posicao: number; total: number; leaderboard: RankingEntry[] }
interface Atividade { tipo: 'status' | 'nota' | 'agendamento'; lead_nome: string; lead_id?: string; detalhe: string | null; em: string }
interface VidaSdrData {
  captacoes: number
  em_andamento: number
  cancelados: number
  vendas: number
  conversao: number
  receita_recebida: number | null
  receita_a_receber: number | null
  receita_potencial: number | null
  primeiro_lead_em: string | null
  trend: TrendItem[]
  ranking: Ranking | null
  atividades: Atividade[]
}

const ACCENT = '#2563EB'
const ACCENT_SOFT = 'rgba(37,99,235,0.1)'

function fmtBrl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function mesesAtivo(iso: string) {
  const start = new Date(iso)
  const now = new Date()
  const months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth())
  return Math.max(1, months)
}

type Delta = { text: string; tone: 'good' | 'bad' | 'neutral' }

// Deltas reais (mês atual vs. mês anterior), derivados de data.trend — nunca
// fabricados. Métricas sem série mensal na API (em_andamento, cancelados,
// tx. cancelamento, receita a receber/potencial, custo total) ficam sem delta.
function monthDelta(trend: TrendItem[], key: 'captacoes' | 'vendas' | 'receita', higherIsBetter = true): Delta | null {
  if (trend.length < 2) return null
  const prev = trend[trend.length - 2][key]
  const curr = trend[trend.length - 1][key]
  if (prev == null || curr == null || prev === 0) return null
  const pct = Math.round(((curr - prev) / prev) * 100)
  if (pct === 0) return { text: '— 0%', tone: 'neutral' }
  const good = higherIsBetter ? pct > 0 : pct < 0
  return { text: `${pct > 0 ? '↑' : '↓'} ${Math.abs(pct)}%`, tone: good ? 'good' : 'bad' }
}

function conversionDelta(trend: TrendItem[]): Delta | null {
  if (trend.length < 2) return null
  const a = trend[trend.length - 2]
  const b = trend[trend.length - 1]
  if (!a.captacoes || !b.captacoes) return null
  const prevConv = (a.vendas / a.captacoes) * 100
  const currConv = (b.vendas / b.captacoes) * 100
  if (prevConv === 0) return null
  const pct = Math.round(((currConv - prevConv) / prevConv) * 100)
  if (pct === 0) return { text: '— 0 p.p.', tone: 'neutral' }
  return { text: `${pct > 0 ? '↑' : '↓'} ${Math.abs(Math.round(currConv - prevConv))} p.p.`, tone: pct > 0 ? 'good' : 'bad' }
}

const MEDALS = ['🥇', '🥈', '🥉']

type ChartMetric = 'captacoes' | 'vendas' | 'receita'

// Tooltip rico do gráfico de Evolução Mensal — período, valor, variação vs.
// mês anterior e quantidade de leads captados. Tudo derivado de data.trend,
// nenhum dado novo.
function ChartTooltipContent({ active, payload, metric, trend }: { active?: boolean; payload?: Array<{ payload: TrendItem }>; metric: ChartMetric; trend: TrendItem[] }) {
  if (!active || !payload || !payload.length) return null
  const item = payload[0].payload as TrendItem
  const idx = trend.findIndex(t => t.mes === item.mes)
  const prevItem = idx > 0 ? trend[idx - 1] : null
  const curr = metric === 'receita' ? (item.receita ?? 0) : item[metric]
  const prev = prevItem ? (metric === 'receita' ? (prevItem.receita ?? 0) : prevItem[metric]) : null
  const variation = prev ? Math.round(((curr - prev) / prev) * 100) : null
  const metricLabel = metric === 'captacoes' ? 'Captações' : metric === 'vendas' ? 'Vendas' : 'Receita recebida'
  const displayValue = metric === 'receita' ? fmtBrl(curr) : String(curr)
  return (
    <div style={{ padding: '11px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-card)', boxShadow: '0 10px 28px rgba(15,23,42,0.14)', minWidth: 156 }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-1)', marginBottom: 7 }}>{item.mes_label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{metricLabel}</span>
        <strong style={{ fontSize: 13.5, color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }}>{displayValue}</strong>
      </div>
      {variation !== null && (
        <div style={{ marginTop: 4, fontSize: 10.5, fontWeight: 700, color: variation >= 0 ? '#059669' : '#DC2626' }}>
          {variation >= 0 ? '↑' : '↓'} {Math.abs(variation)}% vs. mês anterior
        </div>
      )}
      <div style={{ marginTop: 6, fontSize: 10, color: 'var(--text-subtle)' }}>
        {item.captacoes} lead{item.captacoes === 1 ? '' : 's'} captado{item.captacoes === 1 ? '' : 's'} no período
      </div>
    </div>
  )
}

// Card Operacional (Candidate Freeze "Vida do Agente"). Cada indicador abre um
// Smart Preview (ver buildSmartPreview em utils/vidaSdrPreview.ts) em vez de
// navegar direto — a navegação real fica na ação do drawer. Sem ícone/cor por
// métrica: o Candidate Freeze usa tiles neutros (rótulo, valor, ação).
const OPERACIONAL_CFG = [
  { key: 'captacoes',    id: 'captacoes' as SmartPreviewId,    label: 'Total de Leads',    fmt: (v: number) => String(v) },
  { key: 'em_andamento', id: 'em_andamento' as SmartPreviewId, label: 'Em Andamento',      fmt: (v: number) => String(v) },
  { key: 'vendas',       id: 'vendas' as SmartPreviewId,       label: 'Vendas Realizadas', fmt: (v: number) => String(v) },
  { key: 'conversao',    id: 'conversao' as SmartPreviewId,    label: 'Conversão Geral',   fmt: (v: number) => `${v}%` },
  { key: 'cancelados',   id: 'cancelados' as SmartPreviewId,   label: 'Cancelados',        fmt: (v: number) => String(v) },
] as const

// Card Financeiro: apenas os 4 itens aprovados no Candidate Freeze. Custo
// total ainda não tem fonte real — ver limitações no handoff.
const FINANCEIRO_CFG = [
  { key: 'receita_recebida',  id: 'receita_recebida' as SmartPreviewId,  label: 'Receita Recebida',  simulated: false },
  { key: 'receita_a_receber', id: 'receita_a_receber' as SmartPreviewId, label: 'Receita a Receber',  simulated: false },
  { key: 'receita_potencial', id: 'receita_potencial' as SmartPreviewId, label: 'Receita Potencial',  simulated: false },
  { key: 'custo_total',       id: 'custo_total' as SmartPreviewId,       label: 'Custo Total',        simulated: true },
] as const

const kickerStyle: import('react').CSSProperties = {
  display: 'block', color: 'var(--text-subtle)', fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em',
}

const DELTA_COLOR: Record<Delta['tone'], string> = { good: '#059669', bad: '#DC2626', neutral: 'var(--text-subtle)' }

function StatCard({ label, value, simulated, delta, tall, onOpen }: {
  label: string; value: string; simulated?: boolean; delta?: Delta | null; tall?: boolean
  onOpen: (trigger: HTMLElement) => void
}) {
  return (
    <div
      role="button" tabIndex={0}
      onClick={(e: MouseEvent<HTMLDivElement>) => onOpen(e.currentTarget)}
      onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(e.currentTarget) } }}
      style={{ position: 'relative', minWidth: 0, padding: tall ? '26px 20px' : 20, borderRadius: 16, background: 'var(--bg-card)', border: '1px solid var(--border)', textAlign: 'left', cursor: 'pointer', transition: 'border-color 120ms' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-in)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
    >
      <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}{simulated && <em style={{ marginLeft: 4, fontStyle: 'normal', fontWeight: 700, textTransform: 'none', letterSpacing: 0, color: '#7C3AED' }}>· estimativa</em>}
      </span>
      <strong style={{ display: 'block', marginTop: 14, fontSize: 28, fontWeight: 700, lineHeight: 1, color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }}>{value}</strong>
      {delta ? (
        <small style={{ display: 'block', marginTop: 10, fontSize: 11, fontWeight: 700, color: DELTA_COLOR[delta.tone] }}>{delta.text}</small>
      ) : simulated ? (
        <small style={{ display: 'block', marginTop: 10, fontSize: 11, fontWeight: 600, color: 'var(--text-subtle)' }}>Sem variação no período</small>
      ) : null}
      <em style={{ display: 'block', marginTop: 10, color: ACCENT, fontSize: 12, fontStyle: 'normal', fontWeight: 600, opacity: .9 }}>Ver detalhes →</em>
    </div>
  )
}

const INSIGHT_TONE: Record<'good' | 'warn' | 'risk', string> = { good: '#059669', warn: '#D97706', risk: '#DC2626' }
const INSIGHT_TONE_SOFT: Record<'good' | 'warn' | 'risk', string> = { good: 'rgba(5,150,105,0.1)', warn: 'rgba(217,119,6,0.1)', risk: 'rgba(220,38,38,0.08)' }

// Linha do "Resumo Executivo" — indicador em destaque, título e descrição
// secundários, divisor no topo (exceto a primeira), CTA opcional alinhado à
// direita reaproveitando o mesmo Smart Preview dos demais indicadores.
function InsightRow({ tone, icon: Icon, value, title, desc, ctaLabel, onOpen, first }: {
  tone: 'good' | 'warn' | 'risk'; icon: LucideIcon; value: string; title: string; desc: string
  ctaLabel?: string; onOpen?: (trigger: HTMLElement) => void; first?: boolean
}) {
  const color = INSIGHT_TONE[tone]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '22px 1fr auto', alignItems: 'center', gap: 11, padding: '8px 22px', borderTop: first ? 'none' : '1px solid var(--border-lt)' }}>
      <span style={{ display: 'grid', width: 22, height: 22, placeItems: 'center', borderRadius: 6, background: INSIGHT_TONE_SOFT[tone], color, flexShrink: 0 }}>
        <Icon size={11} />
      </span>
      <div style={{ minWidth: 0 }}>
        <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums', color }}>{value}</span>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', marginLeft: 7 }}>{title}</span>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{desc}</p>
      </div>
      {ctaLabel && onOpen ? (
        <button onClick={e => onOpen(e.currentTarget)} style={{ fontSize: 10.5, fontWeight: 700, color: ACCENT, background: 'none', border: 0, padding: 0, cursor: 'pointer', whiteSpace: 'nowrap' }}>{ctaLabel}</button>
      ) : <span />}
    </div>
  )
}

export default function VidaSDR() {
  const { origens } = useParams<{ origens: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const nome = searchParams.get('nome') || origens || 'SDR'

  const [data, setData] = useState<VidaSdrData | null>(null)
  const [loading, setLoading] = useState(true)

  const [drawerTrigger, setDrawerTrigger] = useState<HTMLElement | null>(null)
  const [preview, setPreview] = useState<SmartPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [chartMetric, setChartMetric] = useState<ChartMetric>('vendas')

  useEffect(() => {
    if (!origens) return
    setLoading(true)
    api.get<VidaSdrData>(`/api/v1/gestao-comercial/vida-sdr?${new URLSearchParams({ origens })}`)
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [origens])

  function openPreview(id: SmartPreviewId, context: number, trigger: HTMLElement) {
    if (!data || !origens) return
    setDrawerTrigger(trigger)
    const base = buildSmartPreview(id, context, data, origens)
    setPreview(base)
    if (needsRowFetch(id)) {
      setPreviewLoading(true)
      fetchSmartPreviewRows(id, origens, data.primeiro_lead_em)
        .then(rows => setPreview(prev => (prev ? { ...prev, rows } : prev)))
        .catch(() => setPreview(prev => (prev ? { ...prev, rows: [] } : prev)))
        .finally(() => setPreviewLoading(false))
    }
  }

  function closePreview() {
    setDrawerTrigger(null)
    setPreview(null)
    setPreviewLoading(false)
  }

  function handlePreviewAction() {
    const target = preview?.target
    closePreview()
    if (target) navigate(target)
  }

  const canSeeFinance = !!data && data.receita_recebida != null
  const cancellationRate = data && data.captacoes ? Math.round((data.cancelados / data.captacoes) * 100) : 0

  // Deltas reais mês a mês (ver monthDelta/conversionDelta) — indisponíveis
  // para as métricas sem série mensal na API (em_andamento, cancelados,
  // tx. cancelamento, receita a receber/potencial, custo total).
  const deltas: Partial<Record<string, Delta | null>> = data ? {
    captacoes: monthDelta(data.trend, 'captacoes'),
    vendas: monthDelta(data.trend, 'vendas'),
    conversao: conversionDelta(data.trend),
    receita_recebida: monthDelta(data.trend, 'receita'),
  } : {}

  // Barra de referência (track) atrás da barra principal do gráfico de
  // Evolução Mensal — puramente de apresentação, escala com o próprio máximo
  // da métrica selecionada, sem alterar data.trend.
  const chartValues = data ? data.trend.map(t => (chartMetric === 'receita' ? (t.receita ?? 0) : t[chartMetric])) : []
  const chartTrackMax = Math.max(...chartValues, 1) * 1.15
  const chartData = data ? data.trend.map(t => ({ ...t, __track: chartTrackMax })) : []

  return (
    <div style={{ maxWidth: 1360, margin: '0 auto', padding: '16px 20px 60px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <button
        onClick={() => navigate(-1)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 13, fontWeight: 500, padding: '4px 0', alignSelf: 'flex-start' }}
      >
        <ArrowLeft size={16} /> Voltar
      </button>

      {/* Cabeçalho — identidade solta no fundo da página, sem card/borda, como no Candidate Freeze */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 17 }}>
          <div style={{
            flexShrink: 0, width: 58, height: 58, borderRadius: 17,
            background: 'linear-gradient(145deg,#1E3A8A,#2563EB)',
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 23, fontWeight: 800, letterSpacing: '0.02em',
          }}>
            {initials(nome)}
          </div>
          <div>
            <span style={kickerStyle}>Desempenho individual</span>
            <h1 style={{ fontSize: 30, fontWeight: 800, margin: '5px 0 4px', letterSpacing: '-0.03em', lineHeight: 1.15, color: 'var(--text-1)' }}>
              {nome}
            </h1>
            {data?.primeiro_lead_em && (
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 13 }}>
                Desde {fmtDate(data.primeiro_lead_em)} · {mesesAtivo(data.primeiro_lead_em)} {mesesAtivo(data.primeiro_lead_em) === 1 ? 'mês' : 'meses'} ativo
              </p>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <label style={{ display: 'grid', gap: 5, color: 'var(--text-muted)', fontSize: 10.5, fontWeight: 700 }}>
            Período
            <select style={{ minWidth: 168, height: 40, padding: '0 12px', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-2)', background: 'var(--bg-card)', fontSize: 12.5, fontFamily: 'inherit' }}>
              <option>Histórico completo</option>
            </select>
          </label>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '60px 0', color: 'var(--text-subtle)' }}>
          <Loader2 size={18} className="animate-spin" /> Carregando…
        </div>
      ) : !data || data.captacoes === 0 ? (
        <p style={{ textAlign: 'center', color: 'var(--text-subtle)', padding: '60px 0' }}>Nenhum lead encontrado para este SDR.</p>
      ) : (
        <>
          {/* Operacional + Financeiro, lado a lado (.9fr/1.1fr), como no Candidate Freeze.
              Sem container externo: só o título da seção + os cards individuais. */}
          <div style={{ display: 'grid', gridTemplateColumns: canSeeFinance ? 'minmax(0, 1.5fr) minmax(280px, 1fr)' : '1fr', gap: 18 }}>
            <div>
              <span style={{ ...kickerStyle, fontSize: 12.5, fontWeight: 800, color: 'var(--text-2)' }}>Operacional</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 7, marginTop: 15 }}>
                {OPERACIONAL_CFG.map(({ key, id, label, fmt }) => (
                  <StatCard key={key} label={label} value={fmt(data[key as keyof VidaSdrData] as number)} delta={deltas[key]} tall onOpen={trigger => openPreview(id, 0, trigger)} />
                ))}
                <StatCard label="Tx. Cancelamento" value={`${cancellationRate}%`} tall onOpen={trigger => openPreview('cancellationRate', 0, trigger)} />
              </div>
            </div>

            {canSeeFinance && (
              <div>
                <span style={{ ...kickerStyle, fontSize: 12.5, fontWeight: 800, color: 'var(--text-2)' }}>Financeiro</span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 7, marginTop: 15 }}>
                  {FINANCEIRO_CFG.map(({ key, id, label, simulated }) => {
                    const value = key === 'receita_recebida' ? fmtBrl(data.receita_recebida || 0)
                      : key === 'receita_a_receber' ? fmtBrl(data.receita_a_receber || 0)
                      : key === 'receita_potencial' ? fmtBrl(data.receita_potencial || 0)
                      : fmtBrl(MOCK_CUSTO_TOTAL)
                    return <StatCard key={key} label={label} value={value} simulated={simulated} delta={deltas[key]} onOpen={trigger => openPreview(id, 0, trigger)} />
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Evolução Mensal + Meta, pareados — não com Ranking, como no Candidate Freeze */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(280px, 1fr)', gap: 18 }}>
            <section style={{ padding: '24px 24px 8px', border: '1px solid var(--border)', borderRadius: 16, background: 'var(--bg-card)', boxShadow: '0 1px 3px rgba(15,23,42,0.06)' }}>
              <span style={kickerStyle}>Evolução mensal</span>
              <div style={{ display: 'flex', gap: 6, margin: '16px 0 16px', overflowX: 'auto' }}>
                {(['captacoes', 'vendas', ...(canSeeFinance ? ['receita' as const] : [])] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => setChartMetric(m)}
                    style={{
                      minHeight: 30, padding: '0 11px', border: `1px solid ${chartMetric === m ? ACCENT : 'var(--border)'}`, borderRadius: 8,
                      color: chartMetric === m ? ACCENT : 'var(--text-muted)', background: chartMetric === m ? ACCENT_SOFT : 'var(--bg-card)',
                      fontSize: 11, fontWeight: chartMetric === m ? 700 : 500, fontFamily: 'inherit', whiteSpace: 'nowrap', cursor: 'pointer',
                    }}
                  >
                    {m === 'captacoes' ? 'Captações' : m === 'vendas' ? 'Vendas' : 'Receita recebida'}
                  </button>
                ))}
              </div>
              <ResponsiveContainer width="100%" height={264}>
                <BarChart key={chartMetric} data={chartData} barGap={-26} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="vidaSdrBarGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#5B93F5" />
                      <stop offset="100%" stopColor={ACCENT} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="mes_label" axisLine={false} tickLine={false} tick={{ fontSize: 10.5, fill: '#94A3B8' }} interval={Math.max(0, Math.ceil(data.trend.length / 12) - 1)} />
                  <YAxis domain={[0, chartTrackMax]} hide />
                  <Tooltip cursor={false} content={<ChartTooltipContent metric={chartMetric} trend={data.trend} />} />
                  <Bar dataKey="__track" fill="var(--bg-subtle)" radius={[8, 8, 8, 8]} barSize={26} isAnimationActive={false} />
                  <Bar dataKey={chartMetric} fill="url(#vidaSdrBarGradient)" radius={[8, 8, 8, 8]} barSize={26} animationDuration={450} animationEasing="ease-out" />
                </BarChart>
              </ResponsiveContainer>
              <p style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '4px 0 16px', color: 'var(--text-subtle)', fontSize: 10 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: ACCENT, display: 'inline-block' }} />
                {chartMetric === 'receita' ? 'Valores financeiros em reais' : 'Valores em volume absoluto'} · desde o primeiro lead
              </p>
            </section>

            <section style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, textAlign: 'center', padding: 32, border: '1.5px dashed var(--border-in)', borderRadius: 16, background: 'var(--bg-card)', boxShadow: '0 1px 3px rgba(15,23,42,0.06)' }}>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#7C3AED', background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.25)', padding: '5px 14px', borderRadius: 99 }}>
                Em breve
              </span>
              <p style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-1)', margin: 0, letterSpacing: '-0.01em' }}>Metas do Mês</p>
              <p style={{ fontSize: 13, color: 'var(--text-subtle)', margin: 0, maxWidth: 240, lineHeight: 1.5 }}>
                Depende de cadastrar metas por SDR — combinar formato antes de construir
              </p>
            </section>
          </div>

          {/* Ranking + Atividades, pareados (1fr/1fr), como no Candidate Freeze */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
            <section style={{ padding: '24px 0', border: '1px solid var(--border)', borderRadius: 16, background: 'var(--bg-card)', boxShadow: '0 1px 3px rgba(15,23,42,0.06)' }}>
              <span style={{ ...kickerStyle, padding: '0 22px' }}>Benchmark</span>
              <p style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text-1)', margin: '5px 0 0', padding: '0 22px' }}>Ranking do Time</p>
              {!data.ranking ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '20px 22px 0', color: 'var(--text-subtle)', fontSize: 12.5 }}>
                  <Lock size={13} /> Visível apenas para Admin e Diretor
                </div>
              ) : (
                <ol style={{ listStyle: 'none', margin: '15px 0 0', padding: 0 }}>
                  {data.ranking.leaderboard.map((r, i) => {
                    const clickable = r.nome !== 'o2 Solution'
                    return (
                    <li key={r.nome}>
                    <div
                      role={clickable ? 'button' : undefined} tabIndex={clickable ? 0 : undefined}
                      onClick={clickable ? (e: MouseEvent<HTMLDivElement>) => openPreview('ranking', i, e.currentTarget) : undefined}
                      onKeyDown={clickable ? (e: KeyboardEvent<HTMLDivElement>) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPreview('ranking', i, e.currentTarget) } } : undefined}
                      title={clickable ? `Ver prévia de ${r.nome}` : undefined}
                      style={{
                        display: 'grid', gridTemplateColumns: '28px 1fr auto auto', alignItems: 'center', gap: 10,
                        padding: '12px 22px', borderTop: i > 0 ? '1px solid var(--border-lt)' : 'none',
                        fontSize: 13.5, fontWeight: r.voce ? 700 : 500,
                        cursor: clickable ? 'pointer' : 'default',
                      }}
                      onMouseEnter={e => { if (clickable) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '' }}
                    >
                      <span style={{ display: 'grid', width: 26, height: 26, placeItems: 'center', borderRadius: 7, background: 'var(--bg-subtle)', color: 'var(--text-3)', fontWeight: 800, fontSize: 11.5 }}>{MEDALS[i] ?? `${i + 1}º`}</span>
                      <span style={{ color: r.voce ? ACCENT : 'var(--text-2)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.voce ? `${r.nome} (você)` : r.nome}
                      </span>
                      <strong style={{ fontSize: 12.5, color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>{fmtBrl(r.receita)}</strong>
                      {clickable && <em style={{ fontStyle: 'normal', fontWeight: 700, fontSize: 9.5, color: ACCENT }}>Ver agente →</em>}
                    </div>
                    </li>
                    )
                  })}
                </ol>
              )}
            </section>

            <section style={{ padding: '24px 0', border: '1px solid var(--border)', borderRadius: 16, background: 'var(--bg-card)', boxShadow: '0 1px 3px rgba(15,23,42,0.06)' }}>
              <span style={{ ...kickerStyle, padding: '0 22px' }}>Decisão rápida</span>
              <p style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text-1)', margin: '5px 0 0', padding: '0 22px' }}>Resumo Executivo</p>
              <p style={{ margin: '5px 22px 0', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                <strong style={{ color: 'var(--text-1)' }}>{nome}</strong> está com bom desempenho financeiro, mas cancelamentos e leads em andamento exigem atenção.
              </p>
              <div style={{ marginTop: 10 }}>
                <InsightRow
                  first tone="risk" icon={AlertTriangle}
                  value={`${cancellationRate}%`} title="Taxa de cancelamento" desc={`${data.cancelados} leads cancelados no período`}
                  ctaLabel="Ver cancelamentos →" onOpen={trigger => openPreview('cancelled', 0, trigger)}
                />
                <InsightRow
                  tone="warn" icon={Clock3}
                  value={String(data.em_andamento)} title="Leads em andamento" desc="Aguardando avanço no funil"
                  ctaLabel="Ver leads →" onOpen={trigger => openPreview('progress', 0, trigger)}
                />
                {canSeeFinance ? (
                  deltas.receita_recebida ? (
                    <InsightRow tone="good" icon={TrendingUp} value={deltas.receita_recebida.text} title="Receita recebida" desc="Em relação ao mês anterior" />
                  ) : (
                    <InsightRow tone="good" icon={TrendingUp} value={fmtBrl(data.receita_recebida ?? 0)} title="Receita recebida" desc="Total no período" />
                  )
                ) : deltas.conversao ? (
                  <InsightRow tone="good" icon={TrendingUp} value={deltas.conversao.text} title="Conversão geral" desc="Em relação ao mês anterior" />
                ) : (
                  <InsightRow tone="good" icon={TrendingUp} value={`${data.conversao}%`} title="Conversão geral" desc="Neste período" />
                )}
              </div>
            </section>
          </div>
        </>
      )}

      {preview && (
        <SmartPreviewDrawer
          preview={preview}
          loading={previewLoading}
          trigger={drawerTrigger}
          onClose={closePreview}
          onAction={handlePreviewAction}
        />
      )}
    </div>
  )
}
