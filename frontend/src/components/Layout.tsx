import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'

export default function Layout() {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-page)' }}>
      <Sidebar />
      <div style={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
        <Outlet />
      </div>
    </div>
  )
}
