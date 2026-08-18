import { useEffect, useState, type CSSProperties } from 'react'
import { Pencil, Plus, X, Columns3 } from 'lucide-react'
import api from '../api'
import { type FiltroPeriodo, mesAtualRange } from '../utils/periodoFiltro'

interface MetaProgress {
  id: string
  nome: string
  tipo: 'clt' | 'estagiario'
  meta_valor: number
  leads: number
  vendas: number
  atingido: number
  pct: number
  projecao: number | null
}
interface MetasResponse { mes_label: string; metas: MetaProgress[] }

const ACCENT = '#2563EB'
const SUCCESS = '#059669'
const WARN = '#B45309'

function fmtNum(v: number) {
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
}
function fmtBrl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtValor(tipo: 'clt' | 'estagiario', v: number) {
  return tipo === 'clt' ? fmtBrl(v) : `${fmtNum(v)} leads`
}
function initials(nome: string) {
  return nome.trim().slice(0, 2).toUpperCase()
}
function avatarBg(tipo: 'clt' | 'estagiario') {
  return tipo === 'clt' ? 'linear-gradient(145deg,#1E3A8A,#2563EB)' : 'linear-gradient(145deg,#7C3AED,#A78BFA)'
}
function statusColor(pct: number) {
  if (pct >= 100) return SUCCESS
  if (pct >= 60) return ACCENT
  return WARN
}
const inputStyle: CSSProperties = {
  padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-in)', fontSize: 13,
  color: 'var(--text-2)', background: 'var(--bg-input)', outline: 'none', fontFamily: 'inherit',
}
const labelStyle: CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--text-3b)' }

