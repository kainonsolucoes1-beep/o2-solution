export const STATUS_LABEL: Record<string, string> = {
  novo: 'Novo', new: 'Novo', pending: 'Novo',
  qualificado: 'Qualificado', qualified: 'Qualificado',
  scheduled: 'Agendado',
  proposta: 'Proposta enviada', proposal_sent: 'Proposta enviada', 'proposal sent': 'Proposta enviada',
  negociacao: 'Negociação', negociação: 'Negociação',
  fechado: 'Fechado', closed: 'Fechado',
  convertido: 'Convertido', converted: 'Convertido',
  sale_not_performed: 'Não realizada', 'sale not performed': 'Não realizada',
}

export function statusLabel(s: string | null | undefined): string {
  if (!s) return '—'
  return STATUS_LABEL[s.toLowerCase()] ?? s
}
