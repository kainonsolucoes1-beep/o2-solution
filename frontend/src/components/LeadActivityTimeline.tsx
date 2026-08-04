import type { CSSProperties } from 'react'
import { History, Activity, StickyNote, CalendarClock } from 'lucide-react'
import { statusLabel } from '../utils/statusLabel'
import { fmtDate, fmtDuration } from '../utils/leadFormat'
import { statusColor } from '../utils/leadStatus'
import type { ActivityEvent } from '../pages/LeadDetailPage'
import SectionCard from './SectionCard'

export default function LeadActivityTimeline({
  isAdmin, savingRealign, onRealignHistory,
  noteText, onNoteTextChange, savingNote, onSaveNote,
  loadingActivity, activity,
}: {
  isAdmin: boolean
  savingRealign: boolean
  onRealignHistory: () => void
  noteText: string
  onNoteTextChange: (value: string) => void
  savingNote: boolean
  onSaveNote: () => void
  loadingActivity: boolean
  activity: ActivityEvent[]
}) {
  return (
    <SectionCard title="Atividade" icon={History} action={
      isAdmin && (
        <button
          onClick={onRealignHistory}
          disabled={savingRealign}
          title="Alinha o histórico de status com a Data de Criação, preservando o intervalo entre as etapas"
          style={{ fontSize: 12, color: 'var(--text-subtle)', background: 'none', border: 'none', cursor: savingRealign ? 'not-allowed' : 'pointer', fontWeight: 500 }}
        >
          {savingRealign ? 'Corrigindo…' : 'Corrigir histórico'}
        </button>
      )
    }>
      <div className="flex flex-col gap-3">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <textarea
            value={noteText}
            onChange={e => onNoteTextChange(e.target.value)}
            placeholder="Adicione uma nota..."
            rows={3}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 8,
              border: '1px solid var(--border)', fontSize: 13, color: 'var(--text-2)',
              background: 'var(--bg-input)',
              resize: 'vertical', outline: 'none', fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
            onFocus={e => (e.currentTarget.style.borderColor = '#3B82F6')}
            onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
            <button
              onClick={onSaveNote}
              disabled={savingNote || !noteText.trim()}
              style={{
                background: savingNote || !noteText.trim() ? 'var(--bg-subtle)' : '#2563EB',
                color: savingNote || !noteText.trim() ? 'var(--text-subtle)' : 'white',
                border: 'none', borderRadius: 8,
                padding: '7px 16px', fontSize: 13, fontWeight: 500,
                cursor: savingNote || !noteText.trim() ? 'not-allowed' : 'pointer',
                transition: 'background 150ms',
              }}
            >
              {savingNote ? 'Salvando…' : 'Salvar Nota'}
            </button>
          </div>
        </div>

        {loadingActivity ? (
          <p style={{ fontSize: 13, color: 'var(--text-subtle)' }}>Carregando…</p>
        ) : activity.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-subtle)' }}>Sem atividade registrada.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {activity.map((ev, i) => {
              const isFirst = i === 0
              const rowStyle: CSSProperties = { display: 'flex', gap: 12, paddingTop: isFirst ? 0 : 16, marginTop: isFirst ? 0 : 16, borderTop: isFirst ? 'none' : '1px solid var(--border-lt)' }
              const bubbleStyle = (bg: string): CSSProperties => ({ flexShrink: 0, width: 28, height: 28, borderRadius: 8, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' })

              if (ev.kind === 'status') {
                const c = statusColor(ev.status)
                const isVendaRealizada = statusLabel(ev.status) === 'Venda Realizada'
                return (
                  <div key={`s-${i}`} style={rowStyle}>
                    <div style={bubbleStyle(c.bg)}>
                      <Activity size={13} color={c.color} strokeWidth={2.25} />
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
                        <b style={{ color: 'var(--text-1)', fontWeight: 700 }}>{ev.by ?? 'Sistema'}</b>{' '}
                        {ev.isCreation ? (
                          <>criou o lead como <b style={{ color: c.color, fontWeight: 700 }}>{statusLabel(ev.status)}</b></>
                        ) : (
                          <>moveu para <b style={{ color: c.color, fontWeight: 700 }}>{statusLabel(ev.status)}</b></>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
                        <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>{fmtDate(ev.at)}</span>
                        {!(ev.ongoing && isVendaRealizada) && (
                          <span style={{
                            fontSize: 10.5, fontWeight: 700, color: ev.ongoing ? c.color : 'var(--text-subtle)',
                            background: ev.ongoing ? c.bg : 'var(--bg-hover)', padding: '1px 8px', borderRadius: 99,
                          }}>
                            {fmtDuration(ev.durationMs)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              }
              if (ev.kind === 'note') {
                return (
                  <div key={`n-${i}`} style={rowStyle}>
                    <div style={bubbleStyle('var(--bg-subtle)')}>
                      <StickyNote size={13} color="var(--text-3b)" strokeWidth={2.25} />
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
                        <b style={{ color: 'var(--text-1)', fontWeight: 700 }}>{ev.by}</b> adicionou uma nota
                      </div>
                      <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '6px 0 0', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: 'var(--bg-subtle)', borderRadius: 8, padding: '9px 12px' }}>
                        {ev.content}
                      </p>
                      <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 5 }}>{fmtDate(ev.at)}</div>
                    </div>
                  </div>
                )
              }
              return (
                <div key={`a-${i}`} style={rowStyle}>
                  <div style={bubbleStyle('#EFF6FF')}>
                    <CalendarClock size={13} color="#2563EB" strokeWidth={2.25} />
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
                      <b style={{ color: 'var(--text-1)', fontWeight: 700 }}>{ev.by ?? 'Sistema'}</b> agendou um retorno para{' '}
                      <b style={{ color: '#2563EB', fontWeight: 700 }}>{fmtDate(ev.scheduledAt)}</b>
                      {!ev.active && <span style={{ color: 'var(--text-subtle)', fontStyle: 'normal' }}> (substituído)</span>}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 5 }}>{fmtDate(ev.at)}</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </SectionCard>
  )
}
