import { useEffect, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import api from '../api'
import CurrencyInput from './CurrencyInput'

export interface EmissaoPayload { operadora: string; valor: string; observacao: string }

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--text-2)', margin: '0 0 6px' }
const hintStyle: React.CSSProperties = { margin: '6px 0 0', fontSize: 11.5, color: 'var(--text-muted)' }

// Janela "Enviar para emissão": pede a operadora (uma só, escolhida num seletor
// que abre como acordeão -- são muitas) e confirma o valor do contrato, que já
// vem com o valor da cotação mas pode ser ajustado.
export default function EmissaoModal({ leadName, statusLabel, defaultValor, saving, onConfirm, onCancel }: {
  leadName: string
  statusLabel: string
  defaultValor: string
  saving: boolean
  onConfirm: (p: EmissaoPayload) => void
  onCancel: () => void
}) {
  const [operadoras, setOperadoras] = useState<string[]>([])
  const [loadError, setLoadError] = useState(false)
  const [operadora, setOperadora] = useState('')
  const [pickerOpen, setPickerOpen] = useState(true)
  const [valor, setValor] = useState(defaultValor)
  const [observacao, setObservacao] = useState('')

  useEffect(() => {
    api.get<string[]>('/api/v1/leads/operadoras-emissao')
      .then(r => setOperadoras(r.data))
      .catch(() => setLoadError(true))
  }, [])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onCancel() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onCancel, saving])

  const canConfirm = !!operadora && !saving

  return (
    <div
      onClick={() => { if (!saving) onCancel() }}
      style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        role="dialog" aria-modal="true" aria-labelledby="emissao-titulo"
        onClick={e => e.stopPropagation()}
        style={{ width: 'min(520px, 100%)', maxHeight: '100%', overflowY: 'auto', background: 'var(--bg-card)', borderRadius: 16, boxShadow: '0 24px 60px rgba(15,23,42,0.28)', padding: '26px 28px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}
      >
        <div>
          <h2 id="emissao-titulo" style={{ margin: '0 0 6px', fontSize: 19, fontWeight: 800, color: 'var(--text-1)' }}>Enviar para emissão</h2>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
            {leadName} · hoje em <b style={{ color: 'var(--text-2)' }}>{statusLabel}</b>
          </p>
        </div>

        <div>
          <span style={labelStyle}>Operadora da emissão <span style={{ color: '#DC2626' }}>*</span></span>
          <button
            type="button"
            onClick={() => setPickerOpen(o => !o)}
            aria-expanded={pickerOpen}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
              padding: '10px 14px', borderRadius: 10, fontFamily: 'inherit', fontSize: 14, cursor: 'pointer',
              border: `1px solid ${pickerOpen ? 'var(--accent)' : 'var(--border-in)'}`, background: 'var(--bg-input)',
              color: operadora ? 'var(--text-1)' : 'var(--text-muted)', textAlign: 'left',
            }}
          >
            <span style={{ fontWeight: operadora ? 600 : 400 }}>{operadora || 'Selecione a operadora'}</span>
            <ChevronDown size={16} style={{ flexShrink: 0, transform: pickerOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
          </button>
          {pickerOpen && (
            <div style={{ marginTop: 8, maxHeight: 210, overflowY: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, padding: 8, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-subtle)' }}>
              {loadError && <p style={{ gridColumn: '1 / -1', margin: 0, fontSize: 12.5, color: '#DC2626' }}>Não foi possível carregar as operadoras.</p>}
              {operadoras.map(op => {
                const active = op === operadora
                return (
                  <button
                    key={op} type="button" aria-pressed={active}
                    onClick={() => { setOperadora(op); setPickerOpen(false) }}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
                      padding: '9px 12px', borderRadius: 8, fontFamily: 'inherit', fontSize: 13, cursor: 'pointer', textAlign: 'left',
                      border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                      background: active ? 'var(--accent-weak, #EFF6FF)' : 'var(--bg-card)',
                      color: active ? 'var(--accent)' : 'var(--text-2)', fontWeight: active ? 700 : 500,
                    }}
                  >
                    {op}{active && <Check size={14} />}
                  </button>
                )
              })}
            </div>
          )}
          <p style={hintStyle}>A operadora que vai emitir o contrato. Escolha uma só.</p>
        </div>

        <div>
          <label htmlFor="emissao-valor" style={labelStyle}>Valor do contrato</label>
          <div id="emissao-valor"><CurrencyInput value={valor} onChange={setValor} width={200} /></div>
          <p style={hintStyle}>Já vem com o valor da cotação. Ajuste se o contrato fechou diferente.</p>
        </div>

        <div>
          <label htmlFor="emissao-obs" style={labelStyle}>Observação <span style={{ fontWeight: 500, color: 'var(--text-subtle)' }}>(opcional)</span></label>
          <textarea
            id="emissao-obs" value={observacao} onChange={e => setObservacao(e.target.value)} rows={2}
            placeholder="Ex.: documentos conferidos, vigência 01/10"
            style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-in)', background: 'var(--bg-input)', color: 'var(--text-2)', fontFamily: 'inherit', fontSize: 13, resize: 'vertical' }}
          />
        </div>

        <p style={{ margin: 0, padding: '10px 12px', borderRadius: 10, background: 'rgba(8,145,178,0.10)', color: 'var(--text-2)', fontSize: 12.5, lineHeight: 1.55 }}>
          Ao confirmar, o lead passa para <b>Emissão</b> e o envio entra no indicador do dia, em seu nome.
        </p>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            type="button" onClick={onCancel} disabled={saving}
            style={{ padding: '10px 18px', borderRadius: 9, border: '1px solid var(--border-in)', background: 'var(--bg-card)', color: 'var(--text-2)', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}
          >
            Cancelar
          </button>
          <button
            type="button" disabled={!canConfirm}
            onClick={() => onConfirm({ operadora, valor, observacao })}
            style={{ padding: '10px 20px', borderRadius: 9, border: 'none', background: canConfirm ? '#0E7490' : '#9CA3AF', color: '#fff', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: canConfirm ? 'pointer' : 'not-allowed' }}
          >
            {saving ? 'Enviando…' : 'Confirmar envio'}
          </button>
        </div>
      </div>
    </div>
  )
}
