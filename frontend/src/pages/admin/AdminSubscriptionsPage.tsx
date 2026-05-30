import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CreditCard, LayoutGrid, Loader2, Save, Search, Table2 } from 'lucide-react'
import clsx from 'clsx'
import { platformBillingApi, tenantsApi } from '@/api'
import { AdminResponsiveTable } from '@/components/admin/AdminMobile'
import { useApiToast } from '@/hooks/useApiToast'
import {
  formatTenantSubscription,
  formatSubscriptionPeriodTimeline,
  type SubscriptionDisplayKey,
  type TenantSubscription,
} from '@/lib/tenantSubscription'

interface TenantSubscriptionDraft extends TenantSubscription {
  subscription_next_charge_at: string | null
  notes: string
}

interface TenantRow {
  id: string
  name: string
  schema_name: string
  is_active: boolean
  subscription: TenantSubscriptionDraft
  subscription_display_key?: SubscriptionDisplayKey
}

type ViewMode = 'grid' | 'table'

const INPUT_BASE =
  'min-w-0 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-workshop-blue focus:border-transparent'

const TABLE_INPUT =
  'min-w-0 px-2 py-1.5 border border-gray-300 rounded-md text-xs bg-white focus:outline-none focus:ring-2 focus:ring-workshop-blue focus:border-transparent'

const TABLE_NUMBER_INPUT = clsx(
  TABLE_INPUT,
  'w-full tabular-nums text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
)

function subscriptionBadgeClass(key: SubscriptionDisplayKey) {
  switch (key) {
    case 'paid':
      return 'bg-workshop-blue/10 text-workshop-blue'
    case 'trial':
      return 'bg-amber-50 text-amber-800'
    default:
      return 'bg-workshop-charcoal/5 text-workshop-charcoal/70'
  }
}

function SubscriptionMoneyInput({
  amount,
  currency,
  onAmountChange,
  onCurrencyChange,
  amountId,
  currencyLabel,
  className,
}: {
  amount: string
  currency: string
  onAmountChange: (value: string) => void
  onCurrencyChange: (value: string) => void
  amountId?: string
  currencyLabel: string
  className?: string
}) {
  return (
    <div
      className={clsx(
        'grid grid-cols-[minmax(6rem,1fr)_2.75rem] gap-2 w-full max-w-xs',
        className,
      )}
    >
      <input
        id={amountId}
        type="number"
        step="0.01"
        min="0"
        inputMode="decimal"
        value={amount}
        onChange={(e) => onAmountChange(e.target.value)}
        className={clsx(INPUT_BASE, 'w-full tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none')}
      />
      <input
        type="text"
        maxLength={3}
        size={3}
        value={currency}
        onChange={(e) => onCurrencyChange(e.target.value.toUpperCase())}
        className={clsx(INPUT_BASE, 'w-full max-w-[2.75rem] px-0.5 text-center uppercase text-xs')}
        aria-label={currencyLabel}
      />
    </div>
  )
}

