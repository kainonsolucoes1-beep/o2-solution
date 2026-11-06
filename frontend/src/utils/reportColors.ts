// Cores de status/temperatura do Relatório de Leads (tema .lr-theme, ver
// styles/leads-report-theme.css). São variáveis CSS, então trocam sozinhas
// entre o tema claro e o escuro.

const ST: Record<string, string> = {
  novo: 'var(--lr-st-pendente)', new: 'var(--lr-st-pendente)', pending: 'var(--lr-st-pendente)',
  aguardando_dados: 'var(--lr-st-aguardando)',
  sem_retorno: 'var(--status-sem-retorno)',
  qualificado: 'var(--lr-st-agendado)', qualified: 'var(--lr-st-agendado)', scheduled: 'var(--lr-st-agendado)',
  proposta: 'var(--lr-st-proposta)', proposal_sent: 'var(--lr-st-proposta)', 'proposal sent': 'var(--lr-st-proposta)',
  pendencia: 'var(--lr-st-pendencia)', 'pendência': 'var(--lr-st-pendencia)',
  documentacao_pendente: 'var(--lr-st-docpend)', 'documentação pendente': 'var(--lr-st-docpend)',
  emissao: 'var(--lr-st-emissao)', 'emissão': 'var(--lr-st-emissao)',
  waiting_billing: 'var(--lr-st-fechado)', 'waiting billing': 'var(--lr-st-fechado)',
  sale_performed: 'var(--lr-st-fechado)', 'sale performed': 'var(--lr-st-fechado)',
  fechado: 'var(--lr-st-fechado)', closed: 'var(--lr-st-fechado)', won: 'var(--lr-st-fechado)',
  convertido: 'var(--lr-st-fechado)', converted: 'var(--lr-st-fechado)',
  sale_not_performed: 'var(--lr-st-perdido)', 'sale not performed': 'var(--lr-st-perdido)',
}

export function reportStatusColor(status: string | null | undefined): string {
  if (!status) return 'var(--lr-st-pendente)'
  return ST[status.toLowerCase()] ?? 'var(--lr-st-outro)'
}

const TEMP: Record<string, string> = { quente: 'var(--lr-quente)', morno: 'var(--lr-morno)', frio: 'var(--lr-frio)' }

export function reportPerceptionColor(perception: string | null | undefined): string | null {
  if (!perception) return null
  return TEMP[perception.toLowerCase()] ?? 'var(--lr-st-outro)'
}

// fundo e borda tingidos a partir da cor (funciona com variável CSS)
export const tint = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, transparent)`
