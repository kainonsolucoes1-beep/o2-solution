import type { RefObject } from 'react'
import { Activity } from 'lucide-react'
import { statusLabel } from '../utils/statusLabel'
import { fmtDate } from '../utils/leadFormat'
import { STATUS_STYLE } from '../utils/leadStatus'
import SectionCard from './SectionCard'
import EditPencil from './EditPencil'

const PERCEPTION_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  'Quente': { bg: 'rgba(220,38,38,0.12)',  color: '#DC2626', label: 'Quente' },
  'Morno':  { bg: 'rgba(217,119,6,0.12)',  color: '#D97706', label: 'Morno' },
  'Frio':   { bg: 'rgba(37,99,235,0.12)',  color: '#2563EB', label: 'Frio' },
}

const STATUS_OPTIONS = [
  { value: 'novo',        label: 'Novo' },
  { value: 'qualificado', label: 'Agendado' },
  { value: 'proposta',    label: 'Proposta' },
  { value: 'fechado',     label: 'Fechado' },
  { value: 'convertido',  label: 'Convertido' },
  { value: 'sale_not_performed', label: 'Perdido' },
]

const CLOSED_SUB_OPTIONS = [
  { value: 'waiting_billing', label: 'Aguardando Faturamento' },
  { value: 'sale_performed',  label: 'Venda Realizada' },
]

const LOST_REASONS = [
  'Cliente não retornou contato',
  'Dados incorretos',
  'Finalizado automaticamente',
  'Preço',
  'Sem interesse',
  'Sem perfil',
  'Sem retorno',
]

