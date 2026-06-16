import { useEffect } from 'react'
import { X } from 'lucide-react'

interface LeadItem {
  id: string
  name: string
  email: string | null
  phone: string | null
  company: string | null
  attendant: string | null
  origem: string | null
  status: string | null
  value_potential: number | null
  created_at: string
}

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  novo:        { bg: '#EFF6FF', color: '#2563EB' },
  qualificado: { bg: '#F0FDF4', color: '#16A34A' },
  proposta:    { bg: '#FFFBEB', color: '#D97706' },
  fechado:     { bg: '#F3F4F6', color: '#6B7280' },
  convertido:  { bg: '#ECFDF5', color: '#059669' },
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function fmtBRL(n: number | null) {
  if (n == null || n === 0) return '—'
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </span>
      <span style={{ fontSize: 14, color: value === '—' ? '#9CA3AF' : '#1F2937', fontWeight: value === '—' ? 400 : 500 }}>
        {value}
      </span>
    </div>
  )
}

export default function LeadDetailModal({
  lead,
  onClose,
}: {
  lead: LeadItem
  onClose: () => void
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const key = (lead.status ?? 'novo').toLowerCase()
  const s = STATUS_STYLE[key] ?? { bg: '#F3F4F6', color: '#6B7280' }

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 50, padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'white',
          borderRadius: 16,
          width: '100%',
          maxWidth: 520,
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid #F3F4F6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontSize: 16, fontWeight: 700, color: '#1F2937' }}>Detalhe do Lead</span>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#9CA3AF', padding: 4, borderRadius: 6,
              display: 'flex', alignItems: 'center',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 24px' }}>
            <Field label="Nome" value={lead.name} />
            <Field label="Empresa" value={lead.company ?? '—'} />
            <Field label="Email" value={lead.email ?? '—'} />
            <Field label="Telefone" value={lead.phone ?? '—'} />
            <Field label="Origem" value={lead.origem ?? '—'} />
            <Field label="Atendente" value={lead.attendant ?? '—'} />
            <Field label="Valor Potencial" value={fmtBRL(lead.value_potential)} />
            <Field label="Data Criação" value={fmtDate(lead.created_at)} />
          </div>

          {/* Status badge */}
          <div className="flex flex-col gap-1">
            <span style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Status
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignSelf: 'flex-start',
                background: s.bg,
                color: s.color,
                padding: '4px 14px',
                borderRadius: 99,
                fontSize: 13,
                fontWeight: 600,
                textTransform: 'capitalize',
              }}
            >
              {lead.status ?? 'novo'}
            </span>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid #F3F4F6',
            display: 'flex',
            gap: 8,
            justifyContent: 'flex-end',
          }}
        >
          <button
            disabled
            style={{
              padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500,
              border: '1px solid #E5E7EB', background: '#F9FAFB', color: '#9CA3AF',
              cursor: 'not-allowed',
            }}
          >
            Editar Status
          </button>
          <button
            disabled
            style={{
              padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500,
              border: '1px solid #E5E7EB', background: '#F9FAFB', color: '#9CA3AF',
              cursor: 'not-allowed',
            }}
          >
            Adicionar Nota
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500,
              background: '#2563EB', color: 'white', border: 'none', cursor: 'pointer',
            }}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
