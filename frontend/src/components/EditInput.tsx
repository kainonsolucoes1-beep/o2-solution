export default function EditInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--text-3b)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </span>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ fontSize: 13, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-2)', width: '100%', boxSizing: 'border-box' }}
      />
    </div>
  )
}
