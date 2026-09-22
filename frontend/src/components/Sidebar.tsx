import { useState, useEffect, useCallback, useRef, type MouseEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, FileText, Users,
  Settings, LogOut, ChevronsLeft, ChevronsRight, ChevronDown, Menu, X, Sun, Moon, Phone, TrendingUp, DollarSign, Briefcase, CalendarDays, UserRound, Megaphone, Bell, Clock, AlertTriangle,
  type LucideIcon,
} from 'lucide-react'
import api from '../api'
import { useTheme } from '../ThemeContext'

interface UserInfo { username: string; first_name: string | null; role: string; is_campanha_operador?: boolean }
interface AgendaAlerts { overdue: number; today: number }
interface AgendaAlertItem {
  id: string; name: string; phone: string | null; attendant: string | null
  scheduled_at: string; schedule_id: string; bucket: 'overdue' | 'due_soon'
}
const fmtHM = (iso: string) => new Date(iso.endsWith('Z') ? iso : iso + 'Z').toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

const NAV = [
  { to: '/dashboard',        label: 'Dashboard',        Icon: LayoutDashboard, adminOnly: false },
  { to: '/leads-report',     label: 'Relatório',        Icon: FileText,        adminOnly: false },
  { to: '/gestao-comercial', label: 'Gestão Comercial', Icon: Briefcase,       adminOnly: false },
  { to: '/agenda',           label: 'Agenda',           Icon: CalendarDays,    adminOnly: false },
  { to: '/kpis',             label: 'Performance',      Icon: TrendingUp,      adminOnly: false },
  { to: '/telefonia',        label: 'Telefonia',        Icon: Phone,           adminOnly: true  },
]

const SETTINGS_CHILDREN = [
  { to: '/settings/usuarios', label: 'Usuários' },
  { to: '/settings/api',      label: 'API' },
]

const FINANCEIRO_CHILDREN = [
  { to: '/financeiro/visao-geral', label: 'Visão Geral' },
  { to: '/financeiro/metas',       label: 'Metas Mensais' },
]

