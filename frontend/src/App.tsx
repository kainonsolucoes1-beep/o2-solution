import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
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

export default function App() {
  return (
    <ThemeProvider>
    <StagingBanner />
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
          <Route path="/relatorio-producao" element={<RelatorioProducao />} />
          <Route path="/agenda" element={<Agenda />} />
        </Route>
      </Routes>
    </BrowserRouter>
    </ThemeProvider>
  )
}
