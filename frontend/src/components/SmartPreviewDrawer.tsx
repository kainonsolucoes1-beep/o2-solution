import { useEffect, useRef, useState } from 'react'
import { useTheme } from '../ThemeContext'

export interface PreviewRow { title: string; subtitle: string; value?: string; meta?: string; status?: string }
export interface Preview { title: string; description: string; summary: Array<[string, string]>; rows: PreviewRow[]; count?: string; actionLabel: string }

interface Props {
  preview: Preview
  loading?: boolean
  trigger: HTMLElement | null
  onClose: () => void
  onAction: () => void
}

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

// Drawer lateral reutilizável para o padrão Smart Preview (Vida do Agente).
// Estilo segue os mesmos tokens de SourceDetailModal.tsx (CSS vars de tema);
// conteúdo/dados ficam fora deste componente.
export default function SmartPreviewDrawer({ preview, loading, trigger, onClose, onAction }: Props) {
  const { dark } = useTheme()
  const closeRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true))
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { onClose(); return }
      if (event.key !== 'Tab' || !panelRef.current) return
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    closeRef.current?.focus()
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
      trigger?.focus()
    }
  }, [onClose, trigger])

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', justifyContent: 'flex-end', background: `rgba(15,23,42,${entered ? 0.45 : 0})`, transition: 'background 160ms ease' }}
      onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="smart-preview-title"
        style={{
          width: 'min(420px, 100%)', height: '100%', display: 'flex', flexDirection: 'column',
          background: 'var(--bg-card)', boxShadow: '-18px 0 44px rgba(0,0,0,0.22)',
          transform: entered ? 'translateX(0)' : 'translateX(24px)', opacity: entered ? 1 : 0,
          transition: 'transform 180ms ease, opacity 180ms ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, padding: '22px 22px 18px', borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.06)' : 'var(--border-lt)'}` }}>
          <div>
            <p style={{ fontSize: 11, color: 'var(--text-subtle)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Smart Preview</p>
            <h2 id="smart-preview-title" style={{ fontSize: 19, fontWeight: 700, color: 'var(--text-1)', margin: '5px 0 6px' }}>{preview.title}</h2>
            <p style={{ fontSize: 12, color: 'var(--text-subtle)', margin: 0, lineHeight: 1.5 }}>{preview.description}</p>
          </div>
          <button ref={closeRef} onClick={onClose} aria-label="Fechar" style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 8, border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'var(--border)'}`, background: 'var(--bg-subtle)', color: 'var(--text-muted)', fontSize: 16, cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>
          {loading ? (
            <p style={{ textAlign: 'center', color: 'var(--text-subtle)', fontSize: 12.5, padding: '40px 0' }}>Carregando…</p>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 18 }}>
                {preview.summary.map(([label, value]) => (
                  <div key={label} style={{ padding: '11px 12px', border: `1px solid ${dark ? 'rgba(255,255,255,0.06)' : 'var(--border-lt)'}`, borderRadius: 10, background: 'var(--bg-subtle)' }}>
                    <p style={{ fontSize: 10.5, color: 'var(--text-subtle)', margin: 0 }}>{label}</p>
                    <p style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text-1)', margin: '4px 0 0', fontVariantNumeric: 'tabular-nums' }}>{value}</p>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {preview.rows.slice(0, 5).map((row, index) => (
                  <div key={`${row.title}-${index}`} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, padding: '11px 12px', border: `1px solid ${dark ? 'rgba(255,255,255,0.06)' : 'var(--border-lt)'}`, borderRadius: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>{row.title}</p>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '3px 0 0' }}>{row.subtitle}</p>
                      {row.meta && <p style={{ fontSize: 10.5, color: 'var(--text-subtle)', margin: '3px 0 0' }}>{row.meta}</p>}
                    </div>
                    <div style={{ flexShrink: 0, textAlign: 'right' }}>
                      {row.value && <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{row.value}</p>}
                      {row.status && <p style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--bg-subtle)', borderRadius: 6, padding: '2px 6px', margin: '4px 0 0' }}>{row.status}</p>}
                    </div>
                  </div>
                ))}
              </div>
              {preview.count && <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-subtle)', margin: '12px 0 0' }}>{preview.count}</p>}
            </>
          )}
        </div>

        <div style={{ padding: '16px 22px', borderTop: `1px solid ${dark ? 'rgba(255,255,255,0.06)' : 'var(--border-lt)'}` }}>
          <button
            onClick={onAction}
            style={{ width: '100%', padding: '12px 0', background: '#2563EB', color: '#fff', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13.5, fontWeight: 600 }}
          >
            {preview.actionLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
