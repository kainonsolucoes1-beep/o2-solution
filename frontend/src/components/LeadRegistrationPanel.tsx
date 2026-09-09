import { User, RotateCcw } from 'lucide-react'
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

const isEmpty = (v: string) => !v || v === '—' || v === 'Não informado' || v === 'Não definido'

export default function LeadRegistrationPanel({
  origem, origemOptions, savingOrigem, onOrigemChange,
  conversionPoint, conversionPointOptions, savingConversionPoint, onConversionPointChange,
  leadSinceLabel, leadSinceRelative, retrabalhadoEmLabel, documentoLabel, empresaLabel, visibilityTag,
  editingInfo, savingInfo, infoDraft, onDraftChange, onStartEdit, onCancelEdit, onSaveEdit, locked,
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
  leadSinceRelative?: string
  retrabalhadoEmLabel?: string | null
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
  locked?: boolean
}) {
  const bothEmpty = isEmpty(empresaLabel) && isEmpty(documentoLabel)
  return (
    <SectionCard title="Cadastro" icon={User} action={
      locked ? null : editingInfo ? (
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
      {/* Âncora: quando o lead entrou */}
      <div className="flex flex-col" style={{ gap: 4 }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-subtle)' }}>
          Lead desde
        </span>
        <span style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.05, letterSpacing: '-0.01em', color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }}>
          {leadSinceLabel}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {[leadSinceRelative?.toLowerCase(), origem && !isEmpty(origem) ? origem : null].filter(Boolean).join(' · ')}
        </span>
      </div>
      {retrabalhadoEmLabel && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color: 'var(--warning)', background: 'var(--warning-weak)', borderRadius: 999, padding: '2px 9px', marginTop: 9 }}>
          <RotateCcw size={11} /> Retrabalhado {retrabalhadoEmLabel}
        </span>
      )}

      <div style={{ height: 1, background: 'var(--border)', margin: '14px 0' }} />

      <div className="flex flex-col gap-4">
        <SelectField label="Origem" value={origem} options={origemOptions} saving={savingOrigem || locked} onChange={onOrigemChange} />
        <SelectField label="Ponto de Conversão" value={conversionPoint} options={conversionPointOptions} saving={savingConversionPoint || locked} onChange={onConversionPointChange} />

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
        ) : bothEmpty ? (
          <Field label="Empresa · Documento" value="Não informado" />
        ) : (
          <>
            <Field label="Empresa" value={empresaLabel} />
            <Field label="Documento" value={documentoLabel} />
          </>
        )}
        {!editingInfo && visibilityTag && <Field label="Perfil" value={visibilityTag} />}
      </div>
    </SectionCard>
  )
}
