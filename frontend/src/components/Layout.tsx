import { Navigate, Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'

export default function Layout() {
  // parceiro de tráfego: mesmo sistema, mas só Relatório e ficha do lead (o
  // backend bloqueia o resto de qualquer forma)
  const { pathname } = useLocation()
  let perfil: string | null = null
  try { perfil = localStorage.getItem('perfil') } catch { /* ignore */ }
  if (perfil === 'trafego' && pathname !== '/leads-report' && !pathname.startsWith('/leads/')) return <Navigate to="/leads-report" replace />
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-page)' }}>
      <Sidebar />
      <div style={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
        <Outlet />
      </div>
    </div>
  )
}
