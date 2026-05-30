import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { inventoryApi, api } from '@/api'
import { Plus, Edit2, Trash2, Search, AlertTriangle, Loader2, Upload } from 'lucide-react'
import { useState } from 'react'
import { useSelector } from 'react-redux'
import type { RootState } from '@/store'
import { canManageWorkshopData, normalizeRole } from '@/lib/roles'
import BulkUploadModal from '@/components/BulkUploadModal'

export default function InventoryList() {
  const { t } = useTranslation()
  const user = useSelector((state: RootState) => state.auth.user)
  const canManage = canManageWorkshopData(normalizeRole(user?.role))
  const [search, setSearch] = useState('')
  const [showBulkUpload, setShowBulkUpload] = useState(false)
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['inventory', search],
    queryFn: () => inventoryApi.list({ search }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => inventoryApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
    },
  })

  const bulkUploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('file', file)
      const response = await api.post('/inventory/items/bulk_upload/', formData)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
    },
  })

  const handleBulkUpload = async (file: File) => {
    await bulkUploadMutation.mutateAsync(file)
  }

  const items = data?.data?.results || data?.data || []
  const lowStockItems = items.filter((item: any) => item.current_stock <= item.minimum_stock)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-workshop-charcoal">{t('inventory.title')}</h1>
          <p className="text-workshop-charcoal/60 mt-1">{t('inventory.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          {canManage && (
            <button
              type="button"
              onClick={() => setShowBulkUpload(true)}
              className="btn btn-outline flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              {t('inventory.bulkUpload')}
            </button>
          )}
          <Link to="/inventory/new" className="btn btn-primary">
            <Plus className="w-4 h-4 mr-2" />
            {t('inventory.addItem')}
          </Link>
        </div>
      </div>

      {lowStockItems.length > 0 && (
        <div className="card p-4 border-l-4 border-l-yellow-500">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-yellow-500" />
            <span className="font-medium text-workshop-charcoal">
              {t('inventory.lowStockAlert', { count: lowStockItems.length })}
            </span>
          </div>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-workshop-charcoal/40" />
        <input
          type="text"
          placeholder={t('inventory.searchPlaceholder')}
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
        ) : items.length > 0 ? (
          <div className="table-scroll-mobile">
            <table className="w-full">
              <thead className="bg-workshop-charcoal/5">
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-medium text-workshop-charcoal/60 uppercase">{t('inventory.sku')}</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-workshop-charcoal/60 uppercase">{t('inventory.name')}</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-workshop-charcoal/60 uppercase">{t('inventory.stock')}</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-workshop-charcoal/60 uppercase">{t('inventory.price')}</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-workshop-charcoal/60 uppercase">{t('inventory.status')}</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-workshop-charcoal/60 uppercase">{t('inventory.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-workshop-charcoal/10">
                {items.map((item: any) => (
                  <tr key={item.id} className="hover:bg-workshop-charcoal/5">
                    <td className="px-6 py-4 font-mono text-sm">{item.sku}</td>
                    <td className="px-6 py-4">
                      <span className="font-medium text-workshop-charcoal">{item.name}</span>
                      {item.manufacturer && (
                        <p className="text-sm text-workshop-charcoal/60">{item.manufacturer}</p>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`font-medium ${item.current_stock <= item.minimum_stock ? 'text-red-600' : 'text-workshop-charcoal'}`}>
                        {item.current_stock}
                      </span>
                      <span className="text-workshop-charcoal/40 text-sm"> / {item.minimum_stock} {t('inventory.min')}</span>
                    </td>
                    <td className="px-6 py-4 text-sm">€{parseFloat(item.sale_price).toFixed(2)}</td>
                    <td className="px-6 py-4">
                      {item.current_stock === 0 ? (
                        <span className="badge badge-danger">{t('inventory.outOfStock')}</span>
                      ) : item.current_stock <= item.minimum_stock ? (
                        <span className="badge badge-danger">{t('inventory.lowStock')}</span>
                      ) : (
                        <span className="badge badge-success">{t('inventory.inStock')}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          to={`/inventory/${item.id}/edit`}
                          className="p-2 text-workshop-charcoal/40 hover:text-workshop-blue transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </Link>
                        <button
                          onClick={() => {
                            if (confirm(t('inventory.deleteConfirm'))) {
                              deleteMutation.mutate(item.id)
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
            {t('inventory.noResults')}
          </div>
        )}
      </div>

      {showBulkUpload && (
        <BulkUploadModal
          onClose={() => setShowBulkUpload(false)}
          onUpload={handleBulkUpload}
        />
      )}
    </div>
  )
}
