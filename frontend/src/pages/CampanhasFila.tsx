import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MessageCircle, Mail, MessageSquare, X, Check, Send, Copy } from 'lucide-react'
import api from '../api'
import { useTheme } from '../ThemeContext'

type Canal = 'whatsapp' | 'email' | 'sms'

interface FilaLead {
  id: string
  name: string
  phone: string | null
  email: string | null
  origem: string | null
  modalidade: string | null
  status: string | null
  perception: string | null
  value_potential: number | null
  campanha_status: 'fila' | 'disparado_sem_resposta'
  updated_at: string | null
}

interface Template {
  id: string
  titulo: string
  corpo: string
}

const CANAL_CFG: { key: Canal; label: string; Icon: typeof MessageCircle; color: string; bg: string }[] = [
  { key: 'whatsapp', label: 'WhatsApp', Icon: MessageCircle, color: '#16A34A', bg: '#EAF7EE' },
  { key: 'email', label: 'E-mail', Icon: Mail, color: '#3B82F6', bg: '#EAF1FE' },
  { key: 'sms', label: 'SMS', Icon: MessageSquare, color: '#8B5CF6', bg: '#F2EEFE' },
]

const PERCEPTION_STYLE: Record<string, string> = { Quente: '#DC2626', Morno: '#D97706', Frio: '#3B82F6' }

