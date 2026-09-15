import FieldLabel from './FieldLabel'

export default function SelectField({ label, value, options, onChange, saving, formatOption }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void; saving?: boolean
  /** Formata só a exibição de cada opção (ex: titleCase) -- o valor gravado/enviado continua o original.
   * Sem isso teria como "quebrar" siglas fixas tipo Modalidade (PME/PF/PJ), então fica opt-in por campo. */
  formatOption?: (v: string) => string
}) {
  const display = (v: string) => formatOption ? formatOption(v) : v
  return (
    <div className="flex flex-col gap-1">
      <FieldLabel>{label}</FieldLabel>
      <select
        value={value}
        disabled={saving}
        onChange={e => onChange(e.target.value)}
        style={{ fontSize: 14, padding: '7px 9px', borderRadius: 8, border: '1px solid var(--border-in)', background: 'var(--bg-input)', color: 'var(--text-2)', width: '100%', boxSizing: 'border-box', height: 34, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}
      >
        {!options.includes(value) && <option value={value}>{value ? display(value) : '—'}</option>}
        {options.map(o => <option key={o} value={o}>{display(o)}</option>)}
      </select>
    </div>
  )
}
