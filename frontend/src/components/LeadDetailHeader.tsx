import { ArrowLeft, MoreVertical, Trash2 } from 'lucide-react'
import Pill from './Pill'

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function ContactRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '78px minmax(0, 1fr)', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
      <dt style={{ margin: 0, color: 'var(--text-muted)', fontSize: 12, fontWeight: 500 }}>{label}</dt>
      <dd style={{ margin: 0, overflowWrap: 'anywhere', color: 'var(--text-1)', fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>{value}</dd>
    </div>
  )
}

export default function LeadDetailHeader({
  name, statusLabel, sStyle, perceptionLabel, perceptionStyle,
  phoneLabel, emailLabel, attendantLabel, origemLabel,
  isAdmin, menuOpen, onToggleMenu, onCloseMenu, onRequestDelete, onBack,
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
}) {
  return (
    <div className="flex flex-wrap" style={{
      alignItems: 'flex-start', gap: 18, marginBottom: 20,
      background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px',
    }}>
      <div className="w-full sm:w-auto">
        <button
          onClick={onBack}
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, flexShrink: 0, marginTop: 2 }}
        >
          <ArrowLeft size={16} />
        </button>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex" style={{ alignItems: 'center', gap: 13 }}>
          <div style={{
            flexShrink: 0, width: 44, height: 44, borderRadius: '50%',
            background: 'var(--bg-subtle)', color: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, fontWeight: 700, letterSpacing: '0.01em',
          }}>
            {initials(name)}
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="flex items-center flex-wrap" style={{ gap: 10 }}>
              <p className="text-[18px] sm:text-[24px]" style={{ fontWeight: 700, color: 'var(--text-1)', margin: 0, letterSpacing: '-0.02em', overflowWrap: 'break-word' }}>{name}</p>
              <div className="flex flex-wrap" style={{ gap: 5, marginTop: 3 }}>
                <Pill colors={sStyle}>{statusLabel}</Pill>
                {perceptionLabel && perceptionStyle && <Pill colors={perceptionStyle}>{perceptionLabel}</Pill>}
              </div>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 18, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
          <dl style={{ display: 'flex', flexDirection: 'column', gap: 5, maxWidth: 520, margin: 0 }}>
            <ContactRow label="Telefone" value={phoneLabel} />
            <ContactRow label="E-mail" value={emailLabel} />
            <ContactRow label="Atendente" value={attendantLabel} />
            <ContactRow label="Origem" value={origemLabel} />
          </dl>
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
