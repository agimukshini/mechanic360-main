import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Building2, Loader2, Save } from 'lucide-react'
import { platformIssuerApi } from '@/api'
import { useApiToast } from '@/hooks/useApiToast'

interface IssuerProfile {
  company_name: string
  trade_name: string
  display_name: string
  address_line1: string
  address_line2: string
  city: string
  postal_code: string
  country: string
  vat_number: string
  company_registration_number: string
  email: string
  phone: string
  website: string
  bank_name: string
  iban: string
  vat_rate_percent: string
  amounts_include_vat: boolean
  invoice_footer: string
  updated_by_username?: string
  updated_at?: string
}

const INPUT =
  'w-full min-w-0 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-workshop-blue focus:border-transparent'

export default function AdminCompanyPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { showError, showSuccess } = useApiToast()
  const [form, setForm] = useState<IssuerProfile | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-platform-issuer'],
    queryFn: () => platformIssuerApi.get().then((r) => r.data as IssuerProfile),
  })

  useEffect(() => {
    if (data) setForm(data)
  }, [data])

  const saveMutation = useMutation({
    mutationFn: (payload: Partial<IssuerProfile>) => platformIssuerApi.update(payload),
    onSuccess: (res) => {
      queryClient.setQueryData(['admin-platform-issuer'], res.data)
      setForm(res.data as IssuerProfile)
      showSuccess(t('adminCompany.savedToast'))
    },
    onError: (err) => showError(err, t('adminCompany.saveError')),
  })

  const set = <K extends keyof IssuerProfile>(key: K, value: IssuerProfile[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  if (isLoading || !form) {
    return (
      <div className="card p-12 flex justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-workshop-blue" />
      </div>
    )
  }

  if (error) {
    return <div className="card p-8 text-red-700">{t('adminCompany.loadFailed')}</div>
  }

  return (
    <div className="space-y-6 min-w-0">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-workshop-charcoal flex items-center gap-2">
          <Building2 className="w-6 h-6 text-workshop-blue shrink-0" />
          {t('adminCompany.title')}
        </h2>
        <p className="text-sm text-workshop-charcoal/60 mt-1">{t('adminCompany.subtitle')}</p>
        <p className="text-xs text-workshop-charcoal/50 mt-2">
          {t('adminCompany.invoiceHint')}{' '}
          <Link to="/admin/invoices" className="text-workshop-blue hover:underline">
            {t('adminCompany.invoicesLink')}
          </Link>
        </p>
      </div>

      <div className="card p-4 sm:p-6 space-y-6">
        <section className="space-y-4">
          <h3 className="font-semibold text-workshop-charcoal">{t('adminCompany.sectionCompany')}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={t('adminCompany.legalName')}>
              <input
                value={form.company_name}
                onChange={(e) => set('company_name', e.target.value)}
                className={INPUT}
                placeholder={t('adminCompany.legalNamePlaceholder')}
              />
            </Field>
            <Field label={t('adminCompany.tradeName')}>
              <input
                value={form.trade_name}
                onChange={(e) => set('trade_name', e.target.value)}
                className={INPUT}
                placeholder="Workshop360"
              />
            </Field>
            <Field label={t('adminCompany.registrationNumber')}>
              <input
                value={form.company_registration_number}
                onChange={(e) => set('company_registration_number', e.target.value)}
                className={INPUT}
              />
            </Field>
          </div>
        </section>

        <section className="space-y-4">
          <h3 className="font-semibold text-workshop-charcoal">{t('adminCompany.sectionAddress')}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={t('adminCompany.addressLine1')} className="sm:col-span-2">
              <input
                value={form.address_line1}
                onChange={(e) => set('address_line1', e.target.value)}
                className={INPUT}
              />
            </Field>
            <Field label={t('adminCompany.addressLine2')} className="sm:col-span-2">
              <input
                value={form.address_line2}
                onChange={(e) => set('address_line2', e.target.value)}
                className={INPUT}
              />
            </Field>
            <Field label={t('adminCompany.city')}>
              <input value={form.city} onChange={(e) => set('city', e.target.value)} className={INPUT} />
            </Field>
            <Field label={t('adminCompany.postalCode')}>
              <input
                value={form.postal_code}
                onChange={(e) => set('postal_code', e.target.value)}
                className={INPUT}
              />
            </Field>
            <Field label={t('adminCompany.country')}>
              <input
                value={form.country}
                onChange={(e) => set('country', e.target.value)}
                className={INPUT}
              />
            </Field>
          </div>
        </section>

        <section className="space-y-4 rounded-xl border-2 border-workshop-blue/20 bg-workshop-blue/5 p-4">
          <h3 className="font-semibold text-workshop-charcoal">{t('adminCompany.sectionTax')}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={t('adminCompany.vatNumber')}>
              <input
                value={form.vat_number}
                onChange={(e) => set('vat_number', e.target.value)}
                className={INPUT}
              />
            </Field>
            <Field label={t('adminCompany.vatRate')}>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={form.vat_rate_percent}
                  onChange={(e) => set('vat_rate_percent', e.target.value)}
                  className={INPUT}
                />
                <span className="text-sm text-workshop-charcoal/60 shrink-0">%</span>
              </div>
            </Field>
            <label className="sm:col-span-2 flex items-start gap-2 text-sm text-workshop-charcoal/80 cursor-pointer">
              <input
                type="checkbox"
                checked={form.amounts_include_vat}
                onChange={(e) => set('amounts_include_vat', e.target.checked)}
                className="mt-1 rounded border-gray-300"
              />
              <span>{t('adminCompany.amountsIncludeVat')}</span>
            </label>
          </div>
        </section>

        <section className="space-y-4">
          <h3 className="font-semibold text-workshop-charcoal">{t('adminCompany.sectionContact')}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={t('adminCompany.email')}>
              <input
                type="email"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                className={INPUT}
              />
            </Field>
            <Field label={t('adminCompany.phone')}>
              <input value={form.phone} onChange={(e) => set('phone', e.target.value)} className={INPUT} />
            </Field>
            <Field label={t('adminCompany.website')} className="sm:col-span-2">
              <input
                type="url"
                value={form.website}
                onChange={(e) => set('website', e.target.value)}
                className={INPUT}
                placeholder="https://"
              />
            </Field>
          </div>
        </section>

        <section className="space-y-4">
          <h3 className="font-semibold text-workshop-charcoal">{t('adminCompany.sectionBank')}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={t('adminCompany.bankName')}>
              <input
                value={form.bank_name}
                onChange={(e) => set('bank_name', e.target.value)}
                className={INPUT}
              />
            </Field>
            <Field label={t('adminCompany.iban')}>
              <input
                value={form.iban}
                onChange={(e) => set('iban', e.target.value.toUpperCase())}
                className={`${INPUT} uppercase`}
              />
            </Field>
          </div>
        </section>

        <section className="space-y-4">
          <h3 className="font-semibold text-workshop-charcoal">{t('adminCompany.sectionInvoice')}</h3>
          <Field label={t('adminCompany.invoiceFooter')}>
            <textarea
              rows={3}
              value={form.invoice_footer}
              onChange={(e) => set('invoice_footer', e.target.value)}
              className={`${INPUT} resize-y`}
              placeholder={t('adminCompany.invoiceFooterPlaceholder')}
            />
          </Field>
        </section>

        {form.updated_by_username && form.updated_at && (
          <p className="text-xs text-workshop-charcoal/50">
            {t('adminCompany.lastUpdatedBy', {
              user: form.updated_by_username,
              date: new Date(form.updated_at).toLocaleString(),
            })}
          </p>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            disabled={saveMutation.isPending}
            onClick={() => saveMutation.mutate(form)}
            className="btn btn-primary inline-flex items-center gap-2 disabled:opacity-50"
          >
            {saveMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {t('adminCompany.save')}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-workshop-charcoal/70 mb-1.5">{label}</label>
      {children}
    </div>
  )
}
