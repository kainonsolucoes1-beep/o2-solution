import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut, RefreshCw, Search, ChevronDown, ShieldCheck } from 'lucide-react'
import api from '../api'
import logo from '../assets/logo-o2.png'
import { MetaLogo } from '../components/BrandLogos'
import { parseUTC } from '../utils/date'

// Área do parceiro de tráfego (perfil "trafego"): só leitura dos leads da
// campanha Meta Ads desde 04/11/2026. O backend é quem filtra -- esta tela
// só mostra o que vem de /api/v1/parceiro/leads.

interface LeadParceiro {
  id: string
  nome: string | null
  telefone: string | null
  email: string | null
  status_label: string
  criado_em: string | null
  formulario: string | null
  regiao: string | null
  campanha: string | null
  conjunto: string | null
  anuncio: string | null
  plano_atual: string | null
  modalidade: string | null
}

function fmtDataHora(iso: string | null) {
  if (!iso) return '—'
  return new Date(parseUTC(iso)).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function ehHoje(iso: string | null) {
  if (!iso) return false
  return new Date(parseUTC(iso)).toDateString() === new Date().toDateString()
}
function fmtDesde(d: string) {
  const [y, m, dd] = d.split('-')
  return `${dd}/${m}/${y}`
}

const card: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14 }

