import { useEffect, useState, type MouseEvent, type KeyboardEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  ArrowLeft, Loader2, Trophy, Download, List, Lock, StickyNote, CalendarClock, ArrowRightLeft, ChevronDown, ChevronUp,
} from 'lucide-react'
import api from '../api'
import { parseUTC } from '../utils/date'
import { statusLabel } from '../utils/statusLabel'
import SmartPreviewDrawer from '../components/SmartPreviewDrawer'
import {
  buildSmartPreview, fetchSmartPreviewRows, needsRowFetch, MOCK_POTENCIAL_TOTAL, MOCK_CUSTO_TOTAL,
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
  primeiro_lead_em: string | null
  trend: TrendItem[]
  ranking: Ranking | null
  atividades: Atividade[]
}

const ACCENT = '#2563EB'
const ACCENT_SOFT = 'rgba(37,99,235,0.1)'
const ACCENT_TINT = 'rgba(37,99,235,0.03)'
const ACCENT_LINE = 'rgba(37,99,235,0.18)'

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

function relTime(iso: string): string {
  const ms = Date.now() - parseUTC(iso)
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `${min}min atrás`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h atrás`
  const d = Math.floor(h / 24)
  if (d === 1) return 'ontem'
  if (d < 30) return `${d}d atrás`
  return fmtDate(iso)
}

const MEDALS = ['🥇', '🥈', '🥉']

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

// Card Financeiro: apenas os 4 itens aprovados no Candidate Freeze. Receita
// potencial e Custo total ainda não têm fonte real — ver limitações no handoff.
const FINANCEIRO_CFG = [
  { key: 'receita_recebida',  id: 'receita_recebida' as SmartPreviewId,  label: 'Receita Recebida',  simulated: false },
  { key: 'receita_a_receber', id: 'receita_a_receber' as SmartPreviewId, label: 'Receita a Receber',  simulated: false },
  { key: 'receita_potencial', id: 'receita_potencial' as SmartPreviewId, label: 'Receita Potencial',  simulated: true },
  { key: 'custo_total',       id: 'custo_total' as SmartPreviewId,       label: 'Custo Total',        simulated: true },
] as const

const ATIVIDADE_CFG = {
  status:       { color: '#3B82F6', Icon: ArrowRightLeft },
  nota:         { color: '#8B5CF6', Icon: StickyNote },
  agendamento:  { color: '#F59E0B', Icon: CalendarClock },
} as const

const kickerStyle: import('react').CSSProperties = {
  display: 'block', color: 'var(--text-subtle)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em',
}

const DELTA_COLOR: Record<Delta['tone'], string> = { good: '#059669', bad: '#DC2626', neutral: 'var(--text-subtle)' }

function StatCard({ label, value, simulated, financial, delta, onOpen }: {
  label: string; value: string; simulated?: boolean; financial?: boolean; delta?: Delta | null
  onOpen: (trigger: HTMLElement) => void
}) {
  return (
    <div
      role="button" tabIndex={0}
      onClick={(e: MouseEvent<HTMLDivElement>) => onOpen(e.currentTarget)}
      onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(e.currentTarget) } }}
      style={{ position: 'relative', minWidth: 0, padding: 11, borderRadius: 10, background: financial ? ACCENT_SOFT : 'var(--bg-subtle)', border: '1px solid transparent', textAlign: 'left', cursor: 'pointer', transition: 'border-color 120ms' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-in)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'transparent' }}
    >
      <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: 9, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}{simulated && <em style={{ marginLeft: 4, fontStyle: 'normal', fontWeight: 800, color: '#7C3AED' }}>· estimativa</em>}
      </span>
      <strong style={{ display: 'block', marginTop: 6, fontSize: 15, lineHeight: 1.1, color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }}>{value}</strong>
      {delta && <small style={{ display: 'block', marginTop: 8, fontSize: 9, fontWeight: 800, color: DELTA_COLOR[delta.tone] }}>{delta.text}</small>}
      <em style={{ display: 'block', marginTop: 8, color: ACCENT, fontSize: 8.5, fontStyle: 'normal', fontWeight: 800, opacity: .8 }}>Ver detalhes →</em>
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
  const [showAllAtividades, setShowAllAtividades] = useState(false)

  const [drawerTrigger, setDrawerTrigger] = useState<HTMLElement | null>(null)
  const [preview, setPreview] = useState<SmartPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [chartMetric, setChartMetric] = useState<'captacoes' | 'vendas' | 'receita'>('vendas')

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

  function exportarCsv() {
    if (!data) return
    const linhas = [
      ['Métrica', 'Valor'],
      ['Total de Leads', String(data.captacoes)],
      ['Em Andamento', String(data.em_andamento)],
      ['Cancelados', String(data.cancelados)],
      ['Vendas', String(data.vendas)],
      ['Conversão Geral', `${data.conversao}%`],
      ...(data.receita_recebida != null ? [['Receita Recebida', fmtBrl(data.receita_recebida)]] : []),
      ...(data.receita_a_receber != null ? [['Receita a Receber', fmtBrl(data.receita_a_receber)]] : []),
      [],
      ['Mês', 'Captações', 'Vendas'],
      ...data.trend.map(t => [t.mes_label, String(t.captacoes), String(t.vendas)]),
    ]
    const csv = linhas.map(l => l.join(';')).join('\n')
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `vida-do-sdr-${nome.toLowerCase().replace(/\s+/g, '-')}.csv`
    a.click()
    URL.revokeObjectURL(url)
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

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '16px 24px 60px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <button
        onClick={() => navigate(-1)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 13, fontWeight: 500, padding: '4px 0', alignSelf: 'flex-start' }}
      >
        <ArrowLeft size={16} /> Voltar
      </button>

      {/* Cabeçalho — identidade solta no fundo da página, sem card/borda, como no Candidate Freeze */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            flexShrink: 0, width: 54, height: 54, borderRadius: 16,
            background: 'linear-gradient(145deg,#1E3A8A,#2563EB)',
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, letterSpacing: '0.02em',
          }}>
            {initials(nome)}
          </div>
          <div>
            <span style={kickerStyle}>Desempenho individual</span>
            <h1 style={{ fontSize: 28, fontWeight: 800, margin: '4px 0 3px', letterSpacing: '-0.03em', lineHeight: 1.15, color: 'var(--text-1)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {nome}
              {data?.ranking && (
                <span style={{ fontSize: 11, fontWeight: 700, color: ACCENT, background: ACCENT_SOFT, border: `1px solid ${ACCENT_LINE}`, padding: '3px 9px', borderRadius: 99, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Trophy size={11} /> #{data.ranking.posicao} de {data.ranking.total}
                </span>
              )}
            </h1>
            {data?.primeiro_lead_em && (
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 12.5 }}>
                Desde {fmtDate(data.primeiro_lead_em)} · {mesesAtivo(data.primeiro_lead_em)} {mesesAtivo(data.primeiro_lead_em) === 1 ? 'mês' : 'meses'} ativo
              </p>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <button
            onClick={() => navigate(`/leads-report?origem=${encodeURIComponent(origens || '')}`)}
            aria-label="Ver leads"
            title="Ver leads"
            style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-subtle)', background: 'transparent', border: 0, borderRadius: 8, cursor: 'pointer' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'; (e.currentTarget as HTMLElement).style.background = 'var(--bg-subtle)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-subtle)'; (e.currentTarget as HTMLElement).style.background = 'transparent' }}
          >
            <List size={14} />
          </button>
          <button
            onClick={exportarCsv}
            disabled={!data}
            aria-label="Exportar"
            title="Exportar"
            style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-subtle)', background: 'transparent', border: 0, borderRadius: 8, cursor: data ? 'pointer' : 'default', opacity: data ? 1 : 0.5 }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'; (e.currentTarget as HTMLElement).style.background = 'var(--bg-subtle)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-subtle)'; (e.currentTarget as HTMLElement).style.background = 'transparent' }}
          >
            <Download size={14} />
          </button>
          <label style={{ display: 'grid', gap: 5, color: 'var(--text-muted)', fontSize: 10.5, fontWeight: 700, marginLeft: 4 }}>
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
          {/* Operacional + Financeiro, lado a lado (.9fr/1.1fr), como no Candidate Freeze */}
          <div style={{ display: 'grid', gridTemplateColumns: canSeeFinance ? '.9fr 1.1fr' : '1fr', gap: 16 }}>
            <section style={{ padding: 19, border: '1px solid var(--border)', borderRadius: 16, background: 'var(--bg-card)', boxShadow: '0 1px 3px rgba(15,23,42,0.06)' }}>
              <span style={{ ...kickerStyle, marginBottom: 13 }}>Operacional</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 13 }}>
                {OPERACIONAL_CFG.map(({ key, id, label, fmt }) => (
                  <StatCard key={key} label={label} value={fmt(data[key as keyof VidaSdrData] as number)} delta={deltas[key]} onOpen={trigger => openPreview(id, 0, trigger)} />
                ))}
                <StatCard label="Tx. Cancelamento" value={`${cancellationRate}%`} onOpen={trigger => openPreview('cancellationRate', 0, trigger)} />
              </div>
            </section>

            {canSeeFinance && (
              <section style={{ padding: 19, border: `1px solid ${ACCENT_LINE}`, borderRadius: 16, background: ACCENT_TINT, boxShadow: '0 1px 3px rgba(15,23,42,0.06)' }}>
                <span style={{ ...kickerStyle, marginBottom: 13 }}>Financeiro</span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginTop: 13 }}>
                  {FINANCEIRO_CFG.map(({ key, id, label, simulated }) => {
                    const value = key === 'receita_recebida' ? fmtBrl(data.receita_recebida || 0)
                      : key === 'receita_a_receber' ? fmtBrl(data.receita_a_receber || 0)
                      : key === 'receita_potencial' ? fmtBrl(MOCK_POTENCIAL_TOTAL)
                      : fmtBrl(MOCK_CUSTO_TOTAL)
                    return <StatCard key={key} label={label} value={value} simulated={simulated} financial delta={deltas[key]} onOpen={trigger => openPreview(id, 0, trigger)} />
                  })}
                </div>
              </section>
            )}
          </div>

          {/* Evolução Mensal + Meta, pareados (2fr/.75fr) — não com Ranking, como no Candidate Freeze */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(220px, .75fr)', gap: 16 }}>
            <section style={{ padding: '20px 20px 6px', border: '1px solid var(--border)', borderRadius: 16, background: 'var(--bg-card)', boxShadow: '0 1px 3px rgba(15,23,42,0.06)' }}>
              <span style={kickerStyle}>Evolução mensal</span>
              <div style={{ display: 'flex', gap: 5, margin: '14px 0 0', overflowX: 'auto' }}>
                {(['captacoes', 'vendas', ...(canSeeFinance ? ['receita' as const] : [])] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => setChartMetric(m)}
                    style={{
                      minHeight: 28, padding: '0 10px', border: `1px solid ${chartMetric === m ? ACCENT : 'var(--border)'}`, borderRadius: 8,
                      color: chartMetric === m ? ACCENT : 'var(--text-muted)', background: chartMetric === m ? ACCENT_SOFT : 'var(--bg-card)',
                      fontSize: 10.5, fontWeight: chartMetric === m ? 700 : 500, fontFamily: 'inherit', whiteSpace: 'nowrap', cursor: 'pointer',
                    }}
                  >
                    {m === 'captacoes' ? 'Captações' : m === 'vendas' ? 'Vendas' : 'Receita recebida'}
                  </button>
                ))}
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data.trend} margin={{ top: 14, right: 12, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-lt)" />
                  <XAxis dataKey="mes_label" tick={{ fontSize: 10, fill: '#94A3B8' }} interval={Math.max(0, Math.ceil(data.trend.length / 12) - 1)} />
                  <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)' }}
                    formatter={(val: number) => [chartMetric === 'receita' ? fmtBrl(val) : val, chartMetric === 'captacoes' ? 'Captações' : chartMetric === 'vendas' ? 'Vendas' : 'Receita recebida']} />
                  <Bar dataKey={chartMetric} fill={ACCENT} radius={[4, 4, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
              <p style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '4px 0 14px', color: 'var(--text-subtle)', fontSize: 9.5 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: ACCENT, display: 'inline-block' }} />
                {chartMetric === 'receita' ? 'Valores financeiros em reais' : 'Valores em volume absoluto'} · desde o primeiro lead
              </p>
            </section>

            <section style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 20, border: '1.5px dashed var(--border-in)', borderRadius: 16, background: 'var(--bg-card)', boxShadow: '0 1px 3px rgba(15,23,42,0.06)' }}>
              <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#7C3AED', background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.25)', padding: '2px 8px', borderRadius: 99 }}>
                Em breve
              </span>
              <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-1)', margin: '10px 0 4px' }}>Metas do Mês</p>
              <p style={{ fontSize: 11.5, color: 'var(--text-subtle)', margin: 0 }}>
                Depende de cadastrar metas por SDR — combinar formato antes de construir
              </p>
            </section>
          </div>

          {/* Ranking + Atividades, pareados (1fr/1fr), como no Candidate Freeze */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <section style={{ padding: '20px 0', border: '1px solid var(--border)', borderRadius: 16, background: 'var(--bg-card)', boxShadow: '0 1px 3px rgba(15,23,42,0.06)' }}>
              <span style={{ ...kickerStyle, padding: '0 20px' }}>Benchmark</span>
              <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-1)', margin: '4px 0 0', padding: '0 20px' }}>Ranking do Time</p>
              {!data.ranking ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '18px 20px 0', color: 'var(--text-subtle)', fontSize: 12 }}>
                  <Lock size={13} /> Visível apenas para Admin e Diretor
                </div>
              ) : (
                <ol style={{ listStyle: 'none', margin: '13px 0 0', padding: 0 }}>
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
                        display: 'grid', gridTemplateColumns: '26px 1fr auto auto', alignItems: 'center', gap: 9,
                        padding: '10px 20px', borderTop: i > 0 ? '1px solid var(--border-lt)' : 'none',
                        fontSize: 12.5, fontWeight: r.voce ? 700 : 500,
                        cursor: clickable ? 'pointer' : 'default',
                      }}
                      onMouseEnter={e => { if (clickable) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '' }}
                    >
                      <span style={{ display: 'grid', width: 24, height: 24, placeItems: 'center', borderRadius: 7, background: 'var(--bg-subtle)', color: 'var(--text-3)', fontWeight: 800, fontSize: 11 }}>{MEDALS[i] ?? `${i + 1}º`}</span>
                      <span style={{ color: r.voce ? ACCENT : 'var(--text-2)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.voce ? `${r.nome} (você)` : r.nome}
                      </span>
                      <strong style={{ fontSize: 11.5, color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>{fmtBrl(r.receita)}</strong>
                      {clickable && <em style={{ fontStyle: 'normal', fontWeight: 700, fontSize: 9, color: ACCENT }}>Ver agente →</em>}
                    </div>
                    </li>
                    )
                  })}
                </ol>
              )}
            </section>

            <section style={{ padding: '20px 0', border: '1px solid var(--border)', borderRadius: 16, background: 'var(--bg-card)', boxShadow: '0 1px 3px rgba(15,23,42,0.06)' }}>
              <span style={{ ...kickerStyle, padding: '0 20px' }}>Linha do tempo</span>
              <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-1)', margin: '4px 0 0', padding: '0 20px' }}>Atividades Recentes</p>
              {data.atividades.length === 0 ? (
                <p style={{ fontSize: 12.5, color: 'var(--text-subtle)', textAlign: 'center', padding: '18px 20px 0' }}>Nenhuma atividade registrada ainda.</p>
              ) : (
                <>
                  <ul style={{ listStyle: 'none', margin: '13px 0 0', padding: 0 }}>
                    {(showAllAtividades ? data.atividades : data.atividades.slice(0, 6)).map((a, i) => {
                      const cfg = ATIVIDADE_CFG[a.tipo]
                      const texto = a.tipo === 'status' ? `${a.lead_nome} → ${statusLabel(a.detalhe)}`
                        : a.tipo === 'nota' ? `${a.lead_nome}: ${a.detalhe}`
                        : `Agendamento criado para ${a.lead_nome}`
                      return (
                        <li key={i}>
                        <div
                          role="button" tabIndex={0}
                          onClick={(e: MouseEvent<HTMLDivElement>) => openPreview('activity', i, e.currentTarget)}
                          onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPreview('activity', i, e.currentTarget) } }}
                          style={{ display: 'grid', gridTemplateColumns: '30px 1fr auto', alignItems: 'center', gap: 10, padding: '11px 20px', borderTop: i > 0 ? '1px solid var(--border-lt)' : 'none', cursor: 'pointer', fontSize: 12.5 }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '' }}
                        >
                          <span style={{ display: 'grid', width: 28, height: 28, placeItems: 'center', borderRadius: 8, background: cfg.color + '22' }}>
                            <cfg.Icon size={13} color={cfg.color} />
                          </span>
                          <span style={{ color: 'var(--text-2)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{texto}</span>
                          <em style={{ fontStyle: 'normal', color: 'var(--text-subtle)', fontSize: 10.5 }}>{relTime(a.em)}</em>
                        </div>
                        </li>
                      )
                    })}
                  </ul>
                  {data.atividades.length > 6 && (
                    <button
                      onClick={() => setShowAllAtividades(v => !v)}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, margin: '12px auto 0', background: 'none', border: 'none', cursor: 'pointer', color: ACCENT, fontSize: 12, fontWeight: 600 }}
                    >
                      {showAllAtividades ? <>Mostrar menos <ChevronUp size={13} /></> : <>Ver histórico completo ({data.atividades.length}) <ChevronDown size={13} /></>}
                    </button>
                  )}
                </>
              )}
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
