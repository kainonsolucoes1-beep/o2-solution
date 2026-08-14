import { useEffect, useState } from 'react'
import { Wallet, Plus, Pencil, Trash2 } from 'lucide-react'
import api from '../api'
import { fmtBRL, fmtDateOnly, parseBRNumber } from '../utils/leadFormat'
import SectionCard from './SectionCard'
import EditPencil from './EditPencil'
import Field from './Field'
import EditInput from './EditInput'
import Combobox from './Combobox'

interface ParcelaItem {
  id: string
  numero: number | null
  valor: number
  status: 'recebido' | 'a_receber'
  previsao_recebimento: string | null
}

interface ParcelasListResponse {
  receita_origem: string
  receita_real_recebida: number | null
  receita_real_a_receber: number | null
  parcelas: ParcelaItem[]
}

const ORIGEM_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  sheet: { bg: '#EFF6FF', color: '#3B82F6', label: 'Planilha' },
  manual: { bg: '#F5F3FF', color: '#8B5CF6', label: 'Manual' },
}

const STATUS_STYLE = {
  recebido: { bg: '#ECFDF5', color: '#059669', label: 'Recebido' },
  a_receber: { bg: '#FFFBEB', color: '#D97706', label: 'A Receber' },
}

function toDateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : ''
}

interface GeralDraft {
  titular: string
  promotora: string
  modalidade: string
  operadora: string
  categoria: string
  data_venda: string
}