export default function ParceiroLeads() {
  const navigate = useNavigate()
  const [leads, setLeads] = useState<LeadParceiro[]>([])
  const [desde, setDesde] = useState('2026-11-04')
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const [regiao, setRegiao] = useState<'' | 'SP' | 'MG'>('')
  const [aberto, setAberto] = useState<string | null>(null)
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null)
  const genRef = useRef(0)

  function carregar() {
    const gen = ++genRef.current
    setLoading(true)
    api.get<{ desde: string; leads: LeadParceiro[] }>('/api/v1/parceiro/leads')
      .then(r => { if (genRef.current !== gen) return; setLeads(r.data.leads); setDesde(r.data.desde); setErro(''); setAtualizadoEm(new Date()) })
      .catch(err => { if (genRef.current === gen) setErro(err.response?.status === 403 ? 'Seu usuário não tem acesso a esta área.' : 'Não foi possível carregar os leads.') })
      .finally(() => { if (genRef.current === gen) setLoading(false) })
  }

  useEffect(() => {
    if (!localStorage.getItem('token')) { navigate('/login'); return }
    carregar()
    const t = setInterval(carregar, 60_000)
    return () => clearInterval(t)
  }, [])

  function sair() {
    try { localStorage.removeItem('token'); localStorage.removeItem('perfil') } catch { /* ignore */ }
    navigate('/login')
  }

  const termo = busca.trim().toLowerCase()
  const filtrados = leads.filter(l =>
    (!regiao || l.regiao === regiao) &&
    (!termo || [l.nome, l.email, l.telefone].some(v => (v ?? '').toLowerCase().includes(termo))),
  )
  const total = leads.length
  const sp = leads.filter(l => l.regiao === 'SP').length
  const mg = leads.filter(l => l.regiao === 'MG').length
  const hoje = leads.filter(l => ehHoje(l.criado_em)).length

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-page)' }}>
      <header style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <img src={logo} alt="O2 Solution" style={{ height: 30, width: 'auto' }} />
          <span style={{ width: 1, height: 24, background: 'var(--border)' }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>Área do parceiro de tráfego</span>
          <button onClick={sair} style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-2)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <LogOut size={14} /> Sair
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 1180, margin: '0 auto', padding: '26px 20px 60px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap', marginBottom: 20 }}>
          <div style={{ width: 46, height: 46, borderRadius: 12, background: '#fff', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <MetaLogo size={28} />
          </div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-1)', margin: 0 }}>Leads da campanha Meta Ads</h1>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>
              Leads recebidos no o2sig a partir de {fmtDesde(desde)}. Atualiza sozinho a cada minuto.
            </p>
          </div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: 99, padding: '5px 11px' }}>
            <ShieldCheck size={13} /> Acesso somente leitura
          </span>
        </div>

        <div style={{ ...card, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', overflow: 'hidden', marginBottom: 16 }}>
          {[['Total recebido', total], ['Recebidos hoje', hoje], ['Campanha SP', sp], ['Campanha MG', mg]].map(([label, v], i) => (
            <div key={label as string} style={{ padding: '14px 18px', borderLeft: i ? '1px solid var(--border-lt)' : 'none' }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-subtle)' }}>{label}</span>
              <span style={{ display: 'block', fontSize: 24, fontWeight: 800, color: 'var(--text-1)', marginTop: 4 }}>{v}</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <div style={{ ...card, borderRadius: 10, display: 'flex', alignItems: 'center', gap: 8, height: 38, padding: '0 12px', flex: '1 1 260px', maxWidth: 380 }}>
            <Search size={15} color="var(--text-subtle)" />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome, e-mail ou telefone"
              style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: 'var(--text-1)', fontFamily: 'inherit' }} />
          </div>
          <select value={regiao} onChange={e => setRegiao(e.target.value as '' | 'SP' | 'MG')}
            style={{ height: 38, padding: '0 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-2)', fontSize: 13, fontFamily: 'inherit' }}>
            <option value="">Todas as campanhas</option>
            <option value="SP">Campanha SP</option>
            <option value="MG">Campanha MG</option>
          </select>
          <button onClick={carregar} disabled={loading} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 38, padding: '0 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-2)', fontSize: 13, fontWeight: 600, cursor: loading ? 'wait' : 'pointer' }}>
            <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> Atualizar
          </button>
          {atualizadoEm && <span style={{ fontSize: 12, color: 'var(--text-subtle)' }}>atualizado às {atualizadoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>}
        </div>

        {erro ? (
          <div style={{ ...card, padding: 20, fontSize: 13, color: 'var(--text-2)' }}>{erro}</div>
        ) : (
          <div style={{ ...card, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
                <thead>
                  <tr>
                    {['Recebido em', 'Nome', 'Telefone', 'E-mail', 'Campanha', 'Situação', ''].map((h, i) => (
                      <th key={i} style={{ textAlign: 'left', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-subtle)', padding: '10px 14px', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading && leads.length === 0 ? (
                    <tr><td colSpan={7} style={{ padding: 24, fontSize: 13, color: 'var(--text-subtle)' }}>Carregando…</td></tr>
                  ) : filtrados.length === 0 ? (
                    <tr><td colSpan={7} style={{ padding: 24, fontSize: 13, color: 'var(--text-subtle)' }}>
                      {leads.length === 0 ? 'Nenhum lead da campanha recebido ainda.' : 'Nenhum lead encontrado com esse filtro.'}
                    </td></tr>
                  ) : filtrados.map(l => {
                    const open = aberto === l.id
                    const td: React.CSSProperties = { padding: '11px 14px', fontSize: 13, color: 'var(--text-2)', borderBottom: open ? 'none' : '1px solid var(--border-lt)', verticalAlign: 'middle' }
                    return [
                      <tr key={l.id} onClick={() => setAberto(open ? null : l.id)} style={{ cursor: 'pointer', background: open ? 'var(--bg-hover)' : 'transparent' }}>
                        <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtDataHora(l.criado_em)}</td>
                        <td style={{ ...td, fontWeight: 700, color: 'var(--text-1)' }}>{l.nome || '—'}</td>
                        <td style={{ ...td, whiteSpace: 'nowrap' }}>{l.telefone || '—'}</td>
                        <td style={td}>{l.email || '—'}</td>
                        <td style={td}>
                          {l.regiao
                            ? <span style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 9px', borderRadius: 7, background: 'rgba(0,129,251,0.10)', color: '#0081FB' }}>{l.regiao}</span>
                            : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Formulário {l.formulario || '—'}</span>}
                        </td>
                        <td style={td}>{l.status_label || '—'}</td>
                        <td style={{ ...td, width: 30 }}><ChevronDown size={15} color="var(--text-subtle)" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }} /></td>
                      </tr>,
                      open && (
                        <tr key={`${l.id}-d`}>
                          <td colSpan={7} style={{ padding: '4px 14px 16px', borderBottom: '1px solid var(--border-lt)', background: 'var(--bg-hover)' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
                              {[
                                ['Formulário (ID)', l.formulario], ['Campanha', l.campanha], ['Conjunto de anúncios', l.conjunto], ['Anúncio', l.anuncio],
                                ['Plano atual', l.plano_atual], ['Modalidade', l.modalidade],
                              ].map(([k, v]) => (
                                <div key={k as string} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '9px 11px', background: 'var(--bg-card)' }}>
                                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-subtle)' }}>{k}</span>
                                  <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: v ? 'var(--text-1)' : 'var(--text-subtle)', marginTop: 3, overflowWrap: 'anywhere' }}>{v || 'não informado'}</span>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ),
                    ]
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <p style={{ fontSize: 12, color: 'var(--text-subtle)', marginTop: 14 }}>
          Esta área mostra somente os leads das campanhas Meta Ads. Dúvidas: fale com o time da O2 Solution.
        </p>
      </main>
      <style>{'@keyframes spin { to { transform: rotate(360deg) } }'}</style>
    </div>
  )
}
