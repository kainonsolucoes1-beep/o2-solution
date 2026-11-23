import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'
import LeadPeekDrawer from '../components/LeadPeekDrawer'
import '../styles/placar.css'

// Dashboard › Placar do dia -- mesmo desenho do mockup aprovado em 06/11/2026
// (C:\tmp\mockup-placar-do-dia.html), com os dados de /dashboard/placar.

interface PlacarLead {
  id: string
  nome: string
  telefone: string | null
  d: string
  h: number
  min: number
  grupo: GrupoKey
  origem: string | null
  ponto?: string | null
  status: string
  status_raw: string | null
  atendente: string | null
  contatado: boolean
  contato_min: number | null
  espera_min: number | null
}
interface Placar {
  data: string
  data_fim: string
  periodo: boolean // mais de um dia (De/Até)
  dias: string[]
  hoje: boolean // o intervalo inclui hoje
  agora: string | null
  corte_min: number
  meta_dia: number
  meta: number // meta do dia, ou somada nos dias úteis do período
  media_hora: number[]
  media_dia: number
  leads: PlacarLead[]
  anterior: { m: number; grupo: GrupoKey }[]
}
type GrupoKey = 'meta' | 'google' | 'org' | 'sdr' | 'discadora' | 'adm' | 'indicacao' | 'retrabalho' | 'outros'

const ORIGENS: { k: GrupoKey; l: string; c: string }[] = [
  { k: 'meta', l: 'Meta Ads', c: '--s1' }, { k: 'google', l: 'Google', c: '--s2' }, { k: 'org', l: 'Orgânico', c: '--s3' },
  { k: 'sdr', l: 'Prospecção SDR', c: '--s4' }, { k: 'discadora', l: 'Discadora', c: '--s6' },
  { k: 'adm', l: 'Adm', c: '--s7' },
  { k: 'indicacao', l: 'Indicação', c: '--s5' }, { k: 'retrabalho', l: 'Retrabalho', c: '--s8' },
  { k: 'outros', l: 'Outros', c: '--s9' },
]
const STATUS = [
  { k: 'pend', l: 'Pendente', c: '--st-pend' }, { k: 'aguard', l: 'Aguardando dados', c: '--st-aguard' }, { k: 'semret', l: 'Sem retorno', c: '--st-semret' },
  { k: 'agend', l: 'Agendado', c: '--st-agend' }, { k: 'prop', l: 'Proposta', c: '--st-prop' }, { k: 'pendc', l: 'Pendência', c: '--st-pendc' },
  { k: 'emis', l: 'Emissão', c: '--st-emis' }, { k: 'fech', l: 'Fechado', c: '--st-fech' }, { k: 'perd', l: 'Perdido', c: '--st-perd' },
  { k: 'outro', l: 'Outros', c: '--st-outro' },
]
const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

// cor do avatar por pessoa -- mesma regra do Relatório (utils/reportColors)
const PESSOA_CORES = ['#2A8C7E', '#6366F1', '#F97316', '#9333EA', '#0891B2', '#DB2777', '#2563EB', '#CA8A04', '#16A34A', '#E11D48']
function personColor(nome: string) {
  const n = nome.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (!n) return '#9CA3AF'
  let h = 0
  for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0
  return PESSOA_CORES[h % PESSOA_CORES.length]
}

// ponto de conversão do Meta: "Meta Amil - SP" -> "Amil · SP"
const nomePonto = (p: string | null | undefined) => (p || '').replace(/^meta\s+/i, '').replace(/\s+-\s+/g, ' · ').trim() || 'Sem formulário'
const pct = (a: number, b: number) => (b ? Math.round(a / b * 100) : 0)
const pad = (n: number) => String(n).padStart(2, '0')
const isoLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
function dataLabel(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return `${DIAS_SEMANA[dt.getDay()]}, ${d} de ${MESES[m - 1]}`
}
function periodoLabel(a: string, b: string) {
  if (a === b) return dataLabel(a)
  const [ya, ma, da] = a.split('-').map(Number), [yb, mb, db] = b.split('-').map(Number)
  if (ya === yb && ma === mb) return `${da} a ${db} de ${MESES[mb - 1]}`
  if (ya === yb) return `${da} de ${MESES[ma - 1]} a ${db} de ${MESES[mb - 1]}`
  return `${pad(da)}/${pad(ma)}/${ya} a ${pad(db)}/${pad(mb)}/${yb}`
}
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const hojeIso = () => isoLocal(new Date())
const ontemIso = () => { const d = new Date(); d.setDate(d.getDate() - 1); return isoLocal(d) }
const MAX_DIAS = 93 // mesmo limite do backend
const diasEntre = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1
const dataValida = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && s >= '2020-01-01'
const badgeStyle = (c: string) => ({
  color: `var(${c})`, background: `color-mix(in srgb,var(${c}) 11%,transparent)`, border: `1px solid color-mix(in srgb,var(${c}) 30%,transparent)`,
})

