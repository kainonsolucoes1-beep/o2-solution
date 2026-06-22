import { useEffect, useState } from 'react'
import { Phone, Plus, Trash2, Save } from 'lucide-react'
import api from '../api'

interface TelefoniaSettings {
  tma: string
  ligacoes: Record<string, number>
  atendimentos: Record<string, string>
}

interface Row { name: string; count: string; atendimento: string }

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

export default function Telefonia() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [rows, setRows] = useState<Row[]>([])

  useEffect(() => {
    api.get<TelefoniaSettings>('/api/v1/telefonia/settings')
      .then(r => {
        const { ligacoes, atendimentos } = r.data
        setRows(
          Object.entries(ligacoes).map(([name, count]) => ({
            name,
            count: String(count),
            atendimento: atendimentos[name] ?? '',
          }))
        )
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  function addRow() {
    setRows(r => [...r, { name: '', count: '', atendimento: '' }])
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
    for (const row of rows) {
      const n = row.name.trim()
      const c = parseInt(row.count)
      if (n && !isNaN(c) && c >= 0) {
        ligacoes[n] = c
        if (row.atendimento.trim()) atendimentos[n] = row.atendimento.trim()
      }
    }
    try {
      await api.put('/api/v1/telefonia/settings', { ligacoes, atendimentos })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
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

  return (
    <main style={{ padding: '24px 32px', maxWidth: 780 }}>

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

      {/* TMA calculado */}
      <div className="bg-white rounded-xl p-6" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#FFF7ED', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Phone size={15} color="#F97316" />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', margin: 0 }}>Tempo Médio de Atendimento (TMA)</p>
            <p style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 2 }}>Calculado automaticamente a partir dos dados abaixo</p>
          </div>
          <span style={{ fontSize: 22, fontWeight: 700, color: tmaCalc === '—' ? 'var(--text-subtle)' : '#F97316' }}>
            {tmaCalc}
          </span>
        </div>
      </div>

      {/* Ligações + Atendimento por operador */}
      <div className="bg-white rounded-xl p-6" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', margin: 0 }}>Ligações por Operador</p>
            <p style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 2 }}>Usadas na taxa de conversão diária, no ranking e no cálculo do TMA</p>
          </div>
          <button
            onClick={addRow}
            style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: 7, padding: '6px 12px', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            <Plus size={13} /> Adicionar
          </button>
        </div>

        {rows.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-subtle)', padding: '8px 0' }}>Nenhum operador cadastrado. Clique em Adicionar.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 140px 36px', gap: 10, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
              {['Operador', 'Ligações', 'Atendimento', ''].map(h => (
                <span key={h} style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</span>
              ))}
            </div>
            {rows.map((row, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 140px 36px', gap: 10, alignItems: 'center' }}>
                {inp(row.name, v => updateRow(i, 'name', v), 'Nome do operador')}
                {inp(row.count, v => updateRow(i, 'count', v), '0')}
                {inp(row.atendimento, v => updateRow(i, 'atendimento', v), '00:00:00')}
                <button
                  onClick={() => removeRow(i)}
                  style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 7, padding: '7px', cursor: 'pointer', color: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

    </main>
  )
}
