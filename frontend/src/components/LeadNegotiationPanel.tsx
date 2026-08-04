import { Tag } from 'lucide-react'
import SectionCard from './SectionCard'
import EditPencil from './EditPencil'
import Field from './Field'
import EditInput from './EditInput'
import SelectField from './SelectField'
import DateField from './DateField'
import OperadorasField from './OperadorasField'
import PlanField from './PlanField'

export default function LeadNegotiationPanel({
  perceptionLabel, perceptionStyle,
  modalidade, modalidadeOptions, savingModalidade, onModalidadeChange,
  planoAtual, valorCotacaoLabel,
  operadoras, savingOperadoras, onOperadorasChange,
  editingDetalhes, savingDetalhes, detalhesDraft, onDraftChange, onStartEdit, onCancelEdit, onSaveEdit,
  isAdmin, createdAtValue, savingCreatedAt, onUpdateCreatedAt,
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
}) {
  return (
    <SectionCard title="Negociação" icon={Tag} action={
      editingDetalhes ? (
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
      <div className="flex flex-col gap-4">
        {perceptionLabel && perceptionStyle ? (
          <div className="flex flex-col gap-1">
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.035em' }}>Temperatura</span>
            <span style={{ display: 'inline-flex', alignSelf: 'flex-start', background: perceptionStyle.bg, color: perceptionStyle.color, padding: '2px 10px', borderRadius: 99, fontSize: 12, fontWeight: 700 }}>
              {perceptionLabel}
            </span>
          </div>
        ) : (
          <Field label="Temperatura" value="Sem temperatura" />
        )}

        <SelectField label="Modalidade" value={modalidade} options={modalidadeOptions} saving={savingModalidade} onChange={onModalidadeChange} />

        {editingDetalhes ? (
          <EditInput label="Plano Atual" value={detalhesDraft.current_plan} onChange={v => onDraftChange('current_plan', v)} />
        ) : (
          <PlanField value={planoAtual} />
        )}

        {editingDetalhes ? (
          <EditInput label="Valor da Cotação" value={detalhesDraft.value_potential} onChange={v => onDraftChange('value_potential', v)} />
        ) : (
          <Field label="Valor da Cotação" value={valorCotacaoLabel} />
        )}

        <OperadorasField value={operadoras} saving={savingOperadoras} onChange={onOperadorasChange} />

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
