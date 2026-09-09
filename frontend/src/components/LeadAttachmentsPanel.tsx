import { useEffect, useRef, useState } from 'react'
import { Paperclip, FileText, Image as ImageIcon, Download, Trash2, AlertCircle, UploadCloud } from 'lucide-react'
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

function fileKind(a: Attachment): 'image' | 'pdf' | 'other' {
  if (a.content_type?.startsWith('image/')) return 'image'
  if (a.content_type === 'application/pdf' || a.file_name.toLowerCase().endsWith('.pdf')) return 'pdf'
  return 'other'
}
const KIND_STYLE = {
  image: { color: 'var(--info)', bg: 'var(--info-weak)' },
  pdf: { color: 'var(--danger)', bg: 'var(--danger-weak)' },
  other: { color: 'var(--text-3b)', bg: 'var(--bg-subtle)' },
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

  const pick = () => fileInputRef.current?.click()
  const hasFiles = attachments.length > 0

  return (
    <SectionCard
      title="Anexos"
      icon={Paperclip}
      action={hasFiles && !loading && !error ? (
        <button
          onClick={pick}
          disabled={uploading}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 12, fontWeight: 600, color: uploading ? 'var(--text-subtle)' : 'var(--accent)',
            background: 'none', border: 'none', cursor: uploading ? 'not-allowed' : 'pointer',
          }}
        >
          <Paperclip size={13} />
          {uploading ? 'Enviando…' : 'Anexar'}
        </button>
      ) : null}
    >
      <input ref={fileInputRef} type="file" onChange={handleFileSelected} style={{ display: 'none' }} />

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
      ) : !hasFiles ? (
        <button
          onClick={pick}
          disabled={uploading}
          style={{
            width: '100%', border: '1.5px dashed var(--border)', borderRadius: 10, background: 'var(--bg-subtle)',
            padding: '22px 14px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
            cursor: uploading ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
          }}
        >
          <span style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}>
            <UploadCloud size={16} />
          </span>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)' }}>
            {uploading ? 'Enviando…' : 'Anexar um arquivo'}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>proposta, print de conversa, documento…</span>
        </button>
      ) : (
        <>
          <div className="flex flex-col" style={{ gap: 4 }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-subtle)' }}>
              {attachments.length === 1 ? 'Arquivo' : 'Arquivos'}
            </span>
            <span style={{ fontSize: 22, fontWeight: 700, lineHeight: 1, color: 'var(--text-1)' }}>{attachments.length}</span>
          </div>

          <div style={{ height: 1, background: 'var(--border)', margin: '14px 0 2px' }} />

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {attachments.map((a, i) => {
              const ks = KIND_STYLE[fileKind(a)]
              return (
                <div
                  key={a.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0',
                    borderTop: i === 0 ? 'none' : '1px solid var(--border-lt)',
                  }}
                >
                  <div style={{ width: 32, height: 32, borderRadius: 7, background: ks.bg, color: ks.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {fileKind(a) === 'image' ? <ImageIcon size={16} /> : <FileText size={16} />}
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
              )
            })}
          </div>
        </>
      )}
    </SectionCard>
  )
}
