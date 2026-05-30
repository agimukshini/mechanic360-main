import { useQuery } from '@tanstack/react-query'
import { Download, FileText, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { workshopInvoicesApi } from '@/api'
import { useApiToast } from '@/hooks/useApiToast'
import { downloadBlob, filenameFromContentDisposition } from '@/lib/download'

interface WorkshopInvoice {
  id: string
  invoice_number: string
  kind: string
  amount: string
  currency: string
  payment_status: string
  due_at: string | null
  issued_at: string
  period_start: string | null
  period_end: string | null
}

const PAYMENT_STYLES: Record<string, string> = {
  unpaid: 'bg-red-50 text-red-700',
  processing: 'bg-amber-50 text-amber-800',
  paid: 'bg-emerald-50 text-emerald-800',
  refunded: 'bg-blue-50 text-blue-700',
  waived: 'bg-purple-50 text-purple-700',
}

export default function WorkshopPlatformInvoicesPanel() {
  const { t } = useTranslation()
  const { showError } = useApiToast()

  const { data, isLoading } = useQuery({
    queryKey: ['workshop-platform-invoices'],
    queryFn: () =>
      workshopInvoicesApi.list().then((r) => r.data as WorkshopInvoice[] | { results?: WorkshopInvoice[] }),
  })

  const rows = Array.isArray(data) ? data : data?.results ?? []

  const downloadPdf = async (row: WorkshopInvoice) => {
    try {
      const res = await workshopInvoicesApi.downloadPdf(row.id)
      const filename = filenameFromContentDisposition(
        res.headers['content-disposition'],
        `${row.invoice_number}.pdf`,
      )
      downloadBlob(res.data as Blob, filename)
    } catch (err) {
      showError(err, t('workshopInvoices.pdfError'))
    }
  }

  return (
    <div className="card p-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <FileText className="w-5 h-5 text-workshop-blue" />
          {t('workshopInvoices.title')}
        </h2>
        <p className="text-sm text-gray-500 mt-1">{t('workshopInvoices.subtitle')}</p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-workshop-blue" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500">{t('workshopInvoices.empty')}</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <div
              key={row.id}
              className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border border-gray-200 p-4"
            >
              <div className="min-w-0">
                <p className="font-medium text-gray-900 break-all">{row.invoice_number}</p>
                <p className="text-sm text-gray-600 mt-0.5">
                  {row.amount} {row.currency} · {t(`workshopInvoices.kind.${row.kind}`, row.kind)}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {t('workshopInvoices.issued', {
                    date: new Date(row.issued_at).toLocaleDateString(),
                  })}
                  {row.due_at
                    ? ` · ${t('workshopInvoices.due', { date: new Date(row.due_at).toLocaleDateString() })}`
                    : ''}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span
                  className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                    PAYMENT_STYLES[row.payment_status] ?? 'bg-gray-100'
                  }`}
                >
                  {t(`workshopInvoices.payment.${row.payment_status}`, row.payment_status)}
                </span>
                <button
                  type="button"
                  onClick={() => downloadPdf(row)}
                  className="btn btn-secondary inline-flex items-center gap-1.5 text-sm"
                >
                  <Download className="w-4 h-4" />
                  PDF
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
