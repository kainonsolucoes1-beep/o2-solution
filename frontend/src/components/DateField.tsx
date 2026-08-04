export default function DateField({ label, value, onChange, saving }: { label: string; value: string; onChange: (v: string) => void; saving?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.035em' }}>
        {label}
      </span>
      <input
        type="date"
        defaultValue={value}
        disabled={saving}
        onBlur={e => e.target.value && e.target.value !== value && onChange(e.target.value)}
        style={{ fontSize: 13, padding: '6px 9px', borderRadius: 8, border: '1px solid var(--border-in)', background: 'var(--bg-input)', color: 'var(--text-2)', width: '100%', boxSizing: 'border-box', height: 34, cursor: saving ? 'not-allowed' : 'text', opacity: saving ? 0.6 : 1 }}
      />
    </div>
  )
}
