import { useEffect, useState } from 'react'
import {
  ComposedChart, BarChart, Bar, Line, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import api from '../api'

// Aba "Análise de leads" do KPIs (modelo A aprovado em 04/11/2026): indicadores,
// captação no tempo (dia / semana / mês), dia da semana, funil, modalidade e
// pontos de conversão — com filtro de Campanha e de Ponto de conversão. O
// período e a equipe vêm dos filtros do topo da página.

type Gran = 'dia' | 'semana' | 'mes'
const GRANS: { key: Gran; label: string }[] = [
  { key: 'dia', label: 'Dia' },
  { key: 'semana', label: 'Semana' },
  { key: 'mes', label: 'Mês' },
]
const UNIDADE: Record<Gran, string> = { dia: 'dia', semana: 'semana', mes: 'mês' }
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
const DIAS_LONGO = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo']

const COR = { captados: '#93B4F5', forte: '#2563EB', aberto: '#3B82F6', vendas: '#15803D', cancel: '#DC2626' }
const COR_CAMPANHA: Record<string, string> = { google: '#E37400', meta: '#7C3AED', 'sem campanha': '#64748B' }

const TOOLTIP = {
  contentStyle: { fontSize: 12, borderRadius: 8, border: '1px solid var(--border)', backgroundColor: 'var(--bg-card)', color: 'var(--text-2)' },
  labelStyle: { color: 'var(--text-1)', fontWeight: 600, marginBottom: 2 },
  itemStyle: { color: 'var(--text-2)' },
  cursor: { fill: 'var(--bg-subtle)' },
}

interface Totais { captados: number; vendas: number; cancelados: number; receita_potencial?: number; base_liquida?: number }
interface Bucket { inicio: string; fim: string; captados: number; vendas: number; cancelados: number }
interface Ponto { ponto: string; campanha: string; captados: number; vendas: number; cancelados: number; receita_potencial: number }
interface Analise {
  periodo: { inicio: string; fim: string }
  totais: Required<Totais>
  anterior: Totais | null
  buckets: Bucket[]
  dias_semana: number[]
  modalidades: { nome: string; count: number }[]
  pontos: Ponto[]
  opcoes_pontos: string[]
}

export interface AnaliseFiltroInicial { convPoint?: string; campanha?: string; seq: number }

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const ddmm = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`
const mesAno = (s: string) => `${MESES[Number(s.slice(5, 7)) - 1]}/${s.slice(2, 4)}`
const fmt = (n: number, dec = 0) => n.toLocaleString('pt-BR', { maximumFractionDigits: dec, minimumFractionDigits: 0 })
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const pct = (a: number, b: number) => (b ? (a / b) * 100 : 0)

function rotulo(b: Bucket, g: Gran) {
  return g === 'mes' ? mesAno(b.inicio) : ddmm(b.inicio)
}
function rotuloLongo(b: Bucket, g: Gran) {
  if (g === 'mes') return `${MESES[Number(b.inicio.slice(5, 7)) - 1]}/${b.inicio.slice(0, 4)}`
  if (g === 'semana') return `Semana de ${ddmm(b.inicio)} a ${ddmm(b.fim)}`
  return `${ddmm(b.inicio)}/${b.inicio.slice(0, 4)}`
}

function Delta({ cur, prev, pp, subirEhBom = true, prevLabel }: { cur: number; prev: number | null | undefined; pp?: boolean; subirEhBom?: boolean; prevLabel: string }) {
  const base = { fontSize: 11.5, color: 'var(--text-muted)' } as const
  if (prev === null || prev === undefined || (!pp && prev === 0)) return <span style={base}>sem base anterior</span>
  const d = pp ? cur - prev : pct(cur - prev, prev)
  if (Math.abs(d) < 0.05) return <span style={base}>igual {prevLabel}</span>
  const bom = (d > 0) === subirEhBom
  return (
    <span style={{ ...base, color: bom ? '#15803D' : '#B91C1C', fontWeight: 600 }}>
      {d > 0 ? '↑' : '↓'} {fmt(Math.abs(d), 1)}{pp ? ' p.p.' : '%'} <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>{prevLabel}</span>
    </span>
  )
}

function Barras({ linhas, total }: { linhas: [string, number, string][]; total: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      {linhas.map(([nome, n, cor]) => (
        <div key={nome} style={{ display: 'grid', gridTemplateColumns: '92px minmax(0,1fr) 40px 46px', gap: 10, alignItems: 'center', fontSize: 13 }}>
          <span style={{ color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={nome}>{nome}</span>
          <div style={{ height: 8, background: 'var(--bg-subtle)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ width: `${pct(n, total)}%`, height: '100%', background: cor, borderRadius: 99 }} />
          </div>
          <span style={{ textAlign: 'right', fontWeight: 700, color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums' }}>{fmt(n)}</span>
          <span style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{fmt(pct(n, total), 1)}%</span>
        </div>
      ))}
    </div>
  )
}

export default function AnaliseLeadsTab({
  range, prevRange, prevLabel, team, campanhaOptions, inicial,
}: {
  range: { from: Date; to: Date }
  prevRange: { from: Date; to: Date } | null
  prevLabel: string
  team?: string
  campanhaOptions: string[]
  inicial: AnaliseFiltroInicial | null
}) {
  const [campanha, setCampanha] = useState(inicial?.campanha ?? '')
  const [convPoint, setConvPoint] = useState(inicial?.convPoint ?? '')
  const [gran, setGran] = useState<Gran>('dia')
  const [data, setData] = useState<Analise | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(false)

  // "Abrir na Análise de leads" do painel de ponto de conversão
  useEffect(() => {
    if (!inicial) return
    setCampanha(inicial.campanha ?? '')
    setConvPoint(inicial.convPoint ?? '')
  }, [inicial?.seq]) // eslint-disable-line react-hooks/exhaustive-deps

  const from = iso(range.from), to = iso(range.to)
  const pFrom = prevRange ? iso(prevRange.from) : '', pTo = prevRange ? iso(prevRange.to) : ''
  useEffect(() => {
    let vivo = true
    setLoading(true)
    setErro(false)
    const qp = new URLSearchParams({ date_from: from, date_to: to, granularidade: gran })
    if (pFrom && pTo) { qp.set('prev_from', pFrom); qp.set('prev_to', pTo) }
    if (team) qp.set('team', team)
    if (campanha) qp.set('campanha_midia', campanha)
    if (convPoint) qp.set('conv_point', convPoint)
    api.get<Analise>(`/api/v1/kpis/analise-leads?${qp}`)
      .then(r => { if (vivo) setData(r.data) })
      .catch(() => { if (vivo) { setData(null); setErro(true) } })
      .finally(() => { if (vivo) setLoading(false) })
    return () => { vivo = false }
  }, [from, to, pFrom, pTo, team, campanha, convPoint, gran])

  const sel = { border: '1px solid var(--border)', borderRadius: 8, padding: '0 10px', fontSize: 13, background: 'var(--bg-card)', color: 'var(--text-1)', height: 34, cursor: 'pointer', maxWidth: 260 } as const
  const ativo = { borderColor: '#2563EB', color: '#2563EB', fontWeight: 600 } as const
  const card = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px', minWidth: 0 } as const
  const titulo = { fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 14px' } as const
  const campanhaOpts = campanha && campanha !== 'Sem campanha' && !campanhaOptions.includes(campanha) ? [...campanhaOptions, campanha] : campanhaOptions
  const pontoOpts = convPoint && data && !data.opcoes_pontos.some(p => p.toLowerCase() === convPoint.toLowerCase()) ? [convPoint, ...data.opcoes_pontos] : data?.opcoes_pontos ?? (convPoint ? [convPoint] : [])

  const t = data?.totais
  const a = data?.anterior ?? null
  const semana = (data?.dias_semana ?? []).map((n, i) => ({ nome: DIAS[i], n }))
  const totalSemana = semana.reduce((s, d) => s + d.n, 0)
  const maxSemana = Math.max(0, ...semana.map(d => d.n))
  const buckets = (data?.buckets ?? []).map(b => ({ ...b, label: rotulo(b, gran), longo: rotuloLongo(b, gran) }))
  const modTotal = (data?.modalidades ?? []).reduce((s, m) => s + m.count, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Filtros da aba */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: '1 1 260px' }}>
          <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>Análise de leads</p>
        </div>
        <select aria-label="Campanha" value={campanha} onChange={e => setCampanha(e.target.value)} style={{ ...sel, ...(campanha ? ativo : {}) }}>
          <option value="">Campanha: todas</option>
          <option value="Sem campanha">Sem campanha</option>
          {campanhaOpts.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select aria-label="Ponto de conversão" value={convPoint} onChange={e => setConvPoint(e.target.value)} style={{ ...sel, ...(convPoint ? ativo : {}) }}>
          <option value="">Ponto de conversão: todos</option>
          {pontoOpts.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <div role="group" aria-label="Agrupar gráfico por" style={{ display: 'inline-flex', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 9, padding: 3, gap: 2 }}>
          {GRANS.map(g => (
            <button key={g.key} type="button" aria-pressed={gran === g.key} onClick={() => setGran(g.key)}
              style={{ border: 'none', borderRadius: 7, padding: '6px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', background: gran === g.key ? '#2563EB' : 'transparent', color: gran === g.key ? '#fff' : 'var(--text-muted)' }}>
              {g.label}
            </button>
          ))}
        </div>
      </div>

      {loading && !data ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            {[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="perf-skeleton" style={{ ...card, height: 92 }} />)}
          </div>
          <div className="perf-skeleton" style={{ ...card, height: 330 }} />
        </>
      ) : erro || !data || !t ? (
        <div style={{ ...card, textAlign: 'center', color: 'var(--text-muted)', padding: '40px 18px' }}>Não foi possível carregar a análise. Tente trocar o filtro ou recarregar a página.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, opacity: loading ? 0.6 : 1, transition: 'opacity 150ms' }}>
          {/* Indicadores */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            {([
              ['Captados', fmt(t.captados), <Delta key="c" cur={t.captados} prev={a?.captados} prevLabel={prevLabel} />],
              ['Vendas', fmt(t.vendas), <Delta key="v" cur={t.vendas} prev={a?.vendas} prevLabel={prevLabel} />],
              ['Conversão', `${fmt(pct(t.vendas, t.captados), 1)}%`, <Delta key="cv" pp cur={pct(t.vendas, t.captados)} prev={a && a.captados ? pct(a.vendas, a.captados) : null} prevLabel={prevLabel} />],
              ['Cancelamento', `${fmt(pct(t.cancelados, t.captados), 1)}%`, <Delta key="cn" pp subirEhBom={false} cur={pct(t.cancelados, t.captados)} prev={a && a.captados ? pct(a.cancelados, a.captados) : null} prevLabel={prevLabel} />],
              ['Receita potencial', brl(t.receita_potencial), <span key="r" style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>leads não cancelados</span>],
              ['Ticket médio', t.base_liquida ? brl(t.receita_potencial / t.base_liquida) : '—', <span key="t" style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>por lead não cancelado</span>],
            ] as const).map(([label, valor, delta]) => (
              <div key={label} style={{ ...card, padding: '14px 16px' }}>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, margin: 0 }}>{label}</p>
                <p style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-1)', margin: '4px 0 2px', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>{valor}</p>
                {delta}
              </div>
            ))}
          </div>

          {t.captados === 0 && gran !== 'mes' ? (
            <div style={{ ...card, textAlign: 'center', padding: '44px 18px' }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>Nenhum lead neste recorte</p>
              <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '6px 0 0' }}>Troque a campanha, o ponto de conversão ou o período no topo da página.</p>
            </div>
          ) : (
            <>
              {/* Captação no tempo */}
              <div style={card}>
                <p style={titulo}>Captação por {UNIDADE[gran]}{gran === 'mes' ? ' · últimos 12 meses' : ''}</p>
                <ResponsiveContainer width="100%" height={290}>
                  <ComposedChart data={buckets} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-lt)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-subtle)' }} interval="preserveStartEnd" minTickGap={10} />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--text-subtle)' }} allowDecimals={false} />
                    <Tooltip {...TOOLTIP} labelFormatter={(_, p) => (p?.[0]?.payload as { longo?: string } | undefined)?.longo ?? ''} />
                    <Bar dataKey="captados" name="Captados" fill={COR.captados} radius={[4, 4, 0, 0]} maxBarSize={44} />
                    <Line type="monotone" dataKey="vendas" name="Vendas" stroke={COR.vendas} strokeWidth={2} dot={buckets.length <= 31 ? { r: 3, fill: COR.vendas } : false} activeDot={{ r: 5 }} />
                    <Line type="monotone" dataKey="cancelados" name="Cancelados" stroke={COR.cancel} strokeWidth={2} dot={buckets.length <= 31 ? { r: 3, fill: COR.cancel } : false} activeDot={{ r: 5 }} />
                  </ComposedChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-2)', marginTop: 8 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><i style={{ width: 10, height: 10, borderRadius: 3, background: COR.captados }} />Captados</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><i style={{ width: 12, height: 3, borderRadius: 2, background: COR.vendas }} />Vendas</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><i style={{ width: 12, height: 3, borderRadius: 2, background: COR.cancel }} />Cancelados</span>
                  <span style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>Vendas e cancelados contam pela data em que o lead entrou.</span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
                {/* Dia da semana */}
                <div style={card}>
                  <p style={titulo}>Captação por dia da semana</p>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={semana} margin={{ top: 6, right: 4, left: -22, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-lt)" vertical={false} />
                      <XAxis dataKey="nome" tick={{ fontSize: 11.5, fill: 'var(--text-subtle)' }} interval={0} />
                      <YAxis tick={{ fontSize: 10, fill: 'var(--text-subtle)' }} allowDecimals={false} />
                      <Tooltip {...TOOLTIP} formatter={v => [`${fmt(Number(v))} (${fmt(pct(Number(v), totalSemana), 1)}%)`, 'Captados']} />
                      <Bar dataKey="n" name="Captados" radius={[4, 4, 0, 0]} maxBarSize={48}>
                        {semana.map((d, i) => <Cell key={i} fill={d.n === maxSemana && maxSemana > 0 ? COR.forte : COR.captados} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  {maxSemana > 0 && (
                    <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '8px 0 0' }}>
                      Dia mais forte: <b style={{ color: 'var(--text-1)' }}>{semana.map((d, i) => d.n === maxSemana ? DIAS_LONGO[i] : null).filter(Boolean).join(', ')}</b>, com {fmt(pct(maxSemana, totalSemana), 1)}% dos leads.
                    </p>
                  )}
                </div>

                {/* Funil */}
                <div style={card}>
                  <p style={titulo}>Do captado à venda</p>
                  <Barras total={t.captados} linhas={[
                    ['Captados', t.captados, COR.captados],
                    ['Em aberto', t.captados - t.vendas - t.cancelados, COR.aberto],
                    ['Vendas', t.vendas, COR.vendas],
                    ['Cancelados', t.cancelados, COR.cancel],
                  ]} />
                </div>

                {/* Modalidade */}
                <div style={card}>
                  <p style={titulo}>Modalidade</p>
                  {modTotal ? (
                    <Barras total={modTotal} linhas={data.modalidades.slice(0, 6).map(m => [m.nome, m.count, '#2563EB'] as [string, number, string])} />
                  ) : <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0 }}>Sem leads não cancelados no recorte.</p>}
                  <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '10px 0 0' }}>Sobre os leads não cancelados.</p>
                </div>
              </div>

              {/* Pontos de conversão */}
              <div style={card}>
                <p style={titulo}>Pontos de conversão</p>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr>
                        {['Ponto de conversão', 'Campanha', 'Captados', '% do total', 'Vendas', 'Cancelados', 'Receita potencial'].map((h, i) => (
                          <th key={h} style={{ textAlign: i >= 2 ? 'right' : 'left', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', padding: '8px 10px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.pontos.map(p => {
                        const cor = COR_CAMPANHA[p.campanha.toLowerCase()] ?? '#0EA5E9'
                        const td = { padding: '9px 10px', borderBottom: '1px solid var(--border-lt)', fontVariantNumeric: 'tabular-nums' } as const
                        return (
                          <tr key={`${p.ponto}|${p.campanha}`}
                            className="kpi-lead-row"
                            title={convPoint ? undefined : 'Filtrar por este ponto de conversão'}
                            onClick={() => { if (!convPoint) setConvPoint(p.ponto) }}
                            style={{ cursor: convPoint ? 'default' : 'pointer' }}>
                            <td style={{ ...td, color: 'var(--text-1)', fontWeight: 600 }}>{p.ponto}</td>
                            <td style={td}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, borderRadius: 999, padding: '2px 9px', border: '1px solid var(--border)', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                                <i style={{ width: 7, height: 7, borderRadius: '50%', background: cor }} />{p.campanha}
                              </span>
                            </td>
                            <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: 'var(--text-1)' }}>{fmt(p.captados)}</td>
                            <td style={{ ...td, textAlign: 'right', color: 'var(--text-2)' }}>{fmt(pct(p.captados, t.captados), 1)}%</td>
                            <td style={{ ...td, textAlign: 'right', color: 'var(--text-2)' }}>{fmt(p.vendas)}</td>
                            <td style={{ ...td, textAlign: 'right', color: 'var(--text-2)' }}>{fmt(p.cancelados)}</td>
                            <td style={{ ...td, textAlign: 'right', color: 'var(--text-2)' }}>{brl(p.receita_potencial)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {!convPoint && data.pontos.length > 1 && (
                  <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '10px 0 0' }}>Clique num ponto para filtrar a análise por ele.</p>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
