import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
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
const WEEKDAYS_LONG = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
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
const TODAY_BLUE = '#2563EB'

function dotColor(status: string | null) {
  if (!status) return '#9CA3AF'
  return STATUS_DOT[status.toLowerCase()] ?? '#9CA3AF'
}

// Dia / Semana / Mês com o mesmo bloco (aprovado em 10/11/2026): fundo na cor
// do status, barrinha lateral, horário na cor do status, vencido tracejado.
// Dia e Semana: grade hora x dia, a linha cresce pra caber todos; célula com
// mais de CELL_VISIBLE recolhe atrás de "Ver mais". Mês: mesma ideia por dia.
const ROW_MIN = 52
const DAY_START = 8
const DAY_END = 19
const CELL_VISIBLE = 4
const MONTH_VISIBLE = 3

function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}
function startOfWeek(d: Date) {
  const x = startOfDay(d)
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
const hourOf = (it: AgendaItem) => new Date(parseUTC(it.scheduled_at)).getHours()

type View = 'dia' | 'semana' | 'mes'
const VIEWS: { key: View; label: string }[] = [
  { key: 'dia', label: 'Dia' },
  { key: 'semana', label: 'Semana' },
  { key: 'mes', label: 'Mês' },
]

export default function Agenda() {
  const navigate = useNavigate()
  const { dark } = useTheme()
  const [view, setView] = useState<View>('semana')
  // uma única data de referência: o dia (Dia), a semana que o contém (Semana) e o mês (Mês)
  const [ref, setRef] = useState(() => startOfDay(new Date()))
  const [items, setItems] = useState<AgendaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [atendente, setAtendente] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [now, setNow] = useState(() => Date.now())

  // linha do "agora" e marcação de vencido acompanham o relógio
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])

  const weekStart = useMemo(() => startOfWeek(ref), [ref])

  useEffect(() => {
    let cancelled = false
    const from = view === 'dia' ? ref : view === 'semana' ? weekStart : new Date(ref.getFullYear(), ref.getMonth(), 1)
    const to = view === 'dia' ? ref : view === 'semana' ? addDays(weekStart, 6) : new Date(ref.getFullYear(), ref.getMonth() + 1, 0)
    setLoading(true)
    setExpanded(new Set())
    api.get<{ items: AgendaItem[] }>('/api/v1/agenda', { params: { date_from: dateKey(from), date_to: dateKey(to) } })
      .then(r => { if (!cancelled) setItems(r.data.items) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [view, ref, weekStart])

  const toggleCell = (key: string) => setExpanded(prev => {
    const n = new Set(prev)
    if (n.has(key)) n.delete(key); else n.add(key)
    return n
  })

  const atendentes = useMemo(
    () => Array.from(new Set(items.map(i => (i.attendant || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [items],
  )
  const byDay = useMemo(() => {
    const map: Record<string, AgendaItem[]> = {}
    items
      .filter(i => !atendente || (i.attendant || '').trim() === atendente)
      .sort((a, b) => parseUTC(a.scheduled_at) - parseUTC(b.scheduled_at))
      .forEach(it => {
        const k = dateKey(new Date(parseUTC(it.scheduled_at)))
        ;(map[k] = map[k] || []).push(it)
      })
    return map
  }, [items, atendente])

  const today = new Date(now)
  const todayKey = dateKey(today)
  const isOverdue = (it: AgendaItem) => parseUTC(it.scheduled_at) < now

  // colunas da grade por hora: Dia = 1; Semana = seg–sex + sáb/dom se tiverem agendamento
  const cols = useMemo(() => {
    if (view === 'dia') return [ref]
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).filter((d, i) => i < 5 || (byDay[dateKey(d)]?.length ?? 0) > 0)
  }, [view, ref, weekStart, byDay])

  const [hStart, hEnd] = useMemo(() => {
    let lo = DAY_START, hi = DAY_END
    for (const d of cols) for (const it of byDay[dateKey(d)] ?? []) {
      lo = Math.min(lo, hourOf(it))
      hi = Math.max(hi, hourOf(it) + 1)
    }
    return [lo, hi]
  }, [cols, byDay])

  const monthWeeks = useMemo(() => {
    const year = ref.getFullYear()
    const month = ref.getMonth()
    const firstDay = new Date(year, month, 1)
    const totalDays = new Date(year, month + 1, 0).getDate()
    const cells: (Date | null)[] = Array(firstDay.getDay()).fill(null)
    for (let d = 1; d <= totalDays; d++) cells.push(new Date(year, month, d))
    while (cells.length % 7 !== 0) cells.push(null)
    const rows: (Date | null)[][] = []
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7))
    return rows
  }, [ref])

  function shift(dir: 1 | -1) {
    if (view === 'dia') setRef(r => addDays(r, dir))
    else if (view === 'semana') setRef(r => addDays(r, 7 * dir))
    else setRef(r => new Date(r.getFullYear(), r.getMonth() + dir, 1))
  }
  function openDay(d: Date) {
    setRef(startOfDay(d))
    setView('dia')
  }

  const weekEnd = addDays(weekStart, 6)
  const title = view === 'dia'
    ? `${WEEKDAYS_LONG[ref.getDay()]}, ${ref.getDate()} de ${MONTHS[ref.getMonth()].toLowerCase()} de ${ref.getFullYear()}`
    : view === 'semana'
      ? weekStart.getMonth() === weekEnd.getMonth()
        ? `${weekStart.getDate()} a ${weekEnd.getDate()} de ${MONTHS[weekEnd.getMonth()].toLowerCase()} de ${weekEnd.getFullYear()}`
        : `${weekStart.getDate()} de ${MONTHS[weekStart.getMonth()].toLowerCase()} a ${weekEnd.getDate()} de ${MONTHS[weekEnd.getMonth()].toLowerCase()}`
      : `${MONTHS[ref.getMonth()]} de ${ref.getFullYear()}`
  const unit = view === 'dia' ? 'Dia' : view === 'semana' ? 'Semana' : 'Mês'

  const navBtn: React.CSSProperties = { width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }
  const line = '1px solid var(--border)'

  function block(it: AgendaItem, compact = false) {
    const c = dotColor(it.status)
    const late = isOverdue(it)
    return (
      <button
        key={it.schedule_id}
        onClick={() => navigate(`/leads/${it.id}`)}
        title={`${statusLabel(it.status)}${late ? ' · vencido' : ''} · ${it.name}${it.attendant ? ` · ${it.attendant}` : ''}`}
        style={{
          display: 'block', width: '100%', minWidth: 0, borderRadius: 7, border: 'none', borderLeft: `3px solid ${c}`,
          background: tint(c, dark ? 24 : 14), color: 'var(--text-1)', textAlign: 'left',
          padding: compact ? '3px 6px' : '5px 8px', cursor: 'pointer', overflow: 'hidden',
          fontSize: compact ? 11 : 12, lineHeight: 1.3, whiteSpace: 'nowrap', textOverflow: 'ellipsis',
          outline: late ? `1.5px dashed ${OVERDUE}` : undefined, outlineOffset: -1.5,
        }}
      >
        {/* horário na cor do status (vencido continua em vermelho) */}
        <b style={{ color: late ? OVERDUE : c, fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{fmtTime(it.scheduled_at)}</b>{' '}{it.name}
        {view === 'dia' && it.attendant && <span style={{ color: 'var(--text-subtle)', fontSize: 11 }}> · {it.attendant}</span>}
      </button>
    )
  }

  // lista de uma célula com "Ver mais N" / "Ver menos"
  function cellList(cellKey: string, list: AgendaItem[], max: number, compact = false) {
    const open = expanded.has(cellKey)
    const hidden = list.length - max
    const shown = open || hidden <= 0 ? list : list.slice(0, max)
    const hiddenLate = hidden > 0 ? list.slice(max).filter(isOverdue).length : 0
    return (
      <>
        {shown.map(it => block(it, compact))}
        {hidden > 0 && (
          <button
            onClick={() => toggleCell(cellKey)}
            aria-expanded={open}
            style={{
              gridColumn: '1 / -1', border: '1px dashed var(--border)', background: 'var(--bg-subtle)', color: 'var(--text-2)',
              borderRadius: 7, padding: compact ? '3px 6px' : '4px 8px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', textAlign: 'center',
            }}
          >
            {open ? 'Ver menos' : `Ver mais ${hidden}`}
            {!open && hiddenLate > 0 && <span style={{ color: OVERDUE }}> · {hiddenLate} vencido{hiddenLate > 1 ? 's' : ''}</span>}
          </button>
        )}
      </>
    )
  }

  function dayHeader(d: Date) {
    const k = dateKey(d)
    const list = byDay[k] ?? []
    const late = list.filter(isOverdue).length
    const isToday = k === todayKey
    return (
      <button
        key={k}
        onClick={() => view !== 'dia' && openDay(d)}
        title={view !== 'dia' ? 'Ver este dia' : undefined}
        style={{
          padding: '9px 6px', textAlign: 'center', border: 'none', borderLeft: line, cursor: view !== 'dia' ? 'pointer' : 'default',
          background: isToday ? tint(TODAY_BLUE, 8) : 'transparent', color: 'inherit', font: 'inherit',
        }}
      >
        <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{WEEKDAYS[d.getDay()]}</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-1)', lineHeight: 1.3 }}>
          {isToday
            ? <span style={{ display: 'inline-flex', width: 28, height: 28, borderRadius: '50%', background: TODAY_BLUE, color: '#fff', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>{d.getDate()}</span>
            : d.getDate()}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-subtle)' }}>
          {list.length ? `${list.length} agend.` : '—'}
          {late > 0 && <span style={{ color: OVERDUE, fontWeight: 700 }}> · {late} vencido{late > 1 ? 's' : ''}</span>}
        </div>
      </button>
    )
  }

  // Dia e Semana: grade hora x dia
  function renderHourGrid() {
    const hours = Array.from({ length: hEnd - hStart }, (_, i) => hStart + i)
    const gridCols = `52px repeat(${cols.length}, minmax(0, 1fr))`
    const hasToday = cols.some(d => dateKey(d) === todayKey)
    const nowHour = today.getHours()
    const isDay = view === 'dia'
    return (
      <>
        <div style={{ display: 'grid', gridTemplateColumns: gridCols, borderBottom: '2px solid var(--border)', background: 'var(--bg-subtle)' }}>
          <div />
          {cols.map(dayHeader)}
        </div>
        <div style={{ maxHeight: 720, overflowY: 'auto' }}>
          {hours.map(h => {
            const nowRow = hasToday && nowHour === h
            return (
              <div key={h} style={{ display: 'grid', gridTemplateColumns: gridCols, borderTop: line }}>
                <div style={{ fontSize: 11, color: nowRow ? TODAY_BLUE : 'var(--text-subtle)', fontWeight: nowRow ? 800 : 600, textAlign: 'right', padding: '7px 8px 0 0', fontVariantNumeric: 'tabular-nums' }}>
                  {String(h).padStart(2, '0')}:00
                </div>
                {cols.map(d => {
                  const k = dateKey(d)
                  const isToday = k === todayKey
                  const list = (byDay[k] ?? []).filter(it => hourOf(it) === h)
                  return (
                    <div
                      key={k}
                      style={{
                        position: 'relative', borderLeft: line, minHeight: ROW_MIN, padding: 4, minWidth: 0,
                        // no Dia a coluna é larga: os blocos se distribuem em colunas
                        display: 'grid', gridTemplateColumns: isDay ? 'repeat(auto-fill, minmax(220px, 1fr))' : 'minmax(0, 1fr)',
                        gap: 3, alignContent: 'start',
                        background: isToday && !isDay ? tint(TODAY_BLUE, 4) : undefined,
                      }}
                    >
                      {cellList(`${k}-${h}`, list, isDay ? CELL_VISIBLE * 3 : CELL_VISIBLE)}
                      {isToday && nowHour === h && (
                        <div style={{ position: 'absolute', left: 0, right: 0, top: `${(today.getMinutes() / 60) * 100}%`, height: 2, background: TODAY_BLUE, zIndex: 2, pointerEvents: 'none' }}>
                          <span style={{ position: 'absolute', left: -4, top: -3, width: 8, height: 8, borderRadius: '50%', background: TODAY_BLUE }} />
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', background: 'var(--bg-subtle)', borderBottom: '2px solid var(--border)' }}>
          {WEEKDAYS.map((w, i) => (
            <div key={w} style={{ padding: '10px 12px', fontSize: 10.5, fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'center', borderLeft: i ? line : 'none' }}>
              {w}
            </div>
          ))}
        </div>
        {monthWeeks.map((week, wi) => (
          <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', borderTop: wi ? line : 'none' }}>
            {week.map((day, di) => {
              const k = day ? dateKey(day) : null
              const list = k ? (byDay[k] ?? []) : []
              const isToday = k === todayKey
              const late = list.filter(isOverdue).length
              return (
                <div
                  key={di}
                  style={{
                    minHeight: 120, padding: 6, minWidth: 0, borderLeft: di ? line : 'none',
                    display: 'flex', flexDirection: 'column', gap: 3,
                    background: !day ? 'var(--bg-hover)' : isToday ? tint(TODAY_BLUE, 4) : undefined,
                    opacity: !day ? 0.4 : 1,
                  }}
                >
                  {day && (
                    <button
                      onClick={() => openDay(day)}
                      title="Ver este dia"
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, border: 'none', background: 'none', padding: '0 2px 2px', cursor: 'pointer', font: 'inherit' }}
                    >
                      {isToday
                        ? <span style={{ width: 22, height: 22, borderRadius: '50%', background: TODAY_BLUE, color: '#fff', fontWeight: 800, fontSize: 11.5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{day.getDate()}</span>
                        : <span style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 800 }}>{day.getDate()}</span>}
                      {list.length > 0 && (
                        <span style={{ fontSize: 10.5, color: 'var(--text-subtle)', fontWeight: 600 }}>
                          {list.length}{late > 0 && <span style={{ color: OVERDUE }}> · {late} venc.</span>}
                        </span>
                      )}
                    </button>
                  )}
                  {cellList(`m-${k}`, list, MONTH_VISIBLE, true)}
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
            <button onClick={() => shift(-1)} aria-label={`${unit} anterior`} style={navBtn}><ChevronLeft size={16} /></button>
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-1)', minWidth: 220, textAlign: 'center' }}>{title}</span>
            <button onClick={() => shift(1)} aria-label={`Próximo ${unit.toLowerCase()}`} style={navBtn}><ChevronRight size={16} /></button>
            <button onClick={() => setRef(startOfDay(new Date()))} style={{ fontSize: 12.5, fontWeight: 700, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-1)', cursor: 'pointer' }}>Hoje</button>
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
              {VIEWS.map(v => (
                <button
                  key={v.key}
                  onClick={() => setView(v.key)}
                  aria-pressed={view === v.key}
                  style={{
                    fontSize: 12.5, padding: '6px 12px', borderRadius: 7, border: 'none', cursor: 'pointer',
                    background: view === v.key ? 'var(--bg-card, #fff)' : 'transparent',
                    color: view === v.key ? 'var(--text-1)' : 'var(--text-subtle)', fontWeight: view === v.key ? 700 : 500,
                    boxShadow: view === v.key ? '0 1px 2px rgba(0,0,0,0.08)' : undefined,
                  }}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading
          ? <p style={{ padding: 24, fontSize: 13, color: 'var(--text-subtle)' }}>Carregando…</p>
          : view === 'mes' ? renderMonth() : renderHourGrid()}

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
          <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--text-subtle)' }}>Clique no dia para abri-lo na visão Dia</span>
        </div>
      </div>
    </main>
  )
}
