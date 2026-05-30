import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import {
  sellerPartSchema,
  type SellerPartFormValues,
  type SparePartRecord,
  partToFormValues,
} from '@/lib/marketplacePart'

type Props = {
  part?: SparePartRecord
  categories: { id: number; slug: string; name: string }[]
  submitError: string | null
  isSubmitting: boolean
  onSubmit: (values: SellerPartFormValues) => void
  onCancel: () => void
  submitLabel: string
}

export default function SellerPartFormFields({
  part,
  categories,
  submitError,
  isSubmitting,
  onSubmit,
  onCancel,
  submitLabel,
}: Props) {
  const { t } = useTranslation()

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<SellerPartFormValues>({
    resolver: zodResolver(sellerPartSchema),
    defaultValues: part
      ? partToFormValues(part)
      : {
          listing_type: 'generic',
          title: '',
          description: '',
          category: categories[0]?.id ?? 0,
          condition: 'used',
          price: 0,
          quantity: 1,
          currency: 'EUR',
          brand: '',
          part_number: '',
          oem_number: '',
          alternative_numbers_text: '',
          location_city_override: '',
          is_active: true,
        },
  })

  useEffect(() => {
    if (part) {
      reset(partToFormValues(part))
    } else if (categories.length > 0) {
      reset((current) => ({ ...current, category: categories[0].id }))
    }
  }, [part, categories, reset])

  const listingType = watch('listing_type')
  const isIdentified = listingType === 'identified'
  const isEdit = Boolean(part)

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="card p-6 space-y-6">
      {submitError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {submitError}
        </p>
      )}

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-workshop-charcoal">
          {t('marketplaceSeller.listingTypeLegend')}
        </legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label
            className={`card p-4 cursor-pointer border-2 transition-colors ${
              listingType === 'identified' ? 'border-accent bg-accent/5' : 'border-transparent'
            }`}
          >
            <input type="radio" value="identified" {...register('listing_type')} className="sr-only" />
            <p className="font-medium text-sm">{t('marketplaceSeller.typeIdentified')}</p>
            <p className="text-xs text-workshop-charcoal/60 mt-1">{t('marketplaceSeller.typeIdentifiedHint')}</p>
          </label>
          <label
            className={`card p-4 cursor-pointer border-2 transition-colors ${
              listingType === 'generic' ? 'border-accent bg-accent/5' : 'border-transparent'
            }`}
          >
            <input type="radio" value="generic" {...register('listing_type')} className="sr-only" />
            <p className="font-medium text-sm">{t('marketplaceSeller.typeGeneric')}</p>
            <p className="text-xs text-workshop-charcoal/60 mt-1">{t('marketplaceSeller.typeGenericHint')}</p>
          </label>
        </div>
      </fieldset>

      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-workshop-charcoal">{t('marketplaceSeller.sectionBasics')}</h2>
        <div>
          <label className="block text-sm font-medium mb-1">{t('marketplaceForm.titleLabel')} *</label>
          <input {...register('title')} className="input" placeholder={t('marketplaceSeller.titlePlaceholder')} />
          {errors.title && (
            <p className="text-sm text-red-600 mt-1">{t('marketplaceForm.titleRequired')}</p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">{t('marketplaceForm.descriptionLabel')}</label>
          <textarea
            {...register('description')}
            className="input min-h-[100px]"
            placeholder={t('marketplaceSeller.descriptionPlaceholder')}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">{t('marketplaceSeller.category')} *</label>
            <select {...register('category')} className="input">
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('marketplaceSeller.condition')} *</label>
            <select {...register('condition')} className="input">
              <option value="new">{t('marketplaceSeller.conditionNew')}</option>
              <option value="used">{t('marketplaceSeller.conditionUsed')}</option>
              <option value="refurbished">{t('marketplaceSeller.conditionRefurbished')}</option>
              <option value="oem_takeoff">{t('marketplaceSeller.conditionTakeoff')}</option>
            </select>
          </div>
        </div>
      </div>

      {isIdentified && (
        <div className="space-y-4 border-t border-workshop-charcoal/10 pt-5">
          <h2 className="text-sm font-semibold text-workshop-charcoal">{t('marketplaceSeller.sectionIdentifiers')}</h2>
          <p className="text-xs text-workshop-charcoal/60">{t('marketplaceSeller.identifiersHint')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t('marketplaceSeller.oemNumber')}</label>
              <input {...register('oem_number')} className="input font-mono uppercase" placeholder="1K0 698 151" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('marketplaceSeller.partNumber')}</label>
              <input {...register('part_number')} className="input font-mono uppercase" placeholder="BP1234" />
            </div>
          </div>
          {(errors.oem_number || errors.part_number) && (
            <p className="text-sm text-red-600">{t('marketplaceSeller.identifierRequired')}</p>
          )}
          <div>
            <label className="block text-sm font-medium mb-1">{t('marketplaceSeller.brand')}</label>
            <input {...register('brand')} className="input" placeholder={t('marketplaceSeller.brandPlaceholder')} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('marketplaceSeller.crossReferences')}</label>
            <textarea
              {...register('alternative_numbers_text')}
              className="input min-h-[72px] font-mono text-sm"
              placeholder={t('marketplaceSeller.crossReferencesPlaceholder')}
            />
            <p className="text-xs text-workshop-charcoal/50 mt-1">{t('marketplaceSeller.crossReferencesHint')}</p>
          </div>
        </div>
      )}

      <div className="space-y-4 border-t border-workshop-charcoal/10 pt-5">
        <h2 className="text-sm font-semibold text-workshop-charcoal">{t('marketplaceSeller.sectionPricing')}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium mb-1">{t('marketplaceForm.priceLabel')} *</label>
            <input {...register('price')} type="number" step="0.01" min="0" className="input" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('marketplaceForm.quantityLabel')} *</label>
            <input {...register('quantity')} type="number" min="1" className="input" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('marketplaceForm.currencyLabel')}</label>
            <input {...register('currency')} className="input uppercase" maxLength={3} />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">{t('marketplaceSeller.locationOverride')}</label>
          <input {...register('location_city_override')} className="input" placeholder={t('marketplaceSeller.locationPlaceholder')} />
        </div>
      </div>

      {isEdit && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" {...register('is_active')} className="rounded border-gray-300" />
          {t('marketplaceSeller.activeListing')}
        </label>
      )}

      <div className="flex justify-end gap-3 pt-4 border-t">
        <button type="button" onClick={onCancel} className="btn btn-outline">
          {t('marketplaceForm.cancel')}
        </button>
        <button type="submit" disabled={isSubmitting} className="btn btn-primary">
          {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : submitLabel}
        </button>
      </div>
    </form>
  )
}
