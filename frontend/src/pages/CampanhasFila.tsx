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

// Formato exigido pela plataforma de disparo: +55DDNNNNNNNNN, um por vírgula.
function normalizarTelefone(phone: string | null): string | null {
  if (!phone) return null
  let digits = phone.replace(/\D/g, '')
  if (!digits) return null
  if (!digits.startsWith('55') && (digits.length === 10 || digits.length === 11)) {
    digits = '55' + digits
  }
  return '+' + digits
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
  const [copyOpen, setCopyOpen] = useState(false)
  const [copyText, setCopyText] = useState('')
  const [copied, setCopied] = useState(false)

  const fetchCounts = useCallback(() => {
    api.get<Record<Canal, number>>('/api/v1/campanhas/fila/contagem')
      .then(r => setCounts(r.data))
      .catch(() => {})
  }, [])

  const fetchFila = useCallback((c: Canal) => {
    setLoading(true)
    setError('')
    api.get<FilaLead[]>('/api/v1/campanhas/fila', { params: { canal: c } })
      .then(r => setLeads(r.data))
      .catch(() => setError('Não foi possível carregar a fila.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchCounts() }, [fetchCounts])
  useEffect(() => { fetchFila(canal); setConfirmRespondeu(null); setStatusFiltro('todos') }, [canal, fetchFila])

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

  const cfg = CANAL_CFG.find(c => c.key === canal)!
  const totalAguardando = leads.filter(l => l.campanha_status === 'fila').length
  const totalDisparado = leads.filter(l => l.campanha_status === 'disparado_sem_resposta').length
  const leadsFiltrados = leads.filter(l => statusFiltro === 'todos' || l.campanha_status === statusFiltro)

  function abrirCopiarNumeros() {
    const numeros = leadsFiltrados.map(l => normalizarTelefone(l.phone)).filter((n): n is string => !!n)
    setCopyText(numeros.join(', '))
    setCopied(false)
    setCopyOpen(true)
  }

  function copiarNumeros() {
    navigator.clipboard.writeText(copyText).then(() => setCopied(true)).catch(() => {})
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
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
          {canal === 'whatsapp' && (
            <button
              onClick={abrirCopiarNumeros}
              disabled={leadsFiltrados.length === 0}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 9, cursor: leadsFiltrados.length === 0 ? 'not-allowed' : 'pointer',
                border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-2)', fontSize: 12.5, fontWeight: 600,
                opacity: leadsFiltrados.length === 0 ? 0.5 : 1,
              }}
            >
              <Copy size={13} /> Copiar números ({leadsFiltrados.filter(l => l.phone).length})
            </button>
          )}
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
                  display: 'grid', gridTemplateColumns: 'minmax(200px,1.6fr) 110px 90px 1fr auto', alignItems: 'center', gap: 14,
                  background: 'var(--bg-card)', borderRadius: 12, padding: '13px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                  cursor: 'pointer', opacity: acting ? 0.6 : 1,
                }}
              >
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
                </div>
              </div>
            )
          })}
        </div>
      )}

      {copyOpen && (
        <div onClick={() => setCopyOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-card)', borderRadius: 16, width: '100%', maxWidth: 560, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <p style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>
                <Copy size={16} style={{ color: 'var(--accent)' }} /> Números pra disparo
              </p>
              <button onClick={() => setCopyOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '0 0 14px' }}>
              {copyText ? copyText.split(',').filter(Boolean).length : 0} número(s) no formato +55DDDNNNNNNNNN, prontos pra colar na plataforma de disparo.
            </p>
            <textarea
              readOnly
              value={copyText}
              onFocus={e => e.target.select()}
              style={{ width: '100%', minHeight: 120, padding: 12, borderRadius: 10, border: '1px solid var(--border-in)', fontSize: 12.5, color: 'var(--text-2)', background: 'var(--bg-input)', resize: 'vertical', fontFamily: 'ui-monospace, monospace', lineHeight: 1.5 }}
            />
            <button
              onClick={copiarNumeros}
              style={{
                marginTop: 14, width: '100%', padding: '11px 0', borderRadius: 10, border: 'none', cursor: 'pointer',
                background: copied ? 'var(--success)' : '#2563EB', color: '#fff', fontSize: 13, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {copied ? <><Check size={15} /> Copiado!</> : <><Copy size={15} /> Copiar</>}
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
