import { useState, useEffect, useCallback, useRef, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, FileText, Users,
  Settings, LogOut, ChevronDown, Menu, X, Pin, PinOff, Sun, Moon, Phone, TrendingUp, DollarSign, Briefcase, CalendarDays, ScrollText, Lightbulb, UserRound, Megaphone, Bell, Clock, AlertTriangle,
  type LucideIcon,
} from 'lucide-react'
import api from '../api'
import { useTheme } from '../ThemeContext'
import { useSinoSlot } from './SinoSlot'
import '../styles/sidebar.css'

interface UserInfo { username: string; first_name: string | null; role: string; is_campanha_operador?: boolean }
interface AgendaAlerts { overdue: number; today: number }
interface AgendaAlertItem {
  id: string; name: string; phone: string | null; attendant: string | null
  scheduled_at: string; schedule_id: string; bucket: 'overdue' | 'due_soon'
}
interface NotificacaoItem { id: string; lead_id: string | null; texto: string; criado_em: string | null; lida: boolean }
const fmtQuando = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(iso.endsWith('Z') ? iso : iso + 'Z')
  const mins = Math.floor((Date.now() - d.getTime()) / 60000)
  if (mins < 60) return `há ${Math.max(mins, 0)} min`
  if (mins < 24 * 60) return `há ${Math.floor(mins / 60)}h`
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}
const fmtHM = (iso: string) => new Date(iso.endsWith('Z') ? iso : iso + 'Z').toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

const NAV = [
  { to: '/dashboard',        label: 'Dashboard',        Icon: LayoutDashboard, adminOnly: false },
  { to: '/leads-report',     label: 'Relatório',        Icon: FileText,        adminOnly: false },
  { to: '/gestao-comercial', label: 'Gestão Comercial', Icon: Briefcase,       adminOnly: false },
  { to: '/agenda',           label: 'Agenda',           Icon: CalendarDays,    adminOnly: false },
  { to: '/scripts',          label: 'Scripts',          Icon: ScrollText,      adminOnly: false },
  { to: '/sugestoes',        label: 'Sugestões',        Icon: Lightbulb,       adminOnly: false },
  { to: '/kpis',             label: 'Performance',      Icon: TrendingUp,      adminOnly: false },
  { to: '/telefonia',        label: 'Telefonia',        Icon: Phone,           adminOnly: true  },
]

const DASHBOARD_CHILDREN = [
  { to: '/dashboard/placar', label: 'Placar do dia' },
]

const SETTINGS_CHILDREN = [
  { to: '/settings/usuarios', label: 'Usuários' },
  { to: '/settings/api',      label: 'API' },
  { to: '/settings/operadoras', label: 'Operadoras' },
]

const FINANCEIRO_CHILDREN = [
  { to: '/financeiro/visao-geral', label: 'Visão Geral' },
  { to: '/financeiro/macro',       label: 'Macro' },
  { to: '/financeiro/metas',       label: 'Metas Mensais' },
  { to: '/financeiro/trafego',     label: 'Tráfego pago' },
]

