import { useEffect, useState } from 'react'
import { X, BarChart3 } from 'lucide-react'
import {
  ComposedChart, BarChart, Bar, Line, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import api from '../api'

// Análise gráfica do drawer de Ponto de conversão: captação ao longo do tempo
// (dia / semana / mês), resumo (média, pico, período anterior) e captação por
// dia da semana. Os dados vêm de /kpis/conv-point-serie.

type Gran = 'dia' | 'semana' | 'mes'
const GRANS: { key: Gran; label: string }[] = [
  { key: 'dia', label: 'Dia' },
  { key: 'semana', label: 'Semana' },
  { key: 'mes', label: 'Mês' },
]
const UNIDADE: Record<Gran, string> = { dia: 'dia', semana: 'semana', mes: 'mês' }
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const DIAS_SEMANA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

const COR_CAPTADOS = '#93B4F5'
const COR_CAPTADOS_FORTE = '#2563EB'
const COR_VENDAS = '#15803D'
const COR_CANCELADOS = '#DC2626'

const TOOLTIP = {
  contentStyle: { fontSize: 12, borderRadius: 8, border: '1px solid var(--border)', backgroundColor: 'var(--bg-card)', color: 'var(--text-2)' },
  labelStyle: { color: 'var(--text-1)', fontWeight: 600, marginBottom: 2 },
  itemStyle: { color: 'var(--text-2)' },
  cursor: { fill: 'var(--bg-subtle)' },
}

interface Bucket { inicio: string; fim: string; captados: number; vendas: number; cancelados: number }
interface Serie { buckets: Bucket[]; dias_semana: { dia: number; captados: number }[]; total: number; anterior: number | null }

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function parse(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const ddmm = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`
const mesAno = (s: string) => `${MESES[Number(s.slice(5, 7)) - 1]}/${s.slice(2, 4)}`

function rotulo(b: Bucket, g: Gran, longo = false): string {
  if (g === 'mes') return longo ? `${mesAno(b.inicio)}` : mesAno(b.inicio)
  if (g === 'semana') return longo ? `${ddmm(b.inicio)} a ${ddmm(b.fim)}` : ddmm(b.inicio)
  return ddmm(b.inicio)
}
const fmtNum = (n: number, dec = 0) => n.toLocaleString('pt-BR', { maximumFractionDigits: dec, minimumFractionDigits: 0 })

export default function AnaliseGraficaModal({
  titulo, subtitulo, convPoint, origens, team, campanha, recorte, recorteAnterior, onClose,
}: {
  titulo: string
  subtitulo: string
  convPoint: string
  origens?: string[]
  team?: string
  campanha?: string
  recorte: { from: Date; to: Date }
  recorteAnterior: { from: Date; to: Date } | null
  onClose: () => void
}) {
  const umDia = iso(recorte.from) === iso(recorte.to)
  const [gran, setGran] = useState<Gran>(umDia ? 'mes' : 'dia')
  const [serie, setSerie] = useState<Serie | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(false)

  // dia/semana: o recorte do painel; mês: os 12 meses até o fim do recorte
  const faixa = (() => {
    if (gran !== 'mes') return { from: recorte.from, to: recorte.to, prev: recorteAnterior }
    const to = recorte.to
    const from = new Date(to.getFullYear(), to.getMonth() - 11, 1)
    const prevTo = new Date(from); prevTo.setDate(from.getDate() - 1)
    const prevFrom = new Date(from.getFullYear(), from.getMonth() - 12, 1)
    return { from, to, prev: { from: prevFrom, to: prevTo } }
  })()
  const chave = `${gran}|${iso(faixa.from)}|${iso(faixa.to)}`

  useEffect(() => {
    let vivo = true
    setLoading(true)
    setErro(false)
    const qp = new URLSearchParams({ conv_point: convPoint, granularidade: gran, date_from: iso(faixa.from), date_to: iso(faixa.to) })
    if (faixa.prev) { qp.set('prev_from', iso(faixa.prev.from)); qp.set('prev_to', iso(faixa.prev.to)) }
    if (origens?.length) qp.set('origens', origens.join(','))
    if (team) qp.set('team', team)
    if (campanha) qp.set('campanha_midia', campanha)
    api.get<Serie>(`/api/v1/kpis/conv-point-serie?${qp}`)
      .then(r => { if (vivo) setSerie(r.data) })
      .catch(() => { if (vivo) { setSerie(null); setErro(true) } })
      .finally(() => { if (vivo) setLoading(false) })
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, convPoint, team, campanha])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const buckets = serie?.buckets ?? []
  const dados = buckets.map(b => ({ ...b, label: rotulo(b, gran), labelLongo: rotulo(b, gran, true) }))
  const total = serie?.total ?? 0
  const media = buckets.length ? total / buckets.length : 0
  const pico = buckets.reduce<Bucket | null>((m, b) => (!m || b.captados > m.captados ? b : m), null)
  const anterior = serie?.anterior ?? null
  const variacao = anterior && anterior > 0 ? (total - anterior) / anterior * 100 : null
  const semana = (serie?.dias_semana ?? []).map(d => ({ ...d, nome: DIAS_SEMANA[d.dia] }))
  const maxSemana = Math.max(0, ...semana.map(d => d.captados))
  const totalSemana = semana.reduce((a, d) => a + d.captados, 0)

  const card = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px' } as const
  const secTitulo = { fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 14px' } as const
  const periodoTxt = gran === 'mes'
    ? `Últimos 12 meses: ${mesAno(iso(faixa.from))} a ${mesAno(iso(faixa.to))}`
    : `${ddmm(iso(faixa.from))}/${faixa.from.getFullYear()} a ${ddmm(iso(faixa.to))}/${faixa.to.getFullYear()}`

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 120, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`Análise gráfica — ${titulo}`}
        style={{ background: 'var(--bg-subtle)', borderRadius: 16, width: '100%', maxWidth: 960, maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 64px rgba(15,23,42,.28)' }}>
        {/* Cabeçalho */}
        <div style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: '18px 24px 16px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <span aria-hidden="true" style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(37,99,235,0.10)', color: '#2563EB', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <BarChart3 size={18} />
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Análise gráfica</p>
              <p title={titulo} style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1)', margin: '2px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{titulo}</p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>{subtitulo}</p>
            </div>
            <button onClick={onClose} aria-label="Fechar análise gráfica" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 6, borderRadius: 8, flexShrink: 0, display: 'inline-flex' }}>
              <X size={20} />
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 14 }}>
            <div role="tablist" aria-label="Agrupar por" style={{ display: 'inline-flex', background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: 9, padding: 3, gap: 2 }}>
              {GRANS.map(g => {
                const ativo = gran === g.key
                return (
                  <button key={g.key} role="tab" aria-selected={ativo} onClick={() => setGran(g.key)}
                    style={{ border: 'none', borderRadius: 7, padding: '6px 16px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', background: ativo ? 'var(--bg-card)' : 'transparent', color: ativo ? '#2563EB' : 'var(--text-muted)', boxShadow: ativo ? '0 1px 2px rgba(15,23,42,.12)' : 'none' }}>
                    {g.label}
                  </button>
                )
              })}
            </div>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{periodoTxt}</span>
          </div>
        </div>

        {/* Corpo */}
        <div style={{ padding: '18px 24px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {loading ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                {[0, 1, 2].map(i => <div key={i} style={{ height: 84, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12 }} />)}
              </div>
              <div style={{ height: 320, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12 }} />
            </>
          ) : erro ? (
            <div style={{ ...card, textAlign: 'center', color: 'var(--text-muted)', padding: '40px 18px' }}>Não foi possível carregar a análise gráfica.</div>
          ) : total === 0 ? (
            <div style={{ ...card, textAlign: 'center', padding: '44px 18px' }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>Nenhum lead neste período</p>
              <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '6px 0 0' }}>{gran === 'mes' ? 'Nenhuma captação nos últimos 12 meses.' : 'Experimente a visão por mês.'}</p>
            </div>
          ) : (
            <>
              {/* Resumo */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                <div style={{ ...card, padding: '14px 16px' }}>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, margin: 0 }}>Média por {UNIDADE[gran]}</p>
                  <p style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-1)', margin: '4px 0 2px', fontVariantNumeric: 'tabular-nums' }}>{fmtNum(media, 1)}</p>
                  <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: 0 }}>{fmtNum(total)} captados em {buckets.length} {buckets.length === 1 ? UNIDADE[gran] : gran === 'mes' ? 'meses' : `${UNIDADE[gran]}s`}</p>
                </div>
                <div style={{ ...card, padding: '14px 16px' }}>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, margin: 0 }}>Pico</p>
                  <p style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-1)', margin: '4px 0 2px', fontVariantNumeric: 'tabular-nums' }}>{pico ? fmtNum(pico.captados) : '—'}</p>
                  <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: 0 }}>{pico ? (gran === 'semana' ? `semana de ${rotulo(pico, gran, true)}` : gran === 'mes' ? `em ${rotulo(pico, gran, true)}` : `em ${ddmm(pico.inicio)}`) : ''}</p>
                </div>
                <div style={{ ...card, padding: '14px 16px' }}>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, margin: 0 }}>{gran === 'mes' ? 'Vs. 12 meses anteriores' : 'Vs. período anterior'}</p>
                  <p style={{ fontSize: 22, fontWeight: 700, margin: '4px 0 2px', fontVariantNumeric: 'tabular-nums', color: variacao === null ? 'var(--text-1)' : variacao >= 0 ? COR_VENDAS : COR_CANCELADOS }}>
                    {variacao === null ? '—' : `${variacao >= 0 ? '+' : ''}${fmtNum(variacao, 1)}%`}
                  </p>
                  <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: 0 }}>
                    {anterior === null || anterior === 0 ? 'sem base anterior' : `${fmtNum(total)} agora · ${fmtNum(anterior)} antes`}
                  </p>
                </div>
              </div>

              {/* Gráfico principal */}
              <div style={card}>
                <p style={secTitulo}>Captação por {UNIDADE[gran]}</p>
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={dados} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-lt)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-subtle)' }} interval="preserveStartEnd" minTickGap={8} />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--text-subtle)' }} allowDecimals={false} />
                    <Tooltip
                      {...TOOLTIP}
                      labelFormatter={(_, p) => {
                        const b = p?.[0]?.payload as (Bucket & { labelLongo: string }) | undefined
                        if (!b) return ''
                        return gran === 'semana' ? `Semana de ${b.labelLongo}` : gran === 'mes' ? b.labelLongo : `${ddmm(b.inicio)}/${b.inicio.slice(0, 4)}`
                      }}
                    />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11.5 }} />
                    <Bar dataKey="captados" name="Captados" fill={COR_CAPTADOS} radius={[4, 4, 0, 0]} maxBarSize={44} />
                    <Line type="monotone" dataKey="vendas" name="Vendas" stroke={COR_VENDAS} strokeWidth={2} dot={dados.length <= 31 ? { r: 3, fill: COR_VENDAS } : false} activeDot={{ r: 5 }} />
                    <Line type="monotone" dataKey="cancelados" name="Cancelados" stroke={COR_CANCELADOS} strokeWidth={2} dot={dados.length <= 31 ? { r: 3, fill: COR_CANCELADOS } : false} activeDot={{ r: 5 }} />
                  </ComposedChart>
                </ResponsiveContainer>
                <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '8px 0 0' }}>
                  Vendas e cancelados contam pela data em que o lead foi captado.
                </p>
              </div>

              {/* Dia da semana */}
              <div style={card}>
                <p style={secTitulo}>Captação por dia da semana</p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={semana} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-lt)" vertical={false} />
                    <XAxis dataKey="nome" tick={{ fontSize: 11.5, fill: 'var(--text-subtle)' }} />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--text-subtle)' }} allowDecimals={false} />
                    <Tooltip
                      {...TOOLTIP}
                      formatter={(v) => [`${fmtNum(Number(v))} (${totalSemana ? fmtNum(Number(v) / totalSemana * 100, 1) : 0}%)`, 'Captados']}
                    />
                    <Bar dataKey="captados" name="Captados" radius={[4, 4, 0, 0]} maxBarSize={56}>
                      {semana.map(d => <Cell key={d.dia} fill={d.captados === maxSemana && maxSemana > 0 ? COR_CAPTADOS_FORTE : COR_CAPTADOS} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                {maxSemana > 0 && (
                  <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '8px 0 0' }}>
                    Dia mais forte: <b style={{ color: 'var(--text-1)' }}>{semana.filter(d => d.captados === maxSemana).map(d => d.nome).join(', ')}</b>
                    {' '}({fmtNum(maxSemana / totalSemana * 100, 1)}% dos captados no período).
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
