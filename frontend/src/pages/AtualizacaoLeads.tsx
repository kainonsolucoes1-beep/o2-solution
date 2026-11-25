import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { X, Search } from 'lucide-react'
import api from '../api'
import { statusLabel } from '../utils/statusLabel'
import { parseUTC, calendarDaysAgo } from '../utils/date'
import { reportStatusColor, reportPerceptionColor } from '../utils/reportColors'
import LeadPeekDrawer from '../components/LeadPeekDrawer'
import '../styles/leads-report-theme.css'
import '../styles/fluxo-vendas.css'
import '../styles/atualizacao-leads.css'

// Atualização dos leads: o operador está agindo nos leads dele? Em quanto tempo?
// Tempos em minutos de horário comercial (seg-qui 9h-18h, sex 9h-17h, sem feriado) -- calculados no backend.

interface AlLead {
  id: string; name: string; email: string | null; phone: string | null; attendant: string | null
  origem: string | null; conversion_point: string | null; status: string | null; perception: string | null
  value_potential: number | null; operadoras_enviadas: string | null; modalidade: string | null
  created_at: string | null; updated_at: string | null; retrabalhado_em: string | null
  is_renutrucao: boolean; vidas: number | null
  duplicado_de_id: string | null; duplicado_de_nome: string | null; campanha_canal: string | null
  ultima_acao: string | null
  primeira: boolean; primeira_min: number | null; primeira_pendente: boolean
  entre_min: number | null
  parado: boolean; parado_dias: number | null
  vencido: boolean; retorno_em: string | null; vencido_min: number | null
}
interface Kpis {
  primeira_media: number | null; primeira_mediana: number | null; primeira_qtd: number; primeira_pendentes: number
  entre_media: number | null; entre_qtd: number
}
interface AlData {
  operador: string; mes: string; mes_anterior: string
  atual: Kpis; anterior: Kpis
  distribuicao: number[]
  semanas: { inicio: string; media: number | null; qtd: number }[]
  em_aberto: number
  parados: { total: number; sem_acao: number; mais_5: number; ate_5: number }
  vencidos: number
  leads: AlLead[]
}

