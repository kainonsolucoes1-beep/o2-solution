export default function Field({ label, value }: { label: string; value: string }) {
  const empty = value === '—' || value === 'Não informado' || value === 'Não definido' || value === 'Nada agendado'
  return (
    <div className="flex flex-col gap-1">
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </span>
      <span style={{ fontSize: 14, lineHeight: '20px', color: empty ? 'var(--text-subtle)' : 'var(--text-1)', fontWeight: empty ? 400 : 600 }}>
        {value}
      </span>
    </div>
  )
}
