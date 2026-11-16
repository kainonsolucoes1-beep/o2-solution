import { useEffect, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import api from '../api'
import CurrencyInput from './CurrencyInput'
import Combobox from './Combobox'

// dados do contrato (16/11/2026): vão pro envio e, os que a ficha também tem, pro lead
export interface EmissaoContrato {
  modalidade: string; documento: string; razao_social?: string; categoria: string
  acomodacao: string; coparticipacao: string; reducao_carencia: string
}
export interface EmissaoPayload { operadora: string; valor: string; observacao: string; promotora: string; contrato: EmissaoContrato }

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--text-2)', margin: '0 0 6px' }
const hintStyle: React.CSSProperties = { margin: '6px 0 0', fontSize: 11.5, color: 'var(--text-muted)' }
const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-in)', background: 'var(--bg-input)', color: 'var(--text-1)', fontFamily: 'inherit', fontSize: 14 }
const Req = () => <span style={{ color: '#DC2626' }}>*</span>

const ACOMODACAO = ['Enfermaria', 'Apartamento']
const COPARTICIPACAO = ['Com', 'Sem', 'Parcial']
const CARENCIA = ['Sim', 'Não']

const digitos = (s: string) => s.replace(/\D/g, '')
// 000.000.000-00 (CPF) ou 00.000.000/0000-00 (CNPJ), conforme a quantidade de dígitos
function mascaraDoc(s: string): string {
  const d = digitos(s).slice(0, 14)
  if (d.length <= 11) return d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2')
  return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}

function Opcoes({ value, onChange, options, label }: { value: string; onChange: (v: string) => void; options: string[]; label: string }) {
  return (
    <div role="group" aria-label={label} style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {options.map(op => {
        const active = op === value
        return (
          <button
            key={op} type="button" aria-pressed={active} onClick={() => onChange(op)}
            style={{
              padding: '8px 14px', borderRadius: 8, fontFamily: 'inherit', fontSize: 13, cursor: 'pointer',
              border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
              background: active ? 'var(--accent-weak, #EFF6FF)' : 'var(--bg-card)',
              color: active ? 'var(--accent)' : 'var(--text-2)', fontWeight: active ? 700 : 500,
            }}
          >
            {op}
          </button>
        )
      })}
    </div>
  )
}

