import type { TFunction } from 'i18next'

export interface TenantSubscription {
  subscription_fee_amount: string
  subscription_fee_currency: string
  subscription_period: 'none' | 'monthly' | 'yearly'
  subscription_next_charge_at?: string | null
  subscription_period_start?: string | null
  subscription_period_end?: string | null
  subscription_days_remaining?: number | null
}

/** Matches backend `subscription_display_key` in tenancy.stats. */
export type SubscriptionDisplayKey = 'trial' | 'free' | 'paid'

function formatDate(value: string, locale?: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(value))
}

/** e.g. "Jan 15, 2026 – Feb 15, 2026" */
export function formatSubscriptionPeriodRange(
  subscription: TenantSubscription | undefined,
  locale?: string,
): string | null {
  const start = subscription?.subscription_period_start
  const end = subscription?.subscription_period_end
  if (!start || !end) {
    return null
  }
  return `${formatDate(start, locale)} – ${formatDate(end, locale)}`
}

/** Period range plus days remaining hint for admin lists. */
export function formatSubscriptionPeriodTimeline(
  subscription: TenantSubscription | undefined,
  t: TFunction,
  locale?: string,
): string {
  const range = formatSubscriptionPeriodRange(subscription, locale)
  if (!range) {
    return '—'
  }

  const days = subscription?.subscription_days_remaining
  if (days == null) {
    return range
  }
  if (days < 0) {
    return `${range} · ${t('adminSubscriptions.periodEnded')}`
  }
  if (days === 0) {
    return `${range} · ${t('adminSubscriptions.periodEndsToday')}`
  }
  return `${range} · ${t('adminSubscriptions.periodDaysLeft', { count: days })}`
}

export function formatTenantSubscription(
  subscription: TenantSubscription | undefined,
  displayKey: SubscriptionDisplayKey | undefined,
  t: TFunction,
): string {
  const key = displayKey ?? 'free'
  if (key === 'trial') {
    return t('adminSubscriptions.trial')
  }
  if (key === 'free') {
    return t('adminSubscriptions.free')
  }
  const sub = subscription
  if (!sub) {
    return t('adminSubscriptions.free')
  }
  const period =
    sub.subscription_period === 'monthly'
      ? t('platformBilling.periodMonthly')
      : t('platformBilling.periodYearly')
  return `${sub.subscription_fee_amount} ${sub.subscription_fee_currency} / ${period}`
}