// ícones do mockup (mesmos traços)
const ICONS: Record<string, ReactNode> = {
  in: <path d="M12 3v12M7 10l5 5 5-5M4 21h16" />,
  ph: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />,
  clk: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  hour: <path d="M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9" />,
  ok: <path d="M20 6 9 17l-5-5" />,
  warn: <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />,
  arr: <path d="M5 12h14M13 6l6 6-6 6" />,
  cal: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  chev: <path d="m6 9 6 6 6-6" />,
}
function Ico({ n, style }: { n: string; style?: React.CSSProperties }) {
  return <svg className="ico" viewBox="0 0 24 24" style={style}>{ICONS[n]}</svg>
}

export default function PlacarDia() {
  const navigate = useNavigate()
  // período aplicado (de/ate) e o que está digitado nos campos (deTxt/ateTxt):
  // os campos só aplicam depois de uma pausa e com as duas datas válidas --
  // input date sem debounce já derrubou o backend na aba Performance
  const [de, setDe] = useState(hojeIso)
  const [ate, setAte] = useState(hojeIso)
  const [deTxt, setDeTxt] = useState(de)
  const [ateTxt, setAteTxt] = useState(ate)
  const [placar, setPlacar] = useState<Placar | null>(null)
  const [erro, setErro] = useState('')
  const [atualizado, setAtualizado] = useState('')
  const [origSel, setOrigSel] = useState<GrupoKey | null>(null)
  const [origOff, setOrigOff] = useState<Set<GrupoKey>>(new Set())
  const [pontoSel, setPontoSel] = useState<string | null>(null)
  const [flashId, setFlashId] = useState<string | null>(null)
  const [peek, setPeek] = useState<PlacarLead | null>(null)
  const idsRef = useRef<Set<string> | null>(null)

  const hoje = hojeIso(), ontem = ontemIso()
  const incluiHoje = de <= hoje && hoje <= ate
  const rangeOk = dataValida(deTxt) && dataValida(ateTxt) && deTxt <= ateTxt && diasEntre(deTxt, ateTxt) <= MAX_DIAS

  useEffect(() => {
    if (!rangeOk || (deTxt === de && ateTxt === ate)) return
    const t = setTimeout(() => { setDe(deTxt); setAte(ateTxt) }, 600)
    return () => clearTimeout(t)
  }, [deTxt, ateTxt, rangeOk, de, ate])

  // botão "Filtro": abre o painel com Hoje/Ontem + De/Até; fecha clicando fora ou no Esc
  const [filtroAberto, setFiltroAberto] = useState(false)
  const filtroRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!filtroAberto) return
    const fora = (e: MouseEvent) => { if (!filtroRef.current?.contains(e.target as Node)) setFiltroAberto(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setFiltroAberto(false) }
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc) }
  }, [filtroAberto])

  function escolherDia(iso: string) {
    setDe(iso); setAte(iso); setDeTxt(iso); setAteTxt(iso)
  }

  const carregar = useCallback((silencioso = false) => {
    if (!silencioso) setErro('')
    return api.get<Placar>('/api/v1/dashboard/placar', { params: { date_from: de, date_to: ate } })
      .then(r => {
        const novos = r.data.leads
        // lead novo chegando ao vivo: pisca no topo da lista
        if (idsRef.current && r.data.hoje) {
          const chegou = novos.find(l => !idsRef.current!.has(l.id))
          if (chegou) setFlashId(chegou.id)
        }
        idsRef.current = new Set(novos.map(l => l.id))
        setPlacar(r.data)
        const n = new Date()
        setAtualizado(`${pad(n.getHours())}:${pad(n.getMinutes())}`)
      })
      .catch(err => {
        if (err?.response?.status === 401) navigate('/login')
        else if (!silencioso) setErro('Não foi possível carregar o placar.')
      })
  }, [de, ate, navigate])

  useEffect(() => {
    idsRef.current = null
    setPlacar(null)
    setOrigSel(null)
    setOrigOff(new Set())
    setPontoSel(null)
    carregar()
  }, [carregar])

  // ao vivo: atualiza a cada minuto enquanto o período incluir hoje
  useEffect(() => {
    if (!incluiHoje) return
    const t = setInterval(() => { if (!document.hidden) carregar(true) }, 60000)
    return () => clearInterval(t)
  }, [incluiHoje, carregar])

  const ativos = ORIGENS.filter(o => !origOff.has(o.k) && (!origSel || o.k === origSel))
  const filtrado = ativos.length < ORIGENS.length
  const leadsF = useMemo(
    () => (placar?.leads ?? []).filter(l => !origOff.has(l.grupo) && (!origSel || l.grupo === origSel) && (!pontoSel || nomePonto(l.ponto) === pontoSel)),
    [placar, origOff, origSel, pontoSel],
  )

  function toggleLeg(k: GrupoKey) {
    setOrigSel(null)
    setPontoSel(null)
    setOrigOff(prev => {
      const n = new Set(prev)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n.size === ORIGENS.length ? new Set() : n
    })
  }

  return (
    <main className="pl">
      <div className="page">
        <div className="top">
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <h1>Placar do dia</h1>
              <span className="date">{periodoLabel(de, ate)}</span>
            </div>
          </div>
          {incluiHoje && placar && (
            <span className="live"><i /><span>Ao vivo · atualizado às {atualizado}</span></span>
          )}
          <div className="sp" />
          <div className="flt" ref={filtroRef}>
            <button className={`flt-btn ${filtroAberto ? 'open' : ''}`} onClick={() => setFiltroAberto(v => !v)} aria-expanded={filtroAberto}>
              <Ico n="cal" style={{ width: 14 }} />Filtro
              <span className="flt-val">{de === hoje && ate === hoje ? 'Hoje' : de === ontem && ate === ontem ? 'Ontem' : de === ate ? ddmm(de) : `${ddmm(de)} – ${ddmm(ate)}`}</span>
              <Ico n="chev" style={{ width: 12, transform: filtroAberto ? 'rotate(180deg)' : undefined }} />
            </button>
            {filtroAberto && (
              <div className="flt-pop">
                <div className="seg">
                  <button className={de === hoje && ate === hoje ? 'on' : ''} onClick={() => { escolherDia(hoje); setFiltroAberto(false) }}>Hoje</button>
                  <button className={de === ontem && ate === ontem ? 'on' : ''} onClick={() => { escolherDia(ontem); setFiltroAberto(false) }}>Ontem</button>
                </div>
                <div className={`flt-range ${rangeOk ? '' : 'bad'}`}>
                  <label>De<input type="date" value={deTxt} max={hoje} onChange={e => setDeTxt(e.target.value)} /></label>
                  <label>Até<input type="date" value={ateTxt} max={hoje} onChange={e => setAteTxt(e.target.value)} /></label>
                </div>
              </div>
            )}
          </div>
        </div>

        {erro && <div className="card empty">{erro}</div>}
        {!placar && !erro && <div className="loading">Carregando o placar…</div>}

        {placar && (
          <>
            <Row1 p={placar} />

            <div className="row2">
              <section className="card ch">
                <HourChart p={placar} leads={leadsF} ativos={ativos} filtrado={filtrado} origOff={origOff} origSel={origSel} onLegend={toggleLeg} />
              </section>
              <section className="card orig">
                <div className="chh"><div><h3>Origem dos leads</h3><p>Clique para filtrar o gráfico e a lista</p></div></div>
                <Origens p={placar} sel={origSel} ponto={pontoSel}
                  onSel={k => { setOrigSel(s => (s === k && !pontoSel ? null : k)); setPontoSel(null); setOrigOff(new Set()) }}
                  onPonto={pt => { const sai = pontoSel === pt; setPontoSel(sai ? null : pt); setOrigSel(sai ? null : 'meta'); setOrigOff(new Set()) }} />
              </section>
            </div>

            <div className="row3">
              <section className="card ch" style={{ alignSelf: 'start' }}>
                <Status leads={leadsF} quando={placar.periodo ? 'no período' : placar.hoje ? 'hoje' : 'no dia'} />
              </section>
              <section className="card ch feed">
                <div className="chh">
                  <div><h3>Últimos leads</h3><p>{pontoSel ? `Só Meta Ads · ${pontoSel}` : origSel ? `Só ${ORIGENS.find(o => o.k === origSel)!.l}` : 'Os mais recentes primeiro'}</p></div>
                  <div className="sp" />
                  <button className="link" onClick={() => navigate(`/leads-report?date_from=${placar.data}&date_to=${placar.data_fim}&estrito=1`)}>
                    Ver no Relatório <Ico n="arr" style={{ width: 13 }} />
                  </button>
                </div>
                <Feed leads={leadsF.slice(0, 8)} flashId={flashId} onOpen={setPeek} periodo={placar.periodo} />
              </section>
            </div>
          </>
        )}
      </div>

      {peek && (
        <div className="lr-theme" style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'transparent', pointerEvents: 'none' }}>
          <div style={{ pointerEvents: 'auto' }}>
            <LeadPeekDrawer
              lead={{ id: peek.id, name: peek.nome, phone: peek.telefone, email: null, origem: peek.origem, modalidade: null, status: peek.status_raw, perception: null, value_potential: null }}
              onClose={() => setPeek(null)}
              onOpenFull={() => window.open(`/leads/${peek.id}`, '_blank')}
            />
          </div>
        </div>
      )}
    </main>
  )
}