export default function FinanceiroMetas() {
  const [data, setData] = useState<MetasResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const [filtro, setFiltro] = useState<FiltroPeriodo>('mes_atual')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showCompare, setShowCompare] = useState(false)
  const [editing, setEditing] = useState<MetaProgress | 'new' | null>(null)
  const [form, setForm] = useState({ nome: '', tipo: 'clt' as 'clt' | 'estagiario', meta_valor: '' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  function fetchMetas() {
    if (filtro === 'entre_datas' && (!dataInicio || !dataFim)) return
    const params: Record<string, string> = {}
    if (filtro === 'mes_atual') Object.assign(params, mesAtualRange())
    else if (filtro === 'entre_datas') { params.date_from = dataInicio; params.date_to = dataFim }

    setLoading(true)
    setError(false)
    api.get<MetasResponse>('/api/v1/financeiro/metas', { params })
      .then(r => setData(r.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }

  useEffect(fetchMetas, [filtro, dataInicio, dataFim])

  const metas = data?.metas ?? []
  const selected = metas.find(m => m.id === selectedId) ?? null

  function openCreate() {
    setForm({ nome: '', tipo: 'clt', meta_valor: '' })
    setFormError('')
    setEditing('new')
  }
  function openEdit(m: MetaProgress) {
    setForm({ nome: m.nome, tipo: m.tipo, meta_valor: String(m.meta_valor) })
    setFormError('')
    setEditing(m)
  }
  function closeEdit() { setEditing(null) }

  function handleSave() {
    const nome = form.nome.trim()
    const metaValor = Number(form.meta_valor.replace(',', '.'))
    if (!nome) { setFormError('Informe o nome do operador'); return }
    if (!metaValor || metaValor <= 0) { setFormError('Informe uma meta maior que zero'); return }

    setSaving(true)
    setFormError('')
    const body = { nome, tipo: form.tipo, meta_valor: metaValor }
    const req = editing === 'new'
      ? api.post<MetaProgress>('/api/v1/financeiro/metas', body)
      : api.put<MetaProgress>(`/api/v1/financeiro/metas/${(editing as MetaProgress).id}`, body)

    req
      .then(() => { closeEdit(); fetchMetas() })
      .catch(err => setFormError(err.response?.data?.detail || 'Erro ao salvar meta'))
      .finally(() => setSaving(false))
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-2)', margin: 0 }}>Metas Mensais</h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
          Metas por operador — CLT (vendas em R$) e estagiário (captação de leads)
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <label style={{ display: 'grid', gap: 5, color: 'var(--text-muted)', fontSize: 10.5, fontWeight: 700 }}>
            Filtros
            <select
              value={filtro}
              onChange={e => setFiltro(e.target.value as FiltroPeriodo)}
              style={{ minWidth: 168, height: 40, padding: '0 12px', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-2)', background: 'var(--bg-card)', fontSize: 12.5, fontFamily: 'inherit' }}
            >
              <option value="mes_atual">Mês atual</option>
              <option value="geral">Geral</option>
              <option value="entre_datas">Entre datas</option>
            </select>
          </label>
          {filtro === 'entre_datas' && (
            <>
              <label style={{ display: 'grid', gap: 5, color: 'var(--text-muted)', fontSize: 10.5, fontWeight: 700 }}>
                De
                <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)}
                  style={{ height: 40, padding: '0 10px', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-2)', background: 'var(--bg-card)', fontSize: 12.5, fontFamily: 'inherit' }} />
              </label>
              <label style={{ display: 'grid', gap: 5, color: 'var(--text-muted)', fontSize: 10.5, fontWeight: 700 }}>
                Até
                <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)}
                  style={{ height: 40, padding: '0 10px', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-2)', background: 'var(--bg-card)', fontSize: 12.5, fontFamily: 'inherit' }} />
              </label>
            </>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => setShowCompare(true)}
            disabled={metas.length < 2}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 38, padding: '0 16px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-2)', fontSize: 13, fontWeight: 600, cursor: metas.length < 2 ? 'not-allowed' : 'pointer', opacity: metas.length < 2 ? 0.5 : 1 }}
          >
            <Columns3 size={15} color={ACCENT} />
            Comparativo
          </button>
          <button
            onClick={openCreate}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 38, padding: '0 16px', borderRadius: 9, border: 'none', background: ACCENT, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            <Plus size={15} />
            Novo operador
          </button>
        </div>
      </div>

      {loading ? (
        <p style={{ fontSize: 13, color: 'var(--text-subtle)' }}>Carregando…</p>
      ) : error ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-2)' }}>
          Não foi possível carregar as metas.
          <button onClick={fetchMetas} style={{ color: ACCENT, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: 0 }}>Tentar novamente</button>
        </div>
      ) : metas.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text-subtle)' }}>Nenhum operador com meta cadastrada ainda.</p>
      ) : (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
          {metas.map((m, i) => (
            <div
              key={m.id}
              role="button" tabIndex={0}
              onClick={() => setSelectedId(m.id)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedId(m.id) } }}
              style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', cursor: 'pointer',
                borderTop: i === 0 ? 'none' : '1px solid var(--border)',
              }}
            >
              <div style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, background: avatarBg(m.tipo), color: '#fff', fontWeight: 700, fontSize: 12.5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {initials(m.nome)}
              </div>
              <div style={{ width: 112, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)' }}>{m.nome}</span>
                <span style={{ alignSelf: 'flex-start', fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 99, background: m.tipo === 'clt' ? 'rgba(37,99,235,0.1)' : 'rgba(124,58,237,0.1)', color: m.tipo === 'clt' ? ACCENT : '#7C3AED' }}>
                  {m.tipo === 'clt' ? 'CLT' : 'Estagiário'}
                </span>
              </div>
              <div style={{ flex: 1, marginRight: 28, height: 9, borderRadius: 99, background: 'var(--bg-subtle)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(100, m.pct)}%`, borderRadius: 99, background: statusColor(m.pct), transition: 'width 300ms ease' }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <DetailModal meta={selected} mesLabel={data?.mes_label ?? ''} filtro={filtro} onClose={() => setSelectedId(null)} onEdit={() => { setSelectedId(null); openEdit(selected) }} />
      )}

      {showCompare && (
        <CompareModal metas={metas} mesLabel={data?.mes_label ?? ''} onClose={() => setShowCompare(false)} />
      )}

      {editing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }} onClick={closeEdit}>
          <div style={{ background: 'var(--bg-card)', borderRadius: 16, width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border-lt)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-2)' }}>{editing === 'new' ? 'Novo operador' : 'Editar meta'}</span>
              <button onClick={closeEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-subtle)', display: 'flex' }}><X size={18} /></button>
            </div>
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={labelStyle}>Nome</label>
                <input type="text" placeholder="Nome do operador" value={form.nome}
                  onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} style={inputStyle} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={labelStyle}>Perfil</label>
                <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value as 'clt' | 'estagiario' }))} style={inputStyle}>
                  <option value="clt">CLT — meta de vendas (R$)</option>
                  <option value="estagiario">Estagiário — meta de captação (leads)</option>
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={labelStyle}>Meta mensal {form.tipo === 'clt' ? '(R$)' : '(quantidade de leads)'}</label>
                <input type="text" inputMode="decimal" placeholder={form.tipo === 'clt' ? '6000' : '200'} value={form.meta_valor}
                  onChange={e => setForm(f => ({ ...f, meta_valor: e.target.value }))} style={inputStyle} />
              </div>
              {formError && <p style={{ fontSize: 13, color: '#EF4444', margin: 0 }}>{formError}</p>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 4 }}>
                <button onClick={closeEdit} style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, background: 'none', color: 'var(--text-muted)', border: '1px solid var(--border)', cursor: 'pointer' }}>Cancelar</button>
                <button onClick={handleSave} disabled={saving} style={{ padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: saving ? '#93C5FD' : ACCENT, color: 'white', border: 'none', cursor: saving ? 'not-allowed' : 'pointer' }}>
                  {saving ? 'Salvando…' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Donut({ pct, color }: { pct: number; color: string }) {
  const size = 100, stroke = 10
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const offset = c - (Math.min(100, Math.max(0, pct)) / 100) * c
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-subtle)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset} style={{ transition: 'stroke-dashoffset 400ms ease' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 19, fontWeight: 800, color: 'var(--text-1)' }}>{Math.round(pct)}%</span>
      </div>
    </div>
  )
}

