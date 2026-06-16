import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'
import NavBar from '../components/NavBar'

export default function Settings() {
  const navigate = useNavigate()
  const [accessToken, setAccessToken] = useState('')
  const [refreshToken, setRefreshToken] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [syncStatus, setSyncStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [syncMsg, setSyncMsg] = useState('')

  async function handleSave() {
    if (!accessToken.trim() || !refreshToken.trim()) {
      setErrorMsg('Preencha os dois campos.')
      setStatus('error')
      return
    }
    setStatus('loading')
    setErrorMsg('')
    try {
      await api.post('/api/v1/admin/followize-tokens', {
        access_token: accessToken.trim(),
        refresh_token: refreshToken.trim(),
      })
      setStatus('success')
      setAccessToken('')
      setRefreshToken('')
    } catch (err: any) {
      if (err.response?.status === 401) { localStorage.removeItem('token'); navigate('/login'); return }
      if (err.response?.status === 403) setErrorMsg('Acesso restrito a administradores.')
      else setErrorMsg('Erro ao salvar tokens.')
      setStatus('error')
    }
  }

  async function handleSync() {
    setSyncStatus('loading')
    setSyncMsg('')
    try {
      const res = await api.post('/api/v1/admin/sync-historico?days=90')
      const d = res.data as { inserted: number; updated: number; date_from: string }
      setSyncMsg(`Concluído: ${d.inserted} inseridos, ${d.updated} atualizados (desde ${d.date_from})`)
      setSyncStatus('success')
    } catch (err: any) {
      if (err.response?.status === 401) { localStorage.removeItem('token'); navigate('/login'); return }
      setSyncMsg('Erro ao executar reprocessamento.')
      setSyncStatus('error')
    }
  }

  return (
    <div className="min-h-screen" style={{ background: '#F9FAFB' }}>
      <NavBar />
      <main className="max-w-2xl mx-auto px-4 py-10 flex flex-col gap-6">

        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1F2937' }}>Configurações</h1>
          <p style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}>Gerenciamento de integrações</p>
        </div>

        <div className="bg-white rounded-xl p-6 flex flex-col gap-5" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1F2937' }}>Tokens Followize</h2>
            <p style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>
              Cole os tokens gerados pelo script <code>renovar_token.py</code>. O sistema atualiza imediatamente sem precisar reiniciar.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Access Token</label>
            <textarea
              value={accessToken}
              onChange={e => setAccessToken(e.target.value)}
              rows={4}
              placeholder="eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9..."
              style={{ fontSize: 12, padding: '10px 12px', borderRadius: 8, border: '1px solid #D1D5DB', resize: 'vertical', fontFamily: 'monospace', color: '#1F2937', outline: 'none' }}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Refresh Token</label>
            <textarea
              value={refreshToken}
              onChange={e => setRefreshToken(e.target.value)}
              rows={3}
              placeholder="def50200..."
              style={{ fontSize: 12, padding: '10px 12px', borderRadius: 8, border: '1px solid #D1D5DB', resize: 'vertical', fontFamily: 'monospace', color: '#1F2937', outline: 'none' }}
            />
          </div>

          {status === 'success' && (
            <div style={{ padding: '10px 14px', background: '#ECFDF5', borderRadius: 8, border: '1px solid #A7F3D0' }}>
              <p style={{ fontSize: 13, color: '#065F46', fontWeight: 600 }}>Tokens atualizados com sucesso. O próximo sync já usará os novos tokens.</p>
            </div>
          )}

          {status === 'error' && (
            <div style={{ padding: '10px 14px', background: '#FEF2F2', borderRadius: 8, border: '1px solid #FECACA' }}>
              <p style={{ fontSize: 13, color: '#991B1B', fontWeight: 600 }}>{errorMsg}</p>
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={status === 'loading'}
            style={{
              alignSelf: 'flex-start',
              padding: '9px 20px',
              borderRadius: 8,
              background: status === 'loading' ? '#93C5FD' : '#2563EB',
              color: 'white',
              fontWeight: 600,
              fontSize: 13,
              border: 'none',
              cursor: status === 'loading' ? 'not-allowed' : 'pointer',
              transition: 'background 150ms',
            }}
          >
            {status === 'loading' ? 'Salvando...' : 'Salvar Tokens'}
          </button>
        </div>

        <div className="bg-white rounded-xl p-6 flex flex-col gap-5" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1F2937' }}>Reprocessamento Histórico</h2>
            <p style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>
              Rebusca os últimos 90 dias de leads alterados no Followize e atualiza percepção/status no banco. Use após renovar os tokens.
            </p>
          </div>

          {syncStatus === 'success' && (
            <div style={{ padding: '10px 14px', background: '#ECFDF5', borderRadius: 8, border: '1px solid #A7F3D0' }}>
              <p style={{ fontSize: 13, color: '#065F46', fontWeight: 600 }}>{syncMsg}</p>
            </div>
          )}
          {syncStatus === 'error' && (
            <div style={{ padding: '10px 14px', background: '#FEF2F2', borderRadius: 8, border: '1px solid #FECACA' }}>
              <p style={{ fontSize: 13, color: '#991B1B', fontWeight: 600 }}>{syncMsg}</p>
            </div>
          )}

          <button
            onClick={handleSync}
            disabled={syncStatus === 'loading'}
            style={{
              alignSelf: 'flex-start',
              padding: '9px 20px',
              borderRadius: 8,
              background: syncStatus === 'loading' ? '#FCA5A5' : '#EF4444',
              color: 'white',
              fontWeight: 600,
              fontSize: 13,
              border: 'none',
              cursor: syncStatus === 'loading' ? 'not-allowed' : 'pointer',
              transition: 'background 150ms',
            }}
          >
            {syncStatus === 'loading' ? 'Processando... (pode demorar)' : 'Reprocessar 90 dias'}
          </button>
        </div>

      </main>
    </div>
  )
}
