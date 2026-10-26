import { useEffect, useRef, useState } from 'react'
import { RefreshCw, X } from 'lucide-react'

// O o2 Sig carrega o JS uma vez só: aba aberta antes de uma publicação segue
// rodando o código antigo até recarregar. Aqui compara o pacote desta aba
// (/assets/index-<hash>.js) com o que o servidor publica agora e, se mudou,
// avisa com um botão de recarregar -- nunca recarrega sozinho, pra não perder
// o que a pessoa estiver digitando.
const PACOTE_RE = /\/assets\/index-[^"']+\.js/
const INTERVALO_MS = 5 * 60 * 1000

function pacoteDaAba(): string | null {
  const s = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]')
  const m = s?.getAttribute('src')?.match(PACOTE_RE)
  return m ? m[0] : null
}

export default function NovaVersaoAviso() {
  const [nova, setNova] = useState<string | null>(null)
  const [dispensada, setDispensada] = useState<string | null>(null)
  const atual = useRef(pacoteDaAba())

  useEffect(() => {
    if (!atual.current) return  // ambiente de desenvolvimento (vite dev): sem pacote
    let parado = false
    const verificar = () => {
      if (document.visibilityState !== 'visible') return
      fetch('/', { cache: 'no-store' })
        .then(r => (r.ok ? r.text() : ''))
        .then(html => {
          const m = html.match(PACOTE_RE)
          if (!parado && m && m[0] !== atual.current) setNova(m[0])
        })
        .catch(() => {})
    }
    const id = setInterval(verificar, INTERVALO_MS)
    document.addEventListener('visibilitychange', verificar)
    window.addEventListener('focus', verificar)
    return () => {
      parado = true
      clearInterval(id)
      document.removeEventListener('visibilitychange', verificar)
      window.removeEventListener('focus', verificar)
    }
  }, [])

  if (!nova || nova === dispensada) return null

  return (
    <div role="status" style={{
      position: 'fixed', bottom: 20, left: 16, right: 16, margin: '0 auto', width: 'fit-content', maxWidth: 640, zIndex: 99998,
      display: 'flex', alignItems: 'center', gap: 12,
      background: '#1E293B', color: '#F1F5F9', borderRadius: 12, padding: '10px 10px 10px 16px',
      boxShadow: '0 10px 30px rgba(15,23,42,0.35)', fontSize: 13,
    }}>
      <span style={{ lineHeight: 1.4 }}><b style={{ fontWeight: 700 }}>Nova versão do o2 Sig disponível.</b> Recarregue para usar as últimas mudanças.</span>
      <button
        onClick={() => window.location.reload()}
        style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, border: 'none', borderRadius: 8, padding: '7px 12px', background: '#2563EB', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
      >
        <RefreshCw size={13} /> Recarregar
      </button>
      <button
        onClick={() => setDispensada(nova)} aria-label="Fechar aviso" title="Agora não"
        style={{ display: 'flex', flexShrink: 0, border: 'none', background: 'transparent', color: '#94A3B8', cursor: 'pointer', padding: 4 }}
      >
        <X size={16} />
      </button>
    </div>
  )
}
