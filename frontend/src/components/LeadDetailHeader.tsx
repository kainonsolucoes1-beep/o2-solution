import { ArrowLeft, MoreVertical, Trash2, User, Globe, Mail } from 'lucide-react'
import Pill from './Pill'

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const isEmpty = (v: string) => !v || v === 'Não informado' || v === '—'

export default function LeadDetailHeader({
  name, statusLabel, sStyle, perceptionLabel, perceptionStyle,
  phoneLabel, emailLabel, attendantLabel, origemLabel,
  isAdmin, menuOpen, onToggleMenu, onCloseMenu, onRequestDelete, onBack, bare,
}: {
  name: string
  statusLabel: string
  sStyle: { bg: string; color: string }
  perceptionLabel: string | null
  perceptionStyle: { bg: string; color: string } | null
  phoneLabel: string
  emailLabel: string
  attendantLabel: string
  origemLabel: string
  isAdmin: boolean
  menuOpen: boolean
  onToggleMenu: () => void
  onCloseMenu: () => void
  onRequestDelete: () => void
  onBack: () => void
  bare?: boolean
}) {
  const outer: React.CSSProperties = bare
    ? { display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 14 }
    : { display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 14, marginBottom: 20, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px' }

  return (
    <div style={outer}>
      <button
        onClick={onBack}
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, flexShrink: 0, marginTop: 2 }}
      >
        <ArrowLeft size={16} />
      </button>

      <div style={{
        flexShrink: 0, width: 44, height: 44, borderRadius: '50%',
        background: 'var(--bg-subtle)', color: 'var(--accent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 14, fontWeight: 700, letterSpacing: '0.01em', marginTop: 1,
      }}>
        {initials(name)}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-1)', margin: 0, letterSpacing: '-0.01em', lineHeight: 1.25, overflowWrap: 'break-word' }}>
          {name}
        </p>
        <div className="flex flex-wrap" style={{ gap: 5, marginTop: 7 }}>
          <Pill colors={sStyle}>{statusLabel}</Pill>
          {perceptionLabel && perceptionStyle && <Pill colors={perceptionStyle}>{perceptionLabel}</Pill>}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 12px', marginTop: 12, fontSize: 12.5 }}>
          {!isEmpty(phoneLabel) && (
            <span style={{ color: 'var(--text-1)', fontWeight: 600 }}>{phoneLabel}</span>
          )}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--text-2)', fontWeight: 600 }}>
            <User size={12} style={{ color: 'var(--text-subtle)' }} /> {isEmpty(attendantLabel) ? 'Sem atendente' : attendantLabel}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--text-2)', fontWeight: 600 }}>
            <Globe size={12} style={{ color: 'var(--text-subtle)' }} /> {isEmpty(origemLabel) ? 'Sem origem' : origemLabel}
          </span>
          {isEmpty(emailLabel)
            ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--text-subtle)' }}><Mail size={12} /> sem e-mail</span>
            : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--text-2)', fontWeight: 600 }}><Mail size={12} style={{ color: 'var(--text-subtle)' }} /> {emailLabel}</span>}
        </div>
      </div>

      {isAdmin && (
        <div style={{ position: 'relative', flexShrink: 0 }}>
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
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: 'var(--danger)', textAlign: 'left' }}
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
  )
}
