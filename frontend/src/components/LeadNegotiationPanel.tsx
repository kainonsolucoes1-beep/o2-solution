import { Tag } from 'lucide-react'
import SectionCard from './SectionCard'
import EditPencil from './EditPencil'
import EditInput from './EditInput'
import SelectField from './SelectField'
import DateField from './DateField'
import OperadorasField from './OperadorasField'
import PlanField from './PlanField'

function ValorHero({ label }: { label: string }) {
  const empty = label === '—' || label === 'Não informado'
  return (
    <div style={{
      fontSize: 19, fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.01em',
      fontVariantNumeric: 'tabular-nums', color: empty ? 'var(--text-subtle)' : 'var(--text-1)',
    }}>
      {empty ? '—' : label}
    </div>
  )
}

export default function LeadNegotiationPanel({
  perceptionLabel, perceptionStyle,
  modalidade, modalidadeOptions, savingModalidade, onModalidadeChange,
  planoAtual, valorCotacaoLabel,
  operadoras, savingOperadoras, onOperadorasChange,
  editingDetalhes, savingDetalhes, detalhesDraft, onDraftChange, onStartEdit, onCancelEdit, onSaveEdit,
  isAdmin, createdAtValue, savingCreatedAt, onUpdateCreatedAt, locked,
}: {
  perceptionLabel: string | null
  perceptionStyle: { bg: string; color: string } | null
  modalidade: string
  modalidadeOptions: string[]
  savingModalidade: boolean
  onModalidadeChange: (v: string) => void
  planoAtual: string | null
  valorCotacaoLabel: string
  operadoras: string | null
  savingOperadoras: boolean
  onOperadorasChange: (v: string) => void
  editingDetalhes: boolean
  savingDetalhes: boolean
  detalhesDraft: { current_plan: string; value_potential: string }
  onDraftChange: (field: 'current_plan' | 'value_potential', value: string) => void
  onStartEdit: () => void
  onCancelEdit: () => void
  onSaveEdit: () => void
  isAdmin: boolean
  createdAtValue: string
  savingCreatedAt: boolean
  onUpdateCreatedAt: (v: string) => void
  locked?: boolean
}) {
  return (
    <SectionCard title="Negociação" icon={Tag} action={
      locked ? null : editingDetalhes ? (
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancelEdit} style={{ fontSize: 12, color: 'var(--text-subtle)', background: 'none', border: 'none', cursor: 'pointer' }}>
            Cancelar
          </button>
          <button onClick={onSaveEdit} disabled={savingDetalhes} style={{ fontSize: 12, color: '#3B82F6', background: 'none', border: 'none', cursor: savingDetalhes ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
            {savingDetalhes ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      ) : (
        <EditPencil onClick={onStartEdit} title="Editar negociação" />
      )
    }>
      {/* Âncora: valor da cotação + temperatura */}
      {editingDetalhes ? (
        <EditInput label="Valor da Cotação" value={detalhesDraft.value_potential} onChange={v => onDraftChange('value_potential', v)} />
      ) : (
        <ValorHero label={valorCotacaoLabel} />
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 10, fontSize: 13, fontWeight: 600, color: perceptionStyle ? perceptionStyle.color : 'var(--text-subtle)' }}>
        {perceptionLabel && perceptionStyle
          ? <><span style={{ width: 8, height: 8, borderRadius: 999, background: perceptionStyle.color, flexShrink: 0 }} />{perceptionLabel}</>
          : <span style={{ fontWeight: 400 }}>Sem temperatura</span>}
      </div>

      <div style={{ height: 1, background: 'var(--border)', margin: '14px 0' }} />

      <div className="flex flex-col gap-4">
        <SelectField label="Modalidade" value={modalidade} options={modalidadeOptions} saving={savingModalidade || locked} onChange={onModalidadeChange} />

        {editingDetalhes ? (
          <EditInput label="Plano Atual" value={detalhesDraft.current_plan} onChange={v => onDraftChange('current_plan', v)} />
        ) : (
          <PlanField value={planoAtual} />
        )}

        <OperadorasField value={operadoras} saving={savingOperadoras || locked} onChange={onOperadorasChange} />

        {editingDetalhes && isAdmin && (
          <DateField
            label="Data de Criação"
            value={createdAtValue}
            saving={savingCreatedAt}
            onChange={onUpdateCreatedAt}
          />
        )}
      </div>
    </SectionCard>
  )
}
