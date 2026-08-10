import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, FileText, Users,
  Settings, LogOut, ChevronsLeft, ChevronsRight, Menu, X, Sun, Moon, Phone, TrendingUp, DollarSign, Briefcase, CalendarDays,
} from 'lucide-react'
import api from '../api'
import { useTheme } from '../ThemeContext'

interface UserInfo { username: string; first_name: string | null; role: string }
interface AgendaAlerts { overdue: number; today: number }

const NAV = [
  { to: '/dashboard',        label: 'Dashboard',        Icon: LayoutDashboard, adminOnly: false },
  { to: '/leads-report',     label: 'Relatório',        Icon: FileText,        adminOnly: false },
  { to: '/gestao-comercial', label: 'Gestão Comercial', Icon: Briefcase,       adminOnly: false },
  { to: '/agenda',           label: 'Agenda',           Icon: CalendarDays,    adminOnly: true  },
  { to: '/kpis',             label: 'Performance',      Icon: TrendingUp,      adminOnly: false },
  { to: '/financeiro',       label: 'Financeiro',       Icon: DollarSign,      adminOnly: true  },
  { to: '/telefonia',        label: 'Telefonia',        Icon: Phone,           adminOnly: true  },
  { to: '/settings',         label: 'Configurações',    Icon: Settings,        adminOnly: false },
]

export default function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { dark, toggle } = useTheme()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  const [user, setUser] = useState<UserInfo | null>(null)
  const [agendaAlerts, setAgendaAlerts] = useState<AgendaAlerts | null>(null)

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => { setMobileOpen(false) }, [location.pathname])

  useEffect(() => {
    api.get<UserInfo>('/api/v1/auth/me').then(r => setUser(r.data)).catch(() => {})
  }, [])

  useEffect(() => {
    if (!user) return
    const admin = user.role === 'admin' || user.username === 'lucas@o2solution.com.br'
    if (!admin) return
    let cancelled = false
    function load() {
      api.get<AgendaAlerts>('/api/v1/agenda/alerts/count').then(r => { if (!cancelled) setAgendaAlerts(r.data) }).catch(() => {})
    }
    load()
    const id = setInterval(load, 3 * 60 * 1000)
    return () => { cancelled = true; clearInterval(id) }
  }, [user])

  function logout() { localStorage.removeItem('token'); navigate('/login') }

  const slim = collapsed && !isMobile

  const isAdmin = user?.role === 'admin' || user?.username === 'lucas@o2solution.com.br'

  const navLinks = NAV.filter(({ adminOnly }) => !adminOnly || isAdmin).map(({ to, label, Icon }) => {
    const isActive = location.pathname === to
    const alertCount = to === '/agenda' && agendaAlerts ? agendaAlerts.overdue + agendaAlerts.today : 0
    const alertColor = agendaAlerts && agendaAlerts.overdue > 0 ? '#EF4444' : '#F59E0B'
    return (
      <Link
        key={label}
        to={to}
        title={slim ? label : undefined}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: slim ? '10px 0' : '9px 12px',
          justifyContent: slim ? 'center' : 'flex-start',
          borderRadius: 8, textDecoration: 'none', position: 'relative',
          background: isActive ? 'rgba(0,109,183,0.16)' : 'transparent',
          color: isActive ? '#4FB0E8' : '#9CA3AF',
          borderLeft: isActive ? '3px solid #006db7' : '3px solid transparent',
          fontSize: 13, fontWeight: isActive ? 600 : 400,
          transition: 'background 150ms',
        }}
        onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(0,109,183,0.06)' }}
        onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
      >
        <span style={{ position: 'relative', display: 'flex' }}>
          <Icon size={17} />
          {alertCount > 0 && slim && (
            <span style={{
              position: 'absolute', top: -4, right: -6, background: alertColor,
              color: '#fff', borderRadius: 999, fontSize: 9, fontWeight: 700,
              minWidth: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '0 3px', lineHeight: 1,
            }}>
              {alertCount}
            </span>
          )}
        </span>
        {!slim && <span style={{ flex: 1 }}>{label}</span>}
        {!slim && alertCount > 0 && (
          <span style={{
            background: alertColor, color: '#fff', borderRadius: 999, fontSize: 10, fontWeight: 700,
            minWidth: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px',
          }}>
            {alertCount}
          </span>
        )}
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
            <span style={{ fontSize: 15, fontWeight: 700, color: '#F9FAFB', display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f92280', flexShrink: 0 }} />
              O2 Solution
            </span>
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
        {!collapsed && (
          <span style={{ fontSize: 15, fontWeight: 700, color: '#F9FAFB', display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f92280', flexShrink: 0 }} />
            O2 Solution
          </span>
        )}
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
