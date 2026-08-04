import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { useTheme } from '../ThemeContext'

export default function SectionCard({ title, icon: Icon, action, compact, children }: { title?: string; icon?: LucideIcon; action?: ReactNode; compact?: boolean; children: ReactNode }) {
  const { dark } = useTheme()
  return (
    <div style={{
      border: `1px solid ${dark ? 'rgba(255,255,255,0.05)' : 'rgba(15,23,42,0.04)'}`,
      borderRadius: 10, padding: compact ? '11px 15px' : 16, background: 'var(--bg-card)',
      boxShadow: dark ? '0 1px 2px rgba(0,0,0,0.14)' : '0 1px 2px rgba(15,23,42,0.05)',
    }}>
      {title && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 7, margin: '0 0 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            {Icon && <Icon size={13} color="var(--text-3b)" strokeWidth={2} style={{ opacity: 0.6 }} />}
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', margin: 0, letterSpacing: '-0.005em' }}>
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