function fmtBRL(n: number | null) {
  if (n == null || n === 0) return '—'
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function fmtAgo(iso: string | null): string {
  if (!iso) return '—'
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (days <= 0) return 'hoje'
  if (days === 1) return 'ontem'
  return `há ${days} dias`
}

function initials(name: string) {
  const p = name.trim().split(/\s+/)
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase()
}

function primeiroNome(name: string) {
  return name.trim().split(/\s+/)[0] ?? name
}

type StatusFiltro = 'todos' | 'fila' | 'disparado_sem_resposta'

export default function CampanhasFila() {
  const { dark } = useTheme()
  const navigate = useNavigate()
  const [canal, setCanal] = useState<Canal>('whatsapp')
  const [counts, setCounts] = useState<Record<Canal, number>>({ whatsapp: 0, email: 0, sms: 0 })
  const [leads, setLeads] = useState<FilaLead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actingId, setActingId] = useState<string | null>(null)
  const [confirmRespondeu, setConfirmRespondeu] = useState<string | null>(null)
  const [statusFiltro, setStatusFiltro] = useState<StatusFiltro>('todos')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkActing, setBulkActing] = useState(false)
  const [templates, setTemplates] = useState<Template[]>([])
  const [menuAbertoPara, setMenuAbertoPara] = useState<string | null>(null)
  const [textoCopiadoPara, setTextoCopiadoPara] = useState<string | null>(null)

  const fetchCounts = useCallback(() => {
    api.get<Record<Canal, number>>('/api/v1/campanhas/fila/contagem')
      .then(r => setCounts(r.data))
      .catch(() => {})
  }, [])

  useEffect(() => {
    api.get<Template[]>('/api/v1/campanhas/templates', { params: { canal } })
      .then(r => setTemplates(r.data))
      .catch(() => setTemplates([]))
    setMenuAbertoPara(null)
  }, [canal])

  function copiarModeloPara(lead: FilaLead, template: Template) {
    const texto = template.corpo.replace(/\{nome\}/g, primeiroNome(lead.name))
    navigator.clipboard.writeText(texto).then(() => {
      setTextoCopiadoPara(lead.id)
      setTimeout(() => setTextoCopiadoPara(prev => prev === lead.id ? null : prev), 1500)
    }).catch(() => {})
    setMenuAbertoPara(null)
  }

  const fetchFila = useCallback((c: Canal) => {
    setLoading(true)
    setError('')
    api.get<FilaLead[]>('/api/v1/campanhas/fila', { params: { canal: c } })
      .then(r => setLeads(r.data))
      .catch(() => setError('Não foi possível carregar a fila.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchCounts() }, [fetchCounts])
  useEffect(() => { fetchFila(canal); setConfirmRespondeu(null); setStatusFiltro('todos'); setSelected(new Set()) }, [canal, fetchFila])
  useEffect(() => { setSelected(new Set()) }, [statusFiltro])

  function marcarDesfecho(leadId: string, desfecho: 'disparado_sem_resposta' | 'respondeu' | 'nao_retrabalhar') {
    setActingId(leadId)
    api.post(`/api/v1/campanhas/${leadId}/desfecho`, { desfecho })
      .then(() => {
        // "Disparo efetuado" só atualiza o status na tela — o lead continua na
        // fila esperando resposta. "Respondeu" e "Não retrabalhar" resolvem
        // de vez e saem da lista.
        if (desfecho === 'disparado_sem_resposta') {
          setLeads(prev => prev.map(l => l.id === leadId ? { ...l, campanha_status: 'disparado_sem_resposta' } : l))
        } else {
          setLeads(prev => prev.filter(l => l.id !== leadId))
        }
        fetchCounts()
        setConfirmRespondeu(null)
      })
      .catch(() => setError('Erro ao marcar o desfecho. Tente novamente.'))
      .finally(() => setActingId(null))
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function marcarDisparoEmMassa() {
    const ids = [...selected]
    if (ids.length === 0) return
    setBulkActing(true)
    setError('')
    const results = await Promise.allSettled(
      ids.map(id => api.post(`/api/v1/campanhas/${id}/desfecho`, { desfecho: 'disparado_sem_resposta' })),
    )
    const okIds = new Set(ids.filter((_, i) => results[i].status === 'fulfilled'))
    setLeads(prev => prev.map(l => okIds.has(l.id) ? { ...l, campanha_status: 'disparado_sem_resposta' } : l))
    const falharam = ids.filter(id => !okIds.has(id))
    setSelected(new Set(falharam))
    fetchCounts()
    if (falharam.length > 0) setError(`${falharam.length} lead(s) não puderam ser marcados. Tente novamente.`)
    setBulkActing(false)
  }

  const cfg = CANAL_CFG.find(c => c.key === canal)!
  const totalAguardando = leads.filter(l => l.campanha_status === 'fila').length
  const totalDisparado = leads.filter(l => l.campanha_status === 'disparado_sem_resposta').length
  const leadsFiltrados = leads.filter(l => statusFiltro === 'todos' || l.campanha_status === statusFiltro)
  const todosSelecionados = leadsFiltrados.length > 0 && leadsFiltrados.every(l => selected.has(l.id))

  function toggleSelectAll() {
    setSelected(todosSelecionados ? new Set() : new Set(leadsFiltrados.map(l => l.id)))
  }

  return (
    <main className="px-4 md:px-8 xl:px-12 py-6 flex flex-col gap-5" style={{ background: dark ? 'transparent' : '#EEF1F5', minHeight: '100%' }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-2)', margin: 0 }}>Campanhas</h1>
        <p style={{ fontSize: 13, color: 'var(--text-subtle)', marginTop: 3 }}>
          Disparo em massa — marque "Disparo efetuado" assim que enviar a mensagem, e volte depois pra registrar se respondeu.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        {CANAL_CFG.map(c => {
          const active = canal === c.key
          return (
            <button
              key={c.key}
              onClick={() => setCanal(c.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 10, cursor: 'pointer',
                border: `1px solid ${active ? c.color : 'var(--border)'}`,
                background: active ? c.bg : 'var(--bg-card)',
                color: active ? c.color : 'var(--text-2)',
                fontSize: 13, fontWeight: 700,
              }}
            >
              <c.Icon size={15} />
              {c.label}
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 999,
                background: active ? 'rgba(255,255,255,0.6)' : 'var(--bg-subtle)',
                color: active ? c.color : 'var(--text-muted)',
              }}>
                {counts[c.key]}
              </span>
            </button>
          )
        })}
      </div>

      {!loading && leads.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)', cursor: 'pointer' }}>
            <input type="checkbox" checked={todosSelecionados} onChange={toggleSelectAll} style={{ cursor: 'pointer' }} />
            Selecionar todos
          </label>
          <div style={{ display: 'flex', gap: 6 }}>
            {([
              ['todos', `Todos · ${leads.length}`],
              ['fila', `Aguardando disparo · ${totalAguardando}`],
              ['disparado_sem_resposta', `Disparo efetuado · ${totalDisparado}`],
            ] as const).map(([key, label]) => {
              const active = statusFiltro === key
              return (
                <button
                  key={key}
                  onClick={() => setStatusFiltro(key)}
                  style={{
                    fontSize: 11.5, fontWeight: 600, padding: '6px 12px', borderRadius: 999, cursor: 'pointer',
                    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                    background: active ? 'var(--accent-weak)' : 'var(--bg-card)',
                    color: active ? 'var(--accent)' : 'var(--text-muted)',
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {selected.size > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--accent-weak)', borderRadius: 10, padding: '10px 14px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)' }}>{selected.size} selecionado{selected.size !== 1 ? 's' : ''}</span>
          <button
            onClick={marcarDisparoEmMassa}
            disabled={bulkActing}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 8, fontSize: 12, fontWeight: 700, border: '1px solid var(--accent)', background: 'var(--accent)', color: '#fff', cursor: bulkActing ? 'not-allowed' : 'pointer' }}
          >
            <Send size={12} /> {bulkActing ? 'Marcando…' : 'Marcar disparo efetuado'}
          </button>
          <button
            onClick={() => setSelected(new Set())}
            disabled={bulkActing}
            style={{ padding: '7px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, border: 'none', background: 'none', color: 'var(--text-muted)', cursor: bulkActing ? 'not-allowed' : 'pointer' }}
          >
            Limpar seleção
          </button>
        </div>
      )}

      {error && <p style={{ color: '#EF4444', fontSize: 13 }}>{error}</p>}

      {loading ? (
        <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-subtle)', padding: '40px 0' }}>Carregando…</p>
      ) : leadsFiltrados.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', background: 'var(--bg-card)', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <p style={{ fontSize: 13, color: 'var(--text-subtle)', margin: 0 }}>
            {leads.length === 0 ? `Nenhum lead esperando ação no ${cfg.label}.` : 'Nenhum lead nesse filtro.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {leadsFiltrados.map(lead => {
            const percColor = lead.perception ? PERCEPTION_STYLE[lead.perception] : null
            const acting = actingId === lead.id
            const jaDisparado = lead.campanha_status === 'disparado_sem_resposta'
            return (
              <div
                key={lead.id}
                onClick={() => navigate(`/leads/${lead.id}`)}
                style={{
                  display: 'grid', gridTemplateColumns: 'auto minmax(200px,1.6fr) 110px 90px 1fr auto', alignItems: 'center', gap: 14,
                  background: 'var(--bg-card)', borderRadius: 12, padding: '13px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                  cursor: 'pointer', opacity: acting ? 0.6 : 1,
                }}
              >
                <input
                  type="checkbox"
                  checked={selected.has(lead.id)}
                  onChange={() => toggleSelect(lead.id)}
                  onClick={e => e.stopPropagation()}
                  style={{ width: 16, height: 16, cursor: 'pointer' }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <span style={{ width: 32, height: 32, borderRadius: 9, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff', background: '#94A3B8' }}>
                    {initials(lead.name)}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lead.name}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-subtle)' }}>{lead.phone || lead.email || '—'}</div>
                  </div>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{lead.modalidade ?? '—'}</div>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: lead.value_potential ? 'var(--text-1)' : 'var(--text-subtle)' }}>{fmtBRL(lead.value_potential)}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11.5, color: 'var(--text-subtle)' }}>
                  {percColor && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 700, color: percColor }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: percColor }} />{lead.perception}
                    </span>
                  )}
                  {jaDisparado ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 700, color: 'var(--success)', background: 'var(--success-weak)', borderRadius: 999, padding: '2px 9px' }}>
                      <Check size={11} /> Disparo efetuado
                    </span>
                  ) : (
                    <span style={{ fontWeight: 600, color: 'var(--warning)' }}>Aguardando disparo</span>
                  )}
                  <span>{fmtAgo(lead.updated_at)}</span>
                </div>

                <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 6 }}>
                  {jaDisparado ? (
                    <span
                      title="Disparo já marcado como efetuado"
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 10px', borderRadius: 8, fontSize: 11.5, fontWeight: 600, border: '1px solid var(--border-lt)', background: 'var(--bg-subtle)', color: 'var(--text-subtle)' }}
                    >
                      <Check size={13} /> Disparado
                    </span>
                  ) : (
                    <button
                      title="Marcar disparo como efetuado"
                      disabled={acting}
                      onClick={() => marcarDesfecho(lead.id, 'disparado_sem_resposta')}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 10px', borderRadius: 8, fontSize: 11.5, fontWeight: 700, border: '1px solid var(--accent)', background: 'var(--accent-weak)', color: 'var(--accent)', cursor: acting ? 'not-allowed' : 'pointer' }}
                    >
                      <Send size={12} /> Disparo efetuado
                    </button>
                  )}

                  {confirmRespondeu === lead.id ? (
                    <button
                      disabled={acting}
                      onClick={() => marcarDesfecho(lead.id, 'respondeu')}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 10px', borderRadius: 8, fontSize: 11.5, fontWeight: 700, border: '1px solid var(--success)', background: 'var(--success)', color: '#fff', cursor: acting ? 'not-allowed' : 'pointer' }}
                    >
                      <Check size={13} /> Confirmar
                    </button>
                  ) : (
                    <button
                      title="Respondeu"
                      disabled={acting}
                      onClick={() => setConfirmRespondeu(lead.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 10px', borderRadius: 8, fontSize: 11.5, fontWeight: 700, border: '1px solid var(--success)', background: 'var(--success-weak)', color: 'var(--success)', cursor: acting ? 'not-allowed' : 'pointer' }}
                    >
                      <Check size={13} /> Respondeu
                    </button>
                  )}

                  <button
                    title="Não retrabalhar"
                    disabled={acting}
                    onClick={() => marcarDesfecho(lead.id, 'nao_retrabalhar')}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, borderRadius: 8, fontSize: 11.5, fontWeight: 600, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--danger)', cursor: acting ? 'not-allowed' : 'pointer' }}
                  >
                    <X size={14} />
                  </button>

                  {templates.length > 0 && (
                    <div style={{ position: 'relative' }}>
                      <button
                        title="Copiar mensagem de um modelo"
                        onClick={() => setMenuAbertoPara(prev => prev === lead.id ? null : lead.id)}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: '100%', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: textoCopiadoPara === lead.id ? 'var(--success)' : 'var(--text-muted)', cursor: 'pointer' }}
                      >
                        {textoCopiadoPara === lead.id ? <Check size={14} /> : <Copy size={14} />}
                      </button>
                      {menuAbertoPara === lead.id && (
                        <div
                          onClick={e => e.stopPropagation()}
                          style={{
                            position: 'absolute', top: '110%', right: 0, zIndex: 20, minWidth: 180, maxWidth: 260,
                            background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 10px 28px rgba(15,23,42,0.18)', overflow: 'hidden',
                          }}
                        >
                          {templates.map(t => (
                            <button
                              key={t.id}
                              onClick={() => copiarModeloPara(lead, t)}
                              style={{
                                width: '100%', display: 'block', padding: '9px 12px', textAlign: 'left', cursor: 'pointer',
                                border: 'none', borderBottom: '1px solid var(--border-lt)', background: 'transparent', fontSize: 12, fontWeight: 600, color: 'var(--text-2)',
                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                              }}
                            >
                              {t.titulo}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}
