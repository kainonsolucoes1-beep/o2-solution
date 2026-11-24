import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Pencil, Plus, X } from 'lucide-react'
import api from '../api'
import { useTheme } from '../ThemeContext'
import SinoSlot, { VerComoSlot } from '../components/SinoSlot'

type Tipo = 'clt' | 'estagiario'
interface MetaProgress {
  id: string
  nome: string
  tipo: Tipo
  meta_valor: number
  leads: number
  vendas: number
  atingido: number
  pct: number
  projecao: number | null
}
interface MetasResponse { mes_label: string; ano_mes: string; metas: MetaProgress[] }
interface HistItem { ano_mes: string; tipo: Tipo; meta_valor: number }

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

function fmtNum(v: number) {
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
}
function fmtBrl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtValor(tipo: Tipo, v: number) {
  return tipo === 'clt' ? fmtBrl(v) : `${fmtNum(v)} leads`
}
// aceita "5000.5" (valor vindo da API) e "5.000,50" (digitado em pt-BR)
function parseValor(s: string) {
  return Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s)
}
function initials(nome: string) {
  return nome.trim().slice(0, 2).toUpperCase()
}

// ── dias úteis (feriados nacionais fixos + móveis a partir da Páscoa) ──
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
function easterSunday(year: number): Date {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}
function brHolidays(year: number): Set<string> {
  const easter = easterSunday(year)
  const shift = (n: number) => { const x = new Date(easter); x.setDate(x.getDate() + n); return iso(x) }
  return new Set([
    `${year}-01-01`, `${year}-04-21`, `${year}-05-01`, `${year}-09-07`,
    `${year}-10-12`, `${year}-11-02`, `${year}-11-15`, `${year}-11-20`, `${year}-12-25`,
    shift(-48), shift(-47), shift(-2), shift(60),
  ])
}
function diasUteis(ano: number, mes0: number, hoje: Date) {
  const hol = brHolidays(ano)
  const last = new Date(ano, mes0 + 1, 0).getDate()
  const hojeIso = iso(hoje)
  let total = 0, ate = 0
  for (let d = 1; d <= last; d++) {
    const dt = new Date(ano, mes0, d)
    const dow = dt.getDay()
    if (dow === 0 || dow === 6 || hol.has(iso(dt))) continue
    total++
    if (iso(dt) <= hojeIso) ate++
  }
  // ate = dias úteis até hoje (inclusive); restantes conta hoje se for útil
  const hojeUtil = hoje.getFullYear() === ano && hoje.getMonth() === mes0 && ![0, 6].includes(hoje.getDay()) && !hol.has(hojeIso)
  return { total, ate, restantes: total - ate + (hojeUtil ? 1 : 0) }
}

