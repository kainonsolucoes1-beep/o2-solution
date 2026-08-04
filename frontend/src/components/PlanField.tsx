function _normalizePlan(v: string) {
  return v.trim().toLowerCase()
}

export default function PlanField({ value }: { value: string | null }) {
  const semPlano = value != null && _normalizePlan(value) === 'não possui plano'
  return (
    <div className="flex flex-col gap-1">
      <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--text-3b)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Plano Atual
      </span>
      {!value ? (
        <span style={{ fontSize: 13.5, color: 'var(--text-subtle)', fontStyle: 'normal' }}>Não informado</span>
      ) : semPlano ? (
        <span style={{ display: 'inline-flex', alignSelf: 'flex-start', background: 'rgba(220,38,38,0.12)', color: '#DC2626', padding: '2px 10px', borderRadius: 99, fontSize: 12, fontWeight: 700 }}>
          Não possui plano
        </span>
      ) : (
        <span style={{ fontSize: 13.5, color: 'var(--text-2)', fontWeight: 500 }}>{value}</span>
      )}
    </div>
  )
}
