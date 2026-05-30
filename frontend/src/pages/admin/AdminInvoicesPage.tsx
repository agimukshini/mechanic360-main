import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  Loader2,
  Search,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { adminInvoicesApi } from '@/api'
import { AdminField, AdminMobileCard, AdminResponsiveTable } from '@/components/admin/AdminMobile'
import { useApiToast } from '@/hooks/useApiToast'
import { downloadBlob, filenameFromContentDisposition } from '@/lib/download'

interface InvoiceRow {
  id: string
  invoice_number: string
  tenant_name: string
  tenant_schema: string
  kind: string
  amount: string
  currency: string
  payment_status: string
  invoice_reference: string
  paid_at: string | null
  period_start: string | null
  period_end: string | null
  due_at: string | null
  issued_at: string
  notes: string
}

const PAYMENT_STYLES: Record<string, string> = {
  unpaid: 'bg-red-50 text-red-700',
  processing: 'bg-amber-50 text-amber-800',
  paid: 'bg-emerald-50 text-emerald-800',
  refunded: 'bg-blue-50 text-blue-700',
  waived: 'bg-purple-50 text-purple-700',
}

const PAYMENT_OPTIONS = ['unpaid', 'processing', 'paid', 'refunded', 'waived']

function formatMoney(amount: string, currency: string) {
  return `${amount} ${currency}`
}

function formatPeriod(start: string | null, end: string | null) {
  if (!start || !end) return '—'
  return `${new Date(start).toLocaleDateString()} – ${new Date(end).toLocaleDateString()}`
}

