import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'

export default function Layout() {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-page)' }}>
      <Sidebar />
      {/* md:pr-8 -- espaço à direita pro sino de notificações, que flutua fixo
          no canto superior direito (Sidebar): sem isso ele ficava por cima dos
          botões do topo das páginas (ex: Filtros). No celular segue sem margem. */}
      <div className="md:pr-8" style={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
        <Outlet />
      </div>
    </div>
  )
}
