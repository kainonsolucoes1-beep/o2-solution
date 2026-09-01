import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clock } from 'lucide-react'
import api from '../api'

export default function AcessoBloqueado() {
  const navigate = useNavigate()
  const [checking, setChecking] = useState(false)
  const msg = (() => {
    try { return sessionStorage.getItem('acessoBloqueadoMsg') || '' } catch { return '' }
  })()

  async function tentarDeNovo() {
    setChecking(true)
    try {
      await api.get('/api/v1/auth/me')
      navigate('/dashboard')
    } catch {
      setChecking(false)
    }
  }

  function sair() {
    try { localStorage.removeItem('token') } catch { /* ignore */ }
    window.location.href = '/login'
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#EEF1F5', padding: 24 }}>
      <div style={{ maxWidth: 400, textAlign: 'center', background: '#fff', borderRadius: 16, padding: '40px 32px', boxShadow: '0 8px 30px -12px rgba(15,23,42,0.2)' }}>
        <div style={{ width: 52, height: 52, borderRadius: 14, background: '#FFF7ED', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <Clock size={26} color="#F97316" />
        </div>
        <h1 style={{ fontSize: 19, fontWeight: 700, color: '#101C2E', margin: '0 0 8px' }}>Acesso fora do horário</h1>
        <p style={{ fontSize: 14, color: '#46566B', lineHeight: 1.5, margin: '0 0 24px' }}>
          {msg || 'Acesso liberado apenas em dias úteis, das 9h às 16h.'} Sua sessão continua ativa — volte dentro do horário.
        </p>
        <button
          onClick={tentarDeNovo}
          disabled={checking}
          style={{ width: '100%', background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 0', fontSize: 13.5, fontWeight: 600, cursor: checking ? 'default' : 'pointer', opacity: checking ? 0.7 : 1, marginBottom: 10 }}
        >
          {checking ? 'Verificando...' : 'Tentar de novo'}
        </button>
        <button
          onClick={sair}
          style={{ width: '100%', background: 'none', color: '#8593A5', border: 'none', padding: '6px 0', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}
        >
          Sair
        </button>
      </div>
    </div>
  )
}
