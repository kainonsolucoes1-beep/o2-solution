import { useEffect, useState } from 'react'
import { UserPlus, KeyRound, ToggleLeft, ToggleRight, Copy, Check, ChevronDown, ChevronRight } from 'lucide-react'
import api from '../api'

interface FormUser {
  id: string
  username: string
  first_name: string
  last_name: string
  email: string
  is_active: boolean
  created_at: string
}

const EMPTY_CREATE = { username: '', first_name: '', last_name: '', email: '', password: '' }
const EMPTY_PWD = { password: '', confirm: '' }

export default function Forms() {
  const [users, setUsers] = useState<FormUser[]>([])
  const [loading, setLoading] = useState(true)
  const [credKey, setCredKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [credOpen, setCredOpen] = useState(false)

  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState(EMPTY_CREATE)
  const [createError, setCreateError] = useState('')
  const [creating, setCreating] = useState(false)

  const [pwdUser, setPwdUser] = useState<FormUser | null>(null)
  const [pwdForm, setPwdForm] = useState(EMPTY_PWD)
  const [pwdError, setPwdError] = useState('')
  const [pwdSaving, setPwdSaving] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const [usersRes, keyRes] = await Promise.all([
        api.get<FormUser[]>('/api/v1/admin/form-users'),
        api.get<{ value: string }>('/api/v1/admin/form-credentials-key'),
      ])
      setUsers(usersRes.data)
      setCredKey(keyRes.data.value ?? null)
    } catch {
      try {
        const r = await api.get<FormUser[]>('/api/v1/admin/form-users')
        setUsers(r.data)
      } catch {}
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function toggleActive(u: FormUser) {
    await api.patch(`/api/v1/admin/form-users/${u.id}`, { is_active: !u.is_active })
    setUsers(prev => prev.map(x => x.id === u.id ? { ...x, is_active: !u.is_active } : x))
  }

  async function handleCreate() {
    setCreateError('')
    if (!createForm.username || !createForm.first_name || !createForm.email || !createForm.password) {
      setCreateError('Preencha todos os campos obrigatórios.')
      return
    }
    setCreating(true)
    try {
      const r = await api.post<FormUser>('/api/v1/admin/form-users', createForm)
      setUsers(prev => [...prev, r.data].sort((a, b) => a.first_name.localeCompare(b.first_name)))
      setShowCreate(false)
      setCreateForm(EMPTY_CREATE)
    } catch (e: any) {
      setCreateError(e?.response?.data?.detail ?? 'Erro ao criar usuário.')
    } finally {
      setCreating(false)
    }
  }

  async function handlePwd() {
    setPwdError('')
    if (!pwdForm.password) { setPwdError('Digite a nova senha.'); return }
    if (pwdForm.password !== pwdForm.confirm) { setPwdError('As senhas não coincidem.'); return }
    setPwdSaving(true)
    try {
      await api.patch(`/api/v1/admin/form-users/${pwdUser!.id}`, { password: pwdForm.password })
      setPwdUser(null)
      setPwdForm(EMPTY_PWD)
    } catch (e: any) {
      setPwdError(e?.response?.data?.detail ?? 'Erro ao alterar senha.')
    } finally {
      setPwdSaving(false)
    }
  }

  function copyCredUrl() {
    if (!credKey) return
    const url = `http://54.86.238.165/api/v1/forms/credentials?key=${credKey}`
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const modal = (title: string, onClose: () => void, children: React.ReactNode) => (
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

  const input = (label: string, value: string, onChange: (v: string) => void, type = 'text', placeholder = '') => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 12, color: '#9CA3AF', marginBottom: 4 }}>{label}</label>
      <input
        type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ width: '100%', background: '#111827', border: '1px solid #374151', borderRadius: 6, padding: '8px 10px', color: '#F9FAFB', fontSize: 13, boxSizing: 'border-box' }}
      />
    </div>
  )

  return (
    <div style={{ padding: '24px 32px', maxWidth: 900 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#F9FAFB', margin: 0 }}>Formulário de Leads</h1>
          <p style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>Gerencie quem tem acesso ao Forms</p>
        </div>
        <button
          onClick={() => { setShowCreate(true); setCreateError('') }}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          <UserPlus size={15} /> Novo Acesso
        </button>
      </div>

      {credKey && (
        <div style={{ background: '#111827', border: '1px solid #1F2937', borderRadius: 8, marginBottom: 24, overflow: 'hidden' }}>
          <button
            onClick={() => setCredOpen(o => !o)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer', borderBottom: credOpen ? '1px solid #1F2937' : 'none' }}
          >
            {credOpen ? <ChevronDown size={13} color="#6B7280" /> : <ChevronRight size={13} color="#6B7280" />}
            <span style={{ fontSize: 12, fontWeight: 600, color: '#6B7280' }}>URL de Credenciais</span>
          </button>
          {credOpen && (
            <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <p style={{ fontSize: 11, color: '#6B7280', margin: '0 0 4px' }}>Adicione ao st.secrets como <code style={{ color: '#93C5FD' }}>FORMS_CREDENTIALS_URL</code></p>
                <code style={{ fontSize: 11, color: '#93C5FD', wordBreak: 'break-all' }}>
                  {`http://54.86.238.165/api/v1/forms/credentials?key=${credKey}`}
                </code>
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
                      <button
                        onClick={() => toggleActive(u)}
                        title={u.is_active ? 'Desativar acesso' : 'Ativar acesso'}
                        style={{ background: 'none', border: '1px solid #374151', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: u.is_active ? '#F87171' : '#34D399', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}
                      >
                        {u.is_active ? <ToggleLeft size={13} /> : <ToggleRight size={13} />}
                        {u.is_active ? 'Desativar' : 'Ativar'}
                      </button>
                      <button
                        onClick={() => { setPwdUser(u); setPwdForm(EMPTY_PWD); setPwdError('') }}
                        title="Alterar senha"
                        style={{ background: 'none', border: '1px solid #374151', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: '#93C5FD', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}
                      >
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

      {showCreate && modal('Novo Acesso ao Formulário', () => setShowCreate(false), (
        <>
          {input('Username *', createForm.username, v => setCreateForm(p => ({ ...p, username: v })), 'text', 'ex: joao')}
          {input('Nome *', createForm.first_name, v => setCreateForm(p => ({ ...p, first_name: v })), 'text', 'ex: João')}
          {input('Sobrenome', createForm.last_name, v => setCreateForm(p => ({ ...p, last_name: v })))}
          {input('Email *', createForm.email, v => setCreateForm(p => ({ ...p, email: v })), 'email', 'ex: joao@equipe.com')}
          {input('Senha *', createForm.password, v => setCreateForm(p => ({ ...p, password: v })), 'password')}
          {createError && <p style={{ color: '#F87171', fontSize: 12, marginBottom: 10 }}>{createError}</p>}
          <button
            onClick={handleCreate} disabled={creating}
            style={{ width: '100%', background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 0', fontSize: 13, fontWeight: 600, cursor: creating ? 'not-allowed' : 'pointer', opacity: creating ? 0.7 : 1 }}
          >
            {creating ? 'Criando...' : 'Criar Acesso'}
          </button>
        </>
      ))}

      {pwdUser && modal(`Alterar Senha — ${pwdUser.first_name}`, () => setPwdUser(null), (
        <>
          {input('Nova senha', pwdForm.password, v => setPwdForm(p => ({ ...p, password: v })), 'password')}
          {input('Confirmar senha', pwdForm.confirm, v => setPwdForm(p => ({ ...p, confirm: v })), 'password')}
          {pwdError && <p style={{ color: '#F87171', fontSize: 12, marginBottom: 10 }}>{pwdError}</p>}
          <button
            onClick={handlePwd} disabled={pwdSaving}
            style={{ width: '100%', background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 0', fontSize: 13, fontWeight: 600, cursor: pwdSaving ? 'not-allowed' : 'pointer', opacity: pwdSaving ? 0.7 : 1 }}
          >
            {pwdSaving ? 'Salvando...' : 'Salvar Senha'}
          </button>
        </>
      ))}
    </div>
  )
}
