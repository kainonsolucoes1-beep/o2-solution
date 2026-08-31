import { useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'

// Cartão colapsável da tela de Configurações. Fechado: título + resumo de 1
// linha (+ ponto de status opcional). Aberto: o conteúdo.
export default function Accordion({
  title, summary, statusColor, defaultOpen = false, right, children,
}: {
  title: string
  summary?: ReactNode
  statusColor?: string
  defaultOpen?: boolean
  right?: ReactNode
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
      overflow: 'hidden', boxShadow: '0 1px 3px rgba(15,23,42,0.05)',
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 11,
          padding: '13px 15px', background: 'none', border: 'none', cursor: 'pointer',
          textAlign: 'left', fontFamily: 'inherit',
        }}
      >
        {statusColor && <span style={{ width: 7, height: 7, borderRadius: 999, background: statusColor, flexShrink: 0 }} />}
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>{title}</span>
        {summary != null && (
          <span style={{ fontSize: 12.5, color: 'var(--text-muted)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {summary}
          </span>
        )}
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          {right}
          <ChevronRight
            size={16}
            style={{ color: 'var(--text-subtle)', transition: 'transform 180ms ease', transform: open ? 'rotate(90deg)' : 'none' }}
          />
        </span>
      </button>
      {open && (
        <div style={{ borderTop: '1px solid var(--border-lt)', padding: '16px 16px 18px', background: 'var(--bg-subtle)' }}>
          {children}
        </div>
      )}
    </div>
  )
}
