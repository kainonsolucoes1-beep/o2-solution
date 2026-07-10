import { useEffect, useRef, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  Users, ShoppingCart, TrendingUp, DollarSign, TrendingDown, Tag,
  Download, ArrowUp, ArrowDown, Minus,
} from 'lucide-react'
import api from '../api'

interface Kpis {
  captacoes: number; vendas: number; conversao: number
  receita_potencial: number; perda_financeira: number; ticket_medio: number
}
interface DiarioItem { dia: number; captacoes: number; vendas: number }
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
function nowMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function prevMonthStr(month: string) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const CARD_CFG = [
  { key: 'captacoes',         label: 'Captações',         icon: Users,        color: '#3B82F6', bg: '#EFF6FF', sub: '#1E40AF', fmt: (v: number) => String(v) },
  { key: 'vendas',            label: 'Vendas',            icon: ShoppingCart, color: '#10B981', bg: '#ECFDF5', sub: '#065F46', fmt: (v: number) => String(v) },
  { key: 'conversao',         label: 'Conversão',         icon: TrendingUp,   color: '#7C3AED', bg: '#F5F3FF', sub: '#4C1D95', fmt: (v: number) => `${v}%` },
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
        <Minus size={11} /> igual ao mês anterior
      </span>
    )
  }
  const isUp = diffPct > 0
  const good = invert ? !isUp : isUp
  const color = good ? '#059669' : '#DC2626'
  const Icon = isUp ? ArrowUp : ArrowDown
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 11, fontWeight: 700, color }}>
      <Icon size={11} /> {Math.abs(diffPct)}% vs mês anterior
    </span>
  )
}

export default function RelatorioProducao() {
  const month = nowMonth()
  const prevMonth = prevMonthStr(month)

  const [kpis, setKpis]         = useState<Kpis | null>(null)
  const [prevKpis, setPrevKpis] = useState<Kpis | null>(null)
  const [diario, setDiario]     = useState<DiarioItem[]>([])
  const [origens, setOrigens]   = useState<OrigemItem[]>([])
  const [loading, setLoading]   = useState(true)
  const [exporting, setExporting] = useState(false)
  const reportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      api.get<Kpis>(`/api/v1/gestao-comercial/visao-geral?month=${month}`),
      api.get<Kpis>(`/api/v1/gestao-comercial/visao-geral?month=${prevMonth}`),
      api.get<DiarioItem[]>(`/api/v1/gestao-comercial/evolucao-diaria?month=${month}`),
      api.get<OrigemItem[]>(`/api/v1/gestao-comercial/origens-captacao?month=${month}`),
    ]).then(([k, pk, d, o]) => {
      setKpis(k.data); setPrevKpis(pk.data); setDiario(d.data); setOrigens(o.data)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [month, prevMonth])

  async function exportImage() {
    if (!reportRef.current) return
    setExporting(true)
    try {
      const html2canvas = (await import('html2canvas')).default
      const canvas = await html2canvas(reportRef.current, { scale: 2, backgroundColor: '#ffffff' })
      const link = document.createElement('a')
      link.download = `relatorio-producao-${month}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
    } finally {
      setExporting(false)
    }
  }

  const monthLabel = new Date(month + '-01T12:00:00').toLocaleString('pt-BR', { month: 'long', year: 'numeric' })
  const grupos = origens.length > 0 ? groupOrigens(origens) : []
  const maxCap = grupos.reduce((m, g) => Math.max(m, g.captacoes), 1)
  const today = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 24px 60px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Relatório de Produção</p>
          <p style={{ fontSize: 12, color: 'var(--text-subtle)', margin: '2px 0 0' }}>Pronto para enviar à equipe</p>
        </div>
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

      {loading ? (
        <p style={{ textAlign: 'center', color: 'var(--text-subtle)', padding: 40 }}>Carregando…</p>
      ) : (
        <div ref={reportRef} style={{ background: '#FFFFFF', borderRadius: 16, padding: 28, border: '1px solid #E5E7EB' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4, flexWrap: 'wrap', gap: 8 }}>
            <p style={{ fontSize: 20, fontWeight: 800, color: '#111827', margin: 0, textTransform: 'capitalize' }}>{monthLabel}</p>
            <p style={{ fontSize: 11, color: '#9CA3AF', margin: 0 }}>gerado em {today}</p>
          </div>
          <p style={{ fontSize: 12, color: '#6B7280', margin: '0 0 20px' }}>Produção da equipe até o momento</p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
            {CARD_CFG.map(({ key, label, icon: Icon, color, bg, sub, fmt }) => {
              const value = kpis ? (kpis as unknown as Record<string, number>)[key] : 0
              const prevValue = prevKpis ? (prevKpis as unknown as Record<string, number>)[key] : 0
              return (
                <div key={key} style={{ background: bg, borderRadius: 10, padding: '12px 14px', borderLeft: `3px solid ${color}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: sub, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{label}</span>
                    <Icon size={13} color={color} />
                  </div>
                  <p style={{ fontSize: 18, fontWeight: 800, color, margin: '0 0 4px' }}>{fmt(value)}</p>
                  <Delta current={value} previous={prevValue} invert={key === 'perda_financeira'} />
                </div>
              )
            })}
          </div>

          <div style={{ marginBottom: 24 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Evolução Diária</p>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={diario} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="dia" tick={{ fontSize: 10, fill: '#94A3B8' }} interval={4} />
                <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E2E8F0' }}
                  formatter={(val: number, name: string) => [val, name === 'captacoes' ? 'Captações' : 'Vendas']}
                  labelFormatter={(l: number) => `Dia ${l}`} />
                <Line type="monotone" dataKey="captacoes" stroke="#3B82F6" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="vendas"    stroke="#10B981" strokeWidth={2} dot={false} />
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
