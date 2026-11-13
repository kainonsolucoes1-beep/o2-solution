import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Lock } from 'lucide-react'
import api from '../api'

// Tela "Macro" (Financeiro → Macro): onde está o dinheiro, etapa por etapa da escada de certeza.
// Em negociação (em análise) → Em emissão (provável) → Aguardando faturamento (fechado) → A receber (garantido).
// Base: opção D do mockup (artifact "O2 Sig · Macro").

type Periodo = '30' | '90' | '365'
type Stg = 'neg' | 'est' | 'fat' | 'arec' | 'hist'
interface LeadBase { id: string; nome: string; modalidade: string | null; vidas: number | null; responsavel: string | null }
interface NegRow extends LeadBase { etapa: string; valor: number; operadora: string | null; dias: number | null }
interface CtRow extends LeadBase { valor: number; operadora: string | null; promotora: string | null; dias: number | null }
interface ParcRow { lead_id: string; nome: string; modalidade: string | null; vidas: number | null; numero: number | null; de: number | null; valor: number; vence: string; atrasada: boolean; operadora: string | null; promotora: string | null; responsavel: string | null }
interface HistRow { operadora: string | null; promotora: string | null; valor: number }
interface Resumo { hoje: string; fim_periodo: string; negociacao: NegRow[]; emissao: CtRow[]; faturamento: CtRow[]; parcelas: ParcRow[]; historico: HistRow[] }
type Dim = 'o' | 'p'
type Drawer = null | { k: 'neg' | 'est' | 'fat' | 'arec' } | { k: 'ent'; d: Dim; nome: string; ov: boolean }

const STG: Record<Stg, [string, string, number, string]> = {
  neg: ['Em negociação', 'em análise', 0.3, '#9333EA'],
  est: ['Em emissão', 'provável', 0.5, '#0891B2'],
  fat: ['Aguardando faturamento', 'fechado', 0.75, '#0D9488'],
  arec: ['A receber', 'garantido', 1, '#15803D'],
  hist: ['Histórico 12 meses', 'receita realizada', 1, '#15803D'],
}
const ETAPAS: [string, string, string][] = [
  ['novo', 'Novo', '#64748B'], ['aguardando_dados', 'Aguardando dados', '#6366F1'], ['sem_retorno', 'Sem retorno', '#4A6FA5'],
  ['agendado', 'Agendado', '#2563EB'], ['proposta', 'Proposta', '#9333EA'], ['pendencia', 'Pendência', '#D97706'],
]
const IDADE: [string, number, number, string][] = [['até 15 dias', 0, 15, '#059669'], ['16–30 dias', 16, 30, '#2563EB'], ['31–90 dias', 31, 90, '#D97706'], ['+90 dias', 91, 1e9, '#DC2626']]
const PALETA = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#7c5cd6', '#22a022', '#8a94a3']
const SEM: Record<Dim, string> = { o: 'Sem operadora', p: 'Sem promotora' }

const nf = (v: number, d = 1) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })
const fk = (v: number) => (v >= 1e6 ? `R$ ${nf(v / 1e6, 2)} mi` : `R$ ${nf(v / 1000)} mil`)
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0) + '%'
const pl = (n: number, w: string, wp?: string) => `${n} ${n === 1 ? w : (wp ?? w + 's')}`
const soma = <T extends { valor: number }>(L: T[]) => L.reduce((a, r) => a + r.valor, 0)
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const nomeDe = (r: { operadora: string | null; promotora?: string | null }, d: Dim) => (d === 'o' ? r.operadora : r.promotora ?? null) || SEM[d]
const subLead = (r: { modalidade: string | null; vidas: number | null }) => [r.modalidade, r.vidas ? pl(r.vidas, 'vida') : null].filter(Boolean).join(' · ')

interface Grupo { nome: string; valor: number; n: number; cor?: string }
function agrupa<T extends { valor: number }>(L: T[], key: (r: T) => string): Grupo[] {
  const m = new Map<string, Grupo>()
  L.forEach(r => { const k = key(r); const g = m.get(k) ?? { nome: k, valor: 0, n: 0 }; g.valor += r.valor; g.n++; m.set(k, g) })
  return [...m.values()].sort((a, b) => b.valor - a.valor)
}