export default function AdminInvoicesPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { showError, showSuccess } = useApiToast()
  const [searchParams] = useSearchParams()
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [paymentFilter, setPaymentFilter] = useState('')
  const [kindFilter, setKindFilter] = useState('')
  const [search, setSearch] = useState('')
  const tenantFilter = searchParams.get('tenant_id') ?? ''

  const { data, isLoading } = useQuery({
    queryKey: ['admin-invoices', tenantFilter, paymentFilter, kindFilter],
    queryFn: () =>
      adminInvoicesApi
        .list({
          ...(tenantFilter ? { tenant_id: tenantFilter } : {}),
          ...(paymentFilter ? { payment_status: paymentFilter } : {}),
          ...(kindFilter ? { kind: kindFilter } : {}),
        })
        .then((r) => r.data as InvoiceRow[] | { results?: InvoiceRow[] }),
  })

  const rows = useMemo(() => {
    const list = Array.isArray(data) ? data : data?.results ?? []
    if (!search.trim()) return list
    const q = search.toLowerCase()
    return list.filter(
      (row) =>
        row.invoice_number.toLowerCase().includes(q)
        || row.tenant_name.toLowerCase().includes(q)
        || row.tenant_schema.toLowerCase().includes(q)
        || row.invoice_reference.toLowerCase().includes(q),
    )
  }, [data, search])

  const paymentMutation = useMutation({
    mutationFn: ({
      id,
      payment_status,
      invoice_reference,
      notes,
    }: {
      id: string
      payment_status?: string
      invoice_reference?: string
      notes?: string
    }) => adminInvoicesApi.updatePayment(id, { payment_status, invoice_reference, notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-invoices'] })
      showSuccess(t('adminInvoices.savedToast'))
    },
    onError: (err) => showError(err, t('adminInvoices.saveError')),
  })

  const downloadPdf = async (row: InvoiceRow) => {
    try {
      const res = await adminInvoicesApi.downloadPdf(row.id)
      const filename = filenameFromContentDisposition(
        res.headers['content-disposition'],
        `${row.invoice_number}.pdf`,
      )
      downloadBlob(res.data as Blob, filename)
    } catch (err) {
      showError(err, t('adminInvoices.pdfError'))
    }
  }

  return (
    <div className="space-y-6 min-w-0">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-workshop-charcoal flex items-center gap-2">
          <FileText className="w-6 h-6 text-workshop-blue shrink-0" />
          {t('adminInvoices.title')}
        </h2>
        <p className="text-sm text-workshop-charcoal/60 mt-1">{t('adminInvoices.subtitle')}</p>
      </div>

      <div className="card p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative sm:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-workshop-charcoal/40" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('adminInvoices.searchPlaceholder')}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">{t('adminInvoices.allPaymentStatuses')}</option>
            {PAYMENT_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {t(`adminInvoices.payment.${s}`)}
              </option>
            ))}
          </select>
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">{t('adminInvoices.allKinds')}</option>
            <option value="subscription">{t('adminInvoices.kind.subscription')}</option>
            <option value="transfer">{t('adminInvoices.kind.transfer')}</option>
            <option value="registration">{t('adminInvoices.kind.registration')}</option>
            <option value="manual">{t('adminInvoices.kind.manual')}</option>
          </select>
        </div>
        {tenantFilter && (
          <p className="text-xs text-workshop-charcoal/60">
            {t('adminInvoices.filteredByTenant')}{' '}
            <Link to="/admin/invoices" className="text-workshop-blue hover:underline">
              {t('adminInvoices.clearTenantFilter')}
            </Link>
          </p>
        )}
      </div>

      {isLoading ? (
        <div className="card p-12 flex justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-workshop-blue" />
        </div>
      ) : rows.length === 0 ? (
        <div className="card p-8 text-sm text-workshop-charcoal/60">{t('adminInvoices.empty')}</div>
      ) : (
        <AdminResponsiveTable
          desktop={
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase text-workshop-charcoal/60">
                <tr>
                  <th className="px-4 py-3 w-8" />
                  <th className="px-4 py-3">{t('adminInvoices.colNumber')}</th>
                  <th className="px-4 py-3">{t('adminInvoices.colTenant')}</th>
                  <th className="px-4 py-3">{t('adminInvoices.colKind')}</th>
                  <th className="px-4 py-3">{t('adminInvoices.colAmount')}</th>
                  <th className="px-4 py-3">{t('adminInvoices.colStatus')}</th>
                  <th className="px-4 py-3">{t('adminInvoices.colDue')}</th>
                  <th className="px-4 py-3">{t('adminInvoices.colIssued')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row) => (
                  <InvoiceTableRow
                    key={row.id}
                    row={row}
                    expanded={Boolean(expanded[row.id])}
                    onToggle={() =>
                      setExpanded((prev) => ({ ...prev, [row.id]: !prev[row.id] }))
                    }
                    onDownload={() => downloadPdf(row)}
                    onSave={(payload) => paymentMutation.mutate({ id: row.id, ...payload })}
                    isSaving={paymentMutation.isPending}
                  />
                ))}
              </tbody>
            </table>
          }
          mobile={
            <div className="divide-y divide-gray-100">
              {rows.map((row) => (
                <InvoiceMobileCard
                  key={row.id}
                  row={row}
                  expanded={Boolean(expanded[row.id])}
                  onToggle={() =>
                    setExpanded((prev) => ({ ...prev, [row.id]: !prev[row.id] }))
                  }
                  onDownload={() => downloadPdf(row)}
                  onSave={(payload) => paymentMutation.mutate({ id: row.id, ...payload })}
                  isSaving={paymentMutation.isPending}
                />
              ))}
            </div>
          }
        />
      )}
    </div>
  )
}

interface RowProps {
  row: InvoiceRow
  expanded: boolean
  onToggle: () => void
  onDownload: () => void
  onSave: (payload: {
    payment_status?: string
    invoice_reference?: string
    notes?: string
  }) => void
  isSaving: boolean
}

