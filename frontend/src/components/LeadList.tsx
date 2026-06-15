interface Lead {
  id: string
  name: string
  email?: string
  phone?: string
  company?: string
  status?: string
  origin?: string
  value_potential?: number
  created_at: string
}

interface Props {
  leads: Lead[]
}

export default function LeadList({ leads }: Props) {
  if (leads.length === 0) {
    return <p className="text-gray-400 text-sm text-center py-10">Nenhum lead encontrado.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
          <tr>
            <th className="px-4 py-3">Nome</th>
            <th className="px-4 py-3">Email</th>
            <th className="px-4 py-3">Telefone</th>
            <th className="px-4 py-3">Empresa</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Origem</th>
            <th className="px-4 py-3">Valor</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {leads.map((lead) => (
            <tr key={lead.id} className="hover:bg-gray-50 transition">
              <td className="px-4 py-3 font-medium text-gray-800">{lead.name}</td>
              <td className="px-4 py-3 text-gray-600">{lead.email ?? '—'}</td>
              <td className="px-4 py-3 text-gray-600">{lead.phone ?? '—'}</td>
              <td className="px-4 py-3 text-gray-600">{lead.company ?? '—'}</td>
              <td className="px-4 py-3">
                <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">
                  {lead.status ?? 'novo'}
                </span>
              </td>
              <td className="px-4 py-3 text-gray-600">{lead.origin ?? '—'}</td>
              <td className="px-4 py-3 text-gray-600">
                {lead.value_potential != null
                  ? `R$ ${Number(lead.value_potential).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                  : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
