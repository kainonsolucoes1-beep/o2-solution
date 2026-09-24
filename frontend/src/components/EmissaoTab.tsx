import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Copy } from 'lucide-react'
import api from '../api'
import { parseUTC } from '../utils/date'

export interface EmissaoResumo {
  date_from: string; date_to: string; operador: string | null
  enviados: number; valor_total: number; ticket_medio: number; enviados_anterior: number
  em_emissao: number; em_emissao_valor: number
  parados: { lead_id: string; cliente: string; operadora: string; operador: string; valor: number | null; dias: number }[]
  parados_valor: number
  declinados: number; declinados_valor: number
  por_operadora: { operadora: string; count: number; valor: number }[]
  por_operador: { operador: string; count: number; valor: number }[]
  serie: { data: string; count: number }[]
  contratos: { evento_id: string; tipo: 'linha' | 'historico'; lead_id: string; cliente: string; operadora: string; valor: number | null; operador: string; em: string }[]
}

type Periodo = 'hoje' | 'ontem' | '7dias' | 'mes'
const PERIODOS: { key: Periodo; label: string }[] = [
  { key: 'hoje', label: 'Hoje' }, { key: 'ontem', label: 'Ontem' }, { key: '7dias', label: '7 dias' }, { key: 'mes', label: 'Mês' },
]

const ACCENT = '#0E7490'
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const fmtBrl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtBrlInt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const fmtDia = (s: string) => s.split('-').reverse().slice(0, 2).join('/')
const initials = (n: string) => n.trim().slice(0, 2).toUpperCase()

export function periodoRange(p: Periodo): { from: string; to: string } {
  const hoje = new Date()
  const d = (n: number) => { const x = new Date(hoje); x.setDate(x.getDate() - n); return iso(x) }
  if (p === 'ontem') return { from: d(1), to: d(1) }
  if (p === '7dias') return { from: d(6), to: d(0) }
  if (p === 'mes') return { from: iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), to: d(0) }
  return { from: d(0), to: d(0) }
}

// Texto pronto pra colar no WhatsApp/e-mail (asteriscos = negrito no WhatsApp).
export function resumoEmTexto(r: EmissaoResumo, periodo: Periodo): string {
  const quando = periodo === 'hoje' ? 'hoje' : periodo === 'ontem' ? 'ontem' : periodo === '7dias' ? 'nos últimos 7 dias' : 'no mês'
  const titulo = r.date_from === r.date_to ? fmtDia(r.date_from) + '/' + r.date_from.slice(0, 4) : `${fmtDia(r.date_from)} a ${fmtDia(r.date_to)}`
  const delta = r.enviados - r.enviados_anterior
  const vs = periodo === 'hoje' ? 'ontem' : periodo === 'ontem' ? 'anteontem' : 'período anterior'
  const L: string[] = [`*Emissão de contrato — ${titulo}*`, '']
  L.push(`Enviados ${quando}: *${r.enviados} contrato${r.enviados === 1 ? '' : 's'}* · ${fmtBrl(r.valor_total)}`)
  if (r.enviados > 0) L.push(`(${delta >= 0 ? '+' : ''}${delta} vs. ${vs} · ticket médio ${fmtBrl(r.ticket_medio)})`)
  if (r.por_operadora.length) { L.push('', '*Por operadora*', ...r.por_operadora.map(o => `${o.operadora} ${o.count} · ${fmtBrl(o.valor)}`)) }
  if (r.por_operador.length) { L.push('', '*Por operador*', ...r.por_operador.map(o => `${o.operador} ${o.count} · ${fmtBrl(o.valor)}`)) }
  L.push('', `Em emissão agora: ${r.em_emissao} contrato${r.em_emissao === 1 ? '' : 's'} · ${fmtBrl(r.em_emissao_valor)}`)
  if (r.declinados > 0) L.push(`Declinados: ${r.declinados} contrato${r.declinados === 1 ? '' : 's'} · ${fmtBrl(r.declinados_valor)}`)
  if (r.parados.length) L.push(`Atenção: ${r.parados.length} parado${r.parados.length === 1 ? '' : 's'} há mais de 3 dias (${fmtBrl(r.parados_valor)})`)
  L.push('', `Detalhes: ${window.location.host} › Gestão Comercial › Emissão`)
  return L.join('\n')
}

