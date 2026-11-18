import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { X, Search, ChevronDown } from 'lucide-react'
import api from '../api'
import { statusLabel } from '../utils/statusLabel'
import { parseUTC, calendarDaysAgo } from '../utils/date'
import { reportStatusColor, reportPerceptionColor } from '../utils/reportColors'
import LeadPeekDrawer from '../components/LeadPeekDrawer'
import FluxoAnalitico from '../components/FluxoAnalitico'
import '../styles/leads-report-theme.css'
import '../styles/fluxo-vendas.css'

// Fluxo de vendas: tela de reunião por operador (mockup "Fluxo de Vendas Pamela", opção B).
// Mês = captação do lead. Pago = "Data da venda" preenchida ou status de venda.
// Em esteira = status Emissão. Funil = só leads antes da emissão (temperatura só vale ali).

type Grupo = 'esteira' | 'pago' | 'cancelado' | 'aberto'
interface Soma { valor: number; qtd: number }
interface Resumo {
  fluxo: Record<'esteira' | 'pago' | 'cancelado', Soma>
  funil: Record<'Quente' | 'Morno' | 'Frio', Soma>
  sem_temperatura: number
  captacoes: number
  motivos: Record<string, number>
}
interface FluxoLead {
  id: string; name: string; email: string | null; phone: string | null; attendant: string | null
  origem: string | null; conversion_point: string | null; status: string | null; perception: string | null
  value_potential: number | null; operadoras_enviadas: string | null; modalidade: string | null
  created_at: string | null; updated_at: string | null; retrabalhado_em: string | null
  is_renutrucao: boolean; vidas: number | null
  duplicado_de_id: string | null; duplicado_de_nome: string | null; campanha_canal: string | null
  grupo: Grupo
  lost_reason: string | null
  dias_sem_contato: number | null; dias_no_status: number | null; tem_retorno: boolean
}
interface Meta {
  tipo: string; meta_valor: number; progresso: number; progresso_anterior: number; projecao: number
  faltam: number; dias_uteis_restantes: number; ritmo_necessario: number
}
interface FluxoData {
  operador: string; mes: string; mes_anterior: string; encerrado: boolean; dia: number; dias_mes: number
  atual: Resumo; anterior: Resumo; meta: Meta | null; leads: FluxoLead[]
}

