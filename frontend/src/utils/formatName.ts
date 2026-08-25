const NAME_CONNECTIVES = new Set(['de', 'da', 'das', 'do', 'dos', 'e'])

function capitalizeWord(word: string): string {
  return word
    .split('-')
    .map(part => (part ? part.charAt(0).toLocaleUpperCase('pt-BR') + part.slice(1) : part))
    .join('-')
}

/**
 * Normaliza a apresentação de um nome próprio (não altera o dado original).
 * Só mexe em palavras inteiramente maiúsculas ou minúsculas -- uma palavra
 * com capitalização mista (ex.: "McDonald", sigla embutida) é preservada
 * como está, pra não estragar formatação já correta.
 */
export function formatPersonName(name: string | null | undefined): string {
  if (!name) return ''
  const words = name.trim().split(/\s+/)
  return words
    .map((word, i) => {
      const upper = word.toLocaleUpperCase('pt-BR')
      const lower = word.toLocaleLowerCase('pt-BR')
      const isAllUpper = word === upper && word !== lower
      const isAllLower = word === lower && word !== upper
      if (!isAllUpper && !isAllLower) return word
      if (i > 0 && NAME_CONNECTIVES.has(lower)) return lower
      return capitalizeWord(lower)
    })
    .join(' ')
}