export default function AdminSubscriptionsPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { showError, showSuccess } = useApiToast()
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [drafts, setDrafts] = useState<Record<string, TenantSubscriptionDraft>>({})

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: () => tenantsApi.getDashboard(),
  })

  const tenants = (data?.data?.tenants ?? []) as TenantRow[]

  const filtered = useMemo(() => {
    if (!search.trim()) return tenants
    const q = search.toLowerCase()
    return tenants.filter(
      (row) =>
        row.name.toLowerCase().includes(q) || row.schema_name.toLowerCase().includes(q),
    )
  }, [tenants, search])

  const getDraft = (tenant: TenantRow): TenantSubscriptionDraft =>
    drafts[tenant.id] ?? tenant.subscription

  const setDraft = (tenantId: string, patch: Partial<TenantSubscriptionDraft>) => {
    const tenant = tenants.find((row) => row.id === tenantId)
    if (!tenant) return
    setDrafts((prev) => ({
      ...prev,
      [tenantId]: { ...(prev[tenantId] ?? tenant.subscription), ...patch },
    }))
  }

  const saveMutation = useMutation({
    mutationFn: ({ tenantId, payload }: { tenantId: string; payload: TenantSubscriptionDraft }) =>
      platformBillingApi.update(tenantId, {
        subscription_fee_amount: payload.subscription_fee_amount,
        subscription_fee_currency: payload.subscription_fee_currency,
        subscription_period: payload.subscription_period,
        subscription_next_charge_at: payload.subscription_next_charge_at,
        notes: payload.notes,
      }),
    onSuccess: (_res, { tenantId }) => {
      queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['admin-tenant-platform-billing', tenantId] })
      setDrafts((prev) => {
        const next = { ...prev }
        delete next[tenantId]
        return next
      })
      showSuccess(t('adminSubscriptions.savedToast'))
    },
    onError: (err) => showError(err, t('adminSubscriptions.saveError')),
  })

  const applyPreset = (tenantId: string, preset: 'free' | 'standard') => {
    if (preset === 'free') {
      setDraft(tenantId, {
        subscription_fee_amount: '0.00',
        subscription_fee_currency: 'EUR',
        subscription_period: 'none',
        subscription_next_charge_at: null,
      })
      return
    }
    setDraft(tenantId, {
      subscription_fee_amount: '49.00',
      subscription_fee_currency: 'EUR',
      subscription_period: 'monthly',
    })
  }

  const subscriptionLabel = (tenant: TenantRow, draft: TenantSubscriptionDraft) => {
    const displayKey: SubscriptionDisplayKey =
      draft.subscription_period !== 'none' && Number(draft.subscription_fee_amount) > 0
        ? 'paid'
        : tenant.subscription_display_key === 'trial'
          ? 'trial'
          : 'free'
    return { label: formatTenantSubscription(draft, displayKey, t), displayKey }
  }

  const editorProps = (tenant: TenantRow) => {
    const draft = getDraft(tenant)
    const { label, displayKey } = subscriptionLabel(tenant, draft)
    return {
      tenant,
      draft,
      label,
      displayKey,
      onDraftChange: (patch: Partial<TenantSubscriptionDraft>) => setDraft(tenant.id, patch),
      onPreset: (preset: 'free' | 'standard') => applyPreset(tenant.id, preset),
      onSave: () => saveMutation.mutate({ tenantId: tenant.id, payload: draft }),
      isSaving: saveMutation.isPending,
    }
  }

  if (isLoading) {
    return (
      <div className="card p-12 flex justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-workshop-blue" />
      </div>
    )
  }

  if (error) {
    return <div className="card p-8 text-red-700">{t('adminSubscriptions.loadFailed')}</div>
  }

  return (
    <div className="space-y-6 min-w-0">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-workshop-charcoal flex items-center gap-2">
          <CreditCard className="w-6 h-6 text-workshop-blue shrink-0" />
          {t('adminSubscriptions.title')}
        </h2>
        <p className="text-sm text-workshop-charcoal/60 mt-1">{t('adminSubscriptions.subtitle')}</p>
      </div>

      <div className="card p-4">
        <div className="flex flex-col sm:flex-row gap-3 min-w-0">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-workshop-charcoal/40 pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('adminSubscriptions.searchPlaceholder')}
              className={clsx(INPUT_BASE, 'w-full pl-9')}
            />
          </div>
          <div
            className="inline-flex rounded-lg border border-gray-300 overflow-hidden shrink-0 self-start sm:self-auto"
            role="group"
            aria-label={t('adminSubscriptions.viewMode')}
          >
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={clsx(
                'inline-flex items-center gap-1.5 px-3 py-2 text-sm transition-colors',
                viewMode === 'grid'
                  ? 'bg-workshop-blue text-white'
                  : 'bg-white text-workshop-charcoal/70 hover:bg-workshop-charcoal/5',
              )}
              aria-pressed={viewMode === 'grid'}
            >
              <LayoutGrid className="w-4 h-4" />
              <span className="hidden sm:inline">{t('adminSubscriptions.viewGrid')}</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={clsx(
                'inline-flex items-center gap-1.5 px-3 py-2 text-sm border-l border-gray-300 transition-colors',
                viewMode === 'table'
                  ? 'bg-workshop-blue text-white'
                  : 'bg-white text-workshop-charcoal/70 hover:bg-workshop-charcoal/5',
              )}
              aria-pressed={viewMode === 'table'}
            >
              <Table2 className="w-4 h-4" />
              <span className="hidden sm:inline">{t('adminSubscriptions.viewTable')}</span>
            </button>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card p-8 text-sm text-workshop-charcoal/60 text-center">
          {search.trim() ? t('adminSubscriptions.noResults') : t('adminSubscriptions.empty')}
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 min-w-0">
          {filtered.map((tenant) => (
            <SubscriptionEditorCard key={tenant.id} {...editorProps(tenant)} />
          ))}
        </div>
      ) : (
        <div className="card overflow-hidden min-w-0">
          <AdminResponsiveTable
            desktop={
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead className="bg-workshop-charcoal/5 text-left text-xs font-medium text-workshop-charcoal/60">
                    <tr>
                      <th className="px-3 py-2.5 min-w-[11rem] whitespace-nowrap align-bottom">
                        {t('adminSubscriptions.colWorkshop')}
                      </th>
                      <th className="px-2 py-2.5 whitespace-nowrap align-bottom min-w-[10rem]">
                        {t('adminSubscriptions.colPeriodTimeline')}
                      </th>
                      <th className="px-2 py-2.5 text-right whitespace-nowrap align-bottom w-[5.5rem]">
                        {t('adminSubscriptions.colAmount')}
                      </th>
                      <th className="px-1 py-2.5 text-center whitespace-nowrap align-bottom w-[3rem]">
                        {t('adminSubscriptions.colCurrency')}
                      </th>
                      <th className="px-2 py-2.5 whitespace-nowrap align-bottom w-[6.5rem]">
                        {t('adminSubscriptions.colPeriod')}
                      </th>
                      <th className="px-2 py-2.5 whitespace-nowrap align-bottom w-[9rem]">
                        {t('adminSubscriptions.colNextCharge')}
                      </th>
                      <th className="px-3 py-2.5 whitespace-nowrap align-bottom min-w-[8rem]">
                        {t('adminSubscriptions.colNotes')}
                      </th>
                      <th className="px-2 py-2.5 text-right whitespace-nowrap align-bottom w-[7.5rem]">
                        {t('adminSubscriptions.colActions')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-workshop-charcoal/10">
                    {filtered.map((tenant) => (
                      <SubscriptionTableRow key={tenant.id} {...editorProps(tenant)} />
                    ))}
                  </tbody>
                </table>
              </div>
            }
            mobile={
              <div className="divide-y divide-workshop-charcoal/10 min-w-0">
                {filtered.map((tenant) => (
                  <SubscriptionEditorCard key={tenant.id} {...editorProps(tenant)} className="rounded-none border-0 shadow-none" />
                ))}
              </div>
            }
          />
        </div>
      )}
    </div>
  )
}

