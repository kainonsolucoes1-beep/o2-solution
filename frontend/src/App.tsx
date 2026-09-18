import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import api from './api'
import Login from './pages/Login'
import ChangePassword from './pages/ChangePassword'
import AcessoBloqueado from './pages/AcessoBloqueado'
import Dashboard from './pages/Dashboard'
import LeadsReport from './pages/LeadsReport'
import LeadDetailPage from './pages/LeadDetailPage'
import Pipeline from './pages/Pipeline'
import Settings from './pages/Settings'
import Users from './pages/Users'
import Forms from './pages/Forms'
import Telefonia from './pages/Telefonia'
import KPIs from './pages/KPIs'
import Financeiro from './pages/Financeiro'
import FinanceiroMetas from './pages/FinanceiroMetas'
import GestaoComercial from './pages/GestaoComercial'
import VidaSDR from './pages/VidaSDR'
import RelatorioProducao from './pages/RelatorioProducao'
import Agenda from './pages/Agenda'
import CampanhasFila from './pages/CampanhasFila'
import CampanhasTemplates from './pages/CampanhasTemplates'
import CampanhasDashboard from './pages/CampanhasDashboard'
import Layout from './components/Layout'
import { ThemeProvider } from './ThemeContext'

// tarja fixa quando rodando em staging.o2sig.com.br — não afeta produção
function StagingBanner() {
  if (!window.location.hostname.startsWith('staging.')) return null
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, zIndex: 99999, pointerEvents: 'none',
      background: '#B45309', color: '#fff', fontSize: 11, fontWeight: 700,
      letterSpacing: '0.08em', padding: '3px 10px', borderBottomRightRadius: 8,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    }}>
      STAGING · DADOS DE TESTE
    </div>
  )
}

const PREVIEW_ROLES = ['admin', 'diretor', 'financeiro', 'coordenador', 'supervisor', 'comercial', 'usuario']

// "Visualizar como": seletor de papel só no staging, pra testar a visão e
// as permissões de qualquer perfil sem precisar de um login por papel.
function RoleSwitcher() {
  const [me, setMe] = useState<{ role: string; real_role: string | null; is_staging: boolean } | null>(null)
  const [switching, setSwitching] = useState(false)

  useEffect(() => {
    if (!window.location.hostname.startsWith('staging.') || !localStorage.getItem('token')) return
    api.get('/api/v1/auth/me').then(r => setMe(r.data)).catch(() => {})
  }, [])

  if (!me?.is_staging) return null

  function handleChange(role: string) {
    setSwitching(true)
    api.post('/api/v1/auth/preview-role', { role: role || null })
      .then(r => { localStorage.setItem('token', r.data.access_token); window.location.reload() })
      .catch(() => setSwitching(false))
  }

  const realRole = me!.real_role ?? me!.role

  return (
    <div style={{ position: 'fixed', top: 8, right: 12, zIndex: 99999, display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{
        fontSize: 10.5, fontWeight: 700, color: '#fff', background: '#7C3AED',
        padding: '4px 8px', borderRadius: '8px 0 0 8px', letterSpacing: '0.04em',
      }}>
        VER COMO
      </span>
      <select
        value={me!.real_role ? me!.role : ''}
        disabled={switching}
        onChange={e => handleChange(e.target.value)}
        style={{
          fontSize: 11.5, fontWeight: 600, color: '#111827', background: '#fff',
          border: '1px solid #DDD6FE', borderRadius: '0 8px 8px 0', padding: '4px 8px',
          cursor: switching ? 'wait' : 'pointer',
        }}
      >
        <option value="">Meu papel ({realRole})</option>
        {PREVIEW_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
      </select>
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
    <StagingBanner />
    <RoleSwitcher />
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/change-password" element={<ChangePassword />} />
        <Route path="/acesso-bloqueado" element={<AcessoBloqueado />} />
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/leads-report" element={<LeadsReport />} />
          <Route path="/leads/:id" element={<LeadDetailPage />} />
          <Route path="/pipeline" element={<Pipeline />} />
          <Route path="/settings" element={<Navigate to="/settings/api" replace />} />
          <Route path="/settings/:section" element={<Settings />} />
          <Route path="/users" element={<Users />} />
          <Route path="/forms" element={<Forms />} />
          <Route path="/telefonia" element={<Telefonia />} />
          <Route path="/kpis" element={<KPIs />} />
          <Route path="/financeiro" element={<Navigate to="/financeiro/visao-geral" replace />} />
          <Route path="/financeiro/visao-geral" element={<Financeiro />} />
          <Route path="/financeiro/metas" element={<FinanceiroMetas />} />
          <Route path="/gestao-comercial" element={<GestaoComercial />} />
          <Route path="/vida-sdr/:origens" element={<VidaSDR />} />
          <Route path="/campanhas" element={<CampanhasFila />} />
          <Route path="/campanhas/modelos" element={<CampanhasTemplates />} />
          <Route path="/campanhas/dashboard" element={<CampanhasDashboard />} />
          <Route path="/relatorio-producao" element={<RelatorioProducao />} />
          <Route path="/agenda" element={<Agenda />} />
        </Route>
      </Routes>
    </BrowserRouter>
    </ThemeProvider>
  )
}
