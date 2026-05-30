import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { marketplaceApi } from '@/api'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { unwrapList, getApiErrorMessage } from '@/lib/utils'
import { useState } from 'react'
import SellerPartFormFields from '@/components/marketplace/SellerPartFormFields'
import {
  type SellerPartFormValues,
  type SparePartRecord,
  toPartPayload,
} from '@/lib/marketplacePart'

export default function SellerPartForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = Boolean(id)
  const queryClient = useQueryClient()
  const [submitError, setSubmitError] = useState<string | null>(null)

  const { data: categoriesData, isLoading: categoriesLoading } = useQuery({
    queryKey: ['marketplace-categories'],
    queryFn: () => marketplaceApi.listCategories(),
  })

  const { data: partData, isLoading: partLoading } = useQuery({
    queryKey: ['marketplace-part', id],
    queryFn: () => marketplaceApi.getPart(id!),
    enabled: isEdit,
  })

  const categories = unwrapList<{ id: number; slug: string; name: string }>(categoriesData)
  const part = partData?.data as SparePartRecord | undefined

  const saveMutation = useMutation({
    mutationFn: (values: SellerPartFormValues) => {
      const payload = toPartPayload(values)
      return isEdit
        ? marketplaceApi.updatePart(id!, payload)
        : marketplaceApi.createPart(payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketplace-my-parts'] })
      queryClient.invalidateQueries({ queryKey: ['marketplace-parts'] })
      if (isEdit) {
        queryClient.invalidateQueries({ queryKey: ['marketplace-part', id] })
      }
      navigate('/marketplace/seller')
    },
    onError: (err) => setSubmitError(getApiErrorMessage(err, t('marketplaceSeller.saveFailed'))),
  })

  if (categoriesLoading || (isEdit && partLoading)) {
    return (
      <div className="card p-12 flex justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    )
  }

  if (isEdit && !part) {
    return <div className="card p-8 text-red-700">{t('marketplaceSeller.loadPartFailed')}</div>
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/marketplace/seller" className="p-2 text-workshop-charcoal/40 hover:text-workshop-charcoal">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-workshop-charcoal">
            {isEdit ? t('marketplaceSeller.editPart') : t('marketplaceSeller.addPart')}
          </h1>
          <p className="text-workshop-charcoal/60 mt-1 text-sm">
            {isEdit ? t('marketplaceSeller.editPartHint') : t('marketplaceSeller.addPartHint')}
          </p>
        </div>
      </div>

      <SellerPartFormFields
        part={part}
        categories={categories}
        submitError={submitError}
        isSubmitting={saveMutation.isPending}
        onSubmit={(values) => {
          setSubmitError(null)
          saveMutation.mutate(values)
        }}
        onCancel={() => navigate('/marketplace/seller')}
        submitLabel={isEdit ? t('marketplaceSeller.savePart') : t('marketplaceSeller.publishPart')}
      />
    </div>
  )
}
