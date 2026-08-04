// mesmas cores usadas nos cards do funil (Pipeline.tsx)
export const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  novo:                 { bg: '#EFF6FF', color: '#3B82F6' },
  new:                  { bg: '#EFF6FF', color: '#3B82F6' },
  pending:              { bg: '#EFF6FF', color: '#3B82F6' },
  qualificado:          { bg: '#ECFDF5', color: '#10B981' },
  qualified:            { bg: '#ECFDF5', color: '#10B981' },
  scheduled:            { bg: '#ECFDF5', color: '#10B981' },
  proposta:             { bg: '#FFFBEB', color: '#F59E0B' },
  proposal_sent:        { bg: '#FFFBEB', color: '#F59E0B' },
  'proposal sent':      { bg: '#FFFBEB', color: '#F59E0B' },
  negociacao:           { bg: '#F5F3FF', color: '#8B5CF6' },
  'negociação':         { bg: '#F5F3FF', color: '#8B5CF6' },
  waiting_billing:      { bg: '#ECFDF5', color: '#059669' },
  'waiting billing':    { bg: '#ECFDF5', color: '#059669' },
  fechado:              { bg: '#ECFDF5', color: '#059669' },
  closed:               { bg: '#ECFDF5', color: '#059669' },
  won:                  { bg: '#ECFDF5', color: '#059669' },
  convertido:           { bg: '#ECFDF5', color: '#059669' },
  sale_performed:       { bg: '#ECFDF5', color: '#059669' },
  'sale performed':     { bg: '#ECFDF5', color: '#059669' },
  sale_not_performed:   { bg: '#FEF2F2', color: '#EF4444' },
  'sale not performed': { bg: '#FEF2F2', color: '#EF4444' },
}

export function statusColor(s: string | null) {
  if (!s) return { bg: 'rgba(107,114,128,0.12)', color: '#6B7280' }
  return STATUS_STYLE[s.toLowerCase()] ?? { bg: 'rgba(107,114,128,0.12)', color: '#6B7280' }
}
