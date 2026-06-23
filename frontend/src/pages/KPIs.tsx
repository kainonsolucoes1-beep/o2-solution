import { useEffect, useState } from 'react'
import { TrendingUp, ChevronDown, ChevronRight } from 'lucide-react'
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

const SDR_NAMES = new Set([
  'isaac', 'julia', 'leticia', 'maria eduarda', 'anny', 'emily', 'emilly',
  'pedro', 'lucas', 'guilherme', 'lucascardoso', 'lucas cardoso', 'rodolfo', 'discadora',
  'gabrieli', 'gabrielli', 'kauany', 'kauanny', 'clara', 'o2 solution',
  'lucas carvalho', 'lucascarvalho',
])

const ORGANIC_SUB_NAMES = new Set(['chatgpt.com', 'site'])

const isSdr        = (fonte: string) => SDR_NAMES.has(fonte.toLowerCase())
const isOrganicSub = (fonte: string) => ORGANIC_SUB_NAMES.has(fonte.toLowerCase())

function aggregateSdr(rows: FonteData[]): FonteData {
  const cap = rows.reduce((s, r) => s + r.captacoes, 0)
  const ven = rows.reduce((s, r) => s + r.vendas, 0)
  const can = rows.reduce((s, r) => s + r.cancelados, 0)
  return { fonte: 'SDR', captacoes: cap, vendas: ven, cancelados: can, conversao: cap > 0 ? Math.round(ven / cap * 1000) / 10 : 0, breakdown: [] }
}

export default function KPIs() {
  const now = new Date()
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const [month, setMonth] = useState(defaultMonth)
  const [data, setData] = useState<FonteData[]>([])
  const [loading, setLoading] = useState(true)
  const [sdrOpen, setSdrOpen] = useState(false)
  const [expandedFontes, setExpandedFontes] = useState<Set<string>>(new Set())
  const toggleFonte = (f: string) => setExpandedFontes(prev => { const s = new Set(prev); s.has(f) ? s.delete(f) : s.add(f); return s })

  useEffect(() => {
    setLoading(true)
    api.get<FonteData[]>(`/api/v1/kpis/conversao-fonte?month=${month}`)
      .then(r => setData(r.data))
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [month])

  const sdrRows     = data.filter(d => isSdr(d.fonte))
  const organicSubs = data.filter(d => isOrganicSub(d.fonte))
  const otherRows   = data
    .filter(d => !isSdr(d.fonte) && !isOrganicSub(d.fonte))
    .map(d => d.fonte.toLowerCase() === 'orgânico' && organicSubs.length > 0
      ? { ...d, breakdown: [
            ...organicSubs.map(s => ({ label: s.fonte, captacoes: s.captacoes, vendas: s.vendas, cancelados: s.cancelados, conversao: s.conversao })),
            ...d.breakdown,
          ] }
      : d
    )
  const sdrAgg = sdrRows.length > 0 ? aggregateSdr(sdrRows) : null

  type RowType = FonteData & { isSdrParent?: boolean; isSdrChild?: boolean }
  const allRows: RowType[] = []
  const combined = [
    ...otherRows,
    ...(sdrAgg ? [{ ...sdrAgg, isSdrParent: true }] : []),
  ].sort((a, b) => b.captacoes - a.captacoes)

  for (const row of combined) {
    allRows.push(row)
    if ((row as any).isSdrParent && sdrOpen) {
      [...sdrRows].sort((a, b) => b.captacoes - a.captacoes).forEach(r => allRows.push({ ...r, isSdrChild: true }))
    }
  }

  const maxConversao = Math.max(...data.map(d => d.conversao), sdrAgg?.conversao ?? 0, 1)

  const colH: React.CSSProperties = {
    padding: '8px 14px', fontSize: 11, fontWeight: 600,
    color: 'var(--text-subtle)', textTransform: 'uppercase',
    letterSpacing: '0.04em', borderBottom: '1px solid var(--border)', textAlign: 'left',
  }

  function renderBar(conversao: number) {
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
    const isChild = row.isSdrChild
    const col: React.CSSProperties = {
      padding: '10px 14px', fontSize: 13, color: 'var(--text-2)',
      borderBottom: '1px solid var(--border)',
      background: isChild ? 'var(--bg-subtle)' : i % 2 === 1 ? 'var(--bg-subtle)' : 'transparent',
    }
    const hasBreakdown = !isChild && !row.isSdrParent && row.breakdown?.length > 0
    const breakdownOpen = expandedFontes.has(row.fonte)

    return (
      <>
        <tr key={row.isSdrChild ? `sdr-child-${row.fonte}` : row.fonte}>
          <td style={{ ...col, fontWeight: row.isSdrParent ? 700 : isChild ? 400 : 500, color: 'var(--text-1)', paddingLeft: isChild ? 32 : 14 }}>
            {row.isSdrParent ? (
              <button onClick={() => setSdrOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-1)', fontSize: 13, fontWeight: 700 }}>
                {sdrOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />} SDR
              </button>
            ) : isChild ? (
              <span style={{ color: 'var(--text-2)' }}>{row.fonte}</span>
            ) : hasBreakdown ? (
              <button onClick={() => toggleFonte(row.fonte)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-1)', fontSize: 13, fontWeight: 500 }}>
                {breakdownOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {row.fonte}
              </button>
            ) : row.fonte}
          </td>
          <td style={{ ...col, textAlign: 'right' }}>{row.captacoes}</td>
          <td style={{ ...col, textAlign: 'right', color: '#059669', fontWeight: 600 }}>{row.vendas}</td>
          <td style={{ ...col, textAlign: 'right', color: '#EF4444' }}>{row.cancelados}</td>
          <td style={{ ...col }}>{renderBar(row.conversao)}</td>
        </tr>
        {hasBreakdown && breakdownOpen && row.breakdown.map(bp => (
          <tr key={`bp-${row.fonte}-${bp.label}`}>
            <td style={{ ...col, paddingLeft: 32, fontStyle: 'italic', color: 'var(--text-subtle)', background: 'var(--bg-subtle)' }}>{bp.label}</td>
            <td style={{ ...col, textAlign: 'right', background: 'var(--bg-subtle)' }}>{bp.captacoes}</td>
            <td style={{ ...col, textAlign: 'right', color: '#059669', fontWeight: 600, background: 'var(--bg-subtle)' }}>{bp.vendas}</td>
            <td style={{ ...col, textAlign: 'right', color: '#EF4444', background: 'var(--bg-subtle)' }}>{bp.cancelados}</td>
            <td style={{ ...col, background: 'var(--bg-subtle)' }}>{renderBar(bp.conversao)}</td>
          </tr>
        ))}
      </>
    )
  }

  return (
    <main style={{ padding: '24px 32px', maxWidth: 860 }}>

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

      <div className="bg-white rounded-xl" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
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

    </main>
  )
}
