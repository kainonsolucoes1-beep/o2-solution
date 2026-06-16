import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'
import NavBar from '../components/NavBar'

interface PipelineOverview { novo: number; qualificado: number; proposta: number; fechado: number }
interface FunnelStage { stage: string; count: number; percentage: number }
interface AlertLead { id: string; name: string; hours_without_action?: number; status?: string }
interface PipelineAlerts { vencidos: AlertLead[]; uncontacted: AlertLead[] }
interface PipelineAnalytics { avg_time_in_pipeline: number; conversion_rate: number }
interface NextActions { call_today: number; send_email: number; follow_proposal: number }

const STAGE_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#6B7280']

export default function Pipeline() {
  const navigate = useNavigate()
  const [overview, setOverview] = useState<PipelineOverview | null>(null)
  const [funnel, setFunnel] = useState<FunnelStage[]>([])
  const [alerts, setAlerts] = useState<PipelineAlerts | null>(null)
  const [analytics, setAnalytics] = useState<PipelineAnalytics | null>(null)
  const [nextActions, setNextActions] = useState<NextActions | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchAll = useCallback(() => {
    if (!localStorage.getItem('token')) { navigate('/login'); return }
    setLoading(true)
    Promise.all([
      api.get<PipelineOverview>('/api/v1/pipeline/overview'),
      api.get<{ stages: FunnelStage[] }>('/api/v1/pipeline/funnel'),
      api.get<PipelineAlerts>('/api/v1/pipeline/alerts'),
      api.get<PipelineAnalytics>('/api/v1/pipeline/analytics'),
      api.get<NextActions>('/api/v1/pipeline/next-actions'),
    ])
      .then(([ov, fn, al, an, na]) => {
        setOverview(ov.data)
        setFunnel(fn.data.stages)
        setAlerts(al.data)
        setAnalytics(an.data)
        setNextActions(na.data)
      })
      .catch(err => {
        if (err.response?.status === 401) { localStorage.removeItem('token'); navigate('/login') }
        else setError('Erro ao carregar pipeline.')
      })
      .finally(() => setLoading(false))
  }, [navigate])

  useEffect(() => { fetchAll() }, [fetchAll])

  if (loading) return (
    <div className="min-h-screen" style={{ background: '#F9FAFB' }}>
      <NavBar />
      <p className="text-center text-sm mt-20" style={{ color: '#9CA3AF' }}>Carregando...</p>
    </div>
  )

  if (error || !overview || !analytics || !alerts || !nextActions) return (
    <div className="min-h-screen" style={{ background: '#F9FAFB' }}>
      <NavBar />
      <p className="text-center text-sm mt-20" style={{ color: '#EF4444' }}>{error || 'Sem dados.'}</p>
    </div>
  )

  const overviewCards = [
    { label: 'Pendente',    value: overview.novo,        color: '#3B82F6', bg: '#EFF6FF', icon: '📥', nav: '?status=pending' },
    { label: 'Qualificado', value: overview.qualificado, color: '#10B981', bg: '#ECFDF5', icon: '✅', nav: '?perception=Quente,Morno' },
    { label: 'Proposta',    value: overview.proposta,    color: '#F59E0B', bg: '#FFFBEB', icon: '📄', nav: '?status=proposal_sent' },
    { label: 'Fechado',     value: overview.fechado,     color: '#6B7280', bg: '#F3F4F6', icon: '🏆', nav: '?status=waiting_billing' },
  ]

  const maxCount = funnel.reduce((m, s) => Math.max(m, s.count), 1)

  const nextActionCards = [
    {
      label: 'Ligar Hoje',
      icon: '📞',
      value: nextActions.call_today,
      sub: 'leads para ligar',
      color: '#3B82F6',
      bg: '#EFF6FF',
      nav: '?status=pending',
    },
    {
      label: 'Enviar Email',
      icon: '📧',
      value: nextActions.send_email,
      sub: 'leads para email',
      color: '#10B981',
      bg: '#ECFDF5',
      nav: '?status=scheduled',
    },
    {
      label: 'Seguir Proposta',
      icon: '📄',
      value: nextActions.follow_proposal,
      sub: 'propostas pendentes',
      color: '#F59E0B',
      bg: '#FFFBEB',
      nav: '?status=proposal_sent',
    },
  ]

  return (
    <div className="min-h-screen" style={{ background: '#F9FAFB' }}>
      <NavBar />
      <main className="max-w-7xl mx-auto px-4 py-6 flex flex-col gap-6">

        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1F2937' }}>Pipeline de Vendas</h1>
          <p style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}>Visão do funil de vendas em tempo real</p>
        </div>

        {/* Overview cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {overviewCards.map(card => (
            <div
              key={card.label}
              className="bg-white rounded-xl p-5 flex flex-col gap-2"
              style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.1)', transition: 'transform 200ms', cursor: 'pointer' }}
              onClick={() => navigate(`/leads-report${card.nav}`)}
              onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.05)')}
              onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
            >
              <div style={{ width: 36, height: 36, borderRadius: 8, background: card.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                {card.icon}
              </div>
              <span style={{ fontSize: 13, color: '#6B7280', fontWeight: 500 }}>{card.label}</span>
              <span style={{ fontSize: 32, fontWeight: 700, color: card.color, lineHeight: 1 }}>{card.value}</span>
            </div>
          ))}
        </div>

        {/* Funnel + Métricas */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          <div className="bg-white rounded-xl p-6 flex flex-col gap-4" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <h2 style={{ fontSize: 13, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Funil de Vendas
            </h2>
            <div className="flex flex-col gap-4">
              {funnel.map((stage, i) => {
                const barW = Math.max(4, Math.round((stage.count / maxCount) * 100))
                return (
                  <div key={stage.stage} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{stage.stage}</span>
                      <span style={{ fontSize: 12, color: '#6B7280' }}>{stage.count} leads · {stage.percentage}%</span>
                    </div>
                    <div style={{ background: '#F3F4F6', borderRadius: 99, height: 10, overflow: 'hidden' }}>
                      <div style={{ width: `${barW}%`, height: '100%', background: STAGE_COLORS[i], borderRadius: 99, transition: 'width 500ms ease' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 flex flex-col gap-6" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <h2 style={{ fontSize: 13, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Métricas do Funil
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1 p-4 rounded-xl" style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                <p style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tempo Médio</p>
                <p style={{ fontSize: 34, fontWeight: 700, color: '#1F2937', lineHeight: 1.1 }}>{analytics.avg_time_in_pipeline}d</p>
                <p style={{ fontSize: 11, color: '#9CA3AF' }}>no funil</p>
              </div>
              <div className="flex flex-col gap-1 p-4 rounded-xl" style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                <p style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Conversão Geral</p>
                <p style={{ fontSize: 34, fontWeight: 700, color: '#10B981', lineHeight: 1.1 }}>{analytics.conversion_rate}%</p>
                <p style={{ fontSize: 11, color: '#9CA3AF' }}>fechados / total</p>
              </div>
            </div>
          </div>

        </div>

        {/* Alerts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          <div className="bg-white rounded-xl p-6 flex flex-col gap-4" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderLeft: '4px solid #EF4444' }}>
            <div className="flex items-center gap-2">
              <span style={{ fontSize: 15 }}>⚠️</span>
              <h2 style={{ fontSize: 13, fontWeight: 700, color: '#EF4444', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Leads Vencidos
              </h2>
              <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: '#EF4444', background: '#FEF2F2', padding: '2px 8px', borderRadius: 99 }}>
                {alerts.vencidos.length} leads
              </span>
            </div>
            <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: -8 }}>Qualquer status sem atenção nas últimas 24h</p>
            {alerts.vencidos.length === 0 ? (
              <p style={{ fontSize: 13, color: '#9CA3AF' }}>Nenhum lead vencido.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {alerts.vencidos.map(lead => (
                  <div key={lead.id} className="flex items-center justify-between" style={{ padding: '8px 10px', background: '#FEF2F2', borderRadius: 8 }}>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 600, color: '#1F2937' }}>{lead.name}</p>
                      <p style={{ fontSize: 11, color: '#9CA3AF' }}>{lead.hours_without_action}h sem atenção · {lead.status}</p>
                    </div>
                    <button
                      onClick={() => navigate('/leads-report')}
                      style={{ fontSize: 11, fontWeight: 600, color: '#3B82F6', background: 'white', border: '1px solid #DBEAFE', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}
                    >
                      Ver Detalhe
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl p-6 flex flex-col gap-4" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderLeft: '4px solid #F59E0B' }}>
            <div className="flex items-center gap-2">
              <span style={{ fontSize: 15 }}>🟡</span>
              <h2 style={{ fontSize: 13, fontWeight: 700, color: '#B45309', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Não Contatados
              </h2>
              <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: '#B45309', background: '#FFFBEB', padding: '2px 8px', borderRadius: 99 }}>
                {alerts.uncontacted.length} leads
              </span>
            </div>
            <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: -8 }}>Status Novo sem movimento nas últimas 24h</p>
            {alerts.uncontacted.length === 0 ? (
              <p style={{ fontSize: 13, color: '#9CA3AF' }}>Todos os leads foram contatados.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {alerts.uncontacted.map(lead => (
                  <div key={lead.id} className="flex items-center justify-between" style={{ padding: '8px 10px', background: '#FFFBEB', borderRadius: 8 }}>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 600, color: '#1F2937' }}>{lead.name}</p>
                      <p style={{ fontSize: 11, color: '#9CA3AF' }}>{lead.hours_without_action}h sem movimento</p>
                    </div>
                    <button
                      onClick={() => navigate('/leads-report')}
                      style={{ fontSize: 11, fontWeight: 600, color: '#3B82F6', background: 'white', border: '1px solid #DBEAFE', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}
                    >
                      Ver Detalhe
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Próximas Ações */}
        <div>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16 }}>
            Próximas Ações
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {nextActionCards.map(card => (
              <div
                key={card.label}
                className="bg-white rounded-xl p-5 flex items-center gap-4"
                style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.1)', cursor: 'pointer', transition: 'transform 200ms, box-shadow 200ms' }}
                onClick={() => navigate(`/leads-report${card.nav}`)}
                onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.02)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.12)' }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)' }}
              >
                <div style={{ width: 48, height: 48, borderRadius: 12, background: card.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
                  {card.icon}
                </div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{card.label}</p>
                  <p style={{ fontSize: 24, fontWeight: 700, color: card.color, lineHeight: 1.2 }}>{card.value}</p>
                  <p style={{ fontSize: 11, color: '#9CA3AF' }}>{card.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

      </main>
    </div>
  )
}
