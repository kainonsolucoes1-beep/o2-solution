import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, BarChart2, FileText, Users,
  CheckSquare, Settings, LogOut, ChevronsLeft, ChevronsRight, Menu, X, Sun, Moon, UserCog,
} from 'lucide-react'
import api from '../api'
import { useTheme } from '../ThemeContext'

interface UserInfo { username: string; first_name: string | null; role: string }

const NAV = [
  { to: '/dashboard',    label: 'Dashboard',     Icon: LayoutDashboard, adminOnly: false },
  { to: '/pipeline',     label: 'Pipeline',      Icon: BarChart2,       adminOnly: false },
  { to: '/leads-report', label: 'Relatório',     Icon: FileText,        adminOnly: false },
  { to: '/activities',   label: 'Atividades',    Icon: CheckSquare,     adminOnly: false },
  { to: '/users',        label: 'Usuários',      Icon: UserCog,         adminOnly: true  },
  { to: '/settings',     label: 'Configurações', Icon: Settings,        adminOnly: false },
]

export default function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { dark, toggle } = useTheme()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  const [user, setUser] = useState<UserInfo | null>(null)

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => { setMobileOpen(false) }, [location.pathname])

  useEffect(() => {
    api.get<UserInfo>('/api/v1/auth/me').then(r => setUser(r.data)).catch(() => {})
  }, [])

  function logout() { localStorage.removeItem('token'); navigate('/login') }

  const slim = collapsed && !isMobile

  const isAdmin = user?.role === 'admin' || user?.username === 'lucas@o2solution.com.br'

  const navLinks = NAV.filter(({ adminOnly }) => !adminOnly || isAdmin).map(({ to, label, Icon }) => {
    const isActive = location.pathname === to
    return (
      <Link
        key={label}
        to={to}
        title={slim ? label : undefined}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: slim ? '10px 0' : '9px 12px',
          justifyContent: slim ? 'center' : 'flex-start',
          borderRadius: 8, textDecoration: 'none',
          background: isActive ? '#1E3A5F' : 'transparent',
          color: isActive ? '#93C5FD' : '#9CA3AF',
          fontSize: 13, fontWeight: isActive ? 600 : 400,
          transition: 'background 150ms',
        }}
        onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#1F2937' }}
        onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
      >
        <Icon size={17} />
        {!slim && <span>{label}</span>}
      </Link>
    )
  })

  const themeBtn = (
    <button
      onClick={toggle}
      title={slim ? (dark ? 'Modo claro' : 'Modo escuro') : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        justifyContent: slim ? 'center' : 'flex-start',
        width: '100%', background: 'none', border: 'none', cursor: 'pointer',
        color: '#9CA3AF', fontSize: 13, padding: slim ? '6px 0' : '6px 4px',
        borderRadius: 6, marginBottom: 6,
        transition: 'color 150ms',
      }}
      onMouseEnter={e => { e.currentTarget.style.color = '#E2E8F0' }}
      onMouseLeave={e => { e.currentTarget.style.color = '#9CA3AF' }}
    >
      {dark ? <Sun size={15} /> : <Moon size={15} />}
      {!slim && <span>{dark ? 'Modo claro' : 'Modo escuro'}</span>}
    </button>
  )

  const footer = (
    <div style={{ borderTop: '1px solid #1F2937', padding: slim ? '12px 0' : '12px 16px', flexShrink: 0 }}>
      {!slim && user && (
        <div style={{ marginBottom: 10 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#F9FAFB' }}>{user.first_name || user.username}</p>
          <p style={{ fontSize: 11, color: '#6B7280', textTransform: 'capitalize', marginTop: 2 }}>{user.role}</p>
        </div>
      )}
      {themeBtn}
      <button
        onClick={logout}
        title={slim ? 'Sair' : undefined}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          justifyContent: slim ? 'center' : 'flex-start',
          width: '100%', background: 'none', border: 'none', cursor: 'pointer',
          color: '#9CA3AF', fontSize: 13, padding: slim ? '6px 0' : '6px 4px', borderRadius: 6,
        }}
        onMouseEnter={e => { e.currentTarget.style.color = '#FCA5A5' }}
        onMouseLeave={e => { e.currentTarget.style.color = '#9CA3AF' }}
      >
        <LogOut size={15} />
        {!slim && <span>Sair</span>}
      </button>
    </div>
  )

  if (isMobile) {
    return (
      <>
        {!mobileOpen && (
          <button
            onClick={() => setMobileOpen(true)}
            style={{
              position: 'fixed', top: 12, left: 12, zIndex: 50,
              background: '#111827', border: 'none', borderRadius: 8,
              padding: 8, cursor: 'pointer', color: '#F9FAFB',
              boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Menu size={20} />
          </button>
        )}
        {mobileOpen && (
          <div
            onClick={() => setMobileOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 40 }}
          />
        )}
        <aside style={{
          position: 'fixed', left: 0, top: 0, bottom: 0, width: 240, zIndex: 50,
          background: '#111827', display: 'flex', flexDirection: 'column',
          transform: mobileOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 250ms ease',
        }}>
          <div style={{ padding: '18px 16px', borderBottom: '1px solid #1F2937', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#F9FAFB' }}>O2 Solution</span>
            <button
              onClick={() => setMobileOpen(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', display: 'flex' }}
            >
              <X size={16} />
            </button>
          </div>
          <nav style={{ flex: 1, padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
            {navLinks}
          </nav>
          {footer}
        </aside>
      </>
    )
  }

  const w = collapsed ? 64 : 240
  return (
    <aside style={{
      width: w, flexShrink: 0, height: '100vh',
      position: 'sticky', top: 0,
      transition: 'width 200ms ease',
      overflow: 'hidden', background: '#111827',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        padding: collapsed ? '18px 0' : '18px 16px',
        display: 'flex', alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'space-between',
        borderBottom: '1px solid #1F2937', flexShrink: 0, minHeight: 58,
      }}>
        {!collapsed && <span style={{ fontSize: 15, fontWeight: 700, color: '#F9FAFB' }}>O2 Solution</span>}
        <button
          onClick={() => setCollapsed(c => !c)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', padding: 4, borderRadius: 4, display: 'flex', flexShrink: 0 }}
        >
          {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
        </button>
      </div>
      <nav style={{ flex: 1, padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
        {navLinks}
      </nav>
      {footer}
    </aside>
  )
}
