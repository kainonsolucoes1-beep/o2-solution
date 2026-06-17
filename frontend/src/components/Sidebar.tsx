import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, BarChart2, FileText, Users,
  CheckSquare, Settings, LogOut, ChevronsLeft, ChevronsRight, Menu, X,
} from 'lucide-react'
import api from '../api'

interface UserInfo { username: string; first_name: string | null; role: string }

const NAV = [
  { to: '/dashboard',    label: 'Dashboard',    Icon: LayoutDashboard },
  { to: '/pipeline',     label: 'Pipeline',     Icon: BarChart2 },
  { to: '/leads-report', label: 'Relatório',    Icon: FileText },
  { to: '/leads-report', label: 'Leads',        Icon: Users },
  { to: '/activities',   label: 'Atividades',   Icon: CheckSquare },
  { to: '/settings',     label: 'Configurações', Icon: Settings },
]

function SidebarContent({
  collapsed, user, onCollapse, onLogout,
}: {
  collapsed: boolean
  user: UserInfo | null
  onCollapse: () => void
  onLogout: () => void
}) {
  const location = useLocation()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#111827', overflow: 'hidden' }}>
      <div style={{
        padding: collapsed ? '18px 0' : '18px 16px',
        display: 'flex', alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'space-between',
        borderBottom: '1px solid #1F2937', flexShrink: 0,
      }}>
        {!collapsed && (
          <span style={{ fontSize: 15, fontWeight: 700, color: '#F9FAFB', letterSpacing: '-0.01em' }}>
            O2 Solution
          </span>
        )}
        <button
          onClick={onCollapse}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', padding: 4, borderRadius: 4, display: 'flex' }}
        >
          {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
        </button>
      </div>

      <nav style={{ flex: 1, padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
        {NAV.map(({ to, label, Icon }) => {
          const isActive = location.pathname === to
          return (
            <Link
              key={label}
              to={to}
              title={collapsed ? label : undefined}
              style={{
                display: 'flex', alignItems: 'center',
                gap: 10,
                padding: collapsed ? '10px 0' : '9px 12px',
                justifyContent: collapsed ? 'center' : 'flex-start',
                borderRadius: 8,
                textDecoration: 'none',
                background: isActive ? '#1E3A5F' : 'transparent',
                color: isActive ? '#93C5FD' : '#9CA3AF',
                fontSize: 13,
                fontWeight: isActive ? 600 : 400,
                transition: 'background 150ms, color 150ms',
              }}
              onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = '#1F2937'; e.currentTarget.style.color = '#D1D5DB' } }}
              onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#9CA3AF' } }}
            >
              <Icon size={17} />
              {!collapsed && <span>{label}</span>}
            </Link>
          )
        })}
      </nav>

      <div style={{ borderTop: '1px solid #1F2937', padding: collapsed ? '12px 0' : '12px 16px', flexShrink: 0 }}>
        {!collapsed && user && (
          <div style={{ marginBottom: 10 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#F9FAFB', lineHeight: 1.3 }}>
              {user.first_name || user.username}
            </p>
            <p style={{ fontSize: 11, color: '#6B7280', textTransform: 'capitalize', marginTop: 2 }}>
              {user.role}
            </p>
          </div>
        )}
        <button
          onClick={onLogout}
          title={collapsed ? 'Sair' : undefined}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            justifyContent: collapsed ? 'center' : 'flex-start',
            width: '100%', background: 'none', border: 'none', cursor: 'pointer',
            color: '#9CA3AF', fontSize: 13, padding: collapsed ? '6px 0' : '6px 4px',
            borderRadius: 6,
          }}
          onMouseEnter={e => { e.currentTarget.style.color = '#FCA5A5' }}
          onMouseLeave={e => { e.currentTarget.style.color = '#9CA3AF' }}
        >
          <LogOut size={15} />
          {!collapsed && <span>Sair</span>}
        </button>
      </div>
    </div>
  )
}

export default function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [user, setUser] = useState<UserInfo | null>(null)

  useEffect(() => { setMobileOpen(false) }, [location.pathname])

  useEffect(() => {
    api.get<UserInfo>('/api/v1/auth/me').then(r => setUser(r.data)).catch(() => {})
  }, [])

  function logout() {
    localStorage.removeItem('token')
    navigate('/login')
  }

  const w = collapsed ? 64 : 240
  const props = { collapsed, user, onCollapse: () => setCollapsed(c => !c), onLogout: logout }

  return (
    <>
      {/* Mobile hamburger */}
      <button
        className="md:hidden"
        onClick={() => setMobileOpen(true)}
        style={{
          position: 'fixed', top: 12, left: 12, zIndex: 50,
          background: '#111827', border: 'none', borderRadius: 8,
          padding: 8, cursor: 'pointer', color: '#F9FAFB',
          boxShadow: '0 2px 8px rgba(0,0,0,0.4)', display: 'flex',
        }}
      >
        <Menu size={20} />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="md:hidden"
          onClick={() => setMobileOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 40 }}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className="md:hidden"
        style={{
          position: 'fixed', left: 0, top: 0, bottom: 0, width: 240, zIndex: 50,
          transform: mobileOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 250ms ease',
        }}
      >
        <button
          onClick={() => setMobileOpen(false)}
          style={{ position: 'absolute', top: 10, right: 10, background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', zIndex: 1, display: 'flex' }}
        >
          <X size={16} />
        </button>
        <SidebarContent {...props} collapsed={false} />
      </aside>

      {/* Desktop sidebar */}
      <aside
        className="hidden md:block"
        style={{
          width: w, flexShrink: 0, height: '100vh',
          position: 'sticky', top: 0,
          transition: 'width 200ms ease',
          overflow: 'hidden',
        }}
      >
        <SidebarContent {...props} />
      </aside>
    </>
  )
}
