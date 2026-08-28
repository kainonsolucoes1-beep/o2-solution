import FieldLabel from './FieldLabel'
import Pill from './Pill'

function _normalizePlan(v: string) {
  return v.trim().toLowerCase()
}

export default function PlanField({ value }: { value: string | null }) {
  const semPlano = value != null && _normalizePlan(value) === 'não possui plano'
  return (
    <div className="flex flex-col gap-1">
      <FieldLabel>Plano atual</FieldLabel>
      {!value ? (
        <span style={{ fontSize: 14, lineHeight: '20px', color: 'var(--text-subtle)', fontWeight: 400 }}>Não informado</span>
      ) : semPlano ? (
        <Pill tone="danger">Não possui plano</Pill>
      ) : (
        <span style={{ fontSize: 14, lineHeight: '20px', color: 'var(--text-1)', fontWeight: 600 }}>{value}</span>
      )}
    </div>
  )
}
