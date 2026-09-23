import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'
import type { EmissaoResumo } from './EmissaoTab'

const ACCENT = '#0E7490'
const SHADES = ['#0E7490', '#22A6C2', '#7CC8D8', '#BFE3EB']
const fmtBrlInt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

// Card "Emissão de contrato" do Dashboard: enviados no dia (ou no período do
// filtro), valor e divisão por operadora. Clicar leva pra aba Emissão.
export default function EmissaoCard({ from, to }: { from?: string; to?: string }) {
  const navigate = useNavigate()
  const [data, setData] = useState<EmissaoResumo | null>(null)

  useEffect(() => {
    let alive = true
    const load = () => {
      const qp = new URLSearchParams()
      if (from) qp.set('date_from', from)
      if (to) qp.set('date_to', to)
      api.get<EmissaoResumo>(`/api/v1/emissao/resumo?${qp}`).then(r => { if (alive) setData(r.data) }).catch(() => {})
    }
    load()
    const id = from ? undefined : setInterval(load, 60_000)   // vista histórica não precisa de polling
    return () => { alive = false; if (id) clearInterval(id) }
  }, [from, to])

  const delta = data ? data.enviados - data.enviados_anterior : 0
  const vs = !from || from === to ? 'ontem' : 'período anterior'
  const total = data?.valor_total || 0
  const top = data?.por_operadora.slice(0, 4) ?? []

  return (
    <div className="bg-white rounded-xl flex flex-col gap-3" style={{ padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
          <span style={{ width: 3, height: 12, borderRadius: 2, background: ACCENT, flexShrink: 0 }} />
          Emissão de contrato
        </p>
        {data && data.enviados_anterior + data.enviados > 0 && (
          <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: 'rgba(8,145,178,0.14)', color: '#155E75', whiteSpace: 'nowrap' }}>
            {delta >= 0 ? '+' : ''}{delta} vs. {vs}
          </span>
        )}
      </div>

      {!data ? (
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-subtle)' }}>Carregando…</p>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <p style={{ margin: 0, fontSize: 40, fontWeight: 800, color: 'var(--text-1)', letterSpacing: '-0.02em', lineHeight: 1 }}>{data.enviados}</p>
              <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--text-muted)' }}>contrato{data.enviados === 1 ? '' : 's'} enviado{data.enviados === 1 ? '' : 's'}</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--text-1)' }}>{fmtBrlInt(data.valor_total)}</p>
              <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--text-muted)' }}>valor dos contratos</p>
            </div>
          </div>

          {top.length > 0 && (
            <>
              <div style={{ display: 'flex', height: 9, borderRadius: 999, overflow: 'hidden', background: 'var(--bg-subtle)' }}>
                {top.map((o, i) => (
                  <span key={o.operadora} style={{ width: `${total > 0 ? (o.valor / total) * 100 : 0}%`, background: o.operadora === 'Sem operadora' ? '#9CA3AF' : SHADES[i] }} />
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 14px', fontSize: 12.5, color: 'var(--text-2)' }}>
                {top.map((o, i) => (
                  <span key={o.operadora} style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, flexShrink: 0, background: o.operadora === 'Sem operadora' ? '#9CA3AF' : SHADES[i] }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.operadora}</span>
                    <b style={{ marginLeft: 'auto' }}>{o.count}</b>
                  </span>
                ))}
              </div>
            </>
          )}
          {data.enviados === 0 && <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-subtle)' }}>Nenhum envio para emissão neste período.</p>}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingTop: 10, borderTop: '1px solid var(--border-lt)', marginTop: 'auto' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {data.por_operador.slice(0, 3).map(o => `${o.operador} ${o.count}`).join(' · ') || 'Sem envios'}
            </span>
            <button onClick={() => navigate('/gestao-comercial?tab=emissao')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: ACCENT, fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap' }}>
              Ver detalhes ›
            </button>
          </div>
        </>
      )}
    </div>
  )
}
