import { Clock3 } from 'lucide-react'
import SectionCard from './SectionCard'
import Field from './Field'

export default function LeadCurrentStatusPanel({
  attendantLabel, lastInteractionLabel, funnelTimeLabel, scheduleLabel,
  interactionsLabel, lastChangeLabel, statusDurationLabel,
  retrabalhadoEmLabel,
}: {
  attendantLabel: string
  lastInteractionLabel: string
  funnelTimeLabel: string
  scheduleLabel: string
  interactionsLabel: string
  lastChangeLabel: string
  statusDurationLabel: string | null
  retrabalhadoEmLabel?: string | null
}) {
  return (
    <SectionCard title="Situação atual" icon={Clock3}>
      <div className="flex flex-col gap-4">
        <Field label="Responsável" value={attendantLabel} />
        <Field label="Última interação" value={lastInteractionLabel} />
        <Field label="Tempo no funil" value={funnelTimeLabel} />
        {statusDurationLabel && <Field label="Tempo no status atual" value={statusDurationLabel} />}
        <Field label="Agendamento" value={scheduleLabel} />
        <Field label="Interações" value={interactionsLabel} />
        <Field label="Última alteração" value={lastChangeLabel} />
        {retrabalhadoEmLabel && <Field label="Retrabalhado em" value={retrabalhadoEmLabel} />}
      </div>
    </SectionCard>
  )
}
