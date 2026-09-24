import { useState, type CSSProperties, type ReactNode } from 'react'
import { Activity, StickyNote, CalendarClock, Pencil } from 'lucide-react'
import { statusLabel } from '../utils/statusLabel'
import { fmtDate, fmtDuration } from '../utils/leadFormat'
import { statusColor } from '../utils/leadStatus'
import type { ActivityEvent, ActivityFilter, Me } from '../pages/LeadDetailPage'

const FILTERS: ActivityFilter[] = ['Todos', 'Status', 'Notas']

export default function LeadActivityTimeline({
  isAdmin, savingRealign, onRealignHistory,
  noteText, onNoteTextChange, savingNote, onSaveNote,
  me, isCoordenador, savingNoteEdit, onSaveNoteEdit,
  loadingActivity, activity, filter, onFilterChange, locked, lostReason,
}: {
  isAdmin: boolean
  savingRealign: boolean
  onRealignHistory: () => void
  noteText: string
  onNoteTextChange: (value: string) => void
  savingNote: boolean
  onSaveNote: () => void
  me: Me | null
  isCoordenador: boolean
  savingNoteEdit: boolean
  onSaveNoteEdit: (noteId: string, content: string) => Promise<void>
  loadingActivity: boolean
  activity: ActivityEvent[]
  filter: ActivityFilter
  onFilterChange: (value: ActivityFilter) => void
  locked?: boolean
  lostReason?: string | null
}) {
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')

  function startEdit(noteId: string, content: string) {
    setEditingNoteId(noteId)
    setEditDraft(content)
  }
  function cancelEdit() {
    setEditingNoteId(null)
    setEditDraft('')
  }
  function confirmEdit(noteId: string) {
    const content = editDraft.trim()
    if (!content) return
    onSaveNoteEdit(noteId, content).then(() => { setEditingNoteId(null); setEditDraft('') }).catch(() => {})
  }
  return (
    <section className="min-h-0 sm:min-h-[650px]" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12 }}>
      <div style={{ minHeight: 82, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 18, padding: '18px 20px' }}>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)', margin: 0, letterSpacing: '-0.005em' }}>Atividade</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>Eventos organizados do mais recente ao mais antigo</p>
        </div>
        {isAdmin && (
          <button
            onClick={onRealignHistory}
            disabled={savingRealign}
            title="Alinha o histórico de status com a Data de Criação, preservando o intervalo entre as etapas"
            style={{ fontSize: 12, color: 'var(--text-subtle)', background: 'none', border: 'none', cursor: savingRealign ? 'not-allowed' : 'pointer', fontWeight: 500, flexShrink: 0 }}
          >
            {savingRealign ? 'Corrigindo…' : 'Corrigir histórico'}
          </button>
        )}
      </div>
      <div className="flex flex-col gap-3" style={{ padding: '0 20px 22px' }}>
        {!locked && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, border: '1px solid var(--border-lt)', borderRadius: 8, padding: 14, background: 'var(--bg-subtle)' }}>
          <textarea
            value={noteText}
            onChange={e => onNoteTextChange(e.target.value)}
            placeholder="Adicione uma nota..."
            rows={3}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 7,
              border: '1px solid var(--border-in)', fontSize: 12.5, color: 'var(--text-2)',
              background: 'var(--bg-input)',
              resize: 'vertical', outline: 'none', fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
            onFocus={e => (e.currentTarget.style.borderColor = '#3B82F6')}
            onBlur={e => (e.currentTarget.style.borderColor = 'var(--border-in)')}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
            <button
              onClick={onSaveNote}
              disabled={savingNote || !noteText.trim()}
              style={{
                background: savingNote || !noteText.trim() ? 'var(--bg-subtle)' : '#2563EB',
                color: savingNote || !noteText.trim() ? 'var(--text-subtle)' : 'white',
                border: 'none', borderRadius: 7,
                padding: '7px 16px', fontSize: 12.5, fontWeight: 500,
                cursor: savingNote || !noteText.trim() ? 'not-allowed' : 'pointer',
                transition: 'background 150ms',
              }}
            >
              {savingNote ? 'Salvando…' : 'Salvar Nota'}
            </button>
          </div>
        </div>
        )}

        <div style={{ display: 'flex', gap: 4, paddingBottom: 10, borderBottom: '1px solid var(--border-lt)' }}>
          {FILTERS.map(f => (
            <button
              key={f}
              onClick={() => onFilterChange(f)}
              style={{
                minHeight: 28, padding: '0 10px', borderRadius: 6, border: 'none',
                background: filter === f ? '#EAF2FF' : 'transparent',
                color: filter === f ? '#245BB9' : 'var(--text-muted)',
                fontSize: 11, fontWeight: filter === f ? 600 : 500, cursor: 'pointer',
              }}
            >
              {f}
            </button>
          ))}
        </div>

        {loadingActivity ? (
          <p style={{ fontSize: 13, color: 'var(--text-subtle)' }}>Carregando…</p>
        ) : activity.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-subtle)' }}>Sem atividade registrada.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {activity.map((ev, i) => {
              const isFirst = i === 0
              const isLast = i === activity.length - 1
              const rowStyle: CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 12, marginTop: isFirst ? 0 : 14 }
              const cardStyle: CSSProperties = { minWidth: 0, flex: 1, border: '1px solid var(--border-lt)', borderRadius: 9, padding: 15 }
              const bubbleStyle = (bg: string): CSSProperties => ({ flexShrink: 0, width: 32, height: 32, borderRadius: '50%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' })
              const rail = (bg: string, icon: ReactNode) => (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 32, flexShrink: 0 }}>
                  <div style={bubbleStyle(bg)}>{icon}</div>
                  {!isLast && <div style={{ flex: 1, width: 2, minHeight: 12, marginTop: 6, background: 'var(--border-in)' }} />}
                </div>
              )

              if (ev.kind === 'status') {
                const c = statusColor(ev.status)
                const isVendaRealizada = statusLabel(ev.status) === 'Venda Realizada'
                return (
                  <div key={`s-${i}`} style={rowStyle}>
                    {rail(c.bg, <Activity size={15} color={c.color} strokeWidth={2.25} />)}
                    <div style={cardStyle}>
                      <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
                        <b style={{ color: 'var(--text-1)', fontWeight: 700 }}>{ev.by ?? 'Sistema'}</b>{' '}
                        {ev.isCreation ? (
                          <>criou o lead como <b style={{ color: c.color, fontWeight: 700 }}>{statusLabel(ev.status)}</b></>
                        ) : (
                          <>moveu para <b style={{ color: c.color, fontWeight: 700 }}>{statusLabel(ev.status)}</b></>
                        )}
                        {ev.status === 'sale_not_performed' && ev.ongoing && lostReason && (
                          <> — <b style={{ color: c.color, fontWeight: 700 }}>{lostReason}</b></>
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
                const canEdit = !locked && !!me && (me.id === ev.userId || isAdmin || isCoordenador)
                const isEditingThis = editingNoteId === ev.id
                return (
                  <div key={`n-${i}`} style={rowStyle}>
                    {rail('var(--bg-subtle)', <StickyNote size={15} color="var(--text-3b)" strokeWidth={2.25} />)}
                    <div style={cardStyle}>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
                          <b style={{ color: 'var(--text-1)', fontWeight: 700 }}>{ev.by}</b> adicionou uma nota
                        </div>
                        {canEdit && !isEditingThis && (
                          <button
                            onClick={() => startEdit(ev.id, ev.content)}
                            title="Editar nota"
                            style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: 'var(--text-subtle)', cursor: 'pointer', fontSize: 11.5, fontWeight: 600, flexShrink: 0, padding: 0 }}
                          >
                            <Pencil size={12} /> Editar
                          </button>
                        )}
                      </div>
                      {isEditingThis ? (
                        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <textarea
                            value={editDraft}
                            onChange={e => setEditDraft(e.target.value)}
                            rows={3}
                            autoFocus
                            style={{
                              width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--border-in)',
                              fontSize: 13, color: 'var(--text-2)', background: 'var(--bg-input)',
                              resize: 'vertical', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                            }}
                          />
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button
                              onClick={() => confirmEdit(ev.id)}
                              disabled={savingNoteEdit || !editDraft.trim()}
                              style={{ padding: '6px 14px', borderRadius: 7, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: savingNoteEdit ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
                            >
                              {savingNoteEdit ? 'Salvando…' : 'Salvar'}
                            </button>
                            <button
                              onClick={cancelEdit}
                              disabled={savingNoteEdit}
                              style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid var(--border-in)', background: 'none', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '6px 0 0', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: 'var(--bg-subtle)', borderRadius: 8, padding: '9px 12px' }}>
                          {ev.content}
                        </p>
                      )}
                      <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 5, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {fmtDate(ev.at)}
                        {ev.editedAt && (
                          <span title={`Editado por ${ev.editedBy ?? '—'} em ${fmtDate(ev.editedAt)}`} style={{ fontStyle: 'italic', color: 'var(--text-subtle)' }}>
                            · editado
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              }
              return (
                <div key={`a-${i}`} style={rowStyle}>
                  {rail('#EFF6FF', <CalendarClock size={15} color="#2563EB" strokeWidth={2.25} />)}
                  <div style={cardStyle}>
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
    </section>
  )
}
