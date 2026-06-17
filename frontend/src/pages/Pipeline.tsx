import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts'
import { Clock, CheckSquare, FileText, Handshake } from 'lucide-react'
import api from '../api'
interface PipelineOverview { novo: number; qualificado: number; proposta: number; negociacao: number; fechado: number; perdido: number }
interface AlertLead { id: string; name: string; hours_without_action?: number; status?: string }
interface PipelineAlerts { vencidos: AlertLead[]; uncontacted: AlertLead[]; vencidos_count?: number; uncontacted_count?: number }
interface NextActions { call_today: number; send_email: number; follow_proposal: number }

const CONV_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#059669']

export default function Pipeline() {
  const navigate = useNavigate()
  const _now = new Date()
  const todayStr   = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}-${String(_now.getDate()).padStart(2, '0')}`
  const monthStart = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}-01`

  const [dateFrom, setDateFrom]       = useState(monthStart)
  const [dateTo,   setDateTo]         = useState(todayStr)
  const [selectedSource, setSelectedSource] = useState('')
  const [sources, setSources] = useState<string[]>([])

  const [overview, setOverview] = useState<PipelineOverview | null>(null)
  const [alerts, setAlerts] = useState<PipelineAlerts | null>(null)
  const [nextActions, setNextActions] = useState<NextActions | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (localStorage.getItem('token')) {
      api.get<string[]>('/api/v1/leads/origins').then(r => setSources(r.data)).catch(() => {})
    }
  }, [])

  const fetchAll = useCallback(() => {
    if (!localStorage.getItem('token')) { navigate('/login'); return }
    const qs = new URLSearchParams({ date_from: dateFrom, date_to: dateTo })
    if (selectedSource) qs.set('source', selectedSource)
    const q = `?${qs.toString()}`

    setLoading(true)
    Promise.all([
      api.get<PipelineOverview>(`/api/v1/pipeline/overview${q}`),
      api.get<PipelineAlerts>(`/api/v1/pipeline/alerts${q}`),
      api.get<NextActions>(`/api/v1/pipeline/next-actions${q}`),
    ])
      .then(([ov, al, na]) => {
        setOverview(ov.data)
        setAlerts(al.data)
        setNextActions(na.data)
      })
      .catch(err => {
        if (err.response?.status === 401) { localStorage.removeItem('token'); navigate('/login') }
        else setError('Erro ao carregar pipeline.')
      })
      .finally(() => setLoading(false))
  }, [navigate, dateFrom, dateTo, selectedSource])

  useEffect(() => { fetchAll() }, [fetchAll])

  if (loading) return (
    <p className="text-center text-sm mt-20" style={{ color: '#9CA3AF' }}>Carregando...</p>
  )

  if (error || !overview || !alerts || !nextActions) return (
    <p className="text-center text-sm mt-20" style={{ color: '#EF4444' }}>{error || 'Sem dados.'}</p>
  )

  const cardNav = (params: Record<string, string>) => {
    const p = new URLSearchParams({ date_from: dateFrom, date_to: dateTo, ...params })
    return `?${p.toString()}`
  }

  const overviewCards = [
    { label: 'Pendente',    value: overview.novo,        color: '#3B82F6', bg: '#EFF6FF', icon: '📥', nav: cardNav({ status: 'pending,novo,new' }) },
    { label: 'Qualificado', value: overview.qualificado, color: '#10B981', bg: '#ECFDF5', icon: '✅', nav: cardNav({ status: 'scheduled,qualificado,qualified' }) },
    { label: 'Proposta',    value: overview.proposta,    color: '#F59E0B', bg: '#FFFBEB', icon: '📄', nav: cardNav({ status: 'proposal_sent' }) },
    { label: 'Negociação',  value: overview.negociacao,  color: '#8B5CF6', bg: '#F5F3FF', icon: '🔥', nav: cardNav({ perception: 'Quente,Morno' }) },
    { label: 'Fechado',     value: overview.fechado,     color: '#059669', bg: '#ECFDF5', icon: '🏆', nav: cardNav({ status: 'waiting_billing,sale_performed,fechado,closed,won,convertido' }) },
    { label: 'Perdido',     value: overview.perdido,     color: '#EF4444', bg: '#FEF2F2', icon: '❌', nav: cardNav({ status: 'sale_not_performed' }) },
  ]

  const distTotal = overview.novo + overview.qualificado + overview.proposta + overview.negociacao + overview.fechado + overview.perdido
  const distStages = [
    { stage: 'Pendente',    count: overview.novo,        color: '#3B82F6' },
    { stage: 'Qualificado', count: overview.qualificado, color: '#10B981' },
    { stage: 'Proposta',    count: overview.proposta,    color: '#F59E0B' },
    { stage: 'Negociação',  count: overview.negociacao,  color: '#8B5CF6' },
    { stage: 'Fechado',     count: overview.fechado,     color: '#059669' },
    { stage: 'Perdido',     count: overview.perdido,     color: '#EF4444' },
  ]

  const qualOL = overview.qualificado + overview.proposta + overview.negociacao + overview.fechado
  const propOL = overview.proposta + overview.negociacao + overview.fechado
  const negOL  = overview.negociacao + overview.fechado
  const convs = [
    {
      from: 'Pendente', to: 'Qualificado', fromCount: distTotal, toCount: qualOL,
      rate: distTotal > 0 ? +((qualOL / distTotal) * 100).toFixed(1) : 0,
      color: CONV_COLORS[0], Icon: Clock,
      note: `${overview.novo} ainda pendentes · ${overview.perdido} perdidos sem converter`,
      nav: cardNav({ status: 'pending,novo,new' }),
    },
    {
      from: 'Qualificado', to: 'Proposta', fromCount: qualOL, toCount: propOL,
      rate: qualOL > 0 ? +((propOL / qualOL) * 100).toFixed(1) : 0,
      color: CONV_COLORS[1], Icon: CheckSquare,
      note: `${overview.qualificado} ainda qualificados`,
      nav: cardNav({ status: 'scheduled,qualificado,qualified' }),
    },
    {
      from: 'Proposta', to: 'Negociação', fromCount: propOL, toCount: negOL,
      rate: propOL > 0 ? +((negOL / propOL) * 100).toFixed(1) : 0,
      color: CONV_COLORS[2], Icon: FileText,
      note: `${overview.proposta} aguardando negociação`,
      nav: cardNav({ status: 'proposal_sent' }),
    },
    {
      from: 'Negociação', to: 'Fechado', fromCount: negOL, toCount: overview.fechado,
      rate: negOL > 0 ? +((overview.fechado / negOL) * 100).toFixed(1) : 0,
      color: CONV_COLORS[3], Icon: Handshake,
      note: `${overview.negociacao} em negociação`,
      nav: cardNav({ perception: 'Quente,Morno' }),
    },
  ]

  const nextActionCards = [
    { label: 'Ligar Hoje',      icon: '📞', value: nextActions.call_today,     sub: 'leads para ligar',    color: '#3B82F6', bg: '#EFF6FF', nav: '?status=pending' },
    { label: 'Enviar Email',    icon: '📧', value: nextActions.send_email,      sub: 'leads para email',    color: '#10B981', bg: '#ECFDF5', nav: '?status=scheduled' },
    { label: 'Seguir Proposta', icon: '📄', value: nextActions.follow_proposal, sub: 'propostas pendentes', color: '#F59E0B', bg: '#FFFBEB', nav: '?status=proposal_sent' },
  ]

  return (
    <>
    <main className="px-4 md:px-8 xl:px-12 py-6 flex flex-col gap-6">

        {/* Header + filtros */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1F2937' }}>Pipeline de Vendas</h1>
            <p style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}>Visão do funil de vendas em tempo real</p>
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            <span style={{ fontSize: 12, color: '#6B7280', fontWeight: 500 }}>De</span>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              style={{ fontSize: 13, padding: '6px 10px', borderRadius: 8, border: '1px solid #D1D5DB', color: '#374151', background: 'white', cursor: 'pointer' }}
            />
            <span style={{ fontSize: 12, color: '#6B7280', fontWeight: 500 }}>Até</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              style={{ fontSize: 13, padding: '6px 10px', borderRadius: 8, border: '1px solid #D1D5DB', color: '#374151', background: 'white', cursor: 'pointer' }}
            />
            <select
              value={selectedSource}
              onChange={e => setSelectedSource(e.target.value)}
              style={{ fontSize: 13, padding: '6px 10px', borderRadius: 8, border: '1px solid #D1D5DB', color: selectedSource ? '#374151' : '#9CA3AF', background: 'white', cursor: 'pointer', minWidth: 160 }}
            >
              <option value="">Todas as origens</option>
              {sources.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {/* Overview cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 xl:gap-6">
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
              <span style={{ fontSize: 36, fontWeight: 700, color: card.color, lineHeight: 1 }}>{card.value}</span>
            </div>
          ))}
        </div>

        {/* Distribuição + Conversões */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 xl:gap-6">

          <div className="bg-white rounded-xl p-6 flex flex-col gap-4" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <h2 style={{ fontSize: 13, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Distribuição do Funil
            </h2>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={distStages} layout="vertical" margin={{ top: 0, right: 50, left: 10, bottom: 0 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="stage" tick={{ fontSize: 12, fill: '#6B7280' }} width={90} />
                <Tooltip
                  formatter={(v: number) => [`${v} leads (${distTotal > 0 ? ((v / distTotal) * 100).toFixed(1) : 0}%)`, '']}
                  contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.12)', fontSize: 12 }}
                />
                <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={26}>
                  {distStages.map(s => <Cell key={s.stage} fill={s.color} />)}
                  <LabelList dataKey="count" position="right" style={{ fontSize: 12, fontWeight: 600, fill: '#374151' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-xl p-6 flex flex-col gap-4" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <h2 style={{ fontSize: 13, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Conversões do Funil
            </h2>
            <div className="flex flex-col gap-5 mt-1">
              {convs.map((c, i) => (
                <div
                  key={i}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', padding: '4px 6px', borderRadius: 8, transition: 'background 150ms' }}
                  onClick={() => navigate(`/leads-report${c.nav}`)}
                  onMouseEnter={e => (e.currentTarget.style.background = '#F9FAFB')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ width: 38, height: 38, borderRadius: '50%', background: c.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <c.Icon size={16} color={c.color} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
                      <div>
                        <p style={{ fontSize: 13, color: '#374151', fontWeight: 600, lineHeight: 1.3 }}>{c.from} → {c.to}</p>
                        <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1 }}>De {c.fromCount} para {c.toCount} leads</p>
                        <p style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>{c.note}</p>
                      </div>
                      <span style={{ fontSize: 16, fontWeight: 700, color: c.color, marginLeft: 12, flexShrink: 0 }}>{c.rate}%</span>
                    </div>
                    <div style={{ background: '#F3F4F6', borderRadius: 99, height: 8, overflow: 'hidden', marginTop: 6 }}>
                      <div style={{ width: `${Math.min(100, c.rate)}%`, height: '100%', background: c.color, borderRadius: 99, transition: 'width 500ms ease' }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Alertas */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 xl:gap-6">

          <div
            className="bg-white rounded-xl p-6 flex flex-col gap-3"
            style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderLeft: '4px solid #EF4444', cursor: 'pointer', transition: 'transform 200ms' }}
            onClick={() => navigate('/leads-report?vencidos=1')}
            onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.02)')}
            onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
          >
            <div className="flex items-center gap-2">
              <span style={{ fontSize: 15 }}>⚠️</span>
              <h2 style={{ fontSize: 13, fontWeight: 700, color: '#EF4444', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Leads Vencidos
              </h2>
              <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: '#EF4444', background: '#FEF2F2', padding: '2px 8px', borderRadius: 99 }}>
                {alerts.vencidos_count ?? alerts.vencidos.length} leads
              </span>
            </div>
            <p style={{ fontSize: 11, color: '#9CA3AF' }}>Qualquer status sem atenção nas últimas 24h</p>
            <p style={{ fontSize: 12, color: '#3B82F6', fontWeight: 500 }}>Ver no Relatório →</p>
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 xl:gap-6">
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
    </>
  )
}
