import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'
import { api } from '@/api'
import { ArrowLeft, Loader2 } from 'lucide-react'

const listingSchema = z.object({
  title: z.string().min(1, 'titleRequired'),
  description: z.string().optional(),
  category: z.enum(['parts', 'tools', 'equipment', 'other']),
  price: z.coerce.number().min(0),
  quantity_available: z.coerce.number().min(1),
  currency: z.string().default('USD'),
  contact_phone: z.string().optional(),
  contact_whatsapp: z.string().optional(),
  contact_email: z.string().email('emailInvalid').optional().or(z.literal('')),
})

type ListingFormValues = z.infer<typeof listingSchema>

export default function MarketplaceForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<ListingFormValues>({
    resolver: zodResolver(listingSchema),
    defaultValues: {
      title: '',
      description: '',
      category: 'parts',
      price: 0,
      quantity_available: 1,
      currency: 'USD',
      contact_phone: '',
      contact_whatsapp: '',
      contact_email: '',
    },
  })

  const createMutation = useMutation({
    mutationFn: (data: ListingFormValues) => api.post('/marketplace/', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketplace'] })
      navigate('/marketplace')
    },
  })

  const onSubmit = (data: ListingFormValues) => {
    createMutation.mutate(data)
  }

  const fieldErr = (msg?: string) => {
    if (!msg) return null
    return t(`marketplaceForm.${msg}`, { defaultValue: msg })
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/marketplace" className="p-2 text-workshop-charcoal/40 hover:text-workshop-charcoal transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-workshop-charcoal">{t('marketplaceForm.createTitle')}</h1>
          <p className="text-workshop-charcoal/60 mt-1">
            {t('marketplaceForm.createSubtitle')}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="card p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-workshop-charcoal mb-1">{t('marketplaceForm.titleLabel')}</label>
          <input {...register('title')} className="input" placeholder={t('marketplaceForm.titlePlaceholder')} />
          {errors.title && <p className="text-sm text-red-600 mt-1">{fieldErr(errors.title.message)}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-workshop-charcoal mb-1">{t('marketplaceForm.descriptionLabel')}</label>
          <textarea
            {...register('description')}
            className="input min-h-[100px]"
            placeholder={t('marketplaceForm.descriptionPlaceholder')}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-workshop-charcoal mb-1">{t('marketplaceForm.categoryLabel')}</label>
            <select {...register('category')} className="input">
              <option value="parts">{t('marketplaceForm.categoryParts')}</option>
              <option value="tools">{t('marketplaceForm.categoryTools')}</option>
              <option value="equipment">{t('marketplaceForm.categoryEquipment')}</option>
              <option value="other">{t('marketplaceForm.categoryOther')}</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-workshop-charcoal mb-1">{t('marketplaceForm.quantityLabel')}</label>
            <input {...register('quantity_available')} type="number" min="1" className="input" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-workshop-charcoal mb-1">{t('marketplaceForm.priceLabel')}</label>
            <input {...register('price')} type="number" step="0.01" min="0" className="input" />
            {errors.price && <p className="text-sm text-red-600 mt-1">{fieldErr(errors.price.message)}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-workshop-charcoal mb-1">{t('marketplaceForm.currencyLabel')}</label>
            <input {...register('currency')} className="input" placeholder="USD" />
          </div>
        </div>

        <div className="border-t border-workshop-charcoal/10 pt-6">
          <h3 className="font-medium text-workshop-charcoal mb-4">{t('marketplaceForm.contactInfo')}</h3>
          <p className="text-sm text-workshop-charcoal/60 mb-4">
            {t('marketplaceForm.contactInfoSubtitle')}
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-workshop-charcoal mb-1">{t('marketplaceForm.phoneLabel')}</label>
              <input {...register('contact_phone')} className="input" placeholder="+1234567890" />
            </div>

            <div>
              <label className="block text-sm font-medium text-workshop-charcoal mb-1">{t('marketplaceForm.whatsappLabel')}</label>
              <input {...register('contact_whatsapp')} className="input" placeholder="+1234567890" />
            </div>

            <div>
              <label className="block text-sm font-medium text-workshop-charcoal mb-1">{t('marketplaceForm.emailLabel')}</label>
              <input {...register('contact_email')} type="email" className="input" placeholder={t('marketplaceForm.emailPlaceholder')} />
              {errors.contact_email && <p className="text-sm text-red-600 mt-1">{fieldErr(errors.contact_email.message)}</p>}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-4 pt-4 border-t border-workshop-charcoal/10">
          <Link to="/marketplace" className="btn btn-outline">{t('marketplaceForm.cancel')}</Link>
          <button type="submit" disabled={isSubmitting || createMutation.isPending} className="btn btn-primary">
            {(isSubmitting || createMutation.isPending) ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{t('marketplaceForm.creating')}</>
            ) : (
              t('marketplaceForm.createListing')
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
