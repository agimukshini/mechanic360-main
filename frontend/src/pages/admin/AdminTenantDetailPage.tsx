import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CreditCard, Loader2, RefreshCcw, Save } from 'lucide-react'
import { platformBillingApi, tenantsApi } from '@/api'
import { useApiToast } from '@/hooks/useApiToast'

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

interface PlatformBilling {
  id: string
  transfer_fee_amount: string
  transfer_fee_currency: string
  registration_fee_amount: string
  registration_fee_currency: string
  subscription_fee_amount: string
  subscription_fee_currency: string
  subscription_period: 'none' | 'monthly' | 'yearly'
  subscription_next_charge_at: string | null
  notes: string
  updated_by_username?: string
  updated_at: string
}

export default function AdminTenantDetailPage() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const { showError, showSuccess } = useApiToast()

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-tenant', id],
    queryFn: () => tenantsApi.get(id!),
    enabled: Boolean(id),
  })

  const billingQuery = useQuery({
    queryKey: ['admin-tenant-platform-billing', id],
    queryFn: () => platformBillingApi.get(id!).then((r) => r.data as PlatformBilling),
    enabled: Boolean(id),
  })

  const toggleMutation = useMutation({
    mutationFn: (is_active: boolean) => tenantsApi.update(id!, { is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-tenant', id] })
      queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] })
    },
  })

  const billingMutation = useMutation({
    mutationFn: (payload: Partial<PlatformBilling>) =>
      platformBillingApi.update(id!, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-tenant-platform-billing', id] })
      showSuccess('Platform billing updated')
    },
    onError: (err) => showError(err, 'Failed to update platform billing'),
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

      <PlatformBillingPanel
        billing={billingQuery.data}
        isLoading={billingQuery.isLoading}
        isSaving={billingMutation.isPending}
        onSave={(payload) => billingMutation.mutate(payload)}
      />
    </div>
  )
}

interface BillingPanelProps {
  billing: PlatformBilling | undefined
  isLoading: boolean
  isSaving: boolean
  onSave: (payload: Partial<PlatformBilling>) => void
}

function PlatformBillingPanel({ billing, isLoading, isSaving, onSave }: BillingPanelProps) {
  const [form, setForm] = useState<Partial<PlatformBilling>>({})

  useEffect(() => {
    if (billing) {
      setForm({
        transfer_fee_amount: billing.transfer_fee_amount,
        transfer_fee_currency: billing.transfer_fee_currency,
        registration_fee_amount: billing.registration_fee_amount,
        registration_fee_currency: billing.registration_fee_currency,
        subscription_fee_amount: billing.subscription_fee_amount,
        subscription_fee_currency: billing.subscription_fee_currency,
        subscription_period: billing.subscription_period,
        subscription_next_charge_at: billing.subscription_next_charge_at,
        notes: billing.notes,
      })
    }
  }, [billing])

  if (isLoading) {
    return (
      <div className="card p-12 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-workshop-blue" />
      </div>
    )
  }

  const update = <K extends keyof PlatformBilling>(k: K, v: PlatformBilling[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  const renderMoney = (
    amountKey: 'transfer_fee_amount' | 'registration_fee_amount' | 'subscription_fee_amount',
    currencyKey:
      | 'transfer_fee_currency'
      | 'registration_fee_currency'
      | 'subscription_fee_currency',
    label: string,
    hint: string,
  ) => (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-workshop-charcoal/70">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          type="number"
          step="0.01"
          min="0"
          value={form[amountKey] ?? ''}
          onChange={(e) => update(amountKey, e.target.value as never)}
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
        <input
          type="text"
          maxLength={3}
          value={form[currencyKey] ?? ''}
          onChange={(e) =>
            update(currencyKey, e.target.value.toUpperCase() as never)
          }
          className="w-20 px-3 py-2 border border-gray-300 rounded-lg uppercase text-sm text-center"
        />
      </div>
      <p className="text-xs text-workshop-charcoal/50">{hint}</p>
    </div>
  )

  return (
    <div className="card p-6 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-workshop-charcoal flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-workshop-blue" />
            Platform billing
          </h3>
          <p className="text-xs text-workshop-charcoal/60 mt-1">
            What the PLATFORM charges this workshop. Distinct from this
            workshop's prices for its own service-catalog. Each new transfer
            or registration freezes a snapshot of these values, so changes
            here never rewrite historical fees.
          </p>
        </div>
        {billing?.updated_by_username && (
          <p className="text-xs text-workshop-charcoal/50 text-right shrink-0">
            Last updated by <strong>{billing.updated_by_username}</strong>
            <br />
            {new Date(billing.updated_at).toLocaleString()}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {renderMoney(
          'transfer_fee_amount',
          'transfer_fee_currency',
          'Ownership transfer fee',
          'Charged per confirmed ownership transfer.',
        )}
        {renderMoney(
          'registration_fee_amount',
          'registration_fee_currency',
          'Vehicle registration fee',
          'Charged once when a vehicle is added to the global registry.',
        )}
        {renderMoney(
          'subscription_fee_amount',
          'subscription_fee_currency',
          'Subscription fee',
          'Recurring platform access fee.',
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-workshop-charcoal/70">
            Subscription period
          </label>
          <select
            value={form.subscription_period ?? 'none'}
            onChange={(e) =>
              update('subscription_period', e.target.value as PlatformBilling['subscription_period'])
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="none">No subscription</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-workshop-charcoal/70">
            Next charge at
          </label>
          <input
            type="datetime-local"
            value={
              form.subscription_next_charge_at
                ? form.subscription_next_charge_at.slice(0, 16)
                : ''
            }
            onChange={(e) =>
              update(
                'subscription_next_charge_at',
                (e.target.value ? new Date(e.target.value).toISOString() : null) as never,
              )
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-workshop-charcoal/70">
          Superadmin notes
        </label>
        <textarea
          rows={2}
          value={form.notes ?? ''}
          onChange={(e) => update('notes', e.target.value as never)}
          placeholder="Visible only to superadmins (pilot pricing, manual adjustments, …)"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
      </div>

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() =>
            billing &&
            setForm({
              transfer_fee_amount: billing.transfer_fee_amount,
              transfer_fee_currency: billing.transfer_fee_currency,
              registration_fee_amount: billing.registration_fee_amount,
              registration_fee_currency: billing.registration_fee_currency,
              subscription_fee_amount: billing.subscription_fee_amount,
              subscription_fee_currency: billing.subscription_fee_currency,
              subscription_period: billing.subscription_period,
              subscription_next_charge_at: billing.subscription_next_charge_at,
              notes: billing.notes,
            })
          }
          className="btn btn-secondary inline-flex items-center gap-1.5 text-sm"
        >
          <RefreshCcw className="w-4 h-4" />
          Reset
        </button>
        <button
          type="button"
          onClick={() => onSave(form)}
          disabled={isSaving}
          className="btn btn-primary inline-flex items-center gap-1.5 text-sm disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {isSaving ? 'Saving…' : 'Save platform billing'}
        </button>
      </div>
    </div>
  )
}
