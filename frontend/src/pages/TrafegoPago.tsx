import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Pencil, List } from 'lucide-react'
import api from '../api'
import SinoSlot, { VerComoSlot } from '../components/SinoSlot'

type Plataforma = 'meta' | 'google'
interface Campanha {
  nome: string; leads: number; temperatura: number[]; contatados: number; propostas: number
  vendas: number; valor_vendas: number; vendas_temp: number[]; perdidos: number
  motivos: [string, number][]; diario: { leads: number; vendas: number }[]
  anterior: { leads: number; vendas: number; valor_vendas: number } | null
}
interface Dados {
  plataforma: Plataforma; mes: string; inicio: string; fim: string
  dias_decorridos: number; dias_mes: number; verba: number | null
  total: { gasto: number; leads: number; vendas: number; valor_vendas: number; temperatura: number[]; diario_leads: number[] }
  anterior: { gasto: number; leads: number; vendas: number; valor_vendas: number }
  campanhas: Campanha[]
}

const PLATS: { id: Plataforma; nome: string }[] = [{ id: 'meta', nome: 'Meta Ads' }, { id: 'google', nome: 'Google Ads' }]
const TEMP = [{ k: 'Quentes', c: 'hot' }, { k: 'Mornos', c: 'warm' }, { k: 'Frios', c: 'cold' }, { k: 'Sem classif.', c: 'none' }]
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const nf = (v: number, d = 0) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })
const pct = (v: number) => `${nf(v * 100, 1)}%`
const rx = (v: number) => `${nf(v, 2)}×`
const mesIso = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
const shiftMes = (mes: string, dir: number) => { const [y, m] = mes.split('-').map(Number); return mesIso(new Date(y, m - 1 + dir, 1)) }
const mesNome = (mes: string) => MESES[Number(mes.split('-')[1]) - 1]
const lsGet = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* sem storage */ } }
function parseValor(txt: string): number | null | 'erro' {
  const t = txt.replace(/R\$|\s/g, '')
  if (!t) return null
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t)
  return Number.isFinite(n) && n >= 0 ? n : 'erro'
}

function Delta({ cur, prev, lowGood }: { cur: number; prev: number | null | undefined; lowGood?: boolean }) {
  if (!prev) return null
  const d = (cur - prev) / prev
  const flat = Math.abs(d) < 0.005
  const cls = flat ? 'flat' : (lowGood ? d < 0 : d > 0) ? 'good' : 'bad'
  return <span className={`tp-delta ${cls}`}>{flat ? '=' : d > 0 ? '▲' : '▼'} {nf(Math.abs(d) * 100, 1)}%</span>
}

function TBar({ t }: { t: number[] }) {
  return (
    <div className="tp-tbar">
      {t.map((v, i) => v ? <span key={i} className={TEMP[i].c} style={{ flex: v }} title={`${TEMP[i].k}: ${v}`} /> : null)}
    </div>
  )
}