// Janela "Enviar para emissão": operadora (uma só, num seletor que abre como
// acordeão -- são muitas), dados do contrato e o valor, que já vem com o valor
// da cotação mas pode ser ajustado. Vem preenchida com o que a ficha já tem.
export default function EmissaoModal({ leadId, leadName, statusLabel, defaultValor, saving, onConfirm, onCancel }: {
  leadId: string
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
  const [promotora, setPromotora] = useState('')
  const [promotoras, setPromotoras] = useState<string[]>([])
  const [modalidades, setModalidades] = useState<string[]>([])
  const [categorias, setCategorias] = useState<string[]>([])
  const [modalidade, setModalidade] = useState('')
  const [documento, setDocumento] = useState('')
  const [razaoSocial, setRazaoSocial] = useState('')
  const [categoria, setCategoria] = useState('')
  const [acomodacao, setAcomodacao] = useState('')
  const [coparticipacao, setCoparticipacao] = useState('')
  const [carencia, setCarencia] = useState('')

  useEffect(() => {
    api.get<string[]>('/api/v1/leads/operadoras-emissao')
      .then(r => setOperadoras(r.data))
      .catch(() => setLoadError(true))
    api.get<string[]>('/api/v1/macro/promotoras').then(r => setPromotoras(r.data)).catch(() => {})
    api.get<string[]>('/api/v1/leads/modalidades').then(r => setModalidades(r.data)).catch(() => {})
    api.get<string[]>('/api/v1/leads/categorias').then(r => setCategorias(r.data)).catch(() => {})
    // pré-preenche com a ficha
    api.get<{ modalidade: string | null; document: string | null; company: string | null; categoria: string | null }>(`/api/v1/leads/${leadId}`)
      .then(({ data: l }) => {
        if (l.modalidade) setModalidade(m => m || l.modalidade!)
        if (l.document) setDocumento(d => d || mascaraDoc(l.document!))
        if (l.company) setRazaoSocial(r => r || l.company!)
        if (l.categoria) setCategoria(c => c || l.categoria!)
      })
      .catch(() => {})
  }, [leadId])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onCancel() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onCancel, saving])

  const doc = digitos(documento)
  const ehCnpj = doc.length > 11
  const docOk = doc.length === 11 || doc.length === 14
  const faltando = [
    !modalidade && 'modalidade', !docOk && 'CNPJ ou CPF', ehCnpj && !razaoSocial.trim() && 'razão social',
    !operadora && 'operadora', !categoria.trim() && 'categoria', !acomodacao && 'acomodação',
    !coparticipacao && 'coparticipação', !carencia && 'redução de carências', !valor.trim() && 'valor',
  ].filter(Boolean) as string[]
  const canConfirm = faltando.length === 0 && !saving
  const opcoesModalidade = modalidade && !modalidades.includes(modalidade) ? [...modalidades, modalidade] : modalidades

  return (
    <div
      onClick={() => { if (!saving) onCancel() }}
      style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        role="dialog" aria-modal="true" aria-labelledby="emissao-titulo"
        onClick={e => e.stopPropagation()}
        style={{ width: 'min(560px, 100%)', maxHeight: '100%', overflowY: 'auto', background: 'var(--bg-card)', borderRadius: 16, boxShadow: '0 24px 60px rgba(15,23,42,0.28)', padding: '26px 28px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}
      >
        <div>
          <h2 id="emissao-titulo" style={{ margin: '0 0 6px', fontSize: 19, fontWeight: 800, color: 'var(--text-1)' }}>Enviar para emissão</h2>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
            {leadName} · hoje em <b style={{ color: 'var(--text-2)' }}>{statusLabel}</b>
          </p>
        </div>

        <div>
          <span style={labelStyle}>Modalidade <Req /></span>
          <Opcoes value={modalidade} onChange={setModalidade} options={opcoesModalidade} label="Modalidade" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: ehCnpj ? 'minmax(0, 1fr) minmax(0, 1.3fr)' : '1fr', gap: 12 }}>
          <div>
            <label htmlFor="emissao-doc" style={labelStyle}>CNPJ ou CPF <Req /></label>
            <input
              id="emissao-doc" value={documento} inputMode="numeric" placeholder="Só os números"
              onChange={e => setDocumento(mascaraDoc(e.target.value))} style={{ ...inputStyle, fontVariantNumeric: 'tabular-nums' }}
            />
            {doc.length > 0 && !docOk && <p style={{ ...hintStyle, color: '#DC2626' }}>CPF tem 11 dígitos e CNPJ tem 14.</p>}
          </div>
          {ehCnpj && (
            <div>
              <label htmlFor="emissao-razao" style={labelStyle}>Razão social <Req /></label>
              <input id="emissao-razao" value={razaoSocial} onChange={e => setRazaoSocial(e.target.value)} style={inputStyle} />
            </div>
          )}
        </div>

        <div>
          <span style={labelStyle}>Operadora / seguradora <Req /></span>
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
          <span style={labelStyle}>Categoria <Req /></span>
          <Combobox value={categoria} onChange={setCategoria} options={categorias} placeholder="Ex.: nome do plano / produto" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
          <div>
            <span style={labelStyle}>Acomodação <Req /></span>
            <Opcoes value={acomodacao} onChange={setAcomodacao} options={ACOMODACAO} label="Acomodação" />
          </div>
          <div>
            <span style={labelStyle}>Coparticipação <Req /></span>
            <Opcoes value={coparticipacao} onChange={setCoparticipacao} options={COPARTICIPACAO} label="Coparticipação" />
          </div>
          <div>
            <span style={labelStyle}>Redução de carências <Req /></span>
            <Opcoes value={carencia} onChange={setCarencia} options={CARENCIA} label="Redução de carências" />
          </div>
        </div>

        <div>
          <label htmlFor="emissao-valor" style={labelStyle}>Valor do contrato <Req /></label>
          <div id="emissao-valor"><CurrencyInput value={valor} onChange={setValor} width={200} /></div>
          <p style={hintStyle}>Já vem com o valor da cotação. Ajuste se o contrato fechou diferente.</p>
        </div>

        <div>
          <span style={labelStyle}>Promotora <span style={{ fontWeight: 500, color: 'var(--text-subtle)' }}>(opcional)</span></span>
          <Combobox value={promotora} onChange={setPromotora} options={promotoras} placeholder="Ex.: Bliss, Multinotas" />
          <p style={hintStyle}>Quem intermedeia o contrato. Pode ser preenchida depois, reabrindo esta janela.</p>
        </div>

        <div>
          <label htmlFor="emissao-obs" style={labelStyle}>Observação <span style={{ fontWeight: 500, color: 'var(--text-subtle)' }}>(opcional)</span></label>
          <textarea
            id="emissao-obs" value={observacao} onChange={e => setObservacao(e.target.value)} rows={2}
            placeholder="Ex.: documentos conferidos, vigência 01/10"
            style={{ ...inputStyle, color: 'var(--text-2)', fontSize: 13, resize: 'vertical' }}
          />
        </div>

        <p style={{ margin: 0, padding: '10px 12px', borderRadius: 10, background: 'rgba(8,145,178,0.10)', color: 'var(--text-2)', fontSize: 12.5, lineHeight: 1.55 }}>
          Ao confirmar, o lead passa para <b>Emissão</b>, o envio entra no indicador do dia, em seu nome, e a ficha é atualizada com modalidade, CNPJ/CPF, razão social e categoria.
        </p>

        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {faltando.length > 0 && !saving && (
            <span style={{ marginRight: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>Falta: {faltando.join(', ')}</span>
          )}
          <button
            type="button" onClick={onCancel} disabled={saving}
            style={{ padding: '10px 18px', borderRadius: 9, border: '1px solid var(--border-in)', background: 'var(--bg-card)', color: 'var(--text-2)', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}
          >
            Cancelar
          </button>
          <button
            type="button" disabled={!canConfirm}
            onClick={() => onConfirm({
              operadora, valor, observacao, promotora,
              contrato: {
                modalidade, documento: doc, ...(ehCnpj ? { razao_social: razaoSocial.trim() } : {}),
                categoria: categoria.trim(), acomodacao, coparticipacao, reducao_carencia: carencia,
              },
            })}
            style={{ padding: '10px 20px', borderRadius: 9, border: 'none', background: canConfirm ? '#0E7490' : '#9CA3AF', color: '#fff', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: canConfirm ? 'pointer' : 'not-allowed' }}
          >
            {saving ? 'Enviando…' : 'Confirmar envio'}
          </button>
        </div>
      </div>
    </div>
  )
}
