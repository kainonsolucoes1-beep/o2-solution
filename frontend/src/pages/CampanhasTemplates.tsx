import { useCallback, useEffect, useState } from 'react'
import { MessageCircle, Mail, MessageSquare, Copy, Check, Plus, Trash2, Save } from 'lucide-react'
import api from '../api'
import { useTheme } from '../ThemeContext'

type Canal = 'whatsapp' | 'email' | 'sms'

interface Template {
  id: string
  canal: Canal
  titulo: string
  corpo: string
  atualizado_em: string | null
}

interface NumeroLead {
  id: string
  phone: string | null
}

const CANAL_CFG: { key: Canal; label: string; Icon: typeof MessageCircle; color: string; bg: string }[] = [
  { key: 'whatsapp', label: 'WhatsApp', Icon: MessageCircle, color: '#16A34A', bg: '#EAF7EE' },
  { key: 'email', label: 'E-mail', Icon: Mail, color: '#3B82F6', bg: '#EAF1FE' },
  { key: 'sms', label: 'SMS', Icon: MessageSquare, color: '#8B5CF6', bg: '#F2EEFE' },
]

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

const NOVO = '__novo__'

export default function CampanhasTemplates() {
  const { dark } = useTheme()
  const [canal, setCanal] = useState<Canal>('whatsapp')
  const [leads, setLeads] = useState<NumeroLead[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [titulo, setTitulo] = useState('')
  const [corpo, setCorpo] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [copiedNumbers, setCopiedNumbers] = useState(false)
  const [copiedTexto, setCopiedTexto] = useState(false)

  const fetchTemplates = useCallback((c: Canal) => {
    api.get<Template[]>('/api/v1/campanhas/templates', { params: { canal: c } })
      .then(r => setTemplates(r.data))
      .catch(() => setError('Não foi possível carregar os modelos.'))
  }, [])

  useEffect(() => {
    fetchTemplates(canal)
    api.get<NumeroLead[]>('/api/v1/campanhas/fila', { params: { canal } })
      .then(r => setLeads(r.data))
      .catch(() => {})
    setSelectedId(null)
    setCopiedNumbers(false)
  }, [canal, fetchTemplates])

  useEffect(() => {
    if (selectedId === NOVO) {
      setTitulo('')
      setCorpo('')
    } else {
      const t = templates.find(t => t.id === selectedId)
      setTitulo(t?.titulo ?? '')
      setCorpo(t?.corpo ?? '')
    }
    setCopiedTexto(false)
  }, [selectedId, templates])

  const numeros = leads.map(l => normalizarTelefone(l.phone)).filter((n): n is string => !!n)

  function copiarNumeros() {
    navigator.clipboard.writeText(numeros.join(', ')).then(() => setCopiedNumbers(true)).catch(() => {})
  }

  function copiarTexto() {
    navigator.clipboard.writeText(corpo).then(() => setCopiedTexto(true)).catch(() => {})
  }

  function salvar() {
    if (!titulo.trim() || !corpo.trim()) return
    setSaving(true)
    setError('')
    const body = { canal, titulo: titulo.trim(), corpo }
    const req = selectedId && selectedId !== NOVO
      ? api.put<Template>(`/api/v1/campanhas/templates/${selectedId}`, body)
      : api.post<Template>('/api/v1/campanhas/templates', body)
    req
      .then(r => {
        setTemplates(prev => {
          const exists = prev.some(t => t.id === r.data.id)
          return exists ? prev.map(t => t.id === r.data.id ? r.data : t) : [...prev, r.data].sort((a, b) => a.titulo.localeCompare(b.titulo))
        })
        setSelectedId(r.data.id)
      })
      .catch(() => setError('Não foi possível salvar o modelo.'))
      .finally(() => setSaving(false))
  }

  function excluir() {
    if (!selectedId || selectedId === NOVO) return
    setDeleting(true)
    setError('')
    api.delete(`/api/v1/campanhas/templates/${selectedId}`)
      .then(() => {
        setTemplates(prev => prev.filter(t => t.id !== selectedId))
        setSelectedId(null)
      })
      .catch(() => setError('Não foi possível excluir o modelo.'))
      .finally(() => setDeleting(false))
  }

  const editando = selectedId != null
  const dirty = editando && (
    selectedId === NOVO
      ? (titulo.trim() !== '' || corpo.trim() !== '')
      : (() => { const t = templates.find(t => t.id === selectedId); return !!t && (t.titulo !== titulo.trim() || t.corpo !== corpo) })()
  )

  return (
    <main className="px-4 md:px-8 xl:px-12 py-6 flex flex-col gap-5" style={{ background: dark ? 'transparent' : '#EEF1F5', minHeight: '100%' }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-2)', margin: 0 }}>Campanhas · Modelos</h1>
        <p style={{ fontSize: 13, color: 'var(--text-subtle)', marginTop: 3 }}>
          Números pra disparo e textos prontos, por canal — tudo dentro do sistema.
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
            </button>
          )
        })}
      </div>

      {error && <p style={{ color: '#EF4444', fontSize: 13 }}>{error}</p>}

      {canal === 'whatsapp' && (
        <div style={{ background: 'var(--bg-card)', borderRadius: 14, padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: numeros.length > 0 ? 12 : 0 }}>
            <p style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>
              <Copy size={15} style={{ color: 'var(--accent)' }} /> Números pra disparo
            </p>
            <button
              onClick={copiarNumeros}
              disabled={numeros.length === 0}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 9, cursor: numeros.length === 0 ? 'not-allowed' : 'pointer',
                border: 'none', background: copiedNumbers ? 'var(--success)' : '#2563EB', color: '#fff', fontSize: 12.5, fontWeight: 700,
                opacity: numeros.length === 0 ? 0.5 : 1,
              }}
            >
              {copiedNumbers ? <><Check size={13} /> Copiado!</> : <><Copy size={13} /> Copiar ({numeros.length})</>}
            </button>
          </div>
          {numeros.length > 0 && (
            <textarea
              readOnly
              value={numeros.join(', ')}
              onFocus={e => e.target.select()}
              style={{ width: '100%', minHeight: 70, padding: 10, borderRadius: 9, border: '1px solid var(--border-in)', fontSize: 12, color: 'var(--text-2)', background: 'var(--bg-input)', resize: 'vertical', fontFamily: 'ui-monospace, monospace', lineHeight: 1.5 }}
            />
          )}
          {numeros.length === 0 && (
            <p style={{ fontSize: 12.5, color: 'var(--text-subtle)', margin: 0 }}>Nenhum lead aguardando disparo por WhatsApp no momento.</p>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px,280px) 1fr', gap: 16, alignItems: 'start' }}>
        <div style={{ background: 'var(--bg-card)', borderRadius: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
          <button
            onClick={() => setSelectedId(NOVO)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '13px 16px', cursor: 'pointer',
              border: 'none', borderBottom: '1px solid var(--border-lt)', background: selectedId === NOVO ? 'var(--accent-weak)' : 'transparent',
              color: 'var(--accent)', fontSize: 13, fontWeight: 700, textAlign: 'left',
            }}
          >
            <Plus size={15} /> Novo modelo
          </button>
          {templates.length === 0 ? (
            <p style={{ fontSize: 12.5, color: 'var(--text-subtle)', padding: '16px' }}>Nenhum modelo cadastrado ainda.</p>
          ) : (
            templates.map(t => (
              <button
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                style={{
                  width: '100%', display: 'block', padding: '13px 16px', cursor: 'pointer', textAlign: 'left',
                  border: 'none', borderBottom: '1px solid var(--border-lt)',
                  background: selectedId === t.id ? 'var(--accent-weak)' : 'transparent',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: selectedId === t.id ? 'var(--accent)' : 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {t.titulo}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-subtle)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>
                  {t.corpo}
                </div>
              </button>
            ))
          )}
        </div>

        <div style={{ background: 'var(--bg-card)', borderRadius: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', padding: '18px 20px' }}>
          {!editando ? (
            <p style={{ fontSize: 13, color: 'var(--text-subtle)', textAlign: 'center', padding: '40px 0', margin: 0 }}>
              Selecione um modelo à esquerda, ou crie um novo.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input
                value={titulo}
                onChange={e => setTitulo(e.target.value)}
                placeholder="Nome do modelo"
                style={{ padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border-in)', fontSize: 14, fontWeight: 600, color: 'var(--text-1)', background: 'var(--bg-input)' }}
              />
              <textarea
                value={corpo}
                onChange={e => setCorpo(e.target.value)}
                placeholder="Texto da mensagem…"
                style={{ width: '100%', minHeight: 160, padding: 12, borderRadius: 9, border: '1px solid var(--border-in)', fontSize: 13, color: 'var(--text-2)', background: 'var(--bg-input)', resize: 'vertical', lineHeight: 1.6 }}
              />
              <p style={{ fontSize: 11.5, color: 'var(--text-subtle)', margin: 0 }}>
                Use <code style={{ background: 'var(--bg-subtle)', padding: '1px 5px', borderRadius: 4 }}>{'{nome}'}</code> onde quiser o primeiro nome do lead — é substituído automaticamente quando o Isaac copiar da fila.
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                <button
                  onClick={salvar}
                  disabled={saving || !titulo.trim() || !corpo.trim() || (selectedId !== NOVO && !dirty)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 9, cursor: 'pointer',
                    border: 'none', background: '#2563EB', color: '#fff', fontSize: 12.5, fontWeight: 700,
                    opacity: (saving || !titulo.trim() || !corpo.trim() || (selectedId !== NOVO && !dirty)) ? 0.5 : 1,
                  }}
                >
                  <Save size={13} /> {saving ? 'Salvando…' : 'Salvar'}
                </button>
                <button
                  onClick={copiarTexto}
                  disabled={!corpo.trim()}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 9, cursor: corpo.trim() ? 'pointer' : 'not-allowed',
                    border: '1px solid var(--border)', background: copiedTexto ? 'var(--success-weak)' : 'var(--bg-card)', color: copiedTexto ? 'var(--success)' : 'var(--text-2)', fontSize: 12.5, fontWeight: 600,
                  }}
                >
                  {copiedTexto ? <><Check size={13} /> Copiado!</> : <><Copy size={13} /> Copiar texto</>}
                </button>
                {selectedId !== NOVO && (
                  <button
                    onClick={excluir}
                    disabled={deleting}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '9px 12px', borderRadius: 9, cursor: 'pointer',
                      border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--danger)', fontSize: 12.5, fontWeight: 600, marginLeft: 'auto',
                    }}
                  >
                    <Trash2 size={13} /> {deleting ? 'Excluindo…' : 'Excluir'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
