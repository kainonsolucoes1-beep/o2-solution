export type FiltroPeriodo = 'mes_atual' | 'geral' | 'entre_datas'

// yyyy-mm-dd a partir de componentes locais — evita o shift de fuso de toISOString()
export function fmtYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function mesAtualRange(): { date_from: string; date_to: string } {
  const now = new Date()
  return {
    date_from: fmtYMD(new Date(now.getFullYear(), now.getMonth(), 1)),
    date_to: fmtYMD(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  }
}