export default function LeadNextStepPanel({
  editing, onToggleEditing,
  status, sStyle, editingStatus, statusSubMenu, savingStatus, statusDurationLabel,
  onStatusOptionClick, onClosedSubClick, onLostReasonClick, onBackToStatusOptions, onCancelStatusEdit,
  perception, editingPerception, savingPerception, onPerceptionClick, onCancelPerceptionEdit,
  agendaRef, editingSchedule, scheduleInput, onScheduleInputChange, savingSchedule, loadingSchedules,
  activeSchedule, cancelingSchedule, onSaveSchedule, onCancelScheduleEdit, onRemoveSchedule,
}: {
  editing: boolean
  onToggleEditing: () => void

  status: string
  sStyle: { bg: string; color: string }
  editingStatus: boolean
  statusSubMenu: 'fechado' | 'perdido' | null
  savingStatus: boolean
  statusDurationLabel: string | null
  onStatusOptionClick: (value: string) => void
  onClosedSubClick: (value: string) => void
  onLostReasonClick: (reason: string) => void
  onBackToStatusOptions: () => void
  onCancelStatusEdit: () => void

  perception: string | null
  editingPerception: boolean
  savingPerception: boolean
  onPerceptionClick: (key: string) => void
  onCancelPerceptionEdit: () => void

  agendaRef: RefObject<HTMLDivElement | null>
  editingSchedule: boolean
  scheduleInput: string
  onScheduleInputChange: (value: string) => void
  savingSchedule: boolean
  loadingSchedules: boolean
  activeSchedule: { scheduled_at: string } | undefined
  cancelingSchedule: boolean
  onSaveSchedule: () => void
  onCancelScheduleEdit: () => void
  onRemoveSchedule: () => void
}) {
  return (
    <SectionCard title="Ação Rápida" icon={Activity} action={
      <EditPencil onClick={onToggleEditing} title={editing ? 'Concluir edição' : 'Editar'} />
    }>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">

        <div>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--text-3b)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Status
          </div>
          <div style={{ marginTop: 8 }}>
            {editingStatus ? (
              statusSubMenu === 'fechado' ? (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  {CLOSED_SUB_OPTIONS.map(opt => {
                    const s = STATUS_STYLE[opt.value] ?? { bg: '#F3F4F6', color: '#6B7280' }
                    return (
                      <button
                        key={opt.value}
                        disabled={savingStatus}
                        onClick={() => onClosedSubClick(opt.value)}
                        style={{
                          background: s.bg, color: s.color, border: `1.5px solid ${s.color}`,
                          padding: '4px 14px', borderRadius: 99,
                          fontSize: 13, fontWeight: 600, cursor: savingStatus ? 'not-allowed' : 'pointer',
                          opacity: savingStatus ? 0.6 : 1, transition: 'all 150ms',
                        }}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                  <button
                    onClick={onBackToStatusOptions}
                    style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--text-subtle)', cursor: 'pointer', padding: '4px 8px' }}
                  >
                    Voltar
                  </button>
                </div>
              ) : statusSubMenu === 'perdido' ? (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  {LOST_REASONS.map(reason => {
                    const s = STATUS_STYLE.sale_not_performed
                    return (
                      <button
                        key={reason}
                        disabled={savingStatus}
                        onClick={() => onLostReasonClick(reason)}
                        style={{
                          background: s.bg, color: s.color, border: `1.5px solid ${s.color}`,
                          padding: '4px 14px', borderRadius: 99,
                          fontSize: 13, fontWeight: 600, cursor: savingStatus ? 'not-allowed' : 'pointer',
                          opacity: savingStatus ? 0.6 : 1, transition: 'all 150ms',
                        }}
                      >
                        {reason}
                      </button>
                    )
                  })}
                  <button
                    onClick={onBackToStatusOptions}
                    style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--text-subtle)', cursor: 'pointer', padding: '4px 8px' }}
                  >
                    Voltar
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {STATUS_OPTIONS.map(opt => {
                    const s = STATUS_STYLE[opt.value] ?? { bg: '#F3F4F6', color: '#6B7280' }
                    const active = status === opt.value
                    return (
                      <button
                        key={opt.value}
                        disabled={savingStatus}
                        onClick={() => onStatusOptionClick(opt.value)}
                        style={{
                          background: active ? s.color : s.bg,
                          color: active ? 'white' : s.color,
                          border: `1.5px solid ${s.color}`,
                          padding: '4px 14px', borderRadius: 99,
                          fontSize: 13, fontWeight: 600, cursor: savingStatus ? 'not-allowed' : 'pointer',
                          opacity: savingStatus ? 0.6 : 1,
                          transition: 'all 150ms', textTransform: 'capitalize',
                        }}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                  <button
                    onClick={onCancelStatusEdit}
                    style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--text-subtle)', cursor: 'pointer', padding: '4px 8px' }}
                  >
                    Cancelar
                  </button>
                </div>
              )
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ background: sStyle.bg, color: sStyle.color, padding: '4px 14px', borderRadius: 99, fontSize: 13, fontWeight: 600 }}>
                  {statusLabel(status)}
                </span>
                {statusDurationLabel && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)', background: 'var(--bg-subtle)', padding: '3px 10px', borderRadius: 99, fontVariantNumeric: 'tabular-nums' }}>
                    {statusDurationLabel}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--text-3b)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Temperatura
          </div>
          <div style={{ marginTop: 8 }}>
            {editingPerception ? (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {Object.keys(PERCEPTION_STYLE).map(key => {
                  const s = PERCEPTION_STYLE[key]
                  const active = perception === key
                  return (
                    <button
                      key={key}
                      disabled={savingPerception}
                      onClick={() => onPerceptionClick(key)}
                      style={{
                        background: active ? s.color : s.bg,
                        color: active ? 'white' : s.color,
                        border: `1.5px solid ${s.color}`,
                        padding: '4px 14px', borderRadius: 99,
                        fontSize: 13, fontWeight: 600, cursor: savingPerception ? 'not-allowed' : 'pointer',
                        opacity: savingPerception ? 0.6 : 1,
                        transition: 'all 150ms',
                      }}
                    >
                      {s.label}
                    </button>
                  )
                })}
                <button
                  onClick={onCancelPerceptionEdit}
                  style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--text-subtle)', cursor: 'pointer', padding: '4px 8px' }}
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {perception && PERCEPTION_STYLE[perception] ? (
                  <span style={{ background: PERCEPTION_STYLE[perception].bg, color: PERCEPTION_STYLE[perception].color, padding: '4px 14px', borderRadius: 99, fontSize: 13, fontWeight: 600 }}>
                    {PERCEPTION_STYLE[perception].label}
                  </span>
                ) : (
                  <span style={{ fontSize: 13, color: 'var(--text-subtle)', fontStyle: 'normal' }}>Sem temperatura</span>
                )}
              </div>
            )}
          </div>
        </div>

        <div ref={agendaRef}>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--text-3b)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Agendar
          </div>
          <div style={{ marginTop: 8 }}>
            {editingSchedule ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  type="datetime-local"
                  value={scheduleInput}
                  onChange={e => onScheduleInputChange(e.target.value)}
                  style={{ padding: '6px 9px', height: 34, borderRadius: 8, border: '1px solid var(--border-in)', fontSize: 13, color: 'var(--text-2)', background: 'var(--bg-input)', boxSizing: 'border-box' }}
                />
                <button
                  onClick={onSaveSchedule}
                  disabled={savingSchedule || !scheduleInput}
                  style={{
                    background: savingSchedule || !scheduleInput ? 'var(--bg-subtle)' : '#2563EB',
                    color: savingSchedule || !scheduleInput ? 'var(--text-subtle)' : 'white',
                    border: 'none', borderRadius: 8,
                    padding: '7px 16px', fontSize: 13, fontWeight: 500,
                    cursor: savingSchedule || !scheduleInput ? 'not-allowed' : 'pointer',
                  }}
                >
                  {savingSchedule ? 'Salvando…' : activeSchedule ? 'Reagendar' : 'Agendar'}
                </button>
                <button
                  onClick={onCancelScheduleEdit}
                  style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--text-subtle)', cursor: 'pointer', padding: '4px 8px' }}
                >
                  Cancelar
                </button>
              </div>
            ) : loadingSchedules ? (
              <p style={{ fontSize: 13, color: 'var(--text-subtle)' }}>Carregando…</p>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {activeSchedule ? (
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)' }}>{fmtDate(activeSchedule.scheduled_at)}</span>
                ) : (
                  <span style={{ fontSize: 13, color: 'var(--text-subtle)', fontStyle: 'normal' }}>Nada agendado</span>
                )}
                {activeSchedule && (
                  <button
                    onClick={onRemoveSchedule}
                    disabled={cancelingSchedule}
                    style={{ fontSize: 11.5, color: '#DC2626', background: 'none', border: 'none', cursor: cancelingSchedule ? 'not-allowed' : 'pointer', fontWeight: 500 }}
                  >
                    {cancelingSchedule ? 'Removendo…' : 'Remover'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

      </div>
    </SectionCard>
  )
}