function anoMesAtual() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function shiftAnoMes(am: string, n: number) {
  const d = new Date(Number(am.slice(0, 4)), Number(am.slice(5, 7)) - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function labelAnoMes(am: string, longo = false) {
  const m = Number(am.slice(5, 7)) - 1
  return `${longo ? MESES[m] : MESES_ABREV[m]} ${am.slice(0, 4)}`
}

type Status = 'batida' | 'ritmo' | 'atras'

export default function FinanceiroMetas() {
  const { dark } = useTheme()
  const C = {
    accent: dark ? '#60A5FA' : '#2563EB',
    ok: dark ? '#34D399' : '#047857',
    warn: dark ? '#FBBF24' : '#B45309',
    accentBg: dark ? 'rgba(96,165,250,0.14)' : '#EFF4FE',
    okBg: dark ? 'rgba(52,211,153,0.14)' : '#E3F5EE',
    warnBg: dark ? 'rgba(251,191,36,0.14)' : '#FDF1E3',
    pace: dark ? '#F1F5F9' : '#111827',
    estFg: dark ? '#C4B5FD' : '#6D28D9',
    estBg: dark ? 'rgba(167,139,250,0.16)' : '#F1EAFE',
  }

  const [anoMes, setAnoMes] = useState(anoMesAtual())
  const [data, setData] = useState<MetasResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const [tab, setTab] = useState<'todos' | Tipo>('todos')
  const [openId, setOpenId] = useState<string | null>(null)
  const [editing, setEditing] = useState<MetaProgress | 'new' | null>(null)
  const [form, setForm] = useState({ nome: '', tipo: 'clt' as Tipo, meta_valor: '', vigente_desde: anoMesAtual() })
  const [hist, setHist] = useState<HistItem[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const ano = Number(anoMes.slice(0, 4)), mes0 = Number(anoMes.slice(5, 7)) - 1
  const isAtual = anoMes === anoMesAtual()
  const du = diasUteis(ano, mes0, new Date())
  const paceFrac = isAtual && du.total ? du.ate / du.total : 1

  const fetchGenRef = useRef(0)
  function fetchMetas() {
    const gen = ++fetchGenRef.current
    const params = { date_from: `${anoMes}-01`, date_to: iso(new Date(ano, mes0 + 1, 0)) }
    setLoading(true)
    setError(false)
    api.get<MetasResponse>('/api/v1/financeiro/metas', { params })
      .then(r => { if (fetchGenRef.current === gen) setData(r.data) })
      .catch(() => { if (fetchGenRef.current === gen) setError(true) })
      .finally(() => { if (fetchGenRef.current === gen) setLoading(false) })
  }
  useEffect(fetchMetas, [anoMes])

  const metas = data?.metas ?? []
  const status = (m: MetaProgress): Status =>
    m.pct >= 100 ? 'batida' : (isAtual && m.pct >= paceFrac * 100 * 0.95 ? 'ritmo' : 'atras')
  const stColor = (s: Status) => s === 'batida' ? C.ok : s === 'ritmo' ? C.accent : C.warn
  const stBg = (s: Status) => s === 'batida' ? C.okBg : s === 'ritmo' ? C.accentBg : C.warnBg
  const stLabel = (s: Status) => s === 'batida' ? 'Batida' : s === 'ritmo' ? 'No ritmo' : (isAtual ? 'Atrás' : 'Não batida')
  const need = (m: MetaProgress) => {
    if (!isAtual || m.atingido >= m.meta_valor || du.restantes <= 0) return '—'
    const v = (m.meta_valor - m.atingido) / du.restantes
    return m.tipo === 'clt' ? fmtBrl(v) : `${fmtNum(Math.ceil(v))} leads`
  }
  const teamAvg = metas.length ? metas.reduce((s, m) => s + m.pct, 0) / metas.length : 0

  const clt = metas.filter(m => m.tipo === 'clt')
  const est = metas.filter(m => m.tipo === 'estagiario')
  const sum = (arr: MetaProgress[], f: (m: MetaProgress) => number) => arr.reduce((s, m) => s + f(m), 0)
  const cltReal = sum(clt, m => m.atingido), cltMeta = sum(clt, m => m.meta_valor), cltProj = sum(clt, m => m.projecao ?? m.atingido)
  const estReal = sum(est, m => m.atingido), estMeta = sum(est, m => m.meta_valor), estProj = sum(est, m => m.projecao ?? m.atingido)
  const pctOf = (a: number, b: number) => b > 0 ? Math.round(a / b * 100) : 0
  const noRitmo = metas.filter(m => status(m) !== 'atras').length

  const rows = metas
    .filter(m => tab === 'todos' || m.tipo === tab)
    .sort((a, b) => b.pct - a.pct)

  function openCreate() {
    setForm({ nome: '', tipo: 'clt', meta_valor: '', vigente_desde: anoMesAtual() })
    setFormError('')
    setHist(null)
    setEditing('new')
  }
  function openEdit(m: MetaProgress) {
    // abre no mes que esta' na tela -- o valor mostrado e' o vigente nele
    setForm({ nome: m.nome, tipo: m.tipo, meta_valor: String(m.meta_valor), vigente_desde: data?.ano_mes ?? anoMesAtual() })
    setFormError('')
    setHist(null)
    setEditing(m)
    api.get<HistItem[]>(`/api/v1/financeiro/metas/${m.id}/historico`).then(r => setHist(r.data)).catch(() => setHist([]))
  }
  function closeEdit() { setEditing(null) }

  function handleSave() {
    const nome = form.nome.trim()
    const metaValor = parseValor(form.meta_valor)
    if (!nome) { setFormError('Informe o nome do operador'); return }
    if (!metaValor || metaValor <= 0) { setFormError('Informe uma meta maior que zero'); return }
    if (!form.vigente_desde) { setFormError('Informe a partir de qual mês a meta vale'); return }

    setSaving(true)
    setFormError('')
    const body = { nome, tipo: form.tipo, meta_valor: metaValor, vigente_desde: form.vigente_desde }
    const req = editing === 'new'
      ? api.post<MetaProgress>('/api/v1/financeiro/metas', body)
      : api.put<MetaProgress>(`/api/v1/financeiro/metas/${(editing as MetaProgress).id}`, body)
    req
      .then(() => { closeEdit(); fetchMetas() })
      .catch(err => setFormError(err.response?.data?.detail || 'Erro ao salvar meta'))
      .finally(() => setSaving(false))
  }

  const card: CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14 }
  const ctrlBtn: CSSProperties = { height: 38, display: 'inline-flex', alignItems: 'center', gap: 7, borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }
  const GRID = '220px minmax(220px, 1fr) 170px 140px 140px 120px 44px'
  const tabs: [typeof tab, string, number][] = [['todos', 'Todos', metas.length], ['clt', 'CLT', clt.length], ['estagiario', 'Estagiários', est.length]]

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1240, margin: '0 auto', background: dark ? 'transparent' : '#EEF1F5', minHeight: '100%' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-1)', margin: 0, letterSpacing: '-0.02em' }}>Metas Mensais</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>
            {labelAnoMes(anoMes, true)}{isAtual ? ` · dia útil ${du.ate} de ${du.total}` : ` · ${du.total} dias úteis`}
          </p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <div style={{ ...card, display: 'flex', alignItems: 'center', height: 38, borderRadius: 10 }}>
            <button aria-label="Mês anterior" onClick={() => setAnoMes(a => shiftAnoMes(a, -1))}
              style={{ width: 36, height: 36, border: 0, background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ChevronLeft size={16} />
            </button>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', minWidth: 66, textAlign: 'center' }}>{labelAnoMes(anoMes)}</span>
            <button aria-label="Próximo mês" disabled={isAtual} onClick={() => setAnoMes(a => shiftAnoMes(a, 1))}
              style={{ width: 36, height: 36, border: 0, background: 'transparent', color: 'var(--text-muted)', cursor: isAtual ? 'not-allowed' : 'pointer', opacity: isAtual ? 0.35 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ChevronRight size={16} />
            </button>
          </div>
          <VerComoSlot />
          <button onClick={openCreate} style={{ ...ctrlBtn, padding: '0 14px', border: 'none', background: C.accent, color: dark ? '#0F172A' : '#fff' }}>
            <Plus size={15} />
            Nova meta
          </button>
          <SinoSlot />
        </div>
      </div>

      {loading && !data ? (
        <p style={{ fontSize: 13, color: 'var(--text-subtle)' }}>Carregando…</p>
      ) : error ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-2)' }}>
          Não foi possível carregar as metas.
          <button onClick={fetchMetas} style={{ color: C.accent, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: 0 }}>Tentar novamente</button>
        </div>
      ) : metas.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text-subtle)' }}>Nenhum operador com meta cadastrada ainda.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, opacity: loading ? 0.6 : 1, transition: 'opacity 150ms' }}>
          <div style={{ ...card, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', overflow: 'hidden' }}>
            <Kpi label="Vendas da equipe (CLT)" value={fmtBrl(cltReal)}
              sub={<>de {fmtBrl(cltMeta)} · <b style={{ color: 'var(--text-1)' }}>{pctOf(cltReal, cltMeta)}%</b></>} />
            {isAtual ? (
              <Kpi label="Projeção de fechamento" value={fmtBrl(cltProj)}
                sub={<span style={{ fontWeight: 600, color: cltProj >= cltMeta ? C.ok : C.warn }}>
                  {pctOf(cltProj, cltMeta)}% da meta{cltProj < cltMeta ? ` · faltam ${fmtBrl(cltMeta - cltProj)}` : ''}
                </span>} />
            ) : (
              <Kpi label="Vendas fechadas (CLT)" value={fmtNum(sum(clt, m => m.vendas))}
                sub={<>ticket médio <b style={{ color: 'var(--text-1)' }}>{fmtBrl(sum(clt, m => m.vendas) ? cltReal / sum(clt, m => m.vendas) : 0)}</b></>} />
            )}
            <Kpi label="Captação (estagiários)" value={`${fmtNum(estReal)} leads`}
              sub={<>de {fmtNum(estMeta)}{isAtual ? <> · projeção <b style={{ color: 'var(--text-1)' }}>{fmtNum(estProj)}</b></> : <> · <b style={{ color: 'var(--text-1)' }}>{pctOf(estReal, estMeta)}%</b></>}</>} />
            <Kpi label={isAtual ? 'No ritmo da meta' : 'Metas batidas'} value={`${isAtual ? noRitmo : metas.filter(m => m.pct >= 100).length} de ${metas.length}`} last
              sub={isAtual ? <>ritmo esperado hoje: <b style={{ color: 'var(--text-1)' }}>{Math.round(paceFrac * 100)}%</b></> : <>média da equipe <b style={{ color: 'var(--text-1)' }}>{Math.round(teamAvg)}%</b></>} />
          </div>

          <div style={{ ...card, overflow: 'hidden' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 16px', borderBottom: '1px solid var(--border-lt)' }}>
              <div style={{ display: 'flex', gap: 2, background: 'var(--bg-subtle)', border: '1px solid var(--border-lt)', padding: 3, borderRadius: 10 }}>
                {tabs.map(([k, label, n]) => {
                  const on = tab === k
                  return (
                    <button key={k} onClick={() => setTab(k)}
                      style={{ border: 0, height: 30, padding: '0 12px', borderRadius: 7, fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', background: on ? 'var(--bg-card)' : 'transparent', color: on ? 'var(--text-1)' : 'var(--text-muted)', boxShadow: on ? '0 1px 2px rgba(16,24,40,0.10)' : 'none' }}>
                      {label} · {n}
                    </button>
                  )
                })}
              </div>
              {isAtual && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)' }}>
                  <span style={{ width: 2, height: 12, background: C.pace }} />onde deveria estar hoje
                </span>
              )}
            </div>

            <div style={{ overflowX: 'auto' }}>
              <div style={{ minWidth: 900 }}>
                <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 16, padding: '10px 16px', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)', background: 'var(--bg-subtle)' }}>
                  <span>Operador</span><span>Progresso</span><span style={{ textAlign: 'right' }}>Realizado / meta</span>
                  <span style={{ textAlign: 'right' }}>Projeção</span><span style={{ textAlign: 'right' }}>Precisa / dia útil</span><span>Status</span><span />
                </div>
                {rows.map(m => {
                  const st = status(m), col = stColor(st)
                  const projPct = m.projecao != null && m.meta_valor > 0 ? Math.round(m.projecao / m.meta_valor * 100) : null
                  const open = openId === m.id
                  const diff = Math.round(m.pct - teamAvg)
                  return (
                    <div key={m.id} style={{ borderTop: '1px solid var(--border-lt)' }}>
                      <div className="metas-row" style={{ display: 'grid', gridTemplateColumns: GRID, gap: 16, alignItems: 'center', padding: '14px 16px' }}>
                        <button onClick={() => setOpenId(open ? null : m.id)} aria-expanded={open}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, border: 0, background: 'transparent', padding: 0, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text-1)' }}>
                          <span style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, background: m.tipo === 'clt' ? C.accentBg : C.estBg, color: m.tipo === 'clt' ? C.accent : C.estFg }}>
                            {initials(m.nome)}
                          </span>
                          <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span style={{ fontSize: 14, fontWeight: 600 }}>{m.nome}</span>
                            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{m.tipo === 'clt' ? 'CLT · vendas' : 'Estagiário · captação'}</span>
                          </span>
                        </button>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ position: 'relative', flex: 1, height: 8, borderRadius: 99, background: 'var(--bg-subtle)' }}>
                            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.min(100, m.pct)}%`, borderRadius: 99, background: col }} />
                            {projPct != null && projPct > m.pct && (
                              <div title={`Projeção: ${projPct}%`} style={{ position: 'absolute', left: `${Math.min(100, projPct)}%`, top: -1, width: 6, height: 10, marginLeft: -3, borderRadius: 3, border: `1.5px dashed ${col}`, boxSizing: 'border-box', opacity: 0.8 }} />
                            )}
                            {isAtual && (
                              <div style={{ position: 'absolute', left: `${paceFrac * 100}%`, top: -5, bottom: -5, width: 2, background: C.pace }} />
                            )}
                          </div>
                          <span style={{ width: 42, textAlign: 'right', fontSize: 14, fontWeight: 700, color: col }}>{Math.round(m.pct)}%</span>
                        </div>
                        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>{fmtValor(m.tipo, m.atingido)}</span>
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>de {fmtValor(m.tipo, m.meta_valor)}</span>
                        </div>
                        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {m.projecao != null ? (
                            <>
                              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>{fmtValor(m.tipo, m.projecao)}</span>
                              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{projPct}% da meta</span>
                            </>
                          ) : <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>—</span>}
                        </div>
                        <span style={{ textAlign: 'right', fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>{need(m)}</span>
                        <span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 24, padding: '0 10px', borderRadius: 99, fontSize: 12, fontWeight: 600, background: stBg(st), color: col }}>
                            <span style={{ width: 6, height: 6, borderRadius: 99, background: col }} />{stLabel(st)}
                          </span>
                        </span>
                        <button onClick={() => openEdit(m)} aria-label="Editar meta" title="Editar meta"
                          style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Pencil size={14} />
                        </button>
                      </div>
                      {open && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, padding: '4px 16px 18px 60px' }}>
                          <Mini label="Leads captados" value={fmtNum(m.leads)} />
                          <Mini label="Vendas" value={fmtNum(m.vendas)} />
                          {m.tipo === 'clt'
                            ? <Mini label="Ticket médio" value={m.vendas ? fmtBrl(m.atingido / m.vendas) : '—'} />
                            : <Mini label="Leads por dia útil" value={(du.ate || du.total) ? (m.leads / (isAtual ? Math.max(1, du.ate) : du.total)).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '—'} />}
                          <Mini label="Vs. média da equipe" value={`${diff > 0 ? '+' : diff < 0 ? '−' : ''}${Math.abs(diff)} p.p.`} color={col} />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div onClick={closeEdit} style={{ position: 'fixed', inset: 0, background: 'rgba(8,12,20,0.45)', display: 'flex', justifyContent: 'flex-end', zIndex: 50 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 400, maxWidth: '100%', height: '100%', background: 'var(--bg-card)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', boxShadow: '-12px 0 40px rgba(0,0,0,0.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', borderBottom: '1px solid var(--border-lt)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)' }}>{editing === 'new' ? 'Nova meta' : `Editar meta · ${editing.nome}`}</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {editing === 'new' ? labelAnoMes(anoMesAtual(), true) : `${editing.tipo === 'clt' ? 'CLT' : 'Estagiário'} · realizado ${fmtValor(editing.tipo, editing.atingido)}`}
                </span>
              </div>
              <button onClick={closeEdit} aria-label="Fechar" style={{ width: 34, height: 34, border: 0, borderRadius: 8, background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
              <label style={labelStyle}>Nome
                <input type="text" placeholder="Nome do operador" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} style={inputStyle} />
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={labelStyle}>Tipo de meta</span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                  {([['clt', 'CLT', 'Meta em vendas (R$)'], ['estagiario', 'Estagiário', 'Meta em leads captados']] as [Tipo, string, string][]).map(([k, t, d]) => {
                    const on = form.tipo === k
                    return (
                      <button key={k} onClick={() => setForm(f => ({ ...f, tipo: k }))} aria-pressed={on}
                        style={{ textAlign: 'left', padding: 12, borderRadius: 10, border: `1.5px solid ${on ? C.accent : 'var(--border)'}`, background: on ? C.accentBg : 'var(--bg-card)', color: 'var(--text-1)', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <span style={{ fontSize: 13, fontWeight: 700 }}>{t}</span>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{d}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
              <label style={labelStyle}>{form.tipo === 'clt' ? 'Meta mensal (R$)' : 'Meta mensal (leads)'}
                <input type="text" inputMode="decimal" placeholder={form.tipo === 'clt' ? '6000' : '200'} value={form.meta_valor}
                  onChange={e => setForm(f => ({ ...f, meta_valor: e.target.value }))} style={{ ...inputStyle, fontWeight: 600 }} />
              </label>
              <label style={labelStyle}>Vale a partir de
                <input type="month" max={anoMesAtual()} value={form.vigente_desde} onChange={e => setForm(f => ({ ...f, vigente_desde: e.target.value }))} style={inputStyle} />
              </label>
              {editing !== 'new' && isAtual && du.restantes > 0 && (() => {
                const mv = parseValor(form.meta_valor) || 0
                const falta = Math.max(0, mv - editing.atingido)
                return (
                  <div style={{ background: C.accentBg, borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: C.accent }}>Com essa meta</span>
                    <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
                      {falta <= 0 ? 'Meta já atingida no mês.'
                        : `Faltam ${form.tipo === 'clt' ? fmtBrl(falta / du.restantes) : `${fmtNum(Math.ceil(falta / du.restantes))} leads`} por dia útil nos ${du.restantes} dias úteis restantes.`}
                    </span>
                  </div>
                )
              })()}
              {editing !== 'new' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={labelStyle}>Histórico</span>
                  {hist === null ? (
                    <span style={{ fontSize: 13, color: 'var(--text-subtle)', padding: '8px 0' }}>Carregando…</span>
                  ) : hist.length === 0 ? (
                    <span style={{ fontSize: 13, color: 'var(--text-subtle)', padding: '8px 0' }}>Sem alterações registradas.</span>
                  ) : hist.map(h => (
                    <div key={h.ano_mes} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '8px 0', borderBottom: '1px solid var(--border-lt)' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Desde {labelAnoMes(h.ano_mes)}</span>
                      <span style={{ fontWeight: 600, color: 'var(--text-1)' }}>{fmtValor(h.tipo, h.meta_valor)}</span>
                    </div>
                  ))}
                </div>
              )}
              {formError && <p style={{ fontSize: 13, color: 'var(--danger)', margin: 0 }}>{formError}</p>}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '16px 20px', borderTop: '1px solid var(--border-lt)' }}>
              <button onClick={closeEdit} style={{ ...ctrlBtn, padding: '0 14px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-2)' }}>Cancelar</button>
              <button onClick={handleSave} disabled={saving} style={{ ...ctrlBtn, padding: '0 16px', border: 0, background: C.accent, color: dark ? '#0F172A' : '#fff', opacity: saving ? 0.6 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}>
                {saving ? 'Salvando…' : 'Salvar meta'}
              </button>
            </div>
          </div>
        </div>
      )}
      <style>{'.metas-row:hover{background:var(--bg-hover)}'}</style>
    </div>
  )
}

const inputStyle: CSSProperties = {
  height: 40, padding: '0 12px', borderRadius: 10, border: '1px solid var(--border-in)', fontSize: 14,
  color: 'var(--text-1)', background: 'var(--bg-input)', outline: 'none', fontFamily: 'inherit',
}
const labelStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-3b)' }

function Kpi({ label, value, sub, last }: { label: string; value: string; sub: ReactNode; last?: boolean }) {
  return (
    <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 6, borderRight: last ? 'none' : '1px solid var(--border-lt)' }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-1)' }}>{value}</span>
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{sub}</span>
    </div>
  )
}

function Mini({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-lt)', borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: 18, fontWeight: 700, color: color ?? 'var(--text-1)' }}>{value}</span>
    </div>
  )
}
