import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useTranslation } from 'react-i18next'
import { clientsApi } from '@/api'
import { useApiToast } from '@/hooks/useApiToast'
import { ArrowLeft, Loader2 } from 'lucide-react'

// The Zod schema produces error codes (literals) — the JSX renders them
// through `t(`clients.${err.message}`)` so the messages are localised.
const clientSchema = z.object({
  type: z.enum(['individual', 'company']).default('individual'),
  name: z.string().min(1, 'nameRequired'),
  company_name: z.string().optional().or(z.literal('')),
  email: z.string().email('emailInvalid').optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  preferred_channel: z.string().optional().or(z.literal('')),
})

type ClientFormValues = z.infer<typeof clientSchema>

export default function ClientForm() {
  const { t } = useTranslation()
  const { showError } = useApiToast()
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isEdit = !!id

  const { data: clientData, isLoading: isFetching } = useQuery({
    queryKey: ['client', id],
    queryFn: () => clientsApi.get(id!),
    enabled: isEdit,
  })

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<ClientFormValues>({
    resolver: zodResolver(clientSchema),
    defaultValues: isEdit && clientData?.data ? {
      type: clientData.data.type,
      name: clientData.data.name,
      company_name: clientData.data.company_name,
      email: clientData.data.email,
      phone: clientData.data.phone,
      preferred_channel: clientData.data.preferred_channel,
    } : {
      type: 'individual',
      name: '',
      company_name: '',
      email: '',
      phone: '',
      preferred_channel: '',
    },
  })

  const createMutation = useMutation({
    mutationFn: (data: ClientFormValues) => clientsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      navigate('/clients')
    },
    onError: (error: unknown) => {
      showError(error, t('clients.createFailed'))
    },
  })

  const updateMutation = useMutation({
    mutationFn: (data: ClientFormValues) => clientsApi.patch(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients', 'client'] })
      navigate('/clients')
    },
    onError: (error: unknown) => {
      showError(error, t('clients.updateFailed'))
    },
  })

  const onSubmit = (data: ClientFormValues) => {
    if (isEdit) {
      updateMutation.mutate(data)
    } else {
      createMutation.mutate(data)
    }
  }

  // Translate Zod's literal error codes to localised copy.
  const fieldError = (msg?: string) =>
    msg ? t(`clients.${msg}`) : ''

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
        <Link to="/clients" className="p-2 text-workshop-charcoal/40 hover:text-workshop-charcoal transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-workshop-charcoal">
            {isEdit ? t('clients.editTitle') : t('clients.newTitle')}
          </h1>
          <p className="text-workshop-charcoal/60 mt-1">
            {isEdit ? t('clients.editSubtitle') : t('clients.newSubtitle')}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="card p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-workshop-charcoal mb-1">
              {t('clients.clientType')}
            </label>
            <select {...register('type')} className="input">
              <option value="individual">{t('clients.typeIndividual')}</option>
              <option value="company">{t('clients.typeCompany')}</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-workshop-charcoal mb-1">
              {t('clients.name')} *
            </label>
            <input {...register('name')} className="input" placeholder={t('clients.namePlaceholder')} />
            {errors.name && <p className="text-sm text-red-600 mt-1">{fieldError(errors.name.message)}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-workshop-charcoal mb-1">
              {t('clients.companyName')}
            </label>
            <input {...register('company_name')} className="input" placeholder={t('clients.companyNamePlaceholder')} />
          </div>

          <div>
            <label className="block text-sm font-medium text-workshop-charcoal mb-1">
              {t('clients.email')}
            </label>
            <input {...register('email')} type="email" className="input" placeholder={t('clients.emailPlaceholder')} />
            {errors.email && <p className="text-sm text-red-600 mt-1">{fieldError(errors.email.message)}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-workshop-charcoal mb-1">
              {t('clients.phone')}
            </label>
            <input {...register('phone')} className="input" placeholder={t('clients.phonePlaceholder')} />
          </div>

          <div>
            <label className="block text-sm font-medium text-workshop-charcoal mb-1">
              {t('clients.preferredChannel')}
            </label>
            <select {...register('preferred_channel')} className="input">
              <option value="">{t('clients.selectPlaceholder')}</option>
              <option value="SMS">{t('clients.channelSms')}</option>
              <option value="WhatsApp">{t('clients.channelWhatsapp')}</option>
              <option value="Email">{t('clients.channelEmail')}</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-end gap-4 pt-4 border-t border-workshop-charcoal/10">
          <Link to="/clients" className="btn btn-outline">
            {t('clients.cancel')}
          </Link>
          <button
            type="submit"
            disabled={isSubmitting || createMutation.isPending || updateMutation.isPending}
            className="btn btn-primary"
          >
            {(isSubmitting || createMutation.isPending || updateMutation.isPending) ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t('clients.saving')}
              </>
            ) : (
              isEdit ? t('clients.update') : t('clients.create')
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
