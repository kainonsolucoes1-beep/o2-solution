import type { LucideIcon } from 'lucide-react'

interface MetricCardProps {
  label: string
  value: string
  icon: LucideIcon
  loading?: boolean
  trend?: number | null
  invert?: boolean
  alertIfZero?: boolean
  rawValue?: number
  clickable?: boolean
  onClick?: () => void
  /** Sobrepoe o calculo automatico por tendencia -- usado quando o card nao
   * tem "periodo anterior" pra comparar (ex: contagem de estagio de funil),
   * mas ainda assim precisa fixar uma cor semantica (bom/ruim/neutro). */
  tone?: 'neutral' | 'good' | 'bad'
  /** Cor so' do icone/circulo, independente do `tone` (que continua regendo
   * a borda e a seta de tendencia) -- da' identidade visual a cards que sao
   * neutros de proposito (ex: estagios de funil que nao sao bom/ruim). */
  iconTint?: { bg: string; color: string }
}

const NEUTRAL = { border: 'var(--border-in)', iconBg: 'var(--bg-subtle)', iconColor: 'var(--text-muted)' }
const GOOD    = { border: '#10B981', iconBg: '#ECFDF5', iconColor: '#10B981' }
const BAD     = { border: '#EF4444', iconBg: '#FEF2F2', iconColor: '#EF4444' }

// Card neutro por padrao (fundo branco, borda cinza) -- so ganha cor quando o
// dado exige: tendencia boa/ruim (respeitando `invert`, ex: perda financeira
// caindo e' bom) ou um valor critico zerado (`alertIfZero`), que usa fundo
// vermelho suave de proposito, mais chamativo que a borda colorida da tendencia.
export default function MetricCard({
  label, value, icon: Icon, loading, trend, invert, alertIfZero, rawValue, clickable, onClick, tone: toneProp, iconTint,
}: MetricCardProps) {
  const isCriticalZero = alertIfZero && rawValue === 0
  const trendGood = trend == null ? null : (invert ? trend <= 0 : trend >= 0)
  const computedTone = isCriticalZero ? BAD : trendGood === true ? GOOD : trendGood === false ? BAD : NEUTRAL
  const tone = toneProp === 'good' ? GOOD : toneProp === 'bad' ? BAD : toneProp === 'neutral' ? NEUTRAL : computedTone
  const iconBg = iconTint && !isCriticalZero ? iconTint.bg : tone.iconBg
  const iconColor = iconTint && !isCriticalZero ? iconTint.color : tone.iconColor

  return (
    <div
      onClick={onClick}
      style={{
        background: isCriticalZero ? '#FEF2F2' : 'var(--bg-card)',
        border: `1px solid ${isCriticalZero ? '#FECACA' : 'var(--border)'}`,
        borderLeft: `3px solid ${tone.border}`,
        borderRadius: 14, padding: '18px 20px',
        cursor: clickable ? 'pointer' : 'default',
        transition: 'border-color 150ms, box-shadow 150ms',
      }}
      onMouseEnter={e => { if (clickable) (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 14px rgba(15,23,42,.08)' }}
      onMouseLeave={e => { if (clickable) (e.currentTarget as HTMLElement).style.boxShadow = '' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {label}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {trend != null && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 10, fontWeight: 700, color: tone.border, whiteSpace: 'nowrap' }}>
              {trend >= 0 ? '▲' : '▼'}{Math.abs(trend)}%
            </span>
          )}
          <div style={{ width: 32, height: 32, borderRadius: 8, background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon size={15} color={iconColor} />
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <p style={{ fontSize: 25, fontWeight: 700, color: isCriticalZero ? '#B91C1C' : 'var(--text-1)', margin: 0, lineHeight: 1 }}>
          {loading ? '—' : value}
        </p>
        {isCriticalZero && (
          <span style={{ fontSize: 10.5, fontWeight: 700, color: '#B91C1C' }}>Atenção</span>
        )}
        {!isCriticalZero && clickable && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 2 }}>Ver detalhes →</span>
        )}
      </div>
    </div>
  )
}