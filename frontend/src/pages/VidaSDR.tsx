import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { ArrowLeft, Users, Loader2, XCircle, Percent, Wallet, Clock3 } from 'lucide-react'
import api from '../api'

interface TrendItem { mes: string; mes_label: string; captacoes: number; vendas: number; receita: number | null }
interface VidaSdrData {
  captacoes: number
  em_andamento: number
  cancelados: number
  vendas: number
  conversao: number
  receita_recebida: number | null
  receita_a_receber: number | null
  primeiro_lead_em: string | null
  trend: TrendItem[]
}

function fmtBrl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function mesesAtivo(iso: string) {
  const start = new Date(iso)
  const now = new Date()
  const months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth())
  return Math.max(1, months)
}

const STAT_CFG = [
  { key: 'captacoes',        label: 'Total de Leads',    icon: Users,    color: '#2563EB', bg: 'linear-gradient(135deg,#EFF6FF,#DBEAFE)', border: '#BFDBFE', fmt: (v: number) => String(v) },
  { key: 'em_andamento',     label: 'Em Andamento',      icon: Clock3,   color: '#7C3AED', bg: 'linear-gradient(135deg,#F5F3FF,#EDE9FE)', border: '#DDD6FE', fmt: (v: number) => String(v) },
  { key: 'cancelados',       label: 'Cancelados',        icon: XCircle,  color: '#DC2626', bg: 'linear-gradient(135deg,#FEF2F2,#FEE2E2)', border: '#FECACA', fmt: (v: number) => String(v) },
  { key: 'conversao',        label: 'Conversão Geral',   icon: Percent,  color: '#059669', bg: 'linear-gradient(135deg,#ECFDF5,#D1FAE5)', border: '#A7F3D0', fmt: (v: number) => `${v}%` },
  { key: 'receita_recebida', label: 'Receita Recebida',  icon: Wallet,   color: '#059669', bg: 'linear-gradient(135deg,#ECFDF5,#D1FAE5)', border: '#A7F3D0', fmt: fmtBrl },
  { key: 'receita_a_receber',label: 'Receita a Receber', icon: Wallet,   color: '#D97706', bg: 'linear-gradient(135deg,#FFFBEB,#FEF3C7)', border: '#FDE68A', fmt: fmtBrl },
] as const

export default function VidaSDR() {
  const { origens } = useParams<{ origens: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const nome = searchParams.get('nome') || origens || 'SDR'

  const [data, setData] = useState<VidaSdrData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!origens) return
    setLoading(true)
    api.get<VidaSdrData>(`/api/v1/gestao-comercial/vida-sdr?${new URLSearchParams({ origens })}`)
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [origens])

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 24px 60px' }}>
      <button
        onClick={() => navigate(-1)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 13, fontWeight: 500, padding: '4px 0', marginBottom: 20 }}
      >
        <ArrowLeft size={16} /> Voltar
      </button>

      {/* Hero */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 20, padding: '28px 32px', borderRadius: 20, marginBottom: 28,
        background: 'linear-gradient(135deg,#1E3A8A,#2563EB 60%,#3B82F6)', boxShadow: '0 8px 30px rgba(37,99,235,0.25)',
      }}>
        <div style={{
          flexShrink: 0, width: 68, height: 68, borderRadius: '50%',
          background: 'rgba(255,255,255,0.15)', border: '2px solid rgba(255,255,255,0.35)',
          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 24, fontWeight: 800, letterSpacing: '0.02em', backdropFilter: 'blur(4px)',
        }}>
          {initials(nome)}
        </div>
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px' }}>
            Vida do SDR
          </p>
          <p style={{ fontSize: 26, fontWeight: 800, color: '#fff', margin: 0, letterSpacing: '-0.01em' }}>{nome}</p>
          {data?.primeiro_lead_em && (
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', margin: '4px 0 0' }}>
              Desde {fmtDate(data.primeiro_lead_em)} · {mesesAtivo(data.primeiro_lead_em)} {mesesAtivo(data.primeiro_lead_em) === 1 ? 'mês' : 'meses'} ativo
            </p>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '60px 0', color: 'var(--text-subtle)' }}>
          <Loader2 size={18} className="animate-spin" /> Carregando…
        </div>
      ) : !data || data.captacoes === 0 ? (
        <p style={{ textAlign: 'center', color: 'var(--text-subtle)', padding: '60px 0' }}>Nenhum lead encontrado para este SDR.</p>
      ) : (
        <>
          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 28 }}>
            {STAT_CFG.filter(({ key }) => data[key as keyof VidaSdrData] != null).map(({ key, label, icon: Icon, color, bg, border, fmt }) => (
              <div key={key} style={{ background: bg, borderRadius: 16, padding: '20px 22px', border: `1px solid ${border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
                  <Icon size={16} color={color} />
                </div>
                <p style={{ fontSize: 28, fontWeight: 800, color, margin: 0, letterSpacing: '-0.01em' }}>
                  {fmt(data[key as keyof VidaSdrData] as number)}
                </p>
              </div>
            ))}
          </div>

          {/* Trend */}
          <div style={{ background: 'var(--bg-card)', borderRadius: 16, padding: '22px 26px', border: '1px solid var(--border-lt)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', margin: '0 0 2px' }}>Evolução</p>
            <p style={{ fontSize: 11, color: 'var(--text-subtle)', margin: '0 0 18px' }}>Captações e vendas por mês, desde o primeiro lead</p>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={data.trend} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis dataKey="mes_label" tick={{ fontSize: 10, fill: '#94A3B8' }} interval={Math.max(0, Math.ceil(data.trend.length / 12) - 1)} />
                <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }}
                  formatter={(val: number, name: string) => [val, name === 'captacoes' ? 'Captações' : 'Vendas']} />
                <Legend formatter={(v) => v === 'captacoes' ? 'Captações' : 'Vendas'} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="captacoes" stroke="#3B82F6" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="vendas"    stroke="#10B981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  )
}
