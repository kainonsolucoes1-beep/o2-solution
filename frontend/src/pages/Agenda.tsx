import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import api from '../api'

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

const WEEKDAYS = ['DOM.', 'SEG.', 'TER.', 'QUA.', 'QUI.', 'SEX.', 'SÁB.']
const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]
const PALETTE = ['#3B82F6', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6', '#EF4444', '#14B8A6', '#F97316']

function colorFor(key: string | null) {
  if (!key) return PALETTE[0]
  let hash = 0
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  return PALETTE[hash % PALETTE.length]
}

function densityFor(count: number) {
  if (count <= 3) return { fontSize: 11, padding: '4px 6px', gap: 4, lineHeight: 1.4 }
  if (count <= 6) return { fontSize: 10, padding: '3px 5px', gap: 3, lineHeight: 1.3 }
  if (count <= 10) return { fontSize: 9, padding: '2px 4px', gap: 2, lineHeight: 1.25 }
  return { fontSize: 8, padding: '1px 3px', gap: 2, lineHeight: 1.2 }
}

function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function Agenda() {
  const navigate = useNavigate()
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d })
  const [items, setItems] = useState<AgendaItem[]>([])
  const [loading, setLoading] = useState(true)

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

  const byDay = useMemo(() => {
    const map: Record<string, AgendaItem[]> = {}
    for (const it of items) {
      const day = it.scheduled_at.slice(0, 10)
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
    return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <>
    <main className="px-4 md:px-8 xl:px-12 py-6 flex flex-col gap-6">
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-2)' }}>Agenda / Calendário</h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
          Leads agendados por data
        </p>
      </div>

      <div className="bg-white rounded-xl" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '14px 16px', borderBottom: '1px solid var(--border-lt)' }}>
          <button
            onClick={() => setCursor(c => new Date(c.getFullYear(), c.getMonth() - 1, 1))}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-subtle)', display: 'flex' }}
          >
            <ChevronLeft size={18} />
          </button>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-2)', minWidth: 140, textAlign: 'center' }}>
            {MONTHS[cursor.getMonth()]} - {cursor.getFullYear()}
          </span>
          <button
            onClick={() => setCursor(c => new Date(c.getFullYear(), c.getMonth() + 1, 1))}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-subtle)', display: 'flex' }}
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {WEEKDAYS.map(w => (
            <div key={w} style={{ padding: '10px 12px', fontSize: 11, fontWeight: 600, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center', borderBottom: '1px solid var(--border-lt)' }}>
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
                const dayItems = day ? (byDay[dateKey(day)] ?? []) : []
                const density = densityFor(dayItems.length)
                return (
                  <div
                    key={di}
                    style={{
                      minHeight: 190, padding: 6,
                      borderRight: di < 6 ? '1px solid var(--border-lt)' : 'none',
                      borderBottom: '1px solid var(--border-lt)',
                    }}
                  >
                    {day && (
                      <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>{day.getDate()}</span>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: density.gap, marginTop: 4 }}>
                      {dayItems.map(it => (
                        <button
                          key={it.schedule_id}
                          onClick={() => navigate(`/leads/${it.id}`)}
                          title={it.name}
                          style={{
                            textAlign: 'left', fontSize: density.fontSize, lineHeight: density.lineHeight,
                            borderLeft: `3px solid ${colorFor(it.attendant)}`,
                            background: 'var(--bg-hover)', color: 'var(--text-2)',
                            padding: density.padding, borderRadius: 4, cursor: 'pointer', border: 'none',
                            borderLeftWidth: 3, borderLeftStyle: 'solid',
                            whiteSpace: 'normal', wordBreak: 'break-word',
                          }}
                        >
                          {fmtTime(it.scheduled_at)} · {it.followize_id ?? '—'} · {it.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          ))
        )}
      </div>
    </main>
    </>
  )
}
