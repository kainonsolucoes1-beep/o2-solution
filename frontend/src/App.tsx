import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Register from './pages/Register'
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
import GestaoComercial from './pages/GestaoComercial'
import VidaSDR from './pages/VidaSDR'
import RelatorioProducao from './pages/RelatorioProducao'
import Agenda from './pages/Agenda'
import Layout from './components/Layout'
import { ThemeProvider } from './ThemeContext'

export default function App() {
  return (
    <ThemeProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/leads-report" element={<LeadsReport />} />
          <Route path="/leads/:id" element={<LeadDetailPage />} />
          <Route path="/pipeline" element={<Pipeline />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/users" element={<Users />} />
          <Route path="/forms" element={<Forms />} />
          <Route path="/telefonia" element={<Telefonia />} />
          <Route path="/kpis" element={<KPIs />} />
          <Route path="/financeiro" element={<Financeiro />} />
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
