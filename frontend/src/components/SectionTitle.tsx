import type { ReactNode } from 'react'

interface SectionTitleProps {
  children: ReactNode
  color?: string
  style?: React.CSSProperties
}

// Titulo de secao compartilhado por Visao Geral e Pipeline -- cor primaria e
// peso semibold por padrao (nao mais cinza claro/leve, que reduzia a
// hierarquia visual da tela). `color` permite sobrepor pra casos de alerta
// real (ex: "Leads Vencidos" em vermelho quando ha' leads vencidos).
export default function SectionTitle({ children, color, style }: SectionTitleProps) {
  return (
    <p
      style={{
        fontSize: 13,
        fontWeight: 600,
        color: color ?? 'var(--text-1)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        margin: 0,
        ...style,
      }}
    >
      {children}
    </p>
  )
}
