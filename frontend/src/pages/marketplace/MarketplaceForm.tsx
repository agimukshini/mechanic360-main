import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { api } from '@/api'
import { ArrowLeft, Loader2 } from 'lucide-react'

const listingSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  category: z.enum(['parts', 'tools', 'equipment', 'other']),
  price: z.coerce.number().min(0),
  quantity_available: z.coerce.number().min(1),
  currency: z.string().default('USD'),
  contact_phone: z.string().optional(),
  contact_whatsapp: z.string().optional(),
  contact_email: z.string().email('Invalid email').optional().or(z.literal('')),
})

type ListingFormValues = z.infer<typeof listingSchema>

export default function MarketplaceForm() {
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

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/marketplace" className="p-2 text-workshop-charcoal/40 hover:text-workshop-charcoal transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-workshop-charcoal">Create Listing</h1>
          <p className="text-workshop-charcoal/60 mt-1">
            List a part, tool, or equipment for sale
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="card p-6 space-y-6">
        <div>
          <label className="block text-sm font-medium text-workshop-charcoal mb-1">Title *</label>
          <input {...register('title')} className="input" placeholder="e.g. Brake Pads - Toyota Camry 2020" />
          {errors.title && <p className="text-sm text-red-600 mt-1">{errors.title.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-workshop-charcoal mb-1">Description</label>
          <textarea
            {...register('description')}
            className="input min-h-[100px]"
            placeholder="Describe the item, condition, compatibility..."
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-workshop-charcoal mb-1">Category *</label>
            <select {...register('category')} className="input">
              <option value="parts">Parts</option>
              <option value="tools">Tools</option>
              <option value="equipment">Equipment</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-workshop-charcoal mb-1">Quantity *</label>
            <input {...register('quantity_available')} type="number" min="1" className="input" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-workshop-charcoal mb-1">Price ($) *</label>
            <input {...register('price')} type="number" step="0.01" min="0" className="input" />
            {errors.price && <p className="text-sm text-red-600 mt-1">{errors.price.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-workshop-charcoal mb-1">Currency</label>
            <input {...register('currency')} className="input" placeholder="USD" />
          </div>
        </div>

        <div className="border-t border-workshop-charcoal/10 pt-6">
          <h3 className="font-medium text-workshop-charcoal mb-4">Contact Information</h3>
          <p className="text-sm text-workshop-charcoal/60 mb-4">
            Buyers will be able to contact you using this information
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-workshop-charcoal mb-1">Phone</label>
              <input {...register('contact_phone')} className="input" placeholder="+1234567890" />
            </div>

            <div>
              <label className="block text-sm font-medium text-workshop-charcoal mb-1">WhatsApp</label>
              <input {...register('contact_whatsapp')} className="input" placeholder="+1234567890" />
            </div>

            <div>
              <label className="block text-sm font-medium text-workshop-charcoal mb-1">Email</label>
              <input {...register('contact_email')} type="email" className="input" placeholder="workshop@example.com" />
              {errors.contact_email && <p className="text-sm text-red-600 mt-1">{errors.contact_email.message}</p>}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-4 pt-4 border-t border-workshop-charcoal/10">
          <Link to="/marketplace" className="btn btn-outline">Cancel</Link>
          <button type="submit" disabled={isSubmitting || createMutation.isPending} className="btn btn-primary">
            {(isSubmitting || createMutation.isPending) ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating...</>
            ) : (
              'Create Listing'
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
