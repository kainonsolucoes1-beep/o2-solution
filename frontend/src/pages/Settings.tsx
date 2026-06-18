import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'

interface SyncHealth {
  last_sync_at: string | null
  last_sync_ok: boolean
  last_sync_counts: string
  last_sync_error: string
  tokens_configured: boolean
}

function formatAgo(iso: string | null): string {
  if (!iso) return '—'
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return `${diff}s atrás`
  if (diff < 3600) return `${Math.floor(diff / 60)}min atrás`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`
  return `${Math.floor(diff / 86400)}d atrás`
}

export default function Settings() {
  const navigate = useNavigate()
  const [accessToken, setAccessToken] = useState('')
  const [refreshToken, setRefreshToken] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [syncStatus, setSyncStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [syncMsg, setSyncMsg] = useState('')
  const [health, setHealth] = useState<SyncHealth | null>(null)
  const [healthLoading, setHealthLoading] = useState(true)

  const fetchHealth = useCallback(async () => {
    try {
      const res = await api.get('/api/v1/admin/sync-status')
      setHealth(res.data as SyncHealth)
    } catch {
      // silently ignore — not critical
    } finally {
      setHealthLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchHealth()
    const interval = setInterval(fetchHealth, 30_000)
    return () => clearInterval(interval)
  }, [fetchHealth])

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
      const res = await api.post('/api/v1/admin/sync-historico?days=365')
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
    <main className="max-w-3xl mx-auto px-4 md:px-8 py-10 flex flex-col gap-6">

        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-2)' }}>Configurações</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>Gerenciamento de integrações</p>
        </div>

        {/* Sync Health Card */}
        <div className="bg-white rounded-xl p-6 flex flex-col gap-3" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-2)' }}>Status do Sync Automático</h2>
            <button
              onClick={fetchHealth}
              style={{ fontSize: 12, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 6, backgroundColor: 'var(--bg-subtle)' }}
            >
              Atualizar
            </button>
          </div>

          {healthLoading ? (
            <p style={{ fontSize: 13, color: 'var(--text-subtle)' }}>Carregando...</p>
          ) : health ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
                  background: !health.last_sync_at ? '#9CA3AF' : health.last_sync_ok ? '#10B981' : '#EF4444',
                  flexShrink: 0,
                }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>
                  {!health.last_sync_at
                    ? 'Nenhum sync registrado ainda'
                    : health.last_sync_ok
                      ? `Último sync OK — ${formatAgo(health.last_sync_at)}`
                      : `Falha no último sync — ${formatAgo(health.last_sync_at)}`}
                </span>
              </div>

              {health.last_sync_ok && health.last_sync_counts && (
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{health.last_sync_counts}</p>
              )}

              {!health.last_sync_ok && health.last_sync_error && (
                <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.1)', borderRadius: 8, border: '1px solid rgba(239,68,68,0.25)' }}>
                  <p style={{ fontSize: 12, color: '#EF4444', margin: 0, wordBreak: 'break-word' }}>{health.last_sync_error}</p>
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                  background: health.tokens_configured ? '#10B981' : '#EF4444',
                  flexShrink: 0,
                }} />
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {health.tokens_configured ? 'Tokens Followize configurados no banco' : 'Tokens não encontrados no banco'}
                </span>
              </div>

              <p style={{ fontSize: 11, color: 'var(--text-subtle)', margin: 0 }}>
                Sync automático a cada 5 minutos. Token renovado automaticamente em caso de expiração.
              </p>
            </div>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--text-subtle)' }}>Não foi possível carregar o status.</p>
          )}
        </div>

        <div className="bg-white rounded-xl p-6 flex flex-col gap-5" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-2)' }}>Tokens Followize</h2>
            <p style={{ fontSize: 12, color: 'var(--text-subtle)', marginTop: 2 }}>
              Cole os tokens gerados pelo script <code>renovar_token.py</code>. O sistema atualiza imediatamente sem precisar reiniciar.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)' }}>Access Token</label>
            <textarea
              value={accessToken}
              onChange={e => setAccessToken(e.target.value)}
              rows={4}
              placeholder="eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9..."
              style={{ fontSize: 12, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-in)', resize: 'vertical', fontFamily: 'monospace', color: 'var(--text-2)', outline: 'none', background: 'var(--bg-input)' }}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)' }}>Refresh Token</label>
            <textarea
              value={refreshToken}
              onChange={e => setRefreshToken(e.target.value)}
              rows={3}
              placeholder="def50200..."
              style={{ fontSize: 12, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-in)', resize: 'vertical', fontFamily: 'monospace', color: 'var(--text-2)', outline: 'none', background: 'var(--bg-input)' }}
            />
          </div>

          {status === 'success' && (
            <div style={{ padding: '10px 14px', background: 'rgba(16,185,129,0.1)', borderRadius: 8, border: '1px solid rgba(16,185,129,0.25)' }}>
              <p style={{ fontSize: 13, color: '#10B981', fontWeight: 600 }}>Tokens atualizados com sucesso. O próximo sync já usará os novos tokens.</p>
            </div>
          )}

          {status === 'error' && (
            <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', borderRadius: 8, border: '1px solid rgba(239,68,68,0.25)' }}>
              <p style={{ fontSize: 13, color: '#EF4444', fontWeight: 600 }}>{errorMsg}</p>
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={status === 'loading'}
            style={{
              alignSelf: 'flex-start', padding: '9px 20px', borderRadius: 8,
              background: status === 'loading' ? '#93C5FD' : '#2563EB',
              color: 'white', fontWeight: 600, fontSize: 13, border: 'none',
              cursor: status === 'loading' ? 'not-allowed' : 'pointer', transition: 'background 150ms',
            }}
          >
            {status === 'loading' ? 'Salvando...' : 'Salvar Tokens'}
          </button>
        </div>

        <div className="bg-white rounded-xl p-6 flex flex-col gap-5" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-2)' }}>Reprocessamento Histórico</h2>
            <p style={{ fontSize: 12, color: 'var(--text-subtle)', marginTop: 2 }}>
              Rebusca os últimos 365 dias de leads alterados no Followize e atualiza percepção/status no banco. Use após renovar os tokens.
            </p>
          </div>

          {syncStatus === 'success' && (
            <div style={{ padding: '10px 14px', background: 'rgba(16,185,129,0.1)', borderRadius: 8, border: '1px solid rgba(16,185,129,0.25)' }}>
              <p style={{ fontSize: 13, color: '#10B981', fontWeight: 600 }}>{syncMsg}</p>
            </div>
          )}
          {syncStatus === 'error' && (
            <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', borderRadius: 8, border: '1px solid rgba(239,68,68,0.25)' }}>
              <p style={{ fontSize: 13, color: '#EF4444', fontWeight: 600 }}>{syncMsg}</p>
            </div>
          )}

          <button
            onClick={handleSync}
            disabled={syncStatus === 'loading'}
            style={{
              alignSelf: 'flex-start', padding: '9px 20px', borderRadius: 8,
              background: syncStatus === 'loading' ? '#FCA5A5' : '#EF4444',
              color: 'white', fontWeight: 600, fontSize: 13, border: 'none',
              cursor: syncStatus === 'loading' ? 'not-allowed' : 'pointer', transition: 'background 150ms',
            }}
          >
            {syncStatus === 'loading' ? 'Processando... (pode demorar)' : 'Reprocessar 365 dias'}
          </button>
        </div>

      </main>
  )
}