const card: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14 }
const eyebrow: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)' }
const rowLine: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderTop: '1px solid var(--border-lt)' }

export default function EmissaoTab() {
  const navigate = useNavigate()
  const [periodo, setPeriodo] = useState<Periodo>('hoje')
  const [operador, setOperador] = useState('')
  const [data, setData] = useState<EmissaoResumo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [copied, setCopied] = useState(false)
  const [conhecidos, setConhecidos] = useState<string[]>([])
  const [operadoras, setOperadoras] = useState<string[]>([])
  const [savingId, setSavingId] = useState<string | null>(null)
  const [fixError, setFixError] = useState('')

  const load = useCallback(() => {
    const { from, to } = periodoRange(periodo)
    const qp = new URLSearchParams({ date_from: from, date_to: to })
    if (operador) qp.set('operador', operador)
    setLoading(true)
    api.get<EmissaoResumo>(`/api/v1/emissao/resumo?${qp}`)
      .then(r => {
        setData(r.data); setError(false)
        setConhecidos(prev => Array.from(new Set([...prev, ...r.data.por_operador.map(o => o.operador), ...r.data.parados.map(p => p.operador)])).filter(n => n !== '—').sort())
      })
      .catch(() => { setData(null); setError(true) })
      .finally(() => setLoading(false))
  }, [periodo, operador])

  useEffect(() => { load() }, [load])

  const semOperadora = data ? data.contratos.filter(c => c.operadora === 'Sem operadora').length : 0
  useEffect(() => {
    if (semOperadora === 0 || operadoras.length > 0) return
    api.get<string[]>('/api/v1/leads/operadoras-emissao').then(r => setOperadoras(r.data)).catch(() => {})
  }, [semOperadora, operadoras.length])

  // Define a operadora de um envio (inclusive os anteriores a janela existir e os
  // de lead que ja' saiu de Emissao). Nao conta envio novo.
  function definirOperadora(c: EmissaoResumo['contratos'][number], operadora: string) {
    if (!operadora) return
    setSavingId(c.evento_id); setFixError('')
    api.post('/api/v1/emissao/definir-operadora', { tipo: c.tipo, evento_id: c.evento_id, operadora })
      .then(() => load())
      .catch(err => {
        const detail = err?.response?.data?.detail
        setFixError(typeof detail === 'string' ? detail : 'Não foi possível salvar a operadora.')
      })
      .finally(() => setSavingId(null))
  }

  const maxOperadora = useMemo(() => Math.max(1, ...(data?.por_operadora.map(o => o.valor) ?? [1])), [data])
  const maxSerie = useMemo(() => Math.max(1, ...(data?.serie.map(s => s.count) ?? [1])), [data])
  const totalValor = data?.valor_total || 0

  function copiar() {
    if (!data) return
    navigator.clipboard.writeText(resumoEmTexto(data, periodo)).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2200) })
  }

  const multiDia = data ? data.date_from !== data.date_to : false
  const fmtQuando = (em: string) => {
    const d = new Date(parseUTC(em))
    const h = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    return multiDia ? `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${h}` : h
  }
  const deltaLabel = data
    ? (() => { const d = data.enviados - data.enviados_anterior; return `${d >= 0 ? '+' : ''}${d} vs. ${periodo === 'hoje' ? 'ontem' : 'período anterior'}` })()
    : ''

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* Controles */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 10, padding: 3, background: 'var(--bg-card)' }}>
          {PERIODOS.map(p => (
            <button
              key={p.key} onClick={() => setPeriodo(p.key)} aria-pressed={periodo === p.key}
              style={{ padding: '6px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600,
                background: periodo === p.key ? ACCENT : 'transparent', color: periodo === p.key ? '#fff' : 'var(--text-muted)' }}
            >{p.label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {conhecidos.length > 1 && (
            <select
              value={operador} onChange={e => setOperador(e.target.value)} aria-label="Filtrar por operador"
              style={{ height: 36, padding: '0 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-2)', fontFamily: 'inherit', fontSize: 12.5 }}
            >
              <option value="">Todos os operadores</option>
              {conhecidos.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          )}
          <button
            onClick={copiar} disabled={!data}
            style={{ display: 'flex', alignItems: 'center', gap: 6, height: 36, padding: '0 16px', borderRadius: 9, border: 'none', background: copied ? '#059669' : ACCENT, color: '#fff', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, cursor: data ? 'pointer' : 'not-allowed', opacity: data ? 1 : 0.5 }}
          >
            {copied ? <><Check size={14} /> Copiado</> : <><Copy size={14} /> Copiar resumo</>}
          </button>
        </div>
      </div>

      {error && <div style={{ ...card, padding: 18, color: '#DC2626', fontSize: 13 }}>Não foi possível carregar o indicador. <button onClick={load} style={{ background: 'none', border: 'none', color: ACCENT, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Tentar de novo</button></div>}
      {!error && loading && !data && <div style={{ ...card, padding: 24, color: 'var(--text-subtle)', fontSize: 13 }}>Carregando…</div>}

      {data && (
        <>
          {/* Indicadores */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, opacity: loading ? 0.6 : 1, transition: 'opacity 150ms' }}>
            <div style={{ ...card, padding: '18px 20px' }}>
              <span style={eyebrow}>Enviados para emissão</span>
              <p style={{ margin: '10px 0 4px', fontSize: 36, fontWeight: 800, color: 'var(--text-1)', letterSpacing: '-0.02em', lineHeight: 1 }}>{data.enviados}</p>
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-muted)' }}>contrato{data.enviados === 1 ? '' : 's'} · <b style={{ color: ACCENT }}>{deltaLabel}</b></p>
            </div>
            <div style={{ ...card, padding: '18px 20px' }}>
              <span style={eyebrow}>Em emissão agora</span>
              <p style={{ margin: '10px 0 4px', fontSize: 36, fontWeight: 800, color: 'var(--text-1)', letterSpacing: '-0.02em', lineHeight: 1 }}>{data.em_emissao}</p>
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-muted)' }}>{fmtBrl(data.em_emissao_valor)} em andamento</p>
            </div>
            <div style={{ ...card, padding: '18px 20px', ...(data.declinados ? { background: 'rgba(220,38,38,0.06)', borderColor: 'rgba(220,38,38,0.30)' } : {}) }}>
              <span style={{ ...eyebrow, color: data.declinados ? '#991B1B' : 'var(--text-muted)' }}>Declinados</span>
              <p style={{ margin: '10px 0 4px', fontSize: 36, fontWeight: 800, color: data.declinados ? '#B91C1C' : 'var(--text-1)', letterSpacing: '-0.02em', lineHeight: 1 }}>{data.declinados}</p>
              <p style={{ margin: 0, fontSize: 12.5, color: data.declinados ? '#991B1B' : 'var(--text-muted)' }}>{data.declinados ? `${fmtBrl(data.declinados_valor)} em contratos declinados` : 'nenhum declinado no período'}</p>
            </div>
            <div style={{ ...card, padding: '18px 20px', ...(data.parados.length ? { background: 'rgba(245,158,11,0.10)', borderColor: 'rgba(245,158,11,0.40)' } : {}) }}>
              <span style={{ ...eyebrow, color: data.parados.length ? '#92400E' : 'var(--text-muted)' }}>Parados há mais de 3 dias</span>
              <p style={{ margin: '10px 0 4px', fontSize: 36, fontWeight: 800, color: data.parados.length ? '#B45309' : 'var(--text-1)', letterSpacing: '-0.02em', lineHeight: 1 }}>{data.parados.length}</p>
              <p style={{ margin: 0, fontSize: 12.5, color: data.parados.length ? '#92400E' : 'var(--text-muted)' }}>{data.parados.length ? `${fmtBrl(data.parados_valor)} aguardando a operadora` : 'nenhum contrato parado'}</p>
            </div>
          </div>

          {/* Por operadora + por operador */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 14 }}>
            <div style={{ ...card, padding: '20px 22px' }}>
              <span style={eyebrow}>Por operadora</span>
              {data.por_operadora.length === 0 && <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--text-subtle)' }}>Nenhum envio neste período.</p>}
              {data.por_operadora.map((o, i) => (
                <div key={o.operadora} style={{ ...rowLine, borderTop: i === 0 ? 'none' : rowLine.borderTop }}>
                  <span style={{ width: 100, fontSize: 13, fontWeight: 700, color: o.operadora === 'Sem operadora' ? 'var(--text-muted)' : 'var(--text-1)' }}>{o.operadora}</span>
                  <div style={{ flex: 1, height: 9, borderRadius: 999, background: 'var(--bg-subtle)', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.max(3, (o.valor / maxOperadora) * 100)}%`, height: '100%', borderRadius: 999, background: o.operadora === 'Sem operadora' ? '#9CA3AF' : ACCENT }} />
                  </div>
                  <span style={{ width: 24, textAlign: 'right', fontSize: 12.5, color: 'var(--text-muted)' }}>{o.count}</span>
                  <span style={{ width: 96, textAlign: 'right', fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }}>{fmtBrl(o.valor)}</span>
                </div>
              ))}
            </div>

            <div style={{ ...card, padding: '20px 22px' }}>
              <span style={eyebrow}>Por operador · quem enviou</span>
              {data.por_operador.length === 0 && <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--text-subtle)' }}>Nenhum envio neste período.</p>}
              {data.por_operador.map((o, i) => (
                <div key={o.operador} style={{ ...rowLine, borderTop: i === 0 ? 'none' : rowLine.borderTop }}>
                  <span style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0, background: i === 0 ? ACCENT : 'var(--bg-subtle)', color: i === 0 ? '#fff' : 'var(--text-3b, #475569)', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{initials(o.operador)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: 'var(--text-1)' }}>{o.operador}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 11.5, color: 'var(--text-subtle)' }}>{totalValor > 0 ? Math.round((o.valor / totalValor) * 100) : 0}% do valor</p>
                  </div>
                  <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-1)', width: 30, textAlign: 'right' }}>{o.count}</span>
                  <span style={{ width: 96, textAlign: 'right', fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }}>{fmtBrl(o.valor)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 7 dias + parados */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 14 }}>
            <div style={{ ...card, padding: '20px 22px 16px' }}>
              <span style={eyebrow}>Últimos 7 dias</span>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, height: 150, marginTop: 16, padding: '0 4px' }}>
                {data.serie.map((s, i) => {
                  const ultimo = i === data.serie.length - 1
                  return (
                    <div key={s.data} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, justifyContent: 'flex-end', height: '100%' }}>
                      <span style={{ fontSize: 12, fontWeight: ultimo ? 800 : 700, color: ultimo ? ACCENT : 'var(--text-muted)' }}>{s.count}</span>
                      <div style={{ width: '100%', maxWidth: 40, height: `${Math.max(3, (s.count / maxSerie) * 90)}px`, background: ultimo ? ACCENT : 'rgba(14,116,144,0.32)', borderRadius: '7px 7px 0 0' }} />
                      <span style={{ fontSize: 10.5, color: ultimo ? ACCENT : 'var(--text-subtle)', fontWeight: ultimo ? 700 : 500 }}>{fmtDia(s.data)}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            <div style={{ ...card, padding: '20px 22px' }}>
              <span style={eyebrow}>Parados na emissão</span>
              {data.parados.length === 0 && <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--text-subtle)' }}>Nenhum contrato parado há mais de 3 dias.</p>}
              {data.parados.slice(0, 6).map((p, i) => (
                <div key={p.lead_id} style={{ ...rowLine, borderTop: i === 0 ? 'none' : rowLine.borderTop }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.cliente}</p>
                    <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>{p.operadora} · {p.operador}{p.valor != null ? ` · ${fmtBrl(p.valor)}` : ''}</p>
                  </div>
                  <span style={{ fontSize: 11.5, fontWeight: 700, padding: '4px 10px', borderRadius: 999, background: 'rgba(245,158,11,0.18)', color: '#92400E', whiteSpace: 'nowrap' }}>{p.dias} dias</span>
                  <button onClick={() => navigate(`/leads/${p.lead_id}`)} style={{ background: 'none', border: 'none', color: ACCENT, fontFamily: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Abrir ›</button>
                </div>
              ))}
            </div>
          </div>

          {/* Lista */}
          <div style={{ ...card, padding: '20px 22px 8px', overflowX: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end', marginBottom: 12 }}>
              <span style={{ fontSize: 11.5, color: 'var(--text-subtle)' }}>{data.enviados} contrato{data.enviados === 1 ? '' : 's'} · {fmtBrl(data.valor_total)}</span>
            </div>
            {semOperadora > 0 && (
              <p style={{ margin: '0 0 12px', padding: '9px 12px', borderRadius: 9, background: 'rgba(245,158,11,0.10)', color: '#92400E', fontSize: 12.5 }}>
                {semOperadora} envio{semOperadora === 1 ? '' : 's'} sem operadora. Escolha na lista da linha para preencher; isso não conta como envio novo.
              </p>
            )}
            {fixError && <p style={{ margin: '0 0 12px', fontSize: 12.5, color: '#DC2626' }}>{fixError}</p>}
            {data.contratos.length === 0 ? (
              <p style={{ margin: '4px 0 14px', fontSize: 13, color: 'var(--text-subtle)' }}>Nenhum envio neste período.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
                <thead>
                  <tr>
                    {['Cliente', 'Operadora', 'Valor do contrato', 'Enviado por', multiDia ? 'Quando' : 'Horário', ''].map((h, i) => (
                      <th key={i} style={{ textAlign: h === 'Valor do contrato' ? 'right' : 'left', fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-subtle)', padding: h === 'Enviado por' ? '0 12px 10px 24px' : '0 12px 10px 0', borderBottom: '1px solid var(--border)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.contratos.map(c => (
                    <tr key={c.lead_id + c.em}>
                      <td style={{ padding: '12px 12px 12px 0', borderBottom: '1px solid var(--border-lt)', fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{c.cliente}</td>
                      <td style={{ padding: '12px 12px 12px 0', borderBottom: '1px solid var(--border-lt)', fontSize: 13, color: 'var(--text-2)' }}>
                        {c.operadora === 'Sem operadora' ? (
                          <select
                            value="" disabled={savingId === c.evento_id || operadoras.length === 0}
                            onChange={e => definirOperadora(c, e.target.value)}
                            aria-label={`Definir a operadora de ${c.cliente}`}
                            style={{ height: 30, padding: '0 8px', borderRadius: 8, border: '1px solid rgba(245,158,11,0.55)', background: 'rgba(245,158,11,0.10)', color: '#92400E', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600 }}
                          >
                            <option value="">{savingId === c.evento_id ? 'Salvando…' : 'Definir operadora…'}</option>
                            {operadoras.map(op => <option key={op} value={op}>{op}</option>)}
                          </select>
                        ) : c.operadora}
                      </td>
                      <td style={{ padding: '12px 12px 12px 0', borderBottom: '1px solid var(--border-lt)', fontSize: 13, fontWeight: 700, color: 'var(--text-1)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{c.valor != null ? fmtBrl(c.valor) : '—'}</td>
                      <td style={{ padding: '12px 12px 12px 24px', borderBottom: '1px solid var(--border-lt)', fontSize: 13, color: 'var(--text-2)' }}>{c.operador}</td>
                      <td style={{ padding: '12px 12px 12px 0', borderBottom: '1px solid var(--border-lt)', fontSize: 13, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{fmtQuando(c.em)}</td>
                      <td style={{ padding: '12px 0', borderBottom: '1px solid var(--border-lt)', textAlign: 'right' }}>
                        <button onClick={() => navigate(`/leads/${c.lead_id}`)} style={{ background: 'none', border: 'none', color: ACCENT, fontFamily: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>Abrir ficha ›</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  )
}
