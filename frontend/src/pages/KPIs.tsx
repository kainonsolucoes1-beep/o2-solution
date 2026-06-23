import { useEffect, useState } from 'react'
import { TrendingUp, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react'
import {
  Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from 'recharts'
import api from '../api'

interface BreakdownItem {
  label: string
  captacoes: number
  vendas: number
  cancelados: number
  conversao: number
}

interface FonteData {
  fonte: string
  captacoes: number
  vendas: number
  cancelados: number
  conversao: number
  breakdown: BreakdownItem[]
}

const CHART_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899']
const MEDALS = ['🥇', '🥈', '🥉']

const SDR_NAMES = new Set([
  'isaac', 'julia', 'leticia', 'maria eduarda', 'anny', 'emily', 'emilly',
  'pedro', 'lucas', 'guilherme', 'lucascardoso', 'lucas cardoso', 'rodolfo', 'discadora',
  'gabrieli', 'gabrielli', 'kauany', 'kauanny', 'clara', 'o2 solution',
  'lucas carvalho', 'lucascarvalho',
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

function card(bg: string, border: string): React.CSSProperties {
  return { background: bg, borderRadius: 12, padding: '20px 24px', border: `1px solid ${border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }
}

export default function KPIs() {
  const now = new Date()
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const [month, setMonth] = useState(defaultMonth)
  const [data, setData] = useState<FonteData[]>([])
  const [loading, setLoading] = useState(true)
  const [sdrOpen, setSdrOpen] = useState(false)
  const [o2Open, setO2Open] = useState(false)
  const [expandedFontes, setExpandedFontes] = useState<Set<string>>(new Set())
  const toggleFonte = (f: string) => setExpandedFontes(prev => { const s = new Set(prev); s.has(f) ? s.delete(f) : s.add(f); return s })
  const [funnelOpen, setFunnelOpen] = useState(false)
  const [renutrucao, setRenutrucao] = useState({ captacoes: 0, vendas: 0, cancelados: 0, conversao: 0 })

  useEffect(() => {
    setLoading(true)
    api.get<FonteData[]>(`/api/v1/kpis/conversao-fonte?month=${month}`)
      .then(r => setData(r.data))
      .catch(() => setData([]))
      .finally(() => setLoading(false))
    api.get<{ captacoes: number; vendas: number; cancelados: number; conversao: number }>(
      `/api/v1/kpis/renutrucao?month=${month}`
    ).then(r => setRenutrucao(r.data)).catch(() => {})
  }, [month])

  const sdrRows      = data.filter(d => isSdr(d.fonte))
  const o2MemberRows = sdrRows.filter(r => isO2Member(r.fonte))
  const otherSdrRows = sdrRows.filter(r => !isO2Member(r.fonte) && !isO2Self(r.fonte))
  const organicSubs  = data.filter(d => isOrganicSub(d.fonte))
  const otherRows    = data
    .filter(d => !isSdr(d.fonte) && !isOrganicSub(d.fonte))
    .map(d => d.fonte.toLowerCase() === 'orgânico' && organicSubs.length > 0
      ? { ...d, breakdown: [
            ...organicSubs.map(s => ({ label: s.fonte, captacoes: s.captacoes, vendas: s.vendas, cancelados: s.cancelados, conversao: s.conversao })),
            ...d.breakdown,
          ] }
      : d
    )
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

  const principalFonte = combined.length > 0
    ? combined.reduce((best, r) => r.captacoes > best.captacoes ? r : best)
    : null

  // Charts use combined (SDR aggregated, orgSubs absorbed into Orgânico visually)
  const combinedTotal = combined.reduce((s, r) => s + r.captacoes, 0)

  // Funnel detail: merge organicSubs (chatgpt.com, Site) into Orgânico's totals
  const funnelRows = combined.map(r => {
    if (r.fonte.toLowerCase() === 'orgânico' && organicSubs.length > 0) {
      const subCap = organicSubs.reduce((s, os) => s + os.captacoes, 0)
      const subVen = organicSubs.reduce((s, os) => s + os.vendas, 0)
      const subCan = organicSubs.reduce((s, os) => s + os.cancelados, 0)
      return { ...r, captacoes: r.captacoes + subCap, vendas: r.vendas + subVen, cancelados: r.cancelados + subCan }
    }
    return r
  }).sort((a, b) => b.captacoes - a.captacoes)

  const top4Pie = [...combined].sort((a, b) => b.captacoes - a.captacoes).slice(0, 4)
  const outrosVal = combinedTotal - top4Pie.reduce((s, r) => s + r.captacoes, 0)
  const pieData = [
    ...top4Pie.map(r => ({ name: r.fonte, value: r.captacoes })),
    ...(outrosVal > 0 ? [{ name: 'Outros', value: outrosVal }] : []),
  ]

  const top5Sdr = [...sdrRows].sort((a, b) => b.captacoes - a.captacoes).slice(0, 5)

  const maxConversao = Math.max(...data.map(d => d.conversao), sdrAgg?.conversao ?? 0, 1)

  const colH: React.CSSProperties = {
    padding: '8px 14px', fontSize: 11, fontWeight: 600,
    color: 'var(--text-subtle)', textTransform: 'uppercase',
    letterSpacing: '0.04em', borderBottom: '1px solid var(--border)', textAlign: 'left',
  }

  function renderConversaoBar(conversao: number) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{
            width: `${(conversao / maxConversao) * 100}%`, height: '100%',
            background: conversao >= 30 ? '#059669' : conversao >= 15 ? '#F59E0B' : '#3B82F6',
            borderRadius: 3, transition: 'width 400ms ease',
          }} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', minWidth: 36, textAlign: 'right' }}>{conversao}%</span>
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

    return (
      <>
        <tr key={isO2ChildRow ? `o2-child-${row.fonte}` : row.isSdrChild ? `sdr-child-${row.fonte}` : row.fonte}>
          <td style={{ ...col, fontWeight: row.isSdrParent ? 700 : isChild ? 400 : 500, color: 'var(--text-1)', paddingLeft }}>
            {row.isSdrParent ? (
              <button onClick={() => setSdrOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-1)', fontSize: 13, fontWeight: 700 }}>
                {sdrOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />} SDR
              </button>
            ) : isO2ParentRow ? (
              <button onClick={() => setO2Open(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-1)', fontSize: 13, fontWeight: 400 }}>
                {o2Open ? <ChevronDown size={14} /> : <ChevronRight size={14} />} O2 Solution
              </button>
            ) : hasBreakdown ? (
              <button onClick={() => toggleFonte(row.fonte)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-1)', fontSize: 13, fontWeight: isChild ? 400 : 500 }}>
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
          <tr key={`bp-${row.fonte}-${bp.label}`}>
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

  return (
    <main style={{ padding: '24px 32px', maxWidth: 1100 }}>

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

      {/* KPI Cards */}
      {!loading && data.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
          <div style={card('#EFF6FF', '#BFDBFE')}>
            <div style={{ fontSize: 11, color: '#3B82F6', fontWeight: 600, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>📈 Captações Totais</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: '#1D4ED8', lineHeight: 1 }}>{totalCap}</div>
            <div style={{ fontSize: 11, color: '#93C5FD', marginTop: 6 }}>Total de leads capturados</div>
          </div>

          <div style={card('#F5F3FF', '#DDD6FE')}>
            <div style={{ fontSize: 11, color: '#7C3AED', fontWeight: 600, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>📊 Taxa de Conversão</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: '#5B21B6', lineHeight: 1 }}>{taxaConv}%</div>
            <div style={{ fontSize: 11, color: '#A78BFA', marginTop: 6 }}>Vendas / Captações</div>
          </div>

          <div style={card('#FEF2F2', '#FECACA')}>
            <div style={{ fontSize: 11, color: '#EF4444', fontWeight: 600, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>❌ Cancelados</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: '#B91C1C', lineHeight: 1 }}>
              {totalCan} <span style={{ fontSize: 16, fontWeight: 400 }}>({pctCan}%)</span>
            </div>
            <div style={{ fontSize: 11, color: '#FCA5A5', marginTop: 6 }}>Leads perdidos</div>
          </div>

          <div style={card('#FFF7ED', '#FED7AA')}>
            <div style={{ fontSize: 11, color: '#F97316', fontWeight: 600, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>🎯 Principal Fonte</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#C2410C', lineHeight: 1.2 }}>{principalFonte?.fonte ?? '—'}</div>
            <div style={{ fontSize: 11, color: '#FDBA74', marginTop: 6 }}>{principalFonte?.captacoes ?? 0} captações</div>
          </div>
        </div>
      )}


      {/* Alerts */}
      {!loading && data.length > 0 && pctCan > 20 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: 8, padding: '11px 16px', display: 'flex', alignItems: 'center', gap: 10, color: '#EA580C', fontSize: 13, fontWeight: 600 }}>
            <AlertTriangle size={15} /> ⚠️ Alto índice de cancelamentos ({pctCan}%)
          </div>
        </div>
      )}

      {/* Charts */}
      {!loading && data.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>

          {/* Pie — Distribuição */}
          <div className="bg-white rounded-xl" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)', padding: '20px 16px' }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', margin: '0 0 14px 4px' }}>Distribuição por Origem</p>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="45%" outerRadius={68}>
                  {pieData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v: number) => [v, 'Captações']} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Funnel — custom with expandable detail */}
          <div className="bg-white rounded-xl" style={{
            boxShadow: funnelOpen ? '0 4px 24px rgba(124,58,237,0.18)' : '0 1px 3px rgba(0,0,0,0.08)',
            overflow: 'hidden',
            transition: 'box-shadow 0.3s ease',
          }}>
            <div style={{ padding: '20px 24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', margin: 0 }}>Funil de Conversão</p>
                <button
                  onClick={() => setFunnelOpen(o => !o)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    background: funnelOpen ? '#7C3AED' : 'transparent',
                    border: '1px solid #7C3AED', borderRadius: 20,
                    padding: '4px 11px', cursor: 'pointer',
                    fontSize: 11, fontWeight: 600,
                    color: funnelOpen ? '#fff' : '#7C3AED',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {funnelOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                  {funnelOpen ? 'Fechar' : 'Detalhar'}
                </button>
              </div>
              {[
                { label: 'Captações', value: String(totalCap), pct: 100, color: '#3B82F6' },
                { label: 'Vendas', value: String(totalVen), pct: totalCap > 0 ? (totalVen / totalCap) * 100 : 0, color: '#F59E0B' },
                { label: 'Conversão', value: `${taxaConv}%`, pct: taxaConv, color: '#7C3AED' },
              ].map((stage, i) => (
                <div key={i} style={{ marginBottom: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>{stage.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: stage.color }}>{stage.value}</span>
                  </div>
                  <div style={{ background: 'var(--border)', borderRadius: 4, height: 20, overflow: 'hidden' }}>
                    <div style={{
                      width: `${Math.max(stage.pct, 1.5)}%`,
                      height: '100%', background: stage.color,
                      borderRadius: 4, transition: 'width 0.5s ease',
                    }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Expandable breakdown */}
            <div style={{
              maxHeight: funnelOpen ? '520px' : '0px',
              overflow: 'hidden',
              transition: 'max-height 0.45s cubic-bezier(0.4, 0, 0.2, 1)',
            }}>
              <div style={{
                background: 'linear-gradient(135deg, #0F172A 0%, #1E1B4B 100%)',
                padding: '20px 24px 24px',
                borderTop: '1px solid rgba(124,58,237,0.35)',
              }}>
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
                              borderRadius: 3,
                              boxShadow: `0 0 8px ${color}55`,
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
                    ) : funnelRows.filter(r => r.vendas > 0).map((r, i) => {
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
                              borderRadius: 3,
                              boxShadow: '0 0 8px #F59E0B55',
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
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-subtle)' }}>
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

    </main>
  )
}