type CardId = 'primeira' | 'entre' | 'parados' | 'vencidos'
interface CardDef { id: CardId; label: string; color: string; coluna: string; titulo: string }
const CARDS: CardDef[] = [
  { id: 'primeira', label: 'Tempo até a 1ª ação', color: 'var(--accent)', coluna: '1ª ação em', titulo: 'leads novos no mês · mais lentos primeiro' },
  { id: 'entre', label: 'Tempo entre ações', color: 'var(--accent)', coluna: 'Intervalo médio', titulo: 'leads com ações no mês · maior intervalo primeiro' },
  { id: 'parados', label: 'Leads parados', color: 'var(--danger)', coluna: 'Parado há', titulo: 'em aberto e sem agendamento futuro · parados há mais tempo primeiro' },
  { id: 'vencidos', label: 'Retornos vencidos', color: 'var(--warning)', coluna: 'Retorno era em', titulo: 'retorno marcado que passou sem ação · mais atrasados primeiro' },
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
const DIA_UTIL = 9 * 60
// minutos de expediente -> "12 min" / "2h05" / "1,5 dia útil"
function fmtMin(m: number | null | undefined): string {
  if (m == null) return '—'
  if (m < 60) return `${Math.round(m)} min`
  if (m < DIA_UTIL) { const h = Math.floor(m / 60), r = Math.round(m % 60); return `${h}h${String(r).padStart(2, '0')}` }
  const d = (m / DIA_UTIL).toLocaleString('pt-BR', { maximumFractionDigits: 1 })
  return `${d} ${m / DIA_UTIL < 2 ? 'dia útil' : 'dias úteis'}`
}
const brl = (n: number) => 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const leadsTxt = (q: number) => (q === 1 ? 'lead' : 'leads')
function fmtDate(iso: string) { return new Date(parseUTC(iso)).toLocaleDateString('pt-BR') }
function fmtDateHora(iso: string) {
  const d = new Date(parseUTC(iso))
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}
function fmtAgo(iso: string | null): string {
  if (!iso) return '—'
  const days = calendarDaysAgo(parseUTC(iso))
  if (days <= 0) return 'hoje'
  if (days === 1) return 'ontem'
  if (days < 30) return `há ${days} dias`
  const m = Math.floor(days / 30)
  return `há ${m} ${m === 1 ? 'mês' : 'meses'}`
}
function initials(name: string) {
  const p = name.trim().split(/\s+/)
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase()
}

// tempo: menor é melhor
function DeltaTempo({ cur, prev, mesAnt }: { cur: number | null; prev: number | null; mesAnt: string }) {
  if (cur == null || prev == null) return <span className="fv-delta fv-flat">sem base em {mesCurto(mesAnt)}</span>
  const d = cur - prev
  if (Math.abs(d) < 1) return <span className="fv-delta fv-flat">= {mesCurto(mesAnt)}</span>
  return <span className={`fv-delta ${d < 0 ? 'fv-good' : 'fv-bad'}`}>{d > 0 ? '▲ +' : '▼ −'}{fmtMin(Math.abs(d))} vs {mesCurto(mesAnt)}</span>
}

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

export default function AtualizacaoLeads() {
  const navigate = useNavigate()
  const [sp] = useSearchParams()
  const [me, setMe] = useState('')
  const [role, setRole] = useState('')
  const [agentes, setAgentes] = useState<string[]>([])
  const [agentesOk, setAgentesOk] = useState(false)
  const [data, setData] = useState<AlData | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [aberto, setAberto] = useState<CardDef | null>(null)

  const meses = useMemo(() => ultimosMeses(3), [])
  const padrao = !agentesOk ? '' : (role !== 'usuario' && agentes[0]) || me
  const op = sp.get('op') || padrao
  const mesUrl = sp.get('mes') || ''
  const mes = meses.includes(mesUrl) ? mesUrl : meses[0]

  useEffect(() => {
    api.get<{ first_name: string | null; username: string; role: string }>('/api/v1/auth/me')
      .then(r => { setMe(r.data.first_name || r.data.username); setRole(r.data.role) }).catch(() => {})
    api.get<{ nome: string }[]>('/api/v1/gestao-comercial/vida-sdr/agentes')
      .then(r => setAgentes(r.data.map(a => a.nome))).catch(() => setAgentes([])).finally(() => setAgentesOk(true))
  }, [])

  const carregar = useCallback((silencioso = false) => {
    if (!op) return
    if (!silencioso) setLoading(true)
    setErro('')
    api.get<AlData>('/api/v1/gestao-comercial/atualizacao-leads', { params: { origens: op, month: mes } })
      .then(r => setData(r.data))
      .catch(() => setErro('Não foi possível carregar a atualização dos leads. Tente de novo em instantes.'))
      .finally(() => setLoading(false))
  }, [op, mes])
  useEffect(() => { carregar() }, [carregar])

  function trocar(campo: 'op' | 'mes', valor: string) {
    const p = new URLSearchParams(sp)
    p.set(campo, valor)
    if (campo === 'op') p.set('mes', mes)
    navigate(`/atualizacao-leads?${p.toString()}`, { replace: true })
  }

  return (
    <div className="fv lr-theme">
      <div className="fv-wrap">
        <header className="fv-head">
          <div>
            <div className="fv-eyebrow">Reunião de resultados</div>
            <h1 className="fv-h1">Atualização dos leads {(data?.operador || op) && <span>· {data?.operador || op}</span>}</h1>
          </div>
          <div className="fv-picks">
            {agentes.length > 0 && (
              <div className="fv-pick">
                <label htmlFor="al-op">Operador</label>
                <select id="al-op" value={agentes.includes(op) ? op : ''} onChange={e => e.target.value && trocar('op', e.target.value)}>
                  {!agentes.includes(op) && <option value="">{op || 'Escolha'}</option>}
                  {agentes.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
            )}
            <div className="fv-pick">
              <label htmlFor="al-mes">Mês de referência</label>
              <select id="al-mes" value={mes} onChange={e => trocar('mes', e.target.value)}>
                {meses.map(m => <option key={m} value={m}>{mesNome(m)}</option>)}
              </select>
            </div>
          </div>
        </header>

        {erro ? <div className="fv-empty">{erro}</div>
          : loading || !data ? <div className="fv-empty">Carregando…</div>
          : <Corpo data={data} onAbrir={setAberto} />}
      </div>

      {aberto && data && (
        <LeadsModal card={aberto} data={data} onClose={() => setAberto(null)} onStatusChanged={() => carregar(true)} />
      )}
    </div>
  )
}

const DICA_HORARIO = 'Conta só o horário comercial: seg a qui das 9h às 18h e sex das 9h às 17h. Fim de semana e feriado não contam.'

function Corpo({ data, onAbrir }: { data: AlData; onAbrir: (c: CardDef) => void }) {
  const { atual, anterior, parados } = data
  const card = (c: CardDef, conteudo: React.ReactNode, rodape: React.ReactNode, dica?: string) => (
    <button key={c.id} className="fv-card" style={{ '--c': c.color } as React.CSSProperties} onClick={() => onAbrir(c)} title={dica}>
      <div className="fv-top"><span className="fv-lbl">{c.label}{dica && <span style={{ color: 'var(--text-subtle)', fontWeight: 400 }}> ⓘ</span>}</span></div>
      {conteudo}
      <div className="fv-cmp">{rodape}<span className="fv-ver">ver leads →</span></div>
    </button>
  )
  return (
    <>
      <section className="fv-sec">
        <div className="al-grid4">
          {card(CARDS[0], <>
            <div className="fv-val">{fmtMin(atual.primeira_media)} <small>média</small></div>
            <div className="al-sub">mediana {fmtMin(atual.primeira_mediana)} · {atual.primeira_qtd} {leadsTxt(atual.primeira_qtd)} novos{atual.primeira_pendentes > 0 && <> · <b style={{ color: 'var(--danger)' }}>{atual.primeira_pendentes} sem ação</b></>}</div>
          </>, <DeltaTempo cur={atual.primeira_media} prev={anterior.primeira_media} mesAnt={data.mes_anterior} />,
          `${DICA_HORARIO} Conta da chegada do lead até a 1ª anotação, mudança de status ou agendamento. Renutrição não entra: o relógio começa quando ela reativa o lead.`)}

          {card(CARDS[1], <>
            <div className="fv-val">{fmtMin(atual.entre_media)} <small>média</small></div>
            <div className="al-sub">{atual.entre_qtd} {atual.entre_qtd === 1 ? 'intervalo' : 'intervalos'} no mês</div>
          </>, <DeltaTempo cur={atual.entre_media} prev={anterior.entre_media} mesAnt={data.mes_anterior} />,
          `${DICA_HORARIO} Ações no mesmo lead com até 15 min de diferença contam como uma só. Retorno combinado com o cliente não conta como demora.`)}

          {card(CARDS[2], <>
            <div className="fv-val">{parados.total} <small>de {data.em_aberto}</small></div>
            <div className="al-break">
              <span><b style={{ color: 'var(--danger)' }}>{parados.sem_acao}</b> sem nenhuma ação</span>
              <span><b style={{ color: 'var(--danger)' }}>{parados.mais_5}</b> +5 dias úteis</span>
              <span><b style={{ color: 'var(--warning)' }}>{parados.ate_5}</b> até 5 dias úteis</span>
            </div>
          </>, <span className="al-sub">situação de hoje</span>,
          'Lead em aberto sem nenhum agendamento futuro. Lead com retorno combinado não conta; se a data passa sem ação, ele vai para Retornos vencidos.')}

          {card(CARDS[3], <>
            <div className="fv-val">{data.vencidos}</div>
            <div className="al-sub">retornos que passaram da data sem ação</div>
          </>, <span className="al-sub">situação de hoje</span>)}
        </div>
      </section>

      <div className="al-charts">
        <Distribuicao valores={data.distribuicao} />
        <Semanas semanas={data.semanas} />
      </div>
    </>
  )
}

const FAIXAS = [
  { l: 'até 30 min', c: 'var(--success)' }, { l: '30 min–2h', c: 'var(--success)' }, { l: '2h–4h', c: 'var(--warning)' },
  { l: 'até 1 dia útil', c: 'var(--warning)' }, { l: '1–2 dias úteis', c: 'var(--danger)' }, { l: '+2 dias úteis', c: 'var(--danger)' },
]
function Distribuicao({ valores }: { valores: number[] }) {
  const tot = valores.reduce((s, v) => s + v, 0)
  const max = Math.max(1, ...valores)
  const w = 560 / valores.length
  return (
    <div className="al-chart">
      <h3>Em quanto tempo ela age no lead novo</h3>
      {tot === 0 ? <div className="fv-empty" style={{ padding: 24 }}>Nenhum lead novo com ação neste mês.</div> : (
        <svg viewBox="0 0 560 190" width="100%" role="img" aria-label="Distribuição do tempo até a primeira ação">
          {valores.map((v, i) => {
            const h = (v / max) * 125, x = i * w + 10
            return (
              <g key={i}>
                <rect x={x} y={150 - h} width={w - 20} height={h} rx={4} fill={FAIXAS[i].c} opacity={0.85} />
                <text className="v" x={x + (w - 20) / 2} y={144 - h} textAnchor="middle">{v} · {Math.round((v / tot) * 100)}%</text>
                <text x={x + (w - 20) / 2} y={170} textAnchor="middle">{FAIXAS[i].l}</text>
              </g>
            )
          })}
          <line x1={0} x2={560} y1={150} y2={150} stroke="var(--border)" />
        </svg>
      )}
    </div>
  )
}

function Semanas({ semanas }: { semanas: AlData['semanas'] }) {
  const maxM = Math.max(60, ...semanas.map(s => s.media ?? 0))
  const maxQ = Math.max(1, ...semanas.map(s => s.qtd))
  const X = (i: number) => 40 + i * 46, Y = (v: number) => 150 - (v / maxM) * 120
  const pts = semanas.map((s, i) => (s.media == null ? null : [X(i), Y(s.media)] as const))
  const ultimo = [...semanas].reverse().find(s => s.media != null)
  const ui = ultimo ? semanas.lastIndexOf(ultimo) : -1
  return (
    <div className="al-chart">
      <h3>Semana a semana</h3>
      <svg viewBox="0 0 380 185" width="100%" role="img" aria-label="Tempo médio até a primeira ação por semana">
        {[0, 0.5, 1].map(f => (
          <g key={f}>
            <line x1={34} x2={375} y1={Y(maxM * f)} y2={Y(maxM * f)} stroke="var(--border)" />
            <text x={0} y={Y(maxM * f) + 4}>{fmtMin(maxM * f).replace(' dias úteis', 'd').replace(' dia útil', 'd')}</text>
          </g>
        ))}
        {semanas.map((s, i) => (
          <g key={s.inicio}>
            <rect x={X(i) - 9} y={150 - (s.qtd / maxQ) * 55} width={18} height={(s.qtd / maxQ) * 55} rx={2} fill="color-mix(in srgb, var(--accent) 22%, transparent)" />
            <text x={X(i)} y={168} textAnchor="middle">{s.inicio.slice(8, 10)}/{s.inicio.slice(5, 7)}</text>
          </g>
        ))}
        <polyline points={pts.filter(Boolean).map(p => p!.join(',')).join(' ')} fill="none" stroke="var(--accent)" strokeWidth={2.5} />
        {pts.map((p, i) => p && <circle key={i} cx={p[0]} cy={p[1]} r={i === ui ? 5 : 3} fill="var(--accent)" />)}
        {ultimo && pts[ui] && <text className="v" x={pts[ui]![0]} y={pts[ui]![1] - 10} textAnchor="middle">{fmtMin(ultimo.media)}</text>}
      </svg>
      <div className="al-legend"><span><i style={{ background: 'var(--accent)' }} />média até a 1ª ação</span><span><i style={{ background: 'color-mix(in srgb, var(--accent) 22%, transparent)' }} />leads novos</span></div>
    </div>
  )
}

function doCard(id: CardId, l: AlLead) {
  return id === 'primeira' ? l.primeira : id === 'entre' ? l.entre_min != null : id === 'parados' ? l.parado : l.vencido
}
// ordem padrão de cada lista: o pior primeiro
function peso(id: CardId, l: AlLead): number {
  if (id === 'primeira') return (l.primeira_pendente ? 1e9 : 0) + (l.primeira_min ?? 0)
  if (id === 'entre') return l.entre_min ?? 0
  if (id === 'parados') return l.ultima_acao ? (l.parado_dias ?? 0) : 1e9
  return l.vencido_min ?? 0
}
function Metrica({ id, l }: { id: CardId; l: AlLead }) {
  const cor = (ruim: boolean, medio: boolean) => (ruim ? 'var(--danger)' : medio ? 'var(--warning)' : 'var(--success)')
  if (id === 'primeira') {
    const m = l.primeira_min ?? 0
    return <span style={{ fontWeight: 700, color: cor(l.primeira_pendente || m > DIA_UTIL, m > 120) }}>{l.primeira_pendente ? `sem ação · ${fmtMin(m)}` : fmtMin(m)}</span>
  }
  if (id === 'entre') { const m = l.entre_min ?? 0; return <span style={{ fontWeight: 700, color: cor(m > 3 * DIA_UTIL, m > DIA_UTIL) }}>{fmtMin(m)}</span> }
  if (id === 'parados') {
    if (!l.ultima_acao) return <TonalPill color="var(--danger)">sem nenhuma ação</TonalPill>
    const d = l.parado_dias ?? 0
    return <span style={{ fontWeight: 700, color: cor(d > 5, d > 0) }}>{d === 0 ? 'hoje' : `${d} ${d === 1 ? 'dia útil' : 'dias úteis'}`}</span>
  }
  return (
    <div>
      <div style={{ fontWeight: 700, color: 'var(--danger)' }}>{l.retorno_em ? fmtDateHora(l.retorno_em) : '—'}</div>
      <div style={{ fontSize: 11.5, color: 'var(--text-subtle)' }}>atrasado {fmtMin(l.vencido_min)}</div>
    </div>
  )
}

const COLUMNS: { key: keyof AlLead; label: string }[] = [
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

function LeadsModal({ card, data, onClose, onStatusChanged }: { card: CardDef; data: AlData; onClose: () => void; onStatusChanged: () => void }) {
  const [busca, setBusca] = useState('')
  const [buscaDeb, setBuscaDeb] = useState('')
  const [sortCol, setSortCol] = useState<keyof AlLead | 'metrica'>('metrica')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [peek, setPeek] = useState<AlLead | null>(null)
  const [statusLocal, setStatusLocal] = useState<Record<string, string>>({})

  useEffect(() => { const t = setTimeout(() => setBuscaDeb(busca), 250); return () => clearTimeout(t) }, [busca])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !peek) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [peek, onClose])

  // a lista é a "foto" de quando o card foi aberto: o lead não some ao trocar o status pelo painel
  const [ids] = useState(() => new Set(data.leads.filter(l => doCard(card.id, l)).map(l => l.id)))
  const base = data.leads.filter(l => ids.has(l.id)).map(l => (statusLocal[l.id] ? { ...l, status: statusLocal[l.id] } : l))

  const q = buscaDeb.trim().toLowerCase(), qd = q.replace(/\D/g, '')
  const linhas = base
    .filter(l => !q || l.name.toLowerCase().includes(q) || (qd.length > 0 && (l.phone || '').replace(/\D/g, '').includes(qd)) || (l.email || '').toLowerCase().includes(q))
    .sort((a, b) => {
      let r: number
      if (sortCol === 'metrica') r = peso(card.id, a) - peso(card.id, b)
      else {
        const va = a[sortCol] ?? '', vb = b[sortCol] ?? ''
        r = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'pt-BR')
      }
      return sortDir === 'asc' ? r : -r
    })
  function ordenar(k: keyof AlLead | 'metrica') {
    if (sortCol === k) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortCol(k); setSortDir(k === 'name' || k === 'attendant' || k === 'origem' ? 'asc' : 'desc') }
  }
  const seta = (k: keyof AlLead | 'metrica') => sortCol === k && <span style={{ marginLeft: 4, opacity: 0.7 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
  const idx = peek ? linhas.findIndex(l => l.id === peek.id) : -1

  return (
    <div className="fv-scrim" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="fv-box" role="dialog" aria-modal="true" aria-labelledby="al-mt">
        <div className="fv-bh">
          <div>
            <h2 id="al-mt"><span className="fv-dot" style={{ '--c': card.color } as React.CSSProperties} />{card.label} · {data.operador}</h2>
            <p>{base.length} {leadsTxt(base.length)} · {card.titulo}{card.id === 'primeira' || card.id === 'entre' ? ` · ${mesNome(data.mes)}` : ''}</p>
          </div>
          <button className="fv-x" onClick={onClose} aria-label="Fechar"><X size={16} /></button>
        </div>
        <label className="fv-search"><Search size={15} /><input autoFocus value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome, telefone ou e-mail" aria-label="Buscar lead" /></label>
        <div className="fv-tbl">
          <table>
            <thead>
              <tr>
                {COLUMNS.map(c => <th key={c.key} onClick={() => ordenar(c.key)}>{c.label}{seta(c.key)}</th>)}
                <th onClick={() => ordenar('metrica')}>{card.coluna}{seta('metrica')}</th>
              </tr>
            </thead>
            <tbody>
              {linhas.length === 0 ? (
                <tr><td colSpan={COLUMNS.length + 1} style={{ padding: '40px 22px', textAlign: 'center', color: 'var(--text-subtle)', cursor: 'default' }}>Nenhum lead encontrado.</td></tr>
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
                      <div style={{ fontSize: 13, fontWeight: 700, color: l.value_potential ? 'var(--text-1)' : 'var(--text-subtle)' }}>{l.value_potential ? brl(l.value_potential) : '—'}</div>
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
                    <td style={{ whiteSpace: 'nowrap', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}><Metrica id={card.id} l={l} /></td>
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
