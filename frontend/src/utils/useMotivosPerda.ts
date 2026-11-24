import { useEffect, useState } from 'react'
import api from '../api'

export interface MotivoPerda { nome: string; ativo: boolean }

// lista padrão enquanto a API não responde (mesma do backend, app/motivos_perda.py)
const PADRAO: MotivoPerda[] = [
  'Cliente não retornou contato', 'Trocou de número', 'Declinou', 'Finalizado automaticamente',
  'Localização', 'Preço', 'Sem interesse', 'Sem perfil', 'Sem retorno',
].map(nome => ({ nome, ativo: true }))

let cache: MotivoPerda[] | null = null

export function setMotivosPerdaCache(lista: MotivoPerda[]) { cache = lista }

// Motivos de perda ATIVOS, na ordem cadastrada em Configurações > Motivos de perda.
export function useMotivosPerda(): string[] {
  const [lista, setLista] = useState<MotivoPerda[]>(cache ?? PADRAO)
  useEffect(() => {
    let vivo = true
    api.get<MotivoPerda[]>('/api/v1/leads/motivos-perda')
      .then(r => { cache = r.data; if (vivo) setLista(r.data) })
      .catch(() => {})
    return () => { vivo = false }
  }, [])
  return lista.filter(m => m.ativo).map(m => m.nome)
}