function Spark({ vals }: { vals: number[] }) {
  if (vals.length < 2) return <div className="tp-spark" />
  const W = 200, h = 28, max = Math.max(...vals, 1), min = Math.min(...vals) * 0.85
  const span = max - min || 1
  const pts = vals.map((v, i) => `${(i / (vals.length - 1) * W).toFixed(1)},${(h - 2 - (v - min) / span * (h - 6)).toFixed(1)}`)
  const l = 'M' + pts.join('L')
  return (
    <svg className="tp-spark" viewBox={`0 0 ${W} ${h}`} preserveAspectRatio="none">
      <path className="a" d={`${l}L${W},${h}L0,${h}Z`} />
      <path className="l" d={l} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function DayChart({ c, inicio }: { c: Campanha; inicio: string }) {
  const d = c.diario, W = 520, H = 150, P = { l: 28, r: 6, t: 14, b: 22 }
  const iw = W - P.l - P.r, ih = H - P.t - P.b
  const max = Math.max(2, Math.ceil(Math.max(...d.map(x => x.leads)) * 1.25)), bw = iw / Math.max(d.length, 1)
  const [y0, m0, d0] = inicio.split('-').map(Number)
  const dt = (i: number) => new Date(y0, m0 - 1, d0 + i)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Leads por dia" className="tp-chart">
      {[0, Math.round(max / 2), max].map(v => {
        const y = P.t + ih - v / max * ih
        return <g key={v}><line className="gl" x1={P.l} x2={W - P.r} y1={y} y2={y} /><text className="ax" x={P.l - 6} y={y + 3} textAnchor="end">{v}</text></g>
      })}
      {d.map((x, i) => {
        const h = x.leads / max * ih, X = P.l + i * bw + bw * 0.2, day = dt(i), we = day.getDay() === 0 || day.getDay() === 6
        const lbl = `${String(day.getDate()).padStart(2, '0')}/${String(day.getMonth() + 1).padStart(2, '0')}`
        return (
          <g key={i}>
            <rect className={`bl${we ? ' we' : ''}`} x={X} y={P.t + ih - h} width={bw * 0.6} height={h} rx={2}>
              <title>{`${lbl} · ${x.leads} leads${x.vendas ? ` · ${x.vendas} virou venda` : ''}`}</title>
            </rect>
            {x.vendas > 0 && <circle className="sale" cx={X + bw * 0.3} cy={P.t + ih - h - 7} r={3.5} />}
            {(i % 3 === 0 || i === d.length - 1) && <text className="ax" x={X + bw * 0.3} y={H - 6} textAnchor="middle">{lbl}</text>}
          </g>
        )
      })}
    </svg>
  )
}

type IndKey = 'cpl' | 'cpv' | 'roi' | 'conv' | 'vendas' | 'valor'
const IND: Record<IndKey, { k: string; porCampanha: boolean; low?: boolean }> = {
  cpl: { k: 'Custo por lead', porCampanha: false, low: true },
  cpv: { k: 'Custo por venda', porCampanha: false, low: true },
  roi: { k: 'Retorno', porCampanha: false },
  conv: { k: 'Conversão lead→venda', porCampanha: true },
  vendas: { k: 'Vendas', porCampanha: true },
  valor: { k: 'Valor vendido', porCampanha: true },
}
type Base = { gasto: number; leads: number; vendas: number; valor_vendas: number }
function indVal(k: IndKey, b: Base): number | null {
  switch (k) {
    case 'cpl': return b.leads && b.gasto ? b.gasto / b.leads : null
    case 'cpv': return b.vendas && b.gasto ? b.gasto / b.vendas : null
    case 'roi': return b.gasto ? b.valor_vendas / b.gasto : null
    case 'conv': return b.leads ? b.vendas / b.leads : null
    case 'vendas': return b.vendas
    case 'valor': return b.valor_vendas
  }
}
function indFmt(k: IndKey, v: number | null) {
  if (v == null) return '—'
  return k === 'cpl' || k === 'cpv' || k === 'valor' ? brl(v) : k === 'roi' ? rx(v) : k === 'conv' ? pct(v) : nf(v)
}

export default function TrafegoPago() {
  const navigate = useNavigate()
  const [plat, setPlat] = useState<Plataforma>(() => (lsGet('tp-plat') === 'google' ? 'google' : 'meta'))
  const [mes, setMes] = useState(mesIso())
  const [data, setData] = useState<Dados | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [sel, setSel] = useState(0)
  const [ind, setInd] = useState<IndKey>(() => { const s = lsGet('tp-ind'); return s && s in IND ? s as IndKey : 'cpl' })
  const [editVerba, setEditVerba] = useState(false)
  const [verbaTxt, setVerbaTxt] = useState('')
  const [verbaErro, setVerbaErro] = useState(false)
  const genRef = useRef(0)

  function fetchData(silencioso = false) {
    const gen = ++genRef.current
    if (!silencioso) { setLoading(true); setError(false) }
    api.get<Dados>('/api/v1/financeiro/trafego/campanhas', { params: { plataforma: plat, mes } })
      .then(r => { if (genRef.current === gen) { setData(r.data); if (!silencioso) setSel(0) } })
      .catch(() => { if (genRef.current === gen && !silencioso) setError(true) })
      .finally(() => { if (genRef.current === gen) setLoading(false) })
  }
  useEffect(() => fetchData(), [plat, mes])

  function trocaPlat(p: Plataforma) { setPlat(p); lsSet('tp-plat', p); setEditVerba(false) }
  function trocaInd(k: IndKey) { setInd(k); lsSet('tp-ind', k) }

  function salvarVerba() {
    const v = parseValor(verbaTxt)
    if (v === 'erro') { setVerbaErro(true); return }
    api.put('/api/v1/financeiro/trafego/verba', { plataforma: plat, mes, valor: v })
      .then(() => { setEditVerba(false); fetchData(true) })
      .catch(() => setVerbaErro(true))
  }

  const podeAvancar = mes < mesIso()
  const c = data?.campanhas[sel] ?? null
  const elapsed = data ? data.dias_decorridos / data.dias_mes : 0
  const mesAnt = mesNome(shiftMes(mes, -1))
  const totalBase = data ? { ...data.total } : null
  const indAtual = totalBase ? indVal(ind, totalBase) : null
  const indAnt = data ? indVal(ind, data.anterior) : null
  const ranking = useMemo(() => {
    if (!data || !IND[ind].porCampanha) return []
    return data.campanhas
      .map(x => ({ nome: x.nome, v: indVal(ind, { gasto: 0, leads: x.leads, vendas: x.vendas, valor_vendas: x.valor_vendas }) ?? 0 }))
      .sort((a, b) => b.v - a.v).slice(0, 4)
  }, [data, ind])

  return (
    <div className="tp">
      <style>{CSS}</style>
      <header className="tp-head">
        <div>
          <div className="tp-crumb">Equipe › Tráfego pago</div>
          <h1>Tráfego pago</h1>
        </div>
        <div className="tp-hright">
          <VerComoSlot />
          <div className="tp-tabs" role="group" aria-label="Plataforma">
            {PLATS.map(p => (
              <button key={p.id} aria-pressed={plat === p.id} onClick={() => trocaPlat(p.id)}><span className="pdot" />{p.nome}</button>
            ))}
          </div>
          <div className="tp-mes">
            <button onClick={() => setMes(m => shiftMes(m, -1))} aria-label="Mês anterior"><ChevronLeft size={16} /></button>
            <span>{mesNome(mes)} {mes.slice(0, 4)}</span>
            <button onClick={() => podeAvancar && setMes(m => shiftMes(m, 1))} disabled={!podeAvancar} aria-label="Próximo mês"><ChevronRight size={16} /></button>
          </div>
          <SinoSlot />
        </div>
      </header>

      {loading && !data ? (
        <p className="tp-muted">Carregando…</p>
      ) : error ? (
        <div className="tp-muted">Não foi possível carregar o tráfego pago. <button className="tp-link" onClick={() => fetchData()}>Tentar novamente</button></div>
      ) : data ? (
        <div className="tp-body" style={{ opacity: loading ? 0.6 : 1 }}>
          <div className="tp-summary">
            <div className="tp-kpi">
              <div className="tp-lbl">Investimento</div>
              <div className="tp-krow"><span className="tp-val">{brl(data.total.gasto)}</span><Delta cur={data.total.gasto} prev={data.anterior.gasto} lowGood /></div>
              <div className="tp-ctx">
                {data.total.gasto ? `vs ${brl(data.anterior.gasto)} no mesmo período de ${mesAnt}` : 'Nenhuma semana lançada em Financeiro › Tráfego pago'}
              </div>
            </div>

            <div className="tp-kpi">
              <div className="tp-lbl">Valor restante</div>
              {editVerba ? (
                <form className="tp-verba" onSubmit={e => { e.preventDefault(); salvarVerba() }}>
                  <input id="tp-verba-input" autoFocus value={verbaTxt} onChange={e => { setVerbaTxt(e.target.value); setVerbaErro(false) }}
                    placeholder="Verba do mês (R$)" aria-invalid={verbaErro} />
                  <button type="submit" className="tp-btn">Salvar</button>
                  <button type="button" className="tp-btn ghost" onClick={() => setEditVerba(false)}>Cancelar</button>
                </form>
              ) : data.verba == null ? (
                <button className="tp-btn ghost" style={{ justifySelf: 'start' }} onClick={() => { setVerbaTxt(''); setEditVerba(true) }}>Definir verba do mês</button>
              ) : (() => {
                const used = data.total.gasto / data.verba
                const proj = data.dias_decorridos ? data.total.gasto / data.dias_decorridos * data.dias_mes : 0
                return (
                  <>
                    <div className="tp-krow">
                      <span className="tp-val">{brl(data.verba - data.total.gasto)}</span>
                      <button className="tp-icon" aria-label="Editar verba" title="Editar verba"
                        onClick={() => { setVerbaTxt(nf(data.verba ?? 0, 2)); setEditVerba(true) }}><Pencil size={14} /></button>
                    </div>
                    <div className="tp-track" style={{ margin: '11px 0' }}>
                      <span className="proj" style={{ width: `${Math.min(proj / data.verba, 1) * 100}%` }} />
                      <span className="fill" style={{ width: `${Math.min(used, 1) * 100}%` }} />
                      <span className="mark" style={{ left: `${elapsed * 100}%` }} />
                    </div>
                    <div className="tp-ctx">
                      {pct(used)} de {brl(data.verba)} · projeção <b style={{ color: proj > data.verba ? 'var(--danger)' : 'var(--text-1)' }}>{brl(proj)}</b>
                    </div>
                  </>
                )
              })()}
            </div>

            <div className="tp-kpi">
              <div className="tp-lbl">Campanhas ativas</div>
              <div className="tp-krow"><span className="tp-val">{data.campanhas.length}</span><span className="tp-ctx">{nf(data.total.leads)} leads · {data.total.vendas} vendas</span></div>
              <Spark vals={data.total.diario_leads} />
              <div className="tp-ctx">Leads <Delta cur={data.total.leads} prev={data.anterior.leads} /> vs {mesAnt}</div>
            </div>

            <div className="tp-kpi">
              <label htmlFor="tp-ind" className="tp-indlbl">
                <select id="tp-ind" className="tp-indsel" value={ind} onChange={e => trocaInd(e.target.value as IndKey)}>
                  {(Object.keys(IND) as IndKey[]).map(k => <option key={k} value={k}>{IND[k].k}</option>)}
                </select>
              </label>
              <div className="tp-krow">
                <span className="tp-val">{indFmt(ind, indAtual)}</span>
                {indAtual != null && <Delta cur={indAtual} prev={indAnt} lowGood={IND[ind].low} />}
              </div>
              {ranking.length > 0 ? (
                <div className="tp-rank">
                  {ranking.map((r, i) => (
                    <div key={r.nome} className={i === 0 ? 'top' : ''}>
                      <span className="n">{r.nome}</span>
                      <span className="tp-track thin"><span className="fill" style={{ width: `${ranking[0].v ? r.v / ranking[0].v * 100 : 0}%` }} /></span>
                      <b>{indFmt(ind, r.v)}</b>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="tp-ctx">{indAnt != null ? `vs ${indFmt(ind, indAnt)} no mesmo período de ${mesAnt}` : 'Depende do investimento lançado'}</div>
              )}
            </div>
          </div>

          <div className="tp-sec">
            <div className="tp-sechead">
              <h2>Campanhas</h2>
              <div className="tp-legend">{TEMP.map(t => <span key={t.c}><i className={t.c} />{t.k}</span>)}</div>
            </div>
            {data.campanhas.length === 0 ? (
              <div className="tp-empty">Nenhum lead de {PLATS.find(p => p.id === plat)?.nome} em {mesNome(mes)}.</div>
            ) : (
              <div className="tp-cgrid">
                {data.campanhas.map((x, i) => (
                  <button key={x.nome} className="tp-card" aria-pressed={i === sel} onClick={() => setSel(i)}>
                    <div className="ctop"><h3 title={x.nome}>{x.nome}</h3></div>
                    <div className="tp-krow"><span className="leads">{x.leads}</span><span className="tp-muted">leads</span><Delta cur={x.leads} prev={x.anterior?.leads} /></div>
                    <TBar t={x.temperatura} />
                    <div className="temps">
                      {x.temperatura.map((v, j) => <div key={j}><b>{v}</b><span><i className={`sw ${TEMP[j].c}`} />{TEMP[j].k}</span></div>)}
                    </div>
                    <div className="cmetrics">
                      <div><span>Vendas</span><b>{x.vendas}</b></div>
                      <div><span>Conversão</span><b>{x.leads ? pct(x.vendas / x.leads) : '—'}</b></div>
                      <div><span>Valor vendido</span><b>{brl(x.valor_vendas)}</b></div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {c && <Painel c={c} data={data} onVerLeads={() => {
            const q = new URLSearchParams({ date_from: data.inicio, date_to: data.fim, conversion_point: c.nome })
            navigate(`/leads-report?${q.toString()}`)
          }} />}
        </div>
      ) : null}
    </div>
  )
}

function Painel({ c, data, onVerLeads }: { c: Campanha; data: Dados; onVerLeads: () => void }) {
  const st: [string, number][] = [['Leads', c.leads], ['Contatados', c.contatados], ['Em proposta', c.propostas], ['Vendas', c.vendas]]
  const tc = c.vendas_temp.map((v, i) => ({ ...TEMP[i], v, n: c.temperatura[i], r: c.temperatura[i] ? v / c.temperatura[i] : 0 }))
  const maxr = Math.max(...tc.map(x => x.r), 0.01)
  const outrosLeads = c.temperatura[1] + c.temperatura[2]
  const outrosRate = outrosLeads ? (c.vendas_temp[1] + c.vendas_temp[2]) / outrosLeads : 0
  const lmax = c.motivos[0]?.[1] ?? 1
  return (
    <div className="tp-panel">
      <div className="phead">
        <div>
          <h2>{c.nome}</h2>
          <div className="sub">
            <span>Valor vendido <b>{brl(c.valor_vendas)}</b> <Delta cur={c.valor_vendas} prev={c.anterior?.valor_vendas} /></span>
            <span>Conversão <b>{c.leads ? pct(c.vendas / c.leads) : '—'}</b></span>
            <span>Perdidos <b>{c.perdidos}</b></span>
          </div>
        </div>
        <button className="tp-btn" onClick={onVerLeads}><List size={16} />Ver os {c.leads} leads</button>
      </div>
      <div className="pgrid">
        <div className="pcol">
          <div className="tp-lbl">Do lead à venda</div>
          <div className="funnel">
            {st.map(([k, v], i) => (
              <div className="frow" key={k}>
                <span className="tp-muted">{k}</span>
                <div className="fbar"><span style={{ width: `${Math.max(c.leads ? v / c.leads * 100 : 0, 3)}%` }} />
                  <em>{v}{i > 0 && st[i - 1][1] ? <small>{pct(v / st[i - 1][1])}</small> : null}</em></div>
              </div>
            ))}
          </div>
        </div>
        <div className="pcol">
          <div className="tp-lbl">Conversão por temperatura</div>
          <div className="tconv">
            {tc.map(x => (
              <div className="trow" key={x.c}>
                <span className="tname"><i className={`sw ${x.c}`} />{x.k}</span>
                <span className="tp-track"><span className={`fill ${x.c}`} style={{ width: `${x.r / maxr * 100}%` }} /></span>
                <b>{pct(x.r)}</b>
                <span className="tnote">{x.v} venda{x.v === 1 ? '' : 's'} de {x.n} leads</span>
              </div>
            ))}
          </div>
          {tc[0].r > 0 && outrosRate > 0 && (
            <div className="tp-insight">Lead quente fecha <b>{nf(tc[0].r / outrosRate, 1)}× mais</b> que morno ou frio nesta campanha.</div>
          )}
        </div>
      </div>
      <div className="pgrid foot">
        <div className="pcol">
          <div className="tp-sechead"><div className="tp-lbl">Leads por dia</div><span className="tp-small tp-muted">● lead que virou venda</span></div>
          <DayChart c={c} inicio={data.inicio} />
        </div>
        <div className="pcol">
          <div className="tp-sechead"><div className="tp-lbl">Motivos de perda</div><span className="tp-small tp-muted">{c.perdidos} perdidos</span></div>
          {c.motivos.length === 0 ? <span className="tp-muted tp-small">Nenhum lead perdido no período.</span> : (
            <div className="loss">
              {c.motivos.map(([k, v]) => (
                <div className="r" key={k}><span>{k}</span><span className="tp-track"><span className="fill" style={{ width: `${v / lmax * 100}%` }} /></span><b>{v}</b></div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const CSS = `
.tp{--tp-surface:var(--bg-input);--hot:#1E3A8A;--warm:#3B6FE0;--cold:#A9C4F5;--none:#E4E7EC;--tp-shadow:0 1px 2px rgba(16,24,40,.05);
  padding:28px 32px 56px;max-width:1280px;margin:0 auto;min-height:100%;color:var(--text-1);font-variant-numeric:tabular-nums}
html.dark .tp{--tp-surface:var(--bg-card);--hot:#C7DAFE;--warm:#6F9CFB;--cold:#2E4A80;--none:#334155;--tp-shadow:0 1px 2px rgba(0,0,0,.3)}
.tp h1{font-size:28px;line-height:36px;margin:0;font-weight:700;color:var(--text-1)}
.tp h2{font-size:18px;line-height:28px;margin:0;font-weight:600;color:var(--text-1)}
.tp h3{font-size:16px;line-height:24px;margin:0;font-weight:600;color:var(--text-1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tp-muted{color:var(--text-muted)}.tp-small{font-size:12px}
.tp-link{background:none;border:0;color:var(--accent);font-weight:600;cursor:pointer;padding:0}
.tp-head{display:flex;flex-wrap:wrap;gap:16px 24px;justify-content:space-between;align-items:flex-end;margin-bottom:28px}
.tp-crumb{font-size:12px;color:var(--text-muted);font-weight:500}
.tp-hright{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.tp-tabs{display:flex;gap:2px;background:var(--tp-surface);border:1px solid var(--border);border-radius:10px;padding:3px;box-shadow:var(--tp-shadow)}
.tp-tabs button{border:0;background:transparent;padding:6px 12px;border-radius:7px;font-weight:500;font-size:14px;color:var(--text-3b);cursor:pointer;display:flex;align-items:center;gap:7px}
.tp-tabs button[aria-pressed="true"]{background:var(--bg-subtle);color:var(--text-1);font-weight:600;box-shadow:inset 0 0 0 1px var(--border)}
.tp-tabs .pdot{width:7px;height:7px;border-radius:9999px;background:var(--border-in)}
.tp-tabs button[aria-pressed="true"] .pdot{background:var(--success)}
.tp-mes{display:flex;align-items:center;height:36px;border:1px solid var(--border);border-radius:10px;background:var(--tp-surface);box-shadow:var(--tp-shadow)}
.tp-mes span{min-width:120px;text-align:center;font-weight:600;font-size:13px;text-transform:capitalize}
.tp-mes button{background:none;border:0;height:100%;padding:0 10px;color:var(--text-3b);cursor:pointer;display:flex;align-items:center}
.tp-mes button:disabled{opacity:.35;cursor:default}
.tp-body{display:grid;gap:28px;transition:opacity .15s}
.tp-lbl{font-size:12px;line-height:16px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--text-muted)}
.tp-summary{background:var(--tp-surface);border:1px solid var(--border);border-radius:16px;box-shadow:var(--tp-shadow);display:grid;grid-template-columns:repeat(4,minmax(0,1fr))}
.tp-kpi{padding:20px 24px;display:flex;flex-direction:column;gap:8px;min-width:0;position:relative}
.tp-kpi+.tp-kpi::before{content:"";position:absolute;left:0;top:20px;bottom:20px;width:1px;background:var(--border)}
.tp-kpi>.tp-ctx:last-child{margin-block:auto}
.tp-krow{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
.tp-val{font-size:26px;line-height:34px;font-weight:700;letter-spacing:-.01em}
.tp-ctx{font-size:12px;line-height:16px;color:var(--text-muted)}
.tp-delta{font-size:12px;font-weight:600}
.tp-delta.good{color:var(--success)}.tp-delta.bad{color:var(--danger)}.tp-delta.flat{color:var(--text-muted)}
.tp-spark{height:28px;width:100%;display:block}
.tp-spark .l{fill:none;stroke:var(--accent);stroke-width:1.6}.tp-spark .a{fill:var(--accent);opacity:.1}
.tp-track{position:relative;display:block;height:6px;border-radius:9999px;background:var(--bg-subtle)}
.tp-track.thin{height:4px}
.tp-track .fill{position:absolute;inset:0 auto 0 0;border-radius:9999px;background:var(--accent)}
.tp-track .proj{position:absolute;inset:0 auto 0 0;border-radius:9999px;background:var(--accent);opacity:.22}
.tp-track .mark{position:absolute;top:-4px;bottom:-4px;width:2px;border-radius:2px;background:var(--text-1)}
.tp-icon{background:none;border:0;color:var(--text-muted);cursor:pointer;padding:2px;display:flex}
.tp-verba{display:flex;flex-wrap:wrap;gap:6px}
.tp-verba input{flex:1;min-width:120px;height:34px;padding:0 10px;border-radius:8px;border:1px solid var(--border-in);background:var(--bg-input);color:var(--text-1);font:inherit}
.tp-verba input[aria-invalid="true"]{border-color:var(--danger)}
.tp-btn{display:inline-flex;align-items:center;gap:8px;height:34px;padding:0 14px;border-radius:10px;border:1px solid var(--accent);background:var(--accent);color:#fff;font-weight:600;font-size:13px;cursor:pointer}
.tp-btn.ghost{background:transparent;color:var(--text-3b);border-color:var(--border)}
.tp-indlbl{display:block;line-height:16px}
.tp-indsel{appearance:none;border:0;background:transparent;font:inherit;font-size:12px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--accent);cursor:pointer;padding:0 16px 0 0;max-width:100%;
  background-image:linear-gradient(45deg,transparent 50%,currentColor 50%),linear-gradient(135deg,currentColor 50%,transparent 50%);background-position:calc(100% - 6px) 7px,calc(100% - 2px) 7px;background-size:4px 4px;background-repeat:no-repeat}
.tp-indsel option{color:var(--text-1);background:var(--bg-input);text-transform:none}
.tp-rank{display:grid;gap:5px;margin-top:2px}
.tp-rank>div{display:grid;grid-template-columns:minmax(0,1fr) 54px 84px;gap:8px;align-items:center;font-size:11px}
.tp-rank .n{color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tp-rank .fill{opacity:.35}.tp-rank .top .fill{opacity:1}
.tp-rank b{text-align:right;font-weight:500;color:var(--text-3b)}.tp-rank .top b{font-weight:700;color:var(--text-1)}
.tp-sec{display:grid;gap:14px}
.tp-sechead{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.tp-legend{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:12px;color:var(--text-3b)}
.tp-legend i,.tp .sw{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:6px;flex:none}
.tp .hot{background:var(--hot)}.tp .warm{background:var(--warm)}.tp .cold{background:var(--cold)}.tp .none{background:var(--none)}
.tp-empty{padding:28px;text-align:center;color:var(--text-muted);background:var(--tp-surface);border:1px dashed var(--border);border-radius:16px}
.tp-cgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px}
.tp-card{all:unset;box-sizing:border-box;position:relative;cursor:pointer;background:var(--tp-surface);border:1px solid var(--border);border-radius:16px;box-shadow:var(--tp-shadow);padding:18px 20px 16px;display:grid;gap:14px;align-content:start;min-width:0;transition:border-color .15s,box-shadow .15s}
.tp-card:hover{box-shadow:0 4px 12px rgba(16,24,40,.08);border-color:var(--border-in)}
.tp-card:focus-visible{outline:3px solid var(--accent-weak);outline-offset:2px}
.tp-card[aria-pressed="true"]{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}
.tp-card .ctop{min-width:0}
.tp-card .leads{font-size:30px;line-height:34px;font-weight:700;letter-spacing:-.02em}
.tp-tbar{display:flex;height:8px;border-radius:9999px;overflow:hidden;gap:2px;background:var(--bg-subtle)}
.tp-tbar span{min-width:3px}
.tp-card .temps{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px}
.tp-card .temps div{display:grid;gap:1px;min-width:0}
.tp-card .temps b{font-size:15px;font-weight:600}
.tp-card .temps span{font-size:11px;line-height:14px;color:var(--text-muted);display:flex;align-items:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tp-card .temps .sw{width:6px;height:6px;margin-right:4px}
.tp-card .cmetrics{display:flex;justify-content:space-between;gap:12px;border-top:1px solid var(--border);padding-top:12px}
.tp-card .cmetrics div{display:grid;gap:2px;min-width:0}
.tp-card .cmetrics div:last-child{text-align:right}
.tp-card .cmetrics span{font-size:11px;color:var(--text-muted)}
.tp-card .cmetrics b{font-size:13px;font-weight:600;white-space:nowrap}
.tp-panel{background:var(--tp-surface);border:1px solid var(--border);border-radius:16px;box-shadow:var(--tp-shadow);overflow:hidden}
.tp-panel .phead{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px;padding:18px 24px;border-bottom:1px solid var(--border)}
.tp-panel .sub{display:flex;flex-wrap:wrap;gap:6px 20px;font-size:12px;color:var(--text-muted);margin-top:2px}
.tp-panel .sub b{color:var(--text-1);font-weight:600}
.tp-panel .pgrid{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr)}
.tp-panel .pgrid.foot{border-top:1px solid var(--border)}
.tp-panel .pcol{padding:22px 24px;display:grid;gap:16px;align-content:start;min-width:0}
.tp-panel .pcol+.pcol{border-left:1px solid var(--border)}
.tp-panel .funnel{display:grid;gap:10px}
.tp-panel .frow{display:grid;grid-template-columns:104px minmax(0,1fr);gap:12px;align-items:center}
.tp-panel .fbar{height:30px;border-radius:8px;background:var(--bg-subtle);position:relative;overflow:hidden}
.tp-panel .fbar span{position:absolute;inset:0 auto 0 0;background:var(--accent-weak);border-radius:8px}
html.dark .tp-panel .fbar span{background:rgba(96,165,250,.22)}
.tp-panel .fbar em{position:absolute;left:10px;top:5px;font-style:normal;font-weight:600}
.tp-panel .fbar em small{font-weight:500;color:var(--text-muted);font-size:12px;margin-left:6px}
.tp-panel .tconv{display:grid;gap:12px}
.tp-panel .trow{display:grid;grid-template-columns:110px minmax(0,1fr) 56px;gap:10px;align-items:center}
.tp-panel .trow b{text-align:right}
.tp-panel .trow .tp-track{height:8px}
.tp-panel .tname{display:flex;align-items:center}
.tp-panel .tnote{font-size:11px;color:var(--text-muted);grid-column:2/-1;margin-top:-6px}
.tp-insight{padding:12px 14px;border-radius:12px;background:var(--bg-subtle);font-size:13px;color:var(--text-3b)}
.tp-insight b{color:var(--text-1)}
.tp-chart{width:100%;height:auto;display:block}
.tp-chart .ax{fill:var(--text-muted);font-size:10px}
.tp-chart .gl{stroke:var(--border)}
.tp-chart .bl{fill:var(--accent);opacity:.85}.tp-chart .bl.we{opacity:.35}
.tp-chart .sale{fill:var(--text-1)}
.tp-panel .loss{display:grid;gap:10px}
.tp-panel .loss .r{display:grid;grid-template-columns:minmax(0,1fr) 120px 32px;gap:10px;align-items:center;font-size:13px}
.tp-panel .loss .r b{text-align:right}
.tp-panel .loss .fill{background:var(--text-muted);opacity:.55}
@media (max-width:1040px){
  .tp-summary{grid-template-columns:repeat(2,minmax(0,1fr))}
  .tp-kpi:nth-child(3)::before{display:none}
  .tp-kpi:nth-child(n+3){border-top:1px solid var(--border)}
  .tp-panel .pgrid{grid-template-columns:minmax(0,1fr)}
  .tp-panel .pcol+.pcol{border-left:0;border-top:1px solid var(--border)}
}
@media (max-width:560px){
  .tp{padding:20px 16px 48px}
  .tp-summary{grid-template-columns:minmax(0,1fr)}
  .tp-kpi+.tp-kpi::before{display:none}.tp-kpi+.tp-kpi{border-top:1px solid var(--border)}
}
`