type CardId = 'esteira' | 'pago' | 'cancelado' | 'Quente' | 'Morno' | 'Frio'
interface CardDef { id: CardId; label: string; pill: string; color: string; bom: 'up' | 'down' | null }
const FLUXO: CardDef[] = [
  { id: 'esteira', label: 'Em esteira', pill: 'em emissão', color: 'var(--lr-st-emissao)', bom: 'up' },
  { id: 'pago', label: 'Pagos', pill: 'concluído', color: 'var(--lr-st-fechado)', bom: 'up' },
  { id: 'cancelado', label: 'Cancelados', pill: 'perdido', color: 'var(--lr-st-perdido)', bom: 'down' },
]
const FUNIL: CardDef[] = [
  { id: 'Quente', label: 'Quente', pill: 'fechamento próximo', color: 'var(--lr-quente)', bom: 'up' },
  { id: 'Morno', label: 'Morno', pill: 'em nutrição', color: 'var(--lr-morno)', bom: null },
  { id: 'Frio', label: 'Frio', pill: 'baixa prioridade', color: 'var(--lr-frio)', bom: null },
]

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const mesNome = (ym: string) => `${MESES[+ym.slice(5, 7) - 1]}/${ym.slice(0, 4)}`
const mesCurto = (ym: string) => MESES[+ym.slice(5, 7) - 1]
function ultimosMeses(n: number): string[] {
  const d = new Date(); const out: string[] = []
  for (let i = 0; i < n; i++) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1)
    out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`)
  }
  return out
}

const brl2 = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const brl0 = (n: number) => 'R$ ' + brl2(n)
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)
const leadsTxt = (q: number) => (q === 1 ? 'lead' : 'leads')

function fmtDate(iso: string) { return new Date(parseUTC(iso)).toLocaleDateString('pt-BR') }
function fmtAgo(iso: string | null): string {
  if (!iso) return '—'
  const days = calendarDaysAgo(parseUTC(iso))
  if (days <= 0) return 'hoje'
  if (days === 1) return 'ontem'
  if (days < 30) return `há ${days} dias`
  const m = Math.floor(days / 30)
  if (m < 12) return `há ${m} ${m === 1 ? 'mês' : 'meses'}`
  const y = Math.floor(m / 12)
  return `há ${y} ${y === 1 ? 'ano' : 'anos'}`
}
function initials(name: string) {
  const p = name.trim().split(/\s+/)
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase()
}

function Delta({ cur, prev, bom, mesAnt, dinheiro = true }: { cur: number; prev: number; bom: 'up' | 'down' | null; mesAnt: string; dinheiro?: boolean }) {
  const d = cur - prev
  if (d === 0) return <span className="fv-delta fv-flat">= {mesCurto(mesAnt)}</span>
  const cls = bom === null ? 'fv-flat' : (d > 0) === (bom === 'up') ? 'fv-good' : 'fv-bad'
  const v = dinheiro ? brl0(Math.abs(d)) : Math.abs(d).toLocaleString('pt-BR')
  return <span className={`fv-delta ${cls}`}>{d > 0 ? '▲' : '▼'} {v} vs {mesCurto(mesAnt)}</span>
}

// mesma cápsula tonal do Relatório de Leads
function TonalPill({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
      fontSize: 11.5, fontWeight: 600, padding: '3px 9px', borderRadius: 20,
      background: `color-mix(in srgb, ${color} 10%, transparent)`, color,
      border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', flexShrink: 0 }} />
      {children}
    </span>
  )
}

export default function FluxoVendas() {
  const navigate = useNavigate()
  const [sp] = useSearchParams()
  const [me, setMe] = useState<string>('')
  const [role, setRole] = useState<string>('')
  const [agentes, setAgentes] = useState<string[]>([])
  const [data, setData] = useState<FluxoData | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [aberto, setAberto] = useState<CardDef | null>(null)

  // Analítico: só os perfis de can_see_financials (o backend também bloqueia)
  const fin = ['admin', 'diretor', 'financeiro', 'coordenador'].includes(role)
  const ana = fin && sp.get('vista') === 'analitico'
  // no Analítico: "Toda a equipe" (op=*), "Todo o período" (mes=todos) e 12 meses
  const meses = useMemo(() => ultimosMeses(ana ? 12 : 3), [ana])
  const opUrl = sp.get('op') || me
  const op = !ana && opUrl === '*' ? me : opUrl
  const mesUrl = sp.get('mes') || ''
  const mes = (ana && mesUrl === 'todos') || meses.includes(mesUrl) ? mesUrl : meses[0]

  useEffect(() => {
    api.get<{ first_name: string | null; username: string; role: string }>('/api/v1/auth/me')
      .then(r => { setMe(r.data.first_name || r.data.username); setRole(r.data.role) }).catch(() => {})
    // só admin/diretor/supervisor recebem a lista (403 pros demais: o seletor some)
    api.get<{ nome: string }[]>('/api/v1/gestao-comercial/vida-sdr/agentes')
      .then(r => setAgentes(r.data.map(a => a.nome))).catch(() => setAgentes([]))
  }, [])

  const carregar = useCallback((silencioso = false) => {
    if (!op || ana) return
    if (!silencioso) setLoading(true)
    setErro('')
    api.get<FluxoData>('/api/v1/gestao-comercial/fluxo-vendas', { params: { origens: op, month: mes } })
      .then(r => setData(r.data))
      .catch(() => setErro('Não foi possível carregar o fluxo de vendas. Tente de novo em instantes.'))
      .finally(() => setLoading(false))
  }, [op, mes, ana])
  useEffect(() => { carregar() }, [carregar])

  function trocar(campo: 'op' | 'mes' | 'vista', valor: string) {
    const p = new URLSearchParams(sp)
    p.set(campo, valor)
    if (campo === 'op') p.set('mes', mes)
    if (campo === 'vista' && valor !== 'analitico') {
      // fora do Analítico, "Toda a equipe"/"Todo o período" voltam pro padrão
      if (p.get('op') === '*') p.delete('op')
      if (p.get('mes') === 'todos') p.delete('mes')
    }
    navigate(`/fluxo-vendas?${p.toString()}`, { replace: true })
  }

  const nomeOp = op === '*' ? 'Toda a equipe' : (!ana && data?.operador) || op
  const opcoesOp = ana && !agentes.includes(op) && op && op !== '*' ? [op, ...agentes] : agentes

  return (
    <div className="fv lr-theme">
      <div className="fv-wrap">
        <header className="fv-head">
          <div>
            <div className="fv-eyebrow">Reunião de resultados</div>
            <h1 className="fv-h1">Fluxo de vendas {nomeOp && <span>· {nomeOp}</span>}</h1>
          </div>
          <div className="fv-picks">
            {(agentes.length > 0 || ana) && (
              <div className="fv-pick">
                <label htmlFor="fv-op">Operador</label>
                <select id="fv-op" value={op === '*' || opcoesOp.includes(op) ? op : ''} onChange={e => e.target.value && trocar('op', e.target.value)}>
                  {op !== '*' && !opcoesOp.includes(op) && <option value="">{op || 'Escolha'}</option>}
                  {ana && <option value="*">Toda a equipe</option>}
                  {opcoesOp.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
            )}
            <div className="fv-pick">
              <label htmlFor="fv-mes">Mês de referência</label>
              <select id="fv-mes" value={mes} onChange={e => trocar('mes', e.target.value)}>
                {ana && <option value="todos">Todo o período</option>}
                {meses.map(m => <option key={m} value={m}>{mesNome(m)}</option>)}
              </select>
            </div>
          </div>
        </header>

        {fin && (
          <div className="fv-vistas" role="group" aria-label="Visão">
            <button aria-pressed={!ana} onClick={() => trocar('vista', 'resumo')}>Resumo</button>
            <button aria-pressed={ana} onClick={() => trocar('vista', 'analitico')}>🔒 Analítico</button>
          </div>
        )}

        {ana ? (op ? <FluxoAnalitico op={op} mes={mes} /> : <div className="fv-empty">Carregando…</div>)
          : erro ? <div className="fv-empty">{erro}</div>
          : loading || !data ? <div className="fv-empty">Carregando…</div>
          : <>
              <Corpo data={data} onAbrir={setAberto} />
              <Secao id="perdas" titulo="Por que perdemos" resumo={resumoPerdas(data.atual)}><Perdas data={data} /></Secao>
              <Secao id="pauta" titulo="Pauta da reunião" resumo={resumoPauta(pauta(data.leads))}><Pauta data={data} onStatusChanged={() => carregar(true)} /></Secao>
            </>}
      </div>

      {aberto && data && (
        <LeadsModal
          card={aberto}
          data={data}
          onClose={() => setAberto(null)}
          onStatusChanged={() => carregar(true)}
        />
      )}
    </div>
  )
}

function Corpo({ data, onAbrir }: { data: FluxoData; onAbrir: (c: CardDef) => void }) {
  const { atual, anterior, meta, encerrado } = data
  const emReais = meta?.tipo === 'clt'
  const fmtMeta = (n: number) => (emReais ? brl0(n) : `${Math.round(n).toLocaleString('pt-BR')} captações`)
  const R = 96, C = 2 * Math.PI * R
  const off = (v: number) => (meta && meta.meta_valor > 0 ? C * (1 - Math.min(1, v / meta.meta_valor)) : C)
  // anima o anel e as barras a partir do zero ao trocar de operador/mês
  const [pronto, setPronto] = useState(false)
  useEffect(() => { setPronto(false); const id = requestAnimationFrame(() => requestAnimationFrame(() => setPronto(true))); return () => cancelAnimationFrame(id) }, [data])

  const cards = (defs: CardDef[], somas: Record<string, Soma>, prev: Record<string, Soma>) => {
    const total = defs.reduce((s, d) => s + somas[d.id].valor, 0)
    return defs.map(d => {
      const x = somas[d.id], p = pct(x.valor, total)
      return (
        <button key={d.id} className="fv-card" style={{ '--c': d.color } as React.CSSProperties} onClick={() => onAbrir(d)}>
          <div className="fv-top">
            <span className="fv-lbl"><span className="fv-dot" />{d.label}</span>
            <span className="fv-pill">{d.pill}</span>
          </div>
          <div className="fv-val"><small>R$</small>{brl2(x.valor)}</div>
          <div className="fv-bar"><i style={{ width: pronto ? `${p}%` : 0 }} /></div>
          <div className="fv-meta"><span><b>{x.qtd}</b> {leadsTxt(x.qtd)}</span><span className="fv-share">{p}% do valor</span></div>
          <div className="fv-cmp"><Delta cur={x.valor} prev={prev[d.id].valor} bom={d.bom} mesAnt={data.mes_anterior} /><span className="fv-ver">ver leads →</span></div>
        </button>
      )
    })
  }

  return (
    <>
      <div className="fv-lay">
        <aside className="fv-goal">
          <h3>Meta de {mesCurto(data.mes)} <span className="fv-tag">{encerrado ? 'mês fechado' : `dia ${data.dia} de ${data.dias_mes}`}</span></h3>
          {!meta ? (
            <div className="fv-note">Sem meta cadastrada para {data.operador} neste mês. Cadastre em Financeiro → Metas.</div>
          ) : (
            <>
              <div className="fv-ring">
                <svg viewBox="0 0 220 220" aria-hidden="true">
                  <circle className="bg" cx="110" cy="110" r={R} />
                  <circle className="proj" cx="110" cy="110" r={R} strokeDasharray={C} strokeDashoffset={pronto ? off(meta.projecao) : C} />
                  <circle className="real" cx="110" cy="110" r={R} strokeDasharray={C} strokeDashoffset={pronto ? off(meta.progresso) : C} />
                </svg>
                <div className="in">
                  <b>{pct(encerrado ? meta.progresso : meta.projecao, meta.meta_valor)}%</b>
                  <small>{encerrado ? 'da meta realizado' : 'projetado da meta'}</small>
                </div>
              </div>
              <dl>
                <div><dt>Meta do mês</dt><dd>{fmtMeta(meta.meta_valor)}</dd></div>
                <div><dt><span className="fv-dot" style={{ '--c': 'var(--success)' } as React.CSSProperties} />Realizado</dt><dd>{fmtMeta(meta.progresso)} · {pct(meta.progresso, meta.meta_valor)}%</dd></div>
                {!encerrado && <div title={emReais ? 'Realizado + o que está em emissão' : 'Realizado no ritmo dos dias úteis do mês'}><dt><span className="fv-dot" style={{ '--c': 'color-mix(in srgb, var(--success) 35%, transparent)' } as React.CSSProperties} />Projeção</dt><dd style={{ color: 'var(--success)' }}>{fmtMeta(meta.projecao)}</dd></div>}
                <div><dt>vs {mesCurto(data.mes_anterior)}</dt><dd><Delta cur={meta.progresso} prev={meta.progresso_anterior} bom="up" mesAnt={data.mes_anterior} dinheiro={emReais} /></dd></div>
                <div><dt>{meta.faltam > 0 ? 'Falta' : 'Acima da meta'}</dt><dd>{fmtMeta(meta.faltam > 0 ? meta.faltam : meta.progresso - meta.meta_valor)}</dd></div>
              </dl>
              <div className="fv-note">
                {encerrado
                  ? `Mês fechado em ${pct(meta.progresso, meta.meta_valor)}% da meta.`
                  : meta.faltam <= 0 ? 'Meta batida.'
                  : meta.dias_uteis_restantes > 0 ? <>Para bater a meta: <b>{fmtMeta(meta.ritmo_necessario)}</b> por dia útil ({meta.dias_uteis_restantes} restantes).</>
                  : 'Último dia útil do mês.'}
                {!emReais && <><br />Meta em captações: o realizado conta leads captados no mês.</>}
              </div>
            </>
          )}
        </aside>

        <div className="fv-col">
          <section className="fv-sec">
            <h2>Fluxo de vendas</h2>
            <div className="fv-grid">{cards(FLUXO, atual.fluxo, anterior.fluxo)}</div>
          </section>
          <section className="fv-sec">
            <h2>Funil de vendas</h2>
            <div className="fv-grid">{cards(FUNIL, atual.funil, anterior.funil)}</div>
          </section>
        </div>
      </div>
    </>
  )
}

// ---- seções recolhíveis (fechadas por padrão; lembram se foram abertas ao trocar mês/operador) ----
const SECAO_ABERTA: Record<string, boolean> = {}
function Secao({ id, titulo, resumo, children }: { id: string; titulo: string; resumo: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(!!SECAO_ABERTA[id])
  return (
    <details className="fv-acc" open={open} onToggle={e => { const o = (e.target as HTMLDetailsElement).open; SECAO_ABERTA[id] = o; setOpen(o) }}>
      <summary><span className="at">{titulo}</span><span className="ar">{resumo}</span><ChevronDown size={15} className="chev" /></summary>
      {open && <div className="ab">{children}</div>}
    </details>
  )
}

// ---- Por que perdemos: motivos de perda dos Cancelados do mês vs mês anterior ----
const DICA_PERDA: Record<string, string> = {
  'Preço': 'revisar a argumentação de valor ou oferecer outra operadora/coparticipação.',
  'Cliente não retornou contato': 'revisar a cadência: tentar mais vezes e por outro canal antes de desistir.',
  'Sem retorno': 'revisar a cadência: tentar mais vezes e por outro canal antes de desistir.',
  'Sem interesse': 'qualificar melhor no primeiro contato, antes de cotar.',
  'Declinou': 'entender com a operadora o motivo do declínio (documentação, perfil).',
  'Sem perfil': 'filtrar melhor na entrada: o lead não tinha o perfil do plano.',
  'Localização': 'checar a rede da operadora na cidade antes de cotar.',
  'Trocou de número': 'confirmar telefone e e-mail logo no primeiro contato.',
}
function resumoPerdas(r: Resumo) {
  const tot = Object.values(r.motivos).reduce((s, n) => s + n, 0)
  if (!tot) return 'nenhum cancelado no mês'
  const top = Object.entries(r.motivos).sort((a, b) => b[1] - a[1])[0][0]
  return `${tot} ${tot === 1 ? 'cancelado' : 'cancelados'} · ${top} lidera`
}
function Perdas({ data }: { data: FluxoData }) {
  const cur = data.atual.motivos, prev = data.anterior.motivos
  const tot = Object.values(cur).reduce((s, n) => s + n, 0)
  if (!tot) return <div className="fv-pempty">Nenhum cancelado neste mês.</div>
  const max = Math.max(...Object.values(cur))
  const lista = Array.from(new Set([...Object.keys(cur), ...Object.keys(prev)])).sort((a, b) => (cur[b] || 0) - (cur[a] || 0))
  const top = lista[0]
  return (
    <div className="fv-mot">
      {lista.map(k => {
        const n = cur[k] || 0, d = n - (prev[k] || 0)
        return (
          <div key={k} className="fv-motr">
            <span className="nm" title={k}>{k}</span>
            <span className="tr"><i style={{ width: `${max ? (n / max) * 100 : 0}%` }} /></span>
            <span className="q"><b>{n}</b> {d === 0 ? <span className="fv-delta fv-flat">=</span> : <span className={`fv-delta ${d > 0 ? 'fv-bad' : 'fv-good'}`}>{d > 0 ? '▲' : '▼'}{Math.abs(d)}</span>}</span>
          </div>
        )
      })}
      <div className="fv-verdict">
        <b>{top} lidera</b> ({cur[top]} de {tot}){DICA_PERDA[top] ? `: ${DICA_PERDA[top]}` : '.'} <span style={{ color: 'var(--text-subtle)' }}>Setas = vs {mesCurto(data.mes_anterior)}.</span>
      </div>
    </div>
  )
}

// ---- Pauta da reunião: o que pede ação agora (mesmas regras do painel do lead) ----
const PROPOSTA = ['proposta', 'proposal_sent', 'proposal sent']
interface GrupoPauta { id: string; titulo: string; desc: string; color: string; leads: FluxoLead[]; motivo: (l: FluxoLead) => string }
function pauta(leads: FluxoLead[]): GrupoPauta[] {
  const g: GrupoPauta[] = [
    { id: 'quente', titulo: 'Quentes sem contato', desc: 'mais de 5 dias sem falar com o cliente', color: 'var(--lr-quente)',
      leads: leads.filter(l => l.grupo === 'aberto' && l.perception === 'Quente' && (l.dias_sem_contato ?? 0) > 5),
      motivo: l => `sem contato há ${l.dias_sem_contato} dias` },
    { id: 'proposta', titulo: 'Propostas sem retorno agendado', desc: 'proposta enviada e nenhum retorno marcado', color: 'var(--lr-st-proposta)',
      leads: leads.filter(l => l.grupo === 'aberto' && PROPOSTA.includes((l.status || '').toLowerCase()) && !l.tem_retorno),
      motivo: l => l.dias_no_status != null ? `enviada há ${l.dias_no_status} ${l.dias_no_status === 1 ? 'dia' : 'dias'}` : 'sem retorno marcado' },
    { id: 'emissao', titulo: 'Parados em emissão', desc: 'mais de 3 dias esperando a operadora', color: 'var(--lr-st-emissao)',
      leads: leads.filter(l => l.grupo === 'esteira' && (l.dias_no_status ?? 0) > 3),
      motivo: l => `parado há ${l.dias_no_status} dias` },
  ]
  return g.map(x => ({ ...x, leads: [...x.leads].sort((a, b) => (b.value_potential || 0) - (a.value_potential || 0)) }))
}
function resumoPauta(gs: GrupoPauta[]) {
  const n = gs.reduce((s, g) => s + g.leads.length, 0)
  const v = gs.reduce((s, g) => s + g.leads.reduce((a, l) => a + (l.value_potential || 0), 0), 0)
  return n ? `${n} ${leadsTxt(n)} ${n === 1 ? 'pede' : 'pedem'} ação · ${brl0(v)} em jogo` : 'nada pendente'
}
function Pauta({ data, onStatusChanged }: { data: FluxoData; onStatusChanged: () => void }) {
  const gs = pauta(data.leads)
  const [mostrarTudo, setMostrarTudo] = useState<Record<string, boolean>>({})
  const [peek, setPeek] = useState<{ g: number; id: string } | null>(null)
  const lista = peek ? gs[peek.g].leads : []
  const idx = peek ? lista.findIndex(l => l.id === peek.id) : -1
  const lead = idx >= 0 ? lista[idx] : null
  return (
    <div className="fv-pauta">
      {gs.map((g, gi) => {
        const vis = mostrarTudo[g.id] ? g.leads : g.leads.slice(0, 5)
        const tot = g.leads.reduce((s, l) => s + (l.value_potential || 0), 0)
        return (
          <div key={g.id} className="fv-pcol" style={{ '--c': g.color } as React.CSSProperties}>
            <div className="ph"><b>{g.titulo}</b><span className="n">{g.leads.length}</span></div>
            <p className="pd">{g.desc}</p>
            {vis.length === 0 && <div className="fv-pempty">Nenhum lead nesta situação.</div>}
            {vis.map(l => (
              <button key={l.id} className="prow" onClick={() => setPeek({ g: gi, id: l.id })}>
                <span className="pn">{l.name}</span><span className="pv">{l.value_potential ? brl0(l.value_potential) : '—'}</span>
                <span className="pw">{g.motivo(l)}</span><span className="ps">{statusLabel(l.status)}</span>
              </button>
            ))}
            {g.leads.length > 5 && (
              <button className="pmore" onClick={() => setMostrarTudo(m => ({ ...m, [g.id]: !m[g.id] }))}>
                {mostrarTudo[g.id] ? 'mostrar menos' : `+ ${g.leads.length - 5} ${leadsTxt(g.leads.length - 5)}`}
              </button>
            )}
            {g.leads.length > 0 && <div className="ptotal"><b>{brl0(tot)}</b> em jogo</div>}
          </div>
        )
      })}
      {lead && peek && (
        <LeadPeekDrawer
          key="peek"
          lead={lead}
          onClose={() => setPeek(null)}
          onOpenFull={() => window.open(`/leads/${lead.id}`, '_blank')}
          position={{ index: idx + 1, total: lista.length }}
          onPrev={idx > 0 ? () => setPeek({ g: peek.g, id: lista[idx - 1].id }) : undefined}
          onNext={idx < lista.length - 1 ? () => setPeek({ g: peek.g, id: lista[idx + 1].id }) : undefined}
          onStatusChanged={() => onStatusChanged()}
        />
      )}
    </div>
  )
}

const COLUMNS: { key: keyof FluxoLead; label: string }[] = [
  { key: 'name', label: 'Cliente' },
  { key: 'attendant', label: 'Atendente' },
  { key: 'origem', label: 'Origem' },
  { key: 'value_potential', label: 'Cotação' },
  { key: 'operadoras_enviadas', label: 'Operadora' },
  { key: 'perception', label: 'Temperatura' },
  { key: 'status', label: 'Status' },
  { key: 'created_at', label: 'Entrada' },
  { key: 'updated_at', label: 'Atualização' },
]

function LeadsModal({ card, data, onClose, onStatusChanged }: { card: CardDef; data: FluxoData; onClose: () => void; onStatusChanged: () => void }) {
  const [busca, setBusca] = useState('')
  const [buscaDeb, setBuscaDeb] = useState('')
  const [sortCol, setSortCol] = useState<keyof FluxoLead>('value_potential')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [peek, setPeek] = useState<FluxoLead | null>(null)
  const [statusLocal, setStatusLocal] = useState<Record<string, string>>({})

  useEffect(() => { const t = setTimeout(() => setBuscaDeb(busca), 250); return () => clearTimeout(t) }, [busca])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !peek) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [peek, onClose])

  const doCard = (l: FluxoLead) => (card.id === 'esteira' || card.id === 'pago' || card.id === 'cancelado')
    ? l.grupo === card.id
    : l.grupo === 'aberto' && l.perception === card.id
  // a lista é a "foto" de quando o card foi aberto: o lead não some ao trocar o status pelo painel
  const [ids] = useState(() => new Set(data.leads.filter(doCard).map(l => l.id)))
  const base = data.leads.filter(l => ids.has(l.id)).map(l => (statusLocal[l.id] ? { ...l, status: statusLocal[l.id] } : l))
  const soma = data.leads.filter(doCard)
  const total = soma.reduce((s, l) => s + (l.value_potential || 0), 0)

  const q = buscaDeb.trim().toLowerCase(), qd = q.replace(/\D/g, '')
  const linhas = base
    .filter(l => !q || l.name.toLowerCase().includes(q) || (qd.length > 0 && (l.phone || '').replace(/\D/g, '').includes(qd)) || (l.email || '').toLowerCase().includes(q))
    .sort((a, b) => {
      const va = a[sortCol] ?? '', vb = b[sortCol] ?? ''
      const r = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'pt-BR')
      return sortDir === 'asc' ? r : -r
    })
  function ordenar(k: keyof FluxoLead) {
    if (sortCol === k) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortCol(k); setSortDir(k === 'name' || k === 'attendant' || k === 'origem' ? 'asc' : 'desc') }
  }
  const idx = peek ? linhas.findIndex(l => l.id === peek.id) : -1

  return (
    <div className="fv-scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="fv-box" role="dialog" aria-modal="true" aria-labelledby="fv-mt">
        <div className="fv-bh">
          <div>
            <h2 id="fv-mt"><span className="fv-dot" style={{ '--c': card.color } as React.CSSProperties} />{card.label} · {data.operador}</h2>
            <p>{soma.length} {leadsTxt(soma.length)} · {brl0(total)} · captados em {mesNome(data.mes)}</p>
          </div>
          <button className="fv-x" onClick={onClose} aria-label="Fechar"><X size={16} /></button>
        </div>
        <label className="fv-search"><Search size={15} /><input autoFocus value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome, telefone ou e-mail" aria-label="Buscar lead" /></label>
        <div className="fv-tbl">
          <table>
            <thead>
              <tr>{COLUMNS.map(c => (
                <th key={c.key} onClick={() => ordenar(c.key)}>
                  {c.label}{sortCol === c.key && <span style={{ marginLeft: 4, opacity: 0.7 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
                </th>
              ))}</tr>
            </thead>
            <tbody>
              {linhas.length === 0 ? (
                <tr><td colSpan={COLUMNS.length} style={{ padding: '40px 22px', textAlign: 'center', color: 'var(--text-subtle)', cursor: 'default' }}>Nenhum lead encontrado.</td></tr>
              ) : linhas.map(l => {
                const ops = (l.operadoras_enviadas || '').split(',').map(s => s.trim()).filter(Boolean)
                const pc = reportPerceptionColor(l.perception)
                return (
                  <tr key={l.id} onClick={() => setPeek(l)} className={peek?.id === l.id ? 'cur' : undefined}>
                    <td style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-2)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', background: '#94A3B8' }}>{initials(l.name)}</span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{l.name}</span>
                            {l.duplicado_de_id && <span title={`Possível duplicado: os dados já estão no lead ${l.duplicado_de_nome ?? '(outro lead)'}`} style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--warning)', background: 'var(--warning-weak)', borderRadius: 5, padding: '2px 6px', whiteSpace: 'nowrap' }}>Duplicado</span>}
                            {l.is_renutrucao && <span title={l.retrabalhado_em ? `Reativado em ${fmtDate(l.retrabalhado_em)}` : undefined} style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--accent-strong)', background: 'var(--accent-weak)', borderRadius: 5, padding: '2px 6px', whiteSpace: 'nowrap' }}>Renutrição</span>}
                          </div>
                          {(l.phone || l.email) && <div style={{ fontSize: 12, color: 'var(--text-subtle)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200 }}>{l.phone || l.email}</div>}
                        </div>
                      </div>
                    </td>
                    <td style={{ fontSize: 13, color: 'var(--text-3b)' }}>{l.attendant ?? '—'}</td>
                    <td style={{ maxWidth: 128 }} title={[l.origem, l.conversion_point].filter(Boolean).join(' · ') || undefined}>
                      <div style={{ fontSize: 13, color: 'var(--text-3b)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.origem || '—'}</div>
                      {l.conversion_point && <div style={{ fontSize: 11.5, color: 'var(--text-subtle)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.conversion_point}</div>}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: l.value_potential ? 'var(--text-1)' : 'var(--text-subtle)' }}>{l.value_potential ? brl0(l.value_potential) : '—'}</div>
                      {l.modalidade && <div style={{ fontSize: 11.5, color: 'var(--text-subtle)', marginTop: 1 }}>{l.modalidade}</div>}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {ops.length > 0
                        ? <span title={ops.join(', ')} style={{ fontSize: 13, color: 'var(--text-2)' }}>{ops[0]}{ops.length > 1 && <span style={{ fontSize: 11.5, color: 'var(--text-subtle)', marginLeft: 4 }}>+{ops.length - 1}</span>}</span>
                        : <span style={{ fontSize: 13, color: 'var(--text-subtle)' }}>—</span>}
                    </td>
                    <td>{pc ? <TonalPill color={pc}>{l.perception}</TonalPill> : <span style={{ color: 'var(--text-subtle)' }}>—</span>}</td>
                    <td><TonalPill color={reportStatusColor(l.status)}>{statusLabel(l.status)}</TonalPill></td>
                    <td style={{ whiteSpace: 'nowrap' }} title={l.retrabalhado_em ? `Reativado em ${fmtDate(l.retrabalhado_em)}` : undefined}>
                      <div style={{ fontSize: 13, color: 'var(--text-3b)', fontVariantNumeric: 'tabular-nums' }}>{l.created_at ? fmtDate(l.created_at) : '—'}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-subtle)', marginTop: 1 }}>{l.retrabalhado_em ? `reativado ${fmtAgo(l.retrabalhado_em)}` : fmtAgo(l.created_at)}</div>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <div style={{ fontSize: 13, color: 'var(--text-3b)', fontVariantNumeric: 'tabular-nums' }}>{l.updated_at ? fmtDate(l.updated_at) : '—'}</div>
                      {l.updated_at && <div style={{ fontSize: 11.5, color: 'var(--text-subtle)', marginTop: 1 }}>{fmtAgo(l.updated_at)}</div>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="fv-bf">Mostrando {linhas.length} de {base.length} {leadsTxt(base.length)} · clique no lead para abrir o painel.</div>
      </div>

      {peek && (
        <LeadPeekDrawer
          key="peek"
          lead={peek}
          onClose={() => setPeek(null)}
          onOpenFull={() => window.open(`/leads/${peek.id}`, '_blank')}
          position={idx >= 0 ? { index: idx + 1, total: linhas.length } : undefined}
          onPrev={idx > 0 ? () => setPeek(linhas[idx - 1]) : undefined}
          onNext={idx >= 0 && idx < linhas.length - 1 ? () => setPeek(linhas[idx + 1]) : undefined}
          onStatusChanged={(id, status) => { setStatusLocal(s => ({ ...s, [id]: status })); onStatusChanged() }}
        />
      )}
    </div>
  )
}