export default function Macro() {
  const navigate = useNavigate()
  const [periodo, setPeriodo] = useState<Periodo>('30')
  const [data, setData] = useState<Resumo | null>(null)
  const [erro, setErro] = useState('')
  const [stg, setStg] = useState<Stg>('neg')
  const [dr, setDr] = useState<Drawer>(null)

  useEffect(() => {
    let vivo = true
    setErro('')
    api.get<Resumo>(`/api/v1/macro/resumo?periodo=${periodo}`)
      .then(r => { if (vivo) setData(r.data) })
      .catch(e => { if (vivo) setErro(e?.response?.status === 403 ? 'Você não tem acesso a esta tela.' : 'Não foi possível carregar os dados.') })
    return () => { vivo = false }
  }, [periodo])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setDr(null) }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  // cor fixa por nome (ordem do maior pro menor no geral), igual em todos os cards
  const cor = useMemo(() => {
    const m = new Map<string, string>()
    if (!data) return m
    for (const d of ['o', 'p'] as Dim[]) {
      const tudo = [...data.negociacao.map(r => ({ ...r, promotora: null })), ...data.emissao, ...data.faturamento, ...data.parcelas, ...data.historico]
      agrupa(tudo, r => nomeDe(r, d)).forEach((g, i) => { if (!m.has(g.nome)) m.set(g.nome, g.nome === SEM[d] ? PALETA[7] : PALETA[i % 7]) })
    }
    return m
  }, [data])
  const c = (nome: string) => cor.get(nome) ?? PALETA[7]

  if (erro) return <div className="mc"><Estilo /><div className="mc-empty" style={{ marginTop: 40 }}>{erro}</div></div>
  if (!data) return <div className="mc"><Estilo /><div className="mc-empty" style={{ marginTop: 40 }}>Carregando…</div></div>

  const D = data
  const negV = D.negociacao.filter(r => r.valor > 0)
  const totNeg = soma(negV), parado = negV.filter(r => (r.dias ?? 0) > 90), totPar = soma(parado)
  const totEst = soma(D.emissao), totFat = soma(D.faturamento), totArec = soma(D.parcelas)
  const atras = D.parcelas.filter(p => p.atrasada), fatOld = D.faturamento.filter(r => (r.dias ?? 0) > 15)
  const fimLbl = periodo === '30' ? `até ${ddmm(D.fim_periodo)}` : periodo === '90' ? 'nos próximos 90 dias' : 'nos próximos 12 meses'

  // linhas de uma etapa (pra ranking e painéis)
  const linhas = (s: Stg): { valor: number; operadora: string | null; promotora?: string | null }[] =>
    s === 'neg' ? negV : s === 'est' ? D.emissao : s === 'fat' ? D.faturamento : s === 'arec' ? D.parcelas : D.historico

  const abrirLead = (id: string) => navigate(`/leads/${id}`)

  // ---------- blocos reutilizados ----------
  const Comp = ({ rows, unid }: { rows: Grupo[]; unid?: [string, string] }) => {
    const t = rows.reduce((a, r) => a + r.valor, 0) || 1
    // cor: a da faixa (idade), a fixa da operadora/promotora, ou paleta por posição (responsáveis)
    const k = (r: Grupo, i: number) => r.cor ?? cor.get(r.nome) ?? (r.nome.startsWith('Sem ') ? PALETA[7] : PALETA[i % 7])
    return (
      <div>
        <div className="mc-cbar">{rows.map((r, i) => <i key={r.nome} title={`${r.nome}: ${fk(r.valor)} (${pct(r.valor, t)})`} style={{ flex: r.valor || 0.0001, background: k(r, i) }} />)}</div>
        {rows.map((r, i) => (
          <div key={r.nome} className="mc-crow">
            <span className="mc-dot" style={{ background: k(r, i) }} /><span className="nm">{r.nome}</span>
            <span className="n">{unid ? pl(r.n, unid[0], unid[1]) : ''}</span><span className="p">{pct(r.valor, t)}</span><b>{fk(r.valor)}</b>
          </div>
        ))}
      </div>
    )
  }
  const Sec = ({ t, sub, children }: { t: string; sub?: string; children: ReactNode }) => (
    <div className="mc-dsec"><h4>{t}{sub && <span>{sub}</span>}</h4>{children}</div>
  )
  const Box = ({ v, l, cor: k }: { v: string; l: string; cor?: string }) => <div><b style={k ? { color: k } : undefined}>{v}</b><span>{l}</span></div>
  const CtItem = ({ r, kind, hide }: { r: CtRow; kind: 'est' | 'fat'; hide?: Dim }) => (
    <button className="mc-li" onClick={() => abrirLead(r.id)}>
      <span className="t">{r.nome}{subLead(r) && <small> · {subLead(r)}</small>}</span><b>{fk(r.valor)}</b>
      <span className="m">
        <span className="mc-tag" style={{ ['--o' as string]: STG[kind][2] }}>{STG[kind][0]}</span>
        {[hide !== 'o' ? nomeDe(r, 'o') : null, hide !== 'p' ? nomeDe(r, 'p') : null, r.responsavel].filter(Boolean).join(' · ')}
        {r.dias != null && <> · <span style={r.dias > 15 ? { color: 'var(--warning)', fontWeight: 600 } : undefined}>{pl(r.dias, 'dia')} na etapa</span></>}
      </span>
    </button>
  )
  const NegItem = ({ r }: { r: NegRow }) => {
    const e = ETAPAS.find(x => x[0] === r.etapa)
    return (
      <button className="mc-li" onClick={() => abrirLead(r.id)}>
        <span className="t">{r.nome}{subLead(r) && <small> · {subLead(r)}</small>}</span><b>{fk(r.valor)}</b>
        <span className="m">
          <span className="mc-dot" style={{ background: e?.[2] }} />{e?.[1]} · {r.operadora || SEM.o} · {r.responsavel || 'Sem dono'}
          {r.dias != null && <> · <span style={r.dias > 90 ? { color: 'var(--danger)', fontWeight: 600 } : r.dias > 30 ? { color: 'var(--warning)', fontWeight: 600 } : undefined}>{pl(r.dias, 'dia')} sem avançar</span></>}
        </span>
      </button>
    )
  }
  const ParcTable = ({ L, col }: { L: ParcRow[]; col?: Dim }) => (
    <div className="mc-scroll"><table className="mc-tb"><thead><tr><th>Contrato</th>{col && <th>{col === 'o' ? 'Operadora' : 'Promotora'}</th>}<th>Parcela</th><th>Vence</th><th>Valor</th></tr></thead>
      <tbody>{L.map((p, i) => (
        <tr key={i} onClick={() => abrirLead(p.lead_id)} style={{ cursor: 'pointer' }}>
          <td>{p.nome}</td>{col && <td>{nomeDe(p, col)}</td>}<td>{p.numero ? `${p.numero}${p.de ? '/' + p.de : ''}` : '—'}</td>
          <td style={p.atrasada ? { color: 'var(--danger)', fontWeight: 600 } : undefined}>{ddmm(p.vence)}{p.atrasada ? ' · atrasada' : ''}</td><td>{brl(p.valor)}</td>
        </tr>))}
      </tbody></table></div>
  )

  // ---------- painéis laterais ----------
  function painel(): [string, string, ReactNode] | null {
    if (!dr) return null
    if (dr.k === 'neg') {
      const fx = IDADE.map(([l, a, z, k]) => { const L = negV.filter(r => (r.dias ?? 0) >= a && (r.dias ?? 0) <= z); return { l, k, v: soma(L), n: L.length } })
      return ['Em negociação', STG.neg[3], <>
        <Sec t="Total"><div className="mc-big">{fk(totNeg)}</div><div className="mc-muted">{pl(negV.length, 'lead')} com cotação · {pl(D.negociacao.length - negV.length, 'lead')} ainda sem valor</div></Sec>
        <Sec t="Idade do dinheiro" sub="tempo sem mudar de etapa"><Comp rows={fx.map(f => ({ nome: f.l, valor: f.v, n: f.n, cor: f.k }))} unid={['lead', 'leads']} /></Sec>
        <Sec t="Por etapa"><table className="mc-tb"><thead><tr><th>Etapa</th><th>Valor</th><th>Leads</th><th>Idade média</th></tr></thead><tbody>
          {ETAPAS.map(([k, l, col]) => { const L = negV.filter(r => r.etapa === k); if (!L.length) return null; const age = Math.round(L.reduce((a, r) => a + (r.dias ?? 0), 0) / L.length)
            return <tr key={k}><td><span className="mc-dot" style={{ background: col, marginRight: 7 }} />{l}</td><td>{fk(soma(L))}</td><td>{L.length}</td><td style={age > 90 ? { color: 'var(--danger)', fontWeight: 600 } : undefined}>{age}d</td></tr> })}
        </tbody></table></Sec>
        <Sec t="Maiores negociações abertas"><div className="mc-lst">{[...negV].sort((a, b) => b.valor - a.valor).slice(0, 10).map(r => <NegItem key={r.id} r={r} />)}</div></Sec>
      </>]
    }
    if (dr.k === 'est' || dr.k === 'fat') {
      const L = dr.k === 'est' ? D.emissao : D.faturamento, tot = soma(L)
      const fx = [['até 7 dias', 0, 7, '#059669'], ['8–15 dias', 8, 15, '#2563EB'], ['+15 dias', 16, 1e9, '#D97706']] as const
      return [STG[dr.k][0], STG[dr.k][3], <>
        <Sec t="Total em contratos"><div className="mc-big">{fk(tot)}</div><div className="mc-muted">{pl(L.length, 'contrato')} {dr.k === 'est' ? 'na operadora, em emissão' : 'emitidos esperando o 1º faturamento'}</div></Sec>
        {dr.k === 'fat' && L.length > 0 && <Sec t="Tempo esperando"><Comp rows={fx.map(([l, a, z, k]) => { const X = L.filter(r => (r.dias ?? 0) >= a && (r.dias ?? 0) <= z); return { nome: l, valor: soma(X), n: X.length, cor: k } })} unid={['contrato', 'contratos']} /></Sec>}
        <Sec t="Por promotora"><Comp rows={agrupa(L, r => nomeDe(r, 'p'))} unid={['contrato', 'contratos']} /></Sec>
        <Sec t="Por operadora"><Comp rows={agrupa(L, r => nomeDe(r, 'o'))} unid={['contrato', 'contratos']} /></Sec>
        <Sec t="Contratos" sub="mais antigos na etapa primeiro">{L.length ? <div className="mc-lst">{[...L].sort((a, b) => (b.dias ?? 0) - (a.dias ?? 0)).map(r => <CtItem key={r.id} r={r} kind={dr.k as 'est' | 'fat'} />)}</div> : <div className="mc-empty">Nenhum contrato nesta etapa.</div>}</Sec>
      </>]
    }
    if (dr.k === 'arec') {
      return ['A receber no período', STG.arec[3], <>
        <Sec t={`A receber · ${fimLbl}`}><div className="mc-big">{fk(totArec)}</div><div className="mc-muted">{pl(D.parcelas.length, 'parcela')} com previsão de recebimento</div></Sec>
        {atras.length > 0 && <div className="mc-note warn"><b>{brl(soma(atras))} em atraso:</b> {pl(atras.length, 'parcela venceu', 'parcelas venceram')} e ainda não {atras.length === 1 ? 'foi marcada como paga' : 'foram marcadas como pagas'}.</div>}
        <Sec t="Por promotora"><Comp rows={agrupa(D.parcelas, r => nomeDe(r, 'p'))} unid={['parcela', 'parcelas']} /></Sec>
        <Sec t="Próximas parcelas">{D.parcelas.length ? <ParcTable L={D.parcelas} col="p" /> : <div className="mc-empty">Nenhuma parcela prevista no período.</div>}</Sec>
      </>]
    }
    // operadora / promotora
    const { d, nome } = dr, isO = d === 'o', outra: Dim = isO ? 'p' : 'o'
    const de = <T extends { operadora: string | null; promotora?: string | null }>(L: T[]) => L.filter(r => nomeDe(r, d) === nome)
    const em = de(D.emissao), fa = de(D.faturamento), pa = de(D.parcelas), ng = isO ? negV.filter(r => (r.operadora || SEM.o) === nome) : []
    const full = dr.ov || stg === 'hist'
    if (!full) {
      const s = stg
      let corpo: ReactNode
      if (s === 'neg') {
        corpo = <>
          <div className="mc-dwk"><Box v={fk(soma(ng))} l="em negociação" /><Box v={pl(ng.length, 'lead')} l="com cotação" /><Box v={fk(soma(ng.filter(r => (r.dias ?? 0) > 90)))} l="parado há +90 dias" cor="var(--danger)" /></div>
          <Sec t="Por responsável"><Comp rows={agrupa(ng, r => r.responsavel || 'Sem dono')} unid={['lead', 'leads']} /></Sec>
          <Sec t="Cotações em aberto" sub="maiores primeiro">{ng.length ? <div className="mc-lst">{[...ng].sort((a, b) => b.valor - a.valor).slice(0, 30).map(r => <NegItem key={r.id} r={r} />)}</div> : <div className="mc-empty">Nenhuma cotação aberta.</div>}</Sec>
        </>
      } else if (s === 'est' || s === 'fat') {
        const L = s === 'est' ? em : fa
        corpo = <>
          <div className="mc-dwk"><Box v={fk(soma(L))} l={`${pl(L.length, 'contrato')} ${s === 'est' ? 'em emissão' : 'aguardando faturamento'}`} />
            <Box v={L.length ? pl(Math.round(L.reduce((a, r) => a + (r.dias ?? 0), 0) / L.length), 'dia') : '—'} l="tempo médio na etapa" cor={L.some(r => (r.dias ?? 0) > 15) ? 'var(--warning)' : undefined} /></div>
          <Sec t={`Contratos ${s === 'est' ? 'em emissão' : 'aguardando faturamento'}`}>{L.length ? <div className="mc-lst">{[...L].sort((a, b) => (b.dias ?? 0) - (a.dias ?? 0)).map(r => <CtItem key={r.id} r={r} kind={s} hide={d} />)}</div> : <div className="mc-empty">Nenhum contrato nesta etapa.</div>}</Sec>
        </>
      } else {
        const at = pa.filter(p => p.atrasada)
        corpo = <>
          <div className="mc-dwk"><Box v={brl(soma(pa))} l={`${pl(pa.length, 'parcela')} a receber`} /><Box v={brl(soma(at))} l={pl(at.length, 'atrasada')} cor={at.length ? 'var(--danger)' : undefined} /></div>
          <Sec t="Parcelas a receber">{pa.length ? <ParcTable L={pa} col={outra} /> : <div className="mc-empty">Nenhuma parcela a receber.</div>}</Sec>
        </>
      }
      return [`${nome} · ${STG[s][0]}`, STG[s][3], <>{corpo}<button className="mc-dtl" onClick={() => setDr({ ...dr, ov: true })}>Ver visão completa de {nome} →</button></>]
    }
    const rev = agrupa(D.historico, r => nomeDe(r, d)), rt = soma(rev), rv = rev.find(g => g.nome === nome), pos = rv ? rev.indexOf(rv) + 1 : 0
    const ctl: { r: CtRow; k: 'est' | 'fat' }[] = [...em.map(r => ({ r, k: 'est' as const })), ...fa.map(r => ({ r, k: 'fat' as const }))].sort((a, b) => (b.r.dias ?? 0) - (a.r.dias ?? 0))
    const lad: [Stg, number | null, string][] = [['neg', isO ? soma(ng) : null, isO ? pl(ng.length, 'lead') : 'promotora definida na emissão'], ['est', soma(em), pl(em.length, 'contrato')], ['fat', soma(fa), pl(fa.length, 'contrato')], ['arec', soma(pa), fimLbl]]
    const dist = agrupa([...em, ...fa], r => nomeDe(r, outra))
    return [`${isO ? 'Operadora' : 'Promotora'} · ${nome}`, c(nome), <>
      {stg !== 'hist' && <button className="mc-back" onClick={() => setDr({ ...dr, ov: false })}>← voltar para {STG[stg][0]}</button>}
      <div className="mc-dwk"><Box v={fk(rv?.valor ?? 0)} l={`receita 12 meses${rv ? ` · ${pct(rv.valor, rt)} do total · ${pos}º lugar` : ''}`} /><Box v={fk(soma(pa))} l={`garantido · a receber ${fimLbl}`} /></div>
      <Sec t="Em cada etapa"><div className="mc-lad">{lad.map(([k, v, s]) => (
        <div key={k} className="mc-ladr"><span className="mc-tag" style={{ ['--o' as string]: STG[k][2] }}>{STG[k][1]}</span><span>{STG[k][0]}<small>{s}</small></span><b>{v == null ? '—' : fk(v)}</b></div>))}</div></Sec>
      <Sec t="Contratos em andamento">{ctl.length ? <div className="mc-lst">{ctl.map(({ r, k }) => <CtItem key={r.id} r={r} kind={k} hide={d} />)}</div> : <div className="mc-empty">Nenhum contrato em emissão ou aguardando faturamento.</div>}</Sec>
      {dist.length > 0 && <Sec t={`Distribuição por ${isO ? 'promotora' : 'operadora'}`} sub="emissão + faturamento"><Comp rows={dist} unid={['contrato', 'contratos']} /></Sec>}
      {isO && ng.length > 0 && <Sec t="Negociação por responsável"><Comp rows={agrupa(ng, r => r.responsavel || 'Sem dono')} unid={['lead', 'leads']} /></Sec>}
      {pa.length > 0 && <Sec t="Próximas parcelas"><ParcTable L={pa} /></Sec>}
    </>]
  }

  // ---------- página ----------
  const st = STG[stg]
  const rk = (d: Dim) => {
    const tit = d === 'o' ? 'Por operadora' : 'Por promotora', sub = stg === 'hist' ? 'receita dos últimos 12 meses' : stg === 'arec' ? `a receber ${fimLbl}` : st[0].toLowerCase() + ' agora'
    if (stg === 'neg' && d === 'p') return (
      <div className="mc-card"><div className="mc-ch"><h3>{tit}</h3><span className="sub">{sub}</span></div>
        <div className="mc-empty">A promotora é definida a partir da <b>emissão</b>.<br />Na negociação ela ainda não existe — clique em <b>Em emissão</b> ou nas etapas seguintes.</div></div>)
    const G = agrupa(linhas(stg), r => nomeDe(r, d)), tot = soma(G), max = G[0]?.valor || 1, top2 = G.length > 1 ? (G[0].valor + G[1].valor) / (tot || 1) : 1
    return (
      <div className="mc-card"><div className="mc-ch"><h3>{tit}</h3><span className="sub">{sub}</span><span className="tot">{fk(tot)}</span></div>
        {G.length ? <div className="mc-rkl">{G.map(g => (
          <button key={g.nome} className="mc-rkr" onClick={() => setDr({ k: 'ent', d, nome: g.nome, ov: false })} title={`${g.nome}: ${fk(g.valor)} · ${pct(g.valor, tot)}`}>
            <span className="nm">{g.nome}</span><span className="bar"><i style={{ width: `${(g.valor / max) * 100}%`, opacity: st[2] }} /></span>
            <b>{pct(g.valor, tot)}</b><span className="r">{fk(g.valor)}</span><span className="vd">detalhe →</span>
          </button>))}</div> : <div className="mc-empty">Nada nesta etapa.</div>}
        {G.length > 1 && <div className="mc-note">As 2 maiores {d === 'o' ? 'operadoras' : 'promotoras'} ({G[0].nome} e {G[1].nome}) somam <b>{pct(top2, 1)}</b> deste valor{top2 > 0.45 ? ': dependência alta' : ''}.</div>}
      </div>)
  }
  const ms = (k: Stg, l: string, v: number, s: ReactNode) => (
    <button className={`mc-ms ${stg === k ? 'sel' : ''}`} onClick={() => setStg(k)}>
      <span className="l"><span className="mc-dot" style={{ background: STG[k][3] }} />{l}<span className="mc-tag" style={{ ['--o' as string]: STG[k][2], marginLeft: 'auto' }}>{STG[k][1]}</span></span>
      <span className="v">{fk(v)}</span><span className="s">{s}</span>
    </button>)
  const P = painel()

  return (
    <div className="mc">
      <Estilo />
      <div className="mc-top">
        <h1>Macro</h1>
        <span className="mc-lock"><Lock size={12} />Admin · Diretor · Financeiro · Coordenador</span>
        <div style={{ flex: 1 }} />
        <span className="mc-muted" style={{ fontSize: 12 }}>A receber:</span>
        <div className="mc-seg">{([['30', 'Este mês'], ['90', '90 dias'], ['365', '12 meses']] as const).map(([p, l]) => <button key={p} className={periodo === p ? 'on' : ''} onClick={() => setPeriodo(p)}>{l}</button>)}</div>
      </div>

      <div className="mc-card mc-hl">
        <div className="mc-mst">
          {ms('neg', 'Em negociação', totNeg, <><b style={{ color: 'var(--danger)' }}>{pct(totPar, totNeg)}</b> parado há +90 dias</>)}
          {ms('est', 'Em emissão', totEst, pl(D.emissao.length, 'contrato'))}
          {ms('fat', 'Aguardando faturamento', totFat, pl(D.faturamento.length, 'contrato'))}
          {ms('arec', 'A receber no período', totArec, `${pl(D.parcelas.length, 'parcela')} ${fimLbl}`)}
        </div>
      </div>

      <div className="mc-shr"><span className="mc-sh">De onde vem · {st[0]}</span><span className="mc-tag" style={{ ['--o' as string]: st[2] }}>{st[1]}</span>
        <button className={`mc-ib ${stg === 'hist' ? 'on' : ''}`} style={{ marginLeft: 'auto' }} onClick={() => setStg('hist')}>Histórico 12 meses</button></div>
      <div className="mc-r2">{rk('o')}{rk('p')}</div>

      <div className="mc-sh" style={{ marginTop: 28 }}>O que pode dar errado?</div>
      <div className="mc-rk">
        <button className="mc-card mc-rkc" style={{ ['--c' as string]: 'var(--danger)' }} onClick={() => setDr({ k: 'neg' })}>
          <span className="n" style={{ color: 'var(--danger)' }}>{fk(totPar)}</span><span className="p">parados há mais de 90 dias na negociação</span>
          <span className="o">{pl(parado.length, 'lead')} · {pct(totPar, totNeg)} de tudo que está em negociação · vale uma repescagem</span></button>
        <button className="mc-card mc-rkc" style={{ ['--c' as string]: fatOld.length ? 'var(--warning)' : 'var(--success)' }} onClick={() => setDr({ k: 'fat' })}>
          <span className="n" style={{ color: fatOld.length ? 'var(--warning)' : 'var(--success)' }}>{pl(fatOld.length, 'contrato')}</span><span className="p">esperando faturamento há mais de 15 dias</span>
          <span className="o">{fk(soma(fatOld))} em contratos</span></button>
        <button className="mc-card mc-rkc" style={{ ['--c' as string]: atras.length ? 'var(--danger)' : 'var(--success)' }} onClick={() => setDr({ k: 'arec' })}>
          <span className="n" style={{ color: atras.length ? 'var(--danger)' : 'var(--success)' }}>{brl(soma(atras))}</span><span className="p">em parcelas vencidas e não marcadas como pagas</span>
          <span className="o">{pl(atras.length, 'parcela')} atrasada{atras.length === 1 ? '' : 's'}</span></button>
      </div>

      {P && <>
        <div className="mc-ov" onClick={() => setDr(null)} />
        <aside className="mc-dw" role="dialog" aria-label={P[0]}>
          <div className="mc-dwh"><span className="mc-dot" style={{ background: P[1] }} /><h2>{P[0]}</h2><button className="x" onClick={() => setDr(null)} aria-label="Fechar">✕</button></div>
          <div className="mc-dwb">{P[2]}</div>
        </aside>
      </>}
    </div>
  )
}

