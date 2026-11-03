import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Check, Lock, CircleDot } from 'lucide-react'
import api from '../api'
import { useTheme } from '../ThemeContext'
import SinoSlot, { VerComoSlot } from '../components/SinoSlot'
import { GoogleLogo, MetaLogo } from '../components/BrandLogos'

type Plataforma = 'google' | 'meta'
interface Resumo {
  gasto: number; leads: number; vendas: number; valor_vendas: number
  cpl: number | null; custo_venda: number | null; retorno: number | null; conversao: number | null
}
interface Semana {
  numero: number; inicio: string; fim: string; label: string
  situacao: 'fechada' | 'atual' | 'futura'
  plataformas: Record<Plataforma, Resumo & { lancado: boolean }>
}
interface TrafegoData {
  mes: string; mes_label: string; status: 'aberto' | 'fechado'
  semanas: Semana[]
  plataformas: Record<Plataforma, Resumo>
  total: Resumo
  historico: { mes: string; label: string; plataformas: Record<Plataforma, Resumo> }[]
}

const PLATS: { id: Plataforma; nome: string; Logo: typeof GoogleLogo; cor: string }[] = [
  { id: 'google', nome: 'Google Ads', Logo: GoogleLogo, cor: '#34A853' },
  { id: 'meta',   nome: 'Meta Ads',   Logo: MetaLogo,   cor: '#0081FB' },
]

