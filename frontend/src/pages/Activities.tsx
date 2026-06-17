import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Phone, Mail, FileText, Calendar } from 'lucide-react'
import api from '../api'

interface NextActions { call_today: number; send_email: number; follow_proposal: number; meetings: number }
interface ActivityLead {
  id: string; name: string; created_at: string | null
  status: string | null; action: string; attendant: string
  hours_idle: number; origin: string
}

const ACTION_COLORS: Record<string, { color: string; bg: string }> = {
  'Ligar':            { color: '#3B82F6', bg: '#EFF6FF' },
  'Enviar Email':     { color: '#10B981', bg: '#ECFDF5' },
  'Seguir Proposta':  { color: '#F59E0B', bg: '#FFFBEB' },
  'Contatar':         { color: '#6B7280', bg: '#F3F4F6' },
}

export default function Activities() {
  const navigate = useNavigate()
  const [actions, setActions]   = useState<NextActions | null>(null)
  const [leads, setLeads]       = useState<ActivityLead[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')

  const fetchAll = useCallback(() => {
    if (!localStorage.getItem('token')) { navigate('/login'); return }
    setLoading(true)
    Promise.all([
      api.get<NextActions>('/api/v1/activities/next-actions'),
      api.get<{ leads: ActivityLead[] }>('/api/v1/activities/list'),
    ])
      .then(([a, l]) => { setActions(a.data); setLeads(l.data.leads) })
      .catch(err => {
        if (err.response?.status === 401) { localStorage.removeItem('token'); navigate('/login') }
        else setError('Erro ao carregar atividades.')
      })
      .finally(() => setLoading(false))
  }, [navigate])

  useEffect(() => { fetchAll() }, [fetchAll])

  if (loading) return <p className="text-center text-sm mt-20" style={{ color: '#9CA3AF' }}>Carregando...</p>
  if (error || !actions) return <p className="text-center text-sm mt-20" style={{ color: '#EF4444' }}>{error}</p>

  const actionCards = [
    { label: 'Ligar Hoje',      Icon: Phone,    value: actions.call_today,      color: '#3B82F6', bg: '#EFF6FF', nav: '?status=pending' },
    { label: 'Enviar Email',    Icon: Mail,     value: actions.send_email,      color: '#10B981', bg: '#ECFDF5', nav: '?status=scheduled' },
    { label: 'Seguir Proposta', Icon: FileText, value: actions.follow_proposal, color: '#F59E0B', bg: '#FFFBEB', nav: '?status=proposal_sent' },
    { label: 'Reuniões',        Icon: Calendar, value: actions.meetings,        color: '#8B5CF6', bg: '#F5F3FF', nav: '' },
  ]

  function fmtDate(iso: string | null) {
    if (!iso) return '—'
    const d = new Date(iso)
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
  }

  return (
    <main className="px-4 md:px-8 xl:px-12 py-6 flex flex-col gap-6">

      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827' }}>Atividades</h1>
        <p style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}>Ações pendentes e leads que precisam de atenção</p>
      </div>

      {/* Cards de ações */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {actionCards.map(card => (
          <div
            key={card.label}
            className="bg-white rounded-xl p-5 flex items-center gap-4 cursor-pointer"
            style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)', transition: 'transform 200ms' }}
            onClick={() => card.nav && navigate(`/leads-report${card.nav}`)}
            onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.02)')}
            onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
          >
            <div style={{ width: 44, height: 44, borderRadius: 10, background: card.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <card.Icon size={20} color={card.color} />
            </div>
            <div>
              <p style={{ fontSize: 12, color: '#6B7280', fontWeight: 500 }}>{card.label}</p>
              <p style={{ fontSize: 28, fontWeight: 700, color: card.color, lineHeight: 1.2 }}>{card.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-xl" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #F3F4F6' }}>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Leads que Precisam de Ação
          </h2>
        </div>
        {leads.length === 0 ? (
          <p style={{ padding: '24px 20px', fontSize: 14, color: '#9CA3AF' }}>Nenhuma ação pendente.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#F9FAFB' }}>
                  {['Data', 'Cliente', 'Origem', 'Ação Necessária', 'Atribuído a', 'Idle'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: '#6B7280', fontSize: 12, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {leads.map((lead, i) => {
                  const ac = ACTION_COLORS[lead.action] || ACTION_COLORS['Contatar']
                  return (
                    <tr
                      key={lead.id}
                      style={{ borderTop: '1px solid #F3F4F6', cursor: 'pointer', background: i % 2 === 0 ? 'white' : '#FAFAFA' }}
                      onClick={() => navigate('/leads-report')}
                      onMouseEnter={e => (e.currentTarget.style.background = '#EFF6FF')}
                      onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? 'white' : '#FAFAFA')}
                    >
                      <td style={{ padding: '10px 16px', color: '#6B7280', whiteSpace: 'nowrap' }}>{fmtDate(lead.created_at)}</td>
                      <td style={{ padding: '10px 16px', fontWeight: 600, color: '#111827' }}>{lead.name}</td>
                      <td style={{ padding: '10px 16px', color: '#6B7280' }}>{lead.origin}</td>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{ padding: '3px 10px', borderRadius: 99, background: ac.bg, color: ac.color, fontWeight: 600, fontSize: 12 }}>
                          {lead.action}
                        </span>
                      </td>
                      <td style={{ padding: '10px 16px', color: '#374151' }}>{lead.attendant}</td>
                      <td style={{ padding: '10px 16px', color: lead.hours_idle > 24 ? '#EF4444' : '#6B7280', fontWeight: lead.hours_idle > 24 ? 600 : 400 }}>
                        {lead.hours_idle}h
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </main>
  )
}