function DetailModal({ meta, mesLabel, filtro, onClose, onEdit }: {
  meta: MetaProgress; mesLabel: string; filtro: FiltroPeriodo; onClose: () => void; onEdit: () => void
}) {
  const color = statusColor(meta.pct)
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }} onClick={onClose}>
      <div style={{ background: 'var(--bg-card)', borderRadius: 20, width: '100%', maxWidth: 420, padding: 26, boxShadow: '0 24px 64px rgba(0,0,0,0.35)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: avatarBg(meta.tipo), color: '#fff', fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {initials(meta.nome)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 16, fontWeight: 800, display: 'block', color: 'var(--text-1)' }}>{meta.nome}</span>
            <span style={{ display: 'inline-block', marginTop: 3, fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 99, background: meta.tipo === 'clt' ? 'rgba(37,99,235,0.1)' : 'rgba(124,58,237,0.1)', color: meta.tipo === 'clt' ? ACCENT : '#7C3AED' }}>
              {meta.tipo === 'clt' ? 'CLT' : 'Estagiário'}
            </span>
          </div>
          <button onClick={onEdit} title="Editar meta" style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: 'none', color: 'var(--text-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <Pencil size={15} />
          </button>
          <button onClick={onClose} title="Fechar" style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: 'none', color: 'var(--text-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ textAlign: 'center', padding: 18, borderRadius: 14, background: 'var(--bg-subtle)', marginBottom: 18, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <Donut pct={meta.pct} color={color} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{filtro === 'mes_atual' ? mesLabel : filtro === 'geral' ? 'Histórico completo' : 'Período selecionado'}</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Tile label="Leads captados" value={fmtNum(meta.leads)} />
          <Tile label="Vendas realizadas" value={fmtNum(meta.vendas)} />
          <Tile label="Meta mensal" value={fmtValor(meta.tipo, meta.meta_valor)} />
          <Tile label="Valor atingido no mês" value={fmtValor(meta.tipo, meta.atingido)} />
          {meta.projecao != null && (
            <div style={{ gridColumn: '1 / -1', borderRadius: 12, padding: '13px 14px', background: 'rgba(37,99,235,0.08)' }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: ACCENT }}>Projeção pro fim do mês</span>
              <span style={{ display: 'block', fontSize: 19, fontWeight: 800, color: ACCENT, marginTop: 6 }}>{fmtValor(meta.tipo, meta.projecao)}</span>
              <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                Mantendo o ritmo atual, {meta.projecao >= meta.meta_valor ? 'fica acima' : 'fica abaixo'} da meta de {fmtValor(meta.tipo, meta.meta_valor)}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '13px 14px' }}>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-subtle)' }}>{label}</span>
      <span style={{ display: 'block', fontSize: 19, fontWeight: 800, color: 'var(--text-1)', marginTop: 6 }}>{value}</span>
    </div>
  )
}

