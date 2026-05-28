import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { tenantsApi } from '@/api'

interface TenantDetail {
  id: string
  name: string
  schema_name: string
  logo_url: string
  address: string
  contact_email: string
  contact_phone: string
  subscription_plan: string
  is_active: boolean
  created_at: string
  stats: {
    users: number
    clients: number
    vehicles: number
    visits: number
    inspections: number
    inventory_items: number
    global_vehicles_registered: number
    marketplace_listings: number
  }
}

const STAT_LABELS: { key: keyof TenantDetail['stats']; label: string }[] = [
  { key: 'users', label: 'Users' },
  { key: 'clients', label: 'Clients' },
  { key: 'vehicles', label: 'Vehicles' },
  { key: 'visits', label: 'Visits' },
  { key: 'inspections', label: 'Inspections' },
  { key: 'inventory_items', label: 'Inventory items' },
  { key: 'global_vehicles_registered', label: 'Global vehicles registered' },
  { key: 'marketplace_listings', label: 'Marketplace listings' },
]

export default function AdminTenantDetailPage() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-tenant', id],
    queryFn: () => tenantsApi.get(id!),
    enabled: Boolean(id),
  })

  const toggleMutation = useMutation({
    mutationFn: (is_active: boolean) => tenantsApi.update(id!, { is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-tenant', id] })
      queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] })
    },
  })

  if (isLoading) {
    return (
      <div className="card p-12 flex justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-workshop-blue" />
      </div>
    )
  }

  if (error || !data?.data) {
    return <div className="card p-8 text-red-700">Tenant not found.</div>
  }

  const tenant = data.data as TenantDetail

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/admin/tenants" className="text-workshop-charcoal/60 hover:text-workshop-blue">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-workshop-charcoal">{tenant.name}</h2>
          <p className="text-workshop-charcoal/60 mt-1">{tenant.schema_name}</p>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={toggleMutation.isPending}
          onClick={() => toggleMutation.mutate(!tenant.is_active)}
        >
          {tenant.is_active ? 'Deactivate tenant' : 'Activate tenant'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-6 space-y-3">
          <h3 className="font-semibold text-workshop-charcoal">Workshop details</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-workshop-charcoal/60">Plan</dt>
              <dd>{tenant.subscription_plan}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-workshop-charcoal/60">Status</dt>
              <dd>{tenant.is_active ? 'Active' : 'Inactive'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-workshop-charcoal/60">Email</dt>
              <dd>{tenant.contact_email || '—'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-workshop-charcoal/60">Phone</dt>
              <dd>{tenant.contact_phone || '—'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-workshop-charcoal/60">Address</dt>
              <dd className="text-right">{tenant.address || '—'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-workshop-charcoal/60">Created</dt>
              <dd>{new Date(tenant.created_at).toLocaleString()}</dd>
            </div>
          </dl>
        </div>

        <div className="card p-6">
          <h3 className="font-semibold text-workshop-charcoal mb-4">Usage counters</h3>
          <dl className="grid grid-cols-2 gap-4">
            {STAT_LABELS.map(({ key, label }) => (
              <div key={key} className="rounded-lg bg-workshop-charcoal/5 px-4 py-3">
                <dt className="text-xs text-workshop-charcoal/60">{label}</dt>
                <dd className="text-xl font-bold text-workshop-charcoal mt-1">
                  {tenant.stats[key]}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  )
}
