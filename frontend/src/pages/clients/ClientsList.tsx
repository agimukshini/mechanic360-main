import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { clientsApi } from '@/api'
import { Plus, Edit2, Trash2, Search, Loader2 } from 'lucide-react'
import { useState } from 'react'

export default function ClientsList() {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['clients', search],
    queryFn: () => clientsApi.list({ search }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => clientsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
    },
  })

  const clients = data?.data?.results || data?.data || []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-workshop-charcoal">{t('clients.title')}</h1>
          <p className="text-workshop-charcoal/60 mt-1">{t('clients.subtitle')}</p>
        </div>
        <Link to="/clients/new" className="btn btn-primary">
          <Plus className="w-4 h-4 mr-2" />
          {t('clients.addClient')}
        </Link>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-workshop-charcoal/40" />
        <input
          type="text"
          placeholder={t('clients.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input pl-10 max-w-md"
        />
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-workshop-blue" />
          </div>
        ) : clients.length > 0 ? (
          <div className="table-scroll-mobile">
            <table className="w-full">
              <thead className="bg-workshop-charcoal/5">
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-medium text-workshop-charcoal/60 uppercase">{t('clients.name')}</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-workshop-charcoal/60 uppercase">{t('clients.type')}</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-workshop-charcoal/60 uppercase">{t('clients.email')}</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-workshop-charcoal/60 uppercase">{t('clients.phone')}</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-workshop-charcoal/60 uppercase">{t('clients.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-workshop-charcoal/10">
                {clients.map((client: any) => (
                  <tr key={client.id} className="hover:bg-workshop-charcoal/5">
                    <td className="px-6 py-4">
                      <Link
                        to={`/clients/${client.id}`}
                        className="font-medium text-workshop-charcoal hover:text-workshop-blue transition-colors"
                      >
                        {client.type === 'company' ? client.company_name : client.name}
                      </Link>
                    </td>
                    <td className="px-6 py-4">
                      <span className="badge badge-info">
                        {client.type === 'company' ? t('clients.company') : t('clients.individual')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-workshop-charcoal/60">{client.email}</td>
                    <td className="px-6 py-4 text-sm text-workshop-charcoal/60">{client.phone}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          to={`/clients/${client.id}/edit`}
                          className="p-2 text-workshop-charcoal/40 hover:text-workshop-blue transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </Link>
                        <button
                          onClick={() => {
                            if (confirm(t('clients.deleteConfirm'))) {
                              deleteMutation.mutate(client.id)
                            }
                          }}
                          className="p-2 text-workshop-charcoal/40 hover:text-red-600 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center text-workshop-charcoal/40">
            {t('clients.noResults')}
          </div>
        )}
      </div>
    </div>
  )
}
