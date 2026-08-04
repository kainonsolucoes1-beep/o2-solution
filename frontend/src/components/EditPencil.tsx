import { Pencil } from 'lucide-react'

export default function EditPencil({ onClick, title }: { onClick: () => void; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title ?? 'Editar'}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 6, color: 'var(--text-subtle)', background: 'none', border: 'none', cursor: 'pointer', opacity: 0.7, transition: 'opacity 150ms, color 150ms', flexShrink: 0 }}
      onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = '#3B82F6' }}
      onMouseLeave={e => { e.currentTarget.style.opacity = '0.7'; e.currentTarget.style.color = 'var(--text-subtle)' }}
    >
      <Pencil size={13} />
    </button>
  )
}
