import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { visitsApi } from '@/api'
import { X, Plus, Trash2 } from 'lucide-react'
import { useApiToast } from '@/hooks/useApiToast'

interface ServiceLineFormProps {
  isOpen: boolean
  onClose: () => void
}

export default function ServiceLineForm({ isOpen, onClose }: ServiceLineFormProps) {
  const { showError } = useApiToast()
  const { id: visitId } = useParams()
  const queryClient = useQueryClient()
  const [useCatalog, setUseCatalog] = useState(true)
  const [selectedCatalogItem, setSelectedCatalogItem] = useState<string>('')
  const [formData, setFormData] = useState({
    description: '',
    quantity: '1',
    unitPrice: '0',
    totalPrice: '0',
  })

  const { data: catalogData } = useQuery({
    queryKey: ['service-catalog'],
    queryFn: () => visitsApi.catalog.list(),
    enabled: useCatalog && isOpen,
  })

  const createMutation = useMutation({
    mutationFn: (data: any) => visitsApi.serviceLines.create({
      visit_id: visitId,
      catalog_item: useCatalog && selectedCatalogItem ? selectedCatalogItem : undefined,
      ...data,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-lines', { visit: visitId }] })
      resetForm()
      onClose()
    },
    onError: (error: unknown) => showError(error, 'Failed to add service'),
  })

  const handleCatalogSelect = (itemId: string) => {
    setSelectedCatalogItem(itemId)
    const items = catalogData?.data?.results || catalogData?.data || []
    const item = items.find((i: any) => i.id === itemId)
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
    setFormData(prev => ({ ...prev, quantity, totalPrice: total.toFixed(2) }))
  }

  const resetForm = () => {
    setFormData({
      description: '',
      quantity: '1',
      unitPrice: '0',
      totalPrice: '0',
    })
    setSelectedCatalogItem('')
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({
      description: formData.description,
      quantity: parseFloat(formData.quantity),
      unit_price: parseFloat(formData.unitPrice),
      total_price: parseFloat(formData.totalPrice),
    })
  }

  if (!isOpen) return null

  console.log('[SERVICE] Form rendered, catalogData:', catalogData)

  return createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
      <div className="card p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold">Add Service Line</h3>
          <button onClick={onClose} className="p-1 hover:bg-workshop-charcoal/5 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Use Catalog Toggle */}
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={useCatalog}
                onChange={(e) => setUseCatalog(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm">Use catalog item</span>
            </label>
          </div>

          {useCatalog && (
            <div>
              <label className="block text-sm font-medium mb-2">Catalog Item</label>
              {!catalogData?.data?.length && !catalogData?.data?.results ? (
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-sm">
                  <p className="font-medium text-yellow-800">No catalog items available</p>
                  <p className="text-yellow-600 mt-1">Please add service catalog items first, or uncheck "Use catalog item" to add a custom service.</p>
                </div>
              ) : (
                <select
                  value={selectedCatalogItem}
                  onChange={(e) => {
                    console.log('[SERVICE] Catalog select changed to:', e.target.value)
                    handleCatalogSelect(e.target.value)
                  }}
                  className="input w-full"
                  required
                >
                  <option value="">Select a service...</option>
                  {(catalogData?.data?.results || catalogData?.data || []).map((item: any) => (
                    <option key={item.id} value={item.id}>
                      {item.name} - €{item.default_price}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-2">Description</label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              className="input w-full"
              placeholder="Service description"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Quantity</label>
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
              <label className="block text-sm font-medium mb-2">Unit Price (€)</label>
              <input
                type="number"
                step="0.01"
                value={formData.unitPrice}
                readOnly
                className="input w-full bg-workshop-charcoal/5"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Total Price (€)</label>
            <input
              type="number"
              step="0.01"
              value={formData.totalPrice}
              readOnly
              className="input w-full bg-workshop-charcoal/5"
            />
          </div>

          <div className="flex gap-3 justify-end pt-4">
            <button type="button" onClick={onClose} className="btn btn-outline">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Adding...' : 'Add Service'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}
