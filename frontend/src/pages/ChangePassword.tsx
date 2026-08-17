import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'

export default function ChangePassword() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (newPassword.length < 8) { setError('A nova senha precisa ter pelo menos 8 caracteres.'); return }
    if (newPassword !== confirmPassword) { setError('As senhas não coincidem.'); return }
    setSaving(true)
    try {
      await api.post('/api/v1/auth/change-password', { current_password: currentPassword, new_password: newPassword })
      navigate('/dashboard')
    } catch (err: any) {
      setError(err.response?.data?.detail ?? 'Erro ao trocar a senha.')
    } finally {
      setSaving(false)
    }
  }

  function logout() {
    localStorage.removeItem('token')
    navigate('/login')
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 overflow-y-auto bg-[var(--bg-page)]">
      <div className="w-full max-w-[500px] bg-[var(--bg-card)] border border-[var(--border)] rounded-[20px] shadow-[0_1px_2px_rgba(15,23,42,.04),0_16px_40px_rgba(15,23,42,.05)] px-10 py-[clamp(20px,4vh,32px)]">
        <p className="text-[clamp(26px,4.5vh,36px)] leading-[1.05] font-bold text-[var(--text-1)] m-0">
          Troque sua senha
        </p>
        <p className="text-base font-normal leading-[1.5] text-[var(--text-3b)] max-w-[360px] mt-2 mb-[clamp(20px,4vh,36px)]">
          Sua senha é temporária. Defina uma nova antes de continuar.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <label htmlFor="current" className="text-sm font-semibold text-[var(--text-3b)]">
              Senha atual (temporária)
            </label>
            <input
              id="current"
              type="password"
              placeholder="••••••••"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              className="h-[clamp(44px,6vh,52px)] rounded-[14px] border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-1)] text-sm px-4 outline-none transition-colors duration-150 placeholder:text-[var(--text-muted)] focus:border-blue-600 focus:ring-4 focus:ring-blue-600/15"
            />
          </div>

          <div className="flex flex-col gap-3">
            <label htmlFor="new" className="text-sm font-semibold text-[var(--text-3b)]">
              Nova senha
            </label>
            <input
              id="new"
              type="password"
              placeholder="Mínimo 8 caracteres"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              className="h-[clamp(44px,6vh,52px)] rounded-[14px] border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-1)] text-sm px-4 outline-none transition-colors duration-150 placeholder:text-[var(--text-muted)] focus:border-blue-600 focus:ring-4 focus:ring-blue-600/15"
            />
          </div>

          <div className="flex flex-col gap-3">
            <label htmlFor="confirm" className="text-sm font-semibold text-[var(--text-3b)]">
              Confirmar nova senha
            </label>
            <input
              id="confirm"
              type="password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="h-[clamp(44px,6vh,52px)] rounded-[14px] border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-1)] text-sm px-4 outline-none transition-colors duration-150 placeholder:text-[var(--text-muted)] focus:border-blue-600 focus:ring-4 focus:ring-blue-600/15"
            />
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="w-full mt-[-8px] h-[clamp(44px,6vh,52px)] rounded-[14px] bg-blue-600 text-white text-sm font-semibold transition-all duration-150 hover:bg-blue-700 hover:shadow-[0_4px_12px_rgba(15,23,42,.08)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 focus-visible:outline-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? 'Salvando...' : 'Trocar senha'}
          </button>

          <button
            type="button"
            onClick={logout}
            className="text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text-2)] -mt-2"
          >
            Sair
          </button>
        </form>
      </div>
    </div>
  )
}
