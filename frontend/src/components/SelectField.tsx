export default function SelectField({ label, value, options, onChange, saving }: { label: string; value: string; options: string[]; onChange: (v: string) => void; saving?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--text-3b)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </span>
      <select
        value={value}
        disabled={saving}
        onChange={e => onChange(e.target.value)}
        style={{ fontSize: 13, padding: '7px 9px', borderRadius: 8, border: '1px solid var(--border-in)', background: 'var(--bg-input)', color: 'var(--text-2)', width: '100%', boxSizing: 'border-box', height: 34, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}
      >
        {!options.includes(value) && <option value={value}>{value || '—'}</option>}
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}
