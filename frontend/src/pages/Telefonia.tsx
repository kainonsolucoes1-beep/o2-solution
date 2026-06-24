import { useEffect, useState } from 'react'
import { Phone, Plus, Trash2, Save, ChevronDown, ChevronRight, Clock } from 'lucide-react'
import api from '../api'

interface TelefoniaSettings {
  tma: string
  ligacoes: Record<string, number>
  atendimentos: Record<string, string>
  pausas: Record<string, string>
}

interface Row { name: string; count: string; atendimento: string; pausa: string }

interface HistoricoOperador {
  nome: string
  ligacoes: number
  tma_individual: string
  pausa: string
}

interface HistoricoDay {
  date: string
  total_ligacoes: number
  tma: string
  operadores: HistoricoOperador[]
}

function parseSecs(t: string): number {
  const parts = t.trim().split(':')
  if (parts.length !== 3) return 0
  const [h, m, s] = parts.map(Number)
  if ([h, m, s].some(isNaN)) return 0
  return h * 3600 + m * 60 + s
}

function calcTMA(rows: Row[]): string {
  let totalSecs = 0, totalCalls = 0
  for (const row of rows) {
    const calls = parseInt(row.count)
    const secs = parseSecs(row.atendimento)
    if (row.name.trim() && !isNaN(calls) && calls > 0 && secs > 0) {
      totalSecs += secs
      totalCalls += calls
    }
  }
  if (totalCalls === 0) return '—'
  const avg = totalSecs / totalCalls
  const mins = Math.floor(avg / 60)
  const secs = Math.floor(avg % 60)
  return mins > 0 ? `${mins}m ${String(secs).padStart(2, '0')}s` : `${secs}s`
}

