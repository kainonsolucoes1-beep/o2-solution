import axios from 'axios'

// Dev: VITE_API_URL=http://localhost:8000 (via frontend/.env)
// Prod: VITE_API_URL="" — nginx em :80 faz proxy de /api/* para backend:8000
const api = axios.create({ baseURL: import.meta.env.VITE_API_URL ?? '' })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export default api
