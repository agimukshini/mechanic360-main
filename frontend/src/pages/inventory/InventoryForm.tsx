import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { inventoryApi } from '@/api'
import { useApiToast } from '@/hooks/useApiToast'
import { ArrowLeft, Loader2 } from 'lucide-react'

const inventorySchema = z.object({
  sku: z.string().min(1, 'SKU is required'),
  name: z.string().min(1, 'Name is required'),
  manufacturer: z.string().optional(),
  purchase_cost: z.coerce.number().min(0),
  sale_price: z.coerce.number().min(0),
  current_stock: z.coerce.number().min(0),
  minimum_stock: z.coerce.number().min(0),
  supplier: z.string().optional(),
})

type InventoryFormValues = z.infer<typeof inventorySchema>

export default function InventoryForm() {
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
    onError: (error: unknown) => showError(error, 'Failed to create inventory item'),
  })

  const updateMutation = useMutation({
    mutationFn: (data: InventoryFormValues) => inventoryApi.patch(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory', 'inventory_item'] })
      navigate('/inventory')
    },
    onError: (error: unknown) => showError(error, 'Failed to update inventory item'),
  })

  const onSubmit = (data: InventoryFormValues) => {
    if (isEdit) {
      updateMutation.mutate(data)
    } else {
      createMutation.mutate(data)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/inventory" className="p-2 text-workshop-charcoal/40 hover:text-workshop-charcoal transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-workshop-charcoal">
            {isEdit ? 'Edit Inventory Item' : 'New Inventory Item'}
          </h1>
          <p className="text-workshop-charcoal/60 mt-1">
            {isEdit ? 'Update item details' : 'Add a new part or material'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="card p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* SKU */}
          <div>
            <label className="block text-sm font-medium text-workshop-charcoal mb-1">SKU *</label>
            <input {...register('sku')} className="input" placeholder="OIL-001" />
            {errors.sku && <p className="text-sm text-red-600 mt-1">{errors.sku.message}</p>}
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-workshop-charcoal mb-1">Name *</label>
            <input {...register('name')} className="input" placeholder="Engine Oil 5W-30" />
            {errors.name && <p className="text-sm text-red-600 mt-1">{errors.name.message}</p>}
          </div>

          {/* Manufacturer */}
          <div>
            <label className="block text-sm font-medium text-workshop-charcoal mb-1">Manufacturer</label>
            <input {...register('manufacturer')} className="input" placeholder="Mobil" />
          </div>

          {/* Supplier */}
          <div>
            <label className="block text-sm font-medium text-workshop-charcoal mb-1">Supplier</label>
            <input {...register('supplier')} className="input" placeholder="AutoParts Inc" />
          </div>

          {/* Purchase Cost */}
          <div>
            <label className="block text-sm font-medium text-workshop-charcoal mb-1">Purchase Cost</label>
            <input {...register('purchase_cost')} type="number" step="0.01" className="input" />
          </div>

          {/* Sale Price */}
          <div>
            <label className="block text-sm font-medium text-workshop-charcoal mb-1">Sale Price</label>
            <input {...register('sale_price')} type="number" step="0.01" className="input" />
          </div>

          {/* Current Stock */}
          <div>
            <label className="block text-sm font-medium text-workshop-charcoal mb-1">Current Stock</label>
            <input {...register('current_stock')} type="number" className="input" />
          </div>

          {/* Minimum Stock */}
          <div>
            <label className="block text-sm font-medium text-workshop-charcoal mb-1">Minimum Stock Alert</label>
            <input {...register('minimum_stock')} type="number" className="input" />
          </div>
        </div>

        <div className="flex items-center justify-end gap-4 pt-4 border-t border-workshop-charcoal/10">
          <Link to="/inventory" className="btn btn-outline">Cancel</Link>
          <button type="submit" disabled={isSubmitting || createMutation.isPending || updateMutation.isPending} className="btn btn-primary">
            {(isSubmitting || createMutation.isPending || updateMutation.isPending) ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</>
            ) : (
              isEdit ? 'Update Item' : 'Create Item'
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
