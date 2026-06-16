import { useNavigate, useLocation, Link } from 'react-router-dom'

const NAV_LINKS = [
  { to: '/dashboard',    label: 'Dashboard' },
  { to: '/leads-report', label: 'Relatório' },
  { to: '/pipeline',     label: 'Pipeline' },
]

export default function NavBar() {
  const navigate = useNavigate()
  const location = useLocation()

  function logout() {
    localStorage.removeItem('token')
    navigate('/login')
  }

  return (
    <nav className="bg-white border-b px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-6">
        <span className="font-semibold text-gray-800">O2 Solution</span>
        <div className="flex gap-1">
          {NAV_LINKS.map(link => {
            const active = location.pathname === link.to
            return (
              <Link
                key={link.to}
                to={link.to}
                style={{
                  fontSize: 13,
                  fontWeight: active ? 600 : 400,
                  color: active ? '#2563EB' : '#6B7280',
                  padding: '4px 10px',
                  borderRadius: 6,
                  background: active ? '#EFF6FF' : 'transparent',
                  textDecoration: 'none',
                  transition: 'color 150ms, background 150ms',
                }}
              >
                {link.label}
              </Link>
            )
          })}
        </div>
      </div>
      <button
        onClick={logout}
        className="text-sm text-gray-500 hover:text-red-500 transition"
      >
        Sair
      </button>
    </nav>
  )
}
