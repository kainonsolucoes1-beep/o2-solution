import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react'
import api from '../api'

const NOME_MAX = 60
const iconBtn: React.CSSProperties = {
  flexShrink: 0, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'none', border: '1px solid var(--border-in)', borderRadius: 8, cursor: 'pointer', color: 'var(--text-muted)',
}

// Configurações > Operadoras: a lista que aparece na janela "Enviar para emissão" e no
// seletor "Definir operadora" da aba Emissão. Só admin salva. Renomear ou remover uma
// operadora não altera os envios já registrados (eles guardam o nome da época).
export default function OperadorasEmissaoTab() {
  const [lista, setLista] = useState<string[]>([])
  const [original, setOriginal] = useState<string[]>([])
  const [novo, setNovo] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    api.get<string[]>('/api/v1/leads/operadoras-emissao')
      .then(r => { setLista(r.data); setOriginal(r.data) })
      .catch(() => setMsg({ ok: false, text: 'Não foi possível carregar a lista.' }))
      .finally(() => setLoading(false))
  }, [])

  const dirty = JSON.stringify(lista) !== JSON.stringify(original)
  const duplicado = (nome: string, ignorar = -1) =>
    lista.some((n, i) => i !== ignorar && n.trim().toLowerCase() === nome.trim().toLowerCase())

  function adicionar() {
    const nome = novo.trim()
    if (!nome) return
    if (duplicado(nome)) { setMsg({ ok: false, text: `"${nome}" já está na lista.` }); return }
    setLista(l => [...l, nome]); setNovo(''); setMsg(null)
  }
  function mover(i: number, dir: -1 | 1) {
    setLista(l => { const j = i + dir; if (j < 0 || j >= l.length) return l; const n = [...l]; [n[i], n[j]] = [n[j], n[i]]; return n })
  }
  function salvar() {
    setSaving(true); setMsg(null)
    api.put<string[]>('/api/v1/emissao/operadoras', { operadoras: lista })
      .then(r => { setLista(r.data); setOriginal(r.data); setMsg({ ok: true, text: 'Lista salva. Já vale na janela de envio e na aba Emissão.' }) })
      .catch(err => {
        const d = err?.response?.data?.detail
        setMsg({ ok: false, text: typeof d === 'string' ? d : 'Não foi possível salvar a lista.' })
      })
      .finally(() => setSaving(false))
  }

  const card: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '22px 24px', maxWidth: 720 }

  return (
    <div style={card}>
      <h2 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, color: 'var(--text-1)' }}>Operadoras da emissão</h2>
      <p style={{ margin: '0 0 18px', fontSize: 12.5, lineHeight: 1.55, color: 'var(--text-muted)' }}>
        Aparecem na janela "Enviar para emissão" e em "Definir operadora", na aba Emissão, na ordem abaixo.
        Renomear ou remover uma operadora não muda os envios já registrados: eles guardam o nome que tinham.
      </p>

      {loading ? (
        <p style={{ fontSize: 13, color: 'var(--text-subtle)' }}>Carregando…</p>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {lista.map((nome, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 22, textAlign: 'right', fontSize: 11.5, color: 'var(--text-subtle)' }}>{i + 1}</span>
                <input
                  value={nome} maxLength={NOME_MAX} aria-label={`Nome da operadora ${i + 1}`}
                  onChange={e => setLista(l => l.map((n, j) => j === i ? e.target.value : n))}
                  style={{ flex: 1, minWidth: 0, height: 34, padding: '0 11px', borderRadius: 8, border: `1px solid ${duplicado(nome, i) || !nome.trim() ? '#DC2626' : 'var(--border-in)'}`, background: 'var(--bg-input)', color: 'var(--text-2)', fontFamily: 'inherit', fontSize: 13 }}
                />
                <button type="button" style={{ ...iconBtn, opacity: i === 0 ? 0.35 : 1 }} disabled={i === 0} onClick={() => mover(i, -1)} aria-label={`Subir ${nome}`}><ArrowUp size={14} /></button>
                <button type="button" style={{ ...iconBtn, opacity: i === lista.length - 1 ? 0.35 : 1 }} disabled={i === lista.length - 1} onClick={() => mover(i, 1)} aria-label={`Descer ${nome}`}><ArrowDown size={14} /></button>
                <button type="button" style={iconBtn} onClick={() => setLista(l => l.filter((_, j) => j !== i))} aria-label={`Remover ${nome}`}><X size={14} /></button>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border-lt)' }}>
            <input
              value={novo} maxLength={NOME_MAX} placeholder="Nova operadora" aria-label="Nova operadora"
              onChange={e => setNovo(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') adicionar() }}
              style={{ flex: 1, minWidth: 0, height: 34, padding: '0 11px', borderRadius: 8, border: '1px solid var(--border-in)', background: 'var(--bg-input)', color: 'var(--text-2)', fontFamily: 'inherit', fontSize: 13 }}
            />
            <button type="button" onClick={adicionar} disabled={!novo.trim()} style={{ display: 'flex', alignItems: 'center', gap: 5, height: 34, padding: '0 14px', borderRadius: 8, border: '1px solid var(--border-in)', background: 'var(--bg-card)', color: 'var(--text-2)', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, cursor: novo.trim() ? 'pointer' : 'not-allowed', opacity: novo.trim() ? 1 : 0.5 }}>
              <Plus size={14} /> Adicionar
            </button>
            <button type="button" onClick={() => setLista(l => [...l].sort((a, b) => a.localeCompare(b, 'pt-BR')))} style={{ height: 34, padding: '0 12px', borderRadius: 8, border: '1px solid var(--border-in)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
              Ordenar A–Z
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
            <button
              type="button" onClick={salvar} disabled={!dirty || saving || lista.some(n => !n.trim()) || lista.some((n, i) => duplicado(n, i))}
              style={{ height: 36, padding: '0 20px', borderRadius: 9, border: 'none', background: '#2563EB', color: '#fff', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: dirty && !saving ? 'pointer' : 'not-allowed', opacity: dirty && !saving ? 1 : 0.5 }}
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
