// backend grava os timestamps em UTC mas sem sufixo 'Z'; sem isso o navegador
// interpreta a string como horario local, adiantando tudo pelo fuso (ex.: 3h no Brasil)
export function parseUTC(iso: string): number {
  const hasTZ = /Z$/.test(iso) || /[+-]\d{2}:?\d{2}$/.test(iso)
  return new Date(hasTZ ? iso : iso + 'Z').getTime()
}

// Dias de calendário (fuso local) entre o timestamp e hoje -- não blocos de 24h,
// senão "ontem 15h" visto "hoje 10h" dá 0 e aparece como "hoje"
export function calendarDaysAgo(ms: number): number {
  const d = new Date(ms)
  const n = new Date()
  const a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  const b = Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())
  return Math.round((b - a) / 86400000)
}
