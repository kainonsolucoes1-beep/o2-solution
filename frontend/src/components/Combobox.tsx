import { useEffect, useRef, useState } from 'react'

interface ComboboxProps {
  value: string
  onChange: (value: string) => void
  options: string[]
  placeholder?: string
}

// Input com sugestoes estilizadas -- substitui <input list="..."> (datalist
// nativo), que nao e' estilizavel via CSS e por isso herda o visual cru do
// navegador/SO (sem hover, sem espacamento, cortado no dark mode).
export default function Combobox({ value, onChange, options, placeholder }: ComboboxProps) {
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [])

  const filtered = value.trim()
    ? options.filter(o => o.toLowerCase().includes(value.trim().toLowerCase()))
    : options

  function select(opt: string) {
    onChange(opt)
    setOpen(false)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { setOpen(true); return }
    if (!open) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(h + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)) }
    else if (e.key === 'Enter') { if (filtered[highlight]) { e.preventDefault(); select(filtered[highlight]) } }
    else if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        value={value}
        placeholder={placeholder}
        onChange={e => { onChange(e.target.value); setHighlight(0); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        style={{ color: 'var(--text-2)', width: '100%' }}
      />
      {open && filtered.length > 0 && (
        <div
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 20,
            background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)', maxHeight: 200, overflowY: 'auto', padding: 4,
          }}
        >
          {filtered.map((opt, i) => (
            <div
              key={opt}
              onMouseDown={e => { e.preventDefault(); select(opt) }}
              onMouseEnter={() => setHighlight(i)}
              style={{
                padding: '8px 12px', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                color: 'var(--text-1)', background: i === highlight ? 'var(--bg-hover)' : 'transparent',
              }}
            >
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}