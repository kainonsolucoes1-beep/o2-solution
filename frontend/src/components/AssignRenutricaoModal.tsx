import { useEffect, useState } from 'react'
import { X, RotateCw, AlertTriangle, Check } from 'lucide-react'
import api from '../api'

interface UserOpt { id: string; first_name: string | null; username: string; role: string; is_active: boolean }
interface Conflict { lead_id: string; name: string; reason: string }

const btnGhost: React.CSSProperties = {
  fontSize: 13, fontWeight: 600, borderRadius: 9, padding: '9px 16px', cursor: 'pointer',
  border: '1px solid var(--border-in)', background: 'none', color: 'var(--text-3)',
}
const btnPrimary = (disabled: boolean): React.CSSProperties => ({
  fontSize: 13, fontWeight: 600, borderRadius: 9, padding: '9px 16px',
  border: 'none', background: disabled ? 'var(--bg-subtle)' : 'var(--accent)',
  color: disabled ? 'var(--text-subtle)' : '#fff', cursor: disabled ? 'not-allowed' : 'pointer',
})

export default function AssignRenutricaoModal({ leadIds, onClose, onAssigned }: {
  leadIds: string[]; onClose: () => void; onAssigned: () => void
}) {
  const [users, setUsers] = useState<UserOpt[]>([])
  const [ownerId, setOwnerId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [conflicts, setConflicts] = useState<Conflict[] | null>(null)
  const [forceIds, setForceIds] = useState<Set<string>>(new Set())
  const [doneCount, setDoneCount] = useState<number | null>(null)

  useEffect(() => {
    api.get<UserOpt[]>('/api/v1/admin/users')
      .then(r => setUsers(r.data.filter(u => u.is_active)))
      .catch(() => setError('Não foi possível carregar os usuários.'))
  }, [])

  async function submit() {
    setSaving(true)
    setError('')
    try {
      const { data } = await api.post<{ assigned: number; conflicts: Conflict[] }>('/api/v1/leads/renutricao/assign', {
        lead_ids: leadIds,
        owner_id: ownerId,
        force_ids: [...forceIds],
      })
      if (data.conflicts.length > 0) {
        setConflicts(data.conflicts)
        setDoneCount(data.assigned)
      } else {
        onAssigned()
      }
    } catch {
      setError('Erro ao atribuir. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  const ownerName = users.find(u => u.id === ownerId)
  const ownerLabel = ownerName ? (ownerName.first_name || ownerName.username) : 'o usuário'

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-card)', borderRadius: 16, width: '100%', maxWidth: 460, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <p style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>
            <RotateCw size={17} style={{ color: 'var(--accent)' }} /> Atribuir renutrição
          </p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>

        {conflicts === null ? (
          <>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 16px' }}>
              {leadIds.length} lead{leadIds.length !== 1 ? 's' : ''} selecionado{leadIds.length !== 1 ? 's' : ''}. Escolha quem vai trabalhar a reativação.
            </p>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-3b)', marginBottom: 6 }}>Atribuir a</label>
            <select
              value={ownerId}
              onChange={e => setOwnerId(e.target.value)}
              style={{ width: '100%', height: 40, padding: '0 10px', borderRadius: 9, border: '1px solid var(--border-in)', background: 'var(--bg-input)', color: 'var(--text-2)', fontSize: 14 }}
            >
              <option value="">— selecione —</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{(u.first_name || u.username)} · {u.role}</option>
              ))}
            </select>
            {error && <p style={{ fontSize: 12.5, color: 'var(--danger)', margin: '10px 0 0' }}>{error}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
              <button onClick={onClose} style={btnGhost}>Cancelar</button>
              <button onClick={submit} disabled={!ownerId || saving} style={btnPrimary(!ownerId || saving)}>
                {saving ? 'Atribuindo…' : 'Atribuir'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, background: 'var(--warning-weak)', borderRadius: 10, padding: '11px 13px', marginBottom: 14 }}>
              <AlertTriangle size={16} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 12.5, color: 'var(--text-2)', margin: 0, lineHeight: 1.45 }}>
                {doneCount ? `${doneCount} atribuído${doneCount !== 1 ? 's' : ''}. ` : ''}
                {conflicts.length} lead{conflicts.length !== 1 ? 's' : ''} <b>não pode{conflicts.length !== 1 ? 'm' : ''} ir</b> — já {conflicts.length !== 1 ? 'estão' : 'está'} com alguém. Marque quais transferir mesmo assim.
              </p>
            </div>
            <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {conflicts.map(c => (
                <label key={c.lead_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 4px', borderBottom: '1px solid var(--border-lt)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={forceIds.has(c.lead_id)}
                    onChange={() => setForceIds(prev => { const n = new Set(prev); n.has(c.lead_id) ? n.delete(c.lead_id) : n.add(c.lead_id); return n })}
                  />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
                    <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{c.reason}</span>
                  </span>
                </label>
              ))}
            </div>
            {error && <p style={{ fontSize: 12.5, color: 'var(--danger)', margin: '10px 0 0' }}>{error}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
              <button onClick={onAssigned} style={btnGhost}>Concluir sem transferir</button>
              <button onClick={submit} disabled={forceIds.size === 0 || saving} style={btnPrimary(forceIds.size === 0 || saving)}>
                <Check size={14} style={{ verticalAlign: '-2px', marginRight: 5 }} />
                Transferir {forceIds.size} para {ownerLabel}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
