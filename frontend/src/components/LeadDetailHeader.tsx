import { ArrowLeft, Phone, Mail, MoreVertical, Trash2 } from 'lucide-react'

function WhatsAppIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.6 6.32A7.85 7.85 0 0 0 12.05 4a7.94 7.94 0 0 0-6.9 11.9L4 20l4.2-1.1a7.9 7.9 0 0 0 3.8 1h.03a7.94 7.94 0 0 0 5.57-13.58zM12.06 18.4h-.02a6.58 6.58 0 0 1-3.36-.92l-.24-.14-2.5.66.67-2.44-.16-.25a6.6 6.6 0 1 1 12.24-3.5 6.56 6.56 0 0 1-6.63 6.6zm3.6-4.94c-.2-.1-1.17-.58-1.35-.64-.18-.07-.31-.1-.45.1-.13.2-.5.64-.62.77-.11.13-.23.15-.42.05-.2-.1-.83-.3-1.58-.97a5.9 5.9 0 0 1-1.1-1.36c-.11-.2 0-.3.09-.4.1-.1.2-.23.3-.35.1-.11.13-.2.2-.32.06-.13.03-.25-.02-.35-.05-.1-.45-1.08-.62-1.48-.16-.4-.33-.33-.45-.34h-.38c-.13 0-.35.05-.53.25s-.7.68-.7 1.66.72 1.93.82 2.06c.1.13 1.4 2.15 3.4 3 .48.2.85.33 1.14.42.48.15.92.13 1.26.08.39-.06 1.17-.48 1.34-.94.16-.46.16-.85.11-.94-.05-.09-.18-.14-.38-.24z"/>
    </svg>
  )
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const waHref = 'https://app.hbcconecta.com.br/index.html#/atendimentos/chat/'

function actionBtnStyle(enabled: boolean): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 7, padding: '9px 15px', borderRadius: 10,
    fontSize: 13, fontWeight: 600, border: '1px solid var(--border-in)', background: 'var(--bg-card)',
    color: 'var(--text-2)', textDecoration: 'none', cursor: enabled ? 'pointer' : 'not-allowed',
    opacity: enabled ? 1 : 0.4, boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
  }
}

export default function LeadDetailHeader({
  name, sinceLabel, lastInteractionLabel, attendantLabel, telHref, mailHref,
  isAdmin, menuOpen, onToggleMenu, onCloseMenu, onRequestDelete, onBack,
}: {
  name: string
  sinceLabel: string
  lastInteractionLabel: string
  attendantLabel: string
  telHref: string | null
  mailHref: string | null
  isAdmin: boolean
  menuOpen: boolean
  onToggleMenu: () => void
  onCloseMenu: () => void
  onRequestDelete: () => void
  onBack: () => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
        <button
          onClick={onBack}
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, flexShrink: 0 }}
        >
          <ArrowLeft size={16} />
        </button>
        <div style={{
          flexShrink: 0, width: 50, height: 50, borderRadius: '50%',
          background: 'linear-gradient(135deg, #60A5FA, #2563EB)',
          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 17, fontWeight: 700, letterSpacing: '0.02em',
          boxShadow: '0 2px 8px rgba(37,99,235,0.35)',
        }}>
          {initials(name)}
        </div>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: 21, fontWeight: 800, color: 'var(--text-1)', margin: 0, letterSpacing: '-0.01em', overflowWrap: 'break-word' }}>{name}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginTop: 8, fontSize: 12, color: 'var(--text-subtle)' }}>
            <span>Lead desde <b style={{ color: 'var(--text-2)', fontWeight: 700 }}>{sinceLabel}</b></span>
            <span>Última interação <b style={{ color: 'var(--text-2)', fontWeight: 700 }}>{lastInteractionLabel}</b></span>
            <span>Consultor <b style={{ color: 'var(--text-2)', fontWeight: 700 }}>{attendantLabel}</b></span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <a href={telHref ?? undefined} style={actionBtnStyle(!!telHref)} onClick={e => { if (!telHref) e.preventDefault() }}>
          <Phone size={15} /> Ligar
        </a>
        <a href={waHref ?? undefined} target="_blank" rel="noreferrer" style={actionBtnStyle(!!waHref)} onClick={e => { if (!waHref) e.preventDefault() }}>
          <WhatsAppIcon /> WhatsApp
        </a>
        <a href={mailHref ?? undefined} style={actionBtnStyle(!!mailHref)} onClick={e => { if (!mailHref) e.preventDefault() }}>
          <Mail size={15} /> E-mail
        </a>
        {isAdmin && (
          <div style={{ position: 'relative' }}>
            <button
              onClick={onToggleMenu}
              title="Mais opções"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, borderRadius: 10, border: '1px solid var(--border-in)', background: 'var(--bg-card)', color: 'var(--text-muted)', cursor: 'pointer' }}
            >
              <MoreVertical size={16} />
            </button>
            {menuOpen && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 90 }} onClick={onCloseMenu} />
                <div style={{ position: 'absolute', right: 0, top: 44, zIndex: 100, background: 'var(--bg-card)', border: '1px solid rgba(15,23,42,0.08)', borderRadius: 10, boxShadow: '0 8px 24px rgba(15,23,42,0.14)', minWidth: 160, overflow: 'hidden' }}>
                  <button
                    onClick={onRequestDelete}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: '#DC2626', textAlign: 'left' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                  >
                    <Trash2 size={14} /> Excluir lead
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
