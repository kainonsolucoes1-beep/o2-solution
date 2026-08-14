import { useState } from 'react'
import {
  LineChart, Line, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

export interface TrendPoint {
  x: string | number
  captacoes: number
  vendas: number
}

interface TrendChartProps {
  title: string
  subtitleDia: string
  subtitleMes: string
  daily: TrendPoint[]
  monthly: TrendPoint[]
  height?: number
}

const legendFmt = (v: string) => (v === 'captacoes' ? 'Captações' : 'Vendas')
const tooltipFmt = (val: number, name: string): [number, string] => [val, legendFmt(name)]

// Um so grafico pra Evolucao Diaria + Comparativo Mensal, com toggle de
// periodo. Linha reta (nao curva) pra nao distorcer valores baixos; quando o
// maior valor do periodo e' bem pequeno (<=3), barras leem melhor que linha.
export default function TrendChart({ title, subtitleDia, subtitleMes, daily, monthly, height = 200 }: TrendChartProps) {
  const [mode, setMode] = useState<'dia' | 'mes'>('dia')
  const data = mode === 'dia' ? daily : monthly
  const maxVal = Math.max(0, ...data.map(d => Math.max(d.captacoes, d.vendas)))
  const useBars = maxVal > 0 && maxVal <= 3

  return (
    <div className="bg-white rounded-xl" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)', padding: '20px 20px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>{title}</p>
          <p style={{ fontSize: 11, color: 'var(--text-subtle)', margin: '2px 0 0' }}>{mode === 'dia' ? subtitleDia : subtitleMes}</p>
        </div>
        <div style={{ display: 'flex', gap: 2, border: '1px solid var(--border)', borderRadius: 7, padding: 2, background: 'var(--bg-subtle)', flexShrink: 0 }}>
          {(['dia', 'mes'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                padding: '4px 11px', borderRadius: 5, border: 'none', fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
                background: mode === m ? 'var(--bg-card)' : 'transparent',
                color: mode === m ? '#2563EB' : 'var(--text-muted)',
                boxShadow: mode === m ? '0 1px 2px rgba(15,23,42,.08)' : 'none',
              }}
            >
              {m === 'dia' ? 'Dia' : 'Mês'}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        {useBars ? (
          <BarChart data={data} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
            <XAxis dataKey="x" tick={{ fontSize: 10, fill: '#94A3B8' }} />
            <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} allowDecimals={false} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }} formatter={tooltipFmt} />
            <Legend formatter={legendFmt} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="captacoes" fill="#3B82F6" radius={[4, 4, 0, 0]} maxBarSize={28} />
            <Bar dataKey="vendas" fill="#10B981" radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        ) : (
          <LineChart data={data} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
            <XAxis dataKey="x" tick={{ fontSize: 10, fill: '#94A3B8' }} interval={mode === 'dia' ? 4 : 0} />
            <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }} formatter={tooltipFmt} />
            <Legend formatter={legendFmt} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
            <Line type="linear" dataKey="captacoes" stroke="#3B82F6" strokeWidth={2} dot={false} />
            <Line type="linear" dataKey="vendas" stroke="#10B981" strokeWidth={2} dot={false} />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}