import axios from 'axios'

// Dev: VITE_API_URL=http://localhost:8000 (via frontend/.env)
// Prod: VITE_API_URL="" — nginx em :80 faz proxy de /api/* para backend:8000
const api = axios.create({ baseURL: import.meta.env.VITE_API_URL ?? '' })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
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
    // Fora da janela de horário permitida — mostra tela dedicada, sem derrubar
    // a sessão (o usuário volta às 9h e continua logado).
    const detail = error.response?.data?.detail
    if (error.response?.status === 403 && detail?.code === 'fora_janela' && window.location.pathname !== '/acesso-bloqueado') {
      try { sessionStorage.setItem('acessoBloqueadoMsg', detail.message ?? '') } catch { /* ignore */ }
      window.location.href = '/acesso-bloqueado'
    }
    return Promise.reject(error)
  }
)

export default api
