import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { useTheme } from '../ThemeContext'

export default function SectionCard({ title, icon: Icon, iconColor, action, compact, children }: { title?: string; icon?: LucideIcon; iconColor?: string; action?: ReactNode; compact?: boolean; children: ReactNode }) {
  const { dark } = useTheme()
  return (
    <div style={{
      border: `1px solid ${dark ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.04)'}`,
      borderRadius: 10, padding: compact ? '11px 15px' : 16, background: 'var(--bg-card)',
      boxShadow: dark ? '0 1px 2px rgba(0,0,0,0.14)' : '0 1px 2px rgba(15,23,42,0.05)',
    }}>
      {title && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 7, margin: '0 0 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {Icon && (iconColor ? (
              <span style={{ width: 24, height: 24, borderRadius: 7, background: iconColor + '1f', color: iconColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={13} strokeWidth={2} />
              </span>
            ) : (
              <Icon size={13} color="var(--text-3b)" strokeWidth={2} style={{ opacity: 0.7 }} />
            ))}
            <p style={{ fontSize: 13, lineHeight: '16px', fontWeight: 600, color: 'var(--text-3b)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {title}
            </p>
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  )
}