export default function LeadFinanceiroPanel({
  leadId, modalidadeOptions,
  titularLabel, promotoraLabel, modalidadeLabel, operadoraLabel, categoriaLabel, dataVendaLabel, dataVendaRaw,
  onSaved,
}: {
  leadId: string
  modalidadeOptions: string[]
  titularLabel: string
  promotoraLabel: string
  modalidadeLabel: string
  operadoraLabel: string
  categoriaLabel: string
  dataVendaLabel: string
  dataVendaRaw: string | null
  onSaved: () => void
}) {
  const [data, setData] = useState<ParcelasListResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const [editingGeral, setEditingGeral] = useState(false)
  const [savingGeral, setSavingGeral] = useState(false)
  const [geralDraft, setGeralDraft] = useState<GeralDraft>({ titular: '', promotora: '', modalidade: '', operadora: '', categoria: '', data_venda: '' })

  const [addingParcela, setAddingParcela] = useState(false)
  const [savingParcela, setSavingParcela] = useState(false)
  const [newParcela, setNewParcela] = useState({ numero: '', valor: '', status: 'a_receber' as 'recebido' | 'a_receber', previsao_recebimento: '' })

  const [editingParcelaId, setEditingParcelaId] = useState<string | null>(null)
  const [parcelaDraft, setParcelaDraft] = useState({ numero: '', valor: '', status: 'a_receber' as 'recebido' | 'a_receber', previsao_recebimento: '' })
  const [savingParcelaEdit, setSavingParcelaEdit] = useState(false)
  const [deletingParcelaId, setDeletingParcelaId] = useState<string | null>(null)

  function fetchParcelas() {
    setLoading(true)
    api.get<ParcelasListResponse>(`/api/v1/leads/${leadId}/parcelas`)
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchParcelas() }, [leadId])

  function startEditGeral() {
    setGeralDraft({
      titular: titularLabel === 'Não informado' ? '' : titularLabel,
      promotora: promotoraLabel === 'Não informado' ? '' : promotoraLabel,
      modalidade: modalidadeLabel === 'Não informado' ? '' : modalidadeLabel,
      operadora: operadoraLabel === 'Não informado' ? '' : operadoraLabel,
      categoria: categoriaLabel === 'Não informado' ? '' : categoriaLabel,
      data_venda: toDateInput(dataVendaRaw),
    })
    setEditingGeral(true)
  }

  function saveGeral() {
    setSavingGeral(true)
    api.post(`/api/v1/leads/${leadId}/receita`, {
      titular: geralDraft.titular.trim() || null,
      promotora: geralDraft.promotora.trim() || null,
      modalidade: geralDraft.modalidade.trim() || null,
      operadora: geralDraft.operadora.trim() || null,
      categoria: geralDraft.categoria.trim() || null,
      data_venda: geralDraft.data_venda || null,
    })
      .then(() => { setEditingGeral(false); onSaved(); fetchParcelas() })
      .finally(() => setSavingGeral(false))
  }

  function saveNewParcela() {
    if (!newParcela.valor.trim()) return
    setSavingParcela(true)
    api.post(`/api/v1/leads/${leadId}/parcelas`, {
      numero: newParcela.numero.trim() ? Number(newParcela.numero) : null,
      valor: parseBRNumber(newParcela.valor),
      status: newParcela.status,
      previsao_recebimento: newParcela.previsao_recebimento || null,
    })
      .then(() => { setAddingParcela(false); setNewParcela({ numero: '', valor: '', status: 'a_receber', previsao_recebimento: '' }); onSaved(); fetchParcelas() })
      .finally(() => setSavingParcela(false))
  }

  function startEditParcela(p: ParcelaItem) {
    setParcelaDraft({
      numero: p.numero != null ? String(p.numero) : '',
      valor: String(p.valor),
      status: p.status,
      previsao_recebimento: toDateInput(p.previsao_recebimento),
    })
    setEditingParcelaId(p.id)
  }

  function saveEditParcela() {
    if (!editingParcelaId) return
    setSavingParcelaEdit(true)
    api.patch(`/api/v1/leads/${leadId}/parcelas/${editingParcelaId}`, {
      numero: parcelaDraft.numero.trim() ? Number(parcelaDraft.numero) : null,
      valor: parseBRNumber(parcelaDraft.valor),
      status: parcelaDraft.status,
      previsao_recebimento: parcelaDraft.previsao_recebimento || null,
    })
      .then(() => { setEditingParcelaId(null); onSaved(); fetchParcelas() })
      .finally(() => setSavingParcelaEdit(false))
  }

  function deleteParcela(id: string) {
    setDeletingParcelaId(id)
    api.delete(`/api/v1/leads/${leadId}/parcelas/${id}`)
      .then(() => { onSaved(); fetchParcelas() })
      .finally(() => setDeletingParcelaId(null))
  }

  const origem = data?.receita_origem ? ORIGEM_STYLE[data.receita_origem] : null
  const recebida = data?.receita_real_recebida ?? 0
  const aReceber = data?.receita_real_a_receber ?? 0
  const total = recebida + aReceber
  const pct = total > 0 ? Math.round(recebida / total * 100) : 0

  return (
    <SectionCard
      title="Receita"
      icon={Wallet}
      action={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {origem && (
            <span style={{ fontSize: 10, fontWeight: 700, color: origem.color, background: origem.bg, padding: '2px 9px', borderRadius: 99 }}>
              {origem.label}
            </span>
          )}
          {editingGeral ? (
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setEditingGeral(false)} style={{ fontSize: 12, color: 'var(--text-subtle)', background: 'none', border: 'none', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={saveGeral} disabled={savingGeral} style={{ fontSize: 12, color: '#3B82F6', background: 'none', border: 'none', cursor: savingGeral ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
                {savingGeral ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          ) : (
            <EditPencil onClick={startEditGeral} title="Editar dados da venda" />
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {total > 0 && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ background: STATUS_STYLE.recebido.bg, border: '1px solid #A7F3D0', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontSize: 9.5, fontWeight: 700, color: STATUS_STYLE.recebido.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Recebida</div>
                <div style={{ fontSize: 17, fontWeight: 800, color: STATUS_STYLE.recebido.color, marginTop: 4 }}>{fmtBRL(recebida)}</div>
              </div>
              <div style={{ background: STATUS_STYLE.a_receber.bg, border: '1px solid #FDE68A', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontSize: 9.5, fontWeight: 700, color: STATUS_STYLE.a_receber.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>A Receber</div>
                <div style={{ fontSize: 17, fontWeight: 800, color: STATUS_STYLE.a_receber.color, marginTop: 4 }}>{fmtBRL(aReceber)}</div>
              </div>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-3b)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total do negócio</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-1)' }}>{fmtBRL(total)}</span>
              </div>
              <div style={{ height: 6, borderRadius: 99, background: '#FFFBEB', overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', borderRadius: 99, background: '#059669' }} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 6 }}>{pct}% já recebido</div>
            </div>
          </>
        )}

        {editingGeral ? (
          <>
            <EditInput label="Titular do Contrato" value={geralDraft.titular} onChange={v => setGeralDraft(d => ({ ...d, titular: v }))} />
            <EditInput label="Promotora" value={geralDraft.promotora} onChange={v => setGeralDraft(d => ({ ...d, promotora: v }))} />
            <div className="flex flex-col gap-1">
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.035em' }}>Modalidade</span>
              <Combobox value={geralDraft.modalidade} onChange={v => setGeralDraft(d => ({ ...d, modalidade: v }))} options={modalidadeOptions} />
            </div>
            <EditInput label="Operadora" value={geralDraft.operadora} onChange={v => setGeralDraft(d => ({ ...d, operadora: v }))} />
            <EditInput label="Categoria" value={geralDraft.categoria} onChange={v => setGeralDraft(d => ({ ...d, categoria: v }))} />
            <div className="flex flex-col gap-1">
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.035em' }}>Data da Venda</span>
              <input
                type="date"
                value={geralDraft.data_venda}
                onChange={e => setGeralDraft(d => ({ ...d, data_venda: e.target.value }))}
                style={{ fontSize: 13, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-2)', width: '100%', boxSizing: 'border-box' }}
              />
            </div>
          </>
        ) : (
          <>
            <Field label="Titular do Contrato" value={titularLabel} />
            <Field label="Promotora" value={promotoraLabel} />
            <Field label="Modalidade" value={modalidadeLabel} />
            <Field label="Operadora" value={operadoraLabel} />
            <Field label="Categoria" value={categoriaLabel} />
            <Field label="Data da Venda" value={dataVendaLabel} />
          </>
        )}

        <div style={{ marginTop: 4, paddingTop: 14, borderTop: '1px solid var(--border-in)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <p style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--text-3b)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
              Parcelas
            </p>
            {!addingParcela && (
              <button
                onClick={() => setAddingParcela(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 600, color: '#3B82F6', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                <Plus size={13} /> Lançar parcela
              </button>
            )}
          </div>

          {loading ? (
            <p style={{ fontSize: 12, color: 'var(--text-subtle)' }}>Carregando…</p>
          ) : !data || data.parcelas.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-subtle)' }}>Nenhuma parcela lançada.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.parcelas.map(p => {
                const s = STATUS_STYLE[p.status]
                if (editingParcelaId === p.id) {
                  return (
                    <div key={p.id} style={{ border: '1px solid var(--border-in)', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <EditInput label="Nº" value={parcelaDraft.numero} onChange={v => setParcelaDraft(d => ({ ...d, numero: v }))} />
                        <EditInput label="Valor" value={parcelaDraft.valor} onChange={v => setParcelaDraft(d => ({ ...d, valor: v }))} />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        <select
                          value={parcelaDraft.status}
                          onChange={e => setParcelaDraft(d => ({ ...d, status: e.target.value as 'recebido' | 'a_receber' }))}
                          style={{ fontSize: 12.5, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-2)' }}
                        >
                          <option value="a_receber">A Receber</option>
                          <option value="recebido">Recebido</option>
                        </select>
                        <input
                          type="date"
                          value={parcelaDraft.previsao_recebimento}
                          onChange={e => setParcelaDraft(d => ({ ...d, previsao_recebimento: e.target.value }))}
                          style={{ fontSize: 12.5, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-2)' }}
                        />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                        <button onClick={() => setEditingParcelaId(null)} style={{ fontSize: 12, color: 'var(--text-subtle)', background: 'none', border: 'none', cursor: 'pointer' }}>Cancelar</button>
                        <button onClick={saveEditParcela} disabled={savingParcelaEdit} style={{ fontSize: 12, color: '#3B82F6', background: 'none', border: 'none', cursor: savingParcelaEdit ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
                          {savingParcelaEdit ? 'Salvando…' : 'Salvar'}
                        </button>
                      </div>
                    </div>
                  )
                }
                return (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--border-lt)', borderRadius: 8, padding: '8px 10px' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', width: 20, flexShrink: 0 }}>{p.numero ?? '—'}</span>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{fmtBRL(p.valor)}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: s.color, background: s.bg, padding: '2px 8px', borderRadius: 99, flexShrink: 0 }}>{s.label}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-subtle)', flexShrink: 0, minWidth: 62, textAlign: 'right' }}>
                      {p.previsao_recebimento ? fmtDateOnly(p.previsao_recebimento) : '—'}
                    </span>
                    <button onClick={() => startEditParcela(p)} style={{ display: 'flex', color: 'var(--text-subtle)', background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => deleteParcela(p.id)}
                      disabled={deletingParcelaId === p.id}
                      style={{ display: 'flex', color: '#EF4444', background: 'none', border: 'none', cursor: deletingParcelaId === p.id ? 'not-allowed' : 'pointer', padding: 2, opacity: deletingParcelaId === p.id ? 0.5 : 1 }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {addingParcela && (
            <div style={{ marginTop: 10, border: '1px solid var(--border-in)', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <EditInput label="Nº (opcional)" value={newParcela.numero} onChange={v => setNewParcela(d => ({ ...d, numero: v }))} />
                <EditInput label="Valor" value={newParcela.valor} onChange={v => setNewParcela(d => ({ ...d, valor: v }))} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <select
                  value={newParcela.status}
                  onChange={e => setNewParcela(d => ({ ...d, status: e.target.value as 'recebido' | 'a_receber' }))}
                  style={{ fontSize: 12.5, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-2)' }}
                >
                  <option value="a_receber">A Receber</option>
                  <option value="recebido">Recebido</option>
                </select>
                <input
                  type="date"
                  value={newParcela.previsao_recebimento}
                  onChange={e => setNewParcela(d => ({ ...d, previsao_recebimento: e.target.value }))}
                  style={{ fontSize: 12.5, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-2)' }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button onClick={() => setAddingParcela(false)} style={{ fontSize: 12, color: 'var(--text-subtle)', background: 'none', border: 'none', cursor: 'pointer' }}>Cancelar</button>
                <button onClick={saveNewParcela} disabled={savingParcela || !newParcela.valor.trim()} style={{ fontSize: 12, color: '#3B82F6', background: 'none', border: 'none', cursor: savingParcela ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
                  {savingParcela ? 'Salvando…' : 'Lançar'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </SectionCard>
  )
}
