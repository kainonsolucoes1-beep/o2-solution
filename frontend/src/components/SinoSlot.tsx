import { useSyncExternalStore } from 'react'

// Encaixes no cabeçalho da página pra elementos globais que antes flutuavam
// fixos no canto superior direito e ficavam por cima dos botões do topo:
// - <SinoSlot />: à direita do Filtros -- o Sidebar renderiza o sino ali (portal)
// - <VerComoSlot />: à esquerda do Filtros -- o seletor "Ver como" (só staging)
// Página sem encaixe: o elemento segue flutuando fixo no canto.
function createSlot() {
  let slot: HTMLElement | null = null
  const subs = new Set<() => void>()
  const setSlot = (el: HTMLElement | null) => {
    if (el === slot) return
    slot = el
    subs.forEach(fn => fn())
  }
  const useSlot = () => useSyncExternalStore(
    cb => { subs.add(cb); return () => { subs.delete(cb) } },
    () => slot,
  )
  const Slot = () => <div ref={setSlot} style={{ position: 'relative', display: 'flex', alignItems: 'center' }} />
  return { useSlot, Slot }
}

const sino = createSlot()
const verComo = createSlot()

export const useSinoSlot = sino.useSlot
export const useVerComoSlot = verComo.useSlot
export const VerComoSlot = verComo.Slot
export default sino.Slot
