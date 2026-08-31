import type { RefObject } from 'react'
import { Phone, Mail } from 'lucide-react'
import { fmtDate } from '../utils/leadFormat'
import { STATUS_STYLE, PERCEPTION_STYLE } from '../utils/leadStatus'
import CurrencyInput from './CurrencyInput'

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

function WhatsAppIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.6 6.32A7.85 7.85 0 0 0 12.05 4a7.94 7.94 0 0 0-6.9 11.9L4 20l4.2-1.1a7.9 7.9 0 0 0 3.8 1h.03a7.94 7.94 0 0 0 5.57-13.58zM12.06 18.4h-.02a6.58 6.58 0 0 1-3.36-.92l-.24-.14-2.5.66.67-2.44-.16-.25a6.6 6.6 0 1 1 12.24-3.5 6.56 6.56 0 0 1-6.63 6.6zm3.6-4.94c-.2-.1-1.17-.58-1.35-.64-.18-.07-.31-.1-.45.1-.13.2-.5.64-.62.77-.11.13-.23.15-.42.05-.2-.1-.83-.3-1.58-.97a5.9 5.9 0 0 1-1.1-1.36c-.11-.2 0-.3.09-.4.1-.1.2-.23.3-.35.1-.11.13-.2.2-.32.06-.13.03-.25-.02-.35-.05-.1-.45-1.08-.62-1.48-.16-.4-.33-.33-.45-.34h-.38c-.13 0-.35.05-.53.25s-.7.68-.7 1.66.72 1.93.82 2.06c.1.13 1.4 2.15 3.4 3 .48.2.85.33 1.14.42.48.15.92.13 1.26.08.39-.06 1.17-.48 1.34-.94.16-.46.16-.85.11-.94-.05-.09-.18-.14-.38-.24z"/>
    </svg>
  )
}

const waHref = 'https://app.hbcconecta.com.br/index.html#/atendimentos/chat/'

function actionBtnStyle(enabled: boolean): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 34, padding: '0 12px', borderRadius: 7,
    fontSize: 12, fontWeight: 600, border: '1px solid var(--border-in)', background: 'var(--bg-card)',
    color: 'var(--text-2)', textDecoration: 'none', cursor: enabled ? 'pointer' : 'not-allowed',
    opacity: enabled ? 1 : 0.4, whiteSpace: 'nowrap',
  }
}

const primaryActionBtnStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 34, padding: '0 12px', borderRadius: 7,
  fontSize: 12, fontWeight: 600, border: '1px solid var(--accent)', background: 'var(--accent)',
  color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap',
}

