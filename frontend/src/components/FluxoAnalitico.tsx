import { useCallback, useEffect, useMemo, useState, type KeyboardEvent as KEv } from 'react'
import { ChevronDown } from 'lucide-react'
import api from '../api'
import { parseUTC } from '../utils/date'
import LeadPeekDrawer from './LeadPeekDrawer'

// Analítico do Fluxo de vendas (só admin/diretor/financeiro/coordenador; o backend também bloqueia).
// Receita gerada = contratos com DATA DA VENDA no período.
// Recebida / A receber = CAIXA do período: parcelas pagas / previstas com data no período, de qualquer venda.
// Possível estorno = marcado à mão (Simone) no período. Previsão do mês (mês em andamento) = recebida + a receber − em risco.

interface Parcela { numero: number | null; valor: number; recebida: boolean; data: string | null; descricao: string | null }
interface Estorno { valor: number; observacao: string | null; por: string | null; em: string | null }
interface Contrato {
  id: string; nome: string; atendente: string | null; venda: string | null  // null = parcela lançada sem "Data da venda" (só conta no caixa)
  operadora: string | null; promotora: string | null; modalidade: string | null
  status: string | null; perception: string | null; phone: string | null; email: string | null
  origem: string | null; vidas: number | null; value_potential: number | null
  parcelas: Parcela[]; estorno: Estorno | null
}
interface VelMes { mes: string; leads: number; vendas: number; perdidos: number; soma_ticket: number; ciclo_soma: number; ciclo_n: number }
interface AnaData { operador: string; hoje: string; contratos: Contrato[]; velocidade: VelMes[] }

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const MES3 = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const mesLongo = (ym: string) => MESES[+ym.slice(5, 7) - 1]
const mes3 = (ym: string) => MES3[+ym.slice(5, 7) - 1]
const addM = (ym: string, n: number) => {
  const d = new Date(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const brl0 = (n: number) => 'R$ ' + Math.round(n).toLocaleString('pt-BR')
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)
const mil = (v: number) => !v ? '—' : v >= 10000 ? Math.round(v / 1000) + ' mil' : v >= 1000 ? (v / 1000).toFixed(1).replace('.', ',') + ' mil' : brl0(v)
const nCt = (n: number) => `${n} ${n === 1 ? 'contrato' : 'contratos'}`
const soma = (xs: number[]) => xs.reduce((s, x) => s + x, 0)
const total = (c: Contrato) => soma(c.parcelas.map(p => p.valor))
const recebido = (c: Contrato) => soma(c.parcelas.filter(p => p.recebida).map(p => p.valor))
const aReceber = (c: Contrato) => soma(c.parcelas.filter(p => !p.recebida).map(p => p.valor))
const dLocal = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(parseUTC(iso))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const ymLocal = (iso: string | null) => dLocal(iso).slice(0, 7)
// operadora vem em caixa alta ("HAPVIDA PF") -> "Hapvida PF" (siglas de 2 letras ficam)
const nomeOp = (s: string) => s.toLowerCase().split(' ').map(w =>
  w.length === 2 && !['de', 'da', 'do'].includes(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`

function VarPct({ a, b, bom = 'up', sufixo = '' }: { a: number; b: number; bom?: 'up' | 'down'; sufixo?: string }) {
  if (!b) return <span className="fva-vp flat">sem base</span>
  const d = Math.round(((a - b) / b) * 100)
  if (!d) return <span className="fva-vp flat">= {sufixo || 'anterior'}</span>
  const ok = (d > 0) === (bom === 'up')
  return <span className={`fva-vp ${ok ? 'good' : 'bad'}`}>{d > 0 ? '▲' : '▼'} {Math.abs(d)}%</span>
}

// minilinha: com o mês em andamento, o último trecho fica tracejado e o ponto vazado
function Spark({ vals, cor, parcial }: { vals: number[]; cor: string; parcial: boolean }) {
  const W = 110, H = 34, max = Math.max(1, ...vals), n = vals.length
  const x = (i: number) => 4 + i * ((W - 8) / Math.max(1, n - 1))
  const y = (v: number) => H - 4 - (v / max) * (H - 10)
  const p = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`)
  const cheio = parcial ? p.slice(0, n - 1) : p
  return (
    <svg className="fva-spk" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <polygon points={`${x(0)},${H - 4} ${p.join(' ')} ${x(n - 1)},${H - 4}`} style={{ fill: `color-mix(in srgb, ${cor} 12%, transparent)` }} />
      <polyline points={cheio.join(' ')} style={{ fill: 'none', stroke: cor, strokeWidth: 2, strokeLinejoin: 'round', strokeLinecap: 'round' }} />
      {parcial && n > 1 && <polyline points={`${p[n - 2]} ${p[n - 1]}`} style={{ fill: 'none', stroke: cor, strokeWidth: 2, strokeDasharray: '3 3' }} />}
      <circle cx={x(n - 1)} cy={y(vals[n - 1])} r={3.5} style={{ fill: parcial ? 'var(--bg-card)' : cor, stroke: cor, strokeWidth: 2 }} />
    </svg>
  )
}

type Dim = 'operadora' | 'promotora' | 'modalidade'
const DIMS: [Dim, string][] = [['operadora', 'Operadora'], ['promotora', 'Promotora'], ['modalidade', 'Modalidade']]
type SortK = 'cli' | 'venda' | 'opr' | 'parc' | 'rec' | 'arec' | 'data' | 'val'
// recorte da lista de contratos: card clicado (ger/rec/arec/est/prev) ou ponto do gráfico (gar + mês)
type Lente = { t: 'ger' | 'rec' | 'arec' | 'est' | 'prev' | 'gar'; m?: string }
interface Linha { c: Contrato; val: number; datas: string[] }

let GAR_P = 6
try { GAR_P = +(localStorage.getItem('fva-gar') || 6) || 6 } catch { /* sem storage */ }

export default function FluxoAnalitico({ op, mes }: { op: string; mes: string }) {
  const [data, setData] = useState<AnaData | null>(null)
  const [erro, setErro] = useState('')
  const [garP, setGarP] = useState(GAR_P)
  const [dim, setDim] = useState<Dim>('operadora')
  const [filtro, setFiltro] = useState<string | null>(null)
  const [sort, setSort] = useState<{ k: SortK; d: 1 | -1 }>({ k: 'venda', d: -1 })
  const [aberto, setAberto] = useState(false)
  const [peek, setPeek] = useState<string | null>(null)
  const [marcar, setMarcar] = useState<Contrato | null>(null)
  const [lente, setLente] = useState<Lente>({ t: 'ger' })
  const [hov, setHov] = useState<number | null>(null)

  const carregar = useCallback(() => {
    setErro('')
    api.get<AnaData>('/api/v1/gestao-comercial/fluxo-vendas/analitico', { params: { origens: op } })
      .then(r => setData(r.data))
      .catch(() => setErro('Não foi possível carregar o analítico. Tente de novo em instantes.'))
  }, [op])
  useEffect(() => { setData(null); carregar() }, [carregar])
  useEffect(() => { setLente({ t: 'ger' }); setSort({ k: 'venda', d: -1 }) }, [mes, op])
  useEffect(() => { setFiltro(null) }, [mes, dim, op, lente])

  const K = useMemo(() => {
    if (!data) return null
    const T = mes === 'todos'
    const hoje = data.hoje, curYM = hoje.slice(0, 7)
    const noP = (d: string | null) => T || (!!d && d.slice(0, 7) === mes)
    const parcs = data.contratos.flatMap(c => c.parcelas.map(p => ({ p, c })))
    // receita gerada / tabela: só contratos com "Data da venda"; recebida e a receber: todas as parcelas
    const cs = data.contratos.filter(c => c.venda && noP(c.venda))
    const ger = soma(cs.map(total))
    const pRec = parcs.filter(x => x.p.recebida && noP(x.p.data))
    const pArec = parcs.filter(x => !x.p.recebida && noP(x.p.data))
    const rec = soma(pRec.map(x => x.p.valor)), arec = soma(pArec.map(x => x.p.valor))
    const nC = (xs: { c: Contrato }[]) => new Set(xs.map(x => x.c.id)).size
    const est = data.contratos.filter(c => c.estorno && (T || ymLocal(c.estorno.em) === mes))
    const emRisco = soma(pArec.filter(x => x.c.estorno).map(x => x.p.valor))
    const parcial = !T && mes === curYM
    // séries dos últimos 4 meses (até o mês selecionado; em "todo o período", até o mês atual)
    const fim = T ? curYM : mes
    const serie = [-3, -2, -1, 0].map(i => {
      const m = addM(fim, i)
      return {
        ger: soma(data.contratos.filter(c => c.venda?.slice(0, 7) === m).map(total)),
        rec: soma(parcs.filter(x => x.p.recebida && x.p.data?.slice(0, 7) === m).map(x => x.p.valor)),
        arec: soma(parcs.filter(x => !x.p.recebida && x.p.data?.slice(0, 7) === m).map(x => x.p.valor)),
      }
    })
    // comparação justa: mês em andamento vs mês anterior ATÉ O MESMO DIA
    let ant: { ger: number; rec: number } | null = null
    if (!T) {
      const pm = addM(mes, -1), corte = parcial ? `${pm}-${hoje.slice(8, 10)}` : null
      const ok = (d: string | null) => !!d && d.slice(0, 7) === pm && (!corte || d <= corte)
      ant = {
        ger: soma(data.contratos.filter(c => ok(c.venda)).map(total)),
        rec: soma(parcs.filter(x => x.p.recebida && ok(x.p.data)).map(x => x.p.valor)),
      }
    }

    // Velocidade de vendas: leads × taxa de conversão × ticket ÷ ciclo
    const diasMes = (ym: string) => new Date(+ym.slice(0, 4), +ym.slice(5, 7), 0).getDate()
    const frac = (ym: string) => (ym === curYM ? +hoje.slice(8, 10) / diasMes(ym) : 1)
    const vRow = new Map(data.velocidade.map(v => [v.mes, v]))
    const velOf = (ms: string[]) => {
      const rs = ms.map(m => vRow.get(m)).filter(Boolean) as VelMes[]
      const s = (k: keyof VelMes) => soma(rs.map(r => r[k] as number))
      const vendas = s('vendas'), perdidos = s('perdidos')
      const taxa = vendas + perdidos ? vendas / (vendas + perdidos) : 0
      const ticket = vendas ? s('soma_ticket') / vendas : 0
      const ciclo = s('ciclo_n') ? s('ciclo_soma') / s('ciclo_n') : 0
      const fr = soma(ms.map(frac)), leadsMes = fr ? s('leads') / fr : 0
      return { leads: ms.length > 1 ? leadsMes : s('leads'), leadsMes, taxa, ticket, ciclo, v: ciclo ? leadsMes * taxa * ticket / ciclo : 0, tem: rs.length > 0 }
    }
    const velMeses = T ? data.velocidade.map(v => v.mes) : [mes]
    const vel = velOf(velMeses)
    const hist = T ? [] : [-3, -2, -1].map(i => velOf([addM(mes, i)])).filter(h => h.tem)
    // mês sem venda paga com data ainda não tem ciclo: usa a média dos meses anteriores (estimado)
    const hc = hist.filter(h => h.ciclo > 0)
    let cicloEst = false
    if (!vel.ciclo && hc.length) {
      vel.ciclo = soma(hc.map(h => h.ciclo)) / hc.length
      vel.v = vel.leadsMes * vel.taxa * vel.ticket / vel.ciclo
      cicloEst = true
    }
    const prop = parcial ? frac(mes) : 1
    // ciclo e velocidade: só meses que tiveram ciclo (senão a média puxa pra zero)
    const med = (k: 'leads' | 'taxa' | 'ticket' | 'ciclo' | 'v') => {
      const base = k === 'ciclo' || k === 'v' ? hc : hist
      return base.length ? soma(base.map(h => h[k])) / base.length * (k === 'leads' ? prop : 1) : 0
    }
    const histLbl = hist.length ? `${mes3(addM(mes, -hist.length))}–${mes3(addM(mes, -1))}` : ''
    const velLbl = velMeses.length ? `${mes3(velMeses[0])}–${mes3(velMeses[velMeses.length - 1])}` : ''

    // Receita garantida: parcelas futuras não vencidas, sem contratos marcados p/ estorno
    // a partir do mês atual inteiro (inclui as vencidas deste mês) -> a coluna do mês bate com "A receber no mês"
    const futuras = parcs.filter(x => !x.p.recebida && !x.c.estorno && x.p.data && x.p.data >= `${curYM}-01`)

    return {
      T, noP, hoje, curYM, parcial, cs, ger, rec, arec, est, emRisco, serie, ant,
      n: cs.length, ticket: cs.length ? ger / cs.length : 0,
      nRec: nC(pRec), nRecAnt: T ? 0 : nC(pRec.filter(x => !noP(x.c.venda))), nArec: nC(pArec),
      vencN: pArec.filter(x => x.p.data && x.p.data < hoje).length,
      estV: soma(est.map(c => c.estorno!.valor)),
      previsao: parcial ? rec + arec - emRisco : null,
      vel, cicloEst, med, histLbl, velLbl, futuras,
    }
  }, [data, mes])

  if (erro) return <div className="fv-empty">{erro}</div>
  if (!data || !K) return <div className="fv-empty">Carregando…</div>

  const equipe = op === '*'
  const escopo = `${equipe ? 'Toda a equipe' : data.operador} · ${K.T ? 'todo o período' : `${mesLongo(mes)}/${mes.slice(0, 4)}`}`
  const s = (k: 'ger' | 'rec' | 'arec') => K.serie.map(x => x[k])

  // ---- contratos (tabela) ----
  const L = lente.t, ger = L === 'ger'
  const linhas: Linha[] = (() => {
    if (L === 'ger') return K.cs.map(c => ({ c, val: total(c), datas: [] }))
    if (L === 'est') return K.est.map(c => ({ c, val: c.estorno!.valor, datas: c.estorno!.em ? [dLocal(c.estorno!.em)] : [] }))
    const ok = (p: Parcela, c: Contrato) =>
      L === 'rec' ? p.recebida && K.noP(p.data)
        : L === 'arec' ? !p.recebida && K.noP(p.data)
          : L === 'prev' ? K.noP(p.data) && (p.recebida || !c.estorno)
            : !p.recebida && !c.estorno && p.data?.slice(0, 7) === lente.m
    return data.contratos.flatMap(c => {
      const ps = c.parcelas.filter(p => ok(p, c))
      return ps.length ? [{ c, val: soma(ps.map(p => p.valor)), datas: ps.map(p => p.data!).sort() }] : []
    })
  })()
  const totL = soma(linhas.map(r => r.val))
  const noMes = K.T ? '' : ` em ${mesLongo(mes)}`
  const LT: Record<Lente['t'], { tit: string; dt: string; vl: string }> = {
    ger: { tit: K.T ? 'Todos os contratos' : `Contratos vendidos${noMes}`, dt: '', vl: '' },
    rec: { tit: K.T ? 'Parcelas recebidas' : `Recebido${noMes}`, dt: 'Previsão', vl: 'Recebido' },
    arec: { tit: K.T ? 'Parcelas a receber' : `A receber${noMes}`, dt: 'Vencimento', vl: 'A receber' },
    est: { tit: `Marcados p/ possível estorno${noMes}`, dt: 'Marcado em', vl: 'Em risco' },
    prev: { tit: `Previsão de ${mesLongo(mes)}`, dt: 'Vencimento', vl: 'Previsto' },
    gar: { tit: `A receber em ${lente.m ? `${mesLongo(lente.m)}/${lente.m.slice(0, 4)}` : ''}`, dt: 'Vencimento', vl: 'A receber' },
  }
  const lt = LT[L]
  const chave = (c: Contrato) => c[dim] || 'Não informado'
  const acc: Record<string, number> = {}
  linhas.forEach(r => { acc[chave(r.c)] = (acc[chave(r.c)] || 0) + r.val })
  const fatias = Object.entries(acc).sort((a, b) => b[1] - a[1])
  const vis = (filtro ? linhas.filter(r => chave(r.c) === filtro) : linhas)
  const vOrd = ({ c, val, datas }: Linha): string | number => ({
    cli: c.nome, venda: c.venda || '', opr: c.operadora || '',
    parc: (c.parcelas.some(p => !p.recebida && p.data && p.data < K.hoje) ? -1 : 0) + (c.parcelas.length ? c.parcelas.filter(p => p.recebida).length / c.parcelas.length : 0),
    rec: recebido(c), arec: aReceber(c), data: datas[0] || '', val,
  }[sort.k])
  const ordenados = [...vis].sort((a, b) => {
    const x = vOrd(a), y = vOrd(b)
    return (typeof x === 'string' ? x.localeCompare(y as string, 'pt') : x - (y as number)) * sort.d
  })
  const iPeek = peek ? ordenados.findIndex(r => r.c.id === peek) : -1
  const cPeek = iPeek >= 0 ? ordenados[iPeek].c : null
  const cols: [SortK, string, string][] = [['cli', 'Cliente', ''], ['venda', 'Venda', ''], ['opr', 'Operadora · promotora', ''], ['parc', 'Parcelas', ''],
    ...(ger ? [['rec', 'Recebido', 'r'], ['arec', 'A receber', 'r']] : [['data', lt.dt, ''], ['val', lt.vl, 'r']]) as [SortK, string, string][]]

  // clicar no card / ponto do gráfico troca a lista; clicar de novo no mesmo volta pros vendidos
  const abrir = (l: Lente) => {
    const volta = l.t === lente.t && l.m === lente.m && l.t !== 'ger'
    const nl: Lente = volta ? { t: 'ger' } : l
    setLente(nl); setSort(nl.t === 'ger' ? { k: 'venda', d: -1 } : { k: 'data', d: 1 })
    if (volta) return
    setAberto(true)
    setTimeout(() => document.getElementById('fva-contratos')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
  }
  const card = (t: Lente['t'], cl = '') => ({
    className: `fva-k ck${cl}${lente.t === t ? ' sel' : ''}`, role: 'button', tabIndex: 0, 'aria-pressed': lente.t === t,
    onClick: () => abrir({ t }),
    onKeyDown: (e: KEv) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir({ t }) } },
  })

  async function desmarcar(c: Contrato) {
    if (!window.confirm(`Desmarcar o possível estorno de ${c.nome}?`)) return
    await api.delete(`/api/v1/gestao-comercial/fluxo-vendas/estornos/${c.id}`).catch(() => window.alert('Não foi possível desmarcar.'))
    carregar()
  }

  // ---- Velocidade ----
  const FAT: { k: 'leads' | 'taxa' | 'ticket' | 'ciclo'; t: string; f: (v: number) => string; bom: 'up' | 'down'; dica: string }[] = [
    { k: 'leads', t: K.T ? 'Leads por mês' : 'Leads', f: v => String(Math.round(v)), bom: 'up', dica: 'leads recebidos no período' },
    { k: 'taxa', t: 'Taxa de conversão', f: v => Math.round(v * 100) + '%', bom: 'up', dica: 'vendas (pagos + em emissão) ÷ (vendas + perdidos em qualquer etapa); leads em aberto ainda não contam' },
    { k: 'ticket', t: 'Ticket médio', f: v => brl0(v), bom: 'up', dica: 'valor médio das vendas (pagos + em emissão)' },
    { k: 'ciclo', t: 'Ciclo de venda', f: v => Math.round(v) + ' dias', bom: 'down', dica: 'da entrada do lead até a data da venda' },
  ]
  const variacao = (a: number, b: number, bom: 'up' | 'down') => {
    if (!b) return null
    const d = Math.round(((a - b) / b) * 100)
    return { d, ok: d === 0 ? null : (d > 0) === (bom === 'up') }
  }
  const semCiclo = (k: string) => k === 'ciclo' && (K.cicloEst || !K.vel.ciclo)
  const fat = FAT.map(x => ({
    ...x, a: K.vel[x.k], md: K.med(x.k),
    r: K.T || semCiclo(x.k) ? null : variacao(K.vel[x.k], K.med(x.k), x.bom),
    txt: x.k === 'ciclo' && !K.vel.ciclo ? '—' : (x.k === 'ciclo' && K.cicloEst ? '~' : '') + x.f(K.vel[x.k]),
    extra: x.k === 'ciclo' && K.cicloEst ? ' · estimado pela média dos meses anteriores (ainda sem venda paga no mês)' : '',
  }))
  const pior = fat.filter(x => x.r?.ok === false).sort((a, b) => Math.abs(b.r!.d) - Math.abs(a.r!.d))[0]
  const melhor = fat.filter(x => x.r?.ok).sort((a, b) => Math.abs(b.r!.d) - Math.abs(a.r!.d))[0]

  // ---- Receita garantida (curva: quanto entra em cada mês) ----
  const ms = Array.from({ length: garP }, (_, i) => addM(K.curYM, i))
  const porMes = ms.map(m => soma(K.futuras.filter(x => x.p.data!.slice(0, 7) === m).map(x => x.p.valor)))
  const totG = soma(porMes)
  const ativos = new Set(K.futuras.filter(x => ms.includes(x.p.data!.slice(0, 7))).map(x => x.c.id)).size
  // 1º mês a partir do qual não entra mais nada (dentro do período mostrado)
  const zera = porMes.findIndex((_, i) => soma(porMes.slice(i)) <= 0)
  // valores ficam numa linha embaixo do mês (não disputam espaço com a curva)
  const GW = 520, GH = 170, gm = { l: 26, r: 26, t: 12, b: 44 }, n = ms.length
  const passo = n === 1 ? GW : (GW - gm.l - gm.r) / (n - 1)
  const gx = (i: number) => gm.l + (n === 1 ? 0 : i * passo)
  const gy = (v: number) => gm.t + (GH - gm.t - gm.b) * (1 - v / Math.max(1, ...porMes))
  const linha = porMes.map((v, i) => `${i ? 'L' : 'M'}${gx(i).toFixed(1)} ${gy(v).toFixed(1)}`).join(' ')
  const selG = L === 'gar' && lente.m ? ms.indexOf(lente.m) : -1
  const iMax = porMes.indexOf(Math.max(...porMes))
  const mostraV = (i: number) => n <= 6 || i === hov || i === selG || i === iMax || i === 0

  return (
    <section className="fva">
      <h2 className="fva-h2">Analítico financeiro <span className="fva-esc">{escopo}</span></h2>

      {/* ---- cards do topo ---- */}
      <div className={`fva-kpis${K.previsao !== null ? ' k5' : ''}`}>
        <div {...card('ger')}>
          <div className="fva-kt"><span className="fva-kl">Receita gerada</span>{K.ant && <VarPct a={K.ger} b={K.ant.ger} />}</div>
          <b className="fva-kv">{brl0(K.ger)}</b>
          <div className="fva-kf"><small>{K.n} {K.n === 1 ? 'venda' : 'vendas'}<br />ticket {brl0(K.ticket)}</small><Spark vals={s('ger')} cor="var(--accent)" parcial={K.parcial} /></div>
        </div>
        <div {...card('rec')}>
          <div className="fva-kt"><span className="fva-kl">{K.T ? 'Recebida' : 'Recebida no mês'}</span>{K.ant && <VarPct a={K.rec} b={K.ant.rec} />}</div>
          <b className="fva-kv">{brl0(K.rec)}</b>
          <div className="fva-kf">
            <small>de {nCt(K.nRec)}{K.nRecAnt > 0 && <><br /><span className="nw" title={`contratos vendidos antes de ${mesLongo(mes)} que pagaram parcela no mês`}>{K.nRecAnt === K.nRec ? 'todos' : K.nRecAnt} de vendas antigas</span></>}</small>
            <Spark vals={s('rec')} cor="var(--success)" parcial={K.parcial} />
          </div>
        </div>
        <div {...card('arec')}>
          <div className="fva-kt"><span className="fva-kl">{K.T ? 'A receber' : 'A receber no mês'}</span></div>
          <b className="fva-kv">{brl0(K.arec)}</b>
          <div className="fva-kf"><small>{nCt(K.nArec)}{K.vencN > 0 && <><br /><span className="late">{K.vencN} {K.vencN === 1 ? 'vencida' : 'vencidas'}</span></>}</small><Spark vals={s('arec')} cor="var(--accent)" parcial={K.parcial} /></div>
        </div>
        <div {...card('est', ` est${K.estV ? ' on' : ''}`)}>
          <div className="fva-kt"><span className="fva-kl">⚠ Possível estorno</span></div>
          <b className="fva-kv">{brl0(K.estV)}</b>
          <div className="fva-kf col">
            <small title={`marcados pelo financeiro${K.T ? '' : ' no mês'}`}>{K.est.length} {K.est.length === 1 ? 'contrato marcado' : 'contratos marcados'}</small>
          </div>
        </div>
        {K.previsao !== null && (
          <div {...card('prev', ' prev')}>
            <div className="fva-kt"><span className="fva-kl">= Previsão do mês</span></div>
            <b className="fva-kv">{brl0(K.previsao)}</b>
            <div className="fva-kf col">
              <div className="fva-pbar" role="img" aria-label={`${pct(K.rec, K.previsao)}% já entrou`}><i style={{ width: `${Math.min(100, K.previsao ? (K.rec / K.previsao) * 100 : 0)}%` }} /></div>
              <small title={`recebido ${brl0(K.rec)} + a receber ${brl0(K.arec)}${K.emRisco ? ` − em risco de estorno ${brl0(K.emRisco)}` : ''}`}><b>{pct(K.rec, K.previsao)}%</b> já entrou</small>
            </div>
          </div>
        )}
      </div>

      {/* ---- velocidade + garantida ---- */}
      <div className="fva-dono">
        <div className="fva-dp">
          <div className="fva-dh">
            <h4>Velocidade de vendas <span className="fva-info" title="Velocidade = leads × taxa de conversão × ticket médio ÷ ciclo. Índice de ritmo comercial para comparar com os meses anteriores: não é previsão de caixa (essa fica no card A receber).">i</span></h4>
            <span className="fva-sub">{K.T ? `média ${K.velLbl}` : K.histLbl ? `vs média ${K.histLbl}` : 'sem meses anteriores'}</span>
          </div>
          <div className="fva-dh">
            <span className="fva-big">{K.vel.ciclo ? <>{brl0(K.vel.v)}<small>/dia</small></> : '—'}</span>
            {!K.T && K.histLbl && K.vel.ciclo > 0 && <VarPct a={K.vel.v} b={K.med('v')} sufixo="média" />}
          </div>
          <ul className="fva-vf">
            {fat.map(x => (
              <li key={x.k} title={`${x.dica}${x.extra}${K.T || !K.histLbl ? '' : ` · média ${x.f(x.md)}${x.k === 'leads' && K.parcial ? ` até o dia ${+K.hoje.slice(8, 10)}` : ''}`}`}>
                <span className="vt">{x.t}</span><b>{x.txt}</b>
                {x.r ? (x.r.ok === null ? <span className="fva-vp flat">= média</span> : <span className={`fva-vp ${x.r.ok ? 'good' : 'bad'}`}>{x.r.d > 0 ? '▲' : '▼'} {Math.abs(x.r.d)}%</span>) : <span />}
              </li>
            ))}
          </ul>
          {!K.T && (pior || melhor) && (
            <div className="fva-vl">
              {pior ? <>O que mais pesou contra: <b>{pior.t.toLowerCase()}</b> ({pior.f(pior.a)} vs {pior.f(pior.md)} na média).</>
                : <>O que mais ajudou: <b>{melhor!.t.toLowerCase()}</b> ({melhor!.f(melhor!.a)} vs {melhor!.f(melhor!.md)} na média).</>}
            </div>
          )}
        </div>

        <div className="fva-dp gar">
          <div className="fva-dh">
            <h4>Recebimentos previstos <span className="fva-info" title="Quanto entra em cada mês, de parcelas já contratadas (entram mesmo sem nova venda). O mês atual é o mesmo valor do card A receber no mês. Contratos marcados p/ estorno ficam de fora. Clique num mês para ver os contratos.">i</span></h4>
            <div className="fva-seg" role="group" aria-label="Período">
              {[[3, '3 meses'], [6, '6 meses'], [12, '1 ano']].map(([v, t]) => (
                <button key={v} aria-pressed={garP === v} onClick={() => { setGarP(+v); GAR_P = +v; try { localStorage.setItem('fva-gar', String(v)) } catch { /* */ } }}>{t}</button>
              ))}
            </div>
          </div>
          <div className="fva-dh"><span className="fva-big">{brl0(totG)}</span><span className="fva-sub">a receber nos próximos {garP} meses · {nCt(ativos)}</span></div>
          <div className="fva-curva">
            <svg viewBox={`0 0 ${GW} ${GH}`} role="img" aria-label={`A receber por mês: ${ms.map((m, i) => `${mesLongo(m)} ${brl0(porMes[i])}`).join(', ')}`}>
              <defs><linearGradient id="fva-gbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--accent)" stopOpacity=".22" /><stop offset="1" stopColor="var(--accent)" stopOpacity="0" /></linearGradient></defs>
              <line x1={gm.l} x2={GW - gm.r} y1={GH - gm.b} y2={GH - gm.b} className="base" />
              <path d={`${linha} L${gx(n - 1)} ${GH - gm.b} L${gx(0)} ${GH - gm.b} Z`} fill="url(#fva-gbg)" />
              <path d={linha} className="ln" />
              {(hov ?? selG) >= 0 && <line x1={gx(hov ?? selG)} x2={gx(hov ?? selG)} y1={gm.t - 4} y2={GH - gm.b} className="guia" />}
              {porMes.map((v, i) => {
                const ativo = i === hov || i === selG
                return (
                  <g key={ms[i]} className={ativo ? 'at' : ''}>
                    <circle cx={gx(i)} cy={gy(v)} r={ativo ? 5 : i === 0 ? 4.5 : 3} className={i === 0 || ativo ? 'on' : ''} />
                    <text x={gx(i)} y={GH - gm.b + 17} textAnchor="middle" className="m">{mes3(ms[i])}</text>
                    {mostraV(i) && <text x={gx(i)} y={GH - gm.b + 34} textAnchor="middle" className="v">{mil(v)}</text>}
                  </g>
                )
              })}
              {porMes.map((v, i) => v > 0 && (
                <rect key={`h${ms[i]}`} x={gx(i) - passo / 2} y={0} width={passo} height={GH} className="hit"
                  role="button" tabIndex={0} aria-label={`${mesLongo(ms[i])}: entra ${brl0(v)}. Ver contratos`}
                  onMouseEnter={() => setHov(i)} onMouseLeave={() => setHov(null)} onFocus={() => setHov(i)} onBlur={() => setHov(null)}
                  onClick={() => abrir({ t: 'gar', m: ms[i] })}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir({ t: 'gar', m: ms[i] }) } }}>
                  <title>{`${mesLongo(ms[i])}: entra ${brl0(v)} · clique para ver os contratos`}</title>
                </rect>
              ))}
            </svg>
            <div className="fva-sub">Quanto entra em cada mês{zera > 0 && <> · a carteira atual se esgota em <b>{mesLongo(ms[zera])}</b></>}</div>
          </div>
        </div>
      </div>

      {/* ---- contratos ---- */}
      <details id="fva-contratos" className="fv-acc" open={aberto} onToggle={e => setAberto((e.target as HTMLDetailsElement).open)}>
        <summary>
          <span className="at">{lt.tit}</span>
          <span className="ar">{nCt(linhas.length)} · {brl0(totL)}{ger && K.est.length > 0 && ` · ${K.est.length} marcado${K.est.length === 1 ? '' : 's'} p/ estorno`}</span>
          <ChevronDown size={15} className="chev" />
        </summary>
        {aberto && (
          <div className="ab fva-ctb">
            <div className="fva-tool">
              {!ger && <button className="fva-link sm vt" onClick={() => abrir({ t: 'ger' })}>← {K.T ? 'todos os contratos' : `contratos vendidos${noMes}`}</button>}
              <div className="fva-seg" role="group" aria-label="Agrupar por">
                {DIMS.map(([k, t]) => <button key={k} aria-pressed={dim === k} onClick={() => setDim(k)}>{t}</button>)}
              </div>
              {fatias.length > 0 && (
                <div className="fva-pills" role="group" aria-label="Filtrar contratos">
                  <button className={`fva-pill${filtro ? '' : ' on'}`} aria-pressed={!filtro} onClick={() => setFiltro(null)}>Todos <span>{brl0(totL)}</span></button>
                  {fatias.map(([k, v]) => (
                    <button key={k} className={`fva-pill${filtro === k ? ' on' : ''}`} aria-pressed={filtro === k} title={`${k}: ${brl0(v)}`} onClick={() => setFiltro(k)}>{k} <span>{pct(v, totL)}%</span></button>
                  ))}
                </div>
              )}
            </div>
            <div className="fva-tw">
              <table className="fva-t">
                <thead><tr>
                  {cols.map(([k, t, cl]) => (
                    <th key={k} className={cl}>
                      <button className={`fva-sort${sort.k === k ? ' on' : ''}`} aria-sort={sort.k === k ? (sort.d > 0 ? 'ascending' : 'descending') : 'none'}
                        onClick={() => setSort(sort.k === k ? { k, d: (-sort.d) as 1 | -1 } : { k, d: k === 'cli' || k === 'opr' ? 1 : -1 })}>
                        {t}<span aria-hidden="true">{sort.k === k ? (sort.d > 0 ? '↑' : '↓') : '↕'}</span>
                      </button>
                    </th>
                  ))}
                  <th className="r"><span className="fva-sr">Ações</span></th>
                </tr></thead>
                <tbody>
                  {ordenados.length === 0 && <tr><td colSpan={7} className="fva-vazio">{ger ? `Nenhuma venda ${K.T ? 'registrada' : `com data em ${mesLongo(mes)}`}.` : 'Nenhum contrato neste recorte.'}</td></tr>}
                  {ordenados.map(({ c, val, datas }) => {
                    const pr = c.parcelas.filter(p => p.recebida).length, np = c.parcelas.length
                    const venc = c.parcelas.some(p => !p.recebida && p.data && p.data < K.hoje)
                    const prox = c.parcelas.find(p => !p.recebida && p.data && p.data >= K.hoje)
                    const rc = recebido(c)
                    return (
                      <tr key={c.id} tabIndex={0} className={c.estorno ? 'est' : ''} onClick={() => setPeek(c.id)} onKeyDown={e => { if (e.key === 'Enter') setPeek(c.id) }}>
                        <td className="nm"><b>{c.nome}</b><small>{c.modalidade || '—'} · {brl0(total(c))}{equipe && c.atendente && <> · <span className="atd">{c.atendente}</span></>}</small></td>
                        <td className="mut num">{c.venda ? ddmm(c.venda) : '—'}</td>
                        <td className="nm"><b className="op">{c.operadora ? nomeOp(c.operadora) : '—'}</b><small>{c.promotora || '—'}</small></td>
                        <td>
                          <div className="fva-pgb" title={c.parcelas.map(p => `${p.numero ?? '—'}ª ${brl0(p.valor)} · ${p.recebida ? 'recebida' : p.data && p.data < K.hoje ? 'vencida' : 'a receber'}`).join('\n')}>
                            {c.parcelas.map((p, i) => <i key={i} className={p.recebida ? 'ok' : p.data && p.data < K.hoje ? 'late' : ''} />)}
                          </div>
                          <small className="fva-pgs">{venc ? <b className="late">parcela vencida</b> : <>{pr} de {np} recebidas{prox?.data && <> · próx. {ddmm(prox.data)}</>}</>}</small>
                        </td>
                        {ger ? <>
                          <td className={`r num${rc ? '' : ' mut'}`}>{rc ? brl0(rc) : '—'}</td>
                          <td className="r num"><b>{brl0(aReceber(c))}</b></td>
                        </> : <>
                          <td className="mut num">{datas.length ? <>{ddmm(datas[0])}{datas.length > 1 && <small title={datas.map(ddmm).join(', ')}> +{datas.length - 1}</small>}</> : '—'}</td>
                          <td className="r num"><b>{brl0(val)}</b></td>
                        </>}
                        <td className="r" onClick={e => e.stopPropagation()}>
                          {c.estorno
                            ? <button className="fva-estb on" title={`${c.estorno.observacao ? c.estorno.observacao + ' · ' : ''}marcado por ${c.estorno.por || '—'} · clique para desmarcar`} onClick={() => desmarcar(c)}>⚠ estorno {brl0(c.estorno.valor)}</button>
                            : <button className="fva-estb hov" onClick={() => setMarcar(c)}>Marcar estorno</button>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                {ordenados.length > 0 && (
                  <tfoot><tr>
                    <td colSpan={4}><b>{filtro ? `${filtro} · ` : ''}{nCt(ordenados.length)}</b>{filtro && <button className="fva-link sm" onClick={() => setFiltro(null)}>limpar filtro</button>}</td>
                    {ger ? <>
                      <td className="r num">{brl0(soma(ordenados.map(r => recebido(r.c))))}</td>
                      <td className="r num"><b>{brl0(soma(ordenados.map(r => aReceber(r.c))))}</b></td>
                    </> : <>
                      <td />
                      <td className="r num"><b>{brl0(soma(ordenados.map(r => r.val)))}</b></td>
                    </>}
                    <td />
                  </tr></tfoot>
                )}
              </table>
            </div>
          </div>
        )}
      </details>

      {cPeek && (
        <LeadPeekDrawer
          key="peek"
          lead={{ id: cPeek.id, name: cPeek.nome, phone: cPeek.phone, email: cPeek.email, origem: cPeek.origem, modalidade: cPeek.modalidade, status: cPeek.status, perception: cPeek.perception, value_potential: cPeek.value_potential, vidas: cPeek.vidas }}
          onClose={() => setPeek(null)}
          onOpenFull={() => window.open(`/leads/${cPeek.id}`, '_blank')}
          position={{ index: iPeek + 1, total: ordenados.length }}
          onPrev={iPeek > 0 ? () => setPeek(ordenados[iPeek - 1].c.id) : undefined}
          onNext={iPeek < ordenados.length - 1 ? () => setPeek(ordenados[iPeek + 1].c.id) : undefined}
          onStatusChanged={() => carregar()}
        />
      )}

      {marcar && <DialogoEstorno c={marcar} onClose={() => setMarcar(null)} onSalvo={() => { setMarcar(null); carregar() }} />}
    </section>
  )
}

function DialogoEstorno({ c, onClose, onSalvo }: { c: Contrato; onClose: () => void; onSalvo: () => void }) {
  const sugerido = aReceber(c) || total(c)
  const [valor, setValor] = useState(String(Math.round(sugerido * 100) / 100).replace('.', ','))
  const [obs, setObs] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onClose])
  async function salvar() {
    const v = parseFloat(valor.replace(/\./g, '').replace(',', '.'))
    if (!v || v <= 0) { setErro('Informe o valor em risco.'); return }
    setSalvando(true)
    try {
      await api.post('/api/v1/gestao-comercial/fluxo-vendas/estornos', { lead_id: c.id, valor: v, observacao: obs })
      onSalvo()
    } catch { setErro('Não foi possível salvar. Tente de novo.'); setSalvando(false) }
  }
  return (
    <div className="fva-ov" onClick={onClose}>
      <div className="fva-dlg" role="dialog" aria-modal="true" aria-labelledby="fva-dlg-t" onClick={e => e.stopPropagation()}>
        <h3 id="fva-dlg-t">Marcar possível estorno</h3>
        <p>{c.nome} · {brl0(aReceber(c))} a receber</p>
        <label>Valor em risco (R$)<input inputMode="decimal" value={valor} onChange={e => setValor(e.target.value)} autoFocus /></label>
        <label>Observação<textarea rows={3} value={obs} onChange={e => setObs(e.target.value)} placeholder="Ex.: cliente pediu cancelamento, 2ª parcela não paga…" /></label>
        {erro && <div className="fva-err">{erro}</div>}
        <div className="fva-dlg-f">
          <button className="fva-btn" onClick={onClose}>Cancelar</button>
          <button className="fva-btn pri" disabled={salvando} onClick={salvar}>{salvando ? 'Salvando…' : 'Marcar estorno'}</button>
        </div>
      </div>
    </div>
  )
}
