export default function CurrencyInput({
  value, onChange, autoFocus, width,
}: {
  value: string
  onChange: (v: string) => void
  autoFocus?: boolean
  width?: number
}) {
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, '')
    if (!digits) { onChange(''); return }
    const cents = parseInt(digits, 10)
    onChange((cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
  }

  return (
    <div style={{ position: 'relative', width: width ?? 130 }}>
      <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: 'var(--text-muted)', pointerEvents: 'none' }}>
        R$
      </span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={handleChange}
        placeholder="0,00"
        autoFocus={autoFocus}
        style={{
          padding: '6px 9px 6px 30px', height: 34, borderRadius: 8, border: '1px solid var(--border-in)',
          fontSize: 13, color: 'var(--text-2)', background: 'var(--bg-input)', boxSizing: 'border-box', width: '100%',
        }}
      />
    </div>
  )
}
