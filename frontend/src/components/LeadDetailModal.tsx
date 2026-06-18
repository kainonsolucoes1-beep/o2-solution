import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import api from '../api'
import { statusLabel } from '../utils/statusLabel'

interface LeadItem {
  id: string
  name: string
  email: string | null
  phone: string | null
  company: string | null
  attendant: string | null
  origem: string | null
  status: string | null
  perception: string | null
  value_potential: number | null
  created_at: string
}

interface Note {
  id: string
  content: string
  created_by: string
  created_at: string
}

interface StatusHistoryItem {
  id: string
  from_status: string | null
  to_status: string
  changed_at: string
  changed_by: string | null
}

const PERCEPTION_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  'Quente': { bg: 'rgba(220,38,38,0.12)',  color: '#DC2626', label: 'Quente' },
  'Morno':  { bg: 'rgba(217,119,6,0.12)',  color: '#D97706', label: 'Morno' },
  'Frio':   { bg: 'rgba(37,99,235,0.12)',  color: '#2563EB', label: 'Frio' },
}

const STATUS_OPTIONS = [
  { value: 'novo',        label: 'Novo' },
  { value: 'qualificado', label: 'Qualificado' },
  { value: 'proposta',    label: 'Proposta' },
  { value: 'fechado',     label: 'Fechado' },
  { value: 'convertido',  label: 'Convertido' },
]

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  novo:                 { bg: 'rgba(59,130,246,0.12)',  color: '#3B82F6' },
  new:                  { bg: 'rgba(59,130,246,0.12)',  color: '#3B82F6' },
  pending:              { bg: 'rgba(59,130,246,0.12)',  color: '#3B82F6' },
  qualificado:          { bg: 'rgba(22,163,74,0.12)',   color: '#16A34A' },
  qualified:            { bg: 'rgba(22,163,74,0.12)',   color: '#16A34A' },
  scheduled:            { bg: 'rgba(22,163,74,0.12)',   color: '#16A34A' },
  proposta:             { bg: 'rgba(217,119,6,0.12)',   color: '#D97706' },
  proposal_sent:        { bg: 'rgba(217,119,6,0.12)',   color: '#D97706' },
  fechado:              { bg: 'rgba(107,114,128,0.12)', color: '#6B7280' },
  convertido:           { bg: 'rgba(5,150,105,0.12)',   color: '#059669' },
  sale_not_performed:   { bg: 'rgba(220,38,38,0.12)',   color: '#DC2626' },
}


function statusColor(s: string | null) {
  if (!s) return { bg: 'rgba(107,114,128,0.12)', color: '#6B7280' }
  return STATUS_STYLE[s.toLowerCase()] ?? { bg: 'rgba(107,114,128,0.12)', color: '#6B7280' }
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function fmtBRL(n: number | null) {
  if (n == null || n === 0) return '—'
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </span>
      <span style={{ fontSize: 14, color: value === '—' ? 'var(--text-subtle)' : 'var(--text-2)', fontWeight: value === '—' ? 400 : 500 }}>
        {value}
      </span>
    </div>
  )
}

