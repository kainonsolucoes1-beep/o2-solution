import { useEffect, useState, type MouseEvent, type KeyboardEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import {
  ArrowLeft, Users, Loader2, XCircle, Percent, Wallet, Clock3, Handshake,
  Trophy, Download, List, Lock, StickyNote, CalendarClock, ArrowRightLeft, ChevronDown, ChevronUp,
  type LucideIcon,
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
// navegar direto — a navegação real fica na ação do drawer.
const OPERACIONAL_CFG = [
  { key: 'captacoes',        id: 'captacoes' as SmartPreviewId,        label: 'Total de Leads',    icon: Users,    color: '#3B82F6', bg: 'rgba(59,130,246,0.14)', fmt: (v: number) => String(v) },
  { key: 'em_andamento',     id: 'em_andamento' as SmartPreviewId,     label: 'Em Andamento',      icon: Clock3,   color: '#8B5CF6', bg: 'rgba(139,92,246,0.14)', fmt: (v: number) => String(v) },
  { key: 'vendas',           id: 'vendas' as SmartPreviewId,           label: 'Vendas Realizadas', icon: Handshake,color: '#059669', bg: 'rgba(5,150,105,0.14)',  fmt: (v: number) => String(v) },
  { key: 'conversao',        id: 'conversao' as SmartPreviewId,        label: 'Conversão Geral',   icon: Percent,  color: '#10B981', bg: 'rgba(16,185,129,0.14)', fmt: (v: number) => `${v}%` },
  { key: 'cancelados',       id: 'cancelados' as SmartPreviewId,       label: 'Cancelados',        icon: XCircle,  color: '#EF4444', bg: 'rgba(239,68,68,0.14)',  fmt: (v: number) => String(v) },
] as const

// Card Financeiro: apenas os 4 itens aprovados no Candidate Freeze. Receita
// potencial e Custo total ainda não têm fonte real — ver limitações no handoff.
const FINANCEIRO_CFG = [
  { key: 'receita_recebida',  id: 'receita_recebida' as SmartPreviewId,  label: 'Receita Recebida',  icon: Wallet, color: '#10B981', bg: 'rgba(16,185,129,0.14)', simulated: false },
  { key: 'receita_a_receber', id: 'receita_a_receber' as SmartPreviewId, label: 'Receita a Receber',  icon: Wallet, color: '#F59E0B', bg: 'rgba(245,158,11,0.14)', simulated: false },
  { key: 'receita_potencial', id: 'receita_potencial' as SmartPreviewId, label: 'Receita Potencial',  icon: Wallet, color: '#7C3AED', bg: 'rgba(124,58,237,0.14)', simulated: true },
  { key: 'custo_total',       id: 'custo_total' as SmartPreviewId,       label: 'Custo Total',        icon: Wallet, color: '#DC2626', bg: 'rgba(220,38,38,0.14)',  simulated: true },
] as const

const ATIVIDADE_CFG = {
  status:       { color: '#3B82F6', Icon: ArrowRightLeft },
  nota:         { color: '#8B5CF6', Icon: StickyNote },
  agendamento:  { color: '#F59E0B', Icon: CalendarClock },
} as const

function StatCard({ label, icon: Icon, color, bg, value, simulated, onOpen }: {
  label: string; icon: LucideIcon; color: string; bg: string; value: string; simulated?: boolean
  onOpen: (trigger: HTMLElement) => void
}) {
  return (
    <div
      role="button" tabIndex={0}
      onClick={(e: MouseEvent<HTMLDivElement>) => onOpen(e.currentTarget)}
      onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(e.currentTarget) } }}
      style={{ background: 'var(--bg-card)', borderRadius: 16, padding: '18px 20px', border: '1px solid var(--border)', boxShadow: '0 1px 3px rgba(15,23,42,0.06)', cursor: 'pointer', transition: 'transform 120ms, box-shadow 120ms' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = `0 4px 16px ${color}33` }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 3px rgba(15,23,42,0.06)' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {label}{simulated && <em style={{ marginLeft: 6, fontStyle: 'normal', fontWeight: 700, color: '#7C3AED' }}>· estimativa</em>}
        </span>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={14} color={color} />
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <p style={{ fontSize: 27, fontWeight: 800, color, margin: 0, letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums' }}>{value}</p>
        <span style={{ fontSize: 10.5, color, fontWeight: 600, marginBottom: 2 }}>Ver detalhes →</span>
      </div>
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

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '20px 24px 60px' }}>
      <button
        onClick={() => navigate(-1)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 13, fontWeight: 500, padding: '4px 0', marginBottom: 20 }}
      >
        <ArrowLeft size={16} /> Voltar
      </button>

      {/* Hero */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap',
        padding: '26px 30px', borderRadius: 20, marginBottom: 24,
        background: 'linear-gradient(135deg,#1E3A8A,#2563EB 55%,#3B82F6)', boxShadow: '0 10px 34px rgba(37,99,235,0.28)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{
            flexShrink: 0, width: 62, height: 62, borderRadius: '50%',
            background: 'rgba(255,255,255,0.16)', border: '2px solid rgba(255,255,255,0.35)',
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, fontWeight: 800, letterSpacing: '0.02em',
          }}>
            {initials(nome)}
          </div>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 5px' }}>
              Desempenho individual
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <p style={{ fontSize: 24, fontWeight: 800, color: '#fff', margin: 0, letterSpacing: '-0.01em' }}>{nome}</p>
              {data?.ranking && (
                <span style={{ fontSize: 11, fontWeight: 700, color: '#DBEAFE', background: 'rgba(255,255,255,0.16)', border: '1px solid rgba(255,255,255,0.3)', padding: '3px 9px', borderRadius: 99, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Trophy size={11} /> #{data.ranking.posicao} de {data.ranking.total}
                </span>
              )}
            </div>
            {data?.primeiro_lead_em && (
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.78)', margin: '5px 0 0' }}>
                Desde {fmtDate(data.primeiro_lead_em)} · {mesesAtivo(data.primeiro_lead_em)} {mesesAtivo(data.primeiro_lead_em) === 1 ? 'mês' : 'meses'} ativo
              </p>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
          <button
            onClick={() => navigate(`/leads-report?origem=${encodeURIComponent(origens || '')}`)}
            style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600, color: '#fff', background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.28)', padding: '9px 15px', borderRadius: 10, cursor: 'pointer' }}
          >
            <List size={14} /> Ver leads
          </button>
          <button
            onClick={exportarCsv}
            disabled={!data}
            style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600, color: '#1D4ED8', background: '#fff', border: '1px solid #fff', padding: '9px 15px', borderRadius: 10, cursor: data ? 'pointer' : 'default', opacity: data ? 1 : 0.6 }}
          >
            <Download size={14} /> Exportar
          </button>
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
          {/* Card Operacional + Card Financeiro */}
          {(() => {
            const canSeeFinance = data.receita_recebida != null
            const cancellationRate = data.captacoes ? Math.round((data.cancelados / data.captacoes) * 100) : 0
            return (
              <div style={{ display: 'grid', gridTemplateColumns: canSeeFinance ? '1.3fr 1fr' : '1fr', gap: 16, marginBottom: 24 }}>
                <div style={{ background: 'var(--bg-card)', borderRadius: 16, padding: '20px 22px', border: '1px solid var(--border)', boxShadow: '0 1px 3px rgba(15,23,42,0.06)' }}>
                  <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 14px' }}>Operacional</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                    {OPERACIONAL_CFG.map(({ key, id, label, icon, color, bg, fmt }) => (
                      <StatCard key={key} label={label} icon={icon} color={color} bg={bg} value={fmt(data[key as keyof VidaSdrData] as number)} onOpen={trigger => openPreview(id, 0, trigger)} />
                    ))}
                    <StatCard label="Tx. Cancelamento" icon={XCircle} color="#EF4444" bg="rgba(239,68,68,0.14)" value={`${cancellationRate}%`} onOpen={trigger => openPreview('cancellationRate', 0, trigger)} />
                  </div>
                </div>

                {canSeeFinance && (
                  <div style={{ background: 'var(--bg-card)', borderRadius: 16, padding: '20px 22px', border: '1px solid var(--border)', boxShadow: '0 1px 3px rgba(15,23,42,0.06)' }}>
                    <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 14px' }}>Financeiro</p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                      {FINANCEIRO_CFG.map(({ key, id, label, icon, color, bg, simulated }) => {
                        const value = key === 'receita_recebida' ? fmtBrl(data.receita_recebida || 0)
                          : key === 'receita_a_receber' ? fmtBrl(data.receita_a_receber || 0)
                          : key === 'receita_potencial' ? fmtBrl(MOCK_POTENCIAL_TOTAL)
                          : fmtBrl(MOCK_CUSTO_TOTAL)
                        return <StatCard key={key} label={label} icon={icon} color={color} bg={bg} value={value} simulated={simulated} onOpen={trigger => openPreview(id, 0, trigger)} />
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          {/* Evolução + Ranking */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 16, marginBottom: 24 }}>
            <div style={{ background: 'var(--bg-card)', borderRadius: 16, padding: '22px 26px', border: '1px solid var(--border)', boxShadow: '0 1px 3px rgba(15,23,42,0.06)' }}>
              <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 2px' }}>Evolução</p>
              <p style={{ fontSize: 11.5, color: 'var(--text-subtle)', margin: '0 0 18px' }}>Captações e vendas por mês, desde o primeiro lead</p>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.trend} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-lt)" />
                  <XAxis dataKey="mes_label" tick={{ fontSize: 10, fill: '#94A3B8' }} interval={Math.max(0, Math.ceil(data.trend.length / 12) - 1)} />
                  <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)' }}
                    formatter={(val: number, name: string) => [val, name === 'captacoes' ? 'Captações' : 'Vendas']} />
                  <Legend formatter={(v) => v === 'captacoes' ? 'Captações' : 'Vendas'} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="captacoes" fill="#3B82F6" radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="vendas"    fill="#10B981" radius={[4, 4, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div style={{ background: 'var(--bg-card)', borderRadius: 16, padding: '20px 22px', border: '1px solid var(--border)', boxShadow: '0 1px 3px rgba(15,23,42,0.06)' }}>
              <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 2px' }}>Ranking do Time</p>
              <p style={{ fontSize: 11.5, color: 'var(--text-subtle)', margin: '0 0 16px' }}>Por receita recebida (vitalício)</p>
              {!data.ranking ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '18px 0', color: 'var(--text-subtle)', fontSize: 12 }}>
                  <Lock size={13} /> Visível apenas para Admin e Diretor
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {data.ranking.leaderboard.map((r, i) => {
                    const clickable = r.nome !== 'o2 Solution'
                    return (
                    <div
                      key={r.nome}
                      role={clickable ? 'button' : undefined} tabIndex={clickable ? 0 : undefined}
                      onClick={clickable ? (e: MouseEvent<HTMLDivElement>) => openPreview('ranking', i, e.currentTarget) : undefined}
                      onKeyDown={clickable ? (e: KeyboardEvent<HTMLDivElement>) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPreview('ranking', i, e.currentTarget) } } : undefined}
                      title={clickable ? `Ver prévia de ${r.nome}` : undefined}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0',
                        borderBottom: i < data.ranking!.leaderboard.length - 1 ? '1px solid var(--border-lt)' : 'none',
                        fontWeight: r.voce ? 700 : 500,
                        cursor: clickable ? 'pointer' : 'default',
                      }}
                      onMouseEnter={e => { if (clickable) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '' }}
                    >
                      <span style={{ fontSize: 13, width: 22, flexShrink: 0 }}>{MEDALS[i] ?? `${i + 1}º`}</span>
                      <span style={{ fontSize: 12.5, color: r.voce ? '#3B82F6' : 'var(--text-2)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.voce ? `${r.nome} (você)` : r.nome}
                      </span>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{fmtBrl(r.receita)}</span>
                    </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Atividade Recente + Metas (proposta) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 16 }}>
            <div style={{ background: 'var(--bg-card)', borderRadius: 16, padding: '20px 22px', border: '1px solid var(--border)', boxShadow: '0 1px 3px rgba(15,23,42,0.06)' }}>
              <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 2px' }}>Atividade Recente</p>
              <p style={{ fontSize: 11.5, color: 'var(--text-subtle)', margin: '0 0 16px' }}>Últimas mudanças de status, notas e agendamentos</p>
              {data.atividades.length === 0 ? (
                <p style={{ fontSize: 12.5, color: 'var(--text-subtle)', textAlign: 'center', padding: '18px 0' }}>Nenhuma atividade registrada ainda.</p>
              ) : (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {(showAllAtividades ? data.atividades : data.atividades.slice(0, 6)).map((a, i, arr) => {
                      const cfg = ATIVIDADE_CFG[a.tipo]
                      const texto = a.tipo === 'status' ? `${a.lead_nome} → ${statusLabel(a.detalhe)}`
                        : a.tipo === 'nota' ? `${a.lead_nome}: ${a.detalhe}`
                        : `Agendamento criado para ${a.lead_nome}`
                      return (
                        <div
                          key={i}
                          role="button" tabIndex={0}
                          onClick={(e: MouseEvent<HTMLDivElement>) => openPreview('activity', i, e.currentTarget)}
                          onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPreview('activity', i, e.currentTarget) } }}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: i < arr.length - 1 ? '1px solid var(--border-lt)' : 'none', cursor: 'pointer' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '' }}
                        >
                          <div style={{ width: 24, height: 24, borderRadius: 7, background: cfg.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <cfg.Icon size={12} color={cfg.color} />
                          </div>
                          <span style={{ fontSize: 12.5, color: 'var(--text-2)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{texto}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-subtle)', flexShrink: 0 }}>{relTime(a.em)}</span>
                        </div>
                      )
                    })}
                  </div>
                  {data.atividades.length > 6 && (
                    <button
                      onClick={() => setShowAllAtividades(v => !v)}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, margin: '12px auto 0', background: 'none', border: 'none', cursor: 'pointer', color: '#3B82F6', fontSize: 12, fontWeight: 600 }}
                    >
                      {showAllAtividades ? <>Mostrar menos <ChevronUp size={13} /></> : <>Ver histórico completo ({data.atividades.length}) <ChevronDown size={13} /></>}
                    </button>
                  )}
                </>
              )}
            </div>

            <div style={{ background: 'var(--bg-card)', borderRadius: 16, padding: '20px 22px', border: '1.5px dashed var(--border-in)', boxShadow: '0 1px 3px rgba(15,23,42,0.06)' }}>
              <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 2px', display: 'flex', alignItems: 'center', gap: 8 }}>
                Metas do Mês
                <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#7C3AED', background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.25)', padding: '2px 8px', borderRadius: 99 }}>
                  Em breve
                </span>
              </p>
              <p style={{ fontSize: 11.5, color: 'var(--text-subtle)', margin: '0 0 16px' }}>
                Depende de cadastrar metas por SDR — combinar formato antes de construir
              </p>
            </div>
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
