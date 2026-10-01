import { useEffect, useState } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import api from '../api'
import FieldLabel from './FieldLabel'

// reserva caso o cadastro (Configuracoes > Operadoras) nao carregue
const OPERADORAS_OPTIONS = [
  'Amil', 'Bradesco', 'SulAmerica', 'Porto', 'Seguros Unimed', 'Unimed',
  'Trasmontano', 'Alice', 'HapVida', 'NotreDame', 'MedSenior', 'Prevent Senior',
]

export default function OperadorasField({ value, saving, onChange }: { value: string | null; saving?: boolean; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const [cadastro, setCadastro] = useState<string[]>(OPERADORAS_OPTIONS)
  useEffect(() => {
    api.get<string[]>('/api/v1/leads/operadoras-emissao')
      .then(r => { if (r.data.length > 0) setCadastro(r.data) })
      .catch(() => {})
  }, [])
  const selected = new Set((value ?? '').split(',').map(s => s.trim()).filter(Boolean))
  // marcadas num lead antigo com grafia fora do cadastro continuam visiveis
  const cadastroLower = new Set(cadastro.map(o => o.toLowerCase()))
  const options = [...cadastro, ...[...selected].filter(o => !cadastroLower.has(o.toLowerCase()))]
  function toggle(op: string) {
    const next = new Set(selected)
    next.has(op) ? next.delete(op) : next.add(op)
    onChange([...next].join(','))
  }
  const summary = selected.size === 0 ? 'Nenhuma enviada' : [...selected].join(', ')

  return (
    <div className="flex flex-col gap-1" style={{ position: 'relative' }}>
      <FieldLabel>Operadoras enviadas{selected.size > 0 ? ` (${selected.size})` : ''}</FieldLabel>
      <button
        onClick={() => setOpen(v => !v)}
        disabled={saving}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          width: '100%', textAlign: 'left', padding: '9px 12px', borderRadius: 9,
          border: '1px solid var(--border-in)', background: 'var(--bg-input)',
          color: selected.size > 0 ? 'var(--text-1)' : 'var(--text-subtle)',
          fontSize: 13.5, fontFamily: 'inherit', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{summary}</span>
        <ChevronDown size={14} color="var(--text-muted)" style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }} />
      </button>

      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 90 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 100,
            background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10,
            boxShadow: '0 8px 24px rgba(15,23,42,0.14)', maxHeight: 260, overflowY: 'auto', padding: 6,
          }}>
            {options.map(op => {
              const active = selected.has(op)
              return (
                <button
                  key={op}
                  onClick={() => toggle(op)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px', borderRadius: 7,
                    background: active ? 'var(--accent-weak)' : 'none', border: 'none', cursor: 'pointer',
                    fontSize: 13, color: active ? 'var(--accent)' : 'var(--text-2)', fontWeight: active ? 600 : 500, textAlign: 'left',
                  }}
                >
                  <span style={{
                    width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${active ? 'var(--accent)' : 'var(--border-in)'}`,
                    display: 'grid', placeItems: 'center', flexShrink: 0, background: active ? 'var(--accent)' : 'transparent',
                  }}>
                    {active && <Check size={11} color="#fff" strokeWidth={3} />}
                  </span>
                  {op}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
