import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import {
  ArrowLeft, Users, Loader2, XCircle, Percent, Wallet, Clock3, Handshake,
  Trophy, Download, List, Lock, StickyNote, CalendarClock, ArrowRightLeft, ChevronDown, ChevronUp,
} from 'lucide-react'
import api from '../api'
import { parseUTC } from '../utils/date'
import { statusLabel } from '../utils/statusLabel'

interface TrendItem { mes: string; mes_label: string; captacoes: number; vendas: number; receita: number | null }
interface RankingEntry { nome: string; receita: number; voce: boolean }
interface Ranking { posicao: number; total: number; leaderboard: RankingEntry[] }
interface Atividade { tipo: 'status' | 'nota' | 'agendamento'; lead_nome: string; detalhe: string | null; em: string }
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

const EM_ANDAMENTO_STATUSES = 'pending,novo,new,scheduled,qualificado,qualified,proposta,proposal_sent,negociacao'
const VENDA_STATUSES_CSV    = 'waiting_billing,sale_performed,fechado,closed,won,convertido'
const CANCELADO_STATUS_CSV  = 'sale_not_performed'

const STAT_CFG = [
  { key: 'captacoes',        label: 'Total de Leads',    icon: Users,     color: '#3B82F6', bg: 'rgba(59,130,246,0.14)',  fmt: (v: number) => String(v), statusFilter: undefined as string | undefined },
  { key: 'em_andamento',     label: 'Em Andamento',      icon: Clock3,    color: '#8B5CF6', bg: 'rgba(139,92,246,0.14)', fmt: (v: number) => String(v), statusFilter: EM_ANDAMENTO_STATUSES },
  { key: 'vendas',           label: 'Vendas Realizadas', icon: Handshake, color: '#059669', bg: 'rgba(5,150,105,0.14)',   fmt: (v: number) => String(v), statusFilter: VENDA_STATUSES_CSV },
  { key: 'conversao',        label: 'Conversão Geral',   icon: Percent,  color: '#10B981', bg: 'rgba(16,185,129,0.14)', fmt: (v: number) => `${v}%`, statusFilter: VENDA_STATUSES_CSV },
  { key: 'cancelados',       label: 'Cancelados',        icon: XCircle,  color: '#EF4444', bg: 'rgba(239,68,68,0.14)',  fmt: (v: number) => String(v), statusFilter: CANCELADO_STATUS_CSV },
  { key: 'receita_recebida', label: 'Receita Recebida',  icon: Wallet,   color: '#10B981', bg: 'rgba(16,185,129,0.14)', fmt: fmtBrl, statusFilter: VENDA_STATUSES_CSV },
  { key: 'receita_a_receber',label: 'Receita a Receber', icon: Wallet,   color: '#F59E0B', bg: 'rgba(245,158,11,0.14)', fmt: fmtBrl, statusFilter: VENDA_STATUSES_CSV },
] as const

const ATIVIDADE_CFG = {
  status:       { color: '#3B82F6', Icon: ArrowRightLeft },
  nota:         { color: '#8B5CF6', Icon: StickyNote },
  agendamento:  { color: '#F59E0B', Icon: CalendarClock },
} as const

export default function VidaSDR() {
  const { origens } = useParams<{ origens: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const nome = searchParams.get('nome') || origens || 'SDR'

  const [data, setData] = useState<VidaSdrData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAllAtividades, setShowAllAtividades] = useState(false)

  useEffect(() => {
    if (!origens) return
    setLoading(true)
    api.get<VidaSdrData>(`/api/v1/gestao-comercial/vida-sdr?${new URLSearchParams({ origens })}`)
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [origens])

  function leadsHref(statusFilter?: string) {
    const params = new URLSearchParams({ origem: origens || '' })
    if (data?.primeiro_lead_em) {
      params.set('date_from', data.primeiro_lead_em.slice(0, 10))
      params.set('date_to', new Date().toISOString().slice(0, 10))
    }
    if (statusFilter) params.set('status', statusFilter)
    return `/leads-report?${params.toString()}`
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
          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 24 }}>
            {STAT_CFG.filter(({ key }) => data[key as keyof VidaSdrData] != null).map(({ key, label, icon: Icon, color, bg, fmt, statusFilter }) => (
              <div
                key={key}
                onClick={() => navigate(leadsHref(statusFilter))}
                style={{ background: 'var(--bg-card)', borderRadius: 16, padding: '18px 20px', border: '1px solid var(--border)', boxShadow: '0 1px 3px rgba(15,23,42,0.06)', cursor: 'pointer', transition: 'transform 120ms, box-shadow 120ms' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = `0 4px 16px ${color}33` }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 3px rgba(15,23,42,0.06)' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={14} color={color} />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                  <p style={{ fontSize: 27, fontWeight: 800, color, margin: 0, letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums' }}>
                    {fmt(data[key as keyof VidaSdrData] as number)}
                  </p>
                  <span style={{ fontSize: 10.5, color, fontWeight: 600, marginBottom: 2 }}>Ver leads →</span>
                </div>
              </div>
            ))}
          </div>

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
                      onClick={clickable ? () => navigate(`/leads-report?origem=${encodeURIComponent(r.nome)}`) : undefined}
                      title={clickable ? `Ver leads de ${r.nome}` : undefined}
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
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: i < arr.length - 1 ? '1px solid var(--border-lt)' : 'none' }}>
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
    </div>
  )
}