export default function LeadNextStepPanel({
  editing, onToggleEditing, onOpenSchedule, onOpenProposta, onOpenFinalizar,
  telHref, mailHref, locked,
  status, editingStatus, statusSubMenu, savingStatus,
  onStatusOptionClick, onClosedSubClick, onLostReasonClick, onBackToStatusOptions, onCancelStatusEdit,
  onVendaRealizadaClick, onBackToFinalizar,
  perception, editingPerception, savingPerception, onPerceptionClick, onCancelPerceptionEdit,
  agendaRef, editingSchedule, scheduleInput, onScheduleInputChange, savingSchedule, loadingSchedules,
  activeSchedule, cancelingSchedule, onSaveSchedule, onCancelScheduleEdit, onRemoveSchedule,
  editingProposta, propostaValor, onPropostaValorChange, savingProposta, onSaveProposta, onCancelPropostaEdit,
  vendaValor, onVendaValorChange, vendaData, onVendaDataChange, savingVenda, onSaveVenda, faturando, onFaturar,
  showRetrabalhar, onToggleRetrabalhar, retrabalharData, onRetrabalharDataChange, onConfirmRetrabalhar, onCancelRetrabalhar, retrabalhando,
}: {
  editing: boolean
  onToggleEditing: () => void
  onOpenSchedule: () => void
  onOpenProposta: () => void
  onOpenFinalizar: () => void

  telHref: string | null
  mailHref: string | null
  locked?: boolean

  status: string
  editingStatus: boolean
  statusSubMenu: 'fechado' | 'perdido' | 'finalizar' | 'venda_realizada' | null
  savingStatus: boolean
  onStatusOptionClick: (value: string) => void
  onClosedSubClick: (value: string) => void
  onLostReasonClick: (reason: string) => void
  onBackToStatusOptions: () => void
  onCancelStatusEdit: () => void
  onVendaRealizadaClick: () => void
  onBackToFinalizar: () => void

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

  editingProposta: boolean
  propostaValor: string
  onPropostaValorChange: (value: string) => void
  savingProposta: boolean
  onSaveProposta: () => void
  onCancelPropostaEdit: () => void

  vendaValor: string
  onVendaValorChange: (value: string) => void
  vendaData: string
  onVendaDataChange: (value: string) => void
  savingVenda: boolean
  onSaveVenda: () => void
  faturando: boolean
  onFaturar: () => void
  showRetrabalhar: boolean
  onToggleRetrabalhar: () => void
  retrabalharData: string
  onRetrabalharDataChange: (value: string) => void
  onConfirmRetrabalhar: () => void
  onCancelRetrabalhar: () => void
  retrabalhando: boolean
}) {
  return (
    <section style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '20px 22px',
    }}>
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(230px,.7fr)_minmax(0,1.3fr)]" style={{ gap: 20, alignItems: 'center' }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-1)', margin: 0, letterSpacing: '-0.005em' }}>
            Avançar atendimento
          </h3>
          <p style={{ maxWidth: 420, marginTop: 6, color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.5 }}>
            Continue o atendimento a partir das ações abaixo.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:justify-end" style={{ gap: 7 }}>
          {!locked && (
          <button style={primaryActionBtnStyle} onClick={onOpenSchedule}>
            Agendar
          </button>
          )}
          <a href={telHref ?? undefined} style={actionBtnStyle(!!telHref)} onClick={e => { if (!telHref) e.preventDefault() }}>
            <Phone size={14} color={telHref ? 'var(--accent)' : 'currentColor'} /> Ligar
          </a>
          <a href={waHref} target="_blank" rel="noreferrer" style={actionBtnStyle(true)}>
            <span style={{ color: '#25D366', display: 'flex' }}><WhatsAppIcon size={14} /></span> WhatsApp
          </a>
          <a href={mailHref ?? undefined} style={actionBtnStyle(!!mailHref)} onClick={e => { if (!mailHref) e.preventDefault() }}>
            <Mail size={14} /> Enviar e-mail
          </a>
          {locked ? null : status === 'sale_not_performed' ? (
            showRetrabalhar ? (
              <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: 'var(--text-3b)', whiteSpace: 'nowrap' }}>Retrabalhar em:</span>
                <input
                  type="date"
                  value={retrabalharData}
                  onChange={e => onRetrabalharDataChange(e.target.value)}
                  title="Volta pro status Novo e passa a contar como captação nessa data, mantendo o histórico original."
                  style={{ padding: '6px 9px', height: 34, borderRadius: 7, border: '1px solid var(--border-in)', fontSize: 12, color: 'var(--text-2)', background: 'var(--bg-input)', boxSizing: 'border-box' }}
                />
                <button
                  style={{ ...primaryActionBtnStyle, background: 'var(--info)', borderColor: 'var(--info)' }}
                  onClick={onConfirmRetrabalhar}
                  disabled={retrabalhando || !retrabalharData}
                >
                  {retrabalhando ? 'Retrabalhando…' : 'Confirmar'}
                </button>
                <button
                  onClick={onCancelRetrabalhar}
                  style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--text-subtle)', cursor: 'pointer', padding: '4px 8px' }}
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                style={{ ...primaryActionBtnStyle, background: 'var(--info)', borderColor: 'var(--info)' }}
                onClick={onToggleRetrabalhar}
              >
                Retrabalhar lead
              </button>
            )
          ) : (
            <>
              <button style={actionBtnStyle(true)} onClick={onOpenProposta}>
                Enviar proposta
              </button>
              {status === 'waiting_billing' ? (
                <button style={primaryActionBtnStyle} onClick={onFaturar} disabled={faturando}>
                  {faturando ? 'Faturando…' : 'Faturar'}
                </button>
              ) : (
                <button style={actionBtnStyle(true)} onClick={onOpenFinalizar}>
                  Finalizar atendimento
                </button>
              )}
            </>
          )}
          {!locked && (
            <button style={actionBtnStyle(true)} onClick={onToggleEditing}>
              {editing ? 'Concluir edição' : 'Editar ação rápida'}
            </button>
          )}
        </div>
      </div>

      {editing && (
      <div style={{ borderTop: '1px solid var(--border-lt)', marginTop: 18, paddingTop: 15 }}>
      <div className="flex flex-col sm:flex-row sm:flex-wrap" style={{ gap: 18 }}>

        {editingProposta && (
        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3b)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Valor da proposta
          </div>
          <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <CurrencyInput value={propostaValor} onChange={onPropostaValorChange} autoFocus />
            <button
              onClick={onSaveProposta}
              disabled={savingProposta || !propostaValor}
              style={{
                background: savingProposta || !propostaValor ? 'var(--bg-subtle)' : 'var(--accent)',
                color: savingProposta || !propostaValor ? 'var(--text-subtle)' : 'white',
                border: 'none', borderRadius: 8,
                padding: '7px 16px', fontSize: 13, fontWeight: 500,
                cursor: savingProposta || !propostaValor ? 'not-allowed' : 'pointer',
              }}
            >
              {savingProposta ? 'Salvando…' : 'Registrar'}
            </button>
            <button
              onClick={onCancelPropostaEdit}
              style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--text-subtle)', cursor: 'pointer', padding: '4px 8px' }}
            >
              Cancelar
            </button>
          </div>
        </div>
        )}

        {editingStatus && (
        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3b)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Status
          </div>
          <div style={{ marginTop: 8 }}>
            {statusSubMenu === 'finalizar' ? (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button
                    onClick={onVendaRealizadaClick}
                    style={{
                      background: STATUS_STYLE.sale_performed.bg, color: STATUS_STYLE.sale_performed.color,
                      border: `1.5px solid ${STATUS_STYLE.sale_performed.color}`,
                      padding: '4px 14px', borderRadius: 99, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    Venda realizada
                  </button>
                  <button
                    onClick={() => onStatusOptionClick('sale_not_performed')}
                    style={{
                      background: STATUS_STYLE.sale_not_performed.bg, color: STATUS_STYLE.sale_not_performed.color,
                      border: `1.5px solid ${STATUS_STYLE.sale_not_performed.color}`,
                      padding: '4px 14px', borderRadius: 99, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    Venda não realizada
                  </button>
                  <button
                    onClick={onCancelStatusEdit}
                    style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--text-subtle)', cursor: 'pointer', padding: '4px 8px' }}
                  >
                    Cancelar
                  </button>
                </div>
              ) : statusSubMenu === 'venda_realizada' ? (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <CurrencyInput value={vendaValor} onChange={onVendaValorChange} autoFocus />
                  <input
                    type="date"
                    value={vendaData}
                    onChange={e => onVendaDataChange(e.target.value)}
                    style={{ padding: '6px 9px', height: 34, borderRadius: 8, border: '1px solid var(--border-in)', fontSize: 13, color: 'var(--text-2)', background: 'var(--bg-input)', boxSizing: 'border-box' }}
                  />
                  <button
                    onClick={onSaveVenda}
                    disabled={savingVenda || !vendaValor || !vendaData}
                    style={{
                      background: savingVenda || !vendaValor || !vendaData ? 'var(--bg-subtle)' : 'var(--accent)',
                      color: savingVenda || !vendaValor || !vendaData ? 'var(--text-subtle)' : 'white',
                      border: 'none', borderRadius: 8,
                      padding: '7px 16px', fontSize: 13, fontWeight: 500,
                      cursor: savingVenda || !vendaValor || !vendaData ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {savingVenda ? 'Salvando…' : 'Confirmar'}
                  </button>
                  <button
                    onClick={onBackToFinalizar}
                    style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--text-subtle)', cursor: 'pointer', padding: '4px 8px' }}
                  >
                    Voltar
                  </button>
                  <button
                    onClick={onCancelStatusEdit}
                    style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--text-subtle)', cursor: 'pointer', padding: '4px 8px' }}
                  >
                    Cancelar
                  </button>
                </div>
              ) : statusSubMenu === 'fechado' ? (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  {CLOSED_SUB_OPTIONS.map(opt => {
                    const s = STATUS_STYLE[opt.value] ?? { bg: 'var(--bg-subtle)', color: 'var(--text-muted)' }
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
                    const s = STATUS_STYLE[opt.value] ?? { bg: 'var(--bg-subtle)', color: 'var(--text-muted)' }
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
              )}
          </div>
        </div>
        )}

        {editingPerception && (
        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3b)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Temperatura
          </div>
          <div style={{ marginTop: 8 }}>
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
          </div>
        </div>
        )}

        {editingSchedule && (
        <div ref={agendaRef} style={{ flex: '1 1 200px', minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3b)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Agendar
          </div>
          <div style={{ marginTop: 8 }}>
            {loadingSchedules ? (
              <p style={{ fontSize: 13, color: 'var(--text-subtle)' }}>Carregando…</p>
            ) : (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {activeSchedule && (
                  <span style={{ fontSize: 12, color: 'var(--text-subtle)', width: '100%' }}>
                    Agendado para {fmtDate(activeSchedule.scheduled_at)}
                  </span>
                )}
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
                    background: savingSchedule || !scheduleInput ? 'var(--bg-subtle)' : 'var(--accent)',
                    color: savingSchedule || !scheduleInput ? 'var(--text-subtle)' : 'white',
                    border: 'none', borderRadius: 8,
                    padding: '7px 16px', fontSize: 13, fontWeight: 500,
                    cursor: savingSchedule || !scheduleInput ? 'not-allowed' : 'pointer',
                  }}
                >
                  {savingSchedule ? 'Salvando…' : activeSchedule ? 'Reagendar' : 'Agendar'}
                </button>
                {activeSchedule && (
                  <button
                    onClick={onRemoveSchedule}
                    disabled={cancelingSchedule}
                    style={{ fontSize: 11.5, color: 'var(--danger)', background: 'none', border: 'none', cursor: cancelingSchedule ? 'not-allowed' : 'pointer', fontWeight: 500 }}
                  >
                    {cancelingSchedule ? 'Removendo…' : 'Remover'}
                  </button>
                )}
                <button
                  onClick={onCancelScheduleEdit}
                  style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--text-subtle)', cursor: 'pointer', padding: '4px 8px' }}
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>
        </div>
        )}

      </div>
      </div>
      )}
    </section>
  )
}
