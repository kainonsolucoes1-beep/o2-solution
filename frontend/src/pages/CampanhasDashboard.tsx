import { useCallback, useEffect, useState } from 'react'
import { Filter, Trash2, Upload } from 'lucide-react'
import api from '../api'
import { useTheme } from '../ThemeContext'
import ImportSmsKolmeyaModal from '../components/ImportSmsKolmeyaModal'
import SinoSlot from '../components/SinoSlot'

type Canal = 'whatsapp' | 'email' | 'sms'
type CanalFiltro = 'todos' | Canal
type Periodo = 'hoje' | 'mes' | 'custom'

interface SmsLote { id: string; job: string; data_disparo: string | null; enviados: number; retornos: number; entregues: number; respostas: number; positivos: number; taxa: number }
interface SmsRitmoDia { dia: string; enviados: number; entregues: number; positivos: number }
interface SmsData { enviados: number; retornos: number; entregues: number; respostas: number; positivos: number; taxa: number; lotes: SmsLote[]; ritmo_diario: SmsRitmoDia[] }

interface CanalDetalhe { canal: Canal; na_fila: number; disparado: number; respondeu: number; taxa: number }
interface RitmoDia { dia: string; whatsapp: number; email: number; sms: number }
interface RodizioItem { nome: string; count: number }
interface AtividadeItem { lead_nome: string; canal: Canal; acao: string; por: string | null; distribuido_para: string | null; em: string | null }
interface DashboardData {
  na_fila: number
  disparos: number
  respostas: number
  taxa_resposta: number
  distribuidos: number
  canais: CanalDetalhe[]
  ritmo_diario: RitmoDia[]
  rodizio: RodizioItem[]
  atividade_recente: AtividadeItem[]
}

const CANAL_CFG: Record<Canal, { label: string; color: string; bg: string; emoji: string }> = {
  whatsapp: { label: 'WhatsApp', color: '#16A34A', bg: '#EAF7EE', emoji: '💬' },
  email: { label: 'E-mail', color: '#3B82F6', bg: '#EAF1FE', emoji: '✉️' },
  sms: { label: 'SMS', color: '#8B5CF6', bg: '#F2EEFE', emoji: '📱' },
}

const ACAO_LABEL: Record<string, { text: (a: AtividadeItem) => string; color: string }> = {
  enviado_para_campanha: { text: () => 'Enviado pra campanha', color: 'var(--text-muted)' },
  disparado_sem_resposta: { text: () => 'Disparado, sem resposta', color: 'var(--text-muted)' },
  respondeu: { text: a => `Respondeu → distribuído p/ ${a.distribuido_para ?? '—'}`, color: 'var(--success)' },
  nao_retrabalhar: { text: () => 'Não retrabalhar', color: 'var(--text-subtle)' },
}

function fmtYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function rangeFor(p: Periodo): { date_from: string; date_to: string } {
  const now = new Date()
  if (p === 'hoje') return { date_from: fmtYMD(now), date_to: fmtYMD(now) }
  return { date_from: fmtYMD(new Date(now.getFullYear(), now.getMonth(), 1)), date_to: fmtYMD(now) }
}
function fmtAgo(iso: string | null): string {
  if (!iso) return '—'
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 60) return `há ${Math.max(mins, 0)} min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `há ${hrs}h`
  return `há ${Math.floor(hrs / 24)}d`
}
const LOTE_COLS = 'repeat(8, minmax(0, 1fr)) 32px'
function fmtDiaMes(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}
function fmtDiaCurto(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return String(d.getDate())
}

export default function CampanhasDashboard() {
  const { dark } = useTheme()
  const [periodo, setPeriodo] = useState<Periodo>('mes')
  const [custom, setCustom] = useState(() => rangeFor('mes'))
  const [canal, setCanal] = useState<CanalFiltro>('todos')
  const [filtroAberto, setFiltroAberto] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [data, setData] = useState<DashboardData | null>(null)
  const [sms, setSms] = useState<SmsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchData = useCallback((p: Periodo, c: CanalFiltro) => {
    setLoading(true)
    setError('')
    const params = p === 'custom' ? custom : rangeFor(p)
    const req = c === 'sms'
      ? api.get<SmsData>('/api/v1/campanhas/sms/dashboard', { params }).then(r => setSms(r.data))
      : api.get<DashboardData>('/api/v1/campanhas/dashboard', { params }).then(r => setData(r.data))
    req
      .catch(() => setError('Não foi possível carregar as métricas.'))
      .finally(() => setLoading(false))
  }, [custom])

  useEffect(() => { fetchData(periodo, canal) }, [periodo, canal, fetchData])

  async function excluirLote(l: SmsLote) {
    if (!window.confirm(`Excluir o lote do job ${l.job}? As respostas importadas dele também saem.`)) return
    try {
      await api.delete(`/api/v1/campanhas/sms/lotes/${l.id}`)
      fetchData(periodo, canal)
    } catch {
      setError('Não foi possível excluir o lote.')
    }
  }

  const canaisVis: Canal[] = canal === 'todos' ? ['whatsapp', 'email', 'sms'] : [canal]
  const canalDet = canal !== 'todos' && data ? data.canais.find(c => c.canal === canal) : undefined
  const totalDia = (d: RitmoDia) => canaisVis.reduce((s, c) => s + d[c], 0)
  const maxRitmo = data ? Math.max(...data.ritmo_diario.map(totalDia), 1) : 1
  const maxSms = sms ? Math.max(...sms.ritmo_diario.map(d => d.enviados), 1) : 1
  const cardStyle: React.CSSProperties = { background: 'var(--bg-card)', borderRadius: 12, padding: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }

  return (
    <main className="px-4 md:px-8 xl:px-12 py-6 flex flex-col gap-5" style={{ background: dark ? 'transparent' : '#EEF1F5', minHeight: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-2)', margin: 0 }}>Campanhas · Métricas</h1>
          <p style={{ fontSize: 13, color: 'var(--text-subtle)', marginTop: 3 }}>Disparo em massa — mede o disparo, não a captação/venda.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {canal === 'sms' && (
            <button
              onClick={() => setImportOpen(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, padding: '8px 14px', borderRadius: 9, cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-2)' }}
            >
              <Upload size={14} /> Importar planilhas
            </button>
          )}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setFiltroAberto(o => !o)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, padding: '8px 14px', borderRadius: 9, cursor: 'pointer',
                border: `1px solid ${canal !== 'todos' ? 'var(--accent)' : 'var(--border)'}`, background: 'var(--bg-card)',
                color: canal !== 'todos' ? 'var(--accent)' : 'var(--text-2)',
              }}
            >
              <Filter size={14} /> {canal === 'todos' ? 'Todos os canais' : CANAL_CFG[canal].label}
            </button>
            {filtroAberto && (
              <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 20, minWidth: 170, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 4 }}>
                {(['todos', 'whatsapp', 'email', 'sms'] as const).map(c => (
                  <button
                    key={c}
                    onClick={() => { setCanal(c); setFiltroAberto(false) }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', fontSize: 12.5, fontWeight: canal === c ? 700 : 500, padding: '8px 10px', borderRadius: 7, border: 'none', cursor: 'pointer', background: canal === c ? 'var(--bg-subtle)' : 'transparent', color: 'var(--text-2)' }}
                  >
                    {c === 'todos' ? 'Todos os canais' : `${CANAL_CFG[c].emoji} ${CANAL_CFG[c].label}`}
                  </button>
                ))}
              </div>
            )}
          </div>
          {([['hoje', 'Hoje'], ['mes', 'Este mês'], ['custom', 'Período']] as const).map(([p, label]) => (
            <button
              key={p}
              onClick={() => setPeriodo(p)}
              style={{
                fontSize: 12.5, fontWeight: 600, padding: '8px 14px', borderRadius: 9, cursor: 'pointer',
                border: `1px solid ${periodo === p ? 'var(--accent)' : 'var(--border)'}`,
                background: periodo === p ? 'var(--accent)' : 'var(--bg-card)',
                color: periodo === p ? '#fff' : 'var(--text-2)',
              }}
            >
              {label}
            </button>
          ))}
          {periodo === 'custom' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-3b)' }}>
              {(['date_from', 'date_to'] as const).map((k, i) => (
                <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {i === 1 && 'até'}
                  <input
                    type="date"
                    value={custom[k]}
                    onChange={e => e.target.value && setCustom(prev => ({ ...prev, [k]: e.target.value }))}
                    style={{ fontSize: 12.5, padding: '7px 8px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-1)' }}
                  />
                </span>
              ))}
            </div>
          )}
          <SinoSlot />
        </div>
      </div>

      {error && <p style={{ color: '#EF4444', fontSize: 13 }}>{error}</p>}

      {importOpen && <ImportSmsKolmeyaModal onClose={() => setImportOpen(false)} onImported={() => fetchData(periodo, canal)} />}

      {loading || (canal === 'sms' ? !sms : !data) ? (
        <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-subtle)', padding: '40px 0' }}>Carregando…</p>
      ) : canal === 'sms' && sms ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {([
              { label: 'Enviados', value: sms.enviados, sub: 'linhas da planilha de envio', accent: 'var(--accent)' },
              { label: 'Entregues', value: sms.entregues, sub: `de ${sms.retornos} processados pela Kolmeya${sms.retornos > sms.entregues ? ` · ${sms.retornos - sms.entregues} não entregues` : ''}`, accent: CANAL_CFG.sms.color },
              { label: 'Respostas', value: `${sms.positivos} · ${sms.taxa}%`, sub: `responderam "Sim" · % sobre entregues${sms.respostas > sms.positivos ? ` · ${sms.respostas} respostas no total` : ''}`, accent: 'var(--success)' },
            ] as const).map(k => (
              <div key={k.label} style={{ position: 'relative', overflow: 'hidden', background: 'var(--bg-card)', borderRadius: 12, padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: k.accent }} />
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>{k.label}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-1)', margin: '6px 0 2px' }}>{k.value}</div>
                <div style={{ fontSize: 11, color: 'var(--text-subtle)' }}>{k.sub}</div>
              </div>
            ))}
          </div>

          <div style={cardStyle}>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 12px' }}>Disparos por dia · últimos 7 dias úteis</p>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 130 }}>
              {sms.ritmo_diario.map(d => {
                const h = (d.enviados / maxSms) * 100
                return (
                  <div key={d.dia} title={`${fmtDiaMes(d.dia)}: ${d.enviados} enviados · ${d.entregues} entregues · ${d.positivos} "Sim"`} style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center' }}>
                    {d.enviados > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-1)', marginBottom: 3 }}>{d.enviados}</span>}
                    <div style={{ position: 'relative', width: '100%', maxWidth: 56, height: `${h}%`, minHeight: d.enviados > 0 ? 3 : 0, background: CANAL_CFG.sms.bg, borderRadius: '4px 4px 0 0', overflow: 'hidden' }}>
                      <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: `${d.enviados ? (d.entregues / d.enviados) * 100 : 0}%`, background: CANAL_CFG.sms.color }} />
                    </div>
                  </div>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
              {sms.ritmo_diario.map(d => (
                <div key={d.dia} style={{ flex: 1, textAlign: 'center', lineHeight: 1.35 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)' }}>{fmtDiaMes(d.dia)}</div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: d.positivos > 0 ? 'var(--success)' : 'var(--text-subtle)' }}>{d.positivos} "Sim"</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--text-3b)', marginTop: 12 }}>
              {([['Enviados', CANAL_CFG.sms.bg], ['Entregues', CANAL_CFG.sms.color], ['"Sim"', 'var(--success)']] as const).map(([label, cor]) => (
                <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 3, background: cor, border: '1px solid var(--border-lt)' }} />{label}
                </span>
              ))}
            </div>
          </div>

          <div style={cardStyle}>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 12px' }}>Disparos do período</p>
            {sms.lotes.length === 0 ? (
              <p style={{ fontSize: 12.5, color: 'var(--text-subtle)' }}>Nenhum disparo importado no período. Use "Importar planilhas".</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <div style={{ minWidth: 640 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: LOTE_COLS, gap: 10, padding: '0 0 8px', fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.03em', textAlign: 'center' }}>
                    <span>Data</span><span>Job</span><span>Enviados</span><span>Processados</span><span>Entregues</span><span>Respostas</span><span>"Sim"</span><span>%</span><span />
                  </div>
                  {sms.lotes.map(l => (
                    <div key={l.id} style={{ display: 'grid', gridTemplateColumns: LOTE_COLS, gap: 10, alignItems: 'center', padding: '10px 0', borderTop: '1px solid var(--border-lt)', fontSize: 12.5, fontVariantNumeric: 'tabular-nums', textAlign: 'center' }}>
                      <span style={{ color: 'var(--text-2)', fontWeight: 600 }}>{l.data_disparo ? new Date(l.data_disparo + 'Z').toLocaleDateString('pt-BR') : '—'}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{l.job}</span>
                      <span style={{ color: 'var(--text-1)' }}>{l.enviados}</span>
                      <span style={{ color: 'var(--text-1)' }}>{l.retornos}</span>
                      <span style={{ color: 'var(--text-1)' }}>{l.entregues}</span>
                      <span style={{ color: 'var(--text-1)' }}>{l.respostas}</span>
                      <span style={{ color: 'var(--success)', fontWeight: 700 }}>{l.positivos}</span>
                      <span style={{ color: CANAL_CFG.sms.color, fontWeight: 800 }}>{l.taxa}%</span>
                      <button onClick={() => excluirLote(l)} title="Excluir lote" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-subtle)', padding: 4, display: 'flex', justifyContent: 'center' }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      ) : data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {([
              { label: 'Na fila', value: canalDet ? canalDet.na_fila : data.na_fila, sub: 'aguardando disparo', accent: '#7C93C4' },
              { label: 'Disparos', value: canalDet ? canalDet.disparado : data.disparos, sub: canalDet ? CANAL_CFG[canalDet.canal].label : `${CANAL_CFG.whatsapp.label} ${data.canais.find(c => c.canal === 'whatsapp')?.disparado ?? 0} · ${CANAL_CFG.email.label} ${data.canais.find(c => c.canal === 'email')?.disparado ?? 0} · ${CANAL_CFG.sms.label} ${data.canais.find(c => c.canal === 'sms')?.disparado ?? 0}`, accent: 'var(--accent)' },
              { label: 'Respostas', value: canalDet ? `${canalDet.respondeu} · ${canalDet.taxa}%` : `${data.respostas} · ${data.taxa_resposta}%`, sub: canalDet ? 'taxa de resposta do canal' : 'taxa de resposta geral', accent: 'var(--success)' },
              { label: 'Distribuídos', value: canalDet ? canalDet.respondeu : data.distribuidos, sub: 'foram pro rodízio', accent: 'var(--warning)' },
            ] as const).map(k => (
              <div key={k.label} style={{ position: 'relative', overflow: 'hidden', background: 'var(--bg-card)', borderRadius: 12, padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: k.accent }} />
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>{k.label}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-1)', margin: '6px 0 2px' }}>{k.value}</div>
                <div style={{ fontSize: 11, color: 'var(--text-subtle)' }}>{k.sub}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {data.canais.filter(c => canaisVis.includes(c.canal)).map(c => {
              const cfg = CANAL_CFG[c.canal]
              return (
                <div key={c.canal} style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>
                      <span style={{ width: 26, height: 26, borderRadius: 8, background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>{cfg.emoji}</span>
                      {cfg.label}
                    </span>
                    <span style={{ fontSize: 20, fontWeight: 800, color: cfg.color }}>{c.taxa}%</span>
                  </div>
                  {([['Na fila', c.na_fila, '#CBD5E1'], ['Disparado', c.disparado, cfg.color], ['Respondeu', c.respondeu, cfg.color]] as const).map(([label, val, bar]) => {
                    const maxV = Math.max(c.na_fila, c.disparado, 1)
                    return (
                      <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, marginBottom: 8 }}>
                        <span style={{ width: 66, color: 'var(--text-3b)', flexShrink: 0 }}>{label}</span>
                        <span style={{ flex: 1, height: 8, borderRadius: 99, background: 'var(--bg-subtle)', overflow: 'hidden' }}>
                          <span style={{ display: 'block', height: '100%', width: `${(val / maxV) * 100}%`, background: bar, borderRadius: 99 }} />
                        </span>
                        <span style={{ width: 30, textAlign: 'right', fontWeight: 700, color: 'var(--text-1)', flexShrink: 0 }}>{val}</span>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4 items-start">
            <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 12px' }}>Disparos por dia · últimos 14 dias</p>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 100 }}>
                {data.ritmo_diario.map(d => {
                  const total = totalDia(d)
                  const h = (total / maxRitmo) * 100
                  return (
                    <div key={d.dia} title={`${d.dia}: ${total}`} style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', height: `${h}%`, minHeight: total > 0 ? 3 : 0, borderRadius: '3px 3px 0 0', overflow: 'hidden' }}>
                        {canaisVis.includes('sms') && d.sms > 0 && <span style={{ flex: d.sms, background: CANAL_CFG.sms.color }} />}
                        {canaisVis.includes('email') && d.email > 0 && <span style={{ flex: d.email, background: CANAL_CFG.email.color }} />}
                        {canaisVis.includes('whatsapp') && d.whatsapp > 0 && <span style={{ flex: d.whatsapp, background: CANAL_CFG.whatsapp.color }} />}
                      </div>
                    </div>
                  )
                })}
              </div>
              <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                {data.ritmo_diario.map(d => (
                  <span key={d.dia} style={{ flex: 1, textAlign: 'center', fontSize: 9.5, color: 'var(--text-subtle)' }}>{fmtDiaCurto(d.dia)}</span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--text-3b)', marginTop: 12 }}>
                {canaisVis.map(c => (
                  <span key={c} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 3, background: CANAL_CFG[c].color }} />{CANAL_CFG[c].label}
                  </span>
                ))}
              </div>
            </div>

            <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 12px' }}>Rodízio do período</p>
              {data.rodizio.length === 0 ? (
                <p style={{ fontSize: 12.5, color: 'var(--text-subtle)' }}>Ninguém recebeu leads via rodízio ainda.</p>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  {data.rodizio.map(r => (
                    <div key={r.nome} style={{ border: '1px solid var(--border-lt)', borderRadius: 10, padding: '12px 8px', textAlign: 'center' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{r.nome}</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-1)', margin: '4px 0 0' }}>{r.count}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>leads</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 12px' }}>Atividade recente</p>
            {data.atividade_recente.filter(a => canaisVis.includes(a.canal)).length === 0 ? (
              <p style={{ fontSize: 12.5, color: 'var(--text-subtle)' }}>Nada por aqui ainda.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {data.atividade_recente.filter(a => canaisVis.includes(a.canal)).map((a, i) => {
                  const acao = ACAO_LABEL[a.acao]
                  const cfg = CANAL_CFG[a.canal]
                  return (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.2fr 110px 1.6fr 90px 80px', gap: 12, alignItems: 'center', padding: '10px 0', borderTop: i === 0 ? 'none' : '1px solid var(--border-lt)', fontSize: 12.5 }}>
                      <span style={{ color: 'var(--text-1)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.lead_nome}</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: cfg.color, background: cfg.bg, borderRadius: 7, padding: '3px 8px', width: 'fit-content' }}>{cfg.emoji} {cfg.label}</span>
                      <span style={{ color: acao?.color ?? 'var(--text-2)', fontWeight: 600 }}>{acao ? acao.text(a) : a.acao}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{a.por ?? '—'}</span>
                      <span style={{ color: 'var(--text-subtle)' }}>{fmtAgo(a.em)}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}
    </main>
  )
}