function fmtBrl(v: number | null | undefined, dec = 2) {
  if (v == null) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: dec, maximumFractionDigits: dec })
}
function fmtNum(v: number) { return v.toLocaleString('pt-BR') }
function fmtRetorno(v: number | null) { return v == null ? '—' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}x` }
function mesIso(d = new Date()) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
function shiftMes(mes: string, dir: number) {
  const [y, m] = mes.split('-').map(Number)
  return mesIso(new Date(y, m - 1 + dir, 1))
}
// aceita "1.234,56", "1234,56", "1234.56", "R$ 1.234"
function parseValor(txt: string): number | null | 'erro' {
  const t = txt.replace(/R\$|\s/g, '')
  if (!t) return null
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t)
  return Number.isFinite(n) && n >= 0 ? n : 'erro'
}
function valorInput(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const card: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16 }
const eyebrow: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-subtle)' }

export default function FinanceiroTrafego() {
  const { dark } = useTheme()
  const [mes, setMes] = useState(mesIso())
  const [data, setData] = useState<TrafegoData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const genRef = useRef(0)

  function fetchData(silencioso = false) {
    const gen = ++genRef.current
    if (!silencioso) { setLoading(true); setError(false) }
    api.get<TrafegoData>('/api/v1/financeiro/trafego', { params: { mes } })
      .then(r => { if (genRef.current === gen) setData(r.data) })
      .catch(() => { if (genRef.current === gen && !silencioso) setError(true) })
      .finally(() => { if (genRef.current === gen) setLoading(false) })
  }
  useEffect(() => fetchData(), [mes])

  const podeAvancar = mes < mesIso()
  const fechado = data?.status === 'fechado'

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1200, margin: '0 auto', background: dark ? 'transparent' : '#EEF1F5', minHeight: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 22, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-2)', margin: 0 }}>Tráfego pago</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            Investimento em Google Ads e Meta Ads por semana, cruzado com os leads e as vendas de cada plataforma
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <VerComoSlot />
          <div style={{ ...card, borderRadius: 10, display: 'flex', alignItems: 'center', height: 40 }}>
            <button onClick={() => setMes(m => shiftMes(m, -1))} aria-label="Mês anterior" style={navBtn}><ChevronLeft size={16} /></button>
            <span style={{ minWidth: 132, textAlign: 'center', fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{data?.mes === mes ? data.mes_label : '…'}</span>
            <button onClick={() => podeAvancar && setMes(m => shiftMes(m, 1))} disabled={!podeAvancar} aria-label="Próximo mês" style={{ ...navBtn, opacity: podeAvancar ? 1 : 0.35, cursor: podeAvancar ? 'pointer' : 'default' }}><ChevronRight size={16} /></button>
          </div>
          {data && data.mes === mes && <StatusBadge fechado={fechado} />}
          <SinoSlot />
        </div>
      </div>

      {loading && !data ? (
        <p style={{ fontSize: 13, color: 'var(--text-subtle)' }}>Carregando…</p>
      ) : error ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-2)' }}>
          Não foi possível carregar o tráfego pago.
          <button onClick={() => fetchData()} style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: 0 }}>Tentar novamente</button>
        </div>
      ) : data ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, opacity: loading ? 0.6 : 1, transition: 'opacity 150ms' }}>
          <TotalStrip total={data.total} fechado={fechado} />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 18 }}>
            {PLATS.map(p => (
              <PlataformaCard key={p.id} plat={p} r={data.plataformas[p.id]} totalGasto={data.total.gasto} semanas={data.semanas} />
            ))}
          </div>

          <SemanasTabela data={data} onSalvo={() => fetchData(true)} />

          {data.historico.length > 1 && <Historico data={data} />}
        </div>
      ) : null}
    </div>
  )
}

const navBtn: React.CSSProperties = { width: 34, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }

function StatusBadge({ fechado }: { fechado: boolean }) {
  return (
    <span title={fechado ? 'Mês encerrado: valores consolidados' : 'Mês em andamento: lance o gasto de cada semana'} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 11px', borderRadius: 99, fontSize: 12, fontWeight: 700,
      background: fechado ? 'var(--bg-subtle)' : 'var(--success-weak)', color: fechado ? 'var(--text-muted)' : 'var(--success)',
      border: `1px solid ${fechado ? 'var(--border)' : 'color-mix(in srgb, var(--success) 30%, transparent)'}`,
    }}>
      {fechado ? <Lock size={12} /> : <CircleDot size={12} />}
      {fechado ? 'Mês fechado' : 'Mês aberto'}
    </span>
  )
}

function TotalStrip({ total, fechado }: { total: Resumo; fechado: boolean }) {
  const itens: { label: string; valor: string; dica?: string }[] = [
    { label: 'Investimento total', valor: fmtBrl(total.gasto) },
    { label: 'Leads captados', valor: fmtNum(total.leads) },
    { label: 'Custo por lead', valor: fmtBrl(total.cpl) },
    { label: 'Vendas', valor: fmtNum(total.vendas), dica: total.conversao != null ? `${total.conversao.toLocaleString('pt-BR')}% dos leads` : undefined },
    { label: 'Custo por venda', valor: fmtBrl(total.custo_venda) },
    { label: 'Retorno', valor: fmtRetorno(total.retorno), dica: 'valor vendido ÷ investido' },
  ]
  return (
    <div style={{ ...card, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', overflow: 'hidden' }}>
      {itens.map((it, i) => (
        <div key={it.label} style={{ padding: '16px 18px', borderLeft: i ? '1px solid var(--border-lt)' : 'none' }}>
          <span style={eyebrow}>{it.label}</span>
          <span style={{ display: 'block', fontSize: 21, fontWeight: 800, color: 'var(--text-1)', marginTop: 6 }}>{it.valor}</span>
          <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2, minHeight: 16 }}>
            {it.dica ?? (i === 0 ? (fechado ? 'mês consolidado' : 'até agora') : '')}
          </span>
        </div>
      ))}
    </div>
  )
}

function PlataformaCard({ plat, r, totalGasto, semanas }: { plat: typeof PLATS[number]; r: Resumo; totalGasto: number; semanas: Semana[] }) {
  const share = totalGasto > 0 ? Math.round(r.gasto / totalGasto * 100) : 0
  const maxSem = Math.max(1, ...semanas.map(s => s.plataformas[plat.id].gasto))
  return (
    <div style={{ ...card, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: '#fff', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <plat.Logo size={26} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 15.5, fontWeight: 800, color: 'var(--text-1)' }}>{plat.nome}</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{totalGasto > 0 ? `${share}% do investimento do mês` : 'sem investimento lançado'}</span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span style={eyebrow}>Investido</span>
          <span style={{ display: 'block', fontSize: 20, fontWeight: 800, color: 'var(--text-1)' }}>{fmtBrl(r.gasto)}</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        <Mini label="Leads" valor={fmtNum(r.leads)} />
        <Mini label="Custo por lead" valor={fmtBrl(r.cpl)} />
        <Mini label="Vendas" valor={fmtNum(r.vendas)} sub={r.conversao != null ? `${r.conversao.toLocaleString('pt-BR')}%` : undefined} />
        <Mini label="Custo por venda" valor={fmtBrl(r.custo_venda)} />
        <Mini label="Valor vendido" valor={fmtBrl(r.valor_vendas, 0)} />
        <Mini label="Retorno" valor={fmtRetorno(r.retorno)} />
      </div>

      <div>
        <span style={eyebrow}>Gasto por semana</span>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 56, marginTop: 8 }}>
          {semanas.map(s => {
            const v = s.plataformas[plat.id].gasto
            return (
              <div key={s.inicio} title={`Semana ${s.numero} (${s.label}): ${fmtBrl(v)}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
                <div style={{
                  width: '100%', maxWidth: 46, borderRadius: '5px 5px 2px 2px',
                  height: v > 0 ? `${Math.max(6, v / maxSem * 40)}px` : 3,
                  background: v > 0 ? plat.cor : 'var(--border)', opacity: s.situacao === 'futura' ? 0.35 : 1,
                }} />
                <span style={{ fontSize: 10, color: 'var(--text-subtle)' }}>S{s.numero}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Mini({ label, valor, sub }: { label: string; valor: string; sub?: string }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '9px 11px' }}>
      <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-subtle)' }}>{label}</span>
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 14.5, fontWeight: 800, color: 'var(--text-1)', marginTop: 3 }}>
        {valor}{sub && <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>{sub}</span>}
      </span>
    </div>
  )
}

