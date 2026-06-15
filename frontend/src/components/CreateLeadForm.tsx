import { useState } from 'react'
import api from '../api'

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

interface Props {
  onSuccess: (lead: Lead) => void
  onClose: () => void
}

const EMPTY = {
  name: '',
  email: '',
  phone: '',
  company: '',
  origin: '',
  status: 'novo',
  value_potential: '',
  notes: '',
}

const STATUS_OPTIONS = ['novo', 'em andamento', 'convertido', 'perdido']

export default function CreateLeadForm({ onSuccess, onClose }: Props) {
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState<Partial<typeof EMPTY>>({})
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function set(field: keyof typeof EMPTY) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }))
  }

  function validate() {
    const e: Partial<typeof EMPTY> = {}
    if (!form.name.trim()) e.name = 'Nome é obrigatório'
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      e.email = 'Email inválido'
    if (form.value_potential && isNaN(Number(form.value_potential)))
      e.value_potential = 'Valor deve ser numérico'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function showToast(message: string, type: 'success' | 'error') {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return

    setSubmitting(true)
    try {
      const payload = {
        ...form,
        value_potential: form.value_potential ? Number(form.value_potential) : null,
        email: form.email || null,
        phone: form.phone || null,
        company: form.company || null,
        origin: form.origin || null,
        notes: form.notes || null,
      }
      const { data } = await api.post<Lead>('/api/v1/leads', payload)
      showToast('Lead criado com sucesso!', 'success')
      setTimeout(() => {
        onSuccess(data)
        onClose()
      }, 800)
    } catch (err: any) {
      const detail = err.response?.data?.detail
      if (err.response?.status === 409) {
        showToast('Já existe um lead com este email.', 'error')
      } else {
        showToast(detail ?? 'Erro ao criar lead.', 'error')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg text-sm font-medium shadow-lg transition-all
            ${toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}
        >
          {toast.message}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="text-base font-semibold text-gray-800">Novo Lead</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nome *</label>
            <input
              type="text"
              value={form.name}
              onChange={set('name')}
              placeholder="Nome do lead"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
          </div>

          {/* Email + Phone */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
              <input
                type="text"
                value={form.email}
                onChange={set('email')}
                placeholder="email@exemplo.com"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Telefone</label>
              <input
                type="text"
                value={form.phone}
                onChange={set('phone')}
                placeholder="(11) 99999-0000"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Company + Origin */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Empresa</label>
              <input
                type="text"
                value={form.company}
                onChange={set('company')}
                placeholder="Empresa"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Origem</label>
              <input
                type="text"
                value={form.origin}
                onChange={set('origin')}
                placeholder="Ex: site, indicação"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Status + Value */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
              <select
                value={form.status}
                onChange={set('status')}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Valor potencial (R$)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.value_potential}
                onChange={set('value_potential')}
                placeholder="0,00"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {errors.value_potential && <p className="text-red-500 text-xs mt-1">{errors.value_potential}</p>}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Observações</label>
            <textarea
              value={form.notes}
              onChange={set('notes')}
              placeholder="Observações sobre o lead..."
              rows={3}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {submitting ? 'Salvando...' : 'Criar lead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
