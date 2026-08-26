function _normalizePlan(v: string) {
  return v.trim().toLowerCase()
}

export default function PlanField({ value }: { value: string | null }) {
  const semPlano = value != null && _normalizePlan(value) === 'não possui plano'
  return (
    <div className="flex flex-col gap-1">
      <span style={{ fontSize: 12, lineHeight: '16px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        Plano Atual
      </span>
      {!value ? (
        <span style={{ fontSize: 14, lineHeight: '20px', color: 'var(--text-subtle)', fontWeight: 400 }}>Não informado</span>
      ) : semPlano ? (
        <span style={{ display: 'inline-flex', alignSelf: 'flex-start', background: 'rgba(220,38,38,0.12)', color: '#DC2626', padding: '2px 10px', borderRadius: 99, fontSize: 12, fontWeight: 700 }}>
          Não possui plano
        </span>
      ) : (
        <span style={{ fontSize: 14, lineHeight: '20px', color: 'var(--text-1)', fontWeight: 600 }}>{value}</span>
      )}
    </div>
  )
}