function calcIndividualTMA(row: Row): string {
  const calls = parseInt(row.count)
  const secs = parseSecs(row.atendimento)
  if (isNaN(calls) || calls <= 0 || secs <= 0) return '—'
  const avg = secs / calls
  const m = Math.floor(avg / 60)
  const s = Math.floor(avg % 60)
  return m > 0 ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export default function Telefonia() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [rows, setRows] = useState<Row[]>([])
  const [historico, setHistorico] = useState<HistoricoDay[]>([])
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set())

  const toggleDay = (d: string) => setExpandedDays(prev => {
    const s = new Set(prev); s.has(d) ? s.delete(d) : s.add(d); return s
  })

  function refreshHistorico() {
    api.get<HistoricoDay[]>('/api/v1/telefonia/historico?days=14')
      .then(r => setHistorico(r.data)).catch(() => {})
  }

  useEffect(() => {
    api.get<TelefoniaSettings>('/api/v1/telefonia/settings')
      .then(r => {
        const { ligacoes, atendimentos, pausas } = r.data
        setRows(
          Object.entries(ligacoes).map(([name, count]) => ({
            name,
            count: String(count),
            atendimento: atendimentos[name] ?? '',
            pausa: pausas?.[name] ?? '',
          }))
        )
      })
      .catch(() => {})
      .finally(() => setLoading(false))
    refreshHistorico()
  }, [])

  function addRow() {
    setRows(r => [...r, { name: '', count: '', atendimento: '', pausa: '' }])
  }

  function removeRow(i: number) {
    setRows(r => r.filter((_, idx) => idx !== i))
  }

  function updateRow(i: number, field: keyof Row, value: string) {
    setRows(r => r.map((row, idx) => idx === i ? { ...row, [field]: value } : row))
  }

  async function handleSave() {
    setSaving(true)
    const ligacoes: Record<string, number> = {}
    const atendimentos: Record<string, string> = {}
    const pausas: Record<string, string> = {}
    for (const row of rows) {
      const n = row.name.trim()
      const c = parseInt(row.count)
      if (n && !isNaN(c) && c >= 0) {
        ligacoes[n] = c
        if (row.atendimento.trim()) atendimentos[n] = row.atendimento.trim()
        if (row.pausa.trim())       pausas[n]       = row.pausa.trim()
      }
    }
    try {
      await api.put('/api/v1/telefonia/settings', { ligacoes, atendimentos, pausas })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
      refreshHistorico()
    } catch {}
    finally { setSaving(false) }
  }

  const inp = (value: string, onChange: (v: string) => void, placeholder = '') => (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-in)',
        borderRadius: 7, padding: '8px 10px', color: 'var(--text-2)', fontSize: 13,
        boxSizing: 'border-box' as const,
      }}
    />
  )

  const tmaCalc = calcTMA(rows)

  if (loading) return <p className="text-center text-sm mt-20" style={{ color: 'var(--text-subtle)' }}>Carregando...</p>

  const colH: React.CSSProperties = {
    padding: '8px 12px', fontSize: 11, fontWeight: 600,
    color: 'var(--text-subtle)', textTransform: 'uppercase',
    letterSpacing: '0.04em', borderBottom: '1px solid var(--border)', textAlign: 'left',
  }

  return (
    <main style={{ padding: '24px 32px', maxWidth: 960 }}>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>Telefonia</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>Indicadores manuais de discagem e atendimento</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: saved ? '#059669' : '#2563EB', color: '#fff',
            border: 'none', borderRadius: 8, padding: '8px 16px',
            fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.7 : 1, transition: 'background 300ms',
          }}
        >
          <Save size={14} />
          {saved ? 'Salvo!' : saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>

      {/* TMA global */}
      <div className="bg-white rounded-xl p-6" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#FFF7ED', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Phone size={15} color="#F97316" />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', margin: 0 }}>Tempo Médio de Atendimento (TMA) Global</p>
            <p style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 2 }}>Calculado automaticamente a partir dos dados abaixo</p>
          </div>
          <span style={{ fontSize: 22, fontWeight: 700, color: tmaCalc === '—' ? 'var(--text-subtle)' : '#F97316' }}>
            {tmaCalc}
          </span>
        </div>
      </div>

      {/* Tabela de operadores */}
      <div className="bg-white rounded-xl" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)', overflow: 'hidden', marginBottom: 24 }}>
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', margin: 0 }}>Ligações por Operador</p>
            <p style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 2 }}>TMA individual calculado em tempo real. Salve para registrar o dia no histórico.</p>
          </div>
          <button
            onClick={addRow}
            style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: 7, padding: '6px 12px', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            <Plus size={13} /> Adicionar
          </button>
        </div>

        {rows.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-subtle)', padding: '16px 24px' }}>Nenhum operador cadastrado. Clique em Adicionar.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-subtle)' }}>
                <th style={colH}>Operador</th>
                <th style={colH}>Ligações</th>
                <th style={colH}>Atendimento total</th>
                <th style={colH}>Pausa</th>
                <th style={{ ...colH, textAlign: 'right' }}>TMA</th>
                <th style={{ ...colH, width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const tmaInd = calcIndividualTMA(row)
                const col: React.CSSProperties = {
                  padding: '10px 12px', fontSize: 13, color: 'var(--text-2)',
                  borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none',
                  background: i % 2 === 1 ? 'var(--bg-subtle)' : 'transparent',
                }
                return (
                  <tr key={i}>
                    <td style={{ ...col, minWidth: 140 }}>
                      {inp(row.name, v => updateRow(i, 'name', v), 'Nome do operador')}
                    </td>
                    <td style={{ ...col, width: 100 }}>
                      {inp(row.count, v => updateRow(i, 'count', v), '0')}
                    </td>
                    <td style={{ ...col, width: 140 }}>
                      {inp(row.atendimento, v => updateRow(i, 'atendimento', v), '00:00:00')}
                    </td>
                    <td style={{ ...col, width: 140 }}>
                      {inp(row.pausa, v => updateRow(i, 'pausa', v), '00:00:00')}
                    </td>
                    <td style={{ ...col, textAlign: 'right', width: 90, fontWeight: 600, color: tmaInd === '—' ? 'var(--text-subtle)' : '#F97316' }}>
                      {tmaInd}
                    </td>
                    <td style={{ ...col, width: 40, textAlign: 'center' }}>
                      <button
                        onClick={() => removeRow(i)}
                        style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 7, padding: '6px', cursor: 'pointer', color: '#EF4444', display: 'inline-flex', alignItems: 'center' }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Histórico diário */}
      {historico.length > 0 && (
        <div className="bg-white rounded-xl" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
          <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Clock size={15} color="#2563EB" />
            </div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', margin: 0 }}>Histórico por Dia</p>
              <p style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 2 }}>Últimos 14 dias registrados — clique no dia para ver por operador</p>
            </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-subtle)' }}>
                <th style={colH}>Data</th>
                <th style={{ ...colH, textAlign: 'right' }}>Total ligações</th>
                <th style={{ ...colH, textAlign: 'right' }}>TMA global</th>
                <th style={{ ...colH, width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {historico.map((day, i) => {
                const expanded = expandedDays.has(day.date)
                const col: React.CSSProperties = {
                  padding: '10px 12px', fontSize: 13, color: 'var(--text-2)',
                  borderBottom: '1px solid var(--border)',
                  background: i % 2 === 1 && !expanded ? 'var(--bg-subtle)' : 'transparent',
                }
                const subHeaderCol: React.CSSProperties = {
                  padding: '6px 12px', fontSize: 10, fontWeight: 700,
                  color: 'var(--text-subtle)', textTransform: 'uppercase' as const,
                  letterSpacing: '0.05em', background: '#F8FAFF',
                  borderBottom: '1px solid var(--border)',
                }
                const subCol: React.CSSProperties = {
                  padding: '9px 12px', fontSize: 12, color: 'var(--text-2)',
                  borderBottom: '1px solid var(--border)',
                  background: '#FAFBFF',
                }
                return (
                  <>
                    <tr
                      key={day.date}
                      style={{ cursor: 'pointer' }}
                      onClick={() => toggleDay(day.date)}
                    >
                      <td style={{ ...col, fontWeight: 600, color: 'var(--text-1)' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                          {formatDate(day.date)}
                        </span>
                      </td>
                      <td style={{ ...col, textAlign: 'right', fontWeight: 600 }}>{day.total_ligacoes}</td>
                      <td style={{ ...col, textAlign: 'right', color: day.tma === '—' ? 'var(--text-subtle)' : '#F97316', fontWeight: 600 }}>{day.tma}</td>
                      <td style={{ ...col, textAlign: 'center', color: 'var(--text-subtle)' }}>
                        {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      </td>
                    </tr>

                    {expanded && day.operadores.length > 0 && (
                      <>
                        {/* Sub-header */}
                        <tr>
                          <td style={{ ...subHeaderCol, paddingLeft: 36 }}>Operador</td>
                          <td style={{ ...subHeaderCol, textAlign: 'right' }}>Ligações</td>
                          <td style={{ ...subHeaderCol, textAlign: 'right' }}>TMA</td>
                          <td style={{ ...subHeaderCol, textAlign: 'right' }}>Pausa</td>
                        </tr>
                        {day.operadores.map(op => (
                          <tr key={`${day.date}-${op.nome}`}>
                            <td style={{ ...subCol, paddingLeft: 36, fontStyle: 'italic', color: 'var(--text-subtle)' }}>{op.nome}</td>
                            <td style={{ ...subCol, textAlign: 'right' }}>{op.ligacoes}</td>
                            <td style={{ ...subCol, textAlign: 'right', fontWeight: 600, color: op.tma_individual === '—' ? 'var(--text-subtle)' : '#F97316' }}>
                              {op.tma_individual}
                            </td>
                            <td style={{ ...subCol, textAlign: 'right', color: op.pausa ? 'var(--text-2)' : 'var(--text-subtle)' }}>
                              {op.pausa || '—'}
                            </td>
                          </tr>
                        ))}
                      </>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

    </main>
  )
}
