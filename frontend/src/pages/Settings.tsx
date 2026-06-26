import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  UserPlus, X, Pencil,
  KeyRound, ToggleLeft, ToggleRight, Copy, Check, ChevronDown, ChevronRight,
} from 'lucide-react'
import api from '../api'

const TABS = ['Configurações', 'Usuários', 'Formulário'] as const
type Tab = typeof TABS[number]

// ── Configurações tab ────────────────────────────────────────────────────────
interface SyncHealth {
  last_sync_at: string | null; last_sync_ok: boolean
  last_sync_counts: string; last_sync_error: string; tokens_configured: boolean
}
function formatAgo(iso: string | null): string {
  if (!iso) return '—'
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return `${diff}s atrás`
  if (diff < 3600) return `${Math.floor(diff / 60)}min atrás`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`
  return `${Math.floor(diff / 86400)}d atrás`
}

function ConfiguracoesTab() {
  const navigate = useNavigate()
  const [accessToken, setAccessToken]   = useState('')
  const [refreshToken, setRefreshToken] = useState('')
  const [status, setStatus]             = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg]         = useState('')
  const [syncStatus, setSyncStatus]     = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [syncMsg, setSyncMsg]           = useState('')
  const [health, setHealth]             = useState<SyncHealth | null>(null)
  const [healthLoading, setHealthLoading] = useState(true)

  const fetchHealth = useCallback(async () => {
    try { const res = await api.get('/api/v1/admin/sync-status'); setHealth(res.data as SyncHealth) }
    catch {}
    finally { setHealthLoading(false) }
  }, [])

  useEffect(() => {
    fetchHealth()
    const interval = setInterval(fetchHealth, 30_000)
    return () => clearInterval(interval)
  }, [fetchHealth])

  async function handleSave() {
    if (!accessToken.trim() || !refreshToken.trim()) { setErrorMsg('Preencha os dois campos.'); setStatus('error'); return }
    setStatus('loading'); setErrorMsg('')
    try {
      await api.post('/api/v1/admin/followize-tokens', { access_token: accessToken.trim(), refresh_token: refreshToken.trim() })
      setStatus('success'); setAccessToken(''); setRefreshToken('')
    } catch (err: any) {
      if (err.response?.status === 401) { localStorage.removeItem('token'); navigate('/login'); return }
      setErrorMsg(err.response?.status === 403 ? 'Acesso restrito a administradores.' : 'Erro ao salvar tokens.')
      setStatus('error')
    }
  }

  async function handleSync() {
    setSyncStatus('loading'); setSyncMsg('')
    try {
      const res = await api.post('/api/v1/admin/sync-historico?days=90')
      const d = res.data as { inserted: number; updated: number; date_from: string }
      setSyncMsg(`Concluído: ${d.inserted} inseridos, ${d.updated} atualizados (desde ${d.date_from})`)
      setSyncStatus('success')
    } catch (err: any) {
      if (err.response?.status === 401) { localStorage.removeItem('token'); navigate('/login'); return }
      setSyncMsg('Erro ao executar reprocessamento.'); setSyncStatus('error')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 700 }}>
      <div className="bg-white rounded-xl p-6 flex flex-col gap-3" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-2)' }}>Status do Sync Automático</h2>
          <button onClick={fetchHealth} style={{ fontSize: 12, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 6, backgroundColor: 'var(--bg-subtle)' }}>Atualizar</button>
        </div>
        {healthLoading ? (
          <p style={{ fontSize: 13, color: 'var(--text-subtle)' }}>Carregando...</p>
        ) : health ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: !health.last_sync_at ? '#9CA3AF' : health.last_sync_ok ? '#10B981' : '#EF4444', flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>
                {!health.last_sync_at ? 'Nenhum sync registrado ainda' : health.last_sync_ok ? `Último sync OK — ${formatAgo(health.last_sync_at)}` : `Falha no último sync — ${formatAgo(health.last_sync_at)}`}
              </span>
            </div>
            {health.last_sync_ok && health.last_sync_counts && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{health.last_sync_counts}</p>}
            {!health.last_sync_ok && health.last_sync_error && (
              <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.1)', borderRadius: 8, border: '1px solid rgba(239,68,68,0.25)' }}>
                <p style={{ fontSize: 12, color: '#EF4444', margin: 0, wordBreak: 'break-word' }}>{health.last_sync_error}</p>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: health.tokens_configured ? '#10B981' : '#EF4444', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{health.tokens_configured ? 'Tokens Followize configurados no banco' : 'Tokens não encontrados no banco'}</span>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-subtle)', margin: 0 }}>Sync automático a cada 5 minutos. Token renovado automaticamente em caso de expiração.</p>
          </div>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--text-subtle)' }}>Não foi possível carregar o status.</p>
        )}
      </div>

      <div className="bg-white rounded-xl p-6 flex flex-col gap-5" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-2)' }}>Tokens Followize</h2>
          <p style={{ fontSize: 12, color: 'var(--text-subtle)', marginTop: 2 }}>Cole os tokens gerados pelo script <code>renovar_token.py</code>. O sistema atualiza imediatamente sem precisar reiniciar.</p>
        </div>
        <div className="flex flex-col gap-2">
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)' }}>Access Token</label>
          <textarea value={accessToken} onChange={e => setAccessToken(e.target.value)} rows={4} placeholder="eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9..."
            style={{ fontSize: 12, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-in)', resize: 'vertical', fontFamily: 'monospace', color: 'var(--text-2)', outline: 'none', background: 'var(--bg-input)' }} />
        </div>
        <div className="flex flex-col gap-2">
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)' }}>Refresh Token</label>
          <textarea value={refreshToken} onChange={e => setRefreshToken(e.target.value)} rows={3} placeholder="def50200..."
            style={{ fontSize: 12, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-in)', resize: 'vertical', fontFamily: 'monospace', color: 'var(--text-2)', outline: 'none', background: 'var(--bg-input)' }} />
        </div>
        {status === 'success' && <div style={{ padding: '10px 14px', background: 'rgba(16,185,129,0.1)', borderRadius: 8, border: '1px solid rgba(16,185,129,0.25)' }}><p style={{ fontSize: 13, color: '#10B981', fontWeight: 600 }}>Tokens atualizados com sucesso.</p></div>}
        {status === 'error' && <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', borderRadius: 8, border: '1px solid rgba(239,68,68,0.25)' }}><p style={{ fontSize: 13, color: '#EF4444', fontWeight: 600 }}>{errorMsg}</p></div>}
        <button onClick={handleSave} disabled={status === 'loading'} style={{ alignSelf: 'flex-start', padding: '9px 20px', borderRadius: 8, background: status === 'loading' ? '#93C5FD' : '#2563EB', color: 'white', fontWeight: 600, fontSize: 13, border: 'none', cursor: status === 'loading' ? 'not-allowed' : 'pointer' }}>
          {status === 'loading' ? 'Salvando...' : 'Salvar Tokens'}
        </button>
      </div>

      <div className="bg-white rounded-xl p-6 flex flex-col gap-5" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-2)' }}>Reprocessamento Histórico</h2>
          <p style={{ fontSize: 12, color: 'var(--text-subtle)', marginTop: 2 }}>Rebusca os últimos 90 dias de leads alterados no Followize e atualiza motivo de cancelamento e status no banco.</p>
        </div>
        {syncStatus === 'success' && <div style={{ padding: '10px 14px', background: 'rgba(16,185,129,0.1)', borderRadius: 8, border: '1px solid rgba(16,185,129,0.25)' }}><p style={{ fontSize: 13, color: '#10B981', fontWeight: 600 }}>{syncMsg}</p></div>}
        {syncStatus === 'error' && <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', borderRadius: 8, border: '1px solid rgba(239,68,68,0.25)' }}><p style={{ fontSize: 13, color: '#EF4444', fontWeight: 600 }}>{syncMsg}</p></div>}
        <button onClick={handleSync} disabled={syncStatus === 'loading'} style={{ alignSelf: 'flex-start', padding: '9px 20px', borderRadius: 8, background: syncStatus === 'loading' ? '#FCA5A5' : '#EF4444', color: 'white', fontWeight: 600, fontSize: 13, border: 'none', cursor: syncStatus === 'loading' ? 'not-allowed' : 'pointer' }}>
          {syncStatus === 'loading' ? 'Processando... (pode demorar)' : 'Reprocessar 90 dias'}
        </button>
      </div>
    </div>
  )
}

// ── Usuários tab ─────────────────────────────────────────────────────────────
interface UserItem { id: string; email: string; username: string; first_name: string | null; role: string; is_active: boolean; created_at: string }
const EMPTY_FORM = { email: '', username: '', first_name: '', password: '', role: 'user' }
const EMPTY_EDIT = { first_name: '', email: '', username: '', password: '' }
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString('pt-BR') }

function UsuariosTab() {
  const navigate = useNavigate()
  const [users, setUsers]           = useState<UserItem[]>([])
  const [loading, setLoading]       = useState(true)
  const [showModal, setShowModal]   = useState(false)
  const [form, setForm]             = useState(EMPTY_FORM)
  const [saving, setSaving]         = useState(false)
  const [formError, setFormError]   = useState('')
  const [toast, setToast]           = useState<{ msg: string; ok: boolean } | null>(null)
  const [editUser, setEditUser]     = useState<UserItem | null>(null)
  const [editForm, setEditForm]     = useState(EMPTY_EDIT)
  const [editError, setEditError]   = useState('')
  const [editSaving, setEditSaving] = useState(false)

  useEffect(() => {
    if (!localStorage.getItem('token')) { navigate('/login'); return }
    fetchUsers()
  }, [navigate])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  function fetchUsers() {
    setLoading(true)
    api.get<UserItem[]>('/api/v1/admin/users')
      .then(r => setUsers(r.data))
      .catch(err => {
        if (err.response?.status === 401) { localStorage.removeItem('token'); navigate('/login') }
        else if (err.response?.status === 403) navigate('/dashboard')
      })
      .finally(() => setLoading(false))
  }

  async function handleCreate() {
    if (!form.email.trim() || !form.username.trim() || !form.password.trim()) { setFormError('Email, username e senha são obrigatórios.'); return }
    setSaving(true); setFormError('')
    try {
      const { data } = await api.post<UserItem>('/api/v1/admin/users', form)
      setUsers(u => [...u, data]); setShowModal(false); setForm(EMPTY_FORM)
      setToast({ msg: 'Usuário criado com sucesso', ok: true })
    } catch (err: any) {
      setFormError(err.response?.data?.detail ?? 'Erro ao criar usuário.')
    } finally { setSaving(false) }
  }

  async function toggleActive(user: UserItem) {
    try {
      const { data } = await api.patch<UserItem>(`/api/v1/admin/users/${user.id}`, { is_active: !user.is_active })
      setUsers(u => u.map(x => x.id === data.id ? data : x))
      setToast({ msg: data.is_active ? 'Usuário ativado' : 'Usuário desativado', ok: true })
    } catch { setToast({ msg: 'Erro ao atualizar usuário', ok: false }) }
  }

  function openEdit(user: UserItem) {
    setEditUser(user); setEditForm({ first_name: user.first_name ?? '', email: user.email, username: user.username, password: '' }); setEditError('')
  }

  async function handleEdit() {
    if (!editUser) return
    setEditSaving(true); setEditError('')
    try {
      const payload: Record<string, string> = {}
      if (editForm.first_name !== (editUser.first_name ?? '')) payload.first_name = editForm.first_name
      if (editForm.email !== editUser.email) payload.email = editForm.email
      if (editForm.username !== editUser.username) payload.username = editForm.username
      if (editForm.password.trim()) payload.password = editForm.password
      if (Object.keys(payload).length === 0) { setEditUser(null); return }
      const { data } = await api.patch<UserItem>(`/api/v1/admin/users/${editUser.id}`, payload)
      setUsers(u => u.map(x => x.id === data.id ? data : x)); setEditUser(null)
      setToast({ msg: 'Usuário atualizado', ok: true })
    } catch (err: any) {
      setEditError(err.response?.data?.detail ?? 'Erro ao atualizar.')
    } finally { setEditSaving(false) }
  }

  async function toggleRole(user: UserItem) {
    const newRole = user.role === 'admin' ? 'user' : 'admin'
    try {
      const { data } = await api.patch<UserItem>(`/api/v1/admin/users/${user.id}`, { role: newRole })
      setUsers(u => u.map(x => x.id === data.id ? data : x))
      setToast({ msg: `Perfil alterado para ${data.role}`, ok: true })
    } catch { setToast({ msg: 'Erro ao alterar perfil', ok: false }) }
  }

  return (
    <>
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 100, background: toast.ok ? '#10B981' : '#EF4444', color: 'white', padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600, boxShadow: '0 4px 16px rgba(0,0,0,0.15)' }}>
          {toast.msg}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button onClick={() => { setShowModal(true); setFormError('') }}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: '#2563EB', color: 'white', border: 'none', cursor: 'pointer' }}>
          <UserPlus size={15} /> Novo usuário
        </button>
      </div>

      <div className="bg-white rounded-xl overflow-hidden" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
        {loading ? (
          <p style={{ padding: '24px', fontSize: 13, color: 'var(--text-subtle)' }}>Carregando...</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)', background: 'var(--bg-hover)' }}>
                  {['Nome', 'Email', 'Username', 'Perfil', 'Status', 'Criado em', 'Ações'].map(h => (
                    <th key={h} style={{ padding: '11px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((user, i) => (
                  <tr key={user.id} style={{ borderBottom: i < users.length - 1 ? '1px solid var(--border-lt)' : 'none', background: 'var(--bg-card)', opacity: user.is_active ? 1 : 0.5 }}>
                    <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 500, color: 'var(--text-2)' }}>{user.first_name || '—'}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-muted)' }}>{user.email}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-muted)' }}>{user.username}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 99, background: user.role === 'admin' ? 'rgba(139,92,246,0.12)' : 'rgba(107,114,128,0.12)', color: user.role === 'admin' ? '#7C3AED' : '#6B7280' }}>{user.role}</span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 99, background: user.is_active ? 'rgba(16,185,129,0.12)' : 'rgba(107,114,128,0.12)', color: user.is_active ? '#10B981' : '#6B7280' }}>{user.is_active ? 'Ativo' : 'Inativo'}</span>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtDate(user.created_at)}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => openEdit(user)} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', color: 'var(--text-3b)', cursor: 'pointer' }}>
                          <Pencil size={12} /> Editar
                        </button>
                        <button onClick={() => toggleRole(user)} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', color: 'var(--text-3b)', cursor: 'pointer' }}>
                          {user.role === 'admin' ? 'Tornar user' : 'Tornar admin'}
                        </button>
                        <button onClick={() => toggleActive(user)} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', background: user.is_active ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)', color: user.is_active ? '#EF4444' : '#10B981' }}>
                          {user.is_active ? 'Desativar' : 'Ativar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editUser && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }} onClick={() => setEditUser(null)}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 16, width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border-lt)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-2)' }}>Editar Usuário</span>
              <button onClick={() => setEditUser(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-subtle)', display: 'flex' }}><X size={18} /></button>
            </div>
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {[
                { label: 'Nome', field: 'first_name', type: 'text', placeholder: 'Nome do usuário' },
                { label: 'Email', field: 'email', type: 'email', placeholder: 'email@empresa.com' },
                { label: 'Username', field: 'username', type: 'text', placeholder: 'username' },
                { label: 'Nova senha (deixe em branco para manter)', field: 'password', type: 'password', placeholder: '••••••••' },
              ].map(({ label, field, type, placeholder }) => (
                <div key={field} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3b)' }}>{label}</label>
                  <input type={type} placeholder={placeholder} value={editForm[field as keyof typeof editForm]}
                    onChange={e => setEditForm(f => ({ ...f, [field]: e.target.value }))}
                    style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-in)', fontSize: 13, color: 'var(--text-2)', background: 'var(--bg-input)', outline: 'none' }} />
                </div>
              ))}
              {editError && <p style={{ fontSize: 13, color: '#EF4444', margin: 0 }}>{editError}</p>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 4 }}>
                <button onClick={() => setEditUser(null)} style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, background: 'none', color: 'var(--text-muted)', border: '1px solid var(--border)', cursor: 'pointer' }}>Cancelar</button>
                <button onClick={handleEdit} disabled={editSaving} style={{ padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: editSaving ? '#93C5FD' : '#2563EB', color: 'white', border: 'none', cursor: editSaving ? 'not-allowed' : 'pointer' }}>
                  {editSaving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }} onClick={() => setShowModal(false)}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 16, width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border-lt)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-2)' }}>Novo Usuário</span>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-subtle)', display: 'flex' }}><X size={18} /></button>
            </div>
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {[
                { label: 'Nome', field: 'first_name', type: 'text', placeholder: 'Nome do usuário' },
                { label: 'Email *', field: 'email', type: 'email', placeholder: 'email@empresa.com' },
                { label: 'Username *', field: 'username', type: 'text', placeholder: 'username' },
                { label: 'Senha *', field: 'password', type: 'password', placeholder: '••••••••' },
              ].map(({ label, field, type, placeholder }) => (
                <div key={field} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3b)' }}>{label}</label>
                  <input type={type} placeholder={placeholder} value={form[field as keyof typeof form]}
                    onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                    style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-in)', fontSize: 13, color: 'var(--text-2)', background: 'var(--bg-input)', outline: 'none' }} />
                </div>
              ))}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3b)' }}>Perfil</label>
                <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                  style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-in)', fontSize: 13, color: 'var(--text-2)', background: 'var(--bg-input)', outline: 'none' }}>
                  <option value="user">user</option>
                  <option value="admin">admin</option>
                </select>
              </div>
              {formError && <p style={{ fontSize: 13, color: '#EF4444', margin: 0 }}>{formError}</p>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 4 }}>
                <button onClick={() => setShowModal(false)} style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, background: 'none', color: 'var(--text-muted)', border: '1px solid var(--border)', cursor: 'pointer' }}>Cancelar</button>
                <button onClick={handleCreate} disabled={saving} style={{ padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: saving ? '#93C5FD' : '#2563EB', color: 'white', border: 'none', cursor: saving ? 'not-allowed' : 'pointer' }}>
                  {saving ? 'Criando...' : 'Criar usuário'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Formulário tab ───────────────────────────────────────────────────────────
interface FormUser { id: string; username: string; first_name: string; last_name: string; email: string; is_active: boolean; created_at: string }
const EMPTY_CREATE = { username: '', first_name: '', last_name: '', email: '', password: '' }
const EMPTY_PWD    = { password: '', confirm: '' }

function FormularioTab() {
  const [users, setUsers]         = useState<FormUser[]>([])
  const [loading, setLoading]     = useState(true)
  const [credKey, setCredKey]     = useState<string | null>(null)
  const [copied, setCopied]       = useState(false)
  const [credOpen, setCredOpen]   = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState(EMPTY_CREATE)
  const [createError, setCreateError] = useState('')
  const [creating, setCreating]   = useState(false)
  const [pwdUser, setPwdUser]     = useState<FormUser | null>(null)
  const [pwdForm, setPwdForm]     = useState(EMPTY_PWD)
  const [pwdError, setPwdError]   = useState('')
  const [pwdSaving, setPwdSaving] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const [usersRes, keyRes] = await Promise.all([
        api.get<FormUser[]>('/api/v1/admin/form-users'),
        api.get<{ value: string }>('/api/v1/admin/form-credentials-key'),
      ])
      setUsers(usersRes.data); setCredKey(keyRes.data.value ?? null)
    } catch {
      try { const r = await api.get<FormUser[]>('/api/v1/admin/form-users'); setUsers(r.data) } catch {}
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function toggleActive(u: FormUser) {
    await api.patch(`/api/v1/admin/form-users/${u.id}`, { is_active: !u.is_active })
    setUsers(prev => prev.map(x => x.id === u.id ? { ...x, is_active: !u.is_active } : x))
  }

  async function handleCreate() {
    setCreateError('')
    if (!createForm.username || !createForm.first_name || !createForm.email || !createForm.password) { setCreateError('Preencha todos os campos obrigatórios.'); return }
    setCreating(true)
    try {
      const r = await api.post<FormUser>('/api/v1/admin/form-users', createForm)
      setUsers(prev => [...prev, r.data].sort((a, b) => a.first_name.localeCompare(b.first_name)))
      setShowCreate(false); setCreateForm(EMPTY_CREATE)
    } catch (e: any) {
      const detail = e?.response?.data?.detail
      const status = e?.response?.status
      setCreateError(Array.isArray(detail) ? detail.map((d: any) => d.msg).join(', ') : detail ?? (status ? `Erro ${status} ao criar usuário.` : 'Sem resposta do servidor.'))
    } finally { setCreating(false) }
  }

  async function handlePwd() {
    setPwdError('')
    if (!pwdForm.password) { setPwdError('Digite a nova senha.'); return }
    if (pwdForm.password !== pwdForm.confirm) { setPwdError('As senhas não coincidem.'); return }
    setPwdSaving(true)
    try {
      await api.patch(`/api/v1/admin/form-users/${pwdUser!.id}`, { password: pwdForm.password })
      setPwdUser(null); setPwdForm(EMPTY_PWD)
    } catch (e: any) { setPwdError(e?.response?.data?.detail ?? 'Erro ao alterar senha.') }
    finally { setPwdSaving(false) }
  }

  function copyCredUrl() {
    if (!credKey) return
    navigator.clipboard.writeText(`http://54.86.238.165/api/v1/forms/credentials?key=${credKey}`).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  const modalWrap = (title: string, onClose: () => void, children: React.ReactNode) => (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#1F2937', borderRadius: 12, padding: 28, width: 420, maxWidth: '95vw' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ color: '#F9FAFB', fontSize: 16, fontWeight: 700, margin: 0 }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  )

  const inp = (label: string, value: string, onChange: (v: string) => void, type = 'text', placeholder = '') => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 12, color: '#9CA3AF', marginBottom: 4 }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: '100%', background: '#111827', border: '1px solid #374151', borderRadius: 6, padding: '8px 10px', color: '#F9FAFB', fontSize: 13, boxSizing: 'border-box' }} />
    </div>
  )

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button onClick={() => { setShowCreate(true); setCreateError('') }}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          <UserPlus size={15} /> Novo Acesso
        </button>
      </div>

      {credKey && (
        <div style={{ background: '#111827', border: '1px solid #1F2937', borderRadius: 8, marginBottom: 24, overflow: 'hidden' }}>
          <button onClick={() => setCredOpen(o => !o)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer', borderBottom: credOpen ? '1px solid #1F2937' : 'none' }}>
            {credOpen ? <ChevronDown size={13} color="#6B7280" /> : <ChevronRight size={13} color="#6B7280" />}
            <span style={{ fontSize: 12, fontWeight: 600, color: '#6B7280' }}>URL de Credenciais</span>
          </button>
          {credOpen && (
            <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <p style={{ fontSize: 11, color: '#6B7280', margin: '0 0 4px' }}>Adicione ao st.secrets como <code style={{ color: '#93C5FD' }}>FORMS_CREDENTIALS_URL</code></p>
                <code style={{ fontSize: 11, color: '#93C5FD', wordBreak: 'break-all' }}>{`http://54.86.238.165/api/v1/forms/credentials?key=${credKey}`}</code>
              </div>
              <button onClick={copyCredUrl} style={{ flexShrink: 0, background: 'none', border: '1px solid #374151', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', color: copied ? '#34D399' : '#9CA3AF', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                {copied ? <><Check size={13} /> Copiado</> : <><Copy size={13} /> Copiar</>}
              </button>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <p style={{ color: '#6B7280', fontSize: 13 }}>Carregando...</p>
      ) : (
        <div style={{ background: '#1F2937', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#111827' }}>
                {['Usuário', 'Nome', 'Email', 'Status', 'Ações'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: '#6B7280', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} style={{ borderTop: '1px solid #374151' }}>
                  <td style={{ padding: '10px 14px', color: '#F9FAFB', fontFamily: 'monospace', fontSize: 12 }}>{u.username}</td>
                  <td style={{ padding: '10px 14px', color: '#E5E7EB' }}>{u.first_name} {u.last_name}</td>
                  <td style={{ padding: '10px 14px', color: '#9CA3AF' }}>{u.email}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 99, background: u.is_active ? '#064E3B' : '#374151', color: u.is_active ? '#34D399' : '#9CA3AF' }}>
                      {u.is_active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => toggleActive(u)} style={{ background: 'none', border: '1px solid #374151', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: u.is_active ? '#F87171' : '#34D399', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                        {u.is_active ? <ToggleLeft size={13} /> : <ToggleRight size={13} />}
                        {u.is_active ? 'Desativar' : 'Ativar'}
                      </button>
                      <button onClick={() => { setPwdUser(u); setPwdForm(EMPTY_PWD); setPwdError('') }} style={{ background: 'none', border: '1px solid #374151', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: '#93C5FD', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                        <KeyRound size={13} /> Senha
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && modalWrap('Novo Acesso ao Formulário', () => setShowCreate(false), (
        <>
          {inp('Username *', createForm.username, v => setCreateForm(p => ({ ...p, username: v })), 'text', 'ex: joao')}
          {inp('Nome *', createForm.first_name, v => setCreateForm(p => ({ ...p, first_name: v })), 'text', 'ex: João')}
          {inp('Sobrenome', createForm.last_name, v => setCreateForm(p => ({ ...p, last_name: v })))}
          {inp('Email *', createForm.email, v => setCreateForm(p => ({ ...p, email: v })), 'email', 'ex: joao@equipe.com')}
          {inp('Senha *', createForm.password, v => setCreateForm(p => ({ ...p, password: v })), 'password')}
          {createError && <p style={{ color: '#F87171', fontSize: 12, marginBottom: 10 }}>{createError}</p>}
          <button onClick={handleCreate} disabled={creating}
            style={{ width: '100%', background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 0', fontSize: 13, fontWeight: 600, cursor: creating ? 'not-allowed' : 'pointer', opacity: creating ? 0.7 : 1 }}>
            {creating ? 'Criando...' : 'Criar Acesso'}
          </button>
        </>
      ))}

      {pwdUser && modalWrap(`Alterar Senha — ${pwdUser.first_name}`, () => setPwdUser(null), (
        <>
          {inp('Nova senha', pwdForm.password, v => setPwdForm(p => ({ ...p, password: v })), 'password')}
          {inp('Confirmar senha', pwdForm.confirm, v => setPwdForm(p => ({ ...p, confirm: v })), 'password')}
          {pwdError && <p style={{ color: '#F87171', fontSize: 12, marginBottom: 10 }}>{pwdError}</p>}
          <button onClick={handlePwd} disabled={pwdSaving}
            style={{ width: '100%', background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 0', fontSize: 13, fontWeight: 600, cursor: pwdSaving ? 'not-allowed' : 'pointer', opacity: pwdSaving ? 0.7 : 1 }}>
            {pwdSaving ? 'Salvando...' : 'Salvar Senha'}
          </button>
        </>
      ))}
    </>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function Settings() {
  const [activeTab, setActiveTab] = useState<Tab>('Configurações')

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-2)', margin: 0 }}>Configurações</h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>Integrações, usuários e acesso ao formulário</p>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 28, borderBottom: '2px solid var(--border)' }}>
        {TABS.map(tab => {
          const active = activeTab === tab
          return (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              padding: '9px 20px', fontSize: 13, fontWeight: active ? 700 : 500,
              color: active ? '#2563EB' : 'var(--text-subtle)',
              background: 'none', border: 'none', cursor: 'pointer',
              borderBottom: active ? '2px solid #2563EB' : '2px solid transparent',
              marginBottom: -2, borderRadius: 0, transition: 'color 150ms',
            }}>{tab}</button>
          )
        })}
      </div>

      {activeTab === 'Configurações' && <ConfiguracoesTab />}
      {activeTab === 'Usuários'      && <UsuariosTab />}
      {activeTab === 'Formulário'    && <FormularioTab />}
    </div>
  )
}
