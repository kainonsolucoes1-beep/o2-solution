import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    try {
      const { data } = await api.post('/api/v1/auth/login', { email, password })
      localStorage.setItem('token', data.access_token)
      navigate('/dashboard')
    } catch {
      setError('Email ou senha inválidos.')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 overflow-y-auto bg-[var(--bg-page)]">
      <div className="w-full max-w-[500px] bg-[var(--bg-card)] border border-[var(--border)] rounded-[20px] shadow-[0_1px_2px_rgba(15,23,42,.04),0_16px_40px_rgba(15,23,42,.05)] px-10 py-[clamp(20px,4vh,32px)]">
        <p className="text-[clamp(30px,5vh,42px)] leading-[1.05] font-bold text-[var(--text-1)] m-0">
          O2 Sig
        </p>
        <p className="text-base font-normal leading-[1.5] text-[var(--text-3b)] max-w-[280px] mt-2 mb-[clamp(20px,4vh,36px)]">
          Acesse sua área de trabalho.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <label htmlFor="email" className="text-sm font-semibold text-[var(--text-3b)]">
              Email
            </label>
            <input
              id="email"
              type="email"
              placeholder="voce@empresa.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="h-[clamp(44px,6vh,52px)] rounded-[14px] border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-1)] text-sm px-4 outline-none transition-colors duration-150 placeholder:text-[var(--text-muted)] focus:border-blue-600 focus:ring-4 focus:ring-blue-600/15"
            />
          </div>

          <div className="flex flex-col gap-3">
            <label htmlFor="password" className="text-sm font-semibold text-[var(--text-3b)]">
              Senha
            </label>
            <input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="h-[clamp(44px,6vh,52px)] rounded-[14px] border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-1)] text-sm px-4 outline-none transition-colors duration-150 placeholder:text-[var(--text-muted)] focus:border-blue-600 focus:ring-4 focus:ring-blue-600/15"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="remember"
              className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
            />
            <label htmlFor="remember" className="text-sm font-medium text-[var(--text-3b)] cursor-pointer">
              Lembrar de mim
            </label>
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button
            type="submit"
            className="w-full mt-[-8px] h-[clamp(44px,6vh,52px)] rounded-[14px] bg-blue-600 text-white text-sm font-semibold transition-all duration-150 hover:bg-blue-700 hover:shadow-[0_4px_12px_rgba(15,23,42,.08)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 focus-visible:outline-offset-2"
          >
            Entrar
          </button>
        </form>
      </div>
    </div>
  )
}
