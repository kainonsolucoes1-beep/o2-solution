import { useEffect, useRef, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  Users, Handshake, UserCheck, DollarSign, TrendingDown, Tag,
  Download, ArrowUp, ArrowDown, Minus, Calendar,
} from 'lucide-react'
import api from '../api'

interface Kpis {
  captacoes: number; vendas: number; conversao: number; qualificados: number
  em_negociacao: number
  receita_potencial: number; perda_financeira: number; ticket_medio: number
}
interface DiarioItem { dia: number; data: string; captacoes: number; vendas: number }
interface OrigemItem { origem: string; captacoes: number; pct: number }

const ORGANICO_EXTRA = new Set(['site', 'chatgpt.com', 'chatgpt', 'google', 'instagram', 'facebook', 'whatsapp'])
const isOrganico     = (o: string) => o.toLowerCase().includes('org') || ORGANICO_EXTRA.has(o.toLowerCase())

interface GrupoOrigem { nome: string; captacoes: number; pct: number; color: string }
function groupOrigens(origens: OrigemItem[]): GrupoOrigem[] {
  let sdrTotal = 0, orgTotal = 0
  for (const o of origens) {
    if (isOrganico(o.origem)) orgTotal += o.captacoes
    else sdrTotal += o.captacoes
  }
  const total = sdrTotal + orgTotal || 1
  return [
    { nome: 'SDR',      captacoes: sdrTotal, pct: Math.round(sdrTotal / total * 100), color: '#3B82F6' },
    { nome: 'Orgânico', captacoes: orgTotal, pct: Math.round(orgTotal / total * 100), color: '#10B981' },
  ]
}

function fmtBrl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function toISODate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function mondayOfWeek(d: Date) {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(d)
  monday.setDate(d.getDate() + diff)
  return monday
}
function currentWeekRange() {
  const monday = mondayOfWeek(new Date())
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return { start: toISODate(monday), end: toISODate(sunday) }
}
function previousPeriod(start: string, end: string) {
  const s = new Date(start + 'T12:00:00')
  const e = new Date(end + 'T12:00:00')
  const days = Math.round((e.getTime() - s.getTime()) / 86400000) + 1
  const prevEnd = new Date(s)
  prevEnd.setDate(s.getDate() - 1)
  const prevStart = new Date(prevEnd)
  prevStart.setDate(prevEnd.getDate() - (days - 1))
  return { start: toISODate(prevStart), end: toISODate(prevEnd) }
}

const CARD_CFG = [
  { key: 'captacoes',         label: 'Captações',         icon: Users,        color: '#3B82F6', bg: '#EFF6FF', sub: '#1E40AF', fmt: (v: number) => String(v) },
  { key: 'em_negociacao',     label: 'Em Negociação',     icon: Handshake,    color: '#10B981', bg: '#ECFDF5', sub: '#065F46', fmt: (v: number) => String(v) },
  { key: 'qualificados',      label: 'Qualificados',      icon: UserCheck,    color: '#7C3AED', bg: '#F5F3FF', sub: '#4C1D95', fmt: (v: number) => String(v) },
  { key: 'receita_potencial', label: 'Receita Potencial', icon: DollarSign,   color: '#059669', bg: '#ECFDF5', sub: '#065F46', fmt: fmtBrl },
  { key: 'perda_financeira',  label: 'Perda Financeira',  icon: TrendingDown, color: '#EF4444', bg: '#FEF2F2', sub: '#991B1B', fmt: fmtBrl },
  { key: 'ticket_medio',      label: 'Ticket Médio',      icon: Tag,          color: '#F59E0B', bg: '#FFFBEB', sub: '#92400E', fmt: fmtBrl },
] as const

function Delta({ current, previous, invert = false }: { current: number; previous: number; invert?: boolean }) {
  if (previous === 0) return null
  const diffPct = Math.round((current - previous) / previous * 100)
  if (diffPct === 0) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 11, fontWeight: 700, color: '#6B7280' }}>
        <Minus size={11} /> igual ao período anterior
      </span>
    )
  }
  const isUp = diffPct > 0
  const good = invert ? !isUp : isUp
  const color = good ? '#059669' : '#DC2626'
  const Icon = isUp ? ArrowUp : ArrowDown
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 11, fontWeight: 700, color }}>
      <Icon size={11} /> {Math.abs(diffPct)}% vs período anterior
    </span>
  )
}

