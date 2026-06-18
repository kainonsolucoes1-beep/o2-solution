export const STATUS_LABEL: Record<string, string> = {
  novo: 'Novo', new: 'Novo', pending: 'Novo',
  qualificado: 'Qualificado', qualified: 'Qualificado',
  scheduled: 'Agendado',
  proposta: 'Proposta enviada', proposal_sent: 'Proposta enviada',
  negociacao: 'Negociação',
  fechado: 'Fechado',
  convertido: 'Convertido',
  sale_not_performed: 'Não realizada',
}

export function statusLabel(s: string | null | undefined): string {
  if (!s) return '—'
  return STATUS_LABEL[s.toLowerCase()] ?? s
}
