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
  novo: '#3B82F6', new: '#3B82F6', pending: '#3B82F6',
  qualificado: '#10B981', qualified: '#10B981', scheduled: '#10B981',
  proposta: '#F59E0B', proposal_sent: '#F59E0B', 'proposal sent': '#F59E0B',
  negociacao: '#8B5CF6', negociação: '#8B5CF6',
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

function dotColor(status: string | null) {
  if (!status) return '#9CA3AF'
  return STATUS_DOT[status.toLowerCase()] ?? '#9CA3AF'
}

const MAX_VISIBLE = 3

function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function Agenda() {
  const navigate = useNavigate()
  const { dark } = useTheme()
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d })
  const [items, setItems] = useState<AgendaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [dayPopover, setDayPopover] = useState<{ date: Date; items: AgendaItem[] } | null>(null)
  const [viewFilter, setViewFilter] = useState<'hoje' | 'semana' | 'mes'>('mes')

  useEffect(() => {
    const year = cursor.getFullYear()
    const month = cursor.getMonth()
    const dateFrom = dateKey(new Date(year, month, 1))
    const dateTo = dateKey(new Date(year, month + 1, 0))
    setLoading(true)
    api.get<{ items: AgendaItem[] }>('/api/v1/agenda', { params: { date_from: dateFrom, date_to: dateTo } })
      .then(r => setItems(r.data.items))
      .finally(() => setLoading(false))
  }, [cursor])

  useEffect(() => {
    if (!dayPopover) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setDayPopover(null) }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [dayPopover])

  const byDay = useMemo(() => {
    const map: Record<string, AgendaItem[]> = {}
    for (const it of items) {
      const day = dateKey(new Date(parseUTC(it.scheduled_at)))
      if (!map[day]) map[day] = []
      map[day].push(it)
    }
    return map
  }, [items])

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

  function fmtTime(iso: string) {
    return new Date(parseUTC(iso)).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  }

  const today = new Date()
  const todayKey = dateKey(today)
  const now = Date.now()

  const currentWeekKeys = useMemo(() => {
    const w = weeks.find(week => week.some(d => d && dateKey(d) === todayKey))
    return new Set((w ?? []).filter((d): d is Date => !!d).map(d => dateKey(d)))
  }, [weeks, todayKey])

  return (
    <main className="px-4 md:px-8 xl:px-12 py-6 flex flex-col gap-6" style={{ background: dark ? 'transparent' : '#EEF1F5', minHeight: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-2)' }}>Agenda / Calendário</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>Leads agendados por data</p>
        </div>
      </div>

      <div className="bg-white rounded-xl" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border-lt)' }}>
          <button
            onClick={() => setCursor(c => new Date(c.getFullYear(), c.getMonth() - 1, 1))}
            style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <ChevronLeft size={16} />
          </button>
          <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-1)', minWidth: 160, textAlign: 'center' }}>
            {MONTHS[cursor.getMonth()]} de {cursor.getFullYear()}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              {([
                { key: 'hoje',   label: 'Hoje',         bg: '#EFF6FF', border: '#BFDBFE', text: '#1D4ED8', solid: '#2563EB' },
                { key: 'semana', label: 'Esta Semana',  bg: '#ECFDF5', border: '#A7F3D0', text: '#059669', solid: '#059669' },
                { key: 'mes',    label: 'Este Mês',     bg: '#FEF2F2', border: '#FECACA', text: '#DC2626', solid: '#DC2626' },
              ] as const).map(opt => {
                const active = viewFilter === opt.key
                return (
                  <button
                    key={opt.key}
                    onClick={() => {
                      setViewFilter(opt.key)
                      if (opt.key !== 'mes') { const d = new Date(); d.setDate(1); setCursor(d) }
                    }}
                    style={{
                      fontSize: 12.5, fontWeight: 700, padding: '8px 14px', borderRadius: 10, cursor: 'pointer',
                      border: `1px solid ${active ? opt.solid : opt.border}`,
                      background: active ? opt.solid : opt.bg,
                      color: active ? '#fff' : opt.text,
                      transition: 'all 150ms',
                    }}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
            <button
              onClick={() => setCursor(c => new Date(c.getFullYear(), c.getMonth() + 1, 1))}
              style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: 'var(--bg-subtle)' }}>
          {WEEKDAYS.map(w => (
            <div key={w} style={{ padding: '10px 12px', fontSize: 10.5, fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'center', borderBottom: '1px solid var(--border-lt)' }}>
              {w}
            </div>
          ))}
        </div>

        {loading ? (
          <p style={{ padding: 24, fontSize: 13, color: 'var(--text-subtle)' }}>Carregando…</p>
        ) : (
          weeks.map((week, wi) => (
            <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
              {week.map((day, di) => {
                const dKey = day ? dateKey(day) : null
                const matchesFilter = !dKey ? false
                  : viewFilter === 'hoje' ? dKey === todayKey
                  : viewFilter === 'semana' ? currentWeekKeys.has(dKey)
                  : true
                const dayItems = matchesFilter ? (byDay[dKey!] ?? []) : []
                const isToday = !!day && dateKey(day) === todayKey
                const visible = dayItems.slice(0, MAX_VISIBLE)
                const hiddenCount = dayItems.length - visible.length
                return (
                  <div
                    key={di}
                    style={{
                      minHeight: 120, padding: 8,
                      borderRight: di < 6 ? '1px solid var(--border-lt)' : 'none',
                      borderBottom: '1px solid var(--border-lt)',
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
                        const overdue = parseUTC(it.scheduled_at) < now
                        return (
                          <button
                            key={it.schedule_id}
                            onClick={() => navigate(`/leads/${it.id}`)}
                            title={`${statusLabel(it.status)}${overdue ? ' · vencido' : ''} · ${it.name}`}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 5, textAlign: 'left', fontSize: 10.5,
                              background: overdue ? '#FEF2F2' : 'var(--bg-hover)', color: 'var(--text-2)',
                              padding: '3px 6px', borderRadius: 6, cursor: 'pointer', border: 'none', overflow: 'hidden',
                            }}
                          >
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor(it.status), flexShrink: 0 }} />
                            <span style={{ fontSize: 10, color: overdue ? '#DC2626' : 'var(--text-subtle)', fontWeight: 700, flexShrink: 0 }}>{fmtTime(it.scheduled_at)}</span>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name}</span>
                          </button>
                        )
                      })}
                      {hiddenCount > 0 && day && (
                        <button
                          onClick={() => setDayPopover({ date: day, items: dayItems })}
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
          ))
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', padding: '14px 20px', borderTop: '1px solid var(--border-lt)' }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</span>
          {LEGEND.map(l => (
            <div key={l.status} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-3)', fontWeight: 500 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor(l.status) }} />
              {l.label}
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-3)', fontWeight: 500 }}>
            <span style={{ width: 14, height: 10, borderRadius: 3, background: '#FEF2F2', border: '1px solid #FECACA' }} />
            Vencido
          </div>
        </div>
      </div>

      {dayPopover && (
        <div onClick={() => setDayPopover(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-card,#fff)', borderRadius: 16, width: '100%', maxWidth: 380, maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border-lt)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-1)' }}>
                {dayPopover.date.getDate()} de {MONTHS[dayPopover.date.getMonth()].toLowerCase()} · {dayPopover.items.length} agendamento{dayPopover.items.length !== 1 ? 's' : ''}
              </span>
              <button onClick={() => setDayPopover(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-subtle)', display: 'flex' }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {dayPopover.items
                .slice()
                .sort((a, b) => parseUTC(a.scheduled_at) - parseUTC(b.scheduled_at))
                .map(it => {
                  const overdue = parseUTC(it.scheduled_at) < now
                  return (
                    <button
                      key={it.schedule_id}
                      onClick={() => navigate(`/leads/${it.id}`)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10,
                        background: overdue ? '#FEF2F2' : 'var(--bg-hover)', border: '1px solid var(--border-lt)',
                        cursor: 'pointer', textAlign: 'left', width: '100%',
                      }}
                    >
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor(it.status), flexShrink: 0 }} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: overdue ? '#DC2626' : 'var(--text-muted)', width: 42, flexShrink: 0 }}>{fmtTime(it.scheduled_at)}</span>
                      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name}</span>
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
