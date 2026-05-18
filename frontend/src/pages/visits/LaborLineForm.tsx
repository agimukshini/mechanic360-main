import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { visitsApi } from '@/api'
import { X } from 'lucide-react'
import { useApiToast } from '@/hooks/useApiToast'

interface LaborLineFormProps {
  isOpen: boolean
  onClose: () => void
}

export default function LaborLineForm({ isOpen, onClose }: LaborLineFormProps) {
  const { showError } = useApiToast()
  const { id: visitId } = useParams()
  const queryClient = useQueryClient()
  const [formData, setFormData] = useState({
    description: '',
    hours: '0',
    hourlyRate: '0',
    totalPrice: '0',
  })

  const createMutation = useMutation({
    mutationFn: (data: any) => visitsApi.laborLines.create({
      visit_id: visitId,
      ...data,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['labor-lines', { visit: visitId }] })
      resetForm()
      onClose()
    },
    onError: (error: unknown) => showError(error, 'Failed to add labor'),
  })

  const calculateTotal = (hours: string, hourlyRate: string) => {
    const total = parseFloat(hours || '0') * parseFloat(hourlyRate || '0')
    setFormData(prev => ({ ...prev, totalPrice: total.toFixed(2) }))
  }

  const resetForm = () => {
    setFormData({
      description: '',
      hours: '0',
      hourlyRate: '0',
      totalPrice: '0',
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate({
      description: formData.description,
      hours: parseFloat(formData.hours),
      hourly_rate: parseFloat(formData.hourlyRate),
      total_price: parseFloat(formData.totalPrice),
    })
  }

  if (!isOpen) return null

  return createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
      <div className="card p-6 max-w-lg w-full mx-4">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold">Add Labor Line</h3>
          <button onClick={onClose} className="p-1 hover:bg-workshop-charcoal/5 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Description</label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              className="input w-full"
              placeholder="e.g. Brake pad replacement"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Hours</label>
              <input
                type="number"
                step="0.25"
                value={formData.hours}
                onChange={(e) => {
                  setFormData(prev => ({ ...prev, hours: e.target.value }))
                  calculateTotal(e.target.value, formData.hourlyRate)
                }}
                className="input w-full"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Hourly Rate (€)</label>
              <input
                type="number"
                step="0.01"
                value={formData.hourlyRate}
                onChange={(e) => {
                  setFormData(prev => ({ ...prev, hourlyRate: e.target.value }))
                  calculateTotal(formData.hours, e.target.value)
                }}
                className="input w-full"
                required
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
              {createMutation.isPending ? 'Adding...' : 'Add Labor'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}
