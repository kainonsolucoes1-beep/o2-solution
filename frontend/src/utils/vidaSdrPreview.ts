import api from '../api'
import { statusLabel } from './statusLabel'

export type SmartPreviewId =
  | 'captacoes' | 'em_andamento' | 'vendas' | 'cancelados' | 'conversao' | 'cancellationRate'
  | 'receita_recebida' | 'receita_a_receber' | 'receita_potencial' | 'custo_total'
  | 'ranking' | 'activity'

export interface SmartPreviewRow { title: string; subtitle: string; value?: string; meta?: string; status?: string }
export interface SmartPreview { title: string; description: string; summary: Array<[string, string]>; count?: string; actionLabel: string; target: string | null; rows: SmartPreviewRow[]; simulated?: boolean }

export const EM_ANDAMENTO_STATUSES = 'pending,novo,new,scheduled,qualificado,qualified,proposta,proposal_sent,negociacao'
export const VENDA_STATUSES_CSV = 'waiting_billing,sale_performed,fechado,closed,won,convertido'
export const CANCELADO_STATUS_CSV = 'sale_not_performed'

function fmtBrl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function leadsTarget(origens: string, primeiroLeadEm: string | null, statusFilter?: string) {
  const params = new URLSearchParams({ origem: origens })
  if (primeiroLeadEm) {
    params.set('date_from', primeiroLeadEm.slice(0, 10))
    params.set('date_to', new Date().toISOString().slice(0, 10))
  }
  if (statusFilter) params.set('status', statusFilter)
  return `/leads-report?${params.toString()}`
}

// Indicadores cujo Smart Preview busca registros reais em /api/v1/leads/by-period
// (endpoint já existente, reutilizado sem alteração). Receita potencial e Custo
// total ainda não têm fonte real (ver limitações no handoff) e ficam com
// conteúdo simulado, sinalizado por `simulated: true`.
const ROW_STATUS_FILTER: Partial<Record<SmartPreviewId, string>> = {
  em_andamento: EM_ANDAMENTO_STATUSES,
  vendas: VENDA_STATUSES_CSV,
  cancelados: CANCELADO_STATUS_CSV,
  conversao: VENDA_STATUSES_CSV,
  cancellationRate: CANCELADO_STATUS_CSV,
  receita_recebida: VENDA_STATUSES_CSV,
  receita_a_receber: VENDA_STATUSES_CSV,
}

export function needsRowFetch(id: SmartPreviewId): boolean {
  return id === 'captacoes' || id in ROW_STATUS_FILTER
}

interface LeadRow {
  id: string
  name: string
  status: string | null
  modalidade: string | null
  current_plan: string | null
  created_at: string
  receita_real_recebida: number | null
  receita_real_a_receber: number | null
}

export async function fetchSmartPreviewRows(id: SmartPreviewId, origens: string, primeiroLeadEm: string | null): Promise<SmartPreviewRow[]> {
  const params: Record<string, string | number> = {
    date_from: primeiroLeadEm ? primeiroLeadEm.slice(0, 10) : '2020-01-01',
    date_to: new Date().toISOString().slice(0, 10),
    origem: origens,
    limit: 5,
    page: 1,
  }
  const statusFilter = ROW_STATUS_FILTER[id]
  if (statusFilter) params.status = statusFilter
  const { data } = await api.get<{ leads: LeadRow[] }>('/api/v1/leads/by-period', { params })
  const isFinanceiro = id === 'receita_recebida' || id === 'receita_a_receber'
  return data.leads.map(lead => ({
    title: lead.name,
    subtitle: [lead.modalidade, lead.current_plan].filter(Boolean).join(' · ') || 'Sem modalidade definida',
    value: isFinanceiro ? fmtBrl((id === 'receita_recebida' ? lead.receita_real_recebida : lead.receita_real_a_receber) || 0) : undefined,
    meta: new Date(lead.created_at).toLocaleDateString('pt-BR'),
    status: statusLabel(lead.status),
  }))
}