export default function LeadDetailModal({
  lead,
  onClose,
  onStatusChange,
  onDelete,
  isAdmin,
}: {
  lead: LeadItem
  onClose: () => void
  onStatusChange?: (id: string, newStatus: string) => void
  onDelete?: (id: string) => void
  isAdmin?: boolean
}) {
  const [status, setStatus]               = useState(lead.status ?? 'novo')
  const [editingStatus, setEditingStatus] = useState(false)
  const [savingStatus, setSavingStatus]   = useState(false)
  const [notes, setNotes]                 = useState<Note[]>([])
  const [loadingNotes, setLoadingNotes]   = useState(true)
  const [noteText, setNoteText]           = useState('')
  const [savingNote, setSavingNote]       = useState(false)
  const [toast, setToast]                 = useState<{ msg: string; ok: boolean } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting]           = useState(false)
  const [history, setHistory]             = useState<StatusHistoryItem[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)

  useEffect(() => {
    api.get<{ notes: Note[] }>(`/api/v1/leads/${lead.id}/notes`)
      .then(r => setNotes(r.data.notes))
      .finally(() => setLoadingNotes(false))
    api.get<{ history: StatusHistoryItem[] }>(`/api/v1/leads/${lead.id}/status-history`)
      .then(r => setHistory(r.data.history))
      .finally(() => setLoadingHistory(false))
  }, [lead.id])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  function handleStatusChange(newStatus: string) {
    setSavingStatus(true)
    api.post(`/api/v1/leads/${lead.id}/status`, { status: newStatus })
      .then(() => {
        setStatus(newStatus)
        setEditingStatus(false)
        setToast({ msg: 'Status atualizado com sucesso', ok: true })
        onStatusChange?.(lead.id, newStatus)
      })
      .catch(() => setToast({ msg: 'Erro ao atualizar status', ok: false }))
      .finally(() => setSavingStatus(false))
  }

  function handleSaveNote() {
    if (!noteText.trim()) return
    setSavingNote(true)
    api.post(`/api/v1/leads/${lead.id}/notes`, { content: noteText.trim() })
      .then(() => {
        setNoteText('')
        setToast({ msg: 'Nota salva com sucesso', ok: true })
        return api.get<{ notes: Note[] }>(`/api/v1/leads/${lead.id}/notes`)
      })
      .then(r => setNotes(r.data.notes))
      .catch(() => setToast({ msg: 'Erro ao salvar nota', ok: false }))
      .finally(() => setSavingNote(false))
  }

  function handleDelete() {
    setDeleting(true)
    api.delete(`/api/v1/leads/${lead.id}`)
      .then(() => { onDelete?.(lead.id); onClose() })
      .catch(() => { setToast({ msg: 'Erro ao excluir lead', ok: false }); setDeleting(false); setConfirmDelete(false) })
  }

  const sStyle = STATUS_STYLE[(status ?? 'novo').toLowerCase()] ?? { bg: 'rgba(107,114,128,0.12)', color: '#6B7280' }

  return (
    <>
      {toast && (
        <div
          style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 100,
            background: toast.ok ? '#10B981' : '#EF4444',
            color: 'white', padding: '10px 18px', borderRadius: 10,
            fontSize: 13, fontWeight: 600,
            boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
          }}
        >
          {toast.msg}
        </div>
      )}

      <div
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 50, padding: 16,
        }}
        onClick={onClose}
      >
        <div
          style={{
            background: 'var(--bg-card)', borderRadius: 16,
            width: '100%', maxWidth: 580,
            maxHeight: '90vh', display: 'flex', flexDirection: 'column',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            overflow: 'hidden',
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border-lt)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-2)' }}>Detalhe do Lead</span>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-subtle)', padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center' }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          <div style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 24 }}>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 24px' }}>
              <Field label="Nome"            value={lead.name} />
              <Field label="Empresa"         value={lead.company ?? '—'} />
              <Field label="Email"           value={lead.email ?? '—'} />
              <Field label="Telefone"        value={lead.phone ?? '—'} />
              <Field label="Origem"          value={lead.origem ?? '—'} />
              <Field label="Atendente"       value={lead.attendant ?? '—'} />
              <Field label="Valor Potencial" value={fmtBRL(lead.value_potential)} />
              <Field label="Data Criação"    value={fmtDate(lead.created_at)} />
            </div>

            {lead.perception && (() => {
              const p = PERCEPTION_STYLE[lead.perception]
              return p ? (
                <div className="flex flex-col gap-2">
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Percepção
                  </span>
                  <span style={{ display: 'inline-flex', alignSelf: 'flex-start', background: p.bg, color: p.color, padding: '4px 14px', borderRadius: 99, fontSize: 13, fontWeight: 700 }}>
                    {p.label}
                  </span>
                </div>
              ) : null
            })()}

            <div className="flex flex-col gap-2">
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Status
              </span>
              {editingStatus ? (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {STATUS_OPTIONS.map(opt => {
                    const s = STATUS_STYLE[opt.value] ?? { bg: '#F3F4F6', color: '#6B7280' }
                    const active = status === opt.value
                    return (
                      <button
                        key={opt.value}
                        disabled={savingStatus}
                        onClick={() => handleStatusChange(opt.value)}
                        style={{
                          background: active ? s.color : s.bg,
                          color: active ? 'white' : s.color,
                          border: `1.5px solid ${s.color}`,
                          padding: '4px 14px', borderRadius: 99,
                          fontSize: 13, fontWeight: 600, cursor: savingStatus ? 'not-allowed' : 'pointer',
                          opacity: savingStatus ? 0.6 : 1,
                          transition: 'all 150ms', textTransform: 'capitalize',
                        }}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                  <button
                    onClick={() => setEditingStatus(false)}
                    style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--text-subtle)', cursor: 'pointer', padding: '4px 8px' }}
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    style={{
                      background: sStyle.bg, color: sStyle.color,
                      padding: '4px 14px', borderRadius: 99,
                      fontSize: 13, fontWeight: 600, textTransform: 'capitalize',
                    }}
                  >
                    {status}
                  </span>
                  <button
                    onClick={() => setEditingStatus(true)}
                    style={{ fontSize: 12, color: '#3B82F6', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}
                  >
                    Editar
                  </button>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3">
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Histórico de Etapas
              </span>
              {loadingHistory ? (
                <p style={{ fontSize: 13, color: 'var(--text-subtle)' }}>Carregando…</p>
              ) : history.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--text-subtle)' }}>Sem histórico registrado.</p>
              ) : (
                <div style={{ position: 'relative', paddingLeft: 20 }}>
                  <div style={{ position: 'absolute', left: 6, top: 8, bottom: 8, width: 2, background: 'var(--border)', borderRadius: 2 }} />
                  {history.map((item, i) => {
                    const c = statusColor(item.to_status)
                    return (
                      <div key={item.id} style={{ position: 'relative', marginBottom: i < history.length - 1 ? 16 : 0 }}>
                        <div style={{
                          position: 'absolute', left: -17, top: 4,
                          width: 10, height: 10, borderRadius: '50%',
                          background: c.color, border: '2px solid var(--bg-card)',
                          boxShadow: `0 0 0 2px ${c.color}`,
                        }} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          {item.from_status ? (
                            <>
                              <span style={{ fontSize: 12, fontWeight: 600, background: statusColor(item.from_status).bg, color: statusColor(item.from_status).color, padding: '2px 10px', borderRadius: 99 }}>
                                {statusLabel(item.from_status)}
                              </span>
                              <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>→</span>
                              <span style={{ fontSize: 12, fontWeight: 600, background: c.bg, color: c.color, padding: '2px 10px', borderRadius: 99 }}>
                                {statusLabel(item.to_status)}
                              </span>
                            </>
                          ) : (
                            <span style={{ fontSize: 12, fontWeight: 600, background: c.bg, color: c.color, padding: '2px 10px', borderRadius: 99 }}>
                              Criado como {statusLabel(item.to_status)}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 3 }}>
                          {fmtDate(item.changed_at)}{item.changed_by ? ` · ${item.changed_by}` : ''}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3">
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Notas
              </span>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <textarea
                  value={noteText}
                  onChange={e => setNoteText(e.target.value.slice(0, 500))}
                  placeholder="Adicione uma nota..."
                  rows={3}
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: 8,
                    border: '1px solid var(--border)', fontSize: 13, color: 'var(--text-2)',
                    background: 'var(--bg-input)',
                    resize: 'vertical', outline: 'none', fontFamily: 'inherit',
                    boxSizing: 'border-box',
                  }}
                  onFocus={e => (e.currentTarget.style.borderColor = '#3B82F6')}
                  onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>{noteText.length}/500</span>
                  <button
                    onClick={handleSaveNote}
                    disabled={savingNote || !noteText.trim()}
                    style={{
                      background: savingNote || !noteText.trim() ? 'var(--bg-subtle)' : '#2563EB',
                      color: savingNote || !noteText.trim() ? 'var(--text-subtle)' : 'white',
                      border: 'none', borderRadius: 8,
                      padding: '7px 16px', fontSize: 13, fontWeight: 500,
                      cursor: savingNote || !noteText.trim() ? 'not-allowed' : 'pointer',
                      transition: 'background 150ms',
                    }}
                  >
                    {savingNote ? 'Salvando…' : 'Salvar Nota'}
                  </button>
                </div>
              </div>

              {loadingNotes ? (
                <p style={{ fontSize: 13, color: 'var(--text-subtle)' }}>Carregando notas…</p>
              ) : notes.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--text-subtle)' }}>Nenhuma nota ainda.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {notes.map(note => (
                    <div
                      key={note.id}
                      style={{
                        background: 'var(--bg-hover)',
                        border: '1px solid var(--border)',
                        borderRadius: 10,
                        padding: '12px 14px',
                      }}
                    >
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-subtle)', marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-3b)', fontWeight: 700 }}>{note.created_by}</span>
                        <span>{fmtDate(note.created_at)}</span>
                      </div>
                      <p style={{ fontSize: 13, color: 'var(--text-2)', margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {note.content}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-lt)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            {isAdmin && !confirmDelete && (
              <button
                onClick={() => setConfirmDelete(true)}
                style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500, background: 'none', color: '#EF4444', border: '1px solid rgba(239,68,68,0.3)', cursor: 'pointer' }}
              >
                Excluir lead
              </button>
            )}
            {isAdmin && confirmDelete && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, color: '#EF4444', fontWeight: 500 }}>Confirmar exclusão?</span>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  style={{ padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: '#EF4444', color: 'white', border: 'none', cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.6 : 1 }}
                >
                  {deleting ? 'Excluindo…' : 'Sim, excluir'}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  style={{ padding: '6px 14px', borderRadius: 8, fontSize: 13, background: 'none', color: 'var(--text-muted)', border: '1px solid var(--border)', cursor: 'pointer' }}
                >
                  Cancelar
                </button>
              </div>
            )}
            {!isAdmin && <span />}
            <button
              onClick={onClose}
              style={{ padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 500, background: '#2563EB', color: 'white', border: 'none', cursor: 'pointer' }}
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
