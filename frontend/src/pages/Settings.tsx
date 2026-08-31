import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  UserPlus, X, Pencil,
  KeyRound, ToggleLeft, ToggleRight, Copy, Check, ChevronDown, ChevronRight,
} from 'lucide-react'
import api from '../api'
import { parseUTC } from '../utils/date'
import { useTheme } from '../ThemeContext'
import Accordion from '../components/Accordion'

// ── Configurações tab ────────────────────────────────────────────────────────
interface SyncHealth {
  last_sync_at: string | null; last_sync_ok: boolean
  last_sync_counts: string; last_sync_error: string; tokens_configured: boolean
}
function formatAgo(iso: string | null): string {
  if (!iso) return '—'
  const diff = Math.floor((Date.now() - parseUTC(iso)) / 1000)
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
  const [receitaSyncStatus, setReceitaSyncStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [receitaSyncMsg, setReceitaSyncMsg] = useState('')
  const [receitaSyncResult, setReceitaSyncResult] = useState<{ matched: number; unmatched: string[]; ambiguous: string[] } | null>(null)
  const [health, setHealth]             = useState<SyncHealth | null>(null)
  const [healthLoading, setHealthLoading] = useState(true)
  const [publicApiKey, setPublicApiKey] = useState<string | null>(null)
  const [publicKeyLoading, setPublicKeyLoading] = useState(true)
  const [publicKeyCopied, setPublicKeyCopied] = useState(false)
  const [rotatingKey, setRotatingKey] = useState(false)
  const [teamKeys, setTeamKeys] = useState<Record<string, { name: string; value: string }>>({})
  const [teamKeysLoading, setTeamKeysLoading] = useState(true)
  const [teamKeyCopiedSlug, setTeamKeyCopiedSlug] = useState<string | null>(null)
  const [rotatingTeamSlug, setRotatingTeamSlug] = useState<string | null>(null)
  const [docsTeamSlug, setDocsTeamSlug] = useState<string | null>(null)
  const [curlCopied, setCurlCopied] = useState(false)

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

  useEffect(() => {
    api.get<{ value: string }>('/api/v1/admin/public-leads-api-key')
      .then(r => setPublicApiKey(r.data.value || null))
      .catch(() => setPublicApiKey(null))
      .finally(() => setPublicKeyLoading(false))
  }, [])

  useEffect(() => {
    api.get<Record<string, { name: string; value: string }>>('/api/v1/admin/public-leads-team-keys')
      .then(r => setTeamKeys(r.data || {}))
      .catch(() => setTeamKeys({}))
      .finally(() => setTeamKeysLoading(false))
  }, [])

  function copyPublicKey() {
    if (!publicApiKey) return
    navigator.clipboard.writeText(publicApiKey).then(() => { setPublicKeyCopied(true); setTimeout(() => setPublicKeyCopied(false), 2000) })
  }

  async function rotatePublicKey() {
    if (!window.confirm('Gerar uma nova chave? A chave atual para de funcionar imediatamente — qualquer webhook usando ela vai passar a receber erro até você colar a nova.')) return
    setRotatingKey(true)
    try {
      const res = await api.post<{ value: string }>('/api/v1/admin/public-leads-api-key/rotate')
      setPublicApiKey(res.data.value)
    } finally {
      setRotatingKey(false)
    }
  }

  function copyTeamKey(slug: string) {
    const value = teamKeys[slug]?.value
    if (!value) return
    navigator.clipboard.writeText(value).then(() => { setTeamKeyCopiedSlug(slug); setTimeout(() => setTeamKeyCopiedSlug(null), 2000) })
  }

  async function rotateTeamKey(slug: string) {
    const name = teamKeys[slug]?.name ?? slug
    if (!window.confirm(`Gerar uma nova chave para ${name}? A chave atual para de funcionar imediatamente — qualquer webhook dessa equipe vai passar a receber erro até você colar a nova.`)) return
    setRotatingTeamSlug(slug)
    try {
      const res = await api.post<{ value: string }>(`/api/v1/admin/public-leads-team-keys/${slug}/rotate`)
      setTeamKeys(prev => ({ ...prev, [slug]: { name, value: res.data.value } }))
    } finally {
      setRotatingTeamSlug(null)
    }
  }

  const activeDocsTeamSlug = docsTeamSlug ?? Object.keys(teamKeys)[0] ?? null

  function buildCurlExample(): string {
    const apiBase = import.meta.env.VITE_API_URL || window.location.origin
    const teamValue = activeDocsTeamSlug ? (teamKeys[activeDocsTeamSlug]?.value ?? '<chave-da-equipe>') : '<chave-da-equipe>'
    return `curl -X POST ${apiBase}/api/v1/public/leads \\
  -H "X-API-Key: ${publicApiKey ?? '<chave-da-conta>'}" \\
  -H "X-Team-Key: ${teamValue}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Lucas Teste",
    "email": "lucas@teste.com",
    "phone": "11999999999",
    "origin": "Site Institucional",
    "conversion_point": "{embed_url}",
    "modalidade": "Empresarial",
    "faixa_29_33": 1,
    "faixa_34_38": 2
  }'`
  }

  function copyCurl() {
    navigator.clipboard.writeText(buildCurlExample()).then(() => { setCurlCopied(true); setTimeout(() => setCurlCopied(false), 2000) })
  }

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

  async function handleReceitaSync() {
    setReceitaSyncStatus('loading'); setReceitaSyncMsg(''); setReceitaSyncResult(null)
    try {
      const res = await api.post('/api/v1/admin/sync-receita-real')
      setReceitaSyncResult(res.data as { matched: number; unmatched: string[]; ambiguous: string[] })
      setReceitaSyncStatus('success')
    } catch (err: any) {
      if (err.response?.status === 401) { localStorage.removeItem('token'); navigate('/login'); return }
      setReceitaSyncMsg(err.response?.data?.detail || 'Erro ao sincronizar planilha do Financeiro.')
      setReceitaSyncStatus('error')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 720 }}>
      <Accordion
        title="Status do sync automático"
        defaultOpen
        statusColor={healthLoading ? 'var(--text-subtle)' : !health ? 'var(--danger)' : !health.last_sync_at ? '#9CA3AF' : health.last_sync_ok ? '#10B981' : '#EF4444'}
        summary={!health ? undefined : health.last_sync_ok ? `OK · ${formatAgo(health.last_sync_at)}` : 'Falha no último sync'}
      >
        <div className="flex flex-col gap-3">
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
        <button onClick={fetchHealth} style={{ alignSelf: 'flex-start', fontSize: 12, color: 'var(--text-muted)', background: 'var(--bg-card)', border: '1px solid var(--border)', cursor: 'pointer', padding: '6px 12px', borderRadius: 8 }}>Atualizar agora</button>
        </div>
      </Accordion>

      <Accordion
        title="Tokens Followize"
        statusColor={health?.tokens_configured ? '#10B981' : '#EF4444'}
        summary={health?.tokens_configured ? 'configurados' : 'não encontrados'}
      >
        <div className="flex flex-col gap-5">
        <p style={{ fontSize: 12, color: 'var(--text-subtle)', margin: 0 }}>Cole os tokens gerados pelo script <code>renovar_token.py</code>. O sistema atualiza imediatamente sem precisar reiniciar.</p>
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
      </Accordion>

      <Accordion
        title="Chaves de integração — leads públicos"
        statusColor="var(--accent)"
        summary={publicKeyLoading ? undefined : `1 chave de conta · ${Object.keys(teamKeys).length} de equipe`}
      >
        <div className="flex flex-col gap-4">
        <p style={{ fontSize: 12, color: 'var(--text-subtle)', margin: 0 }}>Use no webhook do Gravity Forms (ou outro formulário externo) para enviar leads direto pro sistema, sem passar pelo Followize.</p>

        <div>
          <p style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Conta</p>
          {publicKeyLoading ? (
            <p style={{ fontSize: 13, color: 'var(--text-subtle)' }}>Carregando...</p>
          ) : publicApiKey ? (
            <div className="flex flex-col gap-1">
              <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)' }}>Chave da conta</span>
              <div className="flex items-center" style={{ gap: 8 }}>
                <code style={{ fontSize: 12, padding: '8px 10px', borderRadius: 6, background: 'var(--bg-subtle)', color: 'var(--text-2)', wordBreak: 'break-all', flex: 1 }}>{publicApiKey}</code>
                <button onClick={copyPublicKey} style={{ flexShrink: 0, background: 'none', border: '1px solid var(--border-in)', borderRadius: 6, padding: '7px 10px', cursor: 'pointer', color: publicKeyCopied ? '#10B981' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                  {publicKeyCopied ? <><Check size={13} /> Copiado</> : <><Copy size={13} /> Copiar</>}
                </button>
                <button onClick={rotatePublicKey} disabled={rotatingKey} title="Gera uma nova chave e invalida a atual imediatamente" style={{ flexShrink: 0, background: 'none', border: '1px solid var(--border-in)', borderRadius: 6, padding: '7px 10px', cursor: rotatingKey ? 'not-allowed' : 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, opacity: rotatingKey ? 0.6 : 1 }}>
                  <KeyRound size={13} /> {rotatingKey ? 'Gerando...' : 'Rotacionar'}
                </button>
              </div>
            </div>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--text-subtle)' }}>Não foi possível carregar a chave.</p>
          )}
        </div>

        <div style={{ height: 1, background: 'var(--border-in)' }} />

        <div>
          <p style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Equipes</p>
          {teamKeysLoading ? (
            <p style={{ fontSize: 13, color: 'var(--text-subtle)' }}>Carregando...</p>
          ) : Object.keys(teamKeys).length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-subtle)' }}>Não foi possível carregar as chaves de equipe.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {Object.entries(teamKeys).map(([slug, team]) => (
                <div key={slug} className="flex flex-col gap-1">
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)' }}>{team.name}</span>
                  <div className="flex items-center" style={{ gap: 8 }}>
                    <code style={{ fontSize: 12, padding: '8px 10px', borderRadius: 6, background: 'var(--bg-subtle)', color: 'var(--text-2)', wordBreak: 'break-all', flex: 1 }}>{team.value}</code>
                    <button onClick={() => copyTeamKey(slug)} style={{ flexShrink: 0, background: 'none', border: '1px solid var(--border-in)', borderRadius: 6, padding: '7px 10px', cursor: 'pointer', color: teamKeyCopiedSlug === slug ? '#10B981' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                      {teamKeyCopiedSlug === slug ? <><Check size={13} /> Copiado</> : <><Copy size={13} /> Copiar</>}
                    </button>
                    <button onClick={() => rotateTeamKey(slug)} disabled={rotatingTeamSlug === slug} title="Gera uma nova chave e invalida a atual imediatamente" style={{ flexShrink: 0, background: 'none', border: '1px solid var(--border-in)', borderRadius: 6, padding: '7px 10px', cursor: rotatingTeamSlug === slug ? 'not-allowed' : 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, opacity: rotatingTeamSlug === slug ? 0.6 : 1 }}>
                      <KeyRound size={13} /> {rotatingTeamSlug === slug ? 'Gerando...' : 'Rotacionar'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <p style={{ fontSize: 11, color: 'var(--text-subtle)', margin: 0 }}>
          Endpoint: <code>POST /api/v1/public/leads</code> · Headers: <code>X-API-Key</code> (conta) + <code>X-Team-Key</code> (equipe) · Campos: name, email, phone, company, message, origin, conversion_point.
        </p>
        </div>
      </Accordion>

      <Accordion title="Documentação da API — leads públicos" summary="endpoint, campos e exemplo de payload">
        <div className="flex flex-col gap-4">
        <p style={{ fontSize: 12, color: 'var(--text-subtle)', margin: 0 }}>Referência para integrar sites e automações (Gravity Forms, Make.com, etc.) direto com o o2-solution.</p>

        <div className="flex items-center" style={{ gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#fff', background: '#2563EB', padding: '3px 9px', borderRadius: 5, letterSpacing: '0.03em' }}>POST</span>
          <span style={{ fontFamily: 'ui-monospace, SF Mono, Menlo, monospace', fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>/api/v1/public/leads</span>
        </div>

        <div>
          <p style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Headers obrigatórios</p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <tbody>
              <tr>
                <td style={{ padding: '5px 8px 5px 0', borderBottom: '1px solid var(--border-in)' }}><code style={{ fontSize: 12, background: 'var(--bg-subtle)', padding: '1px 6px', borderRadius: 4 }}>X-API-Key</code></td>
                <td style={{ padding: '5px 0', borderBottom: '1px solid var(--border-in)', color: 'var(--text-2)' }}>Chave da conta (seção "Conta" acima)</td>
              </tr>
              <tr>
                <td style={{ padding: '5px 8px 5px 0', borderBottom: '1px solid var(--border-in)' }}><code style={{ fontSize: 12, background: 'var(--bg-subtle)', padding: '1px 6px', borderRadius: 4 }}>X-Team-Key</code></td>
                <td style={{ padding: '5px 0', borderBottom: '1px solid var(--border-in)', color: 'var(--text-2)' }}>Chave da equipe de destino do lead (seção "Equipes" acima)</td>
              </tr>
              <tr>
                <td style={{ padding: '5px 8px 0 0' }}><code style={{ fontSize: 12, background: 'var(--bg-subtle)', padding: '1px 6px', borderRadius: 4 }}>Content-Type</code></td>
                <td style={{ padding: '5px 0 0', color: 'var(--text-2)' }}><code style={{ fontSize: 12, background: 'var(--bg-subtle)', padding: '1px 6px', borderRadius: 4 }}>application/json</code></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div>
          <p style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Campos do corpo (JSON)</p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <tbody>
              {[
                { field: 'name', required: true, desc: 'Nome do lead' },
                { field: 'email', required: false, desc: 'Opcional* — email ou phone precisa vir preenchido' },
                { field: 'phone', required: false, desc: 'Opcional* — email ou phone precisa vir preenchido' },
                { field: 'company', required: false, desc: 'Empresa do lead' },
                { field: 'message', required: false, desc: 'Mensagem livre do formulário' },
                { field: 'origin', required: false, desc: 'Ex: "Site Institucional" (padrão: "Orgânico")' },
                { field: 'conversion_point', required: false, desc: 'Ex: use {embed_url} no Gravity Forms pra capturar a URL da página automaticamente' },
                { field: 'modalidade', required: false, desc: 'Tipo de contratação / modalidade do plano (ex: "Empresarial", "Individual", "PME Porte II")' },
                { field: 'faixa_0_18 … faixa_59_mais', required: false, desc: 'Quantidade de pessoas por faixa etária (número inteiro, padrão 0). 10 campos: faixa_0_18, faixa_19_23, faixa_24_28, faixa_29_33, faixa_34_38, faixa_39_43, faixa_44_48, faixa_49_53, faixa_54_58, faixa_59_mais' },
              ].map((row, i, arr) => (
                <tr key={row.field}>
                  <td style={{ padding: '6px 8px 6px 0', borderBottom: i < arr.length - 1 ? '1px solid var(--border-in)' : 'none', whiteSpace: 'nowrap' }}>
                    <code style={{ fontSize: 12, background: 'var(--bg-subtle)', padding: '1px 6px', borderRadius: 4 }}>{row.field}</code>
                  </td>
                  <td style={{ padding: '6px 8px 6px 0', borderBottom: i < arr.length - 1 ? '1px solid var(--border-in)' : 'none', whiteSpace: 'nowrap' }}>
                    {row.required ? (
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#DC2626', background: '#FEF2F2', padding: '1px 7px', borderRadius: 99 }}>obrigatório</span>
                    ) : (
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-subtle)', background: 'var(--bg-subtle)', padding: '1px 7px', borderRadius: 99 }}>opcional</span>
                    )}
                  </td>
                  <td style={{ padding: '6px 0', borderBottom: i < arr.length - 1 ? '1px solid var(--border-in)' : 'none', color: 'var(--text-2)' }}>{row.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <p style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Respostas</p>
          <div className="flex flex-col" style={{ gap: 6 }}>
            {[
              { code: '201', color: '#059669', desc: <>Lead criado — retorna <code style={{ fontSize: 12, background: 'var(--bg-subtle)', padding: '1px 6px', borderRadius: 4 }}>lead_id</code></> },
              { code: '403', color: '#DC2626', desc: 'Chave da conta ou da equipe inválida' },
              { code: '409', color: '#D97706', desc: 'Lead já cadastrado (mesmo e-mail, ou telefone+nome)' },
              { code: '422', color: '#D97706', desc: 'Faltou nome, ou faltou e-mail e telefone' },
              { code: '429', color: '#D97706', desc: 'Mais de 10 requisições/min do mesmo IP' },
            ].map(row => (
              <div key={row.code} className="flex items-baseline" style={{ gap: 10, fontSize: 12.5 }}>
                <span style={{ fontFamily: 'ui-monospace, SF Mono, Menlo, monospace', fontWeight: 700, width: 32, flexShrink: 0, color: row.color }}>{row.code}</span>
                <span style={{ color: 'var(--text-2)' }}>{row.desc}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ height: 1, background: 'var(--border-in)' }} />

        <div>
          <p style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Exemplo pronto pra copiar</p>
          {Object.keys(teamKeys).length > 0 && (
            <div className="flex" style={{ gap: 6, marginBottom: 10 }}>
              {Object.entries(teamKeys).map(([slug, team]) => (
                <button
                  key={slug}
                  onClick={() => setDocsTeamSlug(slug)}
                  style={{
                    fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 7,
                    border: `1px solid ${activeDocsTeamSlug === slug ? '#2563EB' : 'var(--border-in)'}`,
                    background: activeDocsTeamSlug === slug ? 'var(--accent-bg, #EFF6FF)' : 'var(--bg-subtle)',
                    color: activeDocsTeamSlug === slug ? '#2563EB' : 'var(--text-muted)',
                    cursor: 'pointer',
                  }}
                >
                  {team.name}
                </button>
              ))}
            </div>
          )}
          <div style={{ position: 'relative', background: '#0F172A', borderRadius: 8, padding: '14px 16px', overflowX: 'auto' }}>
            <button
              onClick={copyCurl}
              style={{ position: 'absolute', top: 10, right: 10, display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 600, color: curlCopied ? '#34D399' : '#E2E8F0', background: 'rgba(255,255,255,0.08)', border: `1px solid ${curlCopied ? '#34D399' : 'rgba(255,255,255,0.15)'}`, borderRadius: 6, padding: '5px 9px', cursor: 'pointer' }}
            >
              {curlCopied ? <><Check size={12} /> Copiado</> : <><Copy size={12} /> Copiar</>}
            </button>
            <pre style={{ margin: 0, fontFamily: 'ui-monospace, SF Mono, Menlo, monospace', fontSize: 12, lineHeight: 1.6, color: '#E2E8F0', whiteSpace: 'pre' }}>{buildCurlExample()}</pre>
          </div>
        </div>
        </div>
      </Accordion>

      <Accordion title="Reprocessamento histórico" summary="re-puxar leads antigos do Followize">
        <div className="flex flex-col gap-5">
        <p style={{ fontSize: 12, color: 'var(--text-subtle)', margin: 0 }}>Rebusca os últimos 90 dias de leads alterados no Followize e atualiza motivo de cancelamento e status no banco.</p>
        {syncStatus === 'success' && <div style={{ padding: '10px 14px', background: 'rgba(16,185,129,0.1)', borderRadius: 8, border: '1px solid rgba(16,185,129,0.25)' }}><p style={{ fontSize: 13, color: '#10B981', fontWeight: 600 }}>{syncMsg}</p></div>}
        {syncStatus === 'error' && <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', borderRadius: 8, border: '1px solid rgba(239,68,68,0.25)' }}><p style={{ fontSize: 13, color: '#EF4444', fontWeight: 600 }}>{syncMsg}</p></div>}
        <button onClick={handleSync} disabled={syncStatus === 'loading'} style={{ alignSelf: 'flex-start', padding: '9px 20px', borderRadius: 8, background: syncStatus === 'loading' ? '#FCA5A5' : '#EF4444', color: 'white', fontWeight: 600, fontSize: 13, border: 'none', cursor: syncStatus === 'loading' ? 'not-allowed' : 'pointer' }}>
          {syncStatus === 'loading' ? 'Processando... (pode demorar)' : 'Reprocessar 90 dias'}
        </button>
        </div>
      </Accordion>

      <Accordion title="Sincronização do financeiro (Google Sheets)" summary="recebido / a receber dos leads">
        <div className="flex flex-col gap-5">
        <p style={{ fontSize: 12, color: 'var(--text-subtle)', margin: 0 }}>Rebusca a planilha de vendas e atualiza recebido/a receber dos leads. Mostra quais leads não foram encontrados ou ficaram ambíguos (telefone/email duplicado em mais de um cadastro) — esses não são atualizados até a duplicidade ser corrigida.</p>
        {receitaSyncStatus === 'error' && <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', borderRadius: 8, border: '1px solid rgba(239,68,68,0.25)' }}><p style={{ fontSize: 13, color: '#EF4444', fontWeight: 600 }}>{receitaSyncMsg}</p></div>}
        {receitaSyncStatus === 'success' && receitaSyncResult && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ padding: '10px 14px', background: 'rgba(16,185,129,0.1)', borderRadius: 8, border: '1px solid rgba(16,185,129,0.25)' }}>
              <p style={{ fontSize: 13, color: '#10B981', fontWeight: 600, margin: 0 }}>{receitaSyncResult.matched} leads sincronizados.</p>
            </div>
            {receitaSyncResult.ambiguous.length > 0 && (
              <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', borderRadius: 8, border: '1px solid rgba(239,68,68,0.25)' }}>
                <p style={{ fontSize: 12.5, color: '#EF4444', fontWeight: 700, margin: '0 0 4px' }}>Duplicados — telefone/email bate com mais de um cadastro ({receitaSyncResult.ambiguous.length}):</p>
                <p style={{ fontSize: 12.5, color: '#B91C1C', margin: 0 }}>{receitaSyncResult.ambiguous.join(', ')}</p>
              </div>
            )}
            {receitaSyncResult.unmatched.length > 0 && (
              <div style={{ padding: '10px 14px', background: 'rgba(217,119,6,0.1)', borderRadius: 8, border: '1px solid rgba(217,119,6,0.25)' }}>
                <p style={{ fontSize: 12.5, color: '#D97706', fontWeight: 700, margin: '0 0 4px' }}>Sem lead correspondente no sistema ({receitaSyncResult.unmatched.length}):</p>
                <p style={{ fontSize: 12.5, color: '#B45309', margin: 0 }}>{receitaSyncResult.unmatched.join(', ')}</p>
              </div>
            )}
          </div>
        )}
        <button onClick={handleReceitaSync} disabled={receitaSyncStatus === 'loading'} style={{ alignSelf: 'flex-start', padding: '9px 20px', borderRadius: 8, background: receitaSyncStatus === 'loading' ? '#93C5FD' : '#2563EB', color: 'white', fontWeight: 600, fontSize: 13, border: 'none', cursor: receitaSyncStatus === 'loading' ? 'not-allowed' : 'pointer' }}>
          {receitaSyncStatus === 'loading' ? 'Sincronizando...' : 'Sincronizar planilha agora'}
        </button>
        </div>
      </Accordion>
    </div>
  )
}

// ── Usuários tab ─────────────────────────────────────────────────────────────
interface UserItem {
  id: string; email: string; username: string; first_name: string | null; role: string; team: string | null
  is_active: boolean; must_change_password: boolean; created_at: string
  birth_date: string | null; phone: string | null; cpf: string | null
  hire_date: string | null; termination_date: string | null; idade: number | null
}
interface UserCreatedResponse extends UserItem { temp_password: string }
const EMPTY_FORM = { email: '', username: '', first_name: '', role: 'usuario', team: '', birth_date: '', phone: '', cpf: '', hire_date: '' }
const EMPTY_EDIT = { first_name: '', email: '', username: '', password: '', team: '', birth_date: '', phone: '', cpf: '', hire_date: '', termination_date: '' }
const ROLE_OPTIONS = ['admin', 'diretor', 'financeiro', 'coordenador', 'supervisor', 'comercial', 'usuario']
const TEAM_OPTIONS = ['Equipe São Paulo', 'Equipe Pernambuco']
const ROLE_STYLE: Record<string, { bg: string; color: string }> = {
  admin:       { bg: 'rgba(139,92,246,0.12)', color: '#7C3AED' },
  diretor:     { bg: 'rgba(37,99,235,0.12)',  color: '#2563EB' },
  financeiro:  { bg: 'rgba(5,150,105,0.12)',  color: '#059669' },
  coordenador: { bg: 'rgba(219,39,119,0.12)', color: '#DB2777' },
  supervisor:  { bg: 'rgba(217,119,6,0.12)',  color: '#D97706' },
  comercial:   { bg: 'rgba(8,145,178,0.12)',  color: '#0891B2' },
  usuario:     { bg: 'rgba(107,114,128,0.12)', color: '#6B7280' },
}
function fmtDate(iso: string) { return new Date(parseUTC(iso)).toLocaleDateString('pt-BR') }

const uBtn: import('react').CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 4, fontSize: 12.5, fontWeight: 600,
  padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--bg-card)', color: 'var(--text-3b)', cursor: 'pointer',
}
function UField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--text-subtle)' }}>{label}</span>
      <span style={{ fontSize: 13.5, color: 'var(--text-1)', fontWeight: 500, ...(mono ? { fontFamily: 'ui-monospace, monospace', fontSize: 12 } : {}) }}>{value}</span>
    </div>
  )
}

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
  const [createdCreds, setCreatedCreds] = useState<{ username: string; password: string } | null>(null)
  const [credsCopied, setCredsCopied] = useState(false)

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
    if (!form.email.trim() || !form.username.trim()) { setFormError('Email e username são obrigatórios.'); return }
    setSaving(true); setFormError('')
    try {
      const payload = { ...form, birth_date: form.birth_date || null, hire_date: form.hire_date || null }
      const { data } = await api.post<UserCreatedResponse>('/api/v1/admin/users', payload)
      setUsers(u => [...u, data]); setForm(EMPTY_FORM)
      setCreatedCreds({ username: data.username, password: data.temp_password })
    } catch (err: any) {
      setFormError(err.response?.data?.detail ?? 'Erro ao criar usuário.')
    } finally { setSaving(false) }
  }

  function copyCreds() {
    if (!createdCreds) return
    navigator.clipboard.writeText(`Usuário: ${createdCreds.username}\nSenha temporária: ${createdCreds.password}`)
      .then(() => { setCredsCopied(true); setTimeout(() => setCredsCopied(false), 2000) })
  }

  function closeCredsReveal() {
    setCreatedCreds(null); setCredsCopied(false); setShowModal(false)
    setToast({ msg: 'Usuário criado com sucesso', ok: true })
  }

  async function toggleActive(user: UserItem) {
    try {
      const { data } = await api.patch<UserItem>(`/api/v1/admin/users/${user.id}`, { is_active: !user.is_active })
      setUsers(u => u.map(x => x.id === data.id ? data : x))
      setToast({ msg: data.is_active ? 'Usuário ativado' : 'Usuário desativado', ok: true })
    } catch { setToast({ msg: 'Erro ao atualizar usuário', ok: false }) }
  }

  function openEdit(user: UserItem) {
    setEditUser(user)
    setEditForm({
      first_name: user.first_name ?? '', email: user.email, username: user.username, password: '', team: user.team ?? '',
      birth_date: user.birth_date ?? '', phone: user.phone ?? '', cpf: user.cpf ?? '',
      hire_date: user.hire_date ?? '', termination_date: user.termination_date ?? '',
    })
    setEditError('')
  }

  async function handleEdit() {
    if (!editUser) return
    setEditSaving(true); setEditError('')
    try {
      const payload: Record<string, string | null> = {}
      if (editForm.first_name !== (editUser.first_name ?? '')) payload.first_name = editForm.first_name
      if (editForm.email !== editUser.email) payload.email = editForm.email
      if (editForm.username !== editUser.username) payload.username = editForm.username
      if (editForm.password.trim()) payload.password = editForm.password
      if (editForm.team !== (editUser.team ?? '')) payload.team = editForm.team
      if (editForm.birth_date !== (editUser.birth_date ?? '')) payload.birth_date = editForm.birth_date || null
      if (editForm.phone !== (editUser.phone ?? '')) payload.phone = editForm.phone
      if (editForm.cpf !== (editUser.cpf ?? '')) payload.cpf = editForm.cpf
      if (editForm.hire_date !== (editUser.hire_date ?? '')) payload.hire_date = editForm.hire_date || null
      if (editForm.termination_date !== (editUser.termination_date ?? '')) payload.termination_date = editForm.termination_date || null
      if (Object.keys(payload).length === 0) { setEditUser(null); return }
      const { data } = await api.patch<UserItem>(`/api/v1/admin/users/${editUser.id}`, payload)
      setUsers(u => u.map(x => x.id === data.id ? data : x)); setEditUser(null)
      setToast({ msg: 'Usuário atualizado', ok: true })
    } catch (err: any) {
      setEditError(err.response?.data?.detail ?? 'Erro ao atualizar.')
    } finally { setEditSaving(false) }
  }

  async function changeRole(user: UserItem, role: string) {
    if (role === user.role) return
    try {
      const { data } = await api.patch<UserItem>(`/api/v1/admin/users/${user.id}`, { role })
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
        <button onClick={() => { setShowModal(true); setFormError(''); setCreatedCreds(null) }}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: '#2563EB', color: 'white', border: 'none', cursor: 'pointer' }}>
          <UserPlus size={15} /> Novo usuário
        </button>
      </div>

      {loading ? (
        <p style={{ padding: '24px', fontSize: 13, color: 'var(--text-subtle)' }}>Carregando...</p>
      ) : (
        <div className="flex flex-col" style={{ gap: 8 }}>
          {users.map(user => {
            const rs = ROLE_STYLE[user.role] ?? ROLE_STYLE.usuario
            return (
              <Accordion
                key={user.id}
                title={
                  <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: user.is_active ? 'var(--text-1)' : 'var(--text-subtle)' }}>{user.first_name || user.username}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 600, padding: '2px 9px', borderRadius: 99, background: rs.bg, color: rs.color }}>{user.role}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 600, padding: '2px 9px', borderRadius: 99, background: user.is_active ? 'rgba(16,185,129,0.12)' : 'rgba(107,114,128,0.12)', color: user.is_active ? '#10B981' : '#6B7280' }}>{user.is_active ? 'Ativo' : 'Inativo'}</span>
                    {user.must_change_password && <span style={{ fontSize: 11, color: '#D97706' }}>· troca de senha pendente</span>}
                  </span>
                }
              >
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px 20px' }}>
                  <UField label="E-mail" value={user.email} />
                  <UField label="Username" value={user.username} mono />
                  {user.team && <UField label="Equipe" value={user.team} />}
                  <UField label="Criado em" value={fmtDate(user.created_at)} />
                  {user.phone && <UField label="Telefone" value={user.phone} />}
                  {user.cpf && <UField label="CPF" value={user.cpf} />}
                  {user.birth_date && <UField label="Nascimento" value={`${fmtDate(user.birth_date)}${user.idade ? ` · ${user.idade}` : ''}`} />}
                  {user.hire_date && <UField label="Início" value={fmtDate(user.hire_date)} />}
                  {user.termination_date && <UField label="Desligamento" value={fmtDate(user.termination_date)} />}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border-lt)' }}>
                  <button onClick={() => openEdit(user)} style={{ ...uBtn, color: 'var(--accent)', borderColor: 'var(--accent-weak)', background: 'var(--accent-weak)' }}>
                    <Pencil size={12} /> Editar dados
                  </button>
                  <select value={user.role} onChange={e => changeRole(user, e.target.value)} style={{ ...uBtn }}>
                    {ROLE_OPTIONS.map(r => <option key={r} value={r}>Perfil: {r}</option>)}
                  </select>
                  <button
                    onClick={() => toggleActive(user)}
                    style={{ ...uBtn, borderColor: 'transparent', ...(user.is_active ? { color: '#EF4444', background: 'rgba(239,68,68,0.1)' } : { color: '#10B981', background: 'rgba(16,185,129,0.1)' }) }}
                  >
                    {user.is_active ? 'Desativar' : 'Ativar'}
                  </button>
                </div>
              </Accordion>
            )
          })}
        </div>
      )}

      {editUser && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }} onClick={() => setEditUser(null)}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 16, width: '100%', maxWidth: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border-lt)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-2)' }}>Editar Usuário</span>
              <button onClick={() => setEditUser(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-subtle)', display: 'flex' }}><X size={18} /></button>
            </div>
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 16, maxHeight: '72vh', overflowY: 'auto' }}>
              {[
                { label: 'Nome', field: 'first_name', type: 'text', placeholder: 'Nome do usuário' },
                { label: 'Email', field: 'email', type: 'email', placeholder: 'email@empresa.com' },
                { label: 'Username', field: 'username', type: 'text', placeholder: 'username' },
                { label: 'Nova senha (deixe em branco para manter) — força troca no próximo login', field: 'password', type: 'password', placeholder: '••••••••' },
              ].map(({ label, field, type, placeholder }) => (
                <div key={field} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3b)' }}>{label}</label>
                  <input type={type} placeholder={placeholder} value={editForm[field as keyof typeof editForm]}
                    onChange={e => setEditForm(f => ({ ...f, [field]: e.target.value }))}
                    style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-in)', fontSize: 13, color: 'var(--text-2)', background: 'var(--bg-input)', outline: 'none' }} />
                </div>
              ))}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3b)' }}>Equipe (usado pelo perfil supervisor)</label>
                <select value={editForm.team} onChange={e => setEditForm(f => ({ ...f, team: e.target.value }))}
                  style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-in)', fontSize: 13, color: 'var(--text-2)', background: 'var(--bg-input)', outline: 'none' }}>
                  <option value="">Nenhuma</option>
                  {TEAM_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <div style={{ borderTop: '1px solid var(--border-lt)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Dados pessoais</span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {[
                    { label: 'Telefone', field: 'phone', type: 'text', placeholder: '(00) 00000-0000' },
                    { label: 'CPF', field: 'cpf', type: 'text', placeholder: '000.000.000-00' },
                  ].map(({ label, field, type, placeholder }) => (
                    <div key={field} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3b)' }}>{label}</label>
                      <input type={type} placeholder={placeholder} value={editForm[field as keyof typeof editForm]}
                        onChange={e => setEditForm(f => ({ ...f, [field]: e.target.value }))}
                        style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-in)', fontSize: 13, color: 'var(--text-2)', background: 'var(--bg-input)', outline: 'none' }} />
                    </div>
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {[
                    { label: 'Data de nascimento', field: 'birth_date' },
                    { label: 'Data de início', field: 'hire_date' },
                  ].map(({ label, field }) => (
                    <div key={field} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3b)' }}>{label}</label>
                      <input type="date" value={editForm[field as keyof typeof editForm]}
                        onChange={e => setEditForm(f => ({ ...f, [field]: e.target.value }))}
                        style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-in)', fontSize: 13, color: 'var(--text-2)', background: 'var(--bg-input)', outline: 'none' }} />
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3b)' }}>Data de desligamento</label>
                  <input type="date" value={editForm.termination_date}
                    onChange={e => setEditForm(f => ({ ...f, termination_date: e.target.value }))}
                    style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-in)', fontSize: 13, color: 'var(--text-2)', background: 'var(--bg-input)', outline: 'none' }} />
                  <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>Preencher desativa o acesso do usuário automaticamente.</span>
                </div>
              </div>

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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }} onClick={() => { if (!createdCreds) setShowModal(false) }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 16, width: '100%', maxWidth: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            {createdCreds ? (
              <>
                <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border-lt)' }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-2)' }}>Usuário criado</span>
                </div>
                <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <p style={{ fontSize: 12.5, color: 'var(--text-subtle)', margin: 0 }}>
                    Copie a senha temporária agora — ela não fica visível depois de fechar esta janela. A pessoa vai precisar trocá-la no primeiro login.
                  </p>
                  <div style={{ background: 'var(--bg-subtle)', borderRadius: 8, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div><span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>Usuário: </span><code style={{ fontSize: 13, color: 'var(--text-2)' }}>{createdCreds.username}</code></div>
                    <div><span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>Senha: </span><code style={{ fontSize: 13, color: 'var(--text-2)' }}>{createdCreds.password}</code></div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 4 }}>
                    <button onClick={copyCreds} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '8px 16px', borderRadius: 8, fontSize: 13, background: 'none', color: credsCopied ? '#10B981' : 'var(--text-muted)', border: '1px solid var(--border)', cursor: 'pointer' }}>
                      {credsCopied ? <><Check size={13} /> Copiado</> : <><Copy size={13} /> Copiar</>}
                    </button>
                    <button onClick={closeCredsReveal} style={{ padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: '#2563EB', color: 'white', border: 'none', cursor: 'pointer' }}>
                      Concluir
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border-lt)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-2)' }}>Novo Usuário</span>
                  <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-subtle)', display: 'flex' }}><X size={18} /></button>
                </div>
                <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 16, maxHeight: '72vh', overflowY: 'auto' }}>
                  {[
                    { label: 'Nome', field: 'first_name', type: 'text', placeholder: 'Nome do usuário' },
                    { label: 'Email *', field: 'email', type: 'email', placeholder: 'email@empresa.com' },
                    { label: 'Username *', field: 'username', type: 'text', placeholder: 'username' },
                  ].map(({ label, field, type, placeholder }) => (
                    <div key={field} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3b)' }}>{label}</label>
                      <input type={type} placeholder={placeholder} value={form[field as keyof typeof form]}
                        onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                        style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-in)', fontSize: 13, color: 'var(--text-2)', background: 'var(--bg-input)', outline: 'none' }} />
                    </div>
                  ))}
                  <p style={{ fontSize: 11.5, color: 'var(--text-subtle)', margin: 0 }}>
                    A senha é gerada automaticamente e mostrada depois de criar — a pessoa troca no primeiro login.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3b)' }}>Perfil</label>
                    <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                      style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-in)', fontSize: 13, color: 'var(--text-2)', background: 'var(--bg-input)', outline: 'none' }}>
                      {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  {form.role === 'supervisor' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3b)' }}>Equipe</label>
                      <select value={form.team} onChange={e => setForm(f => ({ ...f, team: e.target.value }))}
                        style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-in)', fontSize: 13, color: 'var(--text-2)', background: 'var(--bg-input)', outline: 'none' }}>
                        <option value="">Nenhuma</option>
                        {TEAM_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  )}

                  <div style={{ borderTop: '1px solid var(--border-lt)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Dados pessoais</span>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      {[
                        { label: 'Telefone', field: 'phone', type: 'text', placeholder: '(00) 00000-0000' },
                        { label: 'CPF', field: 'cpf', type: 'text', placeholder: '000.000.000-00' },
                      ].map(({ label, field, type, placeholder }) => (
                        <div key={field} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3b)' }}>{label}</label>
                          <input type={type} placeholder={placeholder} value={form[field as keyof typeof form]}
                            onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-in)', fontSize: 13, color: 'var(--text-2)', background: 'var(--bg-input)', outline: 'none' }} />
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      {[
                        { label: 'Data de nascimento', field: 'birth_date' },
                        { label: 'Data de início', field: 'hire_date' },
                      ].map(({ label, field }) => (
                        <div key={field} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3b)' }}>{label}</label>
                          <input type="date" value={form[field as keyof typeof form]}
                            onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-in)', fontSize: 13, color: 'var(--text-2)', background: 'var(--bg-input)', outline: 'none' }} />
                        </div>
                      ))}
                    </div>
                  </div>

                  {formError && <p style={{ fontSize: 13, color: '#EF4444', margin: 0 }}>{formError}</p>}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 4 }}>
                    <button onClick={() => setShowModal(false)} style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, background: 'none', color: 'var(--text-muted)', border: '1px solid var(--border)', cursor: 'pointer' }}>Cancelar</button>
                    <button onClick={handleCreate} disabled={saving} style={{ padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: saving ? '#93C5FD' : '#2563EB', color: 'white', border: 'none', cursor: saving ? 'not-allowed' : 'pointer' }}>
                      {saving ? 'Criando...' : 'Criar usuário'}
                    </button>
                  </div>
                </div>
              </>
            )}
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
  const { dark } = useTheme()
  const { section } = useParams<{ section: string }>()
  const isUsuarios = section === 'usuarios'

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1200, margin: '0 auto', background: dark ? 'transparent' : '#EEF1F5', minHeight: '100%' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-2)', margin: 0 }}>
          {isUsuarios ? 'Usuários' : 'API'}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
          {isUsuarios ? 'Gestão de usuários e acesso ao formulário' : 'Integrações, chaves e sincronização'}
        </p>
      </div>

      {isUsuarios ? (
        <div className="flex flex-col" style={{ gap: 10 }}>
          <UsuariosTab />
          <Accordion title="Acesso ao formulário" summary="logins usados pelo formulário externo (Gravity Forms)">
            <FormularioTab />
          </Accordion>
        </div>
      ) : (
        <ConfiguracoesTab />
      )}
    </div>
  )
}
