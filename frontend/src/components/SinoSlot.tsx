import { useSyncExternalStore } from 'react'

// Encaixe do sino de notificações no cabeçalho da página. A página coloca
// <SinoSlot /> ao lado dos botões do topo (ex: Filtros) e o Sidebar renderiza
// o sino ali dentro (portal), alinhado com o resto. Página sem encaixe: o sino
// segue flutuando fixo no canto superior direito.
let slot: HTMLElement | null = null
const subs = new Set<() => void>()

function setSlot(el: HTMLElement | null) {
  if (el === slot) return
  slot = el
  subs.forEach(fn => fn())
}

export function useSinoSlot() {
  return useSyncExternalStore(
    cb => { subs.add(cb); return () => { subs.delete(cb) } },
    () => slot,
  )
}

export default function SinoSlot() {
  return <div ref={setSlot} style={{ position: 'relative', display: 'flex', alignItems: 'center' }} />
}
