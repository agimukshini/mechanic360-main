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

interface LaborLineFormProps {
  isOpen: boolean
  onClose: () => void
}

export default function LaborLineForm({ isOpen, onClose }: LaborLineFormProps) {
  const { t } = useTranslation()
  const { showError } = useApiToast()
  const { id: visitId } = useParams()
  const queryClient = useQueryClient()
  const { user } = useSelector((state: RootState) => state.auth)
  const canAssignMechanic = canManageWorkshopData(normalizeRole(user?.role))
  const [performedById, setPerformedById] = useState('')
  const [formData, setFormData] = useState({
    description: '',
    hours: '0',
    hourlyRate: '0',
    totalPrice: '0',
  })

  const { data: visitData } = useQuery({
    queryKey: ['visit', visitId],
    queryFn: () => visitsApi.get(visitId!),
    enabled: isOpen && !!visitId,
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
      visitsApi.laborLines.create({
        visit_id: visitId,
        ...data,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['labor-lines', { visit: visitId }] })
      resetForm()
      onClose()
    },
    onError: (error: unknown) => showError(error, t('visits.addLaborFailed')),
  })

  const calculateTotal = (hours: string, hourlyRate: string) => {
    const total = parseFloat(hours || '0') * parseFloat(hourlyRate || '0')
    setFormData((prev) => ({ ...prev, totalPrice: total.toFixed(2) }))
  }

  const resetForm = () => {
    setFormData({
      description: '',
      hours: '0',
      hourlyRate: '0',
      totalPrice: '0',
    })
    setPerformedById('')
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const payload: Record<string, unknown> = {
      description: formData.description,
      hours: parseFloat(formData.hours),
      hourly_rate: parseFloat(formData.hourlyRate),
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
      <div className="card p-6 max-w-lg w-full mx-4">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold">{t('visits.addLaborLine')}</h3>
          <button type="button" onClick={onClose} className="p-1 hover:bg-workshop-charcoal/5 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
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
              <label className="block text-sm font-medium mb-2">{t('visits.hours')}</label>
              <input
                type="number"
                step="0.25"
                value={formData.hours}
                onChange={(e) => {
                  setFormData((prev) => ({ ...prev, hours: e.target.value }))
                  calculateTotal(e.target.value, formData.hourlyRate)
                }}
                className="input w-full"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">{t('visits.hourlyRate')}</label>
              <input
                type="number"
                step="0.01"
                value={formData.hourlyRate}
                onChange={(e) => {
                  setFormData((prev) => ({ ...prev, hourlyRate: e.target.value }))
                  calculateTotal(formData.hours, e.target.value)
                }}
                className="input w-full"
                required
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
              onChange={(e) => setFormData((prev) => ({ ...prev, totalPrice: e.target.value }))}
              className="input w-full"
            />
          </div>

          <div className="flex gap-3 justify-end pt-4">
            <button type="button" onClick={onClose} className="btn btn-outline">
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn btn-primary" disabled={createMutation.isPending}>
              {createMutation.isPending ? t('visits.adding') : t('visits.addLabor')}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}
