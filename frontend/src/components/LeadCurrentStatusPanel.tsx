import { Clock3 } from 'lucide-react'
import SectionCard from './SectionCard'
import Field from './Field'

export default function LeadCurrentStatusPanel({
  lastInteractionLabel, daysSinceInteraction, scheduleLabel, statusDurationLabel, lostReasonLabel,
}: {
  lastInteractionLabel: string
  daysSinceInteraction?: number | null
  scheduleLabel: string
  statusDurationLabel: string | null
  lostReasonLabel?: string | null
}) {
  const d = daysSinceInteraction
  const tone = d == null ? 'neutral' : d <= 2 ? 'ok' : d <= 7 ? 'warn' : 'danger'
  const color = { ok: 'var(--success)', warn: 'var(--warning)', danger: 'var(--danger)', neutral: 'var(--text-1)' }[tone]
  const hasSchedule = !!scheduleLabel && scheduleLabel !== 'Nada agendado'

  let verdict = ''
  if (!lostReasonLabel && d != null) {
    if (hasSchedule) verdict = `Retorno agendado · ${scheduleLabel}`
    else if (d <= 2) verdict = 'Contato recente'
    else if (d <= 7) verdict = 'Sem contato recente · nada agendado'
    else verdict = 'Esfriando · nada agendado'
  }

  return (
    <SectionCard title="Situação atual" icon={Clock3}>
      <div className="flex flex-col" style={{ gap: 4 }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-subtle)' }}>
          Última interação
        </span>
        <span style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.01em', color }}>
          {lastInteractionLabel}
        </span>
        {verdict && (
          <span style={{ fontSize: 12, fontWeight: 600, color: tone === 'neutral' ? 'var(--text-muted)' : color }}>
            {verdict}
          </span>
        )}
      </div>

      <div style={{ height: 1, background: 'var(--border)', margin: '14px 0' }} />

      <div className="flex flex-col gap-4">
        <Field label="Agendamento" value={scheduleLabel} />
        {statusDurationLabel && <Field label="Tempo no status atual" value={statusDurationLabel} />}
        {lostReasonLabel && <Field label="Motivo da perda" value={lostReasonLabel} />}
      </div>
    </SectionCard>
  )
}
