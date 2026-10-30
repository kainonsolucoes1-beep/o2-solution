import { useEffect, useRef, useState } from 'react'
import {
  ChevronRight, AlertTriangle, X, ShieldCheck, ShieldX, Users, TrendingUp, TrendingDown,
  ArrowLeftRight, ArrowUp, ArrowDown, SlidersHorizontal, Cake, HeartPulse, Minus,
  DollarSign, Target, ExternalLink, LayoutGrid, Share2, Tag, RefreshCw,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, LineChart, Line, ComposedChart, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import api from '../api'
import { useTheme } from '../ThemeContext'
import SinoSlot, { VerComoSlot } from '../components/SinoSlot'

interface BreakdownItem {
  label: string
  captacoes: number
  vendas: number
  cancelados: number
  conversao: number
  tempo_medio_dias: number | null
  receita_gerada: number | null
}

interface FonteData {
  fonte: string
  captacoes: number
  vendas: number
  cancelados: number
  conversao: number
  tempo_medio_dias: number | null
  receita_gerada: number | null
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
  tempo_medio_dias: number | null
  receita_gerada: number | null
}

interface ModalidadeStat {
  modalidade: string
  captacoes: number
  vendas: number
  cancelados: number
  conversao: number
  tempo_medio_dias: number | null
  receita_gerada: number | null
}

interface RenutricaoOverview {
  captacoes: number
  vendas: number
  cancelados: number
  conversao: number
  tempo_medio_dias: number | null
  receita_gerada: number | null
}

interface AgenteRow {
  fonte: string
  captacoes: number
  vendas: number
  cancelados: number
  conversao: number
  tempo_medio_dias: number | null
  receita_gerada: number | null
}

interface Modalidade { nome: string; count: number; pct: number }
interface PlanoResumo { possui: number; nao_possui: number; sem_informacao: number; pct_possui: number; pct_nao_possui: number }

interface DetalheComum {
  captacoes: number
  cancelados: number
  base_liquida: number
  vendas: number
  conversao: number
  pct_perda: number
  receita_potencial: number
  ticket_medio: number
  renutricao_count?: number
  modalidades: Modalidade[]
  plano: PlanoResumo
  por_canal?: { nome: string; count: number; pct: number }[]
  por_ponto_conversao?: { nome: string; count: number; pct: number }[]
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
  id?: string
  nome: string
  origem?: string
  status: string
  valor: number | null
  tipo: 'venda' | 'perda' | 'ativo'
}

interface AgeLead {
  nome: string
  idade: number
  status: string
  tipo: 'venda' | 'perda' | 'ativo'
  valor: number | null
}

const CHART_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899']

// tooltip do Recharts — usa tokens pra adaptar ao tema (o default é branco fixo)
const CHART_TOOLTIP: {
  contentStyle: React.CSSProperties; labelStyle: React.CSSProperties; itemStyle: React.CSSProperties
} = {
  contentStyle: { fontSize: 12, borderRadius: 8, border: '1px solid var(--border)', backgroundColor: 'var(--bg-card)', color: 'var(--text-2)' },
  labelStyle: { color: 'var(--text-1)', fontWeight: 600, marginBottom: 2 },
  itemStyle: { color: 'var(--text-2)' },
}

const SDR_NAMES = new Set([
  'isaac', 'julia', 'leticia', 'maria eduarda', 'anny', 'emily', 'emilly',
  'pedro', 'lucas', 'guilherme', 'lucascardoso', 'lucas cardoso', 'rodolfo', 'discadora',
  'gabrieli', 'gabrielli', 'kauany', 'kauanny', 'clara', 'o2 solution',
  'lucas carvalho', 'lucascarvalho', 'thaynara', 'pamela',
])

const O2_MEMBER_NAMES = new Set(['clara', 'maria eduarda', 'gabrieli', 'kauany'])

const isSdr      = (fonte: string) => SDR_NAMES.has(fonte.toLowerCase())
const isO2Member = (fonte: string) => O2_MEMBER_NAMES.has(fonte.toLowerCase())
const isO2Self   = (fonte: string) => fonte.toLowerCase() === 'o2 solution'

const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const MESES_FULL = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

function fmtBrl(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function prevMonthOf(m: string): string {
  const [y, mo] = m.split('-').map(Number)
  const d = new Date(y, mo - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthsBack(anchor: string, n: number): string[] {
  const [y, mo] = anchor.split('-').map(Number)
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(y, mo - 1 - i, 1)
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return out
}

function monthLabel(m: string): string {
  const [y, mo] = m.split('-').map(Number)
  return `${MESES_ABREV[mo - 1]}/${String(y).slice(2)}`
}

// ─── Faixa executiva (resumo) — sem cards individuais, divisores sutis ───────
interface HeroTrendProps {
  curr: number
  prev: number | null
  prevLabel?: string
  mode?: 'pct' | 'pp'
  invert?: boolean
}
function HeroTrend({ curr, prev, prevLabel, mode = 'pct', invert = false }: HeroTrendProps) {
  if (prev === null) return <span style={{ fontSize: 12, color: 'var(--text-subtle)' }}>sem dado do período anterior</span>
  const isFlat = curr === prev
  if (isFlat) return <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Minus size={12} />Estável</span>
  const isUp = curr > prev
  const good = invert ? !isUp : isUp
  const color = good ? '#15803D' : '#B91C1C'
  const Icon = isUp ? ArrowUp : ArrowDown
  const label = mode === 'pp'
    ? `${isUp ? '+' : ''}${Math.round((curr - prev) * 10) / 10}pp`
    : prev === 0 ? '+100%' : `${isUp ? '+' : ''}${Math.round(((curr - prev) / prev) * 1000) / 10}%`
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color }}>
      <Icon size={13} />{label}
      {prevLabel !== undefined && <span style={{ color: 'var(--text-subtle)', fontWeight: 500 }}>&nbsp;vs {prevLabel}</span>}
    </span>
  )
}

// ─── Barra de proporção discreta (2 segmentos) ───────────────────────────────
function ProportionBar({ pctA, pctB, colorA, colorB }: { pctA: number; pctB: number; colorA: string; colorB: string }) {
  return (
    <div style={{ display: 'flex', width: '100%', height: 6, borderRadius: 3, overflow: 'hidden', background: 'var(--border-lt)' }}>
      <div style={{ width: `${pctA}%`, background: colorA }} />
      <div style={{ width: `${pctB}%`, background: colorB }} />
    </div>
  )
}

// ─── Estado compacto: carregando / erro / vazio ──────────────────────────────
function StateBox({ kind, height = 140, message, onRetry }: {
  kind: 'loading' | 'error' | 'empty'; height?: number; message?: string; onRetry?: () => void
}) {
  if (kind === 'loading') {
    return (
      <div
        aria-hidden="true"
        style={{ height, borderRadius: 16, background: 'var(--bg-subtle)' }}
        className="perf-skeleton"
      />
    )
  }
  return (
    <div style={{
      height, borderRadius: 16, background: 'var(--bg-card)', border: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, textAlign: 'center',
    }}>
      <p style={{ fontSize: 13, color: kind === 'error' ? '#B91C1C' : 'var(--text-muted)', margin: 0 }}>{message}</p>
      {kind === 'error' && onRetry && (
        <button onClick={onRetry} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#2563EB', fontSize: 13, fontWeight: 600 }}>
          Tentar novamente
        </button>
      )}
    </div>
  )
}

// ─── Modal simples de leads (sem filtro de status) ───────────────────────────
function SimpleLeadsModal({ title, subtitle, loading, leads, ageMode, onClose }: {
  title: string; subtitle: string; loading: boolean
  leads: (OrgLead | AgeLead)[]; ageMode?: boolean; onClose: () => void
}) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title} style={{ background: 'var(--bg-card)', borderRadius: 16, width: '100%', maxWidth: 480, maxHeight: '80vh', overflowY: 'auto', boxShadow: 'var(--shadow-md, 0 12px 32px rgba(15,23,42,.16))' }}>
        <div style={{ padding: '20px 24px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
          <div>
            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>{title}</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{subtitle}</p>
          </div>
          <button onClick={onClose} aria-label="Fechar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, flexShrink: 0 }}>
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: '16px 24px 24px' }}>
          {loading ? (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 0' }}>Carregando…</p>
          ) : leads.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 0' }}>Nenhum lead encontrado</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {leads.map((l, i) => {
                const tipoCor = l.tipo === 'venda' ? '#15803D' : l.tipo === 'perda' ? '#B91C1C' : '#6B7280'
                const tipoBg  = l.tipo === 'venda' ? '#DCFCE7' : l.tipo === 'perda' ? '#FEE2E2' : 'var(--border-lt)'
                return (
                  <div key={i} style={{ padding: '10px 14px', background: 'var(--bg-subtle)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {ageMode && 'idade' in l && <span style={{ fontSize: 12, fontWeight: 700, color: '#1D4ED8', background: '#DBEAFE', borderRadius: 6, padding: '2px 8px', flexShrink: 0 }}>{l.idade} anos</span>}
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>{l.nome}</p>
                        <span style={{ fontSize: 10, background: tipoBg, color: tipoCor, borderRadius: 4, padding: '2px 7px', fontWeight: 600 }}>{l.status}</span>
                      </div>
                    </div>
                    {l.valor ? <span style={{ fontSize: 13, fontWeight: 600, color: '#15803D', flexShrink: 0, marginLeft: 8, fontVariantNumeric: 'tabular-nums' }}>{fmtBrl(l.valor)}</span> : null}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Modal de leads com filtro de status (base / canal / ponto de conversão) ─
function FilterableLeadsModal({ title, subtitle, loading, leads, total, statusFilter, onFilter, onClose }: {
  title: string; subtitle: string; loading: boolean; leads: OrgLead[]; total?: number
  statusFilter: string | null; onFilter: (s: string | null) => void; onClose: () => void
}) {
  const navigate = useNavigate()
  const statusList = [...new Set(leads.map(l => l.status))]
  const filtered = statusFilter ? leads.filter(l => l.status === statusFilter) : leads
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 110, padding: 24 }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title} style={{ background: 'var(--bg-card)', borderRadius: 16, width: '100%', maxWidth: 520, maxHeight: '80vh', overflowY: 'auto', boxShadow: 'var(--shadow-md, 0 12px 32px rgba(15,23,42,.16))' }}>
        <div style={{ padding: '20px 24px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
          <div>
            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>{title}</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{subtitle}</p>
          </div>
          <button onClick={onClose} aria-label="Fechar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, marginLeft: 12, flexShrink: 0 }}>
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: '16px 24px 24px' }}>
          {loading ? (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 0' }}>Carregando…</p>
          ) : leads.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px 0' }}>Nenhum lead encontrado</p>
          ) : (
            <>
              {total !== undefined && total > leads.length && (
                <p style={{ fontSize: 12, color: 'var(--text-muted)', background: 'var(--bg-subtle)', borderRadius: 8, padding: '8px 12px', margin: '0 0 14px' }}>
                  Exibindo os {leads.length} mais recentes de {total} leads.
                </p>
              )}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
                <button onClick={() => onFilter(null)}
                  style={{ fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer', background: statusFilter === null ? '#2563EB' : 'var(--bg-subtle)', color: statusFilter === null ? '#fff' : 'var(--text-muted)' }}>
                  Todos ({leads.length})
                </button>
                {statusList.map(st => {
                  const count = leads.filter(l => l.status === st).length
                  const active = statusFilter === st
                  return (
                    <button key={st} onClick={() => onFilter(active ? null : st)}
                      style={{ fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer', background: active ? '#2563EB' : 'var(--bg-subtle)', color: active ? '#fff' : 'var(--text-muted)' }}>
                      {st} ({count})
                    </button>
                  )
                })}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {filtered.map((l, i) => {
                  const tipoCor = l.tipo === 'venda' ? '#15803D' : l.tipo === 'perda' ? '#B91C1C' : '#6B7280'
                  const tipoBg  = l.tipo === 'venda' ? '#DCFCE7' : l.tipo === 'perda' ? '#FEE2E2' : 'var(--border-lt)'
                  return (
                    <div key={i} style={{ padding: '10px 14px', background: 'var(--bg-subtle)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        <span style={{ fontSize: 10, background: tipoBg, color: tipoCor, borderRadius: 4, padding: '2px 7px', fontWeight: 600, flexShrink: 0 }}>{l.status}</span>
                        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>{l.nome}</p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, marginLeft: 8 }}>
                        {l.valor ? <span style={{ fontSize: 13, fontWeight: 600, color: '#15803D', fontVariantNumeric: 'tabular-nums' }}>{fmtBrl(l.valor)}</span> : null}
                        {l.id && (
                          <button
                            onClick={() => navigate(`/leads/${l.id}`)}
                            title="Ver ficha do lead"
                            aria-label="Ver ficha do lead"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-subtle)', padding: 2, display: 'flex' }}
                          >
                            <ExternalLink size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

type DrawerKind = 'base' | 'canal' | 'conversao' | 'modalidade' | 'renutricao'

// Recorte próprio do drawer: o período da página ou um mês / semana (seg–dom) / dia
// em volta de uma data âncora, navegável com ‹ ›.
type DrawerGran = 'pagina' | 'mes' | 'semana' | 'dia'
const DRAWER_GRANS: { key: DrawerGran; label: string }[] = [
  { key: 'pagina', label: 'Período da página' },
  { key: 'mes', label: 'Mês' },
  { key: 'semana', label: 'Semana' },
  { key: 'dia', label: 'Dia' },
]

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function parseIso(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function brDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}
function drawerRange(gran: Exclude<DrawerGran, 'pagina'>, anchor: string): { from: Date; to: Date } {
  const a = parseIso(anchor)
  if (gran === 'dia') return { from: a, to: a }
  if (gran === 'semana') {
    const from = new Date(a); from.setDate(a.getDate() - ((a.getDay() + 6) % 7))
    const to = new Date(from); to.setDate(from.getDate() + 6)
    return { from, to }
  }
  return { from: new Date(a.getFullYear(), a.getMonth(), 1), to: new Date(a.getFullYear(), a.getMonth() + 1, 0) }
}
function shiftAnchor(gran: Exclude<DrawerGran, 'pagina'>, anchor: string, dir: 1 | -1): string {
  const a = parseIso(anchor)
  if (gran === 'dia') a.setDate(a.getDate() + dir)
  else if (gran === 'semana') a.setDate(a.getDate() + 7 * dir)
  else return isoDate(new Date(a.getFullYear(), a.getMonth() + dir, 1))
  return isoDate(a)
}

const DRAWER_KIND_META: Record<DrawerKind, { label: string; icon: typeof Target }> = {
  base: { label: 'Base', icon: LayoutGrid },
  canal: { label: 'Canal', icon: Share2 },
  conversao: { label: 'Ponto de conversão', icon: Target },
  modalidade: { label: 'Modalidade', icon: Tag },
  renutricao: { label: 'Renutrição', icon: RefreshCw },
}

const fmtPct = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`

// Variação contra o período anterior: % para contagens, p.p. para taxas.
// invert = subir é ruim (cancelamento).
function DrawerDelta({ cur, prev, tipo, invert }: { cur: number; prev: number | undefined; tipo: 'count' | 'pp'; invert?: boolean }) {
  if (prev === undefined) return null
  const muted = { fontSize: 11.5, color: 'var(--text-muted)', fontWeight: 500 }
  if (tipo === 'count' && prev === 0) return <span style={muted}>{cur > 0 ? 'sem base anterior' : 'igual'}</span>
  const diff = tipo === 'count' ? (cur - prev) / prev * 100 : cur - prev
  if (Math.abs(diff) < 0.05) return <span style={muted}>estável</span>
  const up = diff > 0
  const good = invert ? !up : up
  const Icon = up ? ArrowUp : ArrowDown
  const txt = tipo === 'count'
    ? `${Math.abs(diff).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`
    : `${Math.abs(diff).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} p.p.`
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 11.5, fontWeight: 600, color: good ? '#15803D' : '#B91C1C' }}>
      <Icon size={11} strokeWidth={2.5} />{txt}
    </span>
  )
}

const TEAM_VALUES: Record<'sp' | 'pe', string> = { sp: 'Equipe São Paulo', pe: 'Equipe Pernambuco' }
const TEAM_LABELS: Record<'sp' | 'pe', string> = { sp: 'São Paulo', pe: 'Recife' }

const MAIN_TABS = [
  { key: 'visao-geral', label: 'Visão geral' },
  { key: 'aquisicao', label: 'Aquisição' },
  { key: 'ranking', label: 'Ranking' },
  { key: 'equipe-sdr', label: 'Agentes' },
  { key: 'perfil-leads', label: 'Perfil dos leads' },
] as const
type MainTab = typeof MAIN_TABS[number]['key']

export default function KPIs() {
  const navigate = useNavigate()
  const { dark } = useTheme()
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const [month, setMonth] = useState(currentMonth)
  const [period, setPeriod] = useState<'month' | 'all' | 'range'>('month')
  const [rangeFrom, setRangeFrom] = useState('')
  const [rangeTo, setRangeTo] = useState('')
  // versao com debounce: input type="date" pode disparar onChange com datas
  // incompletas enquanto o ano esta sendo digitado (ex: "2026" vira "0202" no
  // meio da digitacao) — sem isso, cada tecla dispara uma leva de requests
  // com data invalida e derruba o backend (504 em cascata).
  const [debRangeFrom, setDebRangeFrom] = useState('')
  const [debRangeTo, setDebRangeTo] = useState('')
  useEffect(() => {
    const t = setTimeout(() => { setDebRangeFrom(rangeFrom); setDebRangeTo(rangeTo) }, 500)
    return () => clearTimeout(t)
  }, [rangeFrom, rangeTo])
  const [team, setTeam] = useState<'all' | 'sp' | 'pe'>('all')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const filtersRef = useRef<HTMLDivElement>(null)

  const [activeMainTab, setActiveMainTab] = useState<MainTab>('visao-geral')
  const [aquisicaoView, setAquisicaoView] = useState<'bases' | 'canais' | 'conversao' | 'modalidade' | 'renutricao'>('bases')
  const [rankSortBy, setRankSortBy] = useState<'captacoes' | 'receita'>('captacoes')

  const [data, setData] = useState<FonteData[]>([])
  const [loading, setLoading] = useState(true)
  const [dataError, setDataError] = useState(false)
  const [basesData, setBasesData] = useState<BaseStat[]>([])
  const [basesLoading, setBasesLoading] = useState(true)
  const [basesError, setBasesError] = useState(false)
  const [modalidadeData, setModalidadeData] = useState<ModalidadeStat[]>([])
  const [modalidadeLoading, setModalidadeLoading] = useState(true)
  const [modalidadeError, setModalidadeError] = useState(false)
  const [renutricaoData, setRenutricaoData] = useState<RenutricaoOverview | null>(null)
  const [renutricaoLoading, setRenutricaoLoading] = useState(true)
  const [renutricaoError, setRenutricaoError] = useState(false)
  const [agentesData, setAgentesData] = useState<AgenteRow[]>([])
  const [agentesLoading, setAgentesLoading] = useState(true)
  const [agentesError, setAgentesError] = useState(false)
  const [ageBands, setAgeBands] = useState<AgeBand[]>([])
  const [ageBandsLoading, setAgeBandsLoading] = useState(true)
  const [ageError, setAgeError] = useState(false)
  const [ageSemIdade, setAgeSemIdade] = useState(0)
  const [ageComIdade, setAgeComIdade] = useState(0)
  const [planoSaude, setPlanoSaude] = useState<PlanoSaudeData | null>(null)
  const [planoSaudeLoading, setPlanoSaudeLoading] = useState(true)
  const [planoError, setPlanoError] = useState(false)
  const [prevSummary, setPrevSummary] = useState<{ cap: number; ven: number; can: number } | null>(null)

  const [trendMonths, setTrendMonths] = useState<{ mes: string; mesLabel: string; captacoes: number; vendas: number }[]>([])
  const [trendLoading, setTrendLoading] = useState(true)
  const [trendError, setTrendError] = useState(false)

  // hire_date: operador não é comparado com meses em que não estava na empresa
  const [me, setMe] = useState<{ role: string; hire_date: string | null; created_at: string } | null>(null)
  useEffect(() => {
    api.get<{ role: string; hire_date: string | null; created_at: string }>('/api/v1/auth/me').then(r => setMe(r.data)).catch(() => {})
  }, [])
  const _hireYM = me && me.role !== 'admin' && me.role !== 'comercial'
    ? (me.hire_date || me.created_at || '').slice(0, 7)
    : ''
  const visibleTrend = _hireYM ? trendMonths.filter(m => m.mes >= _hireYM) : trendMonths

  const [orgPopup, setOrgPopup] = useState<string | null>(null)
  const [orgLeads, setOrgLeads] = useState<OrgLead[]>([])
  const [orgLeadsTotal, setOrgLeadsTotal] = useState(0)
  const [orgLeadsLoading, setOrgLeadsLoading] = useState(false)
  const [orgStatusFilter, setOrgStatusFilter] = useState<string | null>(null)

  const [basePopup, setBasePopup] = useState<string | null>(null)
  const [baseLeads, setBaseLeads] = useState<OrgLead[]>([])
  const [baseLeadsLoading, setBaseLeadsLoading] = useState(false)
  const [baseStatusFilter, setBaseStatusFilter] = useState<string | null>(null)

  const [agePopup, setAgePopup] = useState<string | null>(null)
  const [ageLeads, setAgeLeads] = useState<AgeLead[]>([])
  const [ageLeadsLoading, setAgeLeadsLoading] = useState(false)

  const [planoPopup, setPlanoPopup] = useState<string | null>(null)
  const [planoLeads, setPlanoLeads] = useState<OrgLead[]>([])
  const [planoLeadsLoading, setPlanoLeadsLoading] = useState(false)

  const [convCompare, setConvCompare] = useState(false)
  const [convCompareLevel, setConvCompareLevel] = useState<'month' | 'week' | 'day'>('month')
  const [convComparePoint, setConvComparePoint] = useState<string | null>(null)
  const [convCompareDaily, setConvCompareDaily] = useState<{ date: string; dia: number; captacoes: number; vendas: number }[]>([])
  const [convCompareDailyLoading, setConvCompareDailyLoading] = useState(false)
  const [convCompareWeek, setConvCompareWeek] = useState<number | null>(null)

  const [drawer, setDrawer] = useState<{ kind: DrawerKind; label: string; origens?: string[] } | null>(null)
  const [drawerData, setDrawerData] = useState<DetalheComum | null>(null)
  const [drawerLoading, setDrawerLoading] = useState(false)
  const drawerTriggerRef = useRef<HTMLElement | null>(null)
  const drawerRef = useRef<HTMLDivElement>(null)
  const [drawerGran, setDrawerGran] = useState<DrawerGran>('pagina')
  const [drawerAnchor, setDrawerAnchor] = useState(isoDate(now))
  const [drawerCampanha, setDrawerCampanha] = useState('')
  const [drawerPrev, setDrawerPrev] = useState<DetalheComum | null>(null)
  const [drawerPrevLabel, setDrawerPrevLabel] = useState('')
  const [campanhasMidia, setCampanhasMidia] = useState<string[]>(['Google', 'Meta'])
  const drawerGenRef = useRef(0)
  useEffect(() => {
    api.get<string[]>('/api/v1/leads/campanhas-midia').then(r => setCampanhasMidia(r.data)).catch(() => {})
  }, [])

  // data âncora inicial: hoje se cair no período da página, senão o fim dele
  function defaultAnchor(): string {
    const today = isoDate(now)
    if (period === 'range' && rangeTo) return rangeTo < today ? rangeTo : today
    if (period === 'month' && month !== currentMonth) {
      const [y, m] = month.split('-').map(Number)
      return isoDate(new Date(y, m, 0))
    }
    return today
  }

  function drawerParams(): Record<string, string> {
    let p: Record<string, string>
    if (drawerGran === 'pagina') p = periodParams()
    else {
      const { from, to } = drawerRange(drawerGran, drawerAnchor)
      p = { period: 'range', date_from: isoDate(from), date_to: isoDate(to) }
      if (team !== 'all') p.team = TEAM_VALUES[team]
    }
    if (drawerCampanha) p.campanha_midia = drawerCampanha
    return p
  }

  function drawerPeriodLabel(): string {
    if (drawerGran === 'pagina') return periodLabel()
    const { from, to } = drawerRange(drawerGran, drawerAnchor)
    const txt = drawerGran === 'dia'
      ? `${brDate(from)}/${from.getFullYear()}`
      : drawerGran === 'semana'
      ? `Semana de ${brDate(from)} a ${brDate(to)}/${to.getFullYear()}`
      : `${MESES_FULL[from.getMonth()]}/${from.getFullYear()}`
    return team === 'all' ? txt : `${txt} · ${TEAM_LABELS[team]}`
  }
  function drawerSubtitle(): string {
    return drawerCampanha ? `${drawerPeriodLabel()} · Campanha: ${drawerCampanha}` : drawerPeriodLabel()
  }

  function periodParams(): Record<string, string> {
    const base: Record<string, string> = period === 'all'
      ? { period: 'all' }
      : period === 'range' && debRangeFrom && debRangeTo
      ? { period: 'range', date_from: debRangeFrom, date_to: debRangeTo }
      : { month }
    if (team !== 'all') base.team = TEAM_VALUES[team]
    return base
  }

  function periodLabel(): string {
    const [y, m] = month.split('-').map(Number)
    const dateLabel = period === 'all'
      ? 'Todo o período'
      : period === 'range' && rangeFrom && rangeTo
      ? `${rangeFrom.split('-').reverse().join('/')} – ${rangeTo.split('-').reverse().join('/')}`
      : `${MESES_FULL[m - 1]}/${y}`
    return team === 'all' ? dateLabel : `${dateLabel} · ${TEAM_LABELS[team]}`
  }

  function openDrawer(kind: DrawerKind, label: string, origens: string[] | undefined, trigger: HTMLElement) {
    drawerTriggerRef.current = trigger
    setDrawerGran('pagina')
    setDrawerAnchor(defaultAnchor())
    setDrawerCampanha('')
    setDrawer({ kind, label, origens })
  }

  // Período anterior equivalente, para comparar os indicadores do drawer:
  // mês/semana/dia anterior ou intervalo do mesmo tamanho logo antes. Se o recorte
  // atual ainda está em andamento, compara só a mesma quantidade de dias corridos
  // (ex.: 1–30/10 contra 1–30/09), senão o mês corrente sempre pareceria pior.
  function prevDrawerRange(): { from: Date; to: Date } | null {
    let cur: { from: Date; to: Date }
    let prev: { from: Date; to: Date }
    if (drawerGran !== 'pagina') {
      cur = drawerRange(drawerGran, drawerAnchor)
      prev = drawerRange(drawerGran, shiftAnchor(drawerGran, drawerAnchor, -1))
    } else if (period === 'all') {
      return null
    } else if (period === 'range' && debRangeFrom && debRangeTo) {
      const f = parseIso(debRangeFrom), t = parseIso(debRangeTo)
      const dias = Math.round((t.getTime() - f.getTime()) / 86400000) + 1
      const pt = new Date(f); pt.setDate(f.getDate() - 1)
      const pf = new Date(pt); pf.setDate(pt.getDate() - dias + 1)
      cur = { from: f, to: t }
      prev = { from: pf, to: pt }
    } else {
      const [y, m] = month.split('-').map(Number)
      cur = { from: new Date(y, m - 1, 1), to: new Date(y, m, 0) }
      prev = { from: new Date(y, m - 2, 1), to: new Date(y, m - 1, 0) }
    }
    const hoje = parseIso(isoDate(now))
    if (cur.to > hoje && cur.from <= hoje) {
      const decorridos = Math.round((hoje.getTime() - cur.from.getTime()) / 86400000)
      const to = new Date(prev.from); to.setDate(prev.from.getDate() + decorridos)
      if (to < prev.to) prev = { from: prev.from, to }
    }
    return prev
  }

  // recarrega o drawer quando abre ou quando muda o recorte (dia/semana/mês)
  useEffect(() => {
    if (!drawer) return
    const { kind, label, origens } = drawer
    const gen = ++drawerGenRef.current
    setDrawerData(null)
    setDrawerPrev(null)
    setDrawerLoading(true)
    const prevRange = prevDrawerRange()
    setDrawerPrevLabel(prevRange ? `${brDate(prevRange.from)}/${prevRange.from.getFullYear()} – ${brDate(prevRange.to)}/${prevRange.to.getFullYear()}` : '')
    if (prevRange) {
      const pp: Record<string, string> = { period: 'range', date_from: isoDate(prevRange.from), date_to: isoDate(prevRange.to) }
      if (team !== 'all') pp.team = TEAM_VALUES[team]
      if (drawerCampanha) pp.campanha_midia = drawerCampanha
      api.get<DetalheComum & { pct_cancelamento?: number }>(detalheUrl(kind, label, origens, pp))
        .then(r => { if (gen === drawerGenRef.current) setDrawerPrev({ ...r.data, pct_perda: r.data.pct_perda ?? r.data.pct_cancelamento ?? 0 }) })
        .catch(() => {})
    }
    api.get<Record<string, unknown>>(detalheUrl(kind, label, origens, drawerParams()))
      .then(r => {
        if (gen !== drawerGenRef.current) return
        const raw = r.data as unknown as (DetalheComum & { pct_cancelamento?: number; pct_perda?: number })
        setDrawerData({ ...raw, pct_perda: raw.pct_perda ?? raw.pct_cancelamento ?? 0 })
      })
      .catch(() => { if (gen === drawerGenRef.current) setDrawerData(null) })
      .finally(() => { if (gen === drawerGenRef.current) setDrawerLoading(false) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawer, drawerGran, drawerAnchor, drawerCampanha])

  function detalheUrl(kind: DrawerKind, label: string, origens: string[] | undefined, params: Record<string, string>): string {
    const qp = new URLSearchParams(params)
    let url: string
    if (kind === 'base') {
      qp.set('base', label)
      url = `/api/v1/kpis/bases-detalhe?${qp}`
    } else if (kind === 'conversao') {
      qp.set('conv_point', label)
      if (origens?.length) qp.set('origens', origens.join(','))
      url = `/api/v1/kpis/conv-point-detalhe?${qp}`
    } else if (kind === 'modalidade') {
      qp.set('modalidade', label)
      url = `/api/v1/kpis/modalidade-detalhe?${qp}`
    } else if (kind === 'renutricao') {
      url = `/api/v1/kpis/renutrucao-detalhe?${qp}`
    } else {
      qp.set('nome', label)
      qp.set('origens', origens?.length ? origens.join(',') : label)
      url = `/api/v1/kpis/sdr-detalhe?${qp}`
    }
    return url
  }

  function closeDrawer() {
    setDrawer(null)
    drawerTriggerRef.current?.focus()
  }

  function openDrawerLeads() {
    if (!drawer) return
    if (drawer.kind === 'base') {
      setBasePopup(drawer.label)
      setBaseStatusFilter(null)
      setBaseLeadsLoading(true)
      setBaseLeads([])
      api.get<OrgLead[]>(`/api/v1/kpis/leads-base?${new URLSearchParams({ ...drawerParams(), base: drawer.label })}`)
        .then(r => setBaseLeads(r.data)).catch(() => setBaseLeads([]))
        .finally(() => setBaseLeadsLoading(false))
    } else {
      setOrgPopup(drawer.label)
      setOrgStatusFilter(null)
      setOrgLeadsLoading(true)
      setOrgLeads([])
      setOrgLeadsTotal(0)
      const qp = new URLSearchParams(drawerParams())
      if (drawer.kind === 'conversao') qp.set('conv_point', drawer.label)
      else if (drawer.kind === 'modalidade') qp.set('modalidade', drawer.label)
      else if (drawer.kind === 'renutricao') qp.set('renutrucao', 'true')
      if (drawer.origens?.length) qp.set('origens', drawer.origens.join(','))
      else if (drawer.kind === 'canal') qp.set('origens', drawer.label)
      api.get<{ leads: OrgLead[]; total: number }>(`/api/v1/kpis/leads-conv-point?${qp}`)
        .then(r => { setOrgLeads(r.data.leads); setOrgLeadsTotal(r.data.total) })
        .catch(() => { setOrgLeads([]); setOrgLeadsTotal(0) })
        .finally(() => setOrgLeadsLoading(false))
    }
  }

  function openConvPointCompare(convPoint: string, origens: string[]) {
    setConvComparePoint(convPoint)
    setConvCompareLevel('week')
    setConvCompareWeek(null)
    setConvCompareDaily([])
    setConvCompareDailyLoading(true)
    const qp = new URLSearchParams({ month, conv_point: convPoint })
    if (origens.length > 0) qp.set('origens', origens.join(','))
    if (team !== 'all') qp.set('team', TEAM_VALUES[team])
    api.get<{ date: string; dia: number; captacoes: number; vendas: number }[]>(`/api/v1/kpis/conv-point-diario?${qp}`)
      .then(r => setConvCompareDaily(r.data))
      .catch(() => setConvCompareDaily([]))
      .finally(() => setConvCompareDailyLoading(false))
  }

  const convCompareElapsedDaily = month === currentMonth
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

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOrgPopup(null); setAgePopup(null); setBasePopup(null); setPlanoPopup(null); setConvCompare(false); setFiltersOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (!filtersOpen) return
    const handler = (e: MouseEvent) => { if (filtersRef.current && !filtersRef.current.contains(e.target as Node)) setFiltersOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [filtersOpen])

  // Foco preso + Escape dentro do drawer de análise
  useEffect(() => {
    if (!drawer) return
    const container = drawerRef.current
    const closeBtn = container?.querySelector<HTMLElement>('[data-drawer-close]')
    closeBtn?.focus()
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { closeDrawer(); return }
      if (e.key !== 'Tab' || !container) return
      const focusables = container.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
      if (focusables.length === 0) return
      const first = focusables[0], last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [drawer])

  // Contadores de geração — cada fetch* ignora sua própria resposta se, quando ela
  // chegar, já não for mais a última chamada feita (evita resposta antiga de um
  // filtro anterior sobrescrever a tela depois de uma troca rápida de mês/período).
  const mainGenRef       = useRef(0)
  const basesGenRef      = useRef(0)
  const modalidadeGenRef = useRef(0)
  const renutricaoGenRef = useRef(0)
  const agentesGenRef    = useRef(0)
  const agesGenRef       = useRef(0)
  const planoGenRef      = useRef(0)
  const trendGenRef      = useRef(0)

  function fetchMain() {
    const gen = ++mainGenRef.current
    const qs = new URLSearchParams(periodParams()).toString()
    setLoading(true)
    setDataError(false)
    api.get<FonteData[]>(`/api/v1/kpis/conversao-fonte?${qs}`)
      .then(r => { if (mainGenRef.current === gen) setData(r.data) })
      .catch(() => { if (mainGenRef.current === gen) { setData([]); setDataError(true) } })
      .finally(() => { if (mainGenRef.current === gen) setLoading(false) })
    setPrevSummary(null)
    if (period === 'month') {
      const prevQs = team !== 'all' ? `&team=${encodeURIComponent(TEAM_VALUES[team])}` : ''
      api.get<FonteData[]>(`/api/v1/kpis/conversao-fonte?month=${prevMonthOf(month)}${prevQs}`)
        .then(r => { if (mainGenRef.current === gen) setPrevSummary({
          cap: r.data.reduce((s, d) => s + d.captacoes, 0),
          ven: r.data.reduce((s, d) => s + d.vendas, 0),
          can: r.data.reduce((s, d) => s + d.cancelados, 0),
        }) })
        .catch(() => { if (mainGenRef.current === gen) setPrevSummary(null) })
    }
  }

  function fetchBases() {
    const gen = ++basesGenRef.current
    const qs = new URLSearchParams(periodParams()).toString()
    setBasesLoading(true)
    setBasesError(false)
    api.get<BaseStat[]>(`/api/v1/kpis/bases?${qs}`)
      .then(r => { if (basesGenRef.current === gen) setBasesData(r.data) })
      .catch(() => { if (basesGenRef.current === gen) { setBasesData([]); setBasesError(true) } })
      .finally(() => { if (basesGenRef.current === gen) setBasesLoading(false) })
  }

  function fetchModalidade() {
    const gen = ++modalidadeGenRef.current
    const qs = new URLSearchParams(periodParams()).toString()
    setModalidadeLoading(true)
    setModalidadeError(false)
    api.get<ModalidadeStat[]>(`/api/v1/kpis/modalidade?${qs}`)
      .then(r => { if (modalidadeGenRef.current === gen) setModalidadeData(r.data) })
      .catch(() => { if (modalidadeGenRef.current === gen) { setModalidadeData([]); setModalidadeError(true) } })
      .finally(() => { if (modalidadeGenRef.current === gen) setModalidadeLoading(false) })
  }

  function fetchRenutricao() {
    const gen = ++renutricaoGenRef.current
    const qs = new URLSearchParams(periodParams()).toString()
    setRenutricaoLoading(true)
    setRenutricaoError(false)
    api.get<RenutricaoOverview>(`/api/v1/kpis/renutrucao?${qs}`)
      .then(r => { if (renutricaoGenRef.current === gen) setRenutricaoData(r.data) })
      .catch(() => { if (renutricaoGenRef.current === gen) { setRenutricaoData(null); setRenutricaoError(true) } })
      .finally(() => { if (renutricaoGenRef.current === gen) setRenutricaoLoading(false) })
  }

  function fetchAgentes() {
    const gen = ++agentesGenRef.current
    const qs = new URLSearchParams(periodParams()).toString()
    setAgentesLoading(true)
    setAgentesError(false)
    api.get<AgenteRow[]>(`/api/v1/kpis/agentes?${qs}`)
      .then(r => { if (agentesGenRef.current === gen) setAgentesData(r.data) })
      .catch(() => { if (agentesGenRef.current === gen) { setAgentesData([]); setAgentesError(true) } })
      .finally(() => { if (agentesGenRef.current === gen) setAgentesLoading(false) })
  }

  function fetchAges() {
    const gen = ++agesGenRef.current
    const qs = new URLSearchParams(periodParams()).toString()
    setAgeBandsLoading(true)
    setAgeError(false)
    api.get<{ bands: AgeBand[]; sem_idade: number; com_idade: number }>(`/api/v1/kpis/faixas-etarias?${qs}`)
      .then(r => { if (agesGenRef.current === gen) { setAgeBands(r.data.bands); setAgeSemIdade(r.data.sem_idade); setAgeComIdade(r.data.com_idade) } })
      .catch(() => { if (agesGenRef.current === gen) { setAgeBands([]); setAgeError(true) } })
      .finally(() => { if (agesGenRef.current === gen) setAgeBandsLoading(false) })
  }

  function fetchPlano() {
    const gen = ++planoGenRef.current
    const qs = new URLSearchParams(periodParams()).toString()
    setPlanoSaudeLoading(true)
    setPlanoError(false)
    api.get<PlanoSaudeData>(`/api/v1/kpis/plano-saude?${qs}`)
      .then(r => { if (planoGenRef.current === gen) setPlanoSaude(r.data) })
      .catch(() => { if (planoGenRef.current === gen) { setPlanoSaude(null); setPlanoError(true) } })
      .finally(() => { if (planoGenRef.current === gen) setPlanoSaudeLoading(false) })
  }

  useEffect(() => {
    fetchMain()
    fetchBases()
    fetchModalidade()
    fetchRenutricao()
    fetchAgentes()
    fetchAges()
    fetchPlano()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, period, debRangeFrom, debRangeTo, team])

  // Evolução mensal (Visão Geral) — reaproveita /kpis/conversao-fonte já existente, sem endpoint novo
  function fetchTrend() {
    const gen = ++trendGenRef.current
    const anchor = period === 'range' && debRangeTo ? debRangeTo.slice(0, 7) : period === 'month' ? month : currentMonth
    const months = monthsBack(anchor, 6)
    setTrendLoading(true)
    setTrendError(false)
    const teamQs = team !== 'all' ? `&team=${encodeURIComponent(TEAM_VALUES[team])}` : ''
    Promise.all(months.map(m =>
      api.get<FonteData[]>(`/api/v1/kpis/conversao-fonte?month=${m}${teamQs}`).then(r => r.data)
    ))
      .then(results => {
        if (trendGenRef.current !== gen) return
        setTrendMonths(months.map((m, i) => ({
          mes: m,
          mesLabel: monthLabel(m),
          captacoes: results[i].reduce((s, r) => s + r.captacoes, 0),
          vendas: results[i].reduce((s, r) => s + r.vendas, 0),
        })))
      })
      .catch(() => { if (trendGenRef.current === gen) setTrendError(true) })
      .finally(() => { if (trendGenRef.current === gen) setTrendLoading(false) })
  }

  useEffect(() => {
    fetchTrend()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, month, debRangeTo, team])

  const totalCap = data.reduce((s, d) => s + d.captacoes, 0)
  const totalVen = data.reduce((s, d) => s + d.vendas, 0)
  const totalCan = data.reduce((s, d) => s + d.cancelados, 0)
  const taxaConv = totalCap > 0 ? Math.round(totalVen / totalCap * 1000) / 10 : 0
  const pctCan   = totalCap > 0 ? Math.round(totalCan / totalCap * 1000) / 10 : 0
  const prevConv = prevSummary && prevSummary.cap > 0 ? Math.round(prevSummary.ven / prevSummary.cap * 1000) / 10 : 0

  const organicFontes = data.filter(d => !isSdr(d.fonte)).sort((a, b) => b.captacoes - a.captacoes)
  // "🔄 Renutrição" e' uma linha sintetica injetada no breakdown de cada fonte
  // (recorte por is_renutrucao, nao um Lead.conversion_point de verdade) --
  // incluir ela aqui fazia "Pontos de conversão" mostrar uma contagem que
  // sempre voltava zerada ao abrir a analise (nenhum lead tem esse conversion_point).
  const _allBp = data.flatMap(f => f.breakdown).filter(b => b.label !== '🔄 Renutrição')
  // agrupa por minusculo pra unir o mesmo ponto de conversao mesmo quando a
  // grafia (maiuscula/minuscula) varia de uma origem pra outra -- cada
  // origem ja' vem unificada do backend, mas aqui juntamos TODAS as
  // origens numa lista so', entao precisa do mesmo cuidado de novo.
  const _bpKeys = [...new Set(_allBp.map(b => b.label.toLowerCase()))]
  const allConvPoints = _bpKeys
    .map(key => {
      const rows = _allBp.filter(b => b.label.toLowerCase() === key)
      const label = rows[0].label
      const cap = rows.reduce((s, b) => s + b.captacoes, 0)
      const ven = rows.reduce((s, b) => s + b.vendas, 0)
      const can = rows.reduce((s, b) => s + b.cancelados, 0)
      const relevantFontes = data.filter(f => f.breakdown.some(bd => bd.label.toLowerCase() === key)).map(f => f.fonte)
      // tempo médio combinado: média ponderada pelas vendas de cada origem (aproximação a partir das médias já calculadas por origem)
      const tempoRows = rows.filter(b => b.tempo_medio_dias != null && b.vendas > 0)
      const tempoPeso = tempoRows.reduce((s, b) => s + b.vendas, 0)
      const tempoMedio = tempoPeso > 0
        ? Math.round((tempoRows.reduce((s, b) => s + (b.tempo_medio_dias as number) * b.vendas, 0) / tempoPeso) * 10) / 10
        : null
      const receitaGerada = rows.every(b => b.receita_gerada != null)
        ? Math.round(rows.reduce((s, b) => s + (b.receita_gerada ?? 0), 0) * 100) / 100
        : null
      return {
        label, captacoes: cap, vendas: ven, cancelados: can, conversao: cap > 0 ? +(ven / cap * 100).toFixed(1) : 0,
        origens: relevantFontes, tempo_medio_dias: tempoMedio, receita_gerada: receitaGerada,
      }
    })
    .sort((a, b) => b.captacoes - a.captacoes)

  const organicOnly = data.filter(d => !isSdr(d.fonte))
  const organicBpForCompare = [...new Set(organicOnly.flatMap(f => f.breakdown).map(b => b.label.toLowerCase()))]
    .map(key => {
      const rows = organicOnly.flatMap(f => f.breakdown).filter(b => b.label.toLowerCase() === key)
      const label = rows[0].label
      const cap = rows.reduce((s, b) => s + b.captacoes, 0)
      const ven = rows.reduce((s, b) => s + b.vendas, 0)
      return { label, captacoes: cap, vendas: ven, conversao: cap > 0 ? +(ven / cap * 100).toFixed(1) : 0 }
    })
    .sort((a, b) => b.captacoes - a.captacoes)

  // Usado só pro cálculo de "Sem base informada" (Bases) mais abaixo — ali o
  // que importa é o total de captação por origem crua de SDR, então continua
  // batendo em `data` (por origem), não na posse por renutrição.
  const sdrFontes = data.filter(d => isSdr(d.fonte)).sort((a, b) => b.captacoes - a.captacoes)
  // Soma várias origens numa linha só da aba Canais, guardando as origens em
  // _origens pro detalhamento (clique) trazer os leads de todas elas.
  const somarFontes = (fonte: string, rows: FonteData[]): FonteData & { _origens: string[] } => {
    const cap = rows.reduce((s, f) => s + f.captacoes, 0)
    const ven = rows.reduce((s, f) => s + f.vendas, 0)
    const can = rows.reduce((s, f) => s + f.cancelados, 0)
    const tempoRows = rows.filter(f => f.tempo_medio_dias != null && f.vendas > 0)
    const tempoPeso = tempoRows.reduce((s, f) => s + f.vendas, 0)
    return {
      fonte,
      captacoes: cap, vendas: ven, cancelados: can,
      conversao: cap > 0 ? +(ven / cap * 100).toFixed(1) : 0,
      tempo_medio_dias: tempoPeso > 0
        ? Math.round((tempoRows.reduce((s, f) => s + (f.tempo_medio_dias as number) * f.vendas, 0) / tempoPeso) * 10) / 10
        : null,
      receita_gerada: rows.every(f => f.receita_gerada != null)
        ? Math.round(rows.reduce((s, f) => s + (f.receita_gerada ?? 0), 0) * 100) / 100
        : null,
      breakdown: [],
      _origens: rows.map(f => f.fonte),
    }
  }
  // Aquisição › Canais: a captação via SDR também é um canal -- entra como
  // uma linha só ("Prospecção SDR", somando todos os operadores), pra aba
  // fechar com o total de leads. O detalhe por base fica em Bases. Formulário
  // de site ("Site", "Site - Porto Saúde Linha Bairro"...) é fonte do Orgânico,
  // não canal à parte -- entra somado na linha "Orgânico".
  const canaisOrganicos: (FonteData & { _origens?: string[] })[] = (() => {
    const ehOrganicoSite = (f: FonteData) => { const l = f.fonte.trim().toLowerCase(); return l.startsWith('site') || l.includes('org') }
    const organicoRows = organicFontes.filter(ehOrganicoSite)
    return organicoRows.length > 0
      ? [...organicFontes.filter(f => !ehOrganicoSite(f)), somarFontes('Orgânico', organicoRows)]
      : [...organicFontes]
  })()
  const canaisDisplay: (FonteData & { _origens?: string[] })[] = [
    ...canaisOrganicos,
    ...(sdrFontes.length > 0 ? [somarFontes('Prospecção SDR', sdrFontes)] : []),
  ].sort((a, b) => b.captacoes - a.captacoes)
  // Aba Agentes / Ranking: quem está com a posse do lead agora (dono de
  // renutrição > origem), não quem só captou um dia — senão quem só faz
  // renutrição (ex: Pamela) nunca aparece, e gente desligada reaparece por
  // causa de um retrabalho alheio (ver /api/v1/kpis/agentes).
  const sdrDisplayFontes = (() => {
    const o2Members = agentesData.filter(f => isO2Member(f.fonte) || isO2Self(f.fonte))
    const others    = agentesData.filter(f => !isO2Member(f.fonte) && !isO2Self(f.fonte))
    const rows: (AgenteRow & { _o2Origens?: string[] })[] = [...others]
    if (o2Members.length > 0) {
      const cap = o2Members.reduce((s, f) => s + f.captacoes, 0)
      const ven = o2Members.reduce((s, f) => s + f.vendas, 0)
      const can = o2Members.reduce((s, f) => s + f.cancelados, 0)
      rows.push({
        fonte: 'o2 Solution',
        captacoes: cap, vendas: ven, cancelados: can,
        conversao: cap > 0 ? +(ven / cap * 100).toFixed(1) : 0,
        tempo_medio_dias: null, receita_gerada: null,
        _o2Origens: o2Members.map(f => f.fonte),
      })
    }
    return rows.sort((a, b) => b.captacoes - a.captacoes)
  })()

  const rankingPool = [
    ...canaisOrganicos.map(f => ({ ...f, tipo: 'canal' as const })),
    ...sdrDisplayFontes.map(f => ({ ...f, tipo: 'operador' as const })),
  ].sort((a, b) => b.captacoes - a.captacoes)

  // Bases só conta lead com anotação de base nas notas. O que sobra dos leads
  // de SDR (sem base identificável) vira "Sem base informada", pra Bases somar
  // o total de SDR e Bases + Canais fechar com o total captado.
  const basesDisplay: BaseStat[] = (() => {
    const sdrCap = sdrFontes.reduce((s, f) => s + f.captacoes, 0)
    const gap = sdrCap - basesData.reduce((s, b) => s + b.captacoes, 0)
    if (gap <= 0) return basesData
    const gapVen = Math.max(0, sdrFontes.reduce((s, f) => s + f.vendas, 0) - basesData.reduce((s, b) => s + b.vendas, 0))
    const gapCan = Math.max(0, sdrFontes.reduce((s, f) => s + f.cancelados, 0) - basesData.reduce((s, b) => s + b.cancelados, 0))
    return [...basesData, {
      base: 'Sem base informada',
      captacoes: gap, vendas: gapVen, cancelados: gapCan,
      conversao: +(gapVen / gap * 100).toFixed(1),
      pct_cancelamento: +(gapCan / gap * 100).toFixed(1),
      tempo_medio_dias: null, receita_gerada: null,
    }].sort((a, b) => b.captacoes - a.captacoes)
  })()
  const rankTopCap = rankingPool[0]
  const receitaVisible = rankingPool.some(r => r.receita_gerada != null)
  const rankTopReceita = rankingPool
    .filter((r): r is typeof rankingPool[number] & { receita_gerada: number } => r.receita_gerada != null && r.receita_gerada > 0)
    .sort((a, b) => b.receita_gerada - a.receita_gerada)[0]
  const rankingSorted = [...rankingPool].sort((a, b) => rankSortBy === 'receita'
    ? (b.receita_gerada ?? 0) - (a.receita_gerada ?? 0)
    : b.captacoes - a.captacoes)
  const rankTopConv = rankingPool
    .filter(r => r.captacoes > 0)
    .sort((a, b) => b.conversao - a.conversao)[0]

  function openRankRow(row: typeof rankingPool[number], e: React.MouseEvent<HTMLElement>) {
    if (row.tipo === 'canal') {
      openDrawer('canal', row.fonte, (row as { _origens?: string[] })._origens ?? [row.fonte], e.currentTarget)
    } else {
      const origens = (row as AgenteRow & { _o2Origens?: string[] })._o2Origens?.join(',') ?? row.fonte
      navigate(`/vida-sdr/${encodeURIComponent(origens)}?nome=${encodeURIComponent(row.fonte)}`)
    }
  }

  const baseTopCapt: BaseStat | undefined = basesData.length > 0
    ? [...basesData].sort((a, b) => b.captacoes - a.captacoes)[0]
    : undefined

  const topOrigin = data.length > 0 ? [...data].sort((a, b) => b.captacoes - a.captacoes)[0] : undefined

  const ageEmpty = !ageBandsLoading && !ageError && ageBands.every(b => b.captacoes === 0)
  const planoEmpty = !planoSaudeLoading && !planoError && (!planoSaude || planoSaude.com_informacao === 0)
  const perfilBothEmpty = !ageBandsLoading && !planoSaudeLoading && !ageError && !planoError && ageEmpty && planoEmpty

  return (
    <div style={{ background: dark ? 'transparent' : '#EEF1F5', minHeight: '100%' }}>
    <main style={{ maxWidth: 1520, margin: '0 auto', padding: '32px 32px 60px' }}>
      <style>{`
        .perf-tab-btn:hover { color: var(--text-1); }
        .perf-drawer-trigger:hover { box-shadow: var(--shadow-sm, 0 4px 12px rgba(15,23,42,.07)); border-color: rgba(37,99,235,.35); }
        .perf-drawer-trigger { transition: box-shadow 180ms ease, border-color 180ms ease; }
        @media (prefers-reduced-motion: reduce) { .perf-drawer-trigger { transition: none; } }
        .perf-skeleton { animation: perf-pulse 1.4s ease-in-out infinite; }
        @keyframes perf-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .6; } }
        @media (prefers-reduced-motion: reduce) { .perf-skeleton { animation: none; opacity: .75; } }
      `}</style>

      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 32, paddingBottom: 20, borderBottom: '1px solid var(--border-lt)' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text-1)', margin: 0 }}>Performance</h1>
          <p style={{ fontSize: 13, color: 'var(--text-subtle)', margin: '5px 0 0' }}>Entenda o resultado do período e investigue os fatores que o explicam.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <VerComoSlot />
          <div ref={filtersRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setFiltersOpen(o => !o)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-1)',
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              <SlidersHorizontal size={14} />
              Filtros
              <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' }}>· {periodLabel()}</span>
            </button>
            {filtersOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 50, minWidth: 240,
                background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
                boxShadow: '0 12px 32px rgba(15,23,42,.12)', padding: 12,
                display: 'flex', flexDirection: 'column', gap: 8,
              }}>
                <div style={{ display: 'flex', gap: 4, border: '1px solid var(--border)', borderRadius: 8, padding: 3, background: 'var(--bg-subtle)' }}>
                  {([
                    { key: 'month', label: 'Mês' },
                    { key: 'all', label: 'Todo o período' },
                    { key: 'range', label: 'Entre datas' },
                  ] as const).map(opt => (
                    <button
                      key={opt.key}
                      onClick={() => setPeriod(opt.key)}
                      style={{
                        flex: 1, padding: '5px 10px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        background: period === opt.key ? '#DBEAFE' : 'transparent',
                        color: period === opt.key ? '#2563EB' : 'var(--text-muted)',
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {period === 'month' && (
                  <input
                    type="month" value={month} onChange={e => setMonth(e.target.value)}
                    style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-subtle)', color: 'var(--text-1)', fontSize: 13 }}
                  />
                )}
                {period === 'range' && (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input type="date" value={rangeFrom} onChange={e => setRangeFrom(e.target.value)}
                      style={{ flex: 1, minWidth: 0, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-subtle)', color: 'var(--text-1)', fontSize: 12 }} />
                    <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>até</span>
                    <input type="date" value={rangeTo} onChange={e => setRangeTo(e.target.value)}
                      style={{ flex: 1, minWidth: 0, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-subtle)', color: 'var(--text-1)', fontSize: 12 }} />
                  </div>
                )}
                <div style={{ borderTop: '1px solid var(--border-lt)', margin: '2px 0 0', paddingTop: 8 }}>
                  <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 6px' }}>Equipe</p>
                  <div style={{ display: 'flex', gap: 4, border: '1px solid var(--border)', borderRadius: 8, padding: 3, background: 'var(--bg-subtle)' }}>
                    {([
                      { key: 'sp', label: 'São Paulo' },
                      { key: 'pe', label: 'Recife' },
                      { key: 'all', label: 'Ambas' },
                    ] as const).map(opt => (
                      <button
                        key={opt.key}
                        onClick={() => setTeam(opt.key)}
                        style={{
                          flex: 1, padding: '5px 10px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                          background: team === opt.key ? '#DBEAFE' : 'transparent',
                          color: team === opt.key ? '#2563EB' : 'var(--text-muted)',
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
          <SinoSlot />
        </div>
      </div>

      {/* Resumo executivo — faixa horizontal, sem cards, divisores sutis */}
      <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-1)', margin: '0 0 16px' }}>Saúde da operação</p>
      <div style={{
        display: 'flex', alignItems: 'stretch', background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 16, padding: '20px 24px', marginBottom: dataError ? 8 : 32, flexWrap: 'wrap', rowGap: 16,
      }}>
        {([
          { label: 'Leads', value: totalCap, trend: period === 'month' ? <HeroTrend curr={totalCap} prev={prevSummary?.cap ?? null} prevLabel="período anterior" /> : null },
          { label: 'Vendas', value: totalVen, trend: period === 'month' ? <HeroTrend curr={totalVen} prev={prevSummary?.ven ?? null} prevLabel="período anterior" /> : null },
          { label: 'Conversão', value: `${taxaConv}%`, trend: period === 'month' ? <HeroTrend curr={taxaConv} prev={prevSummary ? prevConv : null} mode="pp" prevLabel="período anterior" /> : null },
          { label: 'Cancelamentos', value: totalCan, sub: `${pctCan}% dos leads`, trend: period === 'month' ? <HeroTrend curr={totalCan} prev={prevSummary?.can ?? null} invert prevLabel="período anterior" /> : null },
        ] as const).map((item, i) => (
          <div key={item.label} style={{
            flex: '1 1 140px', minWidth: 140, padding: i > 0 ? '0 0 0 24px' : 0,
            borderLeft: i > 0 ? '1px solid var(--border-lt)' : 'none',
          }}>
            <p style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', margin: '0 0 8px' }}>{item.label}</p>
            {loading ? (
              <div className="perf-skeleton" style={{ width: 64, height: 32, borderRadius: 6 }} />
            ) : dataError ? (
              <p style={{ fontSize: 32, fontWeight: 700, color: 'var(--text-subtle)', margin: 0, lineHeight: 1.1 }}>—</p>
            ) : (
              <p style={{ fontSize: 32, fontWeight: 700, color: 'var(--text-1)', margin: 0, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{item.value}</p>
            )}
            <div style={{ marginTop: 8, minHeight: 18, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {!loading && !dataError && item.trend}
              {!loading && !dataError && 'sub' in item && item.sub && <span style={{ fontSize: 12, color: 'var(--text-subtle)' }}>{item.sub}</span>}
            </div>
          </div>
        ))}
      </div>
      {dataError && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 32, fontSize: 12 }}>
          <span style={{ color: '#B91C1C' }}>Não foi possível carregar os indicadores deste período.</span>
          <button onClick={fetchMain} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#2563EB', fontWeight: 600 }}>Tentar novamente</button>
        </div>
      )}

      {/* Navegação por abas */}
      <div role="tablist" style={{ display: 'flex', gap: 4, marginBottom: 32, borderBottom: '1px solid var(--border)' }}>
        {MAIN_TABS.filter(tab => tab.key !== 'ranking').map(tab => {
          const active = activeMainTab === tab.key
          return (
            <button
              key={tab.key}
              role="tab"
              aria-selected={active}
              className="perf-tab-btn"
              onClick={() => setActiveMainTab(tab.key)}
              style={{
                padding: '10px 18px', fontSize: 14, fontWeight: active ? 600 : 500,
                color: active ? '#2563EB' : 'var(--text-muted)',
                background: 'none', border: 'none', cursor: 'pointer',
                borderBottom: active ? '2px solid #2563EB' : '2px solid transparent',
                marginBottom: -1, transition: 'color 180ms ease',
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* ── Aba: Visão geral ── */}
      {activeMainTab === 'visao-geral' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 24 }}>
          <div>
            <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-1)', margin: '0 0 4px' }}>Evolução de leads e vendas</p>
            <p style={{ fontSize: 12, color: 'var(--text-subtle)', margin: '0 0 16px' }}>
              {_hireYM && visibleTrend.length < 6 ? 'Desde a entrada na empresa' : 'Últimos 6 meses'} até {monthLabel(period === 'range' && debRangeTo ? debRangeTo.slice(0, 7) : period === 'month' ? month : currentMonth)} · leads (barra) e vendas (linha)
            </p>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }}>
              {trendLoading ? (
                <div className="perf-skeleton" style={{ height: 300, borderRadius: 8, background: 'var(--bg-subtle)' }} aria-hidden="true" />
              ) : trendError ? (
                <div style={{ height: 300, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, textAlign: 'center', padding: '0 24px' }}>
                  <p style={{ color: '#B91C1C', fontSize: 13, margin: 0 }}>Não foi possível carregar a evolução do período.</p>
                  <button onClick={fetchTrend} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#2563EB', fontSize: 13, fontWeight: 600 }}>Tentar novamente</button>
                  <p style={{ color: 'var(--text-subtle)', fontSize: 12, margin: 0 }}>Os KPIs e as demais abas continuam disponíveis normalmente.</p>
                </div>
              ) : visibleTrend.every(m => m.captacoes === 0) ? (
                <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  Sem leads registrados no período.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={visibleTrend} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-lt)" vertical={false} />
                    <XAxis dataKey="mesLabel" tick={{ fontSize: 12, fill: 'var(--text-subtle)' }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
                    <YAxis yAxisId="cap" tick={{ fontSize: 11, fill: 'var(--text-subtle)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <YAxis yAxisId="ven" orientation="right" tick={{ fontSize: 11, fill: 'var(--text-subtle)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip
                      formatter={(value: number, name: string) => [value, name === 'captacoes' ? 'Leads' : 'Vendas']}
                      labelFormatter={l => `Período: ${l}`}
                      {...CHART_TOOLTIP}
                    />
                    <Bar yAxisId="cap" dataKey="captacoes" name="captacoes" fill="#2563EB" radius={[4, 4, 0, 0]} maxBarSize={40} />
                    <Line yAxisId="ven" type="monotone" dataKey="vendas" name="vendas" stroke="#15803D" strokeWidth={2} dot={{ r: 3, fill: '#15803D' }} />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div>
            <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-1)', margin: '0 0 4px' }}>Pontos de atenção</p>
            <p style={{ fontSize: 12, color: 'var(--text-subtle)', margin: '0 0 16px' }}>Fatos do período, calculados a partir dos dados atuais</p>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '4px 20px' }}>
              {(() => {
                const facts: { icon: typeof TrendingUp; color: string; text: string }[] = []
                if (period === 'month' && prevSummary) {
                  const capDelta = prevSummary.cap > 0 ? Math.round(((totalCap - prevSummary.cap) / prevSummary.cap) * 1000) / 10 : null
                  if (capDelta !== null) facts.push({
                    icon: capDelta >= 0 ? TrendingUp : TrendingDown, color: capDelta >= 0 ? '#15803D' : '#B91C1C',
                    text: `Volume de leads ${capDelta >= 0 ? 'cresceu' : 'caiu'} ${Math.abs(capDelta)}% em relação ao período anterior.`,
                  })
                  const convDelta = Math.round((taxaConv - prevConv) * 10) / 10
                  if (prevSummary.cap > 0) facts.push({
                    icon: convDelta >= 0 ? TrendingUp : TrendingDown, color: convDelta >= 0 ? '#15803D' : '#B91C1C',
                    text: `Conversão ${convDelta >= 0 ? 'subiu' : 'caiu'} ${Math.abs(convDelta)}pp frente ao período anterior.`,
                  })
                  if (prevSummary.can > 0 || totalCan > 0) {
                    const canDelta = prevSummary.can > 0 ? Math.round(((totalCan - prevSummary.can) / prevSummary.can) * 1000) / 10 : null
                    if (canDelta !== null) facts.push({
                      icon: canDelta >= 0 ? AlertTriangle : TrendingDown, color: canDelta >= 0 ? '#B45309' : '#15803D',
                      text: `Cancelamentos ${canDelta >= 0 ? 'aumentaram' : 'diminuíram'} ${Math.abs(canDelta)}% em relação ao período anterior.`,
                    })
                  }
                }
                if (baseTopCapt) facts.push({ icon: Users, color: '#0369A1', text: `A base "${baseTopCapt.base}" concentra o maior volume de captações do período (${baseTopCapt.captacoes} leads).` })
                else if (topOrigin) facts.push({ icon: Users, color: '#0369A1', text: `"${topOrigin.fonte}" é a origem com maior participação no período (${topOrigin.captacoes} leads).` })
                if (facts.length === 0) facts.push({ icon: AlertTriangle, color: 'var(--text-muted)', text: 'Sem dados suficientes para gerar comparações neste período.' })
                return facts.map((f, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, padding: '14px 0', borderTop: i > 0 ? '1px solid var(--border-lt)' : 'none' }}>
                    <f.icon size={16} color={f.color} style={{ flexShrink: 0, marginTop: 2 }} />
                    <p style={{ fontSize: 13, color: 'var(--text-secondary, var(--text-2))', margin: 0, lineHeight: 1.5 }}>{f.text}</p>
                  </div>
                ))
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── Aba: Aquisição ── */}
      {activeMainTab === 'aquisicao' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
            <div style={{ display: 'flex', gap: 6, border: '1px solid var(--border)', borderRadius: 12, padding: 5, background: 'var(--bg-subtle)', width: 'fit-content' }}>
              {([
                { key: 'bases', label: 'Bases', icon: LayoutGrid },
                { key: 'canais', label: 'Canais', icon: Share2 },
                { key: 'conversao', label: 'Pontos de conversão', icon: Target },
                { key: 'modalidade', label: 'Modalidade', icon: Tag },
                { key: 'renutricao', label: 'Renutrição', icon: RefreshCw },
              ] as const).map(v => {
                const active = aquisicaoView === v.key
                return (
                  <button key={v.key} onClick={() => setAquisicaoView(v.key)}
                    style={{
                      padding: '9px 18px', borderRadius: 9, border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 8,
                      background: active ? 'var(--bg-card)' : 'transparent',
                      color: active ? '#2563EB' : 'var(--text-muted)',
                      boxShadow: active ? '0 2px 6px -1px rgba(15,23,42,.12), 0 0 0 1px var(--border-lt)' : 'none',
                    }}>
                    <v.icon size={15} color={active ? '#2563EB' : 'var(--text-subtle)'} />
                    {v.label}
                  </button>
                )
              })}
            </div>
          </div>

          {aquisicaoView === 'bases' && (
            basesLoading ? (
              <StateBox kind="loading" height={140} />
            ) : basesError ? (
              <StateBox kind="error" height={140} message="Não foi possível carregar as bases." onRetry={fetchBases} />
            ) : basesDisplay.length === 0 ? (
              <StateBox kind="empty" height={140} message="Nenhuma base encontrada neste período." />
            ) : (
              <AquisicaoTable
                total={totalCap}
                rows={basesDisplay.map(b => ({ label: b.base, captacoes: b.captacoes, vendas: b.vendas, conversao: b.conversao, extra: `${b.pct_cancelamento}% cancel.`, tempoMedioDias: b.tempo_medio_dias, receitaGerada: b.receita_gerada }))}
                onOpen={(label, trigger) => openDrawer('base', label, undefined, trigger)}
              />
            )
          )}

          {aquisicaoView === 'canais' && (
            loading ? (
              <StateBox kind="loading" height={140} />
            ) : dataError ? (
              <StateBox kind="error" height={140} message="Não foi possível carregar os canais." onRetry={fetchMain} />
            ) : canaisDisplay.length === 0 ? (
              <StateBox kind="empty" height={140} message="Nenhum canal encontrado neste período." />
            ) : (
              <AquisicaoTable
                total={totalCap}
                rows={canaisDisplay.map(f => ({ label: f.fonte, captacoes: f.captacoes, vendas: f.vendas, conversao: f.conversao, extra: `${f.cancelados} cancel.`, tempoMedioDias: f.tempo_medio_dias, receitaGerada: f.receita_gerada }))}
                onOpen={(label, trigger) => openDrawer('canal', label, canaisDisplay.find(c => c.fonte === label)?._origens ?? [label], trigger)}
              />
            )
          )}

          {aquisicaoView === 'conversao' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                <button
                  onClick={() => { setConvCompare(true); setConvCompareLevel('month'); setConvComparePoint(null); setConvCompareWeek(null) }}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                >
                  <ArrowLeftRight size={13} />
                  Comparar
                </button>
              </div>
              {loading ? (
                <StateBox kind="loading" height={140} />
              ) : dataError ? (
                <StateBox kind="error" height={140} message="Não foi possível carregar os pontos de conversão." onRetry={fetchMain} />
              ) : allConvPoints.length === 0 ? (
                <StateBox kind="empty" height={140} message="Nenhum ponto de conversão encontrado neste período." />
              ) : (
                <AquisicaoTable
                  total={totalCap}
                  rows={allConvPoints.map(c => ({ label: c.label, captacoes: c.captacoes, vendas: c.vendas, conversao: c.conversao, extra: `${c.cancelados} cancel.`, tempoMedioDias: c.tempo_medio_dias, receitaGerada: c.receita_gerada }))}
                  onOpen={(label, trigger) => {
                    const point = allConvPoints.find(c => c.label === label)
                    openDrawer('conversao', label, point?.origens, trigger)
                  }}
                />
              )}
            </>
          )}

          {aquisicaoView === 'modalidade' && (
            modalidadeLoading ? (
              <StateBox kind="loading" height={140} />
            ) : modalidadeError ? (
              <StateBox kind="error" height={140} message="Não foi possível carregar as modalidades." onRetry={fetchModalidade} />
            ) : modalidadeData.length === 0 ? (
              <StateBox kind="empty" height={140} message="Nenhuma modalidade encontrada neste período." />
            ) : (
              <AquisicaoTable
                total={totalCap}
                rows={modalidadeData.map(m => ({ label: m.modalidade, captacoes: m.captacoes, vendas: m.vendas, conversao: m.conversao, extra: `${m.cancelados} cancel.`, tempoMedioDias: m.tempo_medio_dias, receitaGerada: m.receita_gerada }))}
                onOpen={(label, trigger) => openDrawer('modalidade', label, undefined, trigger)}
              />
            )
          )}

          {aquisicaoView === 'renutricao' && (
            renutricaoLoading ? (
              <StateBox kind="loading" height={140} />
            ) : renutricaoError ? (
              <StateBox kind="error" height={140} message="Não foi possível carregar a renutrição." onRetry={fetchRenutricao} />
            ) : !renutricaoData || renutricaoData.captacoes === 0 ? (
              <StateBox kind="empty" height={140} message="Nenhum lead em renutrição encontrado neste período." />
            ) : (
              <AquisicaoTable
                total={totalCap}
                rows={[{ label: 'Renutrição', captacoes: renutricaoData.captacoes, vendas: renutricaoData.vendas, conversao: renutricaoData.conversao, extra: `${renutricaoData.cancelados} cancel.`, tempoMedioDias: renutricaoData.tempo_medio_dias, receitaGerada: renutricaoData.receita_gerada }]}
                onOpen={(label, trigger) => openDrawer('renutricao', label, undefined, trigger)}
              />
            )
          )}
        </div>
      )}

      {/* ── Aba: Ranking ── */}
      {activeMainTab === 'ranking' && (
        (loading || agentesLoading) ? (
          <StateBox kind="loading" height={140} />
        ) : (dataError || agentesError) ? (
          <StateBox kind="error" height={140} message="Não foi possível carregar o ranking." onRetry={() => { fetchMain(); fetchAgentes() }} />
        ) : rankingPool.length === 0 ? (
          <StateBox kind="empty" height={140} message="Nenhum operador ou canal com captações neste período." />
        ) : (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
              {rankTopCap && (
                <RankingCard
                  icon={Users} accent="#3B82F6" label="Maior captação"
                  value={String(rankTopCap.captacoes)} who={rankTopCap.fonte} context="leads captados no período"
                  onClick={e => openRankRow(rankTopCap, e)}
                />
              )}
              {receitaVisible && (
                rankTopReceita ? (
                  <RankingCard
                    icon={DollarSign} accent="#10B981" label="Maior receita"
                    value={fmtBrl(rankTopReceita.receita_gerada)} who={rankTopReceita.fonte}
                    context={`${rankTopReceita.vendas} venda${rankTopReceita.vendas !== 1 ? 's' : ''} no período`}
                    onClick={e => openRankRow(rankTopReceita, e)}
                  />
                ) : (
                  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderLeft: '4px solid var(--border)', borderRadius: 14, padding: '18px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <p style={{ fontSize: 12.5, color: 'var(--text-muted)', textAlign: 'center', margin: 0 }}>Nenhuma receita recebida ainda neste período</p>
                  </div>
                )
              )}
              {rankTopConv && (
                <RankingCard
                  icon={Target} accent="#6366F1" label="Maior conversão"
                  value={`${rankTopConv.conversao}%`} who={rankTopConv.fonte}
                  context={`${rankTopConv.captacoes} captações · ${rankTopConv.vendas} vendas`}
                  onClick={e => openRankRow(rankTopConv, e)}
                />
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, margin: '0 0 12px' }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>Ranking completo</p>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  onClick={() => setRankSortBy('captacoes')}
                  style={{
                    minHeight: 26, padding: '0 10px', borderRadius: 6, border: 'none',
                    background: rankSortBy === 'captacoes' ? '#EAF2FF' : 'transparent',
                    color: rankSortBy === 'captacoes' ? '#245BB9' : 'var(--text-muted)',
                    fontSize: 10.5, fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  Captação
                </button>
                {receitaVisible && (
                  <button
                    onClick={() => setRankSortBy('receita')}
                    style={{
                      minHeight: 26, padding: '0 10px', borderRadius: 6, border: 'none',
                      background: rankSortBy === 'receita' ? '#EAF2FF' : 'transparent',
                      color: rankSortBy === 'receita' ? '#245BB9' : 'var(--text-muted)',
                      fontSize: 10.5, fontWeight: 700, cursor: 'pointer',
                    }}
                  >
                    Receita
                  </button>
                )}
              </div>
            </div>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>Operador / Canal</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>Captações</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>Vendas</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>Conversão</th>
                      {rankingPool.some(r => r.receita_gerada != null) && (
                        <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>Receita</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {rankingSorted.map((r, idx) => {
                      const medalBg = idx === 0 ? '#FEF3C7' : idx === 1 ? 'var(--bg-subtle)' : idx === 2 ? '#FFF1E6' : undefined
                      const medalColor = idx === 0 ? '#92400E' : idx === 1 ? 'var(--text-muted)' : idx === 2 ? '#9A3412' : 'var(--text-subtle)'
                      return (
                        <tr key={r.fonte}
                          onClick={e => openRankRow(r, e)}
                          style={{ borderBottom: '1px solid var(--border-lt)', cursor: 'pointer' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                        >
                          <td style={{ padding: '13px 16px', fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: 6, fontSize: 10, fontWeight: 800, marginRight: 8, background: medalBg ?? 'transparent', color: medalColor }}>{idx + 1}</span>
                            {r.fonte}
                          </td>
                          <td style={{ padding: '13px 16px', textAlign: 'right', fontSize: 13, color: 'var(--text-1)' }}>{r.captacoes}</td>
                          <td style={{ padding: '13px 16px', textAlign: 'right', fontSize: 13, color: 'var(--text-1)' }}>{r.vendas}</td>
                          <td style={{ padding: '13px 16px', textAlign: 'right', fontSize: 13, color: 'var(--text-1)' }}>{r.conversao}%</td>
                          {rankingPool.some(x => x.receita_gerada != null) && (
                            <td style={{ padding: '13px 16px', textAlign: 'right', fontSize: 13, color: 'var(--text-1)' }}>{r.receita_gerada != null ? fmtBrl(r.receita_gerada) : '—'}</td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      )}

      {/* ── Aba: Agentes ── */}
      {activeMainTab === 'equipe-sdr' && (
        agentesLoading ? (
          <StateBox kind="loading" height={140} />
        ) : agentesError ? (
          <StateBox kind="error" height={140} message="Não foi possível carregar a equipe." onRetry={fetchAgentes} />
        ) : sdrDisplayFontes.length === 0 ? (
          <StateBox kind="empty" height={140} message="Nenhum operador com captações neste período." />
        ) : (
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
            {sdrDisplayFontes.map((f, idx) => {
              const fd = f as AgenteRow & { _o2Origens?: string[] }
              const origens = fd._o2Origens ? fd._o2Origens.join(',') : f.fonte
              const initial = f.fonte.trim() ? f.fonte.trim()[0].toUpperCase() : '?'
              return (
                <div
                  key={f.fonte}
                  onClick={() => navigate(`/vida-sdr/${encodeURIComponent(origens)}?nome=${encodeURIComponent(f.fonte)}`)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/vida-sdr/${encodeURIComponent(origens)}?nome=${encodeURIComponent(f.fonte)}`) } }}
                  className="perf-drawer-trigger group"
                  style={{
                    cursor: 'pointer',
                    borderBottom: idx < sdrDisplayFontes.length - 1 ? '1px solid var(--border-lt)' : 'none',
                    transition: 'background 150ms',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px' }}>
                    <span style={{
                      width: 28, height: 28, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: '50%',
                      fontSize: 12, fontWeight: 700, color: '#FFFFFF', background: avatarColor(f.fonte),
                    }}>{initial}</span>
                    <b style={{ display: 'block', overflow: 'hidden', color: 'var(--text-1)', fontSize: 14, fontWeight: 650, textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{f.fonte}</b>
                    <ChevronRight
                      size={16}
                      className="opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                      style={{ color: 'var(--text-subtle)', flexShrink: 0 }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}

      {/* ── Aba: Perfil dos leads ── */}
      {activeMainTab === 'perfil-leads' && (
        perfilBothEmpty ? (
          <StateBox kind="empty" height={140} message="Nenhum dado de perfil (faixa etária ou plano de saúde) neste período." />
        ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Cake size={16} color="var(--text-muted)" />
              <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>Faixa etária</p>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-subtle)', margin: '0 0 16px' }}>
              {ageBandsLoading ? 'Carregando…' : ageError ? '—' : `${ageComIdade} lead${ageComIdade !== 1 ? 's' : ''} com idade identificada · ${ageSemIdade} sem essa informação`}
            </p>
            {ageBandsLoading ? (
              <StateBox kind="loading" height={140} />
            ) : ageError ? (
              <StateBox kind="error" height={140} message="Não foi possível carregar as faixas etárias." onRetry={fetchAges} />
            ) : ageEmpty ? (
              <StateBox kind="empty" height={140} message="Nenhum lead com idade identificada neste período." />
            ) : (
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {ageBands.map(b => {
                  const maxCap = Math.max(...ageBands.map(x => x.captacoes), 1)
                  return (
                    <button
                      key={b.faixa}
                      disabled={b.captacoes === 0}
                      onClick={() => {
                        setAgePopup(b.faixa)
                        setAgeLeads([])
                        setAgeLeadsLoading(true)
                        api.get<AgeLead[]>(`/api/v1/kpis/leads-faixa-etaria?${new URLSearchParams({ ...periodParams(), faixa: b.faixa })}`)
                          .then(r => setAgeLeads(r.data)).catch(() => setAgeLeads([]))
                          .finally(() => setAgeLeadsLoading(false))
                      }}
                      style={{
                        display: 'grid', gridTemplateColumns: '56px 1fr auto', alignItems: 'center', gap: 12,
                        background: 'none', border: 'none', padding: 0, textAlign: 'left',
                        cursor: b.captacoes > 0 ? 'pointer' : 'default', opacity: b.captacoes > 0 ? 1 : 0.5,
                      }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{b.faixa}</span>
                      <div style={{ background: 'var(--border-lt)', borderRadius: 3, height: 8, overflow: 'hidden' }}>
                        <div style={{ width: `${(b.captacoes / maxCap) * 100}%`, height: '100%', background: '#2563EB', borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', color: 'var(--text-1)', fontWeight: 600, minWidth: 40, textAlign: 'right' }}>{b.captacoes}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <HeartPulse size={16} color="var(--text-muted)" />
              <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>Já possui plano?</p>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-subtle)', margin: '0 0 16px' }}>
              {planoSaudeLoading ? 'Carregando…' : planoError ? '—' : `${planoSaude?.com_informacao ?? 0} lead${(planoSaude?.com_informacao ?? 0) !== 1 ? 's' : ''} com informação · ${planoSaude?.sem_informacao ?? 0} sem essa informação`}
            </p>
            {planoSaudeLoading ? (
              <StateBox kind="loading" height={140} />
            ) : planoError ? (
              <StateBox kind="error" height={140} message="Não foi possível carregar o plano de saúde." onRetry={fetchPlano} />
            ) : planoEmpty ? (
              <StateBox kind="empty" height={140} message="Nenhum lead com essa informação neste período." />
            ) : (
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-1)' }}><ShieldCheck size={14} color="#15803D" />Possui <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{planoSaude.possui_plano}</strong> <span style={{ color: 'var(--text-muted)' }}>({planoSaude.pct_possui}%)</span></span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-1)' }}>Não possui <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{planoSaude.nao_possui_plano}</strong> <span style={{ color: 'var(--text-muted)' }}>({planoSaude.pct_nao_possui}%)</span><ShieldX size={14} color="#B91C1C" /></span>
                </div>
                <ProportionBar pctA={planoSaude.pct_possui} pctB={planoSaude.pct_nao_possui} colorA="#15803D" colorB="#B91C1C" />
                {planoSaude.sem_informacao > 0 && (
                  <p style={{ fontSize: 12, color: 'var(--text-subtle)', marginTop: 10 }}>
                    {planoSaude.sem_informacao} lead(s) sem essa informação não entram na proporção acima.
                  </p>
                )}

                {planoSaude.operadoras.length > 0 && (
                  <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border-lt)' }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 10px' }}>Operadora atual</p>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th style={{ padding: '8px 4px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', borderBottom: '1px solid var(--border-lt)' }}>Operadora</th>
                          <th style={{ padding: '8px 4px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', borderBottom: '1px solid var(--border-lt)' }}>Captações</th>
                          <th style={{ padding: '8px 4px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', borderBottom: '1px solid var(--border-lt)' }}>Vendas</th>
                          <th style={{ padding: '8px 4px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', borderBottom: '1px solid var(--border-lt)' }}>Conversão</th>
                        </tr>
                      </thead>
                      <tbody>
                        {planoSaude.operadoras.map(o => (
                          <tr key={o.nome} style={{ borderBottom: '1px solid var(--border-lt)', cursor: 'pointer' }}
                            onClick={() => {
                              setPlanoPopup(o.nome)
                              setPlanoLeads([])
                              setPlanoLeadsLoading(true)
                              api.get<OrgLead[]>(`/api/v1/kpis/leads-plano-saude?${new URLSearchParams({ ...periodParams(), plano: o.nome })}`)
                                .then(r => setPlanoLeads(r.data)).catch(() => setPlanoLeads([]))
                                .finally(() => setPlanoLeadsLoading(false))
                            }}
                          >
                            <td style={{ padding: '10px 4px', fontSize: 13, fontWeight: 600, color: '#2563EB' }}>{o.nome}</td>
                            <td style={{ padding: '10px 4px', textAlign: 'right', fontSize: 13, fontVariantNumeric: 'tabular-nums', color: 'var(--text-1)' }}>{o.captacoes}</td>
                            <td style={{ padding: '10px 4px', textAlign: 'right', fontSize: 13, fontVariantNumeric: 'tabular-nums', color: 'var(--text-1)' }}>{o.vendas}</td>
                            <td style={{ padding: '10px 4px', textAlign: 'right', fontSize: 13, fontVariantNumeric: 'tabular-nums', color: 'var(--text-1)' }}>{o.conversao}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        )
      )}

      {/* ── Drawer unificado: Base / Canal / Ponto de conversão / Modalidade / Renutrição ──
          Cabeçalho (tipo, nome, recorte) · indicadores com variação vs. período anterior ·
          funil · potencial · perfil · rodapé fixo com a lista de leads. */}
      {drawer && (() => {
        const meta = DRAWER_KIND_META[drawer.kind]
        const KindIcon = meta.icon
        const d = drawerData
        const p = drawerPrev ?? undefined
        const isRenut = drawer.kind === 'renutricao'
        const sectionTitle = { fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 14px' } as const
        const card = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px' } as const
        const selStyle = { border: '1px solid var(--border)', borderRadius: 8, padding: '0 10px', fontSize: 12.5, background: 'var(--bg-card)', color: 'var(--text-1)', height: 32, cursor: 'pointer' } as const
        const campanhaOpts = drawerCampanha && drawerCampanha !== 'Sem campanha' && !campanhasMidia.includes(drawerCampanha) ? [...campanhasMidia, drawerCampanha] : campanhasMidia
        const pctDe = (n: number) => d && d.captacoes > 0 ? n / d.captacoes * 100 : 0
        return (
        <>
          <div onClick={closeDrawer} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(2px)', zIndex: 100 }} />
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="perf-drawer-title"
            style={{
              position: 'fixed', top: 0, right: 0, bottom: 0, width: 640, maxWidth: '100vw', zIndex: 101,
              background: 'var(--bg-subtle)', boxShadow: '-12px 0 40px rgba(15,23,42,.18)',
              display: 'flex', flexDirection: 'column',
            }}
          >
            {/* Cabeçalho */}
            <div style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: '18px 24px 16px', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <span aria-hidden="true" style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(37,99,235,0.10)', color: '#2563EB', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <KindIcon size={18} />
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>{meta.label}</p>
                  <p id="perf-drawer-title" title={drawer.label} style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1)', margin: '2px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{drawer.label}</p>
                </div>
                <button data-drawer-close onClick={closeDrawer} aria-label="Fechar análise" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 6, borderRadius: 8, flexShrink: 0, display: 'inline-flex' }}>
                  <X size={20} />
                </button>
              </div>

              {/* Recorte: período (página / mês / semana / dia, com ‹ ›) e Campanha */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
                <select aria-label="Período" value={drawerGran} onChange={e => setDrawerGran(e.target.value as DrawerGran)} style={selStyle}>
                  {DRAWER_GRANS.map(g => <option key={g.key} value={g.key}>{g.label}</option>)}
                </select>
                <select aria-label="Campanha" value={drawerCampanha} onChange={e => setDrawerCampanha(e.target.value)} style={{ ...selStyle, ...(drawerCampanha ? { borderColor: '#2563eb', color: '#2563eb', fontWeight: 600 } : {}) }}>
                  <option value="">Campanha: todas</option>
                  <option value="Sem campanha">Sem campanha</option>
                  {campanhaOpts.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <span style={{ flex: 1 }} />
                {drawerGran !== 'pagina' && (() => {
                  const g = drawerGran
                  const nextDisabled = isoDate(drawerRange(g, shiftAnchor(g, drawerAnchor, 1)).from) > isoDate(now)
                  const navBtn = { border: '1px solid var(--border)', background: 'var(--bg-card)', borderRadius: 8, width: 32, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, lineHeight: 1 } as const
                  return (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <button aria-label="Período anterior" onClick={() => setDrawerAnchor(shiftAnchor(g, drawerAnchor, -1))} style={{ ...navBtn, cursor: 'pointer', color: 'var(--text-1)' }}>‹</button>
                      <input
                        type="date"
                        aria-label="Escolher data"
                        value={drawerAnchor}
                        max={isoDate(now)}
                        onChange={e => { if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value) && e.target.value >= '2000-01-01') setDrawerAnchor(e.target.value) }}
                        style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '0 8px', fontSize: 12.5, background: 'var(--bg-card)', color: 'var(--text-1)', height: 32 }}
                      />
                      <button aria-label="Próximo período" disabled={nextDisabled} onClick={() => setDrawerAnchor(shiftAnchor(g, drawerAnchor, 1))} style={{ ...navBtn, cursor: nextDisabled ? 'default' : 'pointer', color: nextDisabled ? 'var(--text-muted)' : 'var(--text-1)', opacity: nextDisabled ? 0.4 : 1 }}>›</button>
                    </div>
                  )
                })()}
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '10px 0 0' }}>{drawerSubtitle()}</p>
            </div>

            {/* Corpo */}
            <div style={{ padding: '20px 24px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {drawerLoading ? (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                    {[0, 1, 2, 3].map(i => <div key={i} style={{ height: 86, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12 }} />)}
                  </div>
                  <div style={{ height: 150, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12 }} />
                  <div style={{ height: 110, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12 }} />
                </>
              ) : !d ? (
                <div style={{ ...card, textAlign: 'center', color: 'var(--text-muted)', padding: '40px 18px' }}>Não foi possível carregar os dados desta análise.</div>
              ) : d.captacoes === 0 ? (
                <div style={{ ...card, textAlign: 'center', padding: '44px 18px' }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>Nenhum lead neste recorte</p>
                  <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '6px 0 0' }}>Troque o período ou a campanha acima.</p>
                </div>
              ) : (
                <>
                  {/* Indicadores */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(128px, 1fr))', gap: 10 }}>
                    {([
                      [isRenut ? 'Retrabalhados' : 'Captados', d.captacoes.toLocaleString('pt-BR'), <DrawerDelta key="c" cur={d.captacoes} prev={p?.captacoes} tipo="count" />],
                      ['Vendas', d.vendas.toLocaleString('pt-BR'), <DrawerDelta key="v" cur={d.vendas} prev={p?.vendas} tipo="count" />],
                      ['Conversão', fmtPct(d.conversao), <DrawerDelta key="cv" cur={d.conversao} prev={p?.conversao} tipo="pp" />],
                      ['Cancelamento', fmtPct(d.pct_perda), <DrawerDelta key="cn" cur={d.pct_perda} prev={p?.pct_perda} tipo="pp" invert />],
                    ] as const).map(([label, valor, delta]) => (
                      <div key={label} style={{ ...card, padding: '14px 16px' }}>
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, margin: 0 }}>{label}</p>
                        <p style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-1)', margin: '4px 0 2px', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em' }}>{valor}</p>
                        <div style={{ minHeight: 16 }}>{delta}</div>
                      </div>
                    ))}
                  </div>
                  {drawerPrevLabel && (
                    <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '-4px 2px 0' }}>
                      Variação comparada a {drawerPrevLabel}{!p ? ' (carregando…)' : ''}
                    </p>
                  )}

                  {/* Funil */}
                  <div style={card}>
                    <p style={sectionTitle}>{isRenut ? 'Do retrabalho à venda' : 'Do captado à venda'}</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {([
                        [isRenut ? 'Retrabalhados' : 'Captados', d.captacoes, '#93B4F5'],
                        ['Em aberto', d.base_liquida - d.vendas, '#3B82F6'],
                        ['Vendas', d.vendas, '#15803D'],
                        ['Cancelados', d.cancelados, '#DC2626'],
                      ] as const).map(([label, count, fill]) => {
                        const pct = pctDe(count)
                        return (
                          <div key={label} style={{ display: 'grid', gridTemplateColumns: '92px 1fr 44px 52px', alignItems: 'center', gap: 12 }}>
                            <span style={{ fontSize: 12.5, color: 'var(--text-2)', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                              <i style={{ width: 8, height: 8, borderRadius: 3, background: fill, flexShrink: 0 }} />{label}
                            </span>
                            <div style={{ height: 10, borderRadius: 9999, background: 'var(--bg-subtle)', overflow: 'hidden' }}>
                              {pct > 0 && <div style={{ width: `${Math.max(pct, 1.5)}%`, height: '100%', borderRadius: 9999, background: fill }} />}
                            </div>
                            <span style={{ fontSize: 13.5, fontWeight: 700, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: count > 0 ? 'var(--text-1)' : 'var(--text-muted)' }}>{count.toLocaleString('pt-BR')}</span>
                            <span style={{ fontSize: 12, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>{fmtPct(Math.round(pct * 10) / 10)}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Potencial */}
                  <div style={{ ...card, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
                    <div>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, margin: 0 }}>Receita potencial</p>
                      <p style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)', margin: '4px 0 2px', fontVariantNumeric: 'tabular-nums' }}>{fmtBrl(d.receita_potencial)}</p>
                      <DrawerDelta cur={d.receita_potencial} prev={p?.receita_potencial} tipo="count" />
                    </div>
                    <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: 18 }}>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, margin: 0 }}>Ticket médio</p>
                      <p style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)', margin: '4px 0 2px', fontVariantNumeric: 'tabular-nums' }}>{fmtBrl(d.ticket_medio)}</p>
                      <DrawerDelta cur={d.ticket_medio} prev={p?.ticket_medio} tipo="count" />
                    </div>
                    <p style={{ gridColumn: '1 / -1', fontSize: 11.5, color: 'var(--text-muted)', margin: 0 }}>Estimativa sobre os leads não cancelados (valor potencial da ficha).</p>
                  </div>

                  {/* De onde vieram: só na renutrição — os leads retrabalhados
                      guardam a origem e o ponto de conversão originais */}
                  {isRenut && !!(d.por_canal?.length || d.por_ponto_conversao?.length) && (
                    <div style={card}>
                      <p style={sectionTitle}>De onde vieram</p>
                      {([
                        ['Por canal', d.por_canal],
                        ['Por ponto de conversão', d.por_ponto_conversao],
                      ] as const).map(([sub, rows]) => !rows || rows.length === 0 ? null : (
                        <div key={sub} style={{ marginBottom: 14 }}>
                          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', margin: '0 0 9px' }}>{sub}</p>
                          {rows.slice(0, 6).map((r, i) => (
                            <div key={r.nome} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 30px', alignItems: 'center', gap: 12, marginTop: i === 0 ? 0 : 7 }}>
                              <span title={r.nome} style={{ fontSize: 12.5, color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.nome}</span>
                              <div style={{ height: 6, borderRadius: 9999, background: 'var(--bg-subtle)', overflow: 'hidden' }}>
                                <div style={{ width: `${rows[0].count > 0 ? Math.round(r.count / rows[0].count * 100) : 0}%`, height: '100%', borderRadius: 9999, background: '#2563EB' }} />
                              </div>
                              <span style={{ fontSize: 12.5, fontWeight: 700, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-1)' }}>{r.count}</span>
                            </div>
                          ))}
                          {rows.length > 6 && <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '8px 0 0' }}>+{rows.length - 6} outros</p>}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Perfil dos leads */}
                  <div style={card}>
                    <p style={sectionTitle}>Perfil dos leads</p>
                    <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', margin: '0 0 10px' }}>Modalidade</p>
                    {d.modalidades.length === 0 ? (
                      <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0 }}>Sem dados.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {d.modalidades.map((m, i) => (
                          <div key={m.nome} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 34px 48px', alignItems: 'center', gap: 12 }}>
                            <span title={m.nome} style={{ fontSize: 12.5, color: 'var(--text-2)', display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                              <i style={{ width: 8, height: 8, borderRadius: 3, flexShrink: 0, background: CHART_COLORS[i % CHART_COLORS.length] }} />
                              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.nome}</span>
                            </span>
                            <div style={{ height: 8, borderRadius: 9999, background: 'var(--bg-subtle)', overflow: 'hidden' }}>
                              <div style={{ width: `${m.pct}%`, height: '100%', borderRadius: 9999, background: CHART_COLORS[i % CHART_COLORS.length] }} />
                            </div>
                            <span style={{ fontSize: 13, fontWeight: 700, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-1)' }}>{m.count}</span>
                            <span style={{ fontSize: 12, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>{fmtPct(m.pct)}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={{ borderTop: '1px solid var(--border)', margin: '16px 0 14px' }} />
                    <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', margin: '0 0 10px' }}>Já tem plano de saúde?</p>
                    {d.plano.possui + d.plano.nao_possui === 0 ? (
                      <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0 }}>Nenhum lead com essa informação.</p>
                    ) : (
                      <>
                        <div style={{ display: 'flex', gap: 2, height: 10, borderRadius: 9999, overflow: 'hidden', background: 'var(--bg-subtle)' }}>
                          {d.plano.possui > 0 && <div style={{ flex: d.plano.possui, background: '#15803D' }} />}
                          {d.plano.nao_possui > 0 && <div style={{ flex: d.plano.nao_possui, background: '#F59E0B' }} />}
                        </div>
                        <div style={{ display: 'flex', gap: 18, marginTop: 9, fontSize: 12.5, color: 'var(--text-2)' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <i style={{ width: 8, height: 8, borderRadius: 3, background: '#15803D' }} />
                            Possui <b style={{ color: 'var(--text-1)' }}>{d.plano.possui}</b> <span style={{ color: 'var(--text-muted)' }}>({fmtPct(d.plano.pct_possui)})</span>
                          </span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <i style={{ width: 8, height: 8, borderRadius: 3, background: '#F59E0B' }} />
                            Não possui <b style={{ color: 'var(--text-1)' }}>{d.plano.nao_possui}</b> <span style={{ color: 'var(--text-muted)' }}>({fmtPct(d.plano.pct_nao_possui)})</span>
                          </span>
                        </div>
                      </>
                    )}
                    {d.plano.sem_informacao > 0 && (
                      <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '10px 0 0' }}>
                        {d.plano.sem_informacao} lead(s) sem essa informação ficam fora da proporção.
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Rodapé fixo */}
            <div style={{ background: 'var(--bg-card)', borderTop: '1px solid var(--border)', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {d && !drawerLoading ? `${d.captacoes.toLocaleString('pt-BR')} lead${d.captacoes === 1 ? '' : 's'} no recorte` : ''}
              </span>
              <button
                onClick={openDrawerLeads}
                disabled={!d || drawerLoading || d.captacoes === 0}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', borderRadius: 8, padding: '9px 16px',
                  fontSize: 13, fontWeight: 600, color: '#fff', background: '#2563EB',
                  cursor: !d || drawerLoading || d.captacoes === 0 ? 'default' : 'pointer',
                  opacity: !d || drawerLoading || d.captacoes === 0 ? 0.5 : 1,
                }}
              >
                Ver {d?.captacoes === 1 ? 'o lead' : 'os leads'} <ChevronRight size={15} />
              </button>
            </div>
          </div>
        </>
        )
      })()}

      {/* ── Modal: Comparação entre pontos de conversão ── */}
      {convCompare && (
        <div onClick={() => setConvCompare(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Comparação entre pontos de conversão" style={{ background: 'var(--bg-card)', borderRadius: 16, width: '100%', maxWidth: 640, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(15,23,42,.25)' }}>
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
                      <button onClick={() => setConvCompareLevel('week')} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: convCompareLevel === 'week' ? 'var(--text-1)' : '#2563EB', fontWeight: convCompareLevel === 'week' ? 700 : 500 }}>
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
              <button onClick={() => setConvCompare(false)} aria-label="Fechar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: 24 }}>
              {convCompareLevel === 'month' && (
                organicBpForCompare.length === 0 ? (
                  <p style={{ textAlign: 'center', padding: '24px 0', fontSize: 13, color: 'var(--text-muted)' }}>Sem dados no período.</p>
                ) : (
                  <>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 14px' }}>Clique numa barra para ver a evolução semanal</p>
                    <ResponsiveContainer width="100%" height={Math.max(160, organicBpForCompare.length * 46)}>
                      <BarChart data={organicBpForCompare} layout="vertical" margin={{ top: 4, right: 30, left: 8, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-lt)" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text-subtle)' }} allowDecimals={false} />
                        <YAxis type="category" dataKey="label" width={150} tick={{ fontSize: 11, fill: 'var(--text-2)' }} />
                        <Tooltip content={({ active, payload }) => {
                          if (!active || !payload?.length) return null
                          return (
                            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', fontSize: 12, color: 'var(--text-2)' }}>
                              {(payload[0].payload as { captacoes: number }).captacoes} captações
                            </div>
                          )
                        }} />
                        <Bar
                          dataKey="captacoes" radius={[0, 4, 4, 0]}
                          onClick={(entry: unknown) => {
                            const label = (entry as { label?: string })?.label
                            if (!label) return
                            const relevantFontes = organicOnly.filter(f => f.breakdown.some(bd => bd.label === label)).map(f => f.fonte)
                            openConvPointCompare(label, relevantFontes)
                          }}
                        >
                          {organicBpForCompare.map((b, i) => (
                            <Cell key={i} fill={b.conversao >= 30 ? '#15803D' : b.conversao >= 15 ? '#B45309' : '#2563EB'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
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
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 14px' }}>Evolução semanal</p>
                    <ResponsiveContainer width="100%" height={240}>
                      <LineChart data={convCompareWeeks.map(w => ({ ...w, label: `Semana ${w.semana}` }))} margin={{ top: 4, right: 20, left: -10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-lt)" />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-subtle)' }} />
                        <YAxis tick={{ fontSize: 10, fill: 'var(--text-subtle)' }} allowDecimals={false} />
                        <Tooltip {...CHART_TOOLTIP} />
                        <Legend formatter={v => v === 'captacoes' ? 'Captações' : 'Vendas'} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                        <Line type="monotone" dataKey="captacoes" name="captacoes" stroke="#2563EB" strokeWidth={2}
                          dot={(dp: unknown) => {
                            const p = dp as { cx: number; cy: number; payload: { semana: number } }
                            return <circle key={`c-${p.payload.semana}`} cx={p.cx} cy={p.cy} r={5} fill="#2563EB" stroke="var(--bg-card)" strokeWidth={1.5} style={{ cursor: 'pointer' }} onClick={() => { setConvCompareWeek(p.payload.semana); setConvCompareLevel('day') }} />
                          }}
                          activeDot={{ r: 7 }}
                        />
                        <Line type="monotone" dataKey="vendas" name="vendas" stroke="#15803D" strokeWidth={2}
                          dot={(dp: unknown) => {
                            const p = dp as { cx: number; cy: number; payload: { semana: number } }
                            return <circle key={`v-${p.payload.semana}`} cx={p.cx} cy={p.cy} r={5} fill="#15803D" stroke="var(--bg-card)" strokeWidth={1.5} style={{ cursor: 'pointer' }} onClick={() => { setConvCompareWeek(p.payload.semana); setConvCompareLevel('day') }} />
                          }}
                          activeDot={{ r: 7 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                    <p style={{ fontSize: 12, color: 'var(--text-subtle)', marginTop: 10 }}>Clique num ponto do gráfico para detalhar os dias daquela semana.</p>
                  </>
                )
              )}

              {convCompareLevel === 'day' && (
                convCompareDays.length === 0 ? (
                  <p style={{ textAlign: 'center', padding: '24px 0', fontSize: 13, color: 'var(--text-muted)' }}>Sem dados nesta semana.</p>
                ) : (
                  <>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 14px' }}>Captações diárias de {convComparePoint} · Semana {convCompareWeek}</p>
                    <ResponsiveContainer width="100%" height={240}>
                      <LineChart data={convCompareDays.map(d => ({ ...d, label: `Dia ${d.dia}` }))} margin={{ top: 4, right: 20, left: -10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-lt)" />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-subtle)' }} />
                        <YAxis tick={{ fontSize: 10, fill: 'var(--text-subtle)' }} allowDecimals={false} />
                        <Tooltip {...CHART_TOOLTIP} />
                        <Legend formatter={v => v === 'captacoes' ? 'Captações' : 'Vendas'} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                        <Line type="monotone" dataKey="captacoes" name="captacoes" stroke="#2563EB" strokeWidth={2} dot={{ r: 4, fill: '#2563EB' }} activeDot={{ r: 6 }} />
                        <Line type="monotone" dataKey="vendas" name="vendas" stroke="#15803D" strokeWidth={2} dot={{ r: 4, fill: '#15803D' }} activeDot={{ r: 6 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {basePopup && (
        <FilterableLeadsModal
          title={basePopup} subtitle={`Leads captados nesta base · ${drawer ? drawerSubtitle() : periodLabel()}`}
          loading={baseLeadsLoading} leads={baseLeads}
          statusFilter={baseStatusFilter} onFilter={setBaseStatusFilter}
          onClose={() => setBasePopup(null)}
        />
      )}
      {orgPopup && (
        <FilterableLeadsModal
          title={orgPopup} subtitle={`Leads relacionados · ${drawer ? drawerSubtitle() : periodLabel()}`}
          loading={orgLeadsLoading} leads={orgLeads} total={orgLeadsTotal}
          statusFilter={orgStatusFilter} onFilter={setOrgStatusFilter}
          onClose={() => setOrgPopup(null)}
        />
      )}
      {planoPopup && (
        <SimpleLeadsModal
          title={planoPopup} subtitle={`${periodLabel()} · ${planoLeads.length} lead${planoLeads.length !== 1 ? 's' : ''}`}
          loading={planoLeadsLoading} leads={planoLeads}
          onClose={() => setPlanoPopup(null)}
        />
      )}
      {agePopup && (
        <SimpleLeadsModal
          title={`Faixa ${agePopup} anos`} subtitle={`${periodLabel()} · ${ageLeads.length} lead${ageLeads.length !== 1 ? 's' : ''}`}
          loading={ageLeadsLoading} leads={ageLeads} ageMode
          onClose={() => setAgePopup(null)}
        />
      )}
    </main>
    </div>
  )
}

// ─── Cartão de destaque da aba Ranking ──────────────────────────────────────
function RankingCard({ icon: Icon, accent, label, value, who, context, onClick }: {
  icon: React.ComponentType<{ size?: number; color?: string }>
  accent: string; label: string; value: string; who: string; context: string
  onClick: (e: React.MouseEvent<HTMLDivElement>) => void
}) {
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e as unknown as React.MouseEvent<HTMLDivElement>) } }}
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderLeft: `4px solid ${accent}`, borderRadius: 14, padding: '18px 20px', cursor: 'pointer' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        <Icon size={14} color={accent} />
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-subtle)' }}>{label}</span>
      </div>
      <p style={{ fontSize: 24, fontWeight: 800, color: accent, margin: '0 0 4px' }}>{value}</p>
      <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 3px' }}>{who}</p>
      <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: 0 }}>{context}</p>
    </div>
  )
}

// ─── Leaderboard consolidado da aba Aquisição (Bases / Canais / Pontos de conversão) ─
const AVATAR_COLORS = ['#2563EB', '#7C3AED', '#DB2777', '#D97706', '#059669', '#0891B2', '#DC2626', '#4F46E5']
function avatarColor(label: string): string {
  let hash = 0
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

// ─── Resumo consolidado da aba Aquisição: os 3 maiores de cada dimensão numa
// tela só, pra não precisar entrar em Bases → Canais → Pontos → Modalidade
// um de cada vez só pra ter uma leitura geral do mês. ────────────────────
type ResumoRow = { label: string; captacoes: number; conversao: number }

const RESUMO_MIN_AMOSTRA = 3 // ignora captações muito baixas nos destaques (conversão de 1 lead não é sinal)

// `total` = leads do periodo inteiro (o numero do topo da pagina) -- a fatia
// de cada linha e' sobre ele, nao sobre a soma das linhas: Canais, Bases e
// Renutricao sao so' parte dos leads, e a soma deles nao fecha o total.
function AquisicaoTable({ rows, total, onOpen }: {
  rows: { label: string; captacoes: number; vendas: number; conversao: number; extra: string; tempoMedioDias?: number | null; receitaGerada?: number | null }[]
  total: number
  onOpen: (label: string, trigger: HTMLElement) => void
}) {
  const totalCaptacoes = Math.max(1, total)

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
      <div>
        {rows.map((r, idx) => {
          const share = Math.round((r.captacoes / totalCaptacoes) * 100)
          const initial = r.label.trim() ? r.label.trim()[0].toUpperCase() : '?'
          return (
            <div
              key={r.label}
              onClick={e => onOpen(r.label, e.currentTarget)}
              role="button"
              tabIndex={0}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(r.label, e.currentTarget) } }}
              className="perf-drawer-trigger group"
              style={{
                cursor: 'pointer',
                borderBottom: idx < rows.length - 1 ? '1px solid var(--border-lt)' : 'none',
                transition: 'background 150ms',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px' }}>
                <span style={{
                  width: 28, height: 28, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: '50%',
                  fontSize: 12, fontWeight: 700, color: '#FFFFFF', background: avatarColor(r.label),
                }}>{initial}</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <b style={{ display: 'block', overflow: 'hidden', color: 'var(--text-1)', fontSize: 14, fontWeight: 650, textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</b>
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                  {r.captacoes.toLocaleString('pt-BR')} {r.captacoes === 1 ? 'lead' : 'leads'}
                </span>
                <span title="dos leads do período" style={{
                  fontSize: 13, fontWeight: 700, color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums',
                  background: 'var(--bg-subtle)', border: '1px solid var(--border-lt)', borderRadius: 8,
                  padding: '3px 10px', flexShrink: 0,
                }}>
                  {share}%
                </span>
                <ChevronRight
                  size={16}
                  className="opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                  style={{ color: 'var(--text-subtle)', flexShrink: 0 }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