function ExpandableNavGroup({ label, Icon, basePath, headerTo, children, pathname, open, onToggle }: {
  label: string; Icon: LucideIcon; basePath: string; headerTo?: string; children: { to: string; label: string }[]; pathname: string
  open: boolean; onToggle: () => void
}) {
  const groupActive = pathname.startsWith(basePath)
  // destaque no cabeçalho: rota exata do header, ou grupo fechado com algo ativo dentro
  const headerOn = headerTo ? pathname === headerTo || (groupActive && !open) : (groupActive && !open)
  const inner = (
    <>
      <Icon size={18} className="sb-ic" />
      <span className="sb-lb sb-hide">{label}</span>
      <ChevronDown size={15} className="sb-chev sb-hide" />
    </>
  )
  const cls = `sb-it ${headerOn ? 'on' : ''} ${open ? 'open' : ''}`
  return (
    <div>
      {headerTo
        ? <Link to={headerTo} className={cls} onClick={() => { if (pathname === headerTo) onToggle() }}>{inner}</Link>
        : <button type="button" onClick={onToggle} aria-expanded={open} className={cls}>{inner}</button>}
      <div className={`sb-subs ${open ? 'open' : ''}`}>
        <div>
          {children.map(child => (
            <Link key={child.to} to={child.to} className={`sb-sub ${pathname === child.to ? 'on' : ''}`}>{child.label}</Link>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { dark, toggle } = useTheme()
  // trilho de ícones: abre por cima ao passar o mouse; alfinete fixa aberto
  const [pinned, setPinned] = useState(() => { try { return localStorage.getItem('sidebarPinned') === '1' } catch { return false } })
  const [hover, setHover] = useState(false)
  const togglePinned = () => setPinned(v => {
    try { localStorage.setItem('sidebarPinned', v ? '0' : '1') } catch { /* sem storage */ }
    return !v
  })
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  const [user, setUser] = useState<UserInfo | null>(null)
  const [agendaAlerts, setAgendaAlerts] = useState<AgendaAlerts | null>(null)
  // Follow-up perto de vencer/atrasado -- visivel em qualquer tela (o backend
  // ja' escopa por perfil: usuario comum so' os proprios, demais veem todos).
  const [followupAlerts, setFollowupAlerts] = useState<AgendaAlertItem[]>([])
  const [followupOpen, setFollowupOpen] = useState(false)
  // Avisos de lead recebido (renutrição, troca de atendente, rodízio) --
  // ficam no sino até a pessoa abrir.
  const [notificacoes, setNotificacoes] = useState<NotificacaoItem[]>([])
  const [naoLidas, setNaoLidas] = useState(0)
  const notifSeenRef = useRef<Set<string> | null>(null)  // null = 1a carga (sem beep)
  const followupSeenRef = useRef<Set<string> | null>(null)  // null = 1a carga (evita beep de leads ja existentes)
  const audioCtxRef = useRef<AudioContext | null>(null)
  // Expanders da sidebar (Campanhas/Financeiro/Configurações) em modo "sanfona"
  // -- só um aberto por vez. Abre sozinho ao entrar numa rota do grupo; fora
  // isso, só um clique manual no cabeçalho abre/fecha.
  const [openGroup, setOpenGroup] = useState<'dashboard' | 'campanhas' | 'financeiro' | 'settings' | null>(null)
  useEffect(() => {
    const match = (['dashboard', 'campanhas', 'financeiro', 'settings'] as const).find(k => location.pathname.startsWith(`/${k}`))
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
    const admin = user.role === 'admin' || user.role === 'diretor' || user.username === 'lucas@o2solution.com.br'
    if (!admin) return
    let cancelled = false
    function load() {
      api.get<AgendaAlerts>('/api/v1/agenda/alerts/count').then(r => { if (!cancelled) setAgendaAlerts(r.data) }).catch(() => {})
    }
    load()
    const id = setInterval(load, 3 * 60 * 1000)
    return () => { cancelled = true; clearInterval(id) }
  }, [user])

  // Dedupe entre abas: com mais de uma aba/janela logada, cada uma tem seu
  // proprio timer e tocaria o beep sozinha pro mesmo agendamento. localStorage
  // e' compartilhado entre abas da mesma origem -- a primeira aba a ver um
  // schedule_id "reivindica" o beep gravando-o aqui; as outras, ao verem que
  // ja' foi reivindicado, nao tocam de novo. Se o localStorage falhar (modo
  // anonimo, por ex.), toca mesmo assim -- melhor duplicar que perder o alerta.
  const claimFollowupBeep = useCallback((newIds: string[]): boolean => {
    const KEY = 'o2sig_followup_beeped_ids_v1'
    const TTL_MS = 2 * 60 * 60 * 1000
    try {
      const now = Date.now()
      const map: Record<string, number> = JSON.parse(localStorage.getItem(KEY) || '{}')
      for (const k of Object.keys(map)) { if (now - map[k] > TTL_MS) delete map[k] }
      let shouldBeep = false
      for (const id of newIds) {
        if (!(id in map)) { shouldBeep = true; map[id] = now }
      }
      localStorage.setItem(KEY, JSON.stringify(map))
      return shouldBeep
    } catch {
      return true
    }
  }, [])

  const playFollowupBeep = useCallback(() => {
    try {
      let ctx = audioCtxRef.current
      if (!ctx) { ctx = new (window.AudioContext || (window as any).webkitAudioContext)(); audioCtxRef.current = ctx }
      if (ctx.state === 'suspended') ctx.resume().catch(() => {})
      // Dois beeps em sequencia (tipo notificacao de celular), bem mais alto que
      // o beep unico de antes -- pedido pra nao passar batido num ambiente com
      // barulho. Gain 0.6 (era 0.15): ainda longe do maximo (1.0), sem estourar.
      const tone = (startAt: number) => {
        const osc = ctx!.createOscillator()
        const gain = ctx!.createGain()
        osc.type = 'sine'
        osc.frequency.value = 880
        gain.gain.setValueAtTime(0.0001, startAt)
        gain.gain.exponentialRampToValueAtTime(0.6, startAt + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.32)
        osc.connect(gain); gain.connect(ctx!.destination)
        osc.start(startAt)
        osc.stop(startAt + 0.32)
      }
      tone(ctx.currentTime)
      tone(ctx.currentTime + 0.4)
    } catch { /* autoplay bloqueado ou navegador sem suporte -- silencioso */ }
  }, [])

  // Agendamento perto de vencer / vencido tem som próprio ("ding-dong": duas
  // notas descendo), diferente dos dois bipes do lead novo -- dá pra saber de
  // longe qual dos dois avisos tocou.
  const playAgendaBeep = useCallback(() => {
    try {
      let ctx = audioCtxRef.current
      if (!ctx) { ctx = new (window.AudioContext || (window as any).webkitAudioContext)(); audioCtxRef.current = ctx }
      if (ctx.state === 'suspended') ctx.resume().catch(() => {})
      const tone = (startAt: number, freq: number, dur: number) => {
        const osc = ctx!.createOscillator()
        const gain = ctx!.createGain()
        osc.type = 'sine'
        osc.frequency.value = freq
        gain.gain.setValueAtTime(0.0001, startAt)
        gain.gain.exponentialRampToValueAtTime(0.55, startAt + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, startAt + dur)
        osc.connect(gain); gain.connect(ctx!.destination)
        osc.start(startAt)
        osc.stop(startAt + dur)
      }
      tone(ctx.currentTime, 784, 0.55)
      tone(ctx.currentTime + 0.38, 622.25, 0.8)
    } catch { /* autoplay bloqueado ou navegador sem suporte -- silencioso */ }
  }, [])

  useEffect(() => {
    if (!user || user.role === 'trafego') return
    let cancelled = false
    function loadFollowup() {
      api.get<{ items: AgendaAlertItem[] }>('/api/v1/agenda/alerts', { params: { window_minutes: 10 } })
        .then(r => {
          if (cancelled) return
          const items = r.data.items
          const ids = new Set(items.map(a => a.schedule_id))
          const seen = followupSeenRef.current
          if (seen) {
            const newIds = [...ids].filter(id => !seen.has(id))
            if (newIds.length > 0 && claimFollowupBeep(newIds)) playAgendaBeep()
          }
          followupSeenRef.current = ids
          setFollowupAlerts(items)
        })
        .catch(() => {})
    }
    loadFollowup()
    const id = setInterval(loadFollowup, 60 * 1000)
    return () => { cancelled = true; clearInterval(id) }
  }, [user, playAgendaBeep, claimFollowupBeep])

  useEffect(() => {
    if (!user || user.role === 'trafego') return
    let cancelled = false
    function loadNotificacoes() {
      api.get<{ nao_lidas: number; items: NotificacaoItem[] }>('/api/v1/notificacoes')
        .then(r => {
          if (cancelled) return
          const novas = r.data.items.filter(n => !n.lida).map(n => n.id)
          const seen = notifSeenRef.current
          if (seen) {
            const newIds = novas.filter(id => !seen.has(id))
            if (newIds.length > 0 && claimFollowupBeep(newIds.map(id => `n:${id}`))) playFollowupBeep()
          }
          notifSeenRef.current = new Set(novas)
          setNotificacoes(r.data.items)
          setNaoLidas(r.data.nao_lidas)
        })
        .catch(() => {})
    }
    loadNotificacoes()
    const id = setInterval(loadNotificacoes, 60 * 1000)
    return () => { cancelled = true; clearInterval(id) }
  }, [user, playFollowupBeep, claimFollowupBeep])

  function toggleSino() {
    const abrindo = !followupOpen
    setFollowupOpen(abrindo)
    // abriu o sino = viu os avisos; o destaque de "nova" some na próxima abertura
    if (abrindo && naoLidas > 0) {
      setNaoLidas(0)
      api.post('/api/v1/notificacoes/marcar-lidas').catch(() => {})
    }
    if (!abrindo) setNotificacoes(ns => ns.map(n => ({ ...n, lida: true })))
  }

  function logout() { localStorage.removeItem('token'); navigate('/login') }

  const expanded = pinned || hover || isMobile

  const isAdmin = user?.role === 'admin' || user?.username === 'lucas@o2solution.com.br'
  // diretor: mesma visão do admin (menus e painéis), sem as Configurações
  const canViewAll = isAdmin || user?.role === 'diretor'

  // "Meu desempenho": leva o usuario/supervisor direto pra Vida do Agente dele
  // (supervisor troca de agente pelo seletor do topo da tela).
  const meuNome = user ? (user.first_name || user.username) : ''
  const showMeuDesempenho = !!user && (user.role === 'usuario' || user.role === 'supervisor')
  // "Campanhas": só quem está marcado como operador (Configurações → Usuários)
  // e o admin (supervisão). Igual à checagem do backend em campanhas_routes.py.
  const showCampanhas = !!user && (isAdmin || !!user.is_campanha_operador)
  const campanhasChildren = [
    { to: '/campanhas/modelos', label: 'Modelos' },
    ...(canViewAll ? [{ to: '/campanhas/dashboard', label: 'Métricas' }] : []),
  ]
  // parceiro de tráfego: só o Relatório (o backend bloqueia o resto)
  const isTrafego = user?.role === 'trafego'
  const navItems: { to: string; label: string; Icon: LucideIcon }[] = isTrafego
    ? NAV.filter(n => n.to === '/leads-report').map(({ to, label, Icon }) => ({ to, label, Icon }))
    : [
    ...NAV.filter(({ adminOnly }) => !adminOnly || canViewAll).map(({ to, label, Icon }) => ({ to, label, Icon })),
    ...(showMeuDesempenho
      ? [{ to: `/vida-sdr/${encodeURIComponent(meuNome)}?nome=${encodeURIComponent(meuNome)}`, label: 'Meu desempenho', Icon: UserRound }]
      : []),
  ]

  const linkEl = (to: string) => {
    const item = navItems.find(n => n.to === to)
    if (!item) return null
    const { label, Icon } = item
    const isActive = to.startsWith('/vida-sdr') ? location.pathname.startsWith('/vida-sdr') : location.pathname === to
    const alertCount = to === '/agenda' && agendaAlerts ? agendaAlerts.overdue + agendaAlerts.today : 0
    const alertColor = agendaAlerts && agendaAlerts.overdue > 0 ? 'var(--sb-red)' : '#F59E0B'
    return (
      <Link key={label} to={to} className={`sb-it ${isActive ? 'on' : ''}`} title={expanded ? undefined : label}>
        <Icon size={18} className="sb-ic" />
        <span className="sb-lb sb-hide">{label}</span>
        {alertCount > 0 && <span className="sb-badge" style={{ background: alertColor }}>{alertCount}</span>}
      </Link>
    )
  }
  const meuDesempenhoTo = navItems.find(n => n.to.startsWith('/vida-sdr'))?.to

  // Dashboard com a sub-aba "Placar do dia" (some pro parceiro de tráfego, igual ao item antigo)
  const dashboardGroup = navItems.some(n => n.to === '/dashboard') && (
    <ExpandableNavGroup
      label="Dashboard" Icon={LayoutDashboard} basePath="/dashboard" headerTo="/dashboard" children={DASHBOARD_CHILDREN} pathname={location.pathname}
      open={openGroup === 'dashboard'} onToggle={() => setOpenGroup(g => g === 'dashboard' ? null : 'dashboard')}
    />
  )
  const campanhasGroup = showCampanhas && (
    <ExpandableNavGroup
      label="Campanhas" Icon={Megaphone} basePath="/campanhas" headerTo="/campanhas" children={campanhasChildren} pathname={location.pathname}
      open={openGroup === 'campanhas'} onToggle={() => setOpenGroup(g => g === 'campanhas' ? null : 'campanhas')}
    />
  )
  const settingsGroup = isAdmin && (
    <ExpandableNavGroup
      label="Configurações" Icon={Settings} basePath="/settings" children={SETTINGS_CHILDREN} pathname={location.pathname}
      open={openGroup === 'settings'} onToggle={() => setOpenGroup(g => g === 'settings' ? null : 'settings')}
    />
  )
  // mesmos papéis de can_see_financials (backend/app/security.py)
  const financeiroGroup = (isAdmin || ['diretor', 'financeiro', 'coordenador'].includes(user?.role ?? '')) && (
    <ExpandableNavGroup
      label="Financeiro" Icon={DollarSign} basePath="/financeiro" children={FINANCEIRO_CHILDREN} pathname={location.pathname}
      open={openGroup === 'financeiro'} onToggle={() => setOpenGroup(g => g === 'financeiro' ? null : 'financeiro')}
    />
  )

  const nomeUser = user ? (user.first_name || user.username) : ''
  const iniciais = nomeUser.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(p => p[0]!.toUpperCase()).join('') || '?'
  const footer = (
    <div className="sb-foot">
      <button type="button" className="sb-it" onClick={toggle} title={expanded ? undefined : (dark ? 'Modo claro' : 'Modo escuro')}>
        {dark ? <Sun size={18} className="sb-ic" /> : <Moon size={18} className="sb-ic" />}
        <span className="sb-lb sb-hide">{dark ? 'Modo claro' : 'Modo escuro'}</span>
      </button>
      {user && (
        <div className="sb-it static" title={expanded ? undefined : nomeUser}>
          <span className="sb-av">{iniciais}</span>
          <span className="sb-lb sb-hide">{nomeUser}<small>{user.role}</small></span>
        </div>
      )}
      <button type="button" className="sb-it danger" onClick={logout} title={expanded ? undefined : 'Sair'}>
        <LogOut size={18} className="sb-ic" />
        <span className="sb-lb sb-hide">Sair</span>
      </button>
    </div>
  )

  const sinoTotal = followupAlerts.length + naoLidas
  // página com <SinoSlot /> no cabeçalho: o sino entra ali, ao lado dos botões
  // do topo; sem encaixe (ou no celular), flutua fixo no canto superior direito
  const sinoSlot = useSinoSlot()
  const sinoNoSlot = !!sinoSlot && !isMobile
  const sinoCor = followupAlerts.length > 0 ? '#F59E0B' : '#3B82F6'
  const followupBellEl = (
    <div style={sinoNoSlot ? { position: 'relative', zIndex: 60 } : { position: 'fixed', top: 12, right: 16, zIndex: 60 }}>
      <button
        onClick={toggleSino}
        title="Notificações"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 36, height: 36, borderRadius: '50%', position: 'relative',
          border: `1px solid ${sinoTotal > 0 ? sinoCor : '#1F2937'}`,
          background: sinoTotal > 0 ? (followupAlerts.length > 0 ? 'rgba(245,158,11,0.12)' : 'rgba(59,130,246,0.14)') : '#111827',
          color: sinoTotal > 0 ? sinoCor : '#9CA3AF',
          cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        }}
      >
        <Bell size={16} />
        {sinoTotal > 0 && (
          <span style={{
            position: 'absolute', top: -3, right: -3,
            background: followupAlerts.some(a => a.bucket === 'overdue') ? '#EF4444' : sinoCor,
            color: '#fff', borderRadius: 999, fontSize: 10, fontWeight: 700,
            minWidth: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 3px', lineHeight: 1,
          }}>
            {sinoTotal}
          </span>
        )}
      </button>
      {followupOpen && (
        <>
          <div onClick={toggleSino} style={{ position: 'fixed', inset: 0, zIndex: 59 }} />
          <div style={{
            position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 61, width: 300, maxHeight: 420, overflowY: 'auto',
            background: '#1F2937', border: '1px solid #374151', borderRadius: 12, padding: 10, boxShadow: '0 8px 28px rgba(0,0,0,0.4)',
          }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', margin: '4px 6px 10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Leads recebidos</p>
            {notificacoes.length === 0 ? (
              <p style={{ fontSize: 12.5, color: '#6B7280', padding: '4px 6px 8px' }}>Nenhum lead recebido nos últimos 30 dias.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                {notificacoes.map(n => (
                  <button
                    key={n.id}
                    onClick={() => { toggleSino(); navigate(n.lead_id ? `/leads/${n.lead_id}` : '/leads-report') }}
                    style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 6px', borderRadius: 8, border: 'none', background: n.lida ? 'transparent' : 'rgba(59,130,246,0.10)', cursor: 'pointer', textAlign: 'left', width: '100%' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = n.lida ? 'transparent' : 'rgba(59,130,246,0.10)' }}
                  >
                    <UserRound size={14} color={n.lida ? '#6B7280' : '#3B82F6'} style={{ flexShrink: 0, marginTop: 2 }} />
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: 'block', fontSize: 12.5, fontWeight: n.lida ? 500 : 700, color: '#F9FAFB', lineHeight: 1.35 }}>{n.texto}</span>
                      <span style={{ display: 'block', fontSize: 11, color: '#9CA3AF' }}>{fmtQuando(n.criado_em)}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            <p style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', margin: '4px 6px 10px', textTransform: 'uppercase', letterSpacing: '0.06em', borderTop: '1px solid #374151', paddingTop: 10 }}>Follow-up</p>
            {followupAlerts.length === 0 ? (
              <p style={{ fontSize: 12.5, color: '#6B7280', padding: '4px 6px 8px' }}>Nada vencendo nos próximos 10 minutos.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {followupAlerts.map(a => (
                  <button
                    key={a.schedule_id}
                    onClick={() => { toggleSino(); navigate(`/leads/${a.id}`) }}
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
  const followupBell = sinoNoSlot ? createPortal(followupBellEl, sinoSlot!) : followupBellEl

  // menu agrupado por assunto; seção sem nenhum item (ex: Gestão pra quem não vê nada dela) some
  const gestao = [campanhasGroup, financeiroGroup, settingsGroup].filter(Boolean)
  const navBody = (
    <>
      <div className="sb-sect">Operação</div>
      {dashboardGroup}
      {linkEl('/leads-report')}
      {linkEl('/gestao-comercial')}
      {linkEl('/agenda')}
      {!isTrafego && (
        <>
          <div className="sb-sect">Equipe</div>
          {meuDesempenhoTo && linkEl(meuDesempenhoTo)}
          {linkEl('/kpis')}
          {linkEl('/scripts')}
          {linkEl('/sugestoes')}
          {linkEl('/telefonia')}
        </>
      )}
      {gestao.length > 0 && (
        <>
          <div className="sb-sect">Gestão</div>
          {gestao}
        </>
      )}
    </>
  )

  if (isMobile) {
    return (
      <div className="sb">
        {followupBell}
        {!mobileOpen && (
          <button type="button" className="sb-menu-btn" onClick={() => setMobileOpen(true)} aria-label="Abrir menu">
            <Menu size={20} />
          </button>
        )}
        {mobileOpen && (
          <div onClick={() => setMobileOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 40 }} />
        )}
        <aside className="sb-rail exp mobile" style={{ transform: mobileOpen ? 'translateX(0)' : 'translateX(-105%)' }}>
          <div className="sb-head">
            <span className="sb-logo">O2</span>
            <span className="sb-brand">O2 Solution</span>
            <button type="button" className="sb-iconbtn" onClick={() => setMobileOpen(false)} aria-label="Fechar menu"><X size={16} /></button>
          </div>
          <nav className="sb-nav">{navBody}</nav>
          {footer}
        </aside>
      </div>
    )
  }

  return (
    <>
      {followupBell}
      <div className={`sb sb-slot ${pinned ? 'pinned' : ''}`}>
        <aside
          className={`sb-rail ${expanded ? 'exp' : ''}`}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
        >
          <div className="sb-head">
            <span className="sb-logo">O2</span>
            <span className="sb-brand sb-hide">O2 Solution</span>
            <button
              type="button"
              className={`sb-iconbtn sb-hide ${pinned ? 'on' : ''}`}
              onClick={togglePinned}
              title={pinned ? 'Soltar (menu volta a abrir só com o mouse)' : 'Fixar menu aberto'}
            >
              {pinned ? <PinOff size={16} /> : <Pin size={16} />}
            </button>
          </div>
          <nav className="sb-nav">{navBody}</nav>
          {footer}
        </aside>
      </div>
    </>
  )
}
