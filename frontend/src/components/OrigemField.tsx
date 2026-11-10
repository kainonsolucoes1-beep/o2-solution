import { useState } from 'react'
import FieldLabel from './FieldLabel'

const NOVA = '__nova_origem__'

/** Seletor de Origem com "+ Nova origem…": a pessoa digita uma origem que ainda
 * não existe e ela é gravada no lead. A partir daí a lista (que vem dos leads)
 * já passa a oferecer essa origem pra todo mundo. Se o texto bater com uma
 * origem existente (sem diferenciar maiúscula/acento), usa a existente. */
export default function OrigemField({ value, options, onChange, saving, formatOption }: {
  value: string; options: string[]; onChange: (v: string) => void; saving?: boolean
  formatOption?: (v: string) => string
}) {
  const [criando, setCriando] = useState(false)
  const [texto, setTexto] = useState('')
  const display = (v: string) => formatOption ? formatOption(v) : v
  const base = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()

  const inputStyle = { fontSize: 14, padding: '7px 9px', borderRadius: 8, border: '1px solid var(--border-in)', background: 'var(--bg-input)', color: 'var(--text-2)', width: '100%', boxSizing: 'border-box' as const, height: 34 }

  function confirmar() {
    const t = texto.trim().replace(/\s+/g, ' ')
    if (!t) return
    const existente = options.find(o => base(o) === base(t))
    onChange(existente ?? t)
    setCriando(false)
    setTexto('')
  }

  if (criando) {
    return (
      <div className="flex flex-col gap-1">
        <FieldLabel>Origem</FieldLabel>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            autoFocus
            value={texto}
            onChange={e => setTexto(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') confirmar(); if (e.key === 'Escape') { setCriando(false); setTexto('') } }}
            placeholder="Nome da nova origem"
            maxLength={60}
            style={inputStyle}
          />
          <button
            onClick={confirmar}
            disabled={!texto.trim() || saving}
            style={{ padding: '0 12px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none', background: 'var(--accent)', color: 'var(--accent-contrast)', cursor: texto.trim() ? 'pointer' : 'not-allowed', opacity: texto.trim() ? 1 : 0.5 }}
          >
            Salvar
          </button>
          <button
            onClick={() => { setCriando(false); setTexto('') }}
            style={{ padding: '0 10px', borderRadius: 8, fontSize: 13, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-2)', cursor: 'pointer' }}
          >
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <FieldLabel>Origem</FieldLabel>
      <select
        value={value}
        disabled={saving}
        onChange={e => { if (e.target.value === NOVA) setCriando(true); else onChange(e.target.value) }}
        style={{ ...inputStyle, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}
      >
        {!options.includes(value) && <option value={value}>{value ? display(value) : '—'}</option>}
        {options.map(o => <option key={o} value={o}>{display(o)}</option>)}
        <option value={NOVA}>+ Nova origem…</option>
      </select>
    </div>
  )
}
