// backend grava os timestamps em UTC mas sem sufixo 'Z'; sem isso o navegador
// interpreta a string como horario local, adiantando tudo pelo fuso (ex.: 3h no Brasil)
export function parseUTC(iso: string): number {
  const hasTZ = /Z$/.test(iso) || /[+-]\d{2}:?\d{2}$/.test(iso)
  return new Date(hasTZ ? iso : iso + 'Z').getTime()
}