// Composição simulada — não há endpoint de pipeline aberto nem de custos por
// SDR hoje. Ponto de integração: trocar por dados reais quando existir.
// Valores centralizados aqui e reutilizados no card (VidaSDR.tsx) e no drawer.
const MOCK_POTENCIAL_ITEMS: Array<[string, string, number]> = [
  ['Oportunidade em qualificação', 'Plano Empresarial', 1800],
  ['Oportunidade em proposta', 'Plano Individual', 1100],
  ['Oportunidade em negociação', 'Crédito Consignado', 950],
]
export const MOCK_POTENCIAL_TOTAL = MOCK_POTENCIAL_ITEMS.reduce((sum, [, , v]) => sum + v, 0)
const MOCK_POTENCIAL_ROWS: SmartPreviewRow[] = MOCK_POTENCIAL_ITEMS.map(([title, subtitle, value]) => ({ title, subtitle, value: fmtBrl(value), status: 'Estimado' }))

const MOCK_CUSTO_ITEMS: Array<[string, string, number]> = [
  ['Salário', 'Custo fixo', 2800],
  ['Comissão', 'Custo variável', 340],
  ['Ferramentas e telefonia', 'Operação', 560],
]
export const MOCK_CUSTO_TOTAL = MOCK_CUSTO_ITEMS.reduce((sum, [, , v]) => sum + v, 0)
const MOCK_CUSTO_ROWS: SmartPreviewRow[] = MOCK_CUSTO_ITEMS.map(([title, subtitle, value]) => ({ title, subtitle, value: fmtBrl(value) }))

interface VidaSdrDataLike {
  captacoes: number; em_andamento: number; cancelados: number; vendas: number; conversao: number
  receita_recebida: number | null; receita_a_receber: number | null; primeiro_lead_em: string | null
  ranking: { posicao: number; total: number; leaderboard: Array<{ nome: string; receita: number; voce: boolean }> } | null
  atividades: Array<{ tipo: string; lead_nome: string; lead_id?: string; detalhe: string | null; em: string }>
}

