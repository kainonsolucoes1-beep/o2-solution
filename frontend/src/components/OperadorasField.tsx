import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

const OPERADORAS_OPTIONS = [
  'Amil', 'Bradesco', 'Hapvida', 'Medsenior', 'Prevent Senior', 'Trasmontano', 'SulAmérica',
  'Alice', 'Bio Vida', 'Porto Saúde', 'Porto Bairros', 'Select',
]

export default function OperadorasField({ value, saving, onChange }: { value: string | null; saving?: boolean; onChange: (v: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  const selected = new Set((value ?? '').split(',').map(s => s.trim()).filter(Boolean))
  function toggle(op: string) {
    const next = new Set(selected)
    next.has(op) ? next.delete(op) : next.add(op)
    onChange([...next].join(','))
  }
  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={() => setExpanded(v => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
      >
        {expanded ? <ChevronDown size={12} color="var(--text-3b)" /> : <ChevronRight size={12} color="var(--text-3b)" />}
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.035em' }}>
          Operadoras Enviadas{selected.size > 0 ? ` (${selected.size})` : ''}
        </span>
      </button>
      {!expanded && selected.size > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginLeft: 17 }}>
          {[...selected].map(op => (
            <span
              key={op}
              style={{
                fontSize: 12.5, fontWeight: 700, textDecoration: 'underline',
                color: '#2563EB', background: '#EFF6FF', border: '1px solid #BFDBFE',
                borderRadius: 99, padding: '3px 12px',
              }}
            >
              {op}
            </span>
          ))}
        </div>
      )}
      {expanded && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, opacity: saving ? 0.6 : 1, pointerEvents: saving ? 'none' : 'auto' }}>
          {OPERADORAS_OPTIONS.map(op => {
            const active = selected.has(op)
            return (
              <button
                key={op}
                onClick={() => toggle(op)}
                style={{
                  fontSize: 11.5, fontWeight: 600, padding: '4px 11px', borderRadius: 99,
                  border: `1px solid ${active ? '#2563EB' : 'var(--border-in)'}`,
                  background: active ? '#EFF6FF' : 'var(--bg-input)',
                  color: active ? '#2563EB' : 'var(--text-2)',
                  cursor: 'pointer',
                }}
              >
                {op}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
