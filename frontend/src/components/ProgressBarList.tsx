import type { ReactNode } from 'react'

export interface ProgressBarItem {
  key: string
  label: string
  count: number
  color?: string
  extra?: ReactNode
  expanded?: boolean
  onToggle?: () => void
  renderExpanded?: () => ReactNode
}

interface ProgressBarListProps {
  title: string
  subtitle?: string
  items: ProgressBarItem[]
  emptyMessage?: string
}

const DEFAULT_COLOR = '#3B82F6'

// Lista com barra de progresso reutilizada por Origens de Captacao e
// Modalidade: mesma estrutura visual (label, contagem/extra, barra). Origens
// precisa de expansao com conteudo proprio (sub-origens, pontos de
// conversao) -- isso continua vivendo no componente pai e e' passado via
// `renderExpanded`, pra nao forcar Modalidade a carregar essa complexidade.
export default function ProgressBarList({ title, subtitle, items, emptyMessage }: ProgressBarListProps) {
  const max = Math.max(1, ...items.map(i => i.count))

  return (
    <div className="bg-white rounded-xl" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)', padding: '20px 20px 16px' }}>
      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', margin: '0 0 4px' }}>{title}</p>
      {subtitle && <p style={{ fontSize: 11, color: 'var(--text-subtle)', margin: '0 0 20px' }}>{subtitle}</p>}
      {items.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>
          {emptyMessage ?? 'Nenhum dado neste período'}
        </p>
      ) : (
        items.map(item => {
          const color = item.color ?? DEFAULT_COLOR
          const barW = Math.max((item.count / max) * 100, 2)
          const isExpandable = !!item.renderExpanded
          const Row = (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }}>{item.label}</span>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                {item.extra}
                <span style={{ fontSize: 12, fontWeight: 700, color }}>{item.count}</span>
              </div>
            </div>
          )
          const Bar = (
            <div style={{ background: '#F1F5F9', borderRadius: 4, height: 6, overflow: 'hidden' }}>
              <div style={{ width: `${barW}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 400ms ease' }} />
            </div>
          )
          if (!isExpandable) {
            return <div key={item.key} style={{ marginBottom: 10 }}>{Row}{Bar}</div>
          }
          return (
            <div key={item.key} style={{ marginBottom: 10 }}>
              <button
                onClick={item.onToggle}
                style={{
                  width: '100%', textAlign: 'left', cursor: 'pointer',
                  background: item.expanded ? color + '10' : 'transparent',
                  border: `1px solid ${item.expanded ? color + '40' : 'var(--border)'}`,
                  borderRadius: 10, padding: '10px 14px', transition: 'all 150ms',
                }}
              >
                {Row}
                {Bar}
              </button>
              {item.expanded && (
                <div style={{ marginTop: 6, padding: '12px 14px', background: '#F8FAFC', borderRadius: 10, border: '1px solid var(--border)' }}>
                  {item.renderExpanded!()}
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}