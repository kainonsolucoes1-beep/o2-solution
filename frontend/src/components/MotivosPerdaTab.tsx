import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, Plus } from 'lucide-react'
import api from '../api'
import { setMotivosPerdaCache, type MotivoPerda } from '../utils/useMotivosPerda'

const NOME_MAX = 80
const iconBtn: React.CSSProperties = {
  flexShrink: 0, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'none', border: '1px solid var(--border-in)', borderRadius: 8, cursor: 'pointer', color: 'var(--text-muted)',
}

// Configurações > Motivos de perda: sub-status do "Perdido" que aparecem na ficha e no
// painel do lead. Só admin salva. Não tem excluir: desativar tira da ficha, e os leads
// já marcados continuam com o motivo (o lead guarda o texto).
export default function MotivosPerdaTab() {
  const [lista, setLista] = useState<MotivoPerda[]>([])
  const [original, setOriginal] = useState<MotivoPerda[]>([])
  const [novo, setNovo] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    api.get<MotivoPerda[]>('/api/v1/leads/motivos-perda')
      .then(r => { setLista(r.data); setOriginal(r.data) })
      .catch(() => setMsg({ ok: false, text: 'Não foi possível carregar a lista.' }))
      .finally(() => setLoading(false))
  }, [])

  const dirty = JSON.stringify(lista) !== JSON.stringify(original)
  const duplicado = (nome: string, ignorar = -1) =>
    lista.some((m, i) => i !== ignorar && m.nome.trim().toLowerCase() === nome.trim().toLowerCase())
  const invalido = lista.some((m, i) => !m.nome.trim() || duplicado(m.nome, i)) || !lista.some(m => m.ativo)

  function adicionar() {
    const nome = novo.trim()
    if (!nome) return
    if (duplicado(nome)) { setMsg({ ok: false, text: `"${nome}" já está na lista.` }); return }
    setLista(l => [...l, { nome, ativo: true }]); setNovo(''); setMsg(null)
  }
  function mover(i: number, dir: -1 | 1) {
    setLista(l => { const j = i + dir; if (j < 0 || j >= l.length) return l; const n = [...l]; [n[i], n[j]] = [n[j], n[i]]; return n })
  }
  function salvar() {
    setSaving(true); setMsg(null)
    api.put<MotivoPerda[]>('/api/v1/leads/motivos-perda', { motivos: lista })
      .then(r => { setLista(r.data); setOriginal(r.data); setMotivosPerdaCache(r.data); setMsg({ ok: true, text: 'Lista salva.' }) })
      .catch(err => {
        const d = err?.response?.data?.detail
        setMsg({ ok: false, text: typeof d === 'string' ? d : 'Não foi possível salvar a lista.' })
      })
      .finally(() => setSaving(false))
  }

  const card: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '22px 24px', maxWidth: 720 }
  const ativos = lista.filter(m => m.ativo).length

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-1)' }}>Motivos de perda</h2>
        {!loading && <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{ativos} ativo{ativos !== 1 ? 's' : ''} de {lista.length}</span>}
      </div>

      {loading ? (
        <p style={{ fontSize: 13, color: 'var(--text-subtle)' }}>Carregando…</p>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {lista.map((m, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 22, textAlign: 'right', fontSize: 11.5, color: 'var(--text-subtle)' }}>{i + 1}</span>
                <input
                  value={m.nome} maxLength={NOME_MAX} aria-label={`Nome do motivo ${i + 1}`}
                  onChange={e => setLista(l => l.map((x, j) => j === i ? { ...x, nome: e.target.value } : x))}
                  style={{ flex: 1, minWidth: 0, height: 34, padding: '0 11px', borderRadius: 8, border: `1px solid ${duplicado(m.nome, i) || !m.nome.trim() ? '#DC2626' : 'var(--border-in)'}`, background: 'var(--bg-input)', color: m.ativo ? 'var(--text-2)' : 'var(--text-subtle)', fontFamily: 'inherit', fontSize: 13 }}
                />
                <button
                  type="button" role="switch" aria-checked={m.ativo} aria-label={`${m.ativo ? 'Desativar' : 'Ativar'} ${m.nome}`}
                  onClick={() => setLista(l => l.map((x, j) => j === i ? { ...x, ativo: !x.ativo } : x))}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 7, width: 92, height: 32, padding: '0 6px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, color: 'var(--text-muted)' }}
                >
                  <span style={{ position: 'relative', width: 30, height: 18, borderRadius: 99, background: m.ativo ? 'var(--accent)' : 'var(--border-in)', flexShrink: 0, transition: 'background 150ms' }}>
                    <span style={{ position: 'absolute', top: 2, left: m.ativo ? 14 : 2, width: 14, height: 14, borderRadius: 99, background: '#fff', transition: 'left 150ms' }} />
                  </span>
                  {m.ativo ? 'Ativo' : 'Inativo'}
                </button>
                <button type="button" style={{ ...iconBtn, opacity: i === 0 ? 0.35 : 1 }} disabled={i === 0} onClick={() => mover(i, -1)} aria-label={`Subir ${m.nome}`}><ArrowUp size={14} /></button>
                <button type="button" style={{ ...iconBtn, opacity: i === lista.length - 1 ? 0.35 : 1 }} disabled={i === lista.length - 1} onClick={() => mover(i, 1)} aria-label={`Descer ${m.nome}`}><ArrowDown size={14} /></button>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border-lt)' }}>
            <input
              value={novo} maxLength={NOME_MAX} placeholder="Novo motivo, ex.: Contratou com outra corretora" aria-label="Novo motivo"
              onChange={e => setNovo(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') adicionar() }}
              style={{ flex: 1, minWidth: 0, height: 34, padding: '0 11px', borderRadius: 8, border: '1px solid var(--border-in)', background: 'var(--bg-input)', color: 'var(--text-2)', fontFamily: 'inherit', fontSize: 13 }}
            />
            <button type="button" onClick={adicionar} disabled={!novo.trim()} style={{ display: 'flex', alignItems: 'center', gap: 5, height: 34, padding: '0 14px', borderRadius: 8, border: '1px solid var(--border-in)', background: 'var(--bg-card)', color: 'var(--text-2)', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, cursor: novo.trim() ? 'pointer' : 'not-allowed', opacity: novo.trim() ? 1 : 0.5 }}>
              <Plus size={14} /> Adicionar
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
            <button
              type="button" onClick={salvar} disabled={!dirty || saving || invalido}
              style={{ height: 36, padding: '0 20px', borderRadius: 9, border: 'none', background: '#2563EB', color: '#fff', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: dirty && !saving && !invalido ? 'pointer' : 'not-allowed', opacity: dirty && !saving && !invalido ? 1 : 0.5 }}
            >
              {saving ? 'Salvando…' : 'Salvar lista'}
            </button>
            {dirty && (
              <button type="button" onClick={() => { setLista(original); setMsg(null) }} style={{ height: 36, padding: '0 14px', borderRadius: 9, border: '1px solid var(--border-in)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Descartar alterações
              </button>
            )}
            {msg && <span style={{ fontSize: 12.5, fontWeight: 600, color: msg.ok ? '#059669' : '#DC2626' }}>{msg.text}</span>}
          </div>
        </>
      )}
    </div>
  )
}
