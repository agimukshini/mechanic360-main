import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Info } from 'lucide-react'
import { workshopBillingApi } from '@/api'

interface BillingStatus {
  alert_level: 'none' | 'info' | 'warning' | 'critical' | 'suspended'
  message_key: string
  tenant_active: boolean
  days_until_due: number | null
  days_until_period_end: number | null
  days_overdue: number
  grace_days_after_due: number
  invoice?: {
    invoice_number: string
    amount: string
    currency: string
    due_at: string | null
    period_end: string | null
  } | null
}

const LEVEL_STYLES: Record<string, string> = {
  info: 'bg-blue-50 border-blue-200 text-blue-900',
  warning: 'bg-amber-50 border-amber-200 text-amber-950',
  critical: 'bg-red-50 border-red-200 text-red-900',
  suspended: 'bg-red-100 border-red-300 text-red-950',
}

export default function PlatformBillingAlertBanner() {
  const { t } = useTranslation()
  const { data } = useQuery({
    queryKey: ['platform-billing-status'],
    queryFn: () => workshopBillingApi.getStatus().then((r) => r.data as BillingStatus),
    refetchInterval: 5 * 60 * 1000,
  })

  if (!data || data.alert_level === 'none') {
    return null
  }

  const invoice = data.invoice
  const style = LEVEL_STYLES[data.alert_level] ?? LEVEL_STYLES.info
  const Icon = data.alert_level === 'info' ? Info : AlertTriangle

  return (
    <div className={`mb-4 rounded-xl border px-4 py-3 ${style}`}>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="flex gap-3 min-w-0">
          <Icon className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="font-semibold text-sm">
              {t(`platformBillingAlert.title.${data.message_key}`, {
                defaultValue: t('platformBillingAlert.title.default'),
              })}
            </p>
            <p className="text-sm mt-1 opacity-90">
              {t(`platformBillingAlert.body.${data.message_key}`, {
                invoiceNumber: invoice?.invoice_number ?? '—',
                amount: invoice ? `${invoice.amount} ${invoice.currency}` : '—',
                daysUntilDue: data.days_until_due ?? '—',
                daysUntilPeriodEnd: data.days_until_period_end ?? '—',
                daysOverdue: data.days_overdue,
                graceDays: data.grace_days_after_due,
                defaultValue: t('platformBillingAlert.body.default'),
              })}
            </p>
          </div>
        </div>
        <Link
          to="/settings"
          className="shrink-0 text-sm font-medium underline underline-offset-2 self-start"
        >
          {t('platformBillingAlert.viewInvoices')}
        </Link>
      </div>
    </div>
  )
}
