import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { clientsApi } from '@/api'
import { useApiToast } from '@/hooks/useApiToast'
import { ArrowLeft, Loader2 } from 'lucide-react'

const clientSchema = z.object({
  type: z.enum(['individual', 'company']).default('individual'),
  name: z.string().min(1, 'Name is required'),
  company_name: z.string().optional().or(z.literal('')),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  preferred_channel: z.string().optional().or(z.literal('')),
})

type ClientFormValues = z.infer<typeof clientSchema>

export default function ClientForm() {
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
      showError(error, 'Failed to create client')
    },
  })

  const updateMutation = useMutation({
    mutationFn: (data: ClientFormValues) => clientsApi.patch(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients', 'client'] })
      navigate('/clients')
    },
    onError: (error: unknown) => {
      showError(error, 'Failed to update client')
    },
  })

  const onSubmit = (data: ClientFormValues) => {
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
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/clients" className="p-2 text-workshop-charcoal/40 hover:text-workshop-charcoal transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-workshop-charcoal">
            {isEdit ? 'Edit Client' : 'New Client'}
          </h1>
          <p className="text-workshop-charcoal/60 mt-1">
            {isEdit ? 'Update client information' : 'Add a new client to your workshop'}
          </p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="card p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Type */}
          <div>
            <label className="block text-sm font-medium text-workshop-charcoal mb-1">
              Client Type
            </label>
            <select {...register('type')} className="input">
              <option value="individual">Private Individual</option>
              <option value="company">Company / Fleet</option>
            </select>
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-workshop-charcoal mb-1">
              Name *
            </label>
            <input {...register('name')} className="input" placeholder="John Doe" />
            {errors.name && <p className="text-sm text-red-600 mt-1">{errors.name.message}</p>}
          </div>

          {/* Company Name */}
          <div>
            <label className="block text-sm font-medium text-workshop-charcoal mb-1">
              Company Name
            </label>
            <input {...register('company_name')} className="input" placeholder="Acme Corp" />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-workshop-charcoal mb-1">
              Email
            </label>
            <input {...register('email')} type="email" className="input" placeholder="john@example.com" />
            {errors.email && <p className="text-sm text-red-600 mt-1">{errors.email.message}</p>}
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-medium text-workshop-charcoal mb-1">
              Phone
            </label>
            <input {...register('phone')} className="input" placeholder="+1 234 567 890" />
          </div>

          {/* Preferred Channel */}
          <div>
            <label className="block text-sm font-medium text-workshop-charcoal mb-1">
              Preferred Channel
            </label>
            <select {...register('preferred_channel')} className="input">
              <option value="">Select...</option>
              <option value="SMS">SMS</option>
              <option value="WhatsApp">WhatsApp</option>
              <option value="Email">Email</option>
            </select>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-4 pt-4 border-t border-workshop-charcoal/10">
          <Link to="/clients" className="btn btn-outline">
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isSubmitting || createMutation.isPending || updateMutation.isPending}
            className="btn btn-primary"
          >
            {(isSubmitting || createMutation.isPending || updateMutation.isPending) ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              isEdit ? 'Update Client' : 'Create Client'
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
