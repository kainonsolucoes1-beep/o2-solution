import { User } from 'lucide-react'
import SectionCard from './SectionCard'
import EditPencil from './EditPencil'
import Field from './Field'
import EditInput from './EditInput'
import SelectField from './SelectField'

interface InfoDraft {
  name: string
  company: string
  email: string
  phone: string
  attendant: string
  document: string
  visibility_tag: string
}

export default function LeadRegistrationPanel({
  origem, origemOptions, savingOrigem, onOrigemChange,
  conversionPoint, conversionPointOptions, savingConversionPoint, onConversionPointChange,
  leadSinceLabel, documentoLabel, empresaLabel, visibilityTag,
  editingInfo, savingInfo, infoDraft, onDraftChange, onStartEdit, onCancelEdit, onSaveEdit,
}: {
  origem: string
  origemOptions: string[]
  savingOrigem: boolean
  onOrigemChange: (v: string) => void
  conversionPoint: string
  conversionPointOptions: string[]
  savingConversionPoint: boolean
  onConversionPointChange: (v: string) => void
  leadSinceLabel: string
  documentoLabel: string
  empresaLabel: string
  visibilityTag: string | null
  editingInfo: boolean
  savingInfo: boolean
  infoDraft: InfoDraft
  onDraftChange: (field: keyof InfoDraft, value: string) => void
  onStartEdit: () => void
  onCancelEdit: () => void
  onSaveEdit: () => void
}) {
  return (
    <SectionCard title="Cadastro" icon={User} action={
      editingInfo ? (
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancelEdit} style={{ fontSize: 12, color: 'var(--text-subtle)', background: 'none', border: 'none', cursor: 'pointer' }}>
            Cancelar
          </button>
          <button onClick={onSaveEdit} disabled={savingInfo} style={{ fontSize: 12, color: '#3B82F6', background: 'none', border: 'none', cursor: savingInfo ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
            {savingInfo ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      ) : (
        <EditPencil onClick={onStartEdit} title="Editar cadastro" />
      )
    }>
      <div className="flex flex-col gap-4">
        <SelectField label="Origem" value={origem} options={origemOptions} saving={savingOrigem} onChange={onOrigemChange} />
        <SelectField label="Ponto de Conversão" value={conversionPoint} options={conversionPointOptions} saving={savingConversionPoint} onChange={onConversionPointChange} />
        <Field label="Lead desde" value={leadSinceLabel} />
        <Field label="Idade" value="Não informado" />

        {editingInfo ? (
          <>
            <EditInput label="Nome" value={infoDraft.name} onChange={v => onDraftChange('name', v)} />
            <EditInput label="Empresa" value={infoDraft.company} onChange={v => onDraftChange('company', v)} />
            <EditInput label="Email" value={infoDraft.email} onChange={v => onDraftChange('email', v)} />
            <EditInput label="Telefone" value={infoDraft.phone} onChange={v => onDraftChange('phone', v)} />
            <EditInput label="Documento" value={infoDraft.document} onChange={v => onDraftChange('document', v)} />
            <EditInput label="Atendente" value={infoDraft.attendant} onChange={v => onDraftChange('attendant', v)} />
            <EditInput label="Perfil" value={infoDraft.visibility_tag} onChange={v => onDraftChange('visibility_tag', v)} />
          </>
        ) : (
          <>
            <Field label="Empresa" value={empresaLabel} />
            <Field label="Documento" value={documentoLabel} />
            {visibilityTag && <Field label="Perfil" value={visibilityTag} />}
          </>
        )}
      </div>
    </SectionCard>
  )
}
