import { useRef, useState } from 'react'
import { Upload, FileSpreadsheet, X, Check, AlertTriangle } from 'lucide-react'
import api from '../api'

interface PreviewRow {
  row: number
  nome: string
  telefone: string
  modalidade: string | null
  data_reativacao: string | null
  match_status: 'ok' | 'not_found' | 'ambiguous' | 'invalid_date'
  lead_id: string | null
  lead_nome_atual: string | null
  detail: string
}

type Step = 1 | 2 | 3

const btnGhost: React.CSSProperties = {
  fontSize: 13, fontWeight: 600, borderRadius: 9, padding: '9px 16px', cursor: 'pointer',
  border: '1px solid var(--border-in)', background: 'none', color: 'var(--text-3)',
}
const btnPrimary = (disabled: boolean): React.CSSProperties => ({
  fontSize: 13, fontWeight: 600, borderRadius: 9, padding: '9px 16px',
  border: 'none', background: disabled ? 'var(--bg-subtle)' : '#2563EB',
  color: disabled ? 'var(--text-subtle)' : '#fff', cursor: disabled ? 'not-allowed' : 'pointer',
})

export default function ImportRenutricaoModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [step, setStep] = useState<Step>(1)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [rows, setRows] = useState<PreviewRow[]>([])
  const [confirming, setConfirming] = useState(false)
  const [confirmedCount, setConfirmedCount] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const matched = rows.filter(r => r.match_status === 'ok')
  const unmatched = rows.filter(r => r.match_status !== 'ok')

  function pickFile(f: File | null) {
    setFile(f)
    setUploadError('')
  }

  function fmtSize(bytes: number) {
    return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  async function handleAvancar() {
    if (!file) return
    setUploading(true)
    setUploadError('')
    const formData = new FormData()
    formData.append('file', file)
    try {
      const { data } = await api.post('/api/v1/leads/renutricao-import/preview', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setRows(data.rows)
      setStep(2)
    } catch (err: any) {
      setUploadError(err.response?.data?.detail ?? 'Não foi possível ler a planilha.')
    } finally {
      setUploading(false)
    }
  }

  async function handleConfirmar() {
    setConfirming(true)
    try {
      const items = matched.map(r => ({ lead_id: r.lead_id, data_reativacao: r.data_reativacao }))
      const { data } = await api.post('/api/v1/leads/renutricao-import/confirm', { items })
      setConfirmedCount(data.updated)
      setStep(3)
      onImported()
    } catch {
      setUploadError('Não foi possível aplicar a reativação. Tente novamente.')
    } finally {
      setConfirming(false)
    }
  }

  const matchLabel: Record<PreviewRow['match_status'], string> = {
    ok: 'lead encontrado',
    not_found: 'telefone não encontrado',
    ambiguous: 'telefone ambíguo',
    invalid_date: 'data inválida',
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-card)', borderRadius: 16, width: '100%', maxWidth: step === 2 ? 680 : 560, maxHeight: '90vh', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

        <div style={{ padding: '20px 24px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', borderBottom: '1px solid var(--border-lt)', flexShrink: 0 }}>
          <div>
            <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Importar Renutrição</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
              {step === 1 && 'Marca a data de reativação de vários leads de uma vez, a partir de uma planilha.'}
              {step === 2 && `${rows.length} linhas na planilha · nada foi gravado ainda`}
              {step === 3 && 'Concluído'}
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-subtle)', padding: 4 }}><X size={18} /></button>
        </div>

        <div style={{ padding: '22px 24px', overflowY: 'auto', minHeight: 0 }}>

          {step === 1 && (
            <>
              {!file ? (
                <label style={{ display: 'block', border: '1.5px dashed var(--border-in)', borderRadius: 12, padding: '34px 20px', textAlign: 'center', cursor: 'pointer' }}>
                  <Upload size={28} color="var(--text-subtle)" style={{ margin: '0 auto 10px' }} />
                  <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-2)', margin: 0 }}>Clique para escolher a planilha</p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '5px 0 0' }}>.xlsx ou .csv</p>
                  <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" hidden
                    onChange={e => pickFile(e.target.files?.[0] ?? null)} />
                </label>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid var(--border)', borderRadius: 10, padding: '11px 14px' }}>
                  <span style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--bg-subtle)', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <FileSpreadsheet size={16} />
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</p>
                    <p style={{ fontSize: 11, color: 'var(--text-subtle)', margin: '1px 0 0' }}>{fmtSize(file.size)}</p>
                  </div>
                  <button onClick={() => pickFile(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-subtle)', cursor: 'pointer', fontSize: 16 }}>×</button>
                </div>
              )}
              <div style={{ marginTop: 16, fontSize: 11.5, color: 'var(--text-muted)', background: 'var(--bg-subtle)', borderRadius: 8, padding: '10px 12px' }}>
                <b style={{ color: 'var(--text-3)', fontWeight: 600 }}>Colunas esperadas:</b> Nome · Telefone · Modalidade · Data de reativação (usamos o telefone pra achar o lead certo).
              </div>
              {uploadError && <p style={{ color: '#DC2626', fontSize: 12.5, margin: '12px 0 0' }}>{uploadError}</p>}
            </>
          )}

          {step === 2 && (
            <>
              <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, borderRadius: 10, padding: '11px 14px', background: 'rgba(5,150,105,0.08)', border: '1px solid rgba(167,243,208,0.6)' }}>
                  <span style={{ fontSize: 19, fontWeight: 700, color: '#059669' }}>{matched.length}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.3 }}>encontrados,<br />prontos pra aplicar</span>
                </div>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, borderRadius: 10, padding: '11px 14px', background: 'rgba(180,83,9,0.08)', border: '1px solid rgba(253,233,200,0.7)' }}>
                  <span style={{ fontSize: 19, fontWeight: 700, color: '#B45309' }}>{unmatched.length}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.3 }}>sem correspondência,<br />ficam de fora</span>
                </div>
              </div>

              <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '22px 1.3fr .9fr .85fr .8fr', gap: 10, padding: '8px 12px', fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.03em', background: 'var(--bg-subtle)' }}>
                  <span /><span>Nome (planilha)</span><span>Telefone</span><span>Modalidade</span><span>Data</span>
                </div>
                <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                  {rows.map((r, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '22px 1.3fr .9fr .85fr .8fr', gap: 10, alignItems: 'center', padding: '9px 12px', fontSize: 12, borderTop: i > 0 ? '1px solid var(--border-lt)' : 'none' }}>
                      <span style={{
                        width: 16, height: 16, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9,
                        background: r.match_status === 'ok' ? 'rgba(5,150,105,0.12)' : 'rgba(180,83,9,0.12)',
                        color: r.match_status === 'ok' ? '#059669' : '#B45309',
                      }}>
                        {r.match_status === 'ok' ? <Check size={10} /> : <AlertTriangle size={10} />}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontWeight: 600, color: r.match_status === 'ok' ? 'var(--text-2)' : 'var(--text-muted)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.nome || '—'}</p>
                        <p style={{ fontSize: 10.5, color: 'var(--text-subtle)', margin: '1px 0 0' }}>{matchLabel[r.match_status]}{r.match_status === 'ok' && r.lead_nome_atual && r.lead_nome_atual !== r.nome ? ` (${r.lead_nome_atual})` : ''}</p>
                      </div>
                      <span style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{r.telefone || '—'}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{r.modalidade || '—'}</span>
                      <span style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{r.data_reativacao ? r.data_reativacao.split('-').reverse().join('/') : '—'}</span>
                    </div>
                  ))}
                </div>
              </div>
              {uploadError && <p style={{ color: '#DC2626', fontSize: 12.5, margin: '12px 0 0' }}>{uploadError}</p>}
            </>
          )}

          {step === 3 && (
            <div style={{ textAlign: 'center', padding: '12px 6px 4px' }}>
              <span style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(5,150,105,0.1)', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <Check size={24} />
              </span>
              <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>{confirmedCount} lead{confirmedCount !== 1 ? 's' : ''} marcado{confirmedCount !== 1 ? 's' : ''} como renutrição</p>
              <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 6 }}>Data de reativação gravada individualmente, status atual de cada lead preservado.</p>
              {unmatched.length > 0 && (
                <div style={{ marginTop: 18, textAlign: 'left', display: 'flex', gap: 10, background: 'rgba(180,83,9,0.08)', border: '1px solid rgba(253,233,200,0.7)', borderRadius: 10, padding: '12px 14px' }}>
                  <AlertTriangle size={16} color="#B45309" style={{ flexShrink: 0, marginTop: 1 }} />
                  <p style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5, margin: 0 }}>
                    <b style={{ color: 'var(--text-1)' }}>{unmatched.length} linha{unmatched.length !== 1 ? 's' : ''} não encontrada{unmatched.length !== 1 ? 's' : ''}.</b> Confira o telefone ou a data na planilha (ou o telefone duplicado, se for o caso) e importe de novo só essas linhas.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '16px 24px', borderTop: '1px solid var(--border-lt)', flexShrink: 0 }}>
          {step === 1 && (
            <>
              <button style={btnGhost} onClick={onClose}>Cancelar</button>
              <button style={btnPrimary(!file || uploading)} disabled={!file || uploading} onClick={handleAvancar}>
                {uploading ? 'Lendo…' : 'Avançar →'}
              </button>
            </>
          )}
          {step === 2 && (
            <>
              <button style={btnGhost} onClick={() => setStep(1)}>← Voltar</button>
              <button style={btnPrimary(matched.length === 0 || confirming)} disabled={matched.length === 0 || confirming} onClick={handleConfirmar}>
                {confirming ? 'Aplicando…' : `Confirmar ${matched.length} lead${matched.length !== 1 ? 's' : ''} →`}
              </button>
            </>
          )}
          {step === 3 && (
            <button style={btnPrimary(false)} onClick={onClose}>Fechar</button>
          )}
        </div>
      </div>
    </div>
  )
}