function Estilo() {
  return <style>{`
.mc{--mc-pri:#2A8C7E;--mc-pri-bg:#E8F4F2;--mc-pri-line:#BFE0DA;--mc-pri-dk:#1E6B60;--mc-sunk:#F3F4F6;--mc-line2:#EEF0F3;max-width:1320px;margin:0 auto;padding:4px 0 48px;color:var(--text-1);font-size:13px}
html.dark .mc{--mc-pri:#35B09E;--mc-pri-bg:rgba(53,176,158,.14);--mc-pri-line:rgba(53,176,158,.38);--mc-pri-dk:#6FD6C5;--mc-sunk:rgba(255,255,255,.04);--mc-line2:rgba(255,255,255,.06)}
.mc button{font-family:inherit;color:inherit}
.mc-top{display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap}
.mc-top h1{font-size:22px;margin:0;font-weight:700;letter-spacing:-.01em}
.mc-lock{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;color:var(--text-2);background:var(--bg-card);border:1px solid var(--border);border-radius:20px;padding:4px 10px}
.mc-muted{color:var(--text-muted)}
.mc-dot{width:8px;height:8px;border-radius:50%;display:inline-block;flex:none}
.mc-seg{display:inline-flex;background:var(--bg-card);border:1px solid var(--border);border-radius:9px;padding:3px;gap:2px}
.mc-seg button{height:28px;padding:0 12px;border:0;background:none;border-radius:6px;font-size:12.5px;font-weight:500;color:var(--text-2);cursor:pointer}
.mc-seg button.on{background:var(--mc-pri-bg);color:var(--mc-pri-dk);font-weight:600}
.mc-card{background:var(--bg-card);border:1px solid var(--border);border-radius:12px;min-width:0}
.mc-ch{display:flex;align-items:center;gap:8px;padding:14px 16px 0;flex-wrap:wrap}
.mc-ch h3{margin:0;font-size:13.5px;font-weight:600}
.mc-ch .sub{font-size:12px;color:var(--text-muted)}
.mc-ch .tot{margin-left:auto;font-weight:700;font-size:15px;font-variant-numeric:tabular-nums}
.mc-hl{padding:18px 20px;margin-bottom:24px}
.mc-mst{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px}
.mc-ms{border:1px solid var(--border);background:var(--mc-sunk);border-radius:10px;padding:12px 14px;text-align:left;cursor:pointer;display:flex;flex-direction:column;gap:4px;transition:border-color .12s,transform .12s}
.mc-ms:hover{border-color:var(--mc-pri-line);transform:translateY(-1px)}
.mc-ms.sel{border-color:var(--mc-pri);background:var(--mc-pri-bg);box-shadow:0 0 0 1px var(--mc-pri)}
.mc-ms .l{font-size:12px;font-weight:600;color:var(--text-2);display:flex;gap:6px;align-items:center}
.mc-ms .v{font-size:20px;font-weight:700;font-variant-numeric:tabular-nums}
.mc-ms .s{font-size:11.5px;color:var(--text-muted)}
.mc-tag{font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:10px;color:var(--mc-pri-dk);background:color-mix(in srgb,var(--mc-pri) calc(var(--o)*28%),transparent);border:1px solid color-mix(in srgb,var(--mc-pri) calc(var(--o)*60%),transparent);white-space:nowrap}
.mc-shr{display:flex;align-items:center;gap:10px;margin:0 2px 10px;flex-wrap:wrap}
.mc-sh{font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--text-muted);margin:0 2px 10px;display:block}
.mc-shr .mc-sh{margin:0}
.mc-ib{height:32px;padding:0 12px;border:1px solid var(--border);background:var(--bg-card);border-radius:9px;cursor:pointer;font-size:12.5px}
.mc-ib.on{border-color:var(--mc-pri);color:var(--mc-pri-dk);background:var(--mc-pri-bg)}
.mc-r2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.mc-rk{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
@media (max-width:900px){.mc-r2,.mc-rk{grid-template-columns:1fr}}
.mc-rkl{display:flex;flex-direction:column;gap:2px;padding:10px 10px 4px}
.mc-rkr{display:grid;grid-template-columns:minmax(80px,140px) 1fr 40px 80px 70px;gap:12px;align-items:center;font-size:13px;padding:7px 6px;border-radius:7px;border:0;background:none;cursor:pointer;text-align:left;width:100%}
.mc-rkr:hover{background:var(--bg-hover)}
.mc-rkr .nm{font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mc-rkr .bar{height:12px;background:var(--mc-sunk);border-radius:6px;overflow:hidden}
.mc-rkr .bar i{display:block;height:100%;border-radius:6px;background:var(--mc-pri)}
.mc-rkr b,.mc-rkr .r{text-align:right;font-variant-numeric:tabular-nums}
.mc-rkr .r{color:var(--text-2);font-size:12.5px}
.mc-rkr .vd{font-size:11.5px;font-weight:600;color:var(--mc-pri-dk);opacity:.55;text-align:right}
.mc-rkr:hover .vd{opacity:1}
@media (max-width:560px){.mc-rkr{grid-template-columns:90px 1fr 40px 74px}.mc-rkr .vd{display:none}}
.mc-note{font-size:12px;color:var(--text-2);background:var(--mc-sunk);border:1px dashed var(--border);border-radius:10px;padding:10px 12px;margin:10px 16px 16px}
.mc-note.warn{border-style:solid;border-color:var(--warning);color:var(--warning);margin:0}
.mc-dw .mc-note{margin:0}
.mc-empty{font-size:13px;color:var(--text-2);background:var(--mc-sunk);border:1px dashed var(--border);border-radius:10px;padding:24px 18px;text-align:center;line-height:1.6;margin:12px 16px 16px}
.mc-dw .mc-empty{margin:0}
.mc-rkc{border-left:4px solid var(--c);text-align:left;cursor:pointer;padding:16px 18px;display:flex;flex-direction:column;gap:5px;transition:transform .12s}
.mc-rkc:hover{transform:translateY(-2px)}
.mc-rkc .n{font-size:24px;font-weight:700;font-variant-numeric:tabular-nums}
.mc-rkc .p{font-size:13.5px;font-weight:500}
.mc-rkc .o{font-size:11.5px;color:var(--text-muted)}
.mc-ov{position:fixed;inset:0;background:rgba(10,12,16,.35);z-index:60;animation:mcf .15s}
.mc-dw{position:fixed;top:0;right:0;bottom:0;width:min(520px,100vw);background:var(--bg-card);border-left:1px solid var(--border);z-index:61;display:flex;flex-direction:column;animation:mcs .2s ease-out}
.mc-dwh{display:flex;align-items:center;gap:10px;padding:16px 18px;border-bottom:1px solid var(--border)}
.mc-dwh h2{margin:0;font-size:16px;font-weight:700}
.mc-dwh .x{margin-left:auto;width:32px;height:32px;border:1px solid var(--border);background:var(--bg-card);border-radius:8px;cursor:pointer}
.mc-dwb{overflow-y:auto;min-height:0;padding:16px 18px 24px;display:flex;flex-direction:column;gap:18px}
.mc-dsec h4{margin:0 0 8px;font-size:11.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);font-weight:600}
.mc-dsec h4 span{text-transform:none;letter-spacing:0;font-weight:500;margin-left:6px}
.mc-big{font-size:30px;font-weight:700;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.mc-dwk{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px}
.mc-dwk>div{background:var(--mc-sunk);border-radius:10px;padding:12px 14px;display:flex;flex-direction:column;gap:3px}
.mc-dwk b{font-size:19px;font-variant-numeric:tabular-nums}
.mc-dwk span{font-size:11.5px;color:var(--text-muted)}
.mc-back{align-self:flex-start;height:32px;padding:0 12px;border:1px solid var(--border);background:var(--bg-card);border-radius:9px;cursor:pointer;font-size:12.5px}
.mc-back:hover{background:var(--bg-hover)}
.mc-dtl{width:100%;border:1px dashed var(--border);background:none;border-radius:10px;padding:13px;font-size:13px;font-weight:600;color:var(--text-2);cursor:pointer}
.mc-dtl:hover{background:var(--bg-hover)}
.mc-lst{display:flex;flex-direction:column}
.mc-li{display:grid;grid-template-columns:1fr auto;gap:4px 12px;padding:10px 8px;border:0;border-top:1px solid var(--mc-line2);background:none;width:100%;text-align:left;cursor:pointer;font-size:12.5px}
.mc-li:first-child{border-top:0}
.mc-li:hover{background:var(--bg-hover)}
.mc-li .t{font-weight:500;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mc-li .t small{color:var(--text-muted);font-weight:400;font-size:11.5px}
.mc-li b{font-variant-numeric:tabular-nums}
.mc-li .m{grid-column:1/-1;color:var(--text-muted);font-size:11.5px;display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.mc-lad{display:flex;flex-direction:column;gap:6px}
.mc-ladr{display:grid;grid-template-columns:86px 1fr auto;gap:10px;align-items:center;padding:8px 10px;border:1px solid var(--mc-line2);border-radius:9px;font-size:13px}
.mc-ladr small{display:block;font-size:11px;color:var(--text-muted)}
.mc-ladr .mc-tag{justify-self:start}
.mc-ladr b{font-size:14px;font-variant-numeric:tabular-nums}
.mc-cbar{display:flex;gap:2px;height:8px;border-radius:4px;overflow:hidden;margin:2px 0 8px}
.mc-cbar i{display:block;min-width:3px}
.mc-crow{display:grid;grid-template-columns:10px minmax(0,1fr) auto 40px 80px;gap:10px;align-items:center;padding:8px 2px;font-size:12.5px;border-top:1px solid var(--mc-line2)}
.mc-cbar+.mc-crow{border-top:0}
.mc-crow .nm{font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mc-crow .n{color:var(--text-muted);font-size:11.5px}
.mc-crow .p{color:var(--text-muted);text-align:right;font-size:12px}
.mc-crow b{text-align:right;font-weight:600;font-variant-numeric:tabular-nums}
.mc-scroll{overflow-x:auto}
.mc-tb{width:100%;border-collapse:collapse;font-size:12.5px}
.mc-tb th{font-size:11px;color:var(--text-muted);font-weight:600;text-align:right;padding:6px 4px;border-bottom:1px solid var(--border)}
.mc-tb td{text-align:right;padding:8px 4px;border-bottom:1px solid var(--mc-line2);font-variant-numeric:tabular-nums}
.mc-tb th:first-child,.mc-tb td:first-child{text-align:left}
.mc-tb tbody tr:hover td{background:var(--bg-hover)}
@keyframes mcs{from{transform:translateX(30px);opacity:.5}to{transform:none;opacity:1}}
@keyframes mcf{from{opacity:0}}
@media (prefers-reduced-motion:reduce){.mc-dw,.mc-ov{animation:none}}
`}</style>
}
