import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { visitsApi, api } from '@/api'
import { Wrench, Plus, Edit2, Trash2, Search } from 'lucide-react'
import { useState } from 'react'
import { useSelector } from 'react-redux'
import type { RootState } from '@/store'
import { canManageWorkshopData, normalizeRole } from '@/lib/roles'
import { useTranslation } from 'react-i18next'

export default function ServiceCatalogList() {
  const { t } = useTranslation()
  const user = useSelector((state: RootState) => state.auth.user)
  const canManage = canManageWorkshopData(normalizeRole(user?.role))
  const queryClient = useQueryClient()
  const [searchTerm, setSearchTerm] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const { data: catalogData, isLoading } = useQuery({
    queryKey: ['service-catalog'],
    queryFn: () => visitsApi.catalog.list(),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/visits/catalog/${id}/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-catalog'] })
      setDeleteConfirm(null)
    },
  })

  const catalog = catalogData?.data?.results || catalogData?.data || []
  const filteredCatalog = catalog.filter(
    (item: { name: string; description?: string }) =>
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.description?.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-workshop-charcoal">{t('services.title')}</h1>
          <p className="text-workshop-charcoal/60 mt-1">{t('services.description')}</p>
        </div>
        {canManage && (
          <Link to="/services/new" className="btn btn-primary">
            <Plus className="w-4 h-4 mr-2" />
            {t('services.addService')}
          </Link>
        )}
      </div>

      <div className="card p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-workshop-charcoal/40" />
          <input
            type="text"
            placeholder={t('services.searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input pl-10"
          />
        </div>
      </div>

      <div className="card">
        {isLoading ? (
          <div className="p-8 text-center text-workshop-charcoal/40">{t('services.loading')}</div>
        ) : filteredCatalog.length > 0 ? (
          <div className="divide-y divide-workshop-charcoal/10">
            {filteredCatalog.map((item: {
              id: string
              name: string
              description?: string
              default_duration_hours: number
              default_price: string | number
              is_active: boolean
            }) => (
              <div
                key={item.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-workshop-charcoal/5"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-10 h-10 bg-workshop-blue/10 text-workshop-blue rounded-lg flex items-center justify-center shrink-0">
                    <Wrench className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-workshop-charcoal">{item.name}</p>
                    {item.description && (
                      <p className="text-sm text-workshop-charcoal/60">{item.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 sm:gap-6 shrink-0 flex-wrap">
                  <div className="text-right">
                    <p className="text-sm font-medium">
                      {t('services.durationHours', { hours: item.default_duration_hours })}
                    </p>
                    <p className="text-xs text-workshop-charcoal/40">{t('services.duration')}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-workshop-blue">{item.default_price}</p>
                    <p className="text-xs text-workshop-charcoal/40">{t('services.price')}</p>
                  </div>
                  <span className={`badge ${item.is_active ? 'badge-success' : 'badge-danger'}`}>
                    {item.is_active ? t('services.active') : t('services.inactive')}
                  </span>
                  {canManage && (
                    <div className="flex gap-2">
                      <Link
                        to={`/services/${item.id}/edit`}
                        className="p-2 text-workshop-charcoal/40 hover:text-workshop-blue transition-colors"
                        aria-label={t('common.edit')}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Link>
                      <button
                        type="button"
                        onClick={() => setDeleteConfirm(item.id)}
                        className="p-2 text-workshop-charcoal/40 hover:text-red-600 transition-colors"
                        aria-label={t('common.delete')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-workshop-charcoal/40">
            {searchTerm ? t('services.noResults') : t('services.empty')}
          </div>
        )}
      </div>

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="card p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">{t('services.deleteTitle')}</h3>
            <p className="text-workshop-charcoal/60 mb-6">{t('services.deleteMessage')}</p>
            <div className="flex gap-3 justify-end">
              <button type="button" onClick={() => setDeleteConfirm(null)} className="btn btn-outline">
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={() => deleteMutation.mutate(deleteConfirm)}
                className="btn btn-danger"
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? t('services.deleting') : t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
