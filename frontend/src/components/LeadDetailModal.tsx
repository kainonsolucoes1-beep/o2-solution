import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import api from '../api'

interface LeadItem {
  id: string
  name: string
  email: string | null
  phone: string | null
  company: string | null
  attendant: string | null
  origem: string | null
  status: string | null
  value_potential: number | null
  created_at: string
}

interface Note {
  id: string
  content: string
  created_by: string
  created_at: string
}

const STATUS_OPTIONS = [
  { value: 'novo',        label: 'Novo' },
  { value: 'qualificado', label: 'Qualificado' },
  { value: 'proposta',    label: 'Proposta' },
  { value: 'fechado',     label: 'Fechado' },
  { value: 'convertido',  label: 'Convertido' },
]

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  novo:        { bg: '#EFF6FF', color: '#2563EB' },
  qualificado: { bg: '#F0FDF4', color: '#16A34A' },
  proposta:    { bg: '#FFFBEB', color: '#D97706' },
  fechado:     { bg: '#F3F4F6', color: '#6B7280' },
  convertido:  { bg: '#ECFDF5', color: '#059669' },
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
      <span style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </span>
      <span style={{ fontSize: 14, color: value === '—' ? '#9CA3AF' : '#1F2937', fontWeight: value === '—' ? 400 : 500 }}>
        {value}
      </span>
    </div>
  )
}

export default function LeadDetailModal({
  lead,
  onClose,
  onStatusChange,
}: {
  lead: LeadItem
  onClose: () => void
  onStatusChange?: (id: string, newStatus: string) => void
}) {
  const [status, setStatus]               = useState(lead.status ?? 'novo')
  const [editingStatus, setEditingStatus] = useState(false)
  const [savingStatus, setSavingStatus]   = useState(false)
  const [notes, setNotes]                 = useState<Note[]>([])
  const [loadingNotes, setLoadingNotes]   = useState(true)
  const [noteText, setNoteText]           = useState('')
  const [savingNote, setSavingNote]       = useState(false)
  const [toast, setToast]                 = useState<{ msg: string; ok: boolean } | null>(null)

  useEffect(() => {
    api.get<{ notes: Note[] }>(`/api/v1/leads/${lead.id}/notes`)
      .then(r => setNotes(r.data.notes))
      .finally(() => setLoadingNotes(false))
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

  const sStyle = STATUS_STYLE[(status ?? 'novo').toLowerCase()] ?? { bg: '#F3F4F6', color: '#6B7280' }

  return (
    <>
      {/* Toast */}
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

      {/* Backdrop */}
      <div
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 50, padding: 16,
        }}
        onClick={onClose}
      >
        <div
          style={{
            background: 'white', borderRadius: 16,
            width: '100%', maxWidth: 580,
            maxHeight: '90vh', display: 'flex', flexDirection: 'column',
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
            overflow: 'hidden',
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div style={{ padding: '18px 24px', borderBottom: '1px solid #F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#1F2937' }}>Detalhe do Lead</span>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center' }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Body (scrollable) */}
          <div style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 24 }}>

            {/* Info grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 24px' }}>
              <Field label="Nome"           value={lead.name} />
              <Field label="Empresa"        value={lead.company ?? '—'} />
              <Field label="Email"          value={lead.email ?? '—'} />
              <Field label="Telefone"       value={lead.phone ?? '—'} />
              <Field label="Origem"         value={lead.origem ?? '—'} />
              <Field label="Atendente"      value={lead.attendant ?? '—'} />
              <Field label="Valor Potencial" value={fmtBRL(lead.value_potential)} />
              <Field label="Data Criação"   value={fmtDate(lead.created_at)} />
            </div>

            {/* Status */}
            <div className="flex flex-col gap-2">
              <span style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
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
                          transition: 'all 150ms',
                          textTransform: 'capitalize',
                        }}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                  <button
                    onClick={() => setEditingStatus(false)}
                    style={{ background: 'none', border: 'none', fontSize: 12, color: '#9CA3AF', cursor: 'pointer', padding: '4px 8px' }}
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

            {/* Notes */}
            <div className="flex flex-col gap-3">
              <span style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Notas
              </span>

              {/* New note */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <textarea
                  value={noteText}
                  onChange={e => setNoteText(e.target.value.slice(0, 500))}
                  placeholder="Adicione uma nota..."
                  rows={3}
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: 8,
                    border: '1px solid #E5E7EB', fontSize: 13, color: '#1F2937',
                    resize: 'vertical', outline: 'none', fontFamily: 'inherit',
                    boxSizing: 'border-box',
                  }}
                  onFocus={e => (e.currentTarget.style.borderColor = '#3B82F6')}
                  onBlur={e => (e.currentTarget.style.borderColor = '#E5E7EB')}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: '#9CA3AF' }}>{noteText.length}/500</span>
                  <button
                    onClick={handleSaveNote}
                    disabled={savingNote || !noteText.trim()}
                    style={{
                      background: savingNote || !noteText.trim() ? '#E5E7EB' : '#2563EB',
                      color: savingNote || !noteText.trim() ? '#9CA3AF' : 'white',
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

              {/* Timeline */}
              {loadingNotes ? (
                <p style={{ fontSize: 13, color: '#9CA3AF' }}>Carregando notas…</p>
              ) : notes.length === 0 ? (
                <p style={{ fontSize: 13, color: '#9CA3AF' }}>Nenhuma nota ainda.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {notes.map((note, i) => (
                    <div key={note.id} style={{ display: 'flex', gap: 12 }}>
                      {/* Timeline line + dot */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 16, flexShrink: 0 }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#3B82F6', flexShrink: 0, marginTop: 4 }} />
                        {i < notes.length - 1 && (
                          <div style={{ width: 2, flex: 1, background: '#E5E7EB', marginTop: 4 }} />
                        )}
                      </div>
                      {/* Content */}
                      <div style={{ paddingBottom: i < notes.length - 1 ? 16 : 0, flex: 1 }}>
                        <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 4 }}>
                          {fmtDate(note.created_at)} · <strong style={{ color: '#6B7280' }}>{note.created_by}</strong>
                        </div>
                        <p style={{ fontSize: 13, color: '#1F2937', margin: 0, lineHeight: 1.5 }}>{note.content}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div style={{ padding: '16px 24px', borderTop: '1px solid #F3F4F6', display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
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