function SemanasTabela({ data, onSalvo }: { data: TrafegoData; onSalvo: () => void }) {
  const fechado = data.status === 'fechado'
  const th: React.CSSProperties = { ...eyebrow, padding: '10px 14px', textAlign: 'left', borderBottom: '1px solid var(--border)', background: 'var(--bg-subtle)', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '10px 14px', borderBottom: '1px solid var(--border-lt)', fontSize: 13, color: 'var(--text-2)', verticalAlign: 'middle' }
  return (
    <div style={{ ...card, overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-lt)', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-1)' }}>Gasto por semana</span>
          <span style={{ display: 'block', fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>
            {fechado
              ? 'Mês fechado. Os valores ainda podem ser corrigidos, se precisar.'
              : 'Lance quanto foi investido em cada plataforma na semana. Salva sozinho ao sair do campo.'}
          </span>
        </div>
        <span style={{ fontSize: 11.5, color: 'var(--text-subtle)' }}>Semanas de segunda a domingo, dentro do mês</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
          <thead>
            <tr>
              <th style={th}>Semana</th>
              {PLATS.map(p => (
                <th key={p.id} style={th}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><p.Logo size={13} />{p.nome}</span></th>
              ))}
              <th style={{ ...th, textAlign: 'right' }}>Total</th>
              <th style={{ ...th, textAlign: 'right' }}>Leads</th>
              <th style={{ ...th, textAlign: 'right' }}>Custo por lead</th>
            </tr>
          </thead>
          <tbody>
            {data.semanas.map(s => {
              const gasto = PLATS.reduce((acc, p) => acc + s.plataformas[p.id].gasto, 0)
              const leads = PLATS.reduce((acc, p) => acc + s.plataformas[p.id].leads, 0)
              const futura = s.situacao === 'futura'
              return (
                <tr key={s.inicio} style={{ opacity: futura ? 0.55 : 1 }}>
                  <td style={td}>
                    <span style={{ fontWeight: 700, color: 'var(--text-1)' }}>Semana {s.numero}</span>
                    <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-muted)' }}>
                      {s.label}
                      {s.situacao === 'atual' && <span style={{ marginLeft: 6, color: 'var(--success)', fontWeight: 700 }}>· em andamento</span>}
                      {futura && <span style={{ marginLeft: 6 }}>· a vir</span>}
                    </span>
                  </td>
                  {PLATS.map(p => (
                    <td key={p.id} style={td}>
                      <GastoInput plataforma={p.id} semana={s} disabled={futura} onSalvo={onSalvo} />
                    </td>
                  ))}
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: 'var(--text-1)' }}>{futura ? '—' : fmtBrl(gasto)}</td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    {futura ? '—' : <LeadsSplit g={s.plataformas.google.leads} m={s.plataformas.meta.leads} />}
                  </td>
                  <td style={{ ...td, textAlign: 'right' }}>{futura || !leads || !gasto ? '—' : fmtBrl(gasto / leads)}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <td style={{ ...td, fontWeight: 800, color: 'var(--text-1)', borderBottom: 'none' }}>Total do mês</td>
              {PLATS.map(p => (
                <td key={p.id} style={{ ...td, fontWeight: 800, color: 'var(--text-1)', borderBottom: 'none' }}>{fmtBrl(data.plataformas[p.id].gasto)}</td>
              ))}
              <td style={{ ...td, textAlign: 'right', fontWeight: 800, color: 'var(--text-1)', borderBottom: 'none' }}>{fmtBrl(data.total.gasto)}</td>
              <td style={{ ...td, textAlign: 'right', borderBottom: 'none' }}><LeadsSplit g={data.plataformas.google.leads} m={data.plataformas.meta.leads} /></td>
              <td style={{ ...td, textAlign: 'right', fontWeight: 800, color: 'var(--text-1)', borderBottom: 'none' }}>{fmtBrl(data.total.cpl)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

function LeadsSplit({ g, m }: { g: number; m: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
      <b style={{ color: 'var(--text-1)' }}>{fmtNum(g + m)}</b>
      <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
        <GoogleLogo size={10} />{g}<span style={{ width: 4 }} /><MetaLogo size={10} />{m}
      </span>
    </span>
  )
}

function GastoInput({ plataforma, semana, disabled, onSalvo }: { plataforma: Plataforma; semana: Semana; disabled: boolean; onSalvo: () => void }) {
  const atual = semana.plataformas[plataforma]
  const inicial = atual.lancado ? valorInput(atual.gasto) : ''
  const [txt, setTxt] = useState(inicial)
  const [estado, setEstado] = useState<'' | 'salvando' | 'salvo' | 'erro'>('')
  const [msg, setMsg] = useState('')
  useEffect(() => { setTxt(inicial) }, [inicial])

  function salvar() {
    const v = parseValor(txt)
    if (v === 'erro') { setEstado('erro'); setMsg('Valor inválido'); return }
    const anterior = atual.lancado ? atual.gasto : null
    if (v === anterior) { setTxt(inicial); setEstado(''); return }
    setEstado('salvando')
    api.put('/api/v1/financeiro/trafego/gasto', { plataforma, semana_inicio: semana.inicio, valor: v })
      .then(() => { setEstado('salvo'); setTxt(v == null ? '' : valorInput(v)); onSalvo(); setTimeout(() => setEstado(e => e === 'salvo' ? '' : e), 1800) })
      .catch(err => { setEstado('erro'); setMsg(err.response?.data?.detail || 'Erro ao salvar') })
  }

  let sufixo: ReactNode = null
  if (estado === 'salvando') sufixo = <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>…</span>
  else if (estado === 'salvo') sufixo = <Check size={14} color="var(--success)" />
  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, height: 34, width: 168, padding: '0 10px', borderRadius: 8,
        border: `1px solid ${estado === 'erro' ? 'var(--danger)' : 'var(--border-in)'}`,
        background: disabled ? 'var(--bg-subtle)' : 'var(--bg-input)',
      }}>
        <span style={{ fontSize: 12, color: 'var(--text-subtle)' }}>R$</span>
        <input
          value={txt} disabled={disabled} inputMode="decimal" placeholder={disabled ? '' : '0,00'}
          aria-label={`Gasto ${plataforma === 'google' ? 'Google Ads' : 'Meta Ads'} na semana ${semana.numero}`}
          onChange={e => { setTxt(e.target.value); if (estado === 'erro') setEstado('') }}
          onBlur={salvar}
          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setTxt(inicial); setEstado('') } }}
          style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, fontWeight: 600, color: 'var(--text-1)', fontFamily: 'inherit', fontVariantNumeric: 'tabular-nums' }}
        />
        {sufixo}
      </div>
      {estado === 'erro' && <span style={{ display: 'block', fontSize: 11, color: 'var(--danger)', marginTop: 3 }}>{msg}</span>}
    </div>
  )
}

