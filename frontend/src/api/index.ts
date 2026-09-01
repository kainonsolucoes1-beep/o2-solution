import axios from 'axios'

// Identificador do navegador — usado pra trava de dispositivo confiável (1c).
// Persiste por navegador; some se o usuário limpar os dados do site.
export function deviceId(): string {
  try {
    let id = localStorage.getItem('o2_device_id')
    if (!id) {
      id = (crypto?.randomUUID?.() ?? String(Date.now()) + Math.random().toString(16).slice(2))
      localStorage.setItem('o2_device_id', id)
    }
    return id
  } catch {
    return 'sem-armazenamento'
  }
}

// Dev: VITE_API_URL=http://localhost:8000 (via frontend/.env)
// Prod: VITE_API_URL="" — nginx em :80 faz proxy de /api/* para backend:8000
const api = axios.create({ baseURL: import.meta.env.VITE_API_URL ?? '' })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  config.headers['X-Device-Id'] = deviceId()
  return config
})

// Token expirado/invalido: qualquer 401 derruba a sessao e manda pro login de
// verdade, em vez de deixar cada tela lidar com isso do jeito dela (o que
// fazia menus sumirem e telas ficarem "vazias" ate um reload manual).
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && window.location.pathname !== '/login') {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    if (error.response?.status === 403 && error.response?.data?.must_change_password && window.location.pathname !== '/change-password') {
      window.location.href = '/change-password'
    }
    // Trava de acesso (horário ou dispositivo) — mostra tela dedicada, sem
    // derrubar a sessão (o usuário volta ao horário / o admin aprova o aparelho).
    const detail = error.response?.data?.detail
    if (error.response?.status === 403 && (detail?.code === 'fora_janela' || detail?.code === 'device_pending')
        && window.location.pathname !== '/acesso-bloqueado' && window.location.pathname !== '/login') {
      try { sessionStorage.setItem('acessoBloqueadoMsg', detail.message ?? '') } catch { /* ignore */ }
      window.location.href = '/acesso-bloqueado'
    }
    return Promise.reject(error)
  }
)

export default api