/* ---------- linha 1: o placar ---------- */
function Row1({ p }: { p: Placar }) {
  const all = p.leads
  const total = all.length
  const live = p.hoje && !p.periodo // um dia só, e é hoje
  const corteH = Math.floor(p.corte_min / 60), corteM = p.corte_min % 60
  const anteriorAte = p.anterior.filter(a => a.m < p.corte_min).length
  const mediaAte = live
    ? Math.round(p.media_hora.slice(0, corteH).reduce((a, b) => a + b, 0) + (p.media_hora[corteH] ?? 0) * corteM / 60)
    : Math.round(p.media_dia)
  const dAnt = total - anteriorAte, dMedia = total - mediaAte
  const chip = (d: number, txt: string) => (
    <span className={`delta ${d > 0 ? 'up' : d < 0 ? 'down' : 'flat'}`}>{d > 0 ? '↑' : d < 0 ? '↓' : '='} {Math.abs(d)} {txt}</span>
  )
  const atendidos = all.filter(l => l.contatado)
  const pend = all.filter(l => !l.contatado).sort((a, b) => (b.espera_min ?? 0) - (a.espera_min ?? 0))
  const tempos = atendidos.map(l => l.contato_min).filter((t): t is number => t != null).sort((a, b) => a - b)
  const mediana = tempos.length ? tempos[Math.floor(tempos.length / 2)] : null
  const em15 = pct(tempos.filter(t => t <= 15).length, tempos.length)
  const semHorario = atendidos.length - tempos.length
  const fechados = all.filter(l => l.status === 'fech').length
  const projecao = live && mediaAte > 0 ? Math.round(total / mediaAte * p.media_dia) : total
  const pAt = pct(atendidos.length, total)
  const C = 2 * Math.PI * 17
  const quando = p.periodo ? 'no período' : p.hoje ? 'hoje' : 'no dia'
  const atrasados = pend.filter(l => (l.espera_min ?? 0) > 30).length

  return (
    <div className="row1">
      <div className="card hero">
        <div className="lbl"><Ico n="in" style={{ color: 'var(--pri)' }} />Leads captados {quando}</div>
        <div className="big">{total}{live && <small>até {corteH}h{pad(corteM)}</small>}</div>
        <div className="chips">
          {p.periodo ? chip(dAnt, 'vs período anterior')
            : live ? <>{chip(dAnt, 'vs ontem no mesmo horário')}{chip(dMedia, 'vs média 7 dias')}</>
            : <>{chip(dAnt, 'vs dia anterior')}{chip(dMedia, 'vs média 7 dias')}</>}
        </div>
        <div className="meta">
          <div className="bar">
            <i style={{ width: `${Math.min(100, pct(total, p.meta))}%` }} />
            {live && <b style={{ left: `${Math.min(99, pct(projecao, p.meta))}%` }} title="Projeção" />}
          </div>
          <div className="ml">
            <span>Meta do {p.periodo ? 'período' : 'dia'}: <b>{p.meta}</b> · {pct(total, p.meta)}%</span>
            {live && <span>Projeção: <b>~{projecao}</b></span>}
          </div>
        </div>
      </div>
      <div className="card tile">
        <div className="lbl"><Ico n="ph" />Já tiveram interação</div>
        <div className="pl-ring">
          <svg width="44" height="44" viewBox="0 0 44 44">
            <circle cx="22" cy="22" r="17" fill="none" stroke="var(--chip)" strokeWidth="5" />
            <circle cx="22" cy="22" r="17" fill="none" stroke="var(--pri)" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${C * pAt / 100} ${C}`} transform="rotate(-90 22 22)" />
          </svg>
          <div className="val" style={{ margin: 0 }}>{atendidos.length}<small>de {total}</small></div>
        </div>
        <div className="sub"><b>{pAt}%</b> dos captados {quando}</div>
      </div>
      <div className="card tile">
        <div className="lbl"><Ico n="hour" />Aguardando 1ª interação</div>
        <div className="val">{pend.length}</div>
        <div className="sub">
          {!pend.length ? 'ninguém esperando'
            : p.hoje && pend[0].espera_min != null ? <>mais antigo esperando há <b>{fmtEspera(pend[0].espera_min)}</b></>
            : 'ficaram sem contato no dia'}
        </div>
        {p.hoje && atrasados > 0
          ? <span className="alert"><Ico n="warn" style={{ width: 13 }} />{atrasados} há mais de 30 min</span>
          : !pend.length && <span className="delta up" style={{ marginTop: 8, alignSelf: 'flex-start' }}><Ico n="ok" style={{ width: 12 }} />Fila em dia</span>}
      </div>
      <div className="card tile">
        <div className="lbl"><Ico n="clk" />Tempo até o 1º contato</div>
        <div className="val">{mediana ?? '—'}{mediana != null && <small>min</small>}</div>
        <div className="sub">{tempos.length
            ? <>mediana em horário útil (9h–18h) · <b>{em15}%</b> em até 15 min{semHorario > 0 && <> · {semHorario} sem horário</>}</>
            : atendidos.length
              ? <><b>{atendidos.length}</b> contatado{atendidos.length !== 1 ? 's' : ''}, mas sem horário do contato registrado</>
              : 'nenhum contato ainda'}</div>
        <div className="sub" style={{ marginTop: 6 }}>{fechados} fechado{fechados !== 1 ? 's' : ''} {quando}</div>
      </div>
    </div>
  )
}

function fmtEspera(min: number) {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60), m = min % 60
  return m ? `${h}h${pad(m)}` : `${h}h`
}

/* ---------- captação por hora: barras empilhadas por origem + média 7 dias ---------- */
function HourChart({ p, leads, ativos, filtrado, origOff, origSel, onLegend }: {
  p: Placar; leads: PlacarLead[]; ativos: typeof ORIGENS; filtrado: boolean; origOff: Set<GrupoKey>; origSel: GrupoKey | null; onLegend: (k: GrupoKey) => void
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(760)
  const [tip, setTip] = useState<{ i: number; x: number; y: number } | null>(null)
  const tipRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(el.clientWidth || 760))
    ro.observe(el)
    setW(el.clientWidth || 760)
    return () => ro.disconnect()
  }, [])

  // um dia: barras por hora (+ média 7 dias); período: barras por dia
  const per = p.periodo
  const live = p.hoje && !per
  const horasComLead = p.leads.map(l => l.h)
  const h0 = Math.min(7, ...horasComLead), h1 = Math.max(22, ...horasComLead)
  const HORAS = Array.from({ length: h1 - h0 + 1 }, (_, i) => h0 + i)
  const corteH = Math.floor(p.corte_min / 60)
  const comMedia = !filtrado && !per

  const porHora = (per ? p.dias : HORAS).map(b => {
    const h = per ? -1 : (b as number), d = per ? (b as string) : ''
    const r = { h, d, tot: 0 } as Record<string, number> & { h: number; d: string; tot: number }
    ORIGENS.forEach(o => {
      r[o.k] = leads.filter(l => (per ? l.d === d : l.h === h) && l.grupo === o.k).length
      if (ativos.includes(o)) r.tot += r[o.k]
    })
    return r
  })
  const rotulo = (r: { h: number; d: string }) => (per ? ddmm(r.d) : `${r.h}h`)
  const maxV = Math.max(4, ...porHora.map(r => r.tot), ...(comMedia ? HORAS.map(h => p.media_hora[h] ?? 0) : []))
  const step = maxV <= 8 ? 2 : maxV <= 16 ? 4 : maxV <= 40 ? 5 : 10
  const yMax = Math.ceil(maxV / step) * step
  const H = 250, ml = 30, mr = 8, mt = 10, mb = 26
  const iw = W - ml - mr, ih = H - mt - mb, bw = iw / porHora.length
  const y = (v: number) => mt + ih - v / yMax * ih
  const cadaN = Math.max(1, Math.ceil(42 / bw)) // rótulo do eixo X a cada N barras quando aperta

  const grid = []
  for (let v = 0; v <= yMax; v += step) {
    grid.push(
      <g key={`g${v}`}>
        <line x1={ml} x2={W - mr} y1={y(v)} y2={y(v)} stroke={`var(${v === 0 ? '--axis' : '--grid'})`} strokeWidth={1} />
        <text x={ml - 8} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--tx3)">{v}</text>
      </g>,
    )
  }
  const bars = porHora.map((r, i) => {
    const x = ml + i * bw + bw * 0.18, w = bw * 0.64
    let acc = 0
    const segs = ativos.filter(o => r[o.k] > 0)
    const out: ReactNode[] = segs.map((o, j) => {
      const v = r[o.k], y0 = y(acc), y1 = y(acc + v), top = j === segs.length - 1
      acc += v
      return top
        ? <path key={o.k} d={`M${x},${y0} V${y1 + 4} Q${x},${y1} ${x + 4},${y1} H${x + w - 4} Q${x + w},${y1} ${x + w},${y1 + 4} V${y0} Z`} fill={`var(${o.c})`} />
        : <rect key={o.k} x={x} y={y1 + 2} width={w} height={Math.max(0, y0 - y1 - 2)} fill={`var(${o.c})`} />
    })
    const futuro = live && r.h > corteH, atual = live && r.h === corteH
    return (
      <g key={per ? r.d : r.h}>
        {out}
        {futuro && <rect x={x} y={mt} width={w} height={ih} fill="var(--chip)" opacity={0.35} rx={4} />}
        {atual && <text x={x + w / 2} y={y(r.tot) - 6} textAnchor="middle" fontSize={10.5} fontWeight={600} fill="var(--pri)">agora</text>}
        {i % cadaN === 0 && <text x={ml + i * bw + bw / 2} y={H - 8} textAnchor="middle" fontSize={11} fill={`var(${atual ? '--tx' : '--tx3'})`} fontWeight={atual ? 600 : 400}>{rotulo(r)}</text>}
        <rect
          x={ml + i * bw} y={mt} width={bw} height={ih} fill="transparent"
          onMouseMove={e => setTip({ i, x: e.clientX, y: e.clientY })}
          onMouseLeave={() => setTip(null)}
        />
      </g>
    )
  })
  const media = comMedia && (
    <polyline
      points={HORAS.map((h, i) => `${ml + i * bw + bw / 2},${y(p.media_hora[h] ?? 0)}`).join(' ')}
      fill="none" stroke="var(--tx3)" strokeWidth={2} strokeDasharray="5 4" strokeLinejoin="round" pointerEvents="none"
    />
  )

  const pico = porHora.reduce((a, b) => (b.tot > a.tot ? b : a), porHora[0])
  const tr = tip ? porHora[tip.i] : null
  const ttW = tipRef.current?.offsetWidth ?? 200, ttH = tipRef.current?.offsetHeight ?? 150

  return (
    <>
      <div className="chh">
        <div><h3>Captação por {per ? 'dia' : 'hora'}</h3>{filtrado && <p>Filtrado: {ativos.map(o => o.l).join(', ')}</p>}</div>
        <div className="sp" />
        {pico && pico.tot > 0 && <span className="muted" style={{ fontSize: 12 }}>Pico: <b style={{ color: 'var(--tx)' }}>{per ? dataLabel(pico.d) : `${pico.h}h–${pico.h + 1}h`}</b> · {pico.tot} leads</span>}
      </div>
      <div className="legend">
        {/* só as origens que têm lead no dia (desligadas continuam, pra religar) */}
        {ORIGENS.filter(o => p.leads.some(l => l.grupo === o.k) || origOff.has(o.k) || origSel === o.k).map(o => (
          <span key={o.k} className={origOff.has(o.k) || (origSel && origSel !== o.k) ? 'off' : ''} onClick={() => onLegend(o.k)}>
            <i className="dot" style={{ background: `var(${o.c})` }} />{o.l}
          </span>
        ))}
        {comMedia && <span style={{ cursor: 'default' }}><i className="avg" />Média 7 dias</span>}
      </div>
      <div ref={boxRef}>
        <svg width={W} height={H} style={{ display: 'block' }}>{grid}{bars}{media}</svg>
      </div>
      <div
        ref={tipRef}
        className={`tt ${tr ? 'on' : ''}`}
        style={tip ? { left: Math.min(tip.x + 14, window.innerWidth - ttW - 10), top: tip.y - ttH - 12 } : undefined}
      >
        {tr && (
          <>
            <h5>{per ? dataLabel(tr.d) : `${tr.h}h – ${tr.h + 1}h${live && tr.h === corteH ? ' · em andamento' : ''}`}</h5>
            {live && tr.h > corteH
              ? <div className="r">Ainda não chegou</div>
              : <>
                  {ativos.map(o => <div className="r" key={o.k}><i className="dot" style={{ background: `var(${o.c})` }} />{o.l}<b>{tr[o.k]}</b></div>)}
                  <div className="r t"><span style={{ fontWeight: 600, color: 'var(--tx)' }}>Total</span><b>{tr.tot}</b></div>
                </>}
            {comMedia && <div className="r"><i className="avg" style={{ width: 12, borderTop: '2px dashed var(--tx3)' }} />Média 7 dias<b>{(p.media_hora[tr.h] ?? 0).toLocaleString('pt-BR')}</b></div>}
          </>
        )}
      </div>
    </>
  )
}

/* ---------- origem ---------- */
function Origens({ p, sel, ponto, onSel, onPonto }: { p: Placar; sel: GrupoKey | null; ponto: string | null; onSel: (k: GrupoKey) => void; onPonto: (pt: string) => void }) {
  const all = p.leads, total = all.length
  // origem zerada no dia não aparece (fica só a selecionada, pra dar pra limpar o filtro)
  const rows = ORIGENS.map(o => ({ ...o, n: all.filter(l => l.grupo === o.k).length })).filter(o => o.n > 0 || o.k === sel).sort((a, b) => b.n - a.n)
  const max = Math.max(1, ...rows.map(r => r.n))
  const pago = all.filter(l => l.grupo === 'meta' || l.grupo === 'google').length
  return (
    <>
      <div style={{ marginTop: 6 }}>
        {rows.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--tx3)', padding: '8px 0' }}>Nenhum lead captado ainda.</div>}
        {rows.map(r => {
          const d = r.n - p.anterior.filter(a => a.grupo === r.k && a.m < p.corte_min).length
          // "Outros" sempre diz quais origens estão dentro dele (ex: Listagem 2 · Robô 1)
          const detalhe = r.k === 'outros' && r.n > 0
            ? Object.entries(all.filter(l => l.grupo === 'outros').reduce<Record<string, number>>((acc, l) => {
                const nome = (l.origem || '').trim() || 'Sem origem'
                acc[nome] = (acc[nome] || 0) + 1
                return acc
              }, {})).sort((a, b) => b[1] - a[1]).map(([nome, n]) => `${nome} ${n}`).join(' · ')
            : ''
          // Meta Ads: um formulário por sub-linha (só quando tem mais de um no dia)
          const pontos = r.k === 'meta'
            ? Object.entries(all.filter(l => l.grupo === 'meta').reduce<Record<string, number>>((acc, l) => {
                const nm = nomePonto(l.ponto)
                acc[nm] = (acc[nm] || 0) + 1
                return acc
              }, {})).sort((a, b) => b[1] - a[1])
            : []
          return (
            <div key={r.k}>
              <div
                className={`orow ${sel === r.k ? 'sel' : ''}`} onClick={() => onSel(r.k)}
                title={`${d >= 0 ? '+' : ''}${d} vs ${p.periodo ? 'período anterior' : p.hoje ? 'ontem no mesmo horário' : 'dia anterior'}`}
                style={sel && sel !== r.k ? { opacity: 0.45 } : undefined}
              >
                <span className="nm"><i className="dot" style={{ background: `var(${r.c})` }} />{r.l}</span>
                <span className="track"><i style={{ width: `${r.n / max * 100}%`, background: `var(${r.c})` }} /></span>
                <span className="n">{r.n}</span><span className="pct">{pct(r.n, total)}%</span>
              </div>
              {pontos.length > 1 && (
                <div className="osubs" style={sel && sel !== r.k ? { opacity: 0.45 } : undefined}>
                  {pontos.map(([nm, n]) => (
                    <div key={nm} className={`orow osub ${ponto === nm ? 'sel' : ''}`} onClick={() => onPonto(nm)} title={`${nm}: ${n} de ${r.n} do Meta Ads`}
                      style={ponto && ponto !== nm ? { opacity: 0.5 } : undefined}>
                      <span className="nm">{nm}</span>
                      <span className="track"><i style={{ width: `${n / max * 100}%` }} /></span>
                      <span className="n">{n}</span><span className="pct" />
                    </div>
                  ))}
                </div>
              )}
              {detalhe && (
                <div style={{ fontSize: 11.5, color: 'var(--tx3)', padding: '0 0 6px 18px', marginTop: -2 }}>{detalhe}</div>
              )}
            </div>
          )
        })}
      </div>
      <div className="ofoot">
        <span>Mídia paga (Meta + Google): <b>{pago}</b> · {pct(pago, total)}%</span>
        <span>{sel ? <button className="link" onClick={() => onSel(sel)}>Limpar filtro</button> : <>Total: <b>{total}</b></>}</span>
      </div>
    </>
  )
}

/* ---------- status ---------- */
function Status({ leads, quando }: { leads: PlacarLead[]; quando: string }) {
  const total = leads.length
  const linhas = STATUS.map(s => ({ ...s, n: leads.filter(l => l.status === s.k).length })).filter(s => s.n > 0)
  const max = Math.max(1, ...linhas.map(s => s.n))
  const contato = leads.filter(l => l.contatado).length
  const avanc = leads.filter(l => ['agend', 'prop', 'pendc', 'emis', 'fech'].includes(l.status)).length
  const fech = leads.filter(l => l.status === 'fech').length
  return (
    <>
      <div className="chh"><div><h3>Status dos leads captados</h3><p>{total} lead{total !== 1 ? 's' : ''} captado{total !== 1 ? 's' : ''} {quando}, pela situação atual</p></div></div>
      <div style={{ marginTop: 6 }}>
        {!linhas.length && <div className="empty">Nenhum lead captado {quando}.</div>}
        {linhas.map(s => (
          <div className="strow" key={s.k}>
            <span><span className="badge" style={badgeStyle(s.c)}><i className="dot" style={{ width: 6, height: 6, background: `var(${s.c})` }} />{s.l}</span></span>
            <span className="track"><i style={{ width: `${s.n / max * 100}%` }} /></span>
            <span className="n">{s.n}</span>
          </div>
        ))}
      </div>
      <div className="funnel">
        <div><small>Contatados</small><b>{contato}</b><span>{pct(contato, total)}%</span></div>
        <div><small>Em negociação</small><b>{avanc}</b><span>{pct(avanc, total)}%</span></div>
        <div><small>Fechados</small><b>{fech}</b><span>{pct(fech, total)}%</span></div>
      </div>
    </>
  )
}

/* ---------- últimos leads ---------- */
function Feed({ leads, flashId, onOpen, periodo }: { leads: PlacarLead[]; flashId: string | null; onOpen: (l: PlacarLead) => void; periodo: boolean }) {
  if (!leads.length) return <div className="empty">Nenhum lead nesse filtro.</div>
  return (
    <table>
      <colgroup><col style={{ width: periodo ? 104 : 66 }} /><col /><col style={{ width: '23%' }} /><col style={{ width: 128 }} /><col style={{ width: '19%' }} /></colgroup>
      <thead><tr><th>Hora</th><th>Lead</th><th>Origem</th><th>Status</th><th>Atendente</th></tr></thead>
      <tbody>
        {leads.map(l => {
          const o = ORIGENS.find(x => x.k === l.grupo)!
          const s = STATUS.find(x => x.k === l.status) ?? STATUS[STATUS.length - 1]
          return (
            <tr key={l.id} className={flashId === l.id ? 'new' : ''} onClick={() => onOpen(l)}>
              <td style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--tx2)' }}>{periodo && <>{ddmm(l.d)} </>}{pad(l.h)}:{pad(l.min)}</td>
              <td className="nm" title={l.nome}><b className="cut">{l.nome}</b><span className="cut">{l.telefone ?? '—'}</span></td>
              <td><span className="cut" style={{ color: 'var(--tx2)' }}><i className="dot" style={{ background: `var(${o.c})`, marginRight: 7 }} />{o.l}</span></td>
              <td>
                <span className="badge" style={badgeStyle(s.c)}>{s.l}</span>
                {l.espera_min != null && l.espera_min > 15 && <div className="wait">esperando {fmtEspera(l.espera_min)}</div>}
              </td>
              <td style={{ color: 'var(--tx2)' }} title={l.atendente ?? undefined}>
                {l.atendente
                  ? <span className="cut"><span className="av" style={{ background: personColor(l.atendente) }}>{l.atendente.trim()[0]?.toUpperCase()}</span>{l.atendente}</span>
                  : <span className="muted">—</span>}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
