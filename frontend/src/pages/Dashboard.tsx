import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'
import NavBar from '../components/NavBar'
import LeadList from '../components/LeadList'
import CreateLeadForm from '../components/CreateLeadForm'

interface Lead {
  id: string
  name: string
  email?: string
  phone?: string
  company?: string
  status?: string
  origin?: string
  value_potential?: number
  notes?: string
  created_at: string
}

export default function Dashboard() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const navigate = useNavigate()

  const fetchLeads = useCallback(() => {
    setLoading(true)
    api
      .get<Lead[]>('/api/v1/leads')
      .then(({ data }) => setLeads(data))
      .catch((err) => {
        if (err.response?.status === 401) {
          localStorage.removeItem('token')
          navigate('/login')
        } else {
          setError('Erro ao carregar leads.')
        }
      })
      .finally(() => setLoading(false))
  }, [navigate])

  useEffect(() => {
    if (!localStorage.getItem('token')) {
      navigate('/login')
      return
    }
    fetchLeads()
  }, [fetchLeads, navigate])

  function handleLeadCreated(lead: Lead) {
    setLeads((prev) => [lead, ...prev])
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar />
      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-gray-800">Meus Leads</h2>
            <span className="text-sm text-gray-400">{leads.length} lead(s)</span>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 transition"
          >
            + Novo Lead
          </button>
        </div>

        <div className="bg-white rounded-xl shadow">
          {loading ? (
            <p className="text-gray-400 text-sm text-center py-10">Carregando...</p>
          ) : error ? (
            <p className="text-red-500 text-sm text-center py-10">{error}</p>
          ) : (
            <LeadList leads={leads} />
          )}
        </div>
      </main>

      {showForm && (
        <CreateLeadForm
          onSuccess={handleLeadCreated}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  )
}
