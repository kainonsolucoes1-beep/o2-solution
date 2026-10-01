import { User, RotateCcw, ChevronDown } from 'lucide-react'
import SectionCard from './SectionCard'
import EditPencil from './EditPencil'
import Field from './Field'
import EditInput from './EditInput'
import SelectField from './SelectField'
import FieldLabel from './FieldLabel'
import { titleCase } from '../utils/leadFormat'

interface InfoDraft {
  name: string
  company: string
  titular_menor: string
  email: string
  phone: string
  attendant: string
  document: string
  visibility_tag: string
}

// aparelhos da empresa: cor -> final do numero
const CELULARES: Record<string, string> = {
  Azul: '7531', Roxo: '4781', Vermelho: '5881', Amarelo: '4070', HBC: '9299',
}

const isEmpty = (v: string) => !v || v === '—' || v === 'Não informado' || v === 'Não definido'

export default function LeadRegistrationPanel({
  origem, origemOptions, savingOrigem, onOrigemChange,
  conversionPoint, conversionPointOptions, savingConversionPoint, onConversionPointChange,
  celularCor, savingCelular, onCelularChange,
  leadSinceLabel, leadSinceRelative, retrabalhadoEmLabel, documentoLabel, empresaLabel, titularMenorLabel, visibilityTag,
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
  celularCor: string
  savingCelular: boolean
  onCelularChange: (v: string) => void
  leadSinceLabel: string
  leadSinceRelative?: string
  retrabalhadoEmLabel?: string | null
  documentoLabel: string
  empresaLabel: string
  titularMenorLabel: string | null
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
    <SectionCard title="Cadastro" icon={User} iconColor="#7C3AED" action={
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
        <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-3b)' }}>
          Lead desde
        </span>
        <span style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.01em', color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }}>
          {leadSinceLabel}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {[leadSinceRelative?.toLowerCase(), origem && !isEmpty(origem) ? titleCase(origem) : null].filter(Boolean).join(' · ')}
        </span>
      </div>
      {retrabalhadoEmLabel && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color: 'var(--warning)', background: 'var(--warning-weak)', borderRadius: 999, padding: '2px 9px', marginTop: 9 }}>
          <RotateCcw size={11} /> Retrabalhado {retrabalhadoEmLabel}
        </span>
      )}

      <div style={{ height: 1, background: 'var(--border)', margin: '14px 0' }} />

      <div className="flex flex-col gap-4">
        <SelectField label="Origem" value={origem} options={origemOptions} saving={savingOrigem || locked} onChange={onOrigemChange} formatOption={titleCase} />
        <SelectField label="Ponto de Conversão" value={conversionPoint} options={conversionPointOptions} saving={savingConversionPoint || locked} onChange={onConversionPointChange} formatOption={titleCase} />

        {editingInfo ? (
          <>
            <EditInput label="Nome" value={infoDraft.name} onChange={v => onDraftChange('name', v)} />
            <EditInput label="Titular Menor" value={infoDraft.titular_menor} onChange={v => onDraftChange('titular_menor', v)} />
            <EditInput label="Empresa" value={infoDraft.company} onChange={v => onDraftChange('company', v)} />
            <EditInput label="Email" value={infoDraft.email} onChange={v => onDraftChange('email', v)} />
            <EditInput label="Telefone" value={infoDraft.phone} onChange={v => onDraftChange('phone', v)} />
            <EditInput label="Documento" value={infoDraft.document} onChange={v => onDraftChange('document', v)} />
            <EditInput label="Atendente" value={infoDraft.attendant} onChange={v => onDraftChange('attendant', v)} />
            <EditInput label="Perfil" value={infoDraft.visibility_tag} onChange={v => onDraftChange('visibility_tag', v)} />
          </>
        ) : (
          <>
            {titularMenorLabel && <Field label="Titular Menor" value={titularMenorLabel} />}
            <div className="flex flex-col gap-1">
              <FieldLabel>Celular{celularCor ? ` - ${celularCor}` : ''}</FieldLabel>
              {/* select nativo invisivel por cima do valor: mostra "7531", abre a lista "Azul · 7531" */}
              <div style={{ position: 'relative', alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 14, lineHeight: '20px', fontWeight: celularCor ? 600 : 400, color: celularCor ? 'var(--text-1)' : 'var(--text-subtle)', fontVariantNumeric: 'tabular-nums' }}>
                  {CELULARES[celularCor] ?? 'Não informado'}
                </span>
                <ChevronDown size={12} color="var(--text-subtle)" />
                <select
                  value={celularCor}
                  onChange={e => onCelularChange(e.target.value)}
                  disabled={savingCelular || locked}
                  title="Celular de origem do lead"
                  style={{ position: 'absolute', inset: 0, opacity: 0, cursor: savingCelular || locked ? 'not-allowed' : 'pointer', width: '100%' }}
                >
                  <option value="">Não informado</option>
                  {Object.entries(CELULARES).map(([cor, final]) => <option key={cor} value={cor}>{cor} · {final}</option>)}
                </select>
              </div>
            </div>
            {!bothEmpty && (
              <>
                <Field label="Empresa" value={empresaLabel} />
                <Field label="Documento" value={documentoLabel} />
              </>
            )}
          </>
        )}
        {!editingInfo && visibilityTag && <Field label="Perfil" value={titleCase(visibilityTag)} />}
      </div>
    </SectionCard>
  )
}
