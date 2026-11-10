import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import api from '../api'
import { parseUTC } from '../utils/date'
import { statusLabel } from '../utils/statusLabel'
import { useTheme } from '../ThemeContext'

interface AgendaItem {
  id: string
  name: string
  email: string | null
  phone: string | null
  company: string | null
  attendant: string | null
  origem: string | null
  conversion_point: string | null
  status: string | null
  perception: string | null
  value_potential: number | null
  current_plan: string | null
  created_at: string
  followize_id: number | null
  scheduled_at: string
  schedule_id: string
}

const WEEKDAYS = ['Dom.', 'Seg.', 'Ter.', 'Qua.', 'Qui.', 'Sex.', 'Sáb.']
const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const STATUS_DOT: Record<string, string> = {
  novo: '#3B82F6', new: '#3B82F6', pending: '#3B82F6', aguardando_dados: '#6366F1', sem_retorno: 'var(--status-sem-retorno)',
  // Agendado em rosa (10/11/2026): o verde se confundia com Fechado
  qualificado: '#EC4899', qualified: '#EC4899', scheduled: '#EC4899', agendado: '#EC4899',
  proposta: '#F59E0B', proposal_sent: '#F59E0B', 'proposal sent': '#F59E0B',
  negociacao: '#8B5CF6', negociação: '#8B5CF6',
  pendencia: '#D97706', documentacao_pendente: '#DB2777', emissao: '#0891B2',
  waiting_billing: '#059669', fechado: '#059669', closed: '#059669',
  won: '#059669', convertido: '#059669', sale_performed: '#059669', 'sale performed': '#059669',
  sale_not_performed: '#EF4444', 'sale not performed': '#EF4444',
}
const LEGEND = [
  { status: 'novo', label: 'Novo' },
  { status: 'qualificado', label: 'Agendado' },
  { status: 'proposta', label: 'Proposta enviada' },
  { status: 'negociacao', label: 'Negociação' },
  { status: 'fechado', label: 'Fechado' },
]
const OVERDUE = '#DC2626'

function dotColor(status: string | null) {
  if (!status) return '#9CA3AF'
  return STATUS_DOT[status.toLowerCase()] ?? '#9CA3AF'
}

const MAX_VISIBLE = 3
// Semana (modelo B aprovado em 10/11/2026): grade hora x dia. Cada hora é uma
// linha que cresce pra caber TODOS os agendamentos daquela hora (sem resumo
// "N agendamentos" -- pedido dela: ver tudo de cada dia).
const ROW_MIN = 52
const DAY_START = 8
const DAY_END = 19

