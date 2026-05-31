import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, CreditCard, FileText, Loader2, RefreshCcw, Save } from 'lucide-react'
import { adminInvoicesApi, platformBillingApi, tenantsApi } from '@/api'
import { useApiToast } from '@/hooks/useApiToast'
import {
  formatTenantSubscription,
  formatSubscriptionPeriodRange,
  formatSubscriptionPeriodTimeline,
  type SubscriptionDisplayKey,
  type TenantSubscription,
} from '@/lib/tenantSubscription'

interface TenantDetail {
  id: string
  name: string
  business_registration_number?: string
  schema_name: string
  logo_url: string
  address: string
  contact_email: string
  contact_phone: string
  subscription_plan: string
  subscription_display_key?: SubscriptionDisplayKey
  subscription?: TenantSubscription
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

const STAT_LABELS: { key: keyof TenantDetail['stats']; tk: string }[] = [
  { key: 'users', tk: 'adminTenantDetail.statUsers' },
  { key: 'clients', tk: 'adminTenantDetail.statClients' },
  { key: 'vehicles', tk: 'adminTenantDetail.statVehicles' },
  { key: 'visits', tk: 'adminTenantDetail.statVisits' },
  { key: 'inspections', tk: 'adminTenantDetail.statInspections' },
  { key: 'inventory_items', tk: 'adminTenantDetail.statInventoryItems' },
  { key: 'global_vehicles_registered', tk: 'adminTenantDetail.statGlobalVehicles' },
  { key: 'marketplace_listings', tk: 'adminTenantDetail.statMarketplaceListings' },
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
  const { t } = useTranslation()

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
      showSuccess(t('platformBilling.savedToast'))
    },
    onError: (err) => showError(err, t('platformBilling.saveError')),
  })

  if (isLoading) {
    return (
      <div className="card p-12 flex justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-workshop-blue" />
      </div>
    )
  }

  if (error || !data?.data) {
    return <div className="card p-8 text-red-700">{t('adminTenantDetail.tenantNotFound')}</div>
  }

  const tenant = data.data as TenantDetail

  const subscriptionLabel = formatTenantSubscription(
    tenant.subscription,
    tenant.subscription_display_key,
    t,
  )

  const subscriptionPeriodLabel = formatSubscriptionPeriodTimeline(tenant.subscription, t)
  const subscriptionPeriodRange = formatSubscriptionPeriodRange(tenant.subscription)
  const periodStart = tenant.subscription?.subscription_period_start
  const periodEnd = tenant.subscription?.subscription_period_end

  const periodProgress =
    periodStart && periodEnd
      ? Math.min(
          100,
          Math.max(
            0,
            ((Date.now() - new Date(periodStart).getTime()) /
              (new Date(periodEnd).getTime() - new Date(periodStart).getTime())) *
              100,
          ),
        )
      : null

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 min-w-0">
        <Link to="/admin/tenants" className="text-workshop-charcoal/60 hover:text-workshop-blue shrink-0 self-start">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl sm:text-2xl font-bold text-workshop-charcoal break-words">{tenant.name}</h2>
          <p className="text-workshop-charcoal/60 mt-1 break-all">{tenant.schema_name}</p>
        </div>
        <button
          type="button"
          className="btn btn-secondary w-full sm:w-auto shrink-0"
          disabled={toggleMutation.isPending}
          onClick={() => toggleMutation.mutate(!tenant.is_active)}
        >
          {tenant.is_active ? t('adminTenantDetail.deactivateTenant') : t('adminTenantDetail.activateTenant')}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-6 space-y-3">
          <h3 className="font-semibold text-workshop-charcoal">{t('adminTenantDetail.workshopDetails')}</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-workshop-charcoal/60">{t('adminTenantDetail.plan')}</dt>
              <dd>{subscriptionLabel}</dd>
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between gap-4">
                <dt className="text-workshop-charcoal/60">{t('adminTenantDetail.subscriptionPeriod')}</dt>
                <dd className="text-right">{subscriptionPeriodLabel}</dd>
              </div>
              {subscriptionPeriodRange && periodProgress != null && (
                <div className="space-y-1">
                  <div className="h-1.5 rounded-full bg-workshop-charcoal/10 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-workshop-blue transition-all"
                      style={{ width: `${periodProgress}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-workshop-charcoal/50">
                    <span>
                      {periodStart
                        ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(
                            new Date(periodStart),
                          )
                        : '—'}
                    </span>
                    <span>
                      {periodEnd
                        ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(
                            new Date(periodEnd),
                          )
                        : '—'}
                    </span>
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-workshop-charcoal/60">{t('adminTenantDetail.status')}</dt>
              <dd>{tenant.is_active ? t('adminTenantDetail.active') : t('adminTenantDetail.inactive')}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-workshop-charcoal/60">{t('adminTenantDetail.nui')}</dt>
              <dd>{tenant.business_registration_number || '—'}</dd>
            </div>
            <div className="flex justify-between gap-4 min-w-0">
              <dt className="text-workshop-charcoal/60 shrink-0">{t('adminTenantDetail.email')}</dt>
              <dd className="text-right break-all">{tenant.contact_email || '—'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-workshop-charcoal/60">{t('adminTenantDetail.phone')}</dt>
              <dd>{tenant.contact_phone || '—'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-workshop-charcoal/60">{t('adminTenantDetail.address')}</dt>
              <dd className="text-right">{tenant.address || '—'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-workshop-charcoal/60">{t('adminTenantDetail.created')}</dt>
              <dd>{new Date(tenant.created_at).toLocaleString()}</dd>
            </div>
          </dl>
        </div>

        <div className="card p-6">
          <h3 className="font-semibold text-workshop-charcoal mb-4">{t('adminTenantDetail.usageCounters')}</h3>
          <dl className="grid grid-cols-2 gap-4">
            {STAT_LABELS.map(({ key, tk }) => (
              <div key={key} className="rounded-lg bg-workshop-charcoal/5 px-4 py-3">
                <dt className="text-xs text-workshop-charcoal/60">{t(tk)}</dt>
                <dd className="text-xl font-bold text-workshop-charcoal mt-1">
                  {tenant.stats[key]}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <PlatformBillingPanel
        tenantId={id!}
        billing={billingQuery.data}
        isLoading={billingQuery.isLoading}
        isSaving={billingMutation.isPending}
        onSave={(payload) => billingMutation.mutate(payload)}
      />
    </div>
  )
}

interface BillingPanelProps {
  tenantId: string
  billing: PlatformBilling | undefined
  isLoading: boolean
  isSaving: boolean
  onSave: (payload: Partial<PlatformBilling>) => void
}

function PlatformBillingPanel({ tenantId, billing, isLoading, isSaving, onSave }: BillingPanelProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { showError, showSuccess } = useApiToast()
  const [form, setForm] = useState<Partial<PlatformBilling>>({})

  const issueMutation = useMutation({
    mutationFn: () => adminInvoicesApi.issueSubscription(tenantId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-tenant-platform-billing', tenantId] })
      queryClient.invalidateQueries({ queryKey: ['admin-invoices'] })
      showSuccess(t('platformBilling.issueInvoiceSuccess'))
    },
    onError: (err) => showError(err, t('platformBilling.issueInvoiceError')),
  })

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
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-workshop-charcoal flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-workshop-blue shrink-0" />
            {t('platformBilling.title')}
          </h3>
          <p className="text-xs text-workshop-charcoal/60 mt-1">
            {t('platformBilling.subtitle')}
          </p>
        </div>
        {billing?.updated_by_username && (
          <p className="text-xs text-workshop-charcoal/50 sm:text-right break-words">
            {t('platformBilling.lastUpdatedBy')} <strong>{billing.updated_by_username}</strong>
            <br />
            {new Date(billing.updated_at).toLocaleString()}
          </p>
        )}
      </div>

      <div className="rounded-xl border-2 border-workshop-blue/20 bg-workshop-blue/5 p-4 space-y-4">
        <div>
          <h4 className="font-semibold text-workshop-charcoal">{t('platformBilling.subscriptionSectionTitle')}</h4>
          <p className="text-xs text-workshop-charcoal/60 mt-1">{t('platformBilling.subscriptionSectionHint')}</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {renderMoney(
            'subscription_fee_amount',
            'subscription_fee_currency',
            t('platformBilling.subscriptionFee'),
            t('platformBilling.subscriptionFeeHint'),
          )}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-workshop-charcoal/70">
              {t('platformBilling.subscriptionPeriod')}
            </label>
            <select
              value={form.subscription_period ?? 'none'}
              onChange={(e) =>
                update('subscription_period', e.target.value as PlatformBilling['subscription_period'])
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="none">{t('platformBilling.periodNone')}</option>
              <option value="monthly">{t('platformBilling.periodMonthly')}</option>
              <option value="yearly">{t('platformBilling.periodYearly')}</option>
            </select>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <label className="text-xs font-medium text-workshop-charcoal/70">
              {t('platformBilling.nextChargeAt')}
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
              className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-workshop-charcoal mb-3">{t('platformBilling.otherFeesTitle')}</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {renderMoney(
          'transfer_fee_amount',
          'transfer_fee_currency',
          t('platformBilling.ownershipTransferFee'),
          t('platformBilling.ownershipTransferFeeHint'),
        )}
        {renderMoney(
          'registration_fee_amount',
          'registration_fee_currency',
          t('platformBilling.registrationFee'),
          t('platformBilling.registrationFeeHint'),
        )}
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-workshop-charcoal/70">
          {t('platformBilling.superadminNotes')}
        </label>
        <textarea
          rows={2}
          value={form.notes ?? ''}
          onChange={(e) => update('notes', e.target.value as never)}
          placeholder={t('platformBilling.superadminNotesPlaceholder')}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <Link
            to={`/admin/invoices?tenant_id=${tenantId}`}
            className="btn btn-secondary inline-flex items-center justify-center gap-1.5 text-sm w-full sm:w-auto"
          >
            <FileText className="w-4 h-4" />
            {t('platformBilling.viewInvoices')}
          </Link>
          {form.subscription_period && form.subscription_period !== 'none' && (
            <button
              type="button"
              disabled={issueMutation.isPending}
              onClick={() => issueMutation.mutate()}
              className="btn btn-secondary inline-flex items-center justify-center gap-1.5 text-sm w-full sm:w-auto disabled:opacity-50"
            >
              {issueMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileText className="w-4 h-4" />
              )}
              {t('platformBilling.issueInvoiceNow')}
            </button>
          )}
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2">
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
            className="btn btn-secondary inline-flex items-center justify-center gap-1.5 text-sm w-full sm:w-auto"
          >
            <RefreshCcw className="w-4 h-4" />
            {t('platformBilling.reset')}
          </button>
          <button
            type="button"
            onClick={() => onSave(form)}
            disabled={isSaving}
            className="btn btn-primary inline-flex items-center justify-center gap-1.5 text-sm w-full sm:w-auto disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {isSaving ? t('platformBilling.saving') : t('platformBilling.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
