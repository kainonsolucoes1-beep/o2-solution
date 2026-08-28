import { Clock3 } from 'lucide-react'
import SectionCard from './SectionCard'
import Field from './Field'

export default function LeadCurrentStatusPanel({
  lastInteractionLabel, scheduleLabel, statusDurationLabel, lostReasonLabel,
}: {
  lastInteractionLabel: string
  scheduleLabel: string
  statusDurationLabel: string | null
  lostReasonLabel?: string | null
}) {
  return (
    <SectionCard title="Situação atual" icon={Clock3}>
      <div className="flex flex-col gap-4">
        <Field label="Última interação" value={lastInteractionLabel} />
        <Field label="Agendamento" value={scheduleLabel} />
        {statusDurationLabel && <Field label="Tempo no status atual" value={statusDurationLabel} />}
        {lostReasonLabel && <Field label="Motivo da perda" value={lostReasonLabel} />}
      </div>
    </SectionCard>
  )
}