export default function RelatorioProducao() {
  const defaultRange = currentWeekRange()
  const [start, setStart] = useState(defaultRange.start)
  const [end, setEnd]     = useState(defaultRange.end)
  const [filterOpen, setFilterOpen] = useState(false)

  const [kpis, setKpis]         = useState<Kpis | null>(null)
  const [prevKpis, setPrevKpis] = useState<Kpis | null>(null)
  const [diario, setDiario]     = useState<DiarioItem[]>([])
  const [origens, setOrigens]   = useState<OrigemItem[]>([])
  const [loading, setLoading]   = useState(true)
  const [exporting, setExporting] = useState(false)
  const reportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!start || !end) return
    const prev = previousPeriod(start, end)
    setLoading(true)
    Promise.all([
      api.get<Kpis>(`/api/v1/gestao-comercial/visao-geral?start=${start}&end=${end}&vendas_por_fechamento=true`),
      api.get<Kpis>(`/api/v1/gestao-comercial/visao-geral?start=${prev.start}&end=${prev.end}&vendas_por_fechamento=true`),
      api.get<DiarioItem[]>(`/api/v1/gestao-comercial/evolucao-diaria?start=${start}&end=${end}`),
      api.get<OrigemItem[]>(`/api/v1/gestao-comercial/origens-captacao?start=${start}&end=${end}`),
    ]).then(([k, pk, d, o]) => {
      setKpis(k.data); setPrevKpis(pk.data); setDiario(d.data); setOrigens(o.data)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [start, end])

  async function exportImage() {
    if (!reportRef.current) return
    setExporting(true)
    try {
      const html2canvas = (await import('html2canvas')).default
      const canvas = await html2canvas(reportRef.current, { scale: 2, backgroundColor: '#ffffff' })
      const link = document.createElement('a')
      link.download = `relatorio-producao-${start}_a_${end}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    } finally {
      setExporting(false)
    }
  }

  function resetToCurrentWeek() {
    const r = currentWeekRange()
    setStart(r.start); setEnd(r.end)
    setFilterOpen(false)
  }

  const grupos = origens.length > 0 ? groupOrigens(origens) : []
  const maxCap = grupos.reduce((m, g) => Math.max(m, g.captacoes), 1)
  const today = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const diarioUteis = diario.filter(d => {
    const [day, month] = d.data.split('/')
    const dow = new Date(`${start.slice(0, 4)}-${month}-${day}T12:00:00`).getDay()
    return dow !== 0 && dow !== 6
  })
  const chartInterval = diarioUteis.length > 14 ? ('preserveStartEnd' as const) : 0

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '20px 32px 60px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Relatório de Produção</p>
          <p style={{ fontSize: 12, color: 'var(--text-subtle)', margin: '2px 0 0' }}>Pronto para enviar à equipe</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
          <button
            onClick={() => setFilterOpen(o => !o)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}
          >
            <Calendar size={14} />
            Data
          </button>
          {filterOpen && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setFilterOpen(false)} />
              <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 50, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', minWidth: 240 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', margin: '0 0 5px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>De</p>
                    <input type="date" value={start} onChange={e => setStart(e.target.value)}
                      style={{ width: '100%', fontSize: 13, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border-in)', color: 'var(--text-3)', background: 'var(--bg-input)', cursor: 'pointer', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', margin: '0 0 5px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Até</p>
                    <input type="date" value={end} onChange={e => setEnd(e.target.value)}
                      style={{ width: '100%', fontSize: 13, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border-in)', color: 'var(--text-3)', background: 'var(--bg-input)', cursor: 'pointer', boxSizing: 'border-box' }} />
                  </div>
                  <button onClick={resetToCurrentWeek}
                    style={{ marginTop: 4, fontSize: 12, fontWeight: 600, color: '#2563EB', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}>
                    Voltar para semana atual
                  </button>
                </div>
              </div>
            </>
          )}
          <button
            onClick={exportImage}
            disabled={loading || exporting}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              background: loading || exporting ? '#D1FAE5' : '#059669', color: loading || exporting ? '#065F46' : 'white',
              border: 'none', cursor: loading || exporting ? 'not-allowed' : 'pointer',
            }}
          >
            <Download size={15} /> {exporting ? 'Gerando imagem…' : 'Exportar como imagem'}
          </button>
        </div>
      </div>

      {loading ? (
        <p style={{ textAlign: 'center', color: 'var(--text-subtle)', padding: 40 }}>Carregando…</p>
      ) : (
        <div ref={reportRef} style={{ background: '#FFFFFF', borderRadius: 16, padding: 32, border: '1px solid #E5E7EB' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4, flexWrap: 'wrap', gap: 8 }}>
            <p style={{ fontSize: 20, fontWeight: 800, color: '#111827', margin: 0 }}>Produção Semanal</p>
            <p style={{ fontSize: 11, color: '#9CA3AF', margin: 0 }}>gerado em {today}</p>
          </div>
          <p style={{ fontSize: 12, color: '#6B7280', margin: '0 0 20px' }}>Produção da equipe no período selecionado</p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 28 }}>
            {CARD_CFG.map(({ key, label, icon: Icon, color, bg, sub, fmt }) => {
              const value = kpis ? (kpis as unknown as Record<string, number>)[key] : 0
              const prevValue = prevKpis ? (prevKpis as unknown as Record<string, number>)[key] : 0
              return (
                <div key={key} style={{ background: bg, borderRadius: 10, padding: '16px 18px', borderLeft: `3px solid ${color}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: sub, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{label}</span>
                    <Icon size={15} color={color} />
                  </div>
                  <p style={{ fontSize: 22, fontWeight: 800, color, margin: '0 0 4px' }}>{fmt(value)}</p>
                  <Delta current={value} previous={prevValue} invert={key === 'perda_financeira'} />
                </div>
              )
            })}
          </div>

          <div style={{ marginBottom: 28 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Evolução Diária</p>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={diarioUteis} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="data" tick={{ fontSize: 11, fill: '#94A3B8' }} interval={chartInterval} />
                <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E2E8F0' }}
                  formatter={(val: number, name: string) => [val, name === 'captacoes' ? 'Captações' : 'Vendas']}
                  labelFormatter={(l: string) => l} />
                <Line type="monotone" dataKey="captacoes" stroke="#3B82F6" strokeWidth={2} dot={diarioUteis.length <= 14} />
                <Line type="monotone" dataKey="vendas"    stroke="#10B981" strokeWidth={2} dot={diarioUteis.length <= 14} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Origem das Captações</p>
            {grupos.map(g => {
              const barW = maxCap > 0 ? Math.max((g.captacoes / maxCap) * 100, 2) : 0
              return (
                <div key={g.nome} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{g.nome}</span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: g.color }}>{g.captacoes} ({g.pct}%)</span>
                  </div>
                  <div style={{ background: '#F1F5F9', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                    <div style={{ width: `${barW}%`, height: '100%', background: g.color, borderRadius: 4 }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
