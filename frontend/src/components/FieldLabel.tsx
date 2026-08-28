import type { ReactNode } from 'react'

// Rótulo padrão dos campos do painel lateral do lead. Caixa de frase, peso
// leve — recua atrás do valor em vez de competir com ele.
export default function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <span style={{ fontSize: 12, lineHeight: '16px', fontWeight: 500, color: 'var(--text-3b)' }}>
      {children}
    </span>
  )
}