export function buildSmartPreview(id: SmartPreviewId, context: number, data: VidaSdrDataLike, origens: string): SmartPreview {
  const cancellationRate = data.captacoes ? Math.round((data.cancelados / data.captacoes) * 100) : 0

  if (id === 'captacoes') return { title: 'Leads captados', description: 'Amostra dos leads que formam este indicador.', summary: [['Total', String(data.captacoes)]], count: `Exibindo 5 de ${data.captacoes} leads`, actionLabel: 'Abrir CRM', target: leadsTarget(origens, data.primeiro_lead_em), rows: [] }
  if (id === 'em_andamento') return { title: 'Leads em andamento', description: 'Leads ativos que ainda exigem acompanhamento.', summary: [['Em andamento', String(data.em_andamento)]], count: `Exibindo 5 de ${data.em_andamento} leads`, actionLabel: 'Abrir CRM', target: leadsTarget(origens, data.primeiro_lead_em, EM_ANDAMENTO_STATUSES), rows: [] }
  if (id === 'vendas') return { title: 'Vendas realizadas', description: 'Amostra das vendas fechadas no período.', summary: [['Vendas', String(data.vendas)]], count: `Exibindo 5 de ${data.vendas} vendas`, actionLabel: 'Abrir CRM', target: leadsTarget(origens, data.primeiro_lead_em, VENDA_STATUSES_CSV), rows: [] }
  if (id === 'cancelados') return { title: 'Cancelamentos do período', description: 'Amostra dos registros encerrados sem venda.', summary: [['Cancelados', String(data.cancelados)]], count: `Exibindo 5 de ${data.cancelados} cancelamentos`, actionLabel: 'Abrir CRM', target: leadsTarget(origens, data.primeiro_lead_em, CANCELADO_STATUS_CSV), rows: [] }
  if (id === 'conversao') return { title: 'Detalhamento da conversão', description: 'Passagem compacta dos leads até a venda.', summary: [['Leads', String(data.captacoes)], ['Vendas', String(data.vendas)], ['Conversão', `${data.conversao}%`]], count: '5 exemplos de vendas', actionLabel: 'Abrir CRM', target: leadsTarget(origens, data.primeiro_lead_em, VENDA_STATUSES_CSV), rows: [] }
  if (id === 'cancellationRate') return { title: 'Taxa de cancelamento', description: 'Amostra dos registros encerrados sem venda.', summary: [['Cancelados', String(data.cancelados)], ['Taxa', `${cancellationRate}%`]], count: `Exibindo 5 de ${data.cancelados} cancelamentos`, actionLabel: 'Abrir CRM', target: leadsTarget(origens, data.primeiro_lead_em, CANCELADO_STATUS_CSV), rows: [] }
  if (id === 'receita_recebida') return { title: 'Composição da receita recebida', description: 'Valores efetivamente recebidos pela empresa.', summary: [['Receita recebida', fmtBrl(data.receita_recebida || 0)]], count: `Exibindo 5 de ${data.vendas} vendas`, actionLabel: 'Abrir Financeiro', target: '/financeiro', rows: [] }
  if (id === 'receita_a_receber') return { title: 'Valores a receber', description: 'Contratos fechados que ainda possuem pagamentos futuros.', summary: [['A receber', fmtBrl(data.receita_a_receber || 0)]], count: `Exibindo 5 de ${data.vendas} vendas`, actionLabel: 'Abrir Financeiro', target: '/financeiro', rows: [] }
  if (id === 'receita_potencial') return { title: 'Composição da receita potencial (estimativa)', description: 'Receita potencial é o pipeline financeiro das oportunidades abertas — uma estimativa, não uma receita garantida. Ainda sem integração real com o Pipeline.', summary: [['Valor estimado', fmtBrl(MOCK_POTENCIAL_TOTAL)], ['Oportunidades', String(MOCK_POTENCIAL_ROWS.length)]], actionLabel: 'Abrir Pipeline', target: '/pipeline', rows: MOCK_POTENCIAL_ROWS, simulated: true }
  if (id === 'custo_total') return { title: 'Composição do custo total (estimativa)', description: 'Visão resumida dos principais custos do período. Ainda sem integração real de custos por agente.', summary: [['Custo estimado', fmtBrl(MOCK_CUSTO_TOTAL)]], actionLabel: 'Ver composição completa', target: null, rows: MOCK_CUSTO_ROWS, simulated: true }

  if (id === 'ranking') {
    const entry = data.ranking?.leaderboard[context]
    if (!entry) return { title: 'Prévia do colaborador', description: 'Sem dados de ranking disponíveis.', summary: [], actionLabel: 'Abrir Vida do Agente', target: null, rows: [] }
    return {
      title: 'Prévia do colaborador',
      description: 'Visão rápida antes de trocar o contexto do dashboard.',
      summary: [['Receita recebida', fmtBrl(entry.receita)], ['Posição', `${context + 1}º de ${data.ranking?.total ?? 0}`]],
      actionLabel: 'Abrir Vida do Agente',
      target: entry.nome === 'o2 Solution' ? null : `/vida-sdr/${encodeURIComponent(entry.nome)}?nome=${encodeURIComponent(entry.nome)}`,
      rows: [{ title: entry.nome, subtitle: entry.voce ? 'Você' : 'Time comercial', status: entry.voce ? 'Você' : undefined }],
    }
  }

  const activity = data.atividades[context]
  if (!activity) return { title: 'Detalhes da atividade', description: 'Atividade não encontrada.', summary: [], actionLabel: 'Abrir Lead', target: null, rows: [] }
  const texto = activity.tipo === 'status' ? `Mudou para ${statusLabel(activity.detalhe)}`
    : activity.tipo === 'nota' ? (activity.detalhe || 'Nota registrada')
    : 'Agendamento criado'
  return {
    title: 'Detalhes da atividade',
    description: 'Contexto resumido da movimentação selecionada.',
    summary: [['Lead', activity.lead_nome], ['Tipo', activity.tipo], ['Data', new Date(activity.em).toLocaleString('pt-BR')]],
    actionLabel: 'Abrir Lead',
    target: activity.lead_id ? `/leads/${activity.lead_id}` : null,
    rows: [{ title: activity.lead_nome, subtitle: texto }],
  }
}
