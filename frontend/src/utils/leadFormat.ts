import { parseUTC } from './date'

export function fmtDate(iso: string) {
  return new Date(parseUTC(iso)).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function fmtDateOnly(iso: string) {
  return new Date(parseUTC(iso)).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function fmtDuration(ms: number) {
  if (ms < 0) ms = 0
  const totalMin = Math.floor(ms / 60000)
  const days = Math.floor(totalMin / 1440)
  const hours = Math.floor((totalMin % 1440) / 60)
  const min = totalMin % 60
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${min}min`
  return `${min}min`
}

export function fmtClock(ms: number) {
  if (ms < 0) ms = 0
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h >= 24) return fmtDuration(ms)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function fmtRelative(iso: string) {
  return `há ${fmtDuration(Date.now() - parseUTC(iso))}`
}

export function fmtBRL(n: number | null) {
  if (n == null || n === 0) return '—'
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Converte texto digitado em formato BR ("38.073,62") pra numero JS. Se nao
 * houver virgula, assume que o ponto (se existir) ja e' separador decimal --
 * Number() puro quebra com virgula (vira NaN e a API descarta o valor). */
export function parseBRNumber(s: string): number {
  const t = s.trim()
  return t.includes(',') ? Number(t.replace(/\./g, '').replace(',', '.')) : Number(t)
}
