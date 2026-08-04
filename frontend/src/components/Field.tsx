export default function Field({ label, value, small }: { label: string; value: string; small?: boolean }) {
  const empty = value === '—' || value === 'Não informado' || value === 'Não definido'
  return (
    <div className="flex flex-col gap-1">
      <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--text-3b)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </span>
      <span style={{ fontSize: small ? 12.5 : 14, color: empty ? 'var(--text-subtle)' : 'var(--text-1)', fontWeight: empty ? 400 : 600 }}>
        {value}
      </span>
    </div>
  )
}
