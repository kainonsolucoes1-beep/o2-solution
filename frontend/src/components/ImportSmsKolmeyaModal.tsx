import { useState } from 'react'
import { Upload, FileSpreadsheet, X, Check } from 'lucide-react'
import api from '../api'

type Slot = 'envio' | 'retorno' | 'resposta'

interface ImportResult {
  lote: { job: string; enviados: number; retornos: number; entregues: number } | null
  respostas_novas: number
  respostas_repetidas: number
  jobs_nao_encontrados: string[]
}

const SLOTS: { key: Slot; label: string; hint: string }[] = [
  { key: 'envio', label: 'Envio', hint: 'envio_kolmeya — TELEFONE;NOME' },
  { key: 'retorno', label: 'Retorno', hint: 'retorno_kolmeya — job;phone;status…' },
  { key: 'resposta', label: 'Resposta (opcional)', hint: 'resposta_kolmeya — "Sim" na coluna D' },
]

const btnGhost: React.CSSProperties = {
  fontSize: 13, fontWeight: 600, borderRadius: 9, padding: '9px 16px', cursor: 'pointer',
  border: '1px solid var(--border-in)', background: 'none', color: 'var(--text-3)',
}
const btnPrimary = (disabled: boolean): React.CSSProperties => ({
  fontSize: 13, fontWeight: 600, borderRadius: 9, padding: '9px 16px',
  border: 'none', background: disabled ? 'var(--bg-subtle)' : '#2563EB',
  color: disabled ? 'var(--text-subtle)' : '#fff', cursor: disabled ? 'not-allowed' : 'pointer',
})

export default function ImportSmsKolmeyaModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [files, setFiles] = useState<Record<Slot, File | null>>({ envio: null, retorno: null, resposta: null })
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<ImportResult | null>(null)

  const pronto = (files.envio && files.retorno) || (!files.envio && (files.retorno || files.resposta))

  function pick(slot: Slot, f: File | null) {
    setFiles(prev => ({ ...prev, [slot]: f }))
    setError('')
  }

  async function handleImportar() {
    setSending(true)
    setError('')
    const formData = new FormData()
    ;(Object.keys(files) as Slot[]).forEach(k => { if (files[k]) formData.append(k, files[k] as File) })
    try {
      const { data } = await api.post<ImportResult>('/api/v1/campanhas/sms/importar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setResult(data)
      onImported()
    } catch (err: any) {
      setError(err.response?.data?.detail ?? 'Não foi possível importar as planilhas.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-card)', borderRadius: 16, width: '100%', maxWidth: 560, maxHeight: '90vh', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

        <div style={{ padding: '20px 24px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', borderBottom: '1px solid var(--border-lt)', flexShrink: 0 }}>
          <div>
            <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Importar planilhas · SMS Kolmeya</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
              {result ? 'Concluído' : 'Envio + retorno criam o lote do disparo. A resposta pode vir junto ou depois.'}
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-subtle)', padding: 4 }}><X size={18} /></button>
        </div>

        <div style={{ padding: '22px 24px', overflowY: 'auto', minHeight: 0 }}>
          {!result ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {SLOTS.map(s => {
                const f = files[s.key]
                return (
                  <div key={s.key}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', margin: '0 0 5px' }}>{s.label}</p>
                    {!f ? (
                      <label style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1.5px dashed var(--border-in)', borderRadius: 10, padding: '11px 14px', cursor: 'pointer' }}>
                        <Upload size={16} color="var(--text-subtle)" />
                        <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{s.hint}</span>
                        <input type="file" accept=".csv,.xlsx" hidden onChange={e => pick(s.key, e.target.files?.[0] ?? null)} />
                      </label>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid var(--border)', borderRadius: 10, padding: '11px 14px' }}>
                        <FileSpreadsheet size={16} color="#059669" />
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                        <button onClick={() => pick(s.key, null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-subtle)', cursor: 'pointer', fontSize: 16 }}>×</button>
                      </div>
                    )}
                  </div>
                )
              })}
              {files.envio && !files.retorno && (
                <p style={{ fontSize: 12, color: '#B45309', margin: 0 }}>A planilha de envio precisa ir junto com a de retorno (é dela que vem o job).</p>
              )}
              {error && <p style={{ color: '#DC2626', fontSize: 12.5, margin: 0 }}>{error}</p>}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '8px 6px 4px' }}>
              <span style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(5,150,105,0.1)', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <Check size={24} />
              </span>
              {result.lote && (
                <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>
                  Job {result.lote.job}: {result.lote.enviados} enviados · {result.lote.retornos} retornos · {result.lote.entregues} entregues
                </p>
              )}
              <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 6 }}>
                {result.respostas_novas} resposta{result.respostas_novas !== 1 ? 's' : ''} nova{result.respostas_novas !== 1 ? 's' : ''}
                {result.respostas_repetidas > 0 && ` · ${result.respostas_repetidas} já importada${result.respostas_repetidas !== 1 ? 's' : ''} antes`}
              </p>
              {result.jobs_nao_encontrados.length > 0 && (
                <p style={{ fontSize: 12, color: '#B45309', marginTop: 10 }}>
                  Respostas ignoradas — job{result.jobs_nao_encontrados.length > 1 ? 's' : ''} {result.jobs_nao_encontrados.join(', ')} ainda não importado{result.jobs_nao_encontrados.length > 1 ? 's' : ''} (suba o envio + retorno dele primeiro).
                </p>
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '16px 24px', borderTop: '1px solid var(--border-lt)', flexShrink: 0 }}>
          {!result ? (
            <>
              <button style={btnGhost} onClick={onClose}>Cancelar</button>
              <button style={btnPrimary(!pronto || sending)} disabled={!pronto || sending} onClick={handleImportar}>
                {sending ? 'Importando…' : 'Importar'}
              </button>
            </>
          ) : (
            <button style={btnPrimary(false)} onClick={onClose}>Fechar</button>
          )}
        </div>
      </div>
    </div>
  )
}
