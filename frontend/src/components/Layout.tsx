import { Navigate, Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'

export default function Layout() {
  // parceiro de tráfego não usa o sistema interno, só a área dele (o backend
  // bloqueia o resto de qualquer forma)
  let perfil: string | null = null
  try { perfil = localStorage.getItem('perfil') } catch { /* ignore */ }
  if (perfil === 'trafego') return <Navigate to="/parceiro" replace />
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-page)' }}>
      <Sidebar />
      <div style={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
        <Outlet />
      </div>
    </div>
  )
}
