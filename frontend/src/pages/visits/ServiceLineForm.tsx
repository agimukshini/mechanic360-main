import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSelector } from 'react-redux'
import { visitsApi } from '@/api'
import { X } from 'lucide-react'
import { useApiToast } from '@/hooks/useApiToast'
import MechanicSelect from '@/components/visits/MechanicSelect'
import { canManageWorkshopData, normalizeRole } from '@/lib/roles'
import type { RootState } from '@/store'

interface ServiceLineFormProps {
  isOpen: boolean
  onClose: () => void
}

export default function ServiceLineForm({ isOpen, onClose }: ServiceLineFormProps) {
  const { t } = useTranslation()
  const { showError } = useApiToast()
  const { id: visitId } = useParams()
  const queryClient = useQueryClient()
  const { user } = useSelector((state: RootState) => state.auth)
  const canAssignMechanic = canManageWorkshopData(normalizeRole(user?.role))
  const [useCatalog, setUseCatalog] = useState(true)
  const [selectedCatalogItem, setSelectedCatalogItem] = useState('')
  const [performedById, setPerformedById] = useState('')
  const [formData, setFormData] = useState({
    description: '',
    quantity: '1',
    unitPrice: '0',
    totalPrice: '0',
  })

  const { data: visitData } = useQuery({
    queryKey: ['visit', visitId],
    queryFn: () => visitsApi.get(visitId!),
    enabled: isOpen && !!visitId,
  })

  const { data: catalogData } = useQuery({
    queryKey: ['service-catalog'],
    queryFn: () => visitsApi.catalog.list(),
    enabled: useCatalog && isOpen,
  })

  useEffect(() => {
    if (!isOpen) return
    const assigned = visitData?.data?.vehicle?.assigned_mechanic?.id
    if (assigned && canAssignMechanic) {
      setPerformedById(assigned)
    }
  }, [isOpen, visitData, canAssignMechanic])

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      visitsApi.serviceLines.create({
        visit_id: visitId,
        catalog_item: useCatalog && selectedCatalogItem ? selectedCatalogItem : undefined,
        ...data,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-lines', { visit: visitId }] })
      resetForm()
      onClose()
    },
    onError: (error: unknown) => showError(error, t('visits.addServiceFailed')),
  })

  const handleCatalogSelect = (itemId: string) => {
    setSelectedCatalogItem(itemId)
    const items = catalogData?.data?.results || catalogData?.data || []
    const item = items.find((i: { id: string }) => i.id === itemId)
    if (item) {
      const price = parseFloat(item.default_price || 0)
      setFormData({
        description: item.name,
        quantity: '1',
        unitPrice: price.toString(),
        totalPrice: price.toString(),
      })
    }
  }

  const handleQuantityChange = (quantity: string) => {
    const unitPrice = parseFloat(formData.unitPrice || '0')
    const total = parseFloat(quantity || '0') * unitPrice
    setFormData((prev) => ({ ...prev, quantity, totalPrice: total.toFixed(2) }))
  }

  // Mechanics need to override the catalog price (rounding, discounts, special
  // jobs). Editing the unit price recomputes the total; editing the total
  // directly is the final say (no back-calc to unit price — keeps the audit
  // simple and lets the user set any number).
  const handleUnitPriceChange = (unitPrice: string) => {
    const qty = parseFloat(formData.quantity || '0')
    const total = qty * parseFloat(unitPrice || '0')
    setFormData((prev) => ({ ...prev, unitPrice, totalPrice: total.toFixed(2) }))
  }

  const handleTotalPriceChange = (totalPrice: string) => {
    setFormData((prev) => ({ ...prev, totalPrice }))
  }

  const resetForm = () => {
    setFormData({
      description: '',
      quantity: '1',
      unitPrice: '0',
      totalPrice: '0',
    })
    setSelectedCatalogItem('')
    setPerformedById('')
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const payload: Record<string, unknown> = {
      description: formData.description,
      quantity: parseFloat(formData.quantity),
      unit_price: parseFloat(formData.unitPrice),
      total_price: parseFloat(formData.totalPrice),
    }
    if (canAssignMechanic) {
      payload.performed_by_id = performedById
    }
    createMutation.mutate(payload)
  }

  if (!isOpen) return null

  return createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
      <div className="card p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold">{t('visits.addServiceLine')}</h3>
          <button type="button" onClick={onClose} className="p-1 hover:bg-workshop-charcoal/5 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={useCatalog}
                onChange={(e) => setUseCatalog(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm">{t('visits.useCatalogItem')}</span>
            </label>
          </div>

          {useCatalog && (
            <div>
              <label className="block text-sm font-medium mb-2">{t('visits.catalogItem')}</label>
              {!catalogData?.data?.length && !catalogData?.data?.results ? (
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-sm">
                  <p className="font-medium text-yellow-800">{t('visits.noCatalogItems')}</p>
                </div>
              ) : (
                <select
                  value={selectedCatalogItem}
                  onChange={(e) => handleCatalogSelect(e.target.value)}
                  className="input w-full"
                  required
                >
                  <option value="">{t('visits.selectService')}</option>
                  {(catalogData?.data?.results || catalogData?.data || []).map((item: { id: string; name: string; default_price: string | number }) => (
                    <option key={item.id} value={item.id}>
                      {item.name} - €{item.default_price}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-2">{t('visits.description')}</label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
              className="input w-full"
              required
            />
          </div>

          {canAssignMechanic && (
            <MechanicSelect value={performedById} onChange={setPerformedById} />
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">{t('visits.quantity')}</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={formData.quantity}
                onChange={(e) => handleQuantityChange(e.target.value)}
                className="input w-full"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">{t('visits.unitPrice')}</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={formData.unitPrice}
                onChange={(e) => handleUnitPriceChange(e.target.value)}
                className="input w-full"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">{t('visits.totalPrice')}</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={formData.totalPrice}
              onChange={(e) => handleTotalPriceChange(e.target.value)}
              className="input w-full"
            />
          </div>

          <div className="flex gap-3 justify-end pt-4">
            <button type="button" onClick={onClose} className="btn btn-outline">
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn btn-primary" disabled={createMutation.isPending}>
              {createMutation.isPending ? t('visits.adding') : t('visits.addService')}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}
