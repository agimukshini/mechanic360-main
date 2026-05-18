import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { visitsApi } from '@/api'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { useApiToast } from '@/hooks/useApiToast'
import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

type ServiceFormValues = {
  name: string
  description?: string
  default_duration_hours: number
  default_price: number
  is_active: boolean
}

export default function ServiceCatalogForm() {
  const { t } = useTranslation()
  const { showError } = useApiToast()
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isEdit = !!id

  const serviceSchema = useMemo(
    () =>
      z.object({
        name: z.string().min(1, t('services.nameRequired')),
        description: z.string().optional(),
        default_duration_hours: z.coerce.number().min(0).max(24),
        default_price: z.coerce.number().min(0),
        is_active: z.boolean().default(true),
      }),
    [t],
  )

  const { data: serviceData, isLoading: isFetching } = useQuery({
    queryKey: ['service-catalog-item', id],
    queryFn: () => visitsApi.catalog.get(id!),
    enabled: isEdit,
  })

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<ServiceFormValues>({
    resolver: zodResolver(serviceSchema),
    defaultValues: {
      name: '',
      description: '',
      default_duration_hours: 1.0,
      default_price: 0,
      is_active: true,
    },
  })

  useEffect(() => {
    if (isEdit && serviceData?.data) {
      reset({
        name: serviceData.data.name,
        description: serviceData.data.description || '',
        default_duration_hours: Number(serviceData.data.default_duration_hours),
        default_price: Number(serviceData.data.default_price),
        is_active: serviceData.data.is_active,
      })
    }
  }, [serviceData, isEdit, reset])

  const createMutation = useMutation({
    mutationFn: (data: ServiceFormValues) => visitsApi.catalog.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-catalog'] })
      navigate('/services')
    },
    onError: (error: unknown) => showError(error, t('services.createFailed')),
  })

  const updateMutation = useMutation({
    mutationFn: (data: ServiceFormValues) => visitsApi.catalog.patch(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-catalog', 'service-catalog-item'] })
      navigate('/services')
    },
    onError: (error: unknown) => showError(error, t('services.updateFailed')),
  })

  const onSubmit = (data: ServiceFormValues) => {
    if (isEdit) {
      updateMutation.mutate(data)
    } else {
      createMutation.mutate(data)
    }
  }

  if (isFetching) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-workshop-blue" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link
          to="/services"
          className="p-2 text-workshop-charcoal/40 hover:text-workshop-charcoal transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-workshop-charcoal">
            {isEdit ? t('services.editService') : t('services.newService')}
          </h1>
          <p className="text-workshop-charcoal/60 mt-1">
            {isEdit ? t('services.editDescription') : t('services.newDescription')}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="card p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-workshop-charcoal mb-1">
            {t('services.nameLabel')} *
          </label>
          <input {...register('name')} className="input" placeholder={t('services.namePlaceholder')} />
          {errors.name && <p className="text-sm text-red-600 mt-1">{errors.name.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-workshop-charcoal mb-1">
            {t('services.descriptionLabel')}
          </label>
          <textarea
            {...register('description')}
            className="input min-h-[100px]"
            placeholder={t('services.descriptionPlaceholder')}
          />
          {errors.description && <p className="text-sm text-red-600 mt-1">{errors.description.message}</p>}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-workshop-charcoal mb-1">
              {t('services.durationLabel')} *
            </label>
            <input {...register('default_duration_hours')} type="number" step="0.25" className="input" />
            {errors.default_duration_hours && (
              <p className="text-sm text-red-600 mt-1">{errors.default_duration_hours.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-workshop-charcoal mb-1">
              {t('services.priceLabel')} *
            </label>
            <input {...register('default_price')} type="number" step="0.01" className="input" />
            {errors.default_price && (
              <p className="text-sm text-red-600 mt-1">{errors.default_price.message}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input {...register('is_active')} type="checkbox" className="rounded" />
          <label className="text-sm font-medium text-workshop-charcoal">{t('services.activeLabel')}</label>
        </div>

        <div className="flex items-center justify-end gap-4 pt-4 border-t border-workshop-charcoal/10">
          <Link to="/services" className="btn btn-outline">
            {t('common.cancel')}
          </Link>
          <button
            type="submit"
            disabled={isSubmitting || createMutation.isPending || updateMutation.isPending}
            className="btn btn-primary"
          >
            {isSubmitting || createMutation.isPending || updateMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t('services.saving')}
              </>
            ) : isEdit ? (
              t('services.updateService')
            ) : (
              t('services.createService')
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
