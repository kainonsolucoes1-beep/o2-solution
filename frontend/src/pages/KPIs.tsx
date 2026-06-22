import { useEffect, useState } from 'react'
import { TrendingUp, ChevronDown, ChevronRight } from 'lucide-react'
import api from '../api'

interface FonteData {
  fonte: string
  captacoes: number
  vendas: number
  cancelados: number
  conversao: number
}

const SDR_NAMES = new Set([
  'isaac', 'julia', 'leticia', 'maria eduarda', 'anny', 'emily', 'emilly',
  'pedro', 'lucas', 'guilherme', 'lucascardoso', 'lucas cardoso', 'rodolfo',
])

const isSdr = (fonte: string) => SDR_NAMES.has(fonte.toLowerCase())

function aggregateSdr(rows: FonteData[]): FonteData {
  const cap = rows.reduce((s, r) => s + r.captacoes, 0)
  const ven = rows.reduce((s, r) => s + r.vendas, 0)
  const can = rows.reduce((s, r) => s + r.cancelados, 0)
  return { fonte: 'SDR', captacoes: cap, vendas: ven, cancelados: can, conversao: cap > 0 ? Math.round(ven / cap * 1000) / 10 : 0 }
}

export default function KPIs() {
  const now = new Date()
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const [month, setMonth] = useState(defaultMonth)
  const [data, setData] = useState<FonteData[]>([])
  const [loading, setLoading] = useState(true)
  const [sdrOpen, setSdrOpen] = useState(false)

  useEffect(() => {
    setLoading(true)
    api.get<FonteData[]>(`/api/v1/kpis/conversao-fonte?month=${month}`)
      .then(r => setData(r.data))
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [month])

  const sdrRows   = data.filter(d => isSdr(d.fonte))
  const otherRows = data.filter(d => !isSdr(d.fonte))
  const sdrAgg    = sdrRows.length > 0 ? aggregateSdr(sdrRows) : null

  const allRows: Array<FonteData & { isSdrParent?: boolean; isSdrChild?: boolean }> = []
  const combined = sdrAgg
    ? [...otherRows, { ...sdrAgg, isSdrParent: true }].sort((a, b) => b.captacoes - a.captacoes)
    : otherRows.sort((a, b) => b.captacoes - a.captacoes)

  for (const row of combined) {
    allRows.push(row)
    if ((row as any).isSdrParent && sdrOpen) {
      const sorted = [...sdrRows].sort((a, b) => b.captacoes - a.captacoes)
      sorted.forEach(r => allRows.push({ ...r, isSdrChild: true }))
    }
  }

  const maxConversao = Math.max(...data.map(d => d.conversao), sdrAgg?.conversao ?? 0, 1)

  const colH: React.CSSProperties = {
    padding: '8px 14px', fontSize: 11, fontWeight: 600,
    color: 'var(--text-subtle)', textTransform: 'uppercase',
    letterSpacing: '0.04em', borderBottom: '1px solid var(--border)', textAlign: 'left',
  }

  function renderRow(row: FonteData & { isSdrParent?: boolean; isSdrChild?: boolean }, i: number) {
    const col: React.CSSProperties = {
      padding: '10px 14px', fontSize: 13, color: 'var(--text-2)',
      borderBottom: '1px solid var(--border)',
      background: row.isSdrChild ? 'var(--bg-subtle)' : i % 2 === 1 ? 'var(--bg-subtle)' : 'transparent',
    }

    return (
      <tr key={row.isSdrChild ? `sdr-child-${row.fonte}` : row.fonte}>
        <td style={{ ...col, fontWeight: row.isSdrParent ? 700 : row.isSdrChild ? 400 : 500, color: 'var(--text-1)', paddingLeft: row.isSdrChild ? 32 : 14 }}>
          {row.isSdrParent ? (
            <button
              onClick={() => setSdrOpen(o => !o)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-1)', fontSize: 13, fontWeight: 700 }}
            >
              {sdrOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              SDR
            </button>
          ) : row.isSdrChild ? (
            <span style={{ color: 'var(--text-2)' }}>{row.fonte}</span>
          ) : row.fonte}
        </td>
        <td style={{ ...col, textAlign: 'right' }}>{row.captacoes}</td>
        <td style={{ ...col, textAlign: 'right', color: '#059669', fontWeight: 600 }}>{row.vendas}</td>
        <td style={{ ...col, textAlign: 'right', color: '#EF4444' }}>{row.cancelados}</td>
        <td style={{ ...col }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                width: `${(row.conversao / maxConversao) * 100}%`,
                height: '100%',
                background: row.conversao >= 30 ? '#059669' : row.conversao >= 15 ? '#F59E0B' : '#3B82F6',
                borderRadius: 3, transition: 'width 400ms ease',
              }} />
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', minWidth: 36, textAlign: 'right' }}>
              {row.conversao}%
            </span>
          </div>
        </td>
      </tr>
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
