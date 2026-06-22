import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clock, CheckSquare, FileText, Handshake, Timer, XCircle } from 'lucide-react'
import api from '../api'

interface PipelineOverview {
  novo: number; qualificado: number; proposta: number; negociacao: number; fechado: number; perdido: number
  novo_value: number; qualificado_value: number; proposta_value: number; negociacao_value: number; fechado_value: number; perdido_value: number
}
interface AlertLead { id: string; name: string; hours_without_action?: number; status?: string }
interface PipelineAlerts { vencidos: AlertLead[]; uncontacted: AlertLead[]; vencidos_count?: number; uncontacted_count?: number; avg_time_in_funnel?: number }

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
    ])
      .then(([ov, al]) => {
        setOverview(ov.data)
        setAlerts(al.data)
      })
      .catch(err => {
        if (err.response?.status === 401) { localStorage.removeItem('token'); navigate('/login') }
        else setError('Erro ao carregar pipeline.')
      })
      .finally(() => setLoading(false))
  }, [navigate, dateFrom, dateTo, selectedSource])

  useEffect(() => { fetchAll() }, [fetchAll])

  if (loading) return (
    <p className="text-center text-sm mt-20" style={{ color: 'var(--text-subtle)' }}>Carregando...</p>
  )

  if (error || !overview || !alerts) return (
    <p className="text-center text-sm mt-20" style={{ color: '#EF4444' }}>{error || 'Sem dados.'}</p>
  )

  const cardNav = (params: Record<string, string>) => {
    const p = new URLSearchParams({ date_from: dateFrom, date_to: dateTo, ...params })
    if (selectedSource) p.set('origem', selectedSource)
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
    { stage: 'Pendente',    value: overview.novo_value,        color: '#3B82F6' },
    { stage: 'Qualificado', value: overview.qualificado_value, color: '#10B981' },
    { stage: 'Proposta',    value: overview.proposta_value,    color: '#F59E0B' },
    { stage: 'Negociação',  value: overview.negociacao_value,  color: '#8B5CF6' },
    { stage: 'Fechado',     value: overview.fechado_value,     color: '#059669' },
    { stage: 'Perdido',     value: overview.perdido_value,     color: '#EF4444' },
  ]

  function fmtBrl(v: number) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
  }

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
    {
      from: 'Total', to: 'Perdido', fromCount: distTotal, toCount: overview.perdido,
      rate: distTotal > 0 ? +((overview.perdido / distTotal) * 100).toFixed(1) : 0,
      color: '#EF4444', Icon: XCircle,
      note: `${overview.perdido} leads perdidos no período`,
      nav: cardNav({ status: 'sale_not_performed' }),
    },
  ]

  return (
    <>
    <main className="px-4 md:px-8 xl:px-12 py-6 flex flex-col gap-6">

        {/* Header + filtros */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-2)' }}>Pipeline de Vendas</h1>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>Visão do funil de vendas em tempo real</p>
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>De</span>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              style={{ fontSize: 13, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border-in)', color: 'var(--text-3)', background: 'var(--bg-input)', cursor: 'pointer' }}
            />
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>Até</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              style={{ fontSize: 13, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border-in)', color: 'var(--text-3)', background: 'var(--bg-input)', cursor: 'pointer' }}
            />
            <select
              value={selectedSource}
              onChange={e => setSelectedSource(e.target.value)}
              style={{ fontSize: 13, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border-in)', color: selectedSource ? 'var(--text-3)' : 'var(--text-subtle)', background: 'var(--bg-input)', cursor: 'pointer', minWidth: 160 }}
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
              <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>{card.label}</span>
              <span style={{ fontSize: 36, fontWeight: 700, color: card.color, lineHeight: 1 }}>{card.value}</span>
            </div>
          ))}
        </div>

        {/* Distribuição + Conversões */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 xl:gap-6">

          <div className="bg-white rounded-xl p-6 flex flex-col gap-0" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 20 }}>
              Distribuição Financeira do Pipeline
            </h2>
            {(() => {
              const totalValue = distStages.reduce((sum, s) => sum + s.value, 0)
              const finCards = [
                { label: 'Valor Total',    value: totalValue,                   color: 'var(--text-3)',  bg: 'var(--bg-subtle)', border: 'var(--border)', nav: null },
                { label: 'Em Proposta',    value: overview.proposta_value,      color: '#F59E0B',        bg: '#FFFBEB',           border: '#FDE68A',       nav: cardNav({ status: 'proposal_sent' }) },
                { label: 'Em Negociação',  value: overview.negociacao_value,    color: '#8B5CF6',        bg: '#F5F3FF',           border: '#DDD6FE',       nav: cardNav({ perception: 'Quente,Morno' }) },
                { label: 'Fechado',        value: overview.fechado_value,       color: '#059669',        bg: '#ECFDF5',           border: '#A7F3D0',       nav: cardNav({ status: 'waiting_billing,sale_performed,fechado,closed,won,convertido' }) },
                { label: 'Perdido',        value: overview.perdido_value,       color: '#EF4444',        bg: '#FEF2F2',           border: '#FECACA',       nav: cardNav({ status: 'sale_not_performed' }) },
              ]
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {finCards.map((fc, i) => (
                    <div
                      key={i}
                      onClick={() => fc.nav && navigate(`/leads-report${fc.nav}`)}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderRadius: 10, background: fc.bg, border: `1px solid ${fc.border}`, cursor: fc.nav ? 'pointer' : 'default', transition: 'opacity 150ms' }}
                      onMouseEnter={e => { if (fc.nav) e.currentTarget.style.opacity = '0.85' }}
                      onMouseLeave={e => { if (fc.nav) e.currentTarget.style.opacity = '1' }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 600, color: fc.color }}>{fc.label}</span>
                      <span style={{ fontSize: 18, fontWeight: 700, color: fc.color, letterSpacing: '-0.02em' }}>{fmtBrl(fc.value)}</span>
                    </div>
                  ))}
                </div>
              )
            })()}
          </div>

          <div className="bg-white rounded-xl p-6 flex flex-col" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16 }}>
              Conversões do Funil
            </h2>

            {/* KPIs executivos */}
            {(() => {
              const mainConvs = convs.slice(0, 4)
              const lostConv  = convs[4]
              const totalRate = distTotal > 0 ? +((overview.fechado / distTotal) * 100).toFixed(1) : 0
              const bottleneck = mainConvs.reduce((a, b) => a.rate <= b.rate ? a : b)
              const bestConv   = mainConvs.reduce((a, b) => a.rate >= b.rate ? a : b)
              const worstConv  = bottleneck

              return (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1, background: 'var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
                    <div style={{ background: 'var(--bg-subtle)', padding: '14px 16px' }}>
                      <p style={{ fontSize: 11, color: 'var(--text-subtle)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Conversão Total</p>
                      <p style={{ fontSize: 22, fontWeight: 700, color: '#059669', lineHeight: 1, margin: 0 }}>{totalRate}<span style={{ fontSize: 14, fontWeight: 600, marginLeft: 2 }}>%</span></p>
                      <p style={{ fontSize: 10, color: 'var(--text-subtle)', marginTop: 4 }}>Pendente → Fechado</p>
                    </div>
                    <div style={{ background: 'var(--bg-subtle)', padding: '14px 16px' }}>
                      <p style={{ fontSize: 11, color: 'var(--text-subtle)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Leads Perdidos</p>
                      <p style={{ fontSize: 22, fontWeight: 700, color: '#EF4444', lineHeight: 1, margin: 0 }}>{lostConv.rate}<span style={{ fontSize: 14, fontWeight: 600, marginLeft: 2 }}>%</span></p>
                      <p style={{ fontSize: 10, color: 'var(--text-subtle)', marginTop: 4 }}>{overview.perdido} leads no período</p>
                    </div>
                    <div style={{ background: 'var(--bg-subtle)', padding: '14px 16px' }}>
                      <p style={{ fontSize: 11, color: 'var(--text-subtle)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Maior Gargalo</p>
                      <p style={{ fontSize: 13, fontWeight: 700, color: '#F59E0B', lineHeight: 1.3, margin: 0 }}>{worstConv.from} → {worstConv.to}</p>
                      <p style={{ fontSize: 10, color: 'var(--text-subtle)', marginTop: 4 }}>{worstConv.rate}% de conversão</p>
                    </div>
                  </div>

                  {/* Linhas por etapa */}
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {mainConvs.map((c, i) => {
                      const isBest  = c === bestConv
                      const isWorst = c === worstConv
                      return (
                        <div
                          key={i}
                          onClick={() => navigate(`/leads-report${c.nav}`)}
                          style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '13px 8px', cursor: 'pointer', borderBottom: i < mainConvs.length - 1 ? '1px solid var(--border)' : 'none', borderRadius: 8, transition: 'background 150ms' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <div style={{ width: 56, textAlign: 'right', flexShrink: 0 }}>
                            <span style={{ fontSize: 20, fontWeight: 700, color: c.color, lineHeight: 1 }}>{c.rate}<span style={{ fontSize: 12, fontWeight: 500, marginLeft: 1 }}>%</span></span>
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-3)' }}>{c.from} → {c.to}</span>
                            </div>
                            <span style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 2, display: 'block' }}>{c.fromCount} → {c.toCount} leads</span>
                          </div>
                        </div>
                      )
                    })}

                    {/* Linha separadora — Perdido */}
                    <div
                      onClick={() => navigate(`/leads-report${lostConv.nav}`)}
                      style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '13px 8px', cursor: 'pointer', marginTop: 8, borderTop: '1px dashed var(--border)', borderRadius: 8, transition: 'background 150ms' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <div style={{ width: 56, textAlign: 'right', flexShrink: 0 }}>
                        <span style={{ fontSize: 20, fontWeight: 700, color: '#EF4444', lineHeight: 1 }}>{lostConv.rate}<span style={{ fontSize: 12, fontWeight: 500, marginLeft: 1 }}>%</span></span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-3)' }}>Total → Perdido</span>
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 2, display: 'block' }}>{overview.perdido} leads perdidos no período</span>
                      </div>
                    </div>
                  </div>
                </>
              )
            })()}
          </div>

        </div>

        {/* Alertas + Tempo Médio */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 xl:gap-6">

          <div
            className="bg-white rounded-xl p-6 flex flex-col gap-3"
            style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderLeft: '4px solid #EF4444', cursor: 'pointer', transition: 'transform 200ms' }}
            onClick={() => navigate('/leads-report' + cardNav({ vencidos: '1' }))}
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
            <p style={{ fontSize: 11, color: 'var(--text-subtle)' }}>Qualquer status sem atenção nas últimas 24h</p>
            <p style={{ fontSize: 12, color: '#3B82F6', fontWeight: 500 }}>Ver no Relatório →</p>
          </div>

          <div
            className="bg-white rounded-xl p-6 flex flex-col gap-4"
            style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderLeft: '4px solid #F59E0B', cursor: 'pointer', transition: 'transform 200ms' }}
            onClick={() => navigate('/leads-report' + cardNav({ status: 'pending,novo,new' }))}
            onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.02)')}
            onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
          >
            <div className="flex items-center gap-2">
              <span style={{ fontSize: 15 }}>🟡</span>
              <h2 style={{ fontSize: 13, fontWeight: 700, color: '#B45309', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Não Contatados
              </h2>
              <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: '#B45309', background: '#FFFBEB', padding: '2px 8px', borderRadius: 99 }}>
                {alerts.uncontacted_count ?? alerts.uncontacted.length} leads
              </span>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-subtle)' }}>Status Novo sem movimento nas últimas 24h</p>
            <p style={{ fontSize: 12, color: '#3B82F6', fontWeight: 500 }}>Ver no Relatório →</p>
          </div>

          <div className="bg-white rounded-xl p-6 flex flex-col gap-3" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderLeft: '4px solid #6366F1' }}>
            <div className="flex items-center gap-2">
              <Timer size={15} color="#6366F1" />
              <h2 style={{ fontSize: 13, fontWeight: 700, color: '#4338CA', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Tempo Médio no Funil
              </h2>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-subtle)' }}>Média do ciclo completo (fechado + perdido)</p>
            <p style={{ fontSize: 36, fontWeight: 700, color: '#6366F1', lineHeight: 1 }}>
              {alerts.avg_time_in_funnel ?? 0}<span style={{ fontSize: 16, fontWeight: 500, marginLeft: 4 }}>dias</span>
            </p>
            {(alerts.avg_time_in_funnel ?? 0) === 0 && (
              <p style={{ fontSize: 11, color: 'var(--text-subtle)' }}>Sem leads finalizados no período</p>
            )}
          </div>

        </div>

      </main>
    </>
  )
}
