import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'
import NavBar from '../components/NavBar'

interface PipelineOverview { novo: number; qualificado: number; proposta: number; fechado: number }
interface FunnelStage { stage: string; count: number; percentage: number }
interface AlertLead { id: string; name: string; days_paused?: number; hours_without_action?: number; status?: string }
interface PipelineAlerts { vencidos: AlertLead[]; uncontacted: AlertLead[] }
interface StageConversion { novo_to_qualificado: number; qualificado_to_proposta: number; proposta_to_fechado: number }
interface PipelineAnalytics { avg_time_in_pipeline: number; conversion_rate: number; stage_conversion: StageConversion }

const STAGE_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#6B7280']

export default function Pipeline() {
  const navigate = useNavigate()
  const [overview, setOverview] = useState<PipelineOverview | null>(null)
  const [funnel, setFunnel] = useState<FunnelStage[]>([])
  const [alerts, setAlerts] = useState<PipelineAlerts | null>(null)
  const [analytics, setAnalytics] = useState<PipelineAnalytics | null>(null)
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
    ])
      .then(([ov, fn, al, an]) => {
        setOverview(ov.data)
        setFunnel(fn.data.stages)
        setAlerts(al.data)
        setAnalytics(an.data)
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

  if (error || !overview || !analytics || !alerts) return (
    <div className="min-h-screen" style={{ background: '#F9FAFB' }}>
      <NavBar />
      <p className="text-center text-sm mt-20" style={{ color: '#EF4444' }}>{error || 'Sem dados.'}</p>
    </div>
  )

  const overviewCards = [
    { label: 'Novo', value: overview.novo, color: '#3B82F6', bg: '#EFF6FF', icon: '📥' },
    { label: 'Qualificado', value: overview.qualificado, color: '#10B981', bg: '#ECFDF5', icon: '✅' },
    { label: 'Proposta', value: overview.proposta, color: '#F59E0B', bg: '#FFFBEB', icon: '📄' },
    { label: 'Fechado', value: overview.fechado, color: '#6B7280', bg: '#F3F4F6', icon: '🏆' },
  ]

  const maxCount = funnel.reduce((m, s) => Math.max(m, s.count), 1)

  const stageConversions = [
    { label: 'Novo → Qualificado', value: analytics.stage_conversion.novo_to_qualificado, color: '#3B82F6' },
    { label: 'Qualificado → Proposta', value: analytics.stage_conversion.qualificado_to_proposta, color: '#10B981' },
    { label: 'Proposta → Fechado', value: analytics.stage_conversion.proposta_to_fechado, color: '#F59E0B' },
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
              style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.1)', transition: 'transform 200ms', cursor: 'default' }}
              onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.02)')}
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

        {/* Funnel + Analytics */}
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

          <div className="bg-white rounded-xl p-6 flex flex-col gap-5" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <h2 style={{ fontSize: 13, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Métricas do Funil
            </h2>

            <div className="flex gap-8">
              <div>
                <p style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tempo Médio</p>
                <p style={{ fontSize: 30, fontWeight: 700, color: '#1F2937', lineHeight: 1.2 }}>{analytics.avg_time_in_pipeline}d</p>
                <p style={{ fontSize: 11, color: '#9CA3AF' }}>no funil</p>
              </div>
              <div>
                <p style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Conversão Geral</p>
                <p style={{ fontSize: 30, fontWeight: 700, color: '#10B981', lineHeight: 1.2 }}>{analytics.conversion_rate}%</p>
                <p style={{ fontSize: 11, color: '#9CA3AF' }}>fechados / total</p>
              </div>
            </div>

            <div style={{ borderTop: '1px solid #F3F4F6', paddingTop: 16 }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 14 }}>
                Conversão por Estágio
              </p>
              {stageConversions.map(item => (
                <div key={item.label} className="flex flex-col gap-1 mb-3">
                  <div className="flex justify-between">
                    <span style={{ fontSize: 12, color: '#374151' }}>{item.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: item.color }}>{item.value}%</span>
                  </div>
                  <div style={{ background: '#F3F4F6', borderRadius: 99, height: 6 }}>
                    <div style={{ width: `${item.value}%`, height: '100%', background: item.color, borderRadius: 99, transition: 'width 500ms ease' }} />
                  </div>
                </div>
              ))}
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
                      <p style={{ fontSize: 11, color: '#9CA3AF' }}>{lead.days_paused} dias parado</p>
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
            <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: -8 }}>24h+ sem movimento com status Novo</p>
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
      </main>
    </div>
  )
}
