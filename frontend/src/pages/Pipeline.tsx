import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clock, CheckSquare, FileText, Handshake, Timer, XCircle, ChevronDown } from 'lucide-react'
import api from '../api'

interface PipelineOverview {
  novo: number; qualificado: number; proposta: number; negociacao: number; fechado: number; perdido: number
  novo_value: number; qualificado_value: number; proposta_value: number; negociacao_value: number; fechado_value: number; perdido_value: number
}
interface AlertLead { id: string; name: string; hours_without_action?: number; status?: string }
interface PipelineAlerts { vencidos: AlertLead[]; uncontacted: AlertLead[]; vencidos_count?: number; uncontacted_count?: number; avg_time_in_funnel?: number; avg_first_contact_minutes?: number; contacted_count?: number }

const CONV_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#059669']

export default function Pipeline() {
  const navigate = useNavigate()
  const _now = new Date()
  const todayStr   = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}-${String(_now.getDate()).padStart(2, '0')}`
  const monthStart = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}-01`

  const [dateFrom, setDateFrom]       = useState(monthStart)
  const [dateTo,   setDateTo]         = useState(todayStr)
  const [selectedSources, setSelectedSources] = useState<string[]>([])
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const [sources, setSources] = useState<string[]>([])

  const [overview, setOverview] = useState<PipelineOverview | null>(null)
  const [alerts, setAlerts] = useState<PipelineAlerts | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  interface MotivoItem { reason: string; count: number; pct: number; total_value: number }
  const [showLostModal, setShowLostModal] = useState(false)
  const [motivos, setMotivos] = useState<MotivoItem[]>([])
  const [motivosLoading, setMotivosLoading] = useState(false)

  useEffect(() => {
    if (localStorage.getItem('token')) {
      api.get<string[]>('/api/v1/leads/origins').then(r => setSources(r.data)).catch(() => {})
    }
  }, [])

  const fetchAll = useCallback(() => {
    if (!localStorage.getItem('token')) { navigate('/login'); return }
    const qs = new URLSearchParams({ date_from: dateFrom, date_to: dateTo })
    if (selectedSources.length > 0) qs.set('source', selectedSources.join(','))
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
  }, [navigate, dateFrom, dateTo, selectedSources])

  useEffect(() => { fetchAll() }, [fetchAll])

  function openLostModal() {
    setShowLostModal(true)
    setMotivosLoading(true)
    api.get<MotivoItem[]>('/api/v1/kpis/motivos-cancelamento', { params: { date_from: dateFrom, date_to: dateTo } })
      .then(r => setMotivos(r.data))
      .catch(() => setMotivos([]))
      .finally(() => setMotivosLoading(false))
  }

  if (loading) return (
    <p className="text-center text-sm mt-20" style={{ color: 'var(--text-subtle)' }}>Carregando...</p>
  )

  if (error || !overview || !alerts) return (
    <p className="text-center text-sm mt-20" style={{ color: '#EF4444' }}>{error || 'Sem dados.'}</p>
  )

  const cardNav = (params: Record<string, string>) => {
    const p = new URLSearchParams({ date_from: dateFrom, date_to: dateTo, ...params })
    if (selectedSources.length > 0) p.set('origem', selectedSources.join(','))
    return `?${p.toString()}`
  }

  const overviewCards = [
    { label: 'Pendente',    value: overview.novo,        color: '#3B82F6', bg: '#EFF6FF', icon: '📥', nav: cardNav({ status: 'pending,novo,new' }) },
    { label: 'Agendado', value: overview.qualificado, color: '#10B981', bg: '#ECFDF5', icon: '✅', nav: cardNav({ status: 'scheduled,qualificado,qualified' }) },
    { label: 'Enviada',    value: overview.proposta,    color: '#F59E0B', bg: '#FFFBEB', icon: '📄', nav: cardNav({ status: 'proposal_sent' }) },
    { label: 'Qualificado',  value: overview.negociacao,  color: '#8B5CF6', bg: '#F5F3FF', icon: '🔥', nav: cardNav({ perception: 'Quente,Morno' }) },
    { label: 'Fechado',     value: overview.fechado,     color: '#059669', bg: '#ECFDF5', icon: '🏆', nav: cardNav({ status: 'waiting_billing,sale_performed,fechado,closed,won,convertido' }) },
    { label: 'Perdido',     value: overview.perdido,     color: '#EF4444', bg: '#FEF2F2', icon: '❌', nav: cardNav({ status: 'sale_not_performed' }), onOpen: openLostModal },
  ]

  const distTotal = overview.novo + overview.qualificado + overview.proposta + overview.negociacao + overview.fechado + overview.perdido
  const distStages = [
    { stage: 'Pendente',    value: overview.novo_value,        color: '#3B82F6' },
    { stage: 'Agendado', value: overview.qualificado_value, color: '#10B981' },
    { stage: 'Enviada',     value: overview.proposta_value,    color: '#F59E0B' },
    { stage: 'Qualificado',  value: overview.negociacao_value,  color: '#8B5CF6' },
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
      from: 'Pendente', to: 'Agendado', fromCount: distTotal, toCount: qualOL,
      rate: distTotal > 0 ? +((qualOL / distTotal) * 100).toFixed(1) : 0,
      color: CONV_COLORS[0], Icon: Clock,
      note: `${overview.novo} ainda pendentes · ${overview.perdido} perdidos sem converter`,
      nav: cardNav({ status: 'pending,novo,new' }),
    },
    {
      from: 'Agendado', to: 'Enviada', fromCount: qualOL, toCount: propOL,
      rate: qualOL > 0 ? +((propOL / qualOL) * 100).toFixed(1) : 0,
      color: CONV_COLORS[1], Icon: CheckSquare,
      note: `${overview.qualificado} ainda agendados`,
      nav: cardNav({ status: 'scheduled,qualificado,qualified' }),
    },
    {
      from: 'Enviada', to: 'Qualificado', fromCount: propOL, toCount: negOL,
      rate: propOL > 0 ? +((negOL / propOL) * 100).toFixed(1) : 0,
      color: CONV_COLORS[2], Icon: FileText,
      note: `${overview.proposta} propostas enviadas`,
      nav: cardNav({ status: 'proposal_sent' }),
    },
    {
      from: 'Qualificado', to: 'Fechado', fromCount: negOL, toCount: overview.fechado,
      rate: negOL > 0 ? +((overview.fechado / negOL) * 100).toFixed(1) : 0,
      color: CONV_COLORS[3], Icon: Handshake,
      note: `${overview.negociacao} qualificados`,
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
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setSourcesOpen(o => !o)}
                style={{ fontSize: 13, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border-in)', color: selectedSources.length > 0 ? 'var(--text-3)' : 'var(--text-subtle)', background: 'var(--bg-input)', cursor: 'pointer', minWidth: 160, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
              >
                <span>{selectedSources.length === 0 ? 'Todas as origens' : selectedSources.length === 1 ? selectedSources[0] : `${selectedSources.length} origens selecionadas`}</span>
                <ChevronDown size={13} />
              </button>
              {sourcesOpen && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setSourcesOpen(false)} />
                  <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, background: 'var(--bg-card, white)', border: '1px solid var(--border-in)', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 100, minWidth: 220, maxHeight: 280, overflowY: 'auto' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #F1F5F9' }}>
                      <input type="checkbox" checked={selectedSources.length === 0} onChange={() => setSelectedSources([])} readOnly />
                      <span style={{ color: 'var(--text-2)' }}>Todas as origens</span>
                    </label>
                    {sources.map(s => (
                      <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13 }}>
                        <input
                          type="checkbox"
                          checked={selectedSources.includes(s)}
                          onChange={() => setSelectedSources(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])}
                        />
                        <span style={{ color: 'var(--text-2)' }}>{s}</span>
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Overview cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 xl:gap-6">
          {overviewCards.map(card => (
            <div
              key={card.label}
              className="bg-white rounded-xl p-5 flex flex-col gap-2"
              style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.1)', transition: 'transform 200ms', cursor: 'pointer' }}
              onClick={() => (card as any).onOpen ? (card as any).onOpen() : navigate(`/leads-report${card.nav}`)}
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
                { label: 'Agendado',       value: overview.qualificado_value,   color: '#10B981',        bg: '#ECFDF5',           border: '#A7F3D0',       nav: cardNav({ status: 'scheduled,qualificado,qualified' }) },
                { label: 'Enviada',        value: overview.proposta_value,      color: '#F59E0B',        bg: '#FFFBEB',           border: '#FDE68A',       nav: cardNav({ status: 'proposal_sent' }) },
                { label: 'Qualificado',  value: overview.negociacao_value,    color: '#8B5CF6',        bg: '#F5F3FF',           border: '#DDD6FE',       nav: cardNav({ perception: 'Quente,Morno' }) },
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

          <div className="bg-white rounded-xl p-6 flex flex-col gap-3" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderLeft: '4px solid #10B981' }}>
            <div className="flex items-center gap-2">
              <span style={{ fontSize: 15 }}>⚡</span>
              <h2 style={{ fontSize: 13, fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Desempenho no Atendimento
              </h2>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-subtle)' }}>Tempo médio em "Novo" antes de avançar no funil</p>
            <p style={{ fontSize: 36, fontWeight: 700, color: '#10B981', lineHeight: 1 }}>
              {alerts.avg_first_contact_minutes ?? 0}<span style={{ fontSize: 16, fontWeight: 500, marginLeft: 4 }}>min</span>
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-subtle)' }}>
              {alerts.contacted_count ?? 0} leads atendidos no período
            </p>
          </div>

          <div className="bg-white rounded-xl p-6 flex flex-col gap-3" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderLeft: '4px solid #6366F1' }}>
            <div className="flex items-center gap-2">
              <Timer size={15} color="#6366F1" />
              <h2 style={{ fontSize: 13, fontWeight: 700, color: '#4338CA', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Tempo Médio para o Fechamento
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

      {showLostModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setShowLostModal(false)}
        >
          <div
            style={{ background: 'var(--bg-card, white)', borderRadius: 16, width: '100%', maxWidth: 520, maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-2)', margin: 0 }}>Motivos de Cancelamento</h2>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                  {dateFrom} até {dateTo} · {overview.perdido} leads perdidos
                </p>
              </div>
              <button
                onClick={() => setShowLostModal(false)}
                style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--text-muted)', cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}
              >
                ×
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '16px 24px 24px' }}>
              {motivosLoading ? (
                <p style={{ fontSize: 13, color: 'var(--text-subtle)', textAlign: 'center', padding: '24px 0' }}>Carregando...</p>
              ) : motivos.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--text-subtle)', textAlign: 'center', padding: '24px 0' }}>Nenhum motivo registrado no período.</p>
              ) : (
                <>
                  {/* Total R$ perdido */}
                  <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '14px 16px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#EF4444' }}>Total R$ perdido</span>
                    <span style={{ fontSize: 20, fontWeight: 700, color: '#EF4444' }}>
                      {fmtBrl(motivos.reduce((s, m) => s + m.total_value, 0))}
                    </span>
                  </div>

                  {/* Lista de motivos */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {motivos.map((m, i) => (
                      <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', flex: 1, minWidth: 0 }}>{m.reason}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: '#EF4444', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 99, padding: '2px 10px', whiteSpace: 'nowrap' }}>
                              {m.count} lead{m.count !== 1 ? 's' : ''}
                            </span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-3)', minWidth: 90, textAlign: 'right' }}>
                              {fmtBrl(m.total_value)}
                            </span>
                          </div>
                        </div>
                        {/* Barra de progresso */}
                        <div style={{ height: 5, background: 'var(--bg-subtle)', borderRadius: 99, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${m.pct}%`, background: '#EF4444', borderRadius: 99, opacity: 0.7 }} />
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>{m.pct}% dos cancelamentos</span>
                      </div>
                    ))}
                  </div>

                  {/* Link para ver os leads */}
                  <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                    <button
                      onClick={() => { setShowLostModal(false); navigate(`/leads-report${cardNav({ status: 'sale_not_performed' })}`) }}
                      style={{ fontSize: 13, color: '#3B82F6', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    >
                      Ver todos os leads perdidos no Relatório →
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