function Historico({ data }: { data: TrafegoData }) {
  const max = Math.max(1, ...data.historico.flatMap(h => PLATS.map(p => h.plataformas[p.id].gasto)))
  return (
    <div style={{ ...card, padding: '16px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-1)' }}>Últimos meses</span>
        <span style={{ display: 'inline-flex', gap: 14, fontSize: 12, color: 'var(--text-muted)' }}>
          {PLATS.map(p => <span key={p.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: p.cor }} />{p.nome}</span>)}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {data.historico.map(h => {
          const gasto = PLATS.reduce((a, p) => a + h.plataformas[p.id].gasto, 0)
          const leads = PLATS.reduce((a, p) => a + h.plataformas[p.id].leads, 0)
          const atual = h.mes === data.mes
          return (
            <div key={h.mes} style={{ display: 'grid', gridTemplateColumns: '64px 1fr 120px 120px', alignItems: 'center', gap: 14 }}>
              <span style={{ fontSize: 12.5, fontWeight: atual ? 800 : 600, color: atual ? 'var(--text-1)' : 'var(--text-muted)', textTransform: 'capitalize' }}>{h.label}</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {PLATS.map(p => {
                  const v = h.plataformas[p.id].gasto
                  return <div key={p.id} title={`${p.nome}: ${fmtBrl(v)}`} style={{ height: 7, borderRadius: 99, width: v > 0 ? `${Math.max(1.5, v / max * 100)}%` : 0, background: p.cor }} />
                })}
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', textAlign: 'right' }}>{fmtBrl(gasto, 0)}</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'right' }}>{leads && gasto ? `${fmtBrl(gasto / leads)} / lead` : `${fmtNum(leads)} leads`}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