function CompareModal({ metas, mesLabel, onClose }: { metas: MetaProgress[]; mesLabel: string; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }} onClick={onClose}>
      <div style={{ background: 'var(--bg-card)', borderRadius: 20, width: '100%', maxWidth: 960, padding: 26, boxShadow: '0 24px 64px rgba(0,0,0,0.35)', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-1)' }}>Comparativo — {mesLabel}</span>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: 'none', color: 'var(--text-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(3, metas.length)}, 1fr)`, gap: 14 }}>
          {metas.map(m => {
            const color = statusColor(m.pct)
            return (
              <div key={m.id} style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 10, background: avatarBg(m.tipo), color: '#fff', fontWeight: 700, fontSize: 12.5, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {initials(m.nome)}
                  </div>
                  <div>
                    <span style={{ fontSize: 13.5, fontWeight: 700, display: 'block', color: 'var(--text-1)' }}>{m.nome}</span>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: m.tipo === 'clt' ? ACCENT : '#7C3AED' }}>{m.tipo === 'clt' ? 'CLT' : 'Estagiário'}</span>
                  </div>
                </div>
                <div style={{ textAlign: 'center', padding: 12, borderRadius: 12, background: 'var(--bg-subtle)' }}>
                  <span style={{ fontSize: 22, fontWeight: 800, color }}>{Math.round(m.pct)}%</span>
                  <div style={{ height: 6, borderRadius: 99, background: 'var(--border)', overflow: 'hidden', marginTop: 8 }}>
                    <div style={{ height: '100%', width: `${Math.min(100, m.pct)}%`, background: color, borderRadius: 99 }} />
                  </div>
                </div>
                <MiniTile label="Leads captados" value={fmtNum(m.leads)} />
                <MiniTile label="Vendas realizadas" value={fmtNum(m.vendas)} />
                <MiniTile label="Meta mensal" value={fmtValor(m.tipo, m.meta_valor)} />
                <MiniTile label="Atingido" value={fmtValor(m.tipo, m.atingido)} />
                {m.projecao != null && (
                  <div style={{ borderRadius: 10, padding: '10px 11px', background: 'rgba(37,99,235,0.08)' }}>
                    <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: ACCENT }}>Projeção</span>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 800, color: ACCENT, marginTop: 4 }}>{fmtValor(m.tipo, m.projecao)}</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function MiniTile({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 11px' }}>
      <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-subtle)' }}>{label}</span>
      <span style={{ display: 'block', fontSize: 14.5, fontWeight: 800, color: 'var(--text-1)', marginTop: 4 }}>{value}</span>
    </div>
  )
}

