import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { UserPlus, X, Pencil } from 'lucide-react'
import api from '../api'

interface UserItem {
  id: string
  email: string
  username: string
  first_name: string | null
  role: string
  is_active: boolean
  created_at: string
}

const EMPTY_FORM = { email: '', username: '', first_name: '', password: '', role: 'user' }
const EMPTY_EDIT = { first_name: '', email: '', username: '', password: '' }

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR')
}

export default function Users() {
  const navigate = useNavigate()
  const [users, setUsers]         = useState<UserItem[]>([])
  const [loading, setLoading]     = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm]           = useState(EMPTY_FORM)
  const [saving, setSaving]       = useState(false)
  const [formError, setFormError] = useState('')
  const [toast, setToast]         = useState<{ msg: string; ok: boolean } | null>(null)
  const [editUser, setEditUser]   = useState<UserItem | null>(null)
  const [editForm, setEditForm]   = useState(EMPTY_EDIT)
  const [editError, setEditError] = useState('')
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
    if (!form.email.trim() || !form.username.trim() || !form.password.trim()) {
      setFormError('Email, username e senha são obrigatórios.')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      const { data } = await api.post<UserItem>('/api/v1/admin/users', form)
      setUsers(u => [...u, data])
      setShowModal(false)
      setForm(EMPTY_FORM)
      setToast({ msg: 'Usuário criado com sucesso', ok: true })
    } catch (err: any) {
      setFormError(err.response?.data?.detail ?? 'Erro ao criar usuário.')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(user: UserItem) {
    try {
      const { data } = await api.patch<UserItem>(`/api/v1/admin/users/${user.id}`, { is_active: !user.is_active })
      setUsers(u => u.map(x => x.id === data.id ? data : x))
      setToast({ msg: data.is_active ? 'Usuário ativado' : 'Usuário desativado', ok: true })
    } catch {
      setToast({ msg: 'Erro ao atualizar usuário', ok: false })
    }
  }

  function openEdit(user: UserItem) {
    setEditUser(user)
    setEditForm({ first_name: user.first_name ?? '', email: user.email, username: user.username, password: '' })
    setEditError('')
  }

  async function handleEdit() {
    if (!editUser) return
    setEditSaving(true)
    setEditError('')
    try {
      const payload: Record<string, string> = {}
      if (editForm.first_name !== (editUser.first_name ?? '')) payload.first_name = editForm.first_name
      if (editForm.email !== editUser.email) payload.email = editForm.email
      if (editForm.username !== editUser.username) payload.username = editForm.username
      if (editForm.password.trim()) payload.password = editForm.password
      if (Object.keys(payload).length === 0) { setEditUser(null); return }
      const { data } = await api.patch<UserItem>(`/api/v1/admin/users/${editUser.id}`, payload)
      setUsers(u => u.map(x => x.id === data.id ? data : x))
      setEditUser(null)
      setToast({ msg: 'Usuário atualizado', ok: true })
    } catch (err: any) {
      setEditError(err.response?.data?.detail ?? 'Erro ao atualizar.')
    } finally {
      setEditSaving(false)
    }
  }

  async function toggleRole(user: UserItem) {
    const newRole = user.role === 'admin' ? 'user' : 'admin'
    try {
      const { data } = await api.patch<UserItem>(`/api/v1/admin/users/${user.id}`, { role: newRole })
      setUsers(u => u.map(x => x.id === data.id ? data : x))
      setToast({ msg: `Perfil alterado para ${data.role}`, ok: true })
    } catch {
      setToast({ msg: 'Erro ao alterar perfil', ok: false })
    }
  }

  return (
    <>
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 100,
          background: toast.ok ? '#10B981' : '#EF4444',
          color: 'white', padding: '10px 18px', borderRadius: 10,
          fontSize: 13, fontWeight: 600, boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
        }}>
          {toast.msg}
        </div>
      )}

      <main className="px-4 md:px-8 xl:px-12 py-6 flex flex-col gap-6">

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-2)' }}>Usuários</h1>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>Gerencie os acessos ao sistema</p>
          </div>
          <button
            onClick={() => { setShowModal(true); setFormError('') }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              background: '#2563EB', color: 'white', border: 'none', cursor: 'pointer',
            }}
          >
            <UserPlus size={15} />
            Novo usuário
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
                      <th key={h} style={{ padding: '11px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map((user, i) => (
                    <tr
                      key={user.id}
                      style={{
                        borderBottom: i < users.length - 1 ? '1px solid var(--border-lt)' : 'none',
                        background: 'var(--bg-card)',
                        opacity: user.is_active ? 1 : 0.5,
                      }}
                    >
                      <td style={{ padding: '12px 16px', fontSize: 14, fontWeight: 500, color: 'var(--text-2)' }}>
                        {user.first_name || '—'}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-muted)' }}>
                        {user.email}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-muted)' }}>
                        {user.username}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 99,
                          background: user.role === 'admin' ? 'rgba(139,92,246,0.12)' : 'rgba(107,114,128,0.12)',
                          color: user.role === 'admin' ? '#7C3AED' : '#6B7280',
                        }}>
                          {user.role}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 99,
                          background: user.is_active ? 'rgba(16,185,129,0.12)' : 'rgba(107,114,128,0.12)',
                          color: user.is_active ? '#10B981' : '#6B7280',
                        }}>
                          {user.is_active ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {fmtDate(user.created_at)}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            onClick={() => openEdit(user)}
                            title="Editar perfil"
                            style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', color: 'var(--text-3b)', cursor: 'pointer' }}
                          >
                            <Pencil size={12} /> Editar
                          </button>
                          <button
                            onClick={() => toggleRole(user)}
                            style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', color: 'var(--text-3b)', cursor: 'pointer' }}
                          >
                            {user.role === 'admin' ? 'Tornar user' : 'Tornar admin'}
                          </button>
                          <button
                            onClick={() => toggleActive(user)}
                            style={{
                              fontSize: 12, padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                              background: user.is_active ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
                              color: user.is_active ? '#EF4444' : '#10B981',
                            }}
                          >
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
      </main>

      {editUser && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}
          onClick={() => setEditUser(null)}
        >
          <div
            style={{ background: 'var(--bg-card)', borderRadius: 16, width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border-lt)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-2)' }}>Editar Usuário</span>
              <button onClick={() => setEditUser(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-subtle)', display: 'flex' }}>
                <X size={18} />
              </button>
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
                  <input
                    type={type}
                    placeholder={placeholder}
                    value={editForm[field as keyof typeof editForm]}
                    onChange={e => setEditForm(f => ({ ...f, [field]: e.target.value }))}
                    style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-in)', fontSize: 13, color: 'var(--text-2)', background: 'var(--bg-input)', outline: 'none' }}
                  />
                </div>
              ))}
              {editError && <p style={{ fontSize: 13, color: '#EF4444', margin: 0 }}>{editError}</p>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 4 }}>
                <button
                  onClick={() => setEditUser(null)}
                  style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, background: 'none', color: 'var(--text-muted)', border: '1px solid var(--border)', cursor: 'pointer' }}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleEdit}
                  disabled={editSaving}
                  style={{ padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: editSaving ? '#93C5FD' : '#2563EB', color: 'white', border: 'none', cursor: editSaving ? 'not-allowed' : 'pointer' }}
                >
                  {editSaving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}
          onClick={() => setShowModal(false)}
        >
          <div
            style={{ background: 'var(--bg-card)', borderRadius: 16, width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border-lt)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-2)' }}>Novo Usuário</span>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-subtle)', display: 'flex' }}>
                <X size={18} />
              </button>
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
                  <input
                    type={type}
                    placeholder={placeholder}
                    value={form[field as keyof typeof form]}
                    onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                    style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-in)', fontSize: 13, color: 'var(--text-2)', background: 'var(--bg-input)', outline: 'none' }}
                  />
                </div>
              ))}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3b)' }}>Perfil</label>
                <select
                  value={form.role}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                  style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-in)', fontSize: 13, color: 'var(--text-2)', background: 'var(--bg-input)', outline: 'none' }}
                >
                  <option value="user">user</option>
                  <option value="admin">admin</option>
                </select>
              </div>

              {formError && (
                <p style={{ fontSize: 13, color: '#EF4444', margin: 0 }}>{formError}</p>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 4 }}>
                <button
                  onClick={() => setShowModal(false)}
                  style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, background: 'none', color: 'var(--text-muted)', border: '1px solid var(--border)', cursor: 'pointer' }}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreate}
                  disabled={saving}
                  style={{ padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: saving ? '#93C5FD' : '#2563EB', color: 'white', border: 'none', cursor: saving ? 'not-allowed' : 'pointer' }}
                >
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