function InvoiceTableRow({ row, expanded, onToggle, onDownload, onSave, isSaving }: RowProps) {
  const { t } = useTranslation()
  return (
    <>
      <tr className="hover:bg-gray-50/80">
        <td className="px-4 py-3">
          <button type="button" onClick={onToggle} className="text-workshop-charcoal/50">
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </td>
        <td className="px-4 py-3 font-medium">{row.invoice_number}</td>
        <td className="px-4 py-3">
          <div>{row.tenant_name}</div>
          <div className="text-xs text-workshop-charcoal/50">{row.tenant_schema}</div>
        </td>
        <td className="px-4 py-3">{t(`adminInvoices.kind.${row.kind}`, row.kind)}</td>
        <td className="px-4 py-3">{formatMoney(row.amount, row.currency)}</td>
        <td className="px-4 py-3">
          <span
            className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
              PAYMENT_STYLES[row.payment_status] ?? 'bg-gray-100'
            }`}
          >
            {t(`adminInvoices.payment.${row.payment_status}`, row.payment_status)}
          </span>
        </td>
        <td className="px-4 py-3">
          {row.due_at ? new Date(row.due_at).toLocaleDateString() : '—'}
        </td>
        <td className="px-4 py-3">{new Date(row.issued_at).toLocaleDateString()}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={8} className="px-4 py-4 bg-workshop-charcoal/5">
            <InvoiceEditor row={row} onDownload={onDownload} onSave={onSave} isSaving={isSaving} />
          </td>
        </tr>
      )}
    </>
  )
}

function InvoiceMobileCard({ row, expanded, onToggle, onDownload, onSave, isSaving }: RowProps) {
  const { t } = useTranslation()
  return (
    <AdminMobileCard>
      <button type="button" onClick={onToggle} className="w-full text-left">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-workshop-charcoal break-all">{row.invoice_number}</p>
            <p className="text-sm text-workshop-charcoal/70 mt-0.5">{row.tenant_name}</p>
          </div>
          <span
            className={`shrink-0 inline-flex px-2 py-0.5 rounded text-xs font-medium ${
              PAYMENT_STYLES[row.payment_status] ?? 'bg-gray-100'
            }`}
          >
            {t(`adminInvoices.payment.${row.payment_status}`, row.payment_status)}
          </span>
        </div>
        <p className="text-sm mt-2">{formatMoney(row.amount, row.currency)}</p>
      </button>
      {expanded && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <InvoiceEditor row={row} onDownload={onDownload} onSave={onSave} isSaving={isSaving} />
        </div>
      )}
    </AdminMobileCard>
  )
}

function InvoiceEditor({
  row,
  onDownload,
  onSave,
  isSaving,
}: {
  row: InvoiceRow
  onDownload: () => void
  onSave: RowProps['onSave']
  isSaving: boolean
}) {
  const { t } = useTranslation()
  const [paymentStatus, setPaymentStatus] = useState(row.payment_status)
  const [invoiceReference, setInvoiceReference] = useState(row.invoice_reference)
  const [notes, setNotes] = useState(row.notes)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
        <AdminField label={t('adminInvoices.colPeriod')}>
          {formatPeriod(row.period_start, row.period_end)}
        </AdminField>
        <AdminField label={t('adminInvoices.colReference')}>
          {row.invoice_reference || '—'}
        </AdminField>
        <AdminField label={t('adminInvoices.colPaidAt')}>
          {row.paid_at ? new Date(row.paid_at).toLocaleString() : '—'}
        </AdminField>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-workshop-charcoal/70">
            {t('adminInvoices.paymentStatus')}
          </label>
          <select
            value={paymentStatus}
            onChange={(e) => setPaymentStatus(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            {PAYMENT_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {t(`adminInvoices.payment.${s}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-workshop-charcoal/70">
            {t('adminInvoices.externalReference')}
          </label>
          <input
            type="text"
            value={invoiceReference}
            onChange={(e) => setInvoiceReference(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <div className="space-y-1 sm:col-span-2 lg:col-span-1">
          <label className="text-xs font-medium text-workshop-charcoal/70">
            {t('adminInvoices.notes')}
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
      </div>
      <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
        <button
          type="button"
          onClick={onDownload}
          className="btn btn-secondary inline-flex items-center justify-center gap-1.5 text-sm w-full sm:w-auto"
        >
          <Download className="w-4 h-4" />
          {t('adminInvoices.downloadPdf')}
        </button>
        <button
          type="button"
          disabled={isSaving}
          onClick={() =>
            onSave({
              payment_status: paymentStatus,
              invoice_reference: invoiceReference,
              notes,
            })
          }
          className="btn btn-primary text-sm w-full sm:w-auto disabled:opacity-50"
        >
          {isSaving ? t('adminInvoices.saving') : t('adminInvoices.savePayment')}
        </button>
      </div>
    </div>
  )
}
