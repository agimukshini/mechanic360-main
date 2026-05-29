import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'
import { inventoryApi } from '@/api'
import { useApiToast } from '@/hooks/useApiToast'
import { ArrowLeft, Loader2 } from 'lucide-react'

// Zod returns literal error codes; the JSX runs them through `t()`.
const inventorySchema = z.object({
  sku: z.string().min(1, 'skuRequired'),
  name: z.string().min(1, 'nameRequired'),
  manufacturer: z.string().optional(),
  purchase_cost: z.coerce.number().min(0),
  sale_price: z.coerce.number().min(0),
  current_stock: z.coerce.number().min(0),
  minimum_stock: z.coerce.number().min(0),
  supplier: z.string().optional(),
})

type InventoryFormValues = z.infer<typeof inventorySchema>

export default function InventoryForm() {
  const { t } = useTranslation()
  const { showError } = useApiToast()
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isEdit = !!id

  const { data: itemData } = useQuery({
    queryKey: ['inventory', id],
    queryFn: () => inventoryApi.get(id!),
    enabled: isEdit,
  })

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<InventoryFormValues>({
    resolver: zodResolver(inventorySchema),
    defaultValues: isEdit && itemData?.data ? {
      sku: itemData.data.sku,
      name: itemData.data.name,
      manufacturer: itemData.data.manufacturer,
      purchase_cost: itemData.data.purchase_cost,
      sale_price: itemData.data.sale_price,
      current_stock: itemData.data.current_stock,
      minimum_stock: itemData.data.minimum_stock,
      supplier: itemData.data.supplier,
    } : {
      sku: '',
      name: '',
      manufacturer: '',
      purchase_cost: 0,
      sale_price: 0,
      current_stock: 0,
      minimum_stock: 0,
      supplier: '',
    },
  })

  const createMutation = useMutation({
    mutationFn: (data: InventoryFormValues) => inventoryApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      navigate('/inventory')
    },
    onError: (error: unknown) => showError(error, t('inventory.createFailed')),
  })

  const updateMutation = useMutation({
    mutationFn: (data: InventoryFormValues) => inventoryApi.patch(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory', 'inventory_item'] })
      navigate('/inventory')
    },
    onError: (error: unknown) => showError(error, t('inventory.updateFailed')),
  })

  const onSubmit = (data: InventoryFormValues) => {
    if (isEdit) {
      updateMutation.mutate(data)
    } else {
      createMutation.mutate(data)
    }
  }

  const fieldError = (msg?: string) => (msg ? t(`inventory.${msg}`) : '')

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/inventory" className="p-2 text-workshop-charcoal/40 hover:text-workshop-charcoal transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-workshop-charcoal">
            {isEdit ? t('inventory.editTitle') : t('inventory.newTitle')}
          </h1>
          <p className="text-workshop-charcoal/60 mt-1">
            {isEdit ? t('inventory.editSubtitle') : t('inventory.newSubtitle')}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="card p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-workshop-charcoal mb-1">{t('inventory.sku')} *</label>
            <input {...register('sku')} className="input" placeholder={t('inventory.skuPlaceholder')} />
            {errors.sku && <p className="text-sm text-red-600 mt-1">{fieldError(errors.sku.message)}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-workshop-charcoal mb-1">{t('inventory.name')} *</label>
            <input {...register('name')} className="input" placeholder={t('inventory.namePlaceholder')} />
            {errors.name && <p className="text-sm text-red-600 mt-1">{fieldError(errors.name.message)}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-workshop-charcoal mb-1">{t('inventory.manufacturer')}</label>
            <input {...register('manufacturer')} className="input" placeholder={t('inventory.manufacturerPlaceholder')} />
          </div>

          <div>
            <label className="block text-sm font-medium text-workshop-charcoal mb-1">{t('inventory.supplier')}</label>
            <input {...register('supplier')} className="input" placeholder={t('inventory.supplierPlaceholder')} />
          </div>

          <div>
            <label className="block text-sm font-medium text-workshop-charcoal mb-1">{t('inventory.purchaseCost')}</label>
            <input {...register('purchase_cost')} type="number" step="0.01" className="input" />
          </div>

          <div>
            <label className="block text-sm font-medium text-workshop-charcoal mb-1">{t('inventory.salePrice')}</label>
            <input {...register('sale_price')} type="number" step="0.01" className="input" />
          </div>

          <div>
            <label className="block text-sm font-medium text-workshop-charcoal mb-1">{t('inventory.currentStock')}</label>
            <input {...register('current_stock')} type="number" className="input" />
          </div>

          <div>
            <label className="block text-sm font-medium text-workshop-charcoal mb-1">{t('inventory.minimumStock')}</label>
            <input {...register('minimum_stock')} type="number" className="input" />
          </div>
        </div>

        <div className="flex items-center justify-end gap-4 pt-4 border-t border-workshop-charcoal/10">
          <Link to="/inventory" className="btn btn-outline">{t('inventory.cancel')}</Link>
          <button type="submit" disabled={isSubmitting || createMutation.isPending || updateMutation.isPending} className="btn btn-primary">
            {(isSubmitting || createMutation.isPending || updateMutation.isPending) ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t('inventory.saving')}</>
            ) : (
              isEdit ? t('inventory.update') : t('inventory.create')
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