function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function startOfWeek(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)) // segunda-feira
  return x
}
function addDays(d: Date, n: number) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}
function fmtTime(iso: string) {
  return new Date(parseUTC(iso)).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
const tint = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, var(--bg-card, #fff))`

type View = 'semana' | 'mes'

export default function Agenda() {
  const navigate = useNavigate()
  const { dark } = useTheme()
  const [view, setView] = useState<View>('semana')
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d })
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [items, setItems] = useState<AgendaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [popover, setPopover] = useState<{ title: string; items: AgendaItem[] } | null>(null)
  const [atendente, setAtendente] = useState('')
  const [now, setNow] = useState(() => Date.now())

  // linha do "agora" e marcação de vencido acompanham o relógio
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    let cancelled = false
    const from = view === 'mes' ? new Date(cursor.getFullYear(), cursor.getMonth(), 1) : weekStart
    const to = view === 'mes' ? new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0) : addDays(weekStart, 6)
    setLoading(true)
    api.get<{ items: AgendaItem[] }>('/api/v1/agenda', { params: { date_from: dateKey(from), date_to: dateKey(to) } })
      .then(r => { if (!cancelled) setItems(r.data.items) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [view, cursor, weekStart])

  useEffect(() => {
    if (!popover) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setPopover(null) }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [popover])

  const atendentes = useMemo(
    () => Array.from(new Set(items.map(i => (i.attendant || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [items],
  )
  const filtered = useMemo(
    () => items
      .filter(i => !atendente || (i.attendant || '').trim() === atendente)
      .sort((a, b) => parseUTC(a.scheduled_at) - parseUTC(b.scheduled_at)),
    [items, atendente],
  )

  const byDay = useMemo(() => {
    const map: Record<string, AgendaItem[]> = {}
    for (const it of filtered) {
      const day = dateKey(new Date(parseUTC(it.scheduled_at)))
      if (!map[day]) map[day] = []
      map[day].push(it)
    }
    return map
  }, [filtered])

  const weeks = useMemo(() => {
    const year = cursor.getFullYear()
    const month = cursor.getMonth()
    const firstDay = new Date(year, month, 1)
    const totalDays = new Date(year, month + 1, 0).getDate()
    const cells: (Date | null)[] = Array(firstDay.getDay()).fill(null)
    for (let d = 1; d <= totalDays; d++) cells.push(new Date(year, month, d))
    while (cells.length % 7 !== 0) cells.push(null)
    const rows: (Date | null)[][] = []
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7))
    return rows
  }, [cursor])

  const today = new Date(now)
  const todayKey = dateKey(today)
  const isOverdue = (it: AgendaItem) => parseUTC(it.scheduled_at) < now

  // semana: seg–sex sempre; sábado e domingo só aparecem se tiverem agendamento
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).filter((d, i) => i < 5 || (byDay[dateKey(d)]?.length ?? 0) > 0),
    [weekStart, byDay],
  )
  const [hStart, hEnd] = useMemo(() => {
    let lo = DAY_START, hi = DAY_END
    for (const d of weekDays) for (const it of byDay[dateKey(d)] ?? []) {
      const h = new Date(parseUTC(it.scheduled_at)).getHours()
      lo = Math.min(lo, h)
      hi = Math.max(hi, h + 1)
    }
    return [lo, hi]
  }, [weekDays, byDay])

  function goPrev() {
    if (view === 'mes') setCursor(c => new Date(c.getFullYear(), c.getMonth() - 1, 1))
    else setWeekStart(w => addDays(w, -7))
  }
  function goNext() {
    if (view === 'mes') setCursor(c => new Date(c.getFullYear(), c.getMonth() + 1, 1))
    else setWeekStart(w => addDays(w, 7))
  }
  function goToday() {
    const d = new Date()
    setWeekStart(startOfWeek(d))
    d.setDate(1)
    setCursor(d)
  }

  const weekEnd = addDays(weekStart, 6)
  const title = view === 'mes'
    ? `${MONTHS[cursor.getMonth()]} de ${cursor.getFullYear()}`
    : weekStart.getMonth() === weekEnd.getMonth()
      ? `${weekStart.getDate()} a ${weekEnd.getDate()} de ${MONTHS[weekEnd.getMonth()].toLowerCase()} de ${weekEnd.getFullYear()}`
      : `${weekStart.getDate()} de ${MONTHS[weekStart.getMonth()].toLowerCase()} a ${weekEnd.getDate()} de ${MONTHS[weekEnd.getMonth()].toLowerCase()}`

  const navBtn: React.CSSProperties = { width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }
  const gridCols = `52px repeat(${weekDays.length}, minmax(0, 1fr))`

  function weekBlock(it: AgendaItem) {
    const c = dotColor(it.status)
    const late = isOverdue(it)
    return (
      <button
        key={it.schedule_id}
        onClick={() => navigate(`/leads/${it.id}`)}
        title={`${statusLabel(it.status)}${late ? ' · vencido' : ''} · ${it.name}${it.attendant ? ` · ${it.attendant}` : ''}`}
        style={{
          display: 'block', width: '100%', borderRadius: 6, border: 'none', borderLeft: `3px solid ${c}`,
          background: tint(c, dark ? 22 : 13), color: 'var(--text-1)', textAlign: 'left', padding: '4px 6px',
          cursor: 'pointer', overflow: 'hidden', fontSize: 11.5, lineHeight: 1.3, whiteSpace: 'nowrap', textOverflow: 'ellipsis',
          outline: late ? `1.5px dashed ${OVERDUE}` : undefined, outlineOffset: -1.5,
        }}
      >
        <b style={{ color: late ? OVERDUE : 'var(--text-2)', fontVariantNumeric: 'tabular-nums' }}>{fmtTime(it.scheduled_at)}</b>{' '}{it.name}
      </button>
    )
  }

  function renderWeek() {
    const hours = Array.from({ length: hEnd - hStart }, (_, i) => hStart + i)
    const weekHasToday = weekDays.some(d => dateKey(d) === todayKey)
    const nowHour = today.getHours()
    const dayBorder = '1px solid var(--border)'
    return (
      <>
        <div style={{ display: 'grid', gridTemplateColumns: gridCols, borderBottom: '2px solid var(--border)', background: 'var(--bg-subtle)' }}>
          <div />
          {weekDays.map(d => {
            const k = dateKey(d)
            const list = byDay[k] ?? []
            const late = list.filter(isOverdue).length
            const isToday = k === todayKey
            return (
              <div key={k} style={{ padding: '9px 6px', textAlign: 'center', borderLeft: dayBorder, background: isToday ? tint('#2563EB', 8) : undefined }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{WEEKDAYS[d.getDay()]}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: isToday ? '#2563EB' : 'var(--text-1)', lineHeight: 1.3 }}>
                  {isToday
                    ? <span style={{ display: 'inline-flex', width: 28, height: 28, borderRadius: '50%', background: '#2563EB', color: '#fff', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>{d.getDate()}</span>
                    : d.getDate()}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-subtle)' }}>
                  {list.length ? `${list.length} agend.` : '—'}
                  {late > 0 && <span style={{ color: OVERDUE, fontWeight: 700 }}> · {late} vencido{late > 1 ? 's' : ''}</span>}
                </div>
              </div>
            )
          })}
        </div>
        <div style={{ maxHeight: 720, overflowY: 'auto' }}>
          {hours.map(h => {
            const nowRow = weekHasToday && nowHour === h
            return (
              <div key={h} style={{ display: 'grid', gridTemplateColumns: gridCols, borderTop: dayBorder }}>
                <div style={{ fontSize: 11, color: nowRow ? '#2563EB' : 'var(--text-subtle)', fontWeight: nowRow ? 800 : 600, textAlign: 'right', padding: '7px 8px 0 0', fontVariantNumeric: 'tabular-nums' }}>
                  {String(h).padStart(2, '0')}:00
                </div>
                {weekDays.map(d => {
                  const k = dateKey(d)
                  const isToday = k === todayKey
                  const list = (byDay[k] ?? []).filter(it => new Date(parseUTC(it.scheduled_at)).getHours() === h)
                  return (
                    <div
                      key={k}
                      style={{
                        position: 'relative', borderLeft: dayBorder, minHeight: ROW_MIN, padding: 4, minWidth: 0,
                        display: 'flex', flexDirection: 'column', gap: 3,
                        background: isToday ? tint('#2563EB', 4) : undefined,
                      }}
                    >
                      {list.map(weekBlock)}
                      {isToday && nowHour === h && (
                        <div style={{ position: 'absolute', left: 0, right: 0, top: `${(today.getMinutes() / 60) * 100}%`, height: 2, background: '#2563EB', zIndex: 2, pointerEvents: 'none' }}>
                          <span style={{ position: 'absolute', left: -4, top: -3, width: 8, height: 8, borderRadius: '50%', background: '#2563EB' }} />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </>
    )
  }

  function renderMonth() {
    return (
      <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: 'var(--bg-subtle)' }}>
          {WEEKDAYS.map(w => (
            <div key={w} style={{ padding: '10px 12px', fontSize: 10.5, fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>
              {w}
            </div>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
            {week.map((day, di) => {
              const dKey = day ? dateKey(day) : null
              const dayItems = dKey ? (byDay[dKey] ?? []) : []
              const isToday = dKey === todayKey
              const visible = dayItems.slice(0, MAX_VISIBLE)
              const hiddenCount = dayItems.length - visible.length
              return (
                <div
                  key={di}
                  style={{
                    minHeight: 120, padding: 8,
                    borderRight: di < 6 ? '1px solid var(--border)' : 'none',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex', flexDirection: 'column', gap: 4,
                    background: !day ? 'var(--bg-hover)' : undefined,
                    opacity: !day ? 0.4 : 1,
                    boxShadow: isToday ? 'inset 0 0 0 1.5px #93C5FD' : undefined,
                  }}
                >
                  {day && (
                    isToday ? (
                      <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#2563EB', color: '#fff', fontWeight: 800, fontSize: 11.5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {day.getDate()}
                      </span>
                    ) : (
                      <span style={{ fontSize: 11.5, color: 'var(--text-2)', fontWeight: 700 }}>{day.getDate()}</span>
                    )
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {visible.map(it => {
                      const overdue = isOverdue(it)
                      return (
                        <button
                          key={it.schedule_id}
                          onClick={() => navigate(`/leads/${it.id}`)}
                          title={`${statusLabel(it.status)}${overdue ? ' · vencido' : ''} · ${it.name}`}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 5, textAlign: 'left', fontSize: 10.5,
                            background: 'var(--bg-hover)', color: 'var(--text-2)',
                            padding: '3px 6px', borderRadius: 6, cursor: 'pointer', border: 'none', overflow: 'hidden',
                            outline: overdue ? `1px dashed ${OVERDUE}` : undefined, outlineOffset: -1,
                          }}
                        >
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor(it.status), flexShrink: 0 }} />
                          <span style={{ fontSize: 10, color: overdue ? OVERDUE : 'var(--text-subtle)', fontWeight: 700, flexShrink: 0 }}>{fmtTime(it.scheduled_at)}</span>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name}</span>
                        </button>
                      )
                    })}
                    {hiddenCount > 0 && day && (
                      <button
                        onClick={() => setPopover({ title: `${day.getDate()} de ${MONTHS[day.getMonth()].toLowerCase()}`, items: dayItems })}
                        style={{ fontSize: 10, fontWeight: 700, color: '#1D4ED8', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', textAlign: 'left', borderRadius: 4 }}
                      >
                        +{hiddenCount} mais
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </>
    )
  }

  return (
    <main className="px-4 md:px-8 xl:px-12 py-6 flex flex-col gap-6" style={{ background: dark ? 'transparent' : '#EEF1F5', minHeight: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-2)' }}>Agenda / Calendário</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>Leads agendados por data</p>
        </div>
      </div>

      <div className="bg-white rounded-xl" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '14px 20px', borderBottom: '1px solid var(--border-lt)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={goPrev} aria-label={view === 'mes' ? 'Mês anterior' : 'Semana anterior'} style={navBtn}><ChevronLeft size={16} /></button>
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-1)', minWidth: 200, textAlign: 'center' }}>{title}</span>
            <button onClick={goNext} aria-label={view === 'mes' ? 'Próximo mês' : 'Próxima semana'} style={navBtn}><ChevronRight size={16} /></button>
            <button onClick={goToday} style={{ fontSize: 12.5, fontWeight: 700, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-1)', cursor: 'pointer' }}>Hoje</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-subtle)' }}>
              Atendente
              <select value={atendente} onChange={e => setAtendente(e.target.value)} style={{ fontSize: 12.5, padding: '5px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-1)' }}>
                <option value="">Todos</option>
                {atendentes.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </label>
            <div style={{ display: 'inline-flex', background: 'var(--bg-subtle)', borderRadius: 9, padding: 2 }}>
              {(['semana', 'mes'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  style={{
                    fontSize: 12.5, padding: '6px 12px', borderRadius: 7, border: 'none', cursor: 'pointer',
                    background: view === v ? 'var(--bg-card, #fff)' : 'transparent',
                    color: view === v ? 'var(--text-1)' : 'var(--text-subtle)', fontWeight: view === v ? 700 : 500,
                    boxShadow: view === v ? '0 1px 2px rgba(0,0,0,0.08)' : undefined,
                  }}
                >
                  {v === 'semana' ? 'Semana' : 'Mês'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading
          ? <p style={{ padding: 24, fontSize: 13, color: 'var(--text-subtle)' }}>Carregando…</p>
          : view === 'semana' ? renderWeek() : renderMonth()}

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', padding: '14px 20px', borderTop: '1px solid var(--border-lt)' }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</span>
          {LEGEND.map(l => (
            <div key={l.status} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-3)', fontWeight: 500 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor(l.status) }} />
              {l.label}
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-3)', fontWeight: 500 }}>
            <span style={{ width: 14, height: 10, borderRadius: 3, border: `1.5px dashed ${OVERDUE}` }} />
            Vencido (horário já passou)
          </div>
        </div>
      </div>

      {popover && (
        <div onClick={() => setPopover(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-card,#fff)', borderRadius: 16, width: '100%', maxWidth: 420, maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border-lt)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-1)' }}>
                {popover.title} · {popover.items.length} agendamento{popover.items.length !== 1 ? 's' : ''}
              </span>
              <button onClick={() => setPopover(null)} aria-label="Fechar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-subtle)', display: 'flex' }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {popover.items
                .slice()
                .sort((a, b) => parseUTC(a.scheduled_at) - parseUTC(b.scheduled_at))
                .map(it => {
                  const overdue = isOverdue(it)
                  return (
                    <button
                      key={it.schedule_id}
                      onClick={() => navigate(`/leads/${it.id}`)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10,
                        background: 'var(--bg-hover)', border: `1px ${overdue ? 'dashed' : 'solid'} ${overdue ? OVERDUE : 'var(--border-lt)'}`,
                        cursor: 'pointer', textAlign: 'left', width: '100%',
                      }}
                    >
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor(it.status), flexShrink: 0 }} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: overdue ? OVERDUE : 'var(--text-muted)', width: 42, flexShrink: 0 }}>{fmtTime(it.scheduled_at)}</span>
                      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{it.name}</span>
                      {it.attendant && <span style={{ fontSize: 11.5, color: 'var(--text-subtle)', flexShrink: 0 }}>{it.attendant}</span>}
                    </button>
                  )
                })}
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