interface EditorProps {
  tenant: TenantRow
  draft: TenantSubscriptionDraft
  label: string
  displayKey: SubscriptionDisplayKey
  onDraftChange: (patch: Partial<TenantSubscriptionDraft>) => void
  onPreset: (preset: 'free' | 'standard') => void
  onSave: () => void
  isSaving: boolean
  className?: string
}

function SubscriptionEditorCard({
  tenant,
  draft,
  label,
  displayKey,
  onDraftChange,
  onPreset,
  onSave,
  isSaving,
  className,
}: EditorProps) {
  const { t } = useTranslation()

  return (
    <article className={clsx('card p-4 sm:p-5 space-y-4 min-w-0 overflow-hidden', className)}>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between min-w-0">
        <div className="min-w-0 flex-1">
          <Link
            to={`/admin/tenants/${tenant.id}`}
            className="font-semibold text-workshop-charcoal hover:text-workshop-blue break-words"
          >
            {tenant.name}
          </Link>
          <p className="text-xs text-workshop-charcoal/50 mt-0.5 break-all">{tenant.schema_name}</p>
          <p className="text-xs text-workshop-charcoal/60 mt-1">
            {formatSubscriptionPeriodTimeline(tenant.subscription, t)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0 max-w-full">
          <span
            className={clsx(
              'inline-flex px-2.5 py-1 rounded-full text-xs font-medium max-w-full truncate',
              subscriptionBadgeClass(displayKey),
            )}
          >
            {label}
          </span>
          <span
            className={clsx(
              'inline-flex px-2.5 py-1 rounded-full text-xs font-medium shrink-0',
              tenant.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800',
            )}
          >
            {tenant.is_active ? t('adminTenants.active') : t('adminTenants.inactive')}
          </span>
        </div>
      </header>

      <SubscriptionFormFields tenant={tenant} draft={draft} onDraftChange={onDraftChange} />

      <SubscriptionActions onPreset={onPreset} onSave={onSave} isSaving={isSaving} />
    </article>
  )
}

function SubscriptionTableRow({
  tenant,
  draft,
  label,
  displayKey,
  onDraftChange,
  onPreset,
  onSave,
  isSaving,
}: EditorProps) {
  const { t } = useTranslation()

  return (
    <tr className="align-top">
      <td className="px-3 py-2.5 min-w-0">
        <Link to={`/admin/tenants/${tenant.id}`} className="font-medium hover:text-workshop-blue break-words text-sm">
          {tenant.name}
        </Link>
        <div className="text-[11px] text-workshop-charcoal/50 break-all leading-tight">{tenant.schema_name}</div>
        <span className={clsx('inline-flex mt-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium max-w-full truncate', subscriptionBadgeClass(displayKey))}>
          {label}
        </span>
      </td>
      <td className="px-2 py-2.5 align-middle text-xs text-workshop-charcoal/70 whitespace-nowrap">
        {formatSubscriptionPeriodTimeline(tenant.subscription, t)}
      </td>
      <td className="px-2 py-2.5 align-middle w-[5.5rem]">
        <input
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          value={draft.subscription_fee_amount}
          onChange={(e) => onDraftChange({ subscription_fee_amount: e.target.value })}
          className={TABLE_NUMBER_INPUT}
        />
      </td>
      <td className="px-1 py-2.5 align-middle w-[3rem]">
        <input
          type="text"
          maxLength={3}
          size={3}
          value={draft.subscription_fee_currency}
          onChange={(e) => onDraftChange({ subscription_fee_currency: e.target.value.toUpperCase() })}
          className={clsx(TABLE_INPUT, 'w-[2.75rem] px-0.5 text-center uppercase font-medium')}
          aria-label={t('adminSubscriptions.colCurrency')}
        />
      </td>
      <td className="px-2 py-2.5 align-middle w-[6.5rem]">
        <select
          value={draft.subscription_period}
          onChange={(e) =>
            onDraftChange({
              subscription_period: e.target.value as TenantSubscriptionDraft['subscription_period'],
            })
          }
          className={clsx(TABLE_INPUT, 'w-full')}
        >
          <option value="none">{t('platformBilling.periodNone')}</option>
          <option value="monthly">{t('platformBilling.periodMonthly')}</option>
          <option value="yearly">{t('platformBilling.periodYearly')}</option>
        </select>
      </td>
      <td className="px-2 py-2.5 align-middle w-[9rem]">
        <input
          type="datetime-local"
          value={
            draft.subscription_next_charge_at ? draft.subscription_next_charge_at.slice(0, 16) : ''
          }
          onChange={(e) =>
            onDraftChange({
              subscription_next_charge_at: e.target.value
                ? new Date(e.target.value).toISOString()
                : null,
            })
          }
          className={clsx(TABLE_INPUT, 'w-full min-w-0')}
        />
      </td>
      <td className="px-3 py-2.5 min-w-[8rem] align-middle">
        <input
          type="text"
          value={draft.notes}
          onChange={(e) => onDraftChange({ notes: e.target.value })}
          placeholder={t('adminSubscriptions.notesPlaceholder')}
          className={clsx(TABLE_INPUT, 'w-full')}
        />
      </td>
      <td className="px-2 py-2.5 align-middle w-[7.5rem]">
        <SubscriptionActions
          onPreset={onPreset}
          onSave={onSave}
          isSaving={isSaving}
          compact
        />
      </td>
    </tr>
  )
}

function SubscriptionFormFields({
  tenant,
  draft,
  onDraftChange,
}: {
  tenant: TenantRow
  draft: TenantSubscriptionDraft
  onDraftChange: (patch: Partial<TenantSubscriptionDraft>) => void
}) {
  const { t } = useTranslation()

  return (
    <div className="rounded-xl border-2 border-workshop-blue/20 bg-workshop-blue/5 p-4 space-y-4 min-w-0 overflow-hidden">
      <div>
        <h3 className="text-sm font-semibold text-workshop-charcoal">
          {t('platformBilling.subscriptionSectionTitle')}
        </h3>
        <p className="text-xs text-workshop-charcoal/60 mt-0.5">
          {t('platformBilling.subscriptionSectionHint')}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 min-w-0">
        <div className="space-y-1.5 sm:col-span-2 min-w-0">
          <label htmlFor={`price-${tenant.id}`} className="text-xs font-medium text-workshop-charcoal/70">
            {t('adminSubscriptions.colPrice')}
          </label>
          <SubscriptionMoneyInput
            amountId={`price-${tenant.id}`}
            amount={draft.subscription_fee_amount}
            currency={draft.subscription_fee_currency}
            onAmountChange={(value) => onDraftChange({ subscription_fee_amount: value })}
            onCurrencyChange={(value) => onDraftChange({ subscription_fee_currency: value })}
            currencyLabel={t('platformBilling.subscriptionFee')}
            className="max-w-full sm:max-w-xs"
          />
        </div>

        <div className="space-y-1.5 min-w-0">
          <label htmlFor={`period-${tenant.id}`} className="text-xs font-medium text-workshop-charcoal/70">
            {t('adminSubscriptions.colPeriod')}
          </label>
          <select
            id={`period-${tenant.id}`}
            value={draft.subscription_period}
            onChange={(e) =>
              onDraftChange({
                subscription_period: e.target.value as TenantSubscriptionDraft['subscription_period'],
              })
            }
            className={clsx(INPUT_BASE, 'w-full')}
          >
            <option value="none">{t('platformBilling.periodNone')}</option>
            <option value="monthly">{t('platformBilling.periodMonthly')}</option>
            <option value="yearly">{t('platformBilling.periodYearly')}</option>
          </select>
        </div>

        <div className="space-y-1.5 min-w-0">
          <label htmlFor={`next-charge-${tenant.id}`} className="text-xs font-medium text-workshop-charcoal/70">
            {t('adminSubscriptions.colNextCharge')}
          </label>
          <input
            id={`next-charge-${tenant.id}`}
            type="datetime-local"
            value={
              draft.subscription_next_charge_at ? draft.subscription_next_charge_at.slice(0, 16) : ''
            }
            onChange={(e) =>
              onDraftChange({
                subscription_next_charge_at: e.target.value
                  ? new Date(e.target.value).toISOString()
                  : null,
              })
            }
            className={clsx(INPUT_BASE, 'w-full')}
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2 min-w-0">
          <label htmlFor={`notes-${tenant.id}`} className="text-xs font-medium text-workshop-charcoal/70">
            {t('adminSubscriptions.colNotes')}
          </label>
          <textarea
            id={`notes-${tenant.id}`}
            rows={2}
            value={draft.notes}
            onChange={(e) => onDraftChange({ notes: e.target.value })}
            placeholder={t('adminSubscriptions.notesPlaceholder')}
            className={clsx(INPUT_BASE, 'w-full resize-y min-h-[2.75rem]')}
          />
        </div>
      </div>
    </div>
  )
}

function SubscriptionActions({
  onPreset,
  onSave,
  isSaving,
  compact = false,
}: {
  onPreset: (preset: 'free' | 'standard') => void
  onSave: () => void
  isSaving: boolean
  compact?: boolean
}) {
  const { t } = useTranslation()

  if (compact) {
    return (
      <div className="flex flex-col items-end gap-2">
        <div className="flex flex-wrap justify-end gap-1">
          <button type="button" className="btn btn-secondary text-xs px-2 py-1" onClick={() => onPreset('free')}>
            {t('adminSubscriptions.presetFree')}
          </button>
          <button type="button" className="btn btn-secondary text-xs px-2 py-1" onClick={() => onPreset('standard')}>
            {t('adminSubscriptions.presetStandard')}
          </button>
        </div>
        <button
          type="button"
          disabled={isSaving}
          onClick={onSave}
          className="btn btn-primary text-xs inline-flex items-center gap-1 disabled:opacity-50"
        >
          {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {t('adminSubscriptions.save')}
        </button>
      </div>
    )
  }

  return (
    <footer className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pt-1 min-w-0">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-secondary text-sm flex-1 sm:flex-none min-w-[5rem]"
          onClick={() => onPreset('free')}
        >
          {t('adminSubscriptions.presetFree')}
        </button>
        <button
          type="button"
          className="btn btn-secondary text-sm flex-1 sm:flex-none min-w-[5rem]"
          onClick={() => onPreset('standard')}
        >
          {t('adminSubscriptions.presetStandard')}
        </button>
      </div>
      <button
        type="button"
        disabled={isSaving}
        onClick={onSave}
        className="btn btn-primary text-sm inline-flex items-center justify-center gap-1.5 w-full sm:w-auto disabled:opacity-50 shrink-0"
      >
        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {t('adminSubscriptions.save')}
      </button>
    </footer>
  )
}
