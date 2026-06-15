import { useNavigate } from 'react-router-dom'

export default function NavBar() {
  const navigate = useNavigate()

  function logout() {
    localStorage.removeItem('token')
    navigate('/login')
  }

  return (
    <nav className="bg-white border-b px-6 py-3 flex items-center justify-between">
      <span className="font-semibold text-gray-800">O2 Solution</span>
      <button
        onClick={logout}
        className="text-sm text-gray-500 hover:text-red-500 transition"
      >
        Sair
      </button>
    </nav>
  )
}
