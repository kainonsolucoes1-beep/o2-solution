import type { ReactNode } from 'react'

type PillTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

const TONES: Record<PillTone, { bg: string; color: string }> = {
  neutral: { bg: 'var(--bg-subtle)', color: 'var(--text-3b)' },
  info:    { bg: 'var(--accent-weak)', color: 'var(--accent)' },
  success: { bg: 'var(--success-weak)', color: 'var(--success)' },
  warning: { bg: 'var(--warning-weak)', color: 'var(--warning)' },
  danger:  { bg: 'var(--danger-weak)', color: 'var(--danger)' },
}

// Badge em formato de cápsula — fundo tonal + texto colorido, sem borda.
// `colors` aceita os objetos {bg,color} de STATUS_STYLE / PERCEPTION_STYLE;
// senão usa um dos tons semânticos.
export default function Pill({ tone, colors, children }: {
  tone?: PillTone
  colors?: { bg: string; color: string }
  children: ReactNode
}) {
  const c = colors ?? TONES[tone ?? 'neutral']
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', alignSelf: 'flex-start',
      background: c.bg, color: c.color,
      padding: '2px 10px', borderRadius: 999,
      fontSize: 12, fontWeight: 600, lineHeight: '18px', whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  )
}
