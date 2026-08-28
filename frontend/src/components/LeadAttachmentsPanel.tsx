import { useEffect, useRef, useState } from 'react'
import { Paperclip, FileText, Image as ImageIcon, Download, Trash2, AlertCircle } from 'lucide-react'
import api from '../api'
import { fmtDateShort } from '../utils/leadFormat'
import SectionCard from './SectionCard'

interface Attachment {
  id: string
  file_name: string
  file_size: number
  content_type: string | null
  uploaded_by: string
  created_at: string
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function FileIcon({ contentType }: { contentType: string | null }) {
  if (contentType?.startsWith('image/')) return <ImageIcon size={17} />
  return <FileText size={17} />
}

export default function LeadAttachmentsPanel({ leadId, canDelete }: { leadId: string; canDelete: boolean }) {
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState(false)
  const [uploading, setUploading]     = useState(false)
  const [deletingId, setDeletingId]   = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const fetchGenRef = useRef(0)

  function fetchAttachments() {
    const gen = ++fetchGenRef.current
    setLoading(true)
    setError(false)
    api.get<{ attachments: Attachment[] }>(`/api/v1/leads/${leadId}/attachments`)
      .then(r => { if (fetchGenRef.current === gen) setAttachments(r.data.attachments) })
      .catch(() => { if (fetchGenRef.current === gen) setError(true) })
      .finally(() => { if (fetchGenRef.current === gen) setLoading(false) })
  }

  useEffect(fetchAttachments, [leadId])

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    const formData = new FormData()
    formData.append('file', file)
    api.post(`/api/v1/leads/${leadId}/attachments`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
      .then(() => fetchAttachments())
      .catch(() => setError(true))
      .finally(() => setUploading(false))
  }

  function handleDownload(id: string) {
    api.get<{ url: string }>(`/api/v1/leads/${leadId}/attachments/${id}/download`)
      .then(r => window.open(r.data.url, '_blank'))
      .catch(() => {})
  }

  function handleDelete(id: string) {
    setDeletingId(id)
    api.delete(`/api/v1/leads/${leadId}/attachments/${id}`)
      .then(() => setAttachments(prev => prev.filter(a => a.id !== id)))
      .catch(() => {})
      .finally(() => setDeletingId(null))
  }

  return (
    <SectionCard
      title="Anexos"
      icon={Paperclip}
      action={
        <>
          <input ref={fileInputRef} type="file" onChange={handleFileSelected} style={{ display: 'none' }} />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: 12, fontWeight: 600, color: uploading ? 'var(--text-subtle)' : 'var(--accent)',
              background: 'none', border: 'none', cursor: uploading ? 'not-allowed' : 'pointer',
            }}
          >
            <Paperclip size={13} />
            {uploading ? 'Enviando…' : 'Anexar arquivo'}
          </button>
        </>
      }
    >
      {loading ? (
        <p style={{ fontSize: 13, color: 'var(--text-subtle)' }}>Carregando…</p>
      ) : error ? (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: 'var(--text-2)' }}>
          <AlertCircle size={16} color="var(--danger)" style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            Não foi possível carregar os anexos.{' '}
            <button onClick={fetchAttachments} style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: 0 }}>
              Tentar novamente
            </button>
          </span>
        </div>
      ) : attachments.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text-subtle)' }}>Nenhum anexo ainda.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {attachments.map((a, i) => (
            <div
              key={a.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0',
                borderTop: i === 0 ? 'none' : '1px solid var(--border-lt)',
              }}
            >
              <div style={{ width: 32, height: 32, borderRadius: 7, background: 'var(--bg-subtle)', color: 'var(--text-3b)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <FileIcon contentType={a.content_type} />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {a.file_name}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-subtle)' }}>
                  {fmtSize(a.file_size)} · {a.uploaded_by} · {fmtDateShort(a.created_at)}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                <button
                  onClick={() => handleDownload(a.id)}
                  title="Baixar arquivo"
                  style={{ width: 28, height: 28, borderRadius: 6, background: 'none', border: 'none', color: 'var(--text-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                >
                  <Download size={15} />
                </button>
                {canDelete && (
                  <button
                    onClick={() => handleDelete(a.id)}
                    disabled={deletingId === a.id}
                    title="Remover anexo"
                    style={{ width: 28, height: 28, borderRadius: 6, background: 'none', border: 'none', color: 'var(--text-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: deletingId === a.id ? 'not-allowed' : 'pointer' }}
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}