function ExpandableNavGroup({ label, Icon, basePath, headerTo, children, slim, pathname, open, onToggle }: {
  label: string; Icon: LucideIcon; basePath: string; headerTo?: string; children: { to: string; label: string }[]; slim: boolean; pathname: string
  open: boolean; onToggle: () => void
}) {
  const groupActive = pathname.startsWith(basePath)

  if (slim) {
    return (
      <Link
        to={headerTo ?? children[0]?.to ?? basePath}
        title={label}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '10px 0', borderRadius: 8, textDecoration: 'none',
          background: groupActive ? 'rgba(0,109,183,0.16)' : 'transparent',
          color: groupActive ? '#4FB0E8' : '#9CA3AF',
          borderLeft: groupActive ? '3px solid #006db7' : '3px solid transparent',
          transition: 'background 150ms',
        }}
        onMouseEnter={e => { if (!groupActive) e.currentTarget.style.background = 'rgba(0,109,183,0.06)' }}
        onMouseLeave={e => { if (!groupActive) e.currentTarget.style.background = 'transparent' }}
      >
        <Icon size={17} />
      </Link>
    )
  }

  // Header vira link (headerTo): destaca o fundo só quando a rota é exatamente
  // a do header (ex: Fila), não sempre que qualquer filho estiver ativo --
  // os filhos já têm seu próprio destaque. Sem headerTo (Configurações/
  // Financeiro): mesma regra de sempre, destaca colapsado com algo ativo dentro.
  const headerExactActive = headerTo ? pathname === headerTo : (groupActive && !open)
  const headerStyle = {
    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
    padding: '9px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
    background: headerExactActive ? 'rgba(0,109,183,0.16)' : 'transparent',
    color: groupActive ? '#4FB0E8' : '#9CA3AF',
    borderLeft: headerExactActive ? '3px solid #006db7' : '3px solid transparent',
    fontSize: 13, fontWeight: groupActive ? 600 : 400,
    transition: 'background 150ms',
  } as const
  const headerHover = {
    onMouseEnter: (e: MouseEvent<HTMLElement>) => { if (!headerExactActive) e.currentTarget.style.background = 'rgba(0,109,183,0.06)' },
    onMouseLeave: (e: MouseEvent<HTMLElement>) => { if (!headerExactActive) e.currentTarget.style.background = 'transparent' },
  }

  return (
    <div>
      {headerTo ? (
        <Link to={headerTo} style={{ ...headerStyle, textDecoration: 'none' }} {...headerHover}>
          <Icon size={17} />
          <span style={{ flex: 1, textAlign: 'left' }}>{label}</span>
          <ChevronDown size={14} style={{ color: '#6B7280', transition: 'transform 180ms ease', transform: open ? 'rotate(180deg)' : 'none' }} />
        </Link>
      ) : (
        <button onClick={onToggle} aria-expanded={open} style={headerStyle} {...headerHover}>
          <Icon size={17} />
          <span style={{ flex: 1, textAlign: 'left' }}>{label}</span>
          <ChevronDown size={14} style={{ color: '#6B7280', transition: 'transform 180ms ease', transform: open ? 'rotate(180deg)' : 'none' }} />
        </button>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden', maxHeight: open ? 120 : 0, transition: 'max-height 220ms ease' }}>
        {children.map(child => {
          const isActive = pathname === child.to
          return (
            <Link
              key={child.to}
              to={child.to}
              style={{
                display: 'flex', alignItems: 'center',
                padding: '8px 12px 8px 39px', borderRadius: 8, textDecoration: 'none',
                background: isActive ? 'rgba(0,109,183,0.16)' : 'transparent',
                color: isActive ? '#4FB0E8' : '#9CA3AF',
                borderLeft: isActive ? '3px solid #006db7' : '3px solid transparent',
                fontSize: 12.5, fontWeight: isActive ? 600 : 400,
                transition: 'background 150ms',
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(0,109,183,0.06)' }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
            >
              {child.label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}

export default function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { dark, toggle } = useTheme()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  const [user, setUser] = useState<UserInfo | null>(null)
  const [agendaAlerts, setAgendaAlerts] = useState<AgendaAlerts | null>(null)
  // Follow-up perto de vencer/atrasado -- visivel em qualquer tela (o backend
  // ja' escopa por perfil: usuario comum so' os proprios, demais veem todos).
  const [followupAlerts, setFollowupAlerts] = useState<AgendaAlertItem[]>([])
  const [followupOpen, setFollowupOpen] = useState(false)
  const followupSeenRef = useRef<Set<string> | null>(null)  // null = 1a carga (evita beep de leads ja existentes)
  const audioCtxRef = useRef<AudioContext | null>(null)
  // Expanders da sidebar (Campanhas/Financeiro/Configurações) em modo "sanfona"
  // -- só um aberto por vez. Abre sozinho ao entrar numa rota do grupo; fora
  // isso, só um clique manual no cabeçalho abre/fecha.
  const [openGroup, setOpenGroup] = useState<'campanhas' | 'financeiro' | 'settings' | null>(null)
  useEffect(() => {
    const match = (['campanhas', 'financeiro', 'settings'] as const).find(k => location.pathname.startsWith(`/${k}`))
    if (match) setOpenGroup(match)
  }, [location.pathname])

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

  const playFollowupBeep = useCallback(() => {
    try {
      let ctx = audioCtxRef.current
      if (!ctx) { ctx = new (window.AudioContext || (window as any).webkitAudioContext)(); audioCtxRef.current = ctx }
      if (ctx.state === 'suspended') ctx.resume().catch(() => {})
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.0001, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35)
      osc.connect(gain); gain.connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + 0.35)
    } catch { /* autoplay bloqueado ou navegador sem suporte -- silencioso */ }
  }, [])

  useEffect(() => {
    if (!user) return
    let cancelled = false
    function loadFollowup() {
      api.get<{ items: AgendaAlertItem[] }>('/api/v1/agenda/alerts', { params: { window_minutes: 10 } })
        .then(r => {
          if (cancelled) return
          const items = r.data.items
          const ids = new Set(items.map(a => a.schedule_id))
          const seen = followupSeenRef.current
          if (seen && [...ids].some(id => !seen.has(id))) playFollowupBeep()
          followupSeenRef.current = ids
          setFollowupAlerts(items)
        })
        .catch(() => {})
    }
    loadFollowup()
    const id = setInterval(loadFollowup, 60 * 1000)
    return () => { cancelled = true; clearInterval(id) }
  }, [user, playFollowupBeep])

  function logout() { localStorage.removeItem('token'); navigate('/login') }

  const slim = collapsed && !isMobile

  const isAdmin = user?.role === 'admin' || user?.username === 'lucas@o2solution.com.br'

  // "Meu desempenho": leva o usuario/supervisor direto pra Vida do Agente dele
  // (supervisor troca de agente pelo seletor do topo da tela).
  const meuNome = user ? (user.first_name || user.username) : ''
  const showMeuDesempenho = !!user && (user.role === 'usuario' || user.role === 'supervisor')
  // "Campanhas": só quem está marcado como operador (Configurações → Usuários)
  // e o admin (supervisão). Igual à checagem do backend em campanhas_routes.py.
  const showCampanhas = !!user && (isAdmin || !!user.is_campanha_operador)
  const campanhasChildren = [
    { to: '/campanhas/modelos', label: 'Modelos' },
    ...(isAdmin ? [{ to: '/campanhas/dashboard', label: 'Métricas' }] : []),
  ]
  const navItems: { to: string; label: string; Icon: LucideIcon }[] = [
    ...NAV.filter(({ adminOnly }) => !adminOnly || isAdmin).map(({ to, label, Icon }) => ({ to, label, Icon })),
    ...(showMeuDesempenho
      ? [{ to: `/vida-sdr/${encodeURIComponent(meuNome)}?nome=${encodeURIComponent(meuNome)}`, label: 'Meu desempenho', Icon: UserRound }]
      : []),
  ]

  const navLinks = navItems.map(({ to, label, Icon }) => {
    const isActive = to.startsWith('/vida-sdr') ? location.pathname.startsWith('/vida-sdr') : location.pathname === to
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

  const campanhasGroup = showCampanhas && (
    <ExpandableNavGroup
      label="Campanhas" Icon={Megaphone} basePath="/campanhas" headerTo="/campanhas" children={campanhasChildren} slim={slim} pathname={location.pathname}
      open={openGroup === 'campanhas'} onToggle={() => setOpenGroup(g => g === 'campanhas' ? null : 'campanhas')}
    />
  )
  const settingsGroup = isAdmin && (
    <ExpandableNavGroup
      label="Configurações" Icon={Settings} basePath="/settings" children={SETTINGS_CHILDREN} slim={slim} pathname={location.pathname}
      open={openGroup === 'settings'} onToggle={() => setOpenGroup(g => g === 'settings' ? null : 'settings')}
    />
  )
  const financeiroGroup = (isAdmin || user?.role === 'coordenador') && (
    <ExpandableNavGroup
      label="Financeiro" Icon={DollarSign} basePath="/financeiro" children={FINANCEIRO_CHILDREN} slim={slim} pathname={location.pathname}
      open={openGroup === 'financeiro'} onToggle={() => setOpenGroup(g => g === 'financeiro' ? null : 'financeiro')}
    />
  )

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

  const followupBell = (
    <div style={{ position: 'fixed', top: 12, right: 16, zIndex: 60 }}>
      <button
        onClick={() => setFollowupOpen(o => !o)}
        title="Follow-ups perto de vencer"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 36, height: 36, borderRadius: '50%', position: 'relative',
          border: `1px solid ${followupAlerts.length > 0 ? '#F59E0B' : '#1F2937'}`,
          background: followupAlerts.length > 0 ? 'rgba(245,158,11,0.12)' : '#111827',
          color: followupAlerts.length > 0 ? '#F59E0B' : '#9CA3AF',
          cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}
      >
        <Bell size={16} />
        {followupAlerts.length > 0 && (
          <span style={{
            position: 'absolute', top: -3, right: -3,
            background: followupAlerts.some(a => a.bucket === 'overdue') ? '#EF4444' : '#F59E0B',
            color: '#fff', borderRadius: 999, fontSize: 10, fontWeight: 700,
            minWidth: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 3px', lineHeight: 1,
          }}>
            {followupAlerts.length}
          </span>
        )}
      </button>
      {followupOpen && (
        <>
          <div onClick={() => setFollowupOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 59 }} />
          <div style={{
            position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 61, width: 300, maxHeight: 360, overflowY: 'auto',
            background: '#1F2937', border: '1px solid #374151', borderRadius: 12, padding: 10, boxShadow: '0 8px 28px rgba(0,0,0,0.4)',
          }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', margin: '4px 6px 10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Follow-up</p>
            {followupAlerts.length === 0 ? (
              <p style={{ fontSize: 12.5, color: '#6B7280', padding: '4px 6px 8px' }}>Nada vencendo nos próximos 10 minutos.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {followupAlerts.map(a => (
                  <button
                    key={a.schedule_id}
                    onClick={() => { setFollowupOpen(false); navigate(`/leads/${a.id}`) }}
                    style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 6px', borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', width: '100%' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                  >
                    {a.bucket === 'overdue'
                      ? <AlertTriangle size={14} color="#EF4444" style={{ flexShrink: 0, marginTop: 2 }} />
                      : <Clock size={14} color="#F59E0B" style={{ flexShrink: 0, marginTop: 2 }} />}
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#F9FAFB', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                      <span style={{ display: 'block', fontSize: 11, color: a.bucket === 'overdue' ? '#EF4444' : '#9CA3AF' }}>
                        {a.bucket === 'overdue' ? 'Atrasado — ' : 'Vencendo — '}{fmtHM(a.scheduled_at)}{a.attendant ? ` · ${a.attendant}` : ''}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )

  if (isMobile) {
    return (
      <>
        {followupBell}
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
            {campanhasGroup}
            {financeiroGroup}
            {settingsGroup}
          </nav>
          {footer}
        </aside>
      </>
    )
  }

  const w = collapsed ? 64 : 240
  return (
    <>
      {followupBell}
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
        {campanhasGroup}
        {financeiroGroup}
        {settingsGroup}
      </nav>
      {footer}
      </aside>
    </>
  )
}
