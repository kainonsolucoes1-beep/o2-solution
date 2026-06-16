import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'

interface SourceDetail {
  name: string
  total_revenue: number
  leads_count: number
  average_ticket: number
  active_leads: number
  average_time_in_pipeline: number
  distribution_by_status: Record<string, number>
}

interface Props {
  sourceName: string
  dateFrom: string
  dateTo: string
  onClose: () => void
}

const STATUS_COLORS: Record<string, string> = {
  Pendente: '#3B82F6',
  Agendado: '#10B981',
  Proposta: '#F59E0B',
  Venda:    '#6B7280',
  Perdido:  '#EF4444',
}

function fmt(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

export default function SourceDetailModal({ sourceName, dateFrom, dateTo, onClose }: Props) {
  const navigate = useNavigate()
  const [data, setData] = useState<SourceDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    setData(null)
    const qs = new URLSearchParams({ date_from: dateFrom, date_to: dateTo })
    api.get<SourceDetail>(`/api/v1/pipeline/source-details/${encodeURIComponent(sourceName)}?${qs}`)
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [sourceName, dateFrom, dateTo])

  const dist = data?.distribution_by_status || {}
  const distTotal = Object.values(dist).reduce((a, b) => a + b, 0)

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: 'white', borderRadius: 16, padding: 28, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <p style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Detalhes da Fonte</p>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1F2937', marginTop: 4 }}>{sourceName}</h2>
          </div>
          <button onClick={onClose} style={{ fontSize: 20, color: '#9CA3AF', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1, padding: 4 }}>✕</button>
        </div>

        {loading ? (
          <p style={{ textAlign: 'center', color: '#9CA3AF', fontSize: 13, padding: '20px 0' }}>Carregando...</p>
        ) : !data ? (
          <p style={{ textAlign: 'center', color: '#EF4444', fontSize: 13, padding: '20px 0' }}>Erro ao carregar dados.</p>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>

              <div style={{ background: '#F0FDF4', borderRadius: 12, padding: '14px 16px' }}>
                <p style={{ fontSize: 11, color: '#6B7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Receita Total</p>
                <p style={{ fontSize: 22, fontWeight: 700, color: '#059669', marginTop: 4 }}>{fmt(data.total_revenue)}</p>
                <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>Total de valor em carteira</p>
              </div>

              <div style={{ background: '#EFF6FF', borderRadius: 12, padding: '14px 16px' }}>
                <p style={{ fontSize: 11, color: '#6B7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Qtd. de Leads</p>
                <p style={{ fontSize: 22, fontWeight: 700, color: '#2563EB', marginTop: 4 }}>{data.leads_count}</p>
                <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>Todos os leads dessa origem</p>
              </div>

              <div style={{ background: '#FFFBEB', borderRadius: 12, padding: '14px 16px' }}>
                <p style={{ fontSize: 11, color: '#6B7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ticket Médio</p>
                <p style={{ fontSize: 22, fontWeight: 700, color: '#D97706', marginTop: 4 }}>{fmt(data.average_ticket)}</p>
                <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>Valor médio por lead</p>
              </div>

              <div style={{ background: '#F5F3FF', borderRadius: 12, padding: '14px 16px' }}>
                <p style={{ fontSize: 11, color: '#6B7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Leads Ativos</p>
                <p style={{ fontSize: 22, fontWeight: 700, color: '#7C3AED', marginTop: 4 }}>
                  {data.active_leads}
                  {data.leads_count > 0 && (
                    <span style={{ fontSize: 13, fontWeight: 500, color: '#9CA3AF', marginLeft: 6 }}>
                      ({Math.round(data.active_leads / data.leads_count * 100)}%)
                    </span>
                  )}
                </p>
                <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>Em andamento no funil</p>
              </div>

              <div style={{ background: '#FEF2F2', borderRadius: 12, padding: '14px 16px' }}>
                <p style={{ fontSize: 11, color: '#6B7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tempo Médio no Funil</p>
                <p style={{ fontSize: 22, fontWeight: 700, color: '#DC2626', marginTop: 4 }}>{data.average_time_in_pipeline} dias</p>
                <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>Desde criação até última ação</p>
              </div>

              <div style={{ background: '#F9FAFB', borderRadius: 12, padding: '14px 16px' }}>
                <p style={{ fontSize: 11, color: '#6B7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Distribuição</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {Object.entries(dist).map(([st, cnt]) => (
                    <div key={st} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: STATUS_COLORS[st] || '#6B7280', fontWeight: 600 }}>{st}</span>
                      <span style={{ fontSize: 11, color: '#6B7280' }}>
                        {cnt} ({distTotal > 0 ? Math.round(cnt / distTotal * 100) : 0}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>

            </div>

            <button
              onClick={() => { navigate(`/leads-report?origin=${encodeURIComponent(sourceName)}`); onClose() }}
              style={{ width: '100%', padding: '12px 0', background: '#2563EB', color: 'white', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}
            >
              Ver Leads dessa Origem
            </button>
          </>
        )}
      </div>
    </div>
  )
}
