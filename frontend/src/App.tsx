import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import LeadsReport from './pages/LeadsReport'
import Pipeline from './pages/Pipeline'
import Settings from './pages/Settings'
import Activities from './pages/Activities'
import Users from './pages/Users'
import Forms from './pages/Forms'
import Telefonia from './pages/Telefonia'
import KPIs from './pages/KPIs'
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
          <Route path="/pipeline" element={<Pipeline />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/activities" element={<Activities />} />
          <Route path="/users" element={<Users />} />
          <Route path="/forms" element={<Forms />} />
          <Route path="/telefonia" element={<Telefonia />} />
          <Route path="/kpis" element={<KPIs />} />
        </Route>
      </Routes>
    </BrowserRouter>
    </ThemeProvider>
  )
}
