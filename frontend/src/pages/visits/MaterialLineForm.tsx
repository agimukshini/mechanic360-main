import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { visitsApi, inventoryApi } from '@/api'
import { unwrapList, getApiErrorMessage } from '@/lib/utils'
import { X } from 'lucide-react'
import { useApiToast } from '@/hooks/useApiToast'

interface MaterialLineFormProps {
  isOpen: boolean
  onClose: () => void
  visitId?: string
}

type InventoryItemRow = {
  id: string
  sku: string
  name: string
  current_stock: number
  sale_price: string | number
}

export default function MaterialLineForm({ isOpen, onClose, visitId: visitIdProp }: MaterialLineFormProps) {
  const { showError, showToast } = useApiToast()
  const { id: routeVisitId } = useParams()
  const visitId = visitIdProp || routeVisitId
  const queryClient = useQueryClient()
  const [selectedItem, setSelectedItem] = useState('')
  const [formData, setFormData] = useState({
    quantity: '1',
    unitPrice: '0',
    totalPrice: '0',
  })

  const { data: inventoryData, isLoading: inventoryLoading } = useQuery({
    queryKey: ['inventory-items'],
    queryFn: () => inventoryApi.list(),
    enabled: isOpen,
  })

  const inventoryItems = unwrapList<InventoryItemRow>(inventoryData)

  const createMutation = useMutation({
    mutationFn: (data: {
      quantity: number
      unit_price: number
      total_price: number
      inventory_item: string
    }) =>
      visitsApi.materialLines.create({
        visit_id: visitId,
        inventory_item: data.inventory_item,
        quantity: data.quantity,
        unit_price: data.unit_price,
        total_price: data.total_price,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['material-lines', { visit: visitId }] })
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] })
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      resetForm()
      onClose()
    },
    onError: (error: unknown) => {
      showError(error, getApiErrorMessage(error, 'Failed to add material'))
    },
  })

  const handleItemSelect = (itemId: string) => {
    setSelectedItem(itemId)
    const item = inventoryItems.find((i) => i.id === itemId)
    if (item) {
      const price = parseFloat(String(item.sale_price || 0))
      setFormData({
        quantity: '1',
        unitPrice: price.toFixed(2),
        totalPrice: price.toFixed(2),
      })
      if (item.current_stock <= 0) {
        showToast(`${item.name} is out of stock. Add inventory or choose another part.`, 'info')
      }
    }
  }

  const handleQuantityChange = (quantity: string) => {
    const unitPrice = parseFloat(formData.unitPrice || '0')
    const total = parseFloat(quantity || '0') * unitPrice
    setFormData((prev) => ({ ...prev, quantity, totalPrice: total.toFixed(2) }))
  }

  const resetForm = () => {
    setFormData({
      quantity: '1',
      unitPrice: '0',
      totalPrice: '0',
    })
    setSelectedItem('')
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!visitId) {
      showToast('Save the visit first, then add parts.', 'info')
      return
    }
    if (!selectedItem) {
      showToast('Select an inventory item.', 'info')
      return
    }
    const item = inventoryItems.find((i) => i.id === selectedItem)
    const qty = parseFloat(formData.quantity)
    if (!qty || qty <= 0) {
      showToast('Enter a valid quantity.', 'info')
      return
    }
    if (item && item.current_stock < qty) {
      showToast(
        `Not enough stock for ${item.name}. Available: ${item.current_stock}`,
        'error',
      )
      return
    }
    createMutation.mutate({
      inventory_item: selectedItem,
      quantity: qty,
      unit_price: parseFloat(formData.unitPrice),
      total_price: parseFloat(formData.totalPrice),
    })
  }

  if (!isOpen) return null

  return createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
      <div className="card p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold">Add part / material</h3>
          <button type="button" onClick={onClose} className="p-1 hover:bg-workshop-charcoal/5 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>
        {!visitId && (
          <div className="p-4 mb-4 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
            Visit is not ready yet. Finish creating the visit, then add parts.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {inventoryLoading ? (
            <p className="text-sm text-workshop-charcoal/60">Loading inventory…</p>
          ) : inventoryItems.length === 0 ? (
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-sm">
              <p className="font-medium text-yellow-800">No inventory items yet</p>
              <p className="text-yellow-600 mt-1">
                Add parts under Inventory, then return here to use them on this visit.
              </p>
              <a href="/inventory/new" className="inline-block mt-2 text-sm font-medium text-workshop-blue hover:underline">
                Add inventory item
              </a>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium mb-2">Inventory item</label>
              <select
                value={selectedItem}
                onChange={(e) => handleItemSelect(e.target.value)}
                className="input w-full"
                required
                disabled={!visitId}
              >
                <option value="">Select an item…</option>
                {inventoryItems.map((item) => (
                  <option key={item.id} value={item.id} disabled={item.current_stock <= 0}>
                    {item.sku} — {item.name} (stock: {item.current_stock}) — €
                    {parseFloat(String(item.sale_price || 0)).toFixed(2)}
                    {item.current_stock <= 0 ? ' — OUT OF STOCK' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

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
                disabled={!visitId}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Unit price (€)</label>
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
            <label className="block text-sm font-medium mb-2">Total (€)</label>
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
            <button
              type="submit"
              className="btn btn-primary"
              disabled={createMutation.isPending || !visitId || inventoryItems.length === 0}
            >
              {createMutation.isPending ? 'Adding…' : 'Add material'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}
