import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  Building2,
  Calendar,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleX,
  Loader2,
  RotateCcw,
  Search,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { adminTransfersApi } from '@/api'
import { useApiToast } from '@/hooks/useApiToast'

interface TransferRow {
  id: string
  vehicle: {
    id: string
    license_plate: string
    vin: string
    make: string
    model: string
  } | null
  from_owner?: { name?: string } | null
  to_owner?: { name?: string } | null
  tenant_name: string
  tenant_schema: string
  initiator_username: string
  initiated_at: string
  confirmed_at: string | null
  initiated_ip: string | null
  initiated_user_agent: string
  confirmed_ip: string | null
  confirmed_user_agent: string
  status: string
  initiator_notes: string
  new_license_plate: string
  documents_verified: boolean
  billing?: {
    id: string
    fee_amount: string
    fee_currency: string
    payment_status: string
    invoice_reference: string
    paid_at: string | null
  } | null
  reversed_transfer: string | null
}

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-800 border-amber-200',
  confirmed: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  cancelled: 'bg-gray-50 text-gray-700 border-gray-200',
  expired: 'bg-gray-50 text-gray-500 border-gray-200',
  disputed: 'bg-red-50 text-red-700 border-red-200',
  reversed: 'bg-purple-50 text-purple-700 border-purple-200',
}

const PAYMENT_STYLES: Record<string, string> = {
  unpaid: 'bg-red-50 text-red-700',
  processing: 'bg-amber-50 text-amber-800',
  paid: 'bg-emerald-50 text-emerald-800',
  refunded: 'bg-blue-50 text-blue-700',
  waived: 'bg-purple-50 text-purple-700',
}

export default function AdminTransfersPage() {
  const { t: tr } = useTranslation()
  const queryClient = useQueryClient()
  const { showError, showToast } = useApiToast()
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [paymentFilter, setPaymentFilter] = useState('')

  const params = useMemo(
    () => ({
      status: statusFilter || undefined,
      search: search || undefined,
      payment_status: paymentFilter || undefined,
    }),
    [statusFilter, search, paymentFilter],
  )

  const transfersQuery = useQuery({
    queryKey: ['admin-transfers', params],
    queryFn: () =>
      adminTransfersApi.list(params).then((r) => (r.data?.results ?? r.data) as TransferRow[]),
  })

  const disputeMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) =>
      adminTransfersApi.dispute(id, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-transfers'] })
      showToast(tr('adminTransfers.toastDisputed'), 'success')
    },
    onError: (err) => showError(err, tr('adminTransfers.errDispute')),
  })

  const reverseMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) =>
      adminTransfersApi.reverse(id, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-transfers'] })
      showToast(tr('adminTransfers.toastReversed'), 'success')
    },
    onError: (err) => showError(err, tr('adminTransfers.errReverse')),
  })

  const billingMutation = useMutation({
    mutationFn: ({
      id,
      payment_status,
      invoice_reference,
    }: {
      id: string
      payment_status?: string
      invoice_reference?: string
    }) =>
      adminTransfersApi.updateBilling(id, {
        payment_status,
        invoice_reference,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-transfers'] })
      showToast(tr('adminTransfers.toastBillingUpdated'), 'success')
    },
    onError: (err) => showError(err, tr('adminTransfers.errBilling')),
  })

  const transfers = transfersQuery.data ?? []

  const toggle = (id: string) => setExpanded((s) => ({ ...s, [id]: !s[id] }))

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-workshop-charcoal">{tr('adminTransfers.title')}</h2>
        <p className="text-workshop-charcoal/60 mt-1">
          {tr('adminTransfers.subtitle')}
        </p>
      </div>

      <div className="card p-4 grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="sm:col-span-2 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tr('adminTransfers.searchPlaceholder')}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="">{tr('adminTransfers.allStatuses')}</option>
          <option value="pending">{tr('adminTransfers.statusPending')}</option>
          <option value="confirmed">{tr('adminTransfers.statusConfirmed')}</option>
          <option value="cancelled">{tr('adminTransfers.statusCancelled')}</option>
          <option value="expired">{tr('adminTransfers.statusExpired')}</option>
          <option value="disputed">{tr('adminTransfers.statusDisputed')}</option>
          <option value="reversed">{tr('adminTransfers.statusReversed')}</option>
        </select>
        <select
          value={paymentFilter}
          onChange={(e) => setPaymentFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="">{tr('adminTransfers.allPayments')}</option>
          <option value="unpaid">{tr('adminTransfers.paymentUnpaid')}</option>
          <option value="processing">{tr('adminTransfers.paymentProcessing')}</option>
          <option value="paid">{tr('adminTransfers.paymentPaid')}</option>
          <option value="refunded">{tr('adminTransfers.paymentRefunded')}</option>
          <option value="waived">{tr('adminTransfers.paymentWaived')}</option>
        </select>
      </div>

      {transfersQuery.isLoading && (
        <div className="card p-12 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-workshop-blue" />
        </div>
      )}

      {!transfersQuery.isLoading && transfers.length === 0 && (
        <div className="card p-8 text-sm text-gray-500 text-center">
          {tr('adminTransfers.noResults')}
        </div>
      )}

      {transfers.length > 0 && (
        <div className="card overflow-hidden">
          <div className="table-scroll-mobile">
            <table className="w-full text-sm">
              <thead className="bg-workshop-charcoal/5">
                <tr>
                  <th className="px-3 py-3 w-8"></th>
                  <th className="px-3 py-3 text-left font-medium text-workshop-charcoal/60 uppercase text-xs">
                    {tr('adminTransfers.tableInitiated')}
                  </th>
                  <th className="px-3 py-3 text-left font-medium text-workshop-charcoal/60 uppercase text-xs">
                    {tr('adminTransfers.tableVehicle')}
                  </th>
                  <th className="px-3 py-3 text-left font-medium text-workshop-charcoal/60 uppercase text-xs">
                    {tr('adminTransfers.tableTenant')}
                  </th>
                  <th className="px-3 py-3 text-left font-medium text-workshop-charcoal/60 uppercase text-xs">
                    {tr('adminTransfers.tableFromTo')}
                  </th>
                  <th className="px-3 py-3 text-left font-medium text-workshop-charcoal/60 uppercase text-xs">
                    {tr('adminTransfers.tableFee')}
                  </th>
                  <th className="px-3 py-3 text-left font-medium text-workshop-charcoal/60 uppercase text-xs">
                    {tr('adminTransfers.tableStatus')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-workshop-charcoal/10">
                {transfers.map((t) => {
                  const isOpen = !!expanded[t.id]
                  const statusBadge =
                    STATUS_STYLES[t.status] || 'bg-gray-50 text-gray-700 border-gray-200'
                  const paymentBadge =
                    (t.billing && PAYMENT_STYLES[t.billing.payment_status]) ||
                    'bg-gray-50 text-gray-700'
                  return (
                    <>
                      <tr key={t.id} className="hover:bg-workshop-charcoal/5">
                        <td className="px-3 py-3">
                          <button
                            type="button"
                            onClick={() => toggle(t.id)}
                            className="p-1 hover:bg-gray-100 rounded"
                          >
                            {isOpen ? (
                              <ChevronDown className="w-4 h-4 text-gray-500" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-gray-500" />
                            )}
                          </button>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 text-gray-700">
                            <Calendar className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            {new Date(t.initiated_at).toLocaleDateString(undefined, {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </div>
                          <div className="text-xs text-gray-500">
                            {new Date(t.initiated_at).toLocaleTimeString(undefined, {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <p className="font-medium text-gray-900">
                            {t.vehicle?.license_plate || '—'}
                          </p>
                          <p className="text-xs text-gray-500">
                            {t.vehicle?.make} {t.vehicle?.model}
                          </p>
                          {t.new_license_plate && (
                            <p className="text-xs text-amber-700">
                              → {t.new_license_plate}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1.5 text-gray-700">
                            <Building2 className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            {t.tenant_name || t.tenant_schema}
                          </div>
                          <p className="text-xs text-gray-500">{t.initiator_username}</p>
                        </td>
                        <td className="px-3 py-3 text-xs text-gray-700">
                          <p>{t.from_owner?.name || '—'}</p>
                          <p>↓</p>
                          <p>{t.to_owner?.name || <span className="italic text-gray-400">{tr('adminTransfers.pendingTo')}</span>}</p>
                        </td>
                        <td className="px-3 py-3">
                          {t.billing ? (
                            <>
                              <p className="font-medium text-gray-900">
                                {t.billing.fee_amount} {t.billing.fee_currency}
                              </p>
                              <span
                                className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-medium uppercase ${paymentBadge}`}
                              >
                                {t.billing.payment_status}
                              </span>
                            </>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-medium uppercase ${statusBadge}`}
                          >
                            {t.status}
                          </span>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-workshop-gray/30">
                          <td colSpan={7} className="px-6 py-4">
                            <DetailPanel
                              transfer={t}
                              onDispute={(notes) =>
                                disputeMutation.mutate({ id: t.id, notes })
                              }
                              onReverse={(notes) =>
                                reverseMutation.mutate({ id: t.id, notes })
                              }
                              onBilling={(payload) =>
                                billingMutation.mutate({ id: t.id, ...payload })
                              }
                              busy={
                                disputeMutation.isPending ||
                                reverseMutation.isPending ||
                                billingMutation.isPending
                              }
                            />
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function DetailPanel({
  transfer,
  onDispute,
  onReverse,
  onBilling,
  busy,
}: {
  transfer: TransferRow
  onDispute: (notes: string) => void
  onReverse: (notes: string) => void
  onBilling: (payload: { payment_status?: string; invoice_reference?: string }) => void
  busy: boolean
}) {
  const { t: tr } = useTranslation()
  const [disputeNotes, setDisputeNotes] = useState('')
  const [reverseNotes, setReverseNotes] = useState('')
  const [invoiceRef, setInvoiceRef] = useState(transfer.billing?.invoice_reference ?? '')
  const [paymentStatus, setPaymentStatus] = useState(transfer.billing?.payment_status ?? 'unpaid')

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-sm">
      <div className="space-y-2">
        <h4 className="font-semibold text-gray-900">{tr('adminTransfers.auditMetadata')}</h4>
        <p>
          <span className="text-gray-500">{tr('adminTransfers.initiatorIp')}</span>{' '}
          <code className="text-xs">{transfer.initiated_ip || '—'}</code>
        </p>
        <p className="text-xs text-gray-500 break-all">
          {tr('adminTransfers.uaPrefix')} {transfer.initiated_user_agent || '—'}
        </p>
        {transfer.confirmed_at && (
          <>
            <p className="pt-2 border-t border-gray-200">
              <span className="text-gray-500">{tr('adminTransfers.confirmedAt')}</span>{' '}
              {new Date(transfer.confirmed_at).toLocaleString()}
            </p>
            <p>
              <span className="text-gray-500">{tr('adminTransfers.confirmIp')}</span>{' '}
              <code className="text-xs">{transfer.confirmed_ip || '—'}</code>
            </p>
            <p className="text-xs text-gray-500 break-all">
              {tr('adminTransfers.uaPrefix')} {transfer.confirmed_user_agent || '—'}
            </p>
          </>
        )}
        {transfer.initiator_notes && (
          <p className="pt-2 border-t border-gray-200">
            <span className="text-gray-500">{tr('adminTransfers.initiatorNotes')}</span>
            <br />
            <span className="whitespace-pre-wrap">{transfer.initiator_notes}</span>
          </p>
        )}
        <p>
          <span className="text-gray-500">{tr('adminTransfers.docsVerified')}</span>{' '}
          {transfer.documents_verified ? (
            <CircleCheck className="inline w-4 h-4 text-emerald-600" />
          ) : (
            <CircleX className="inline w-4 h-4 text-red-600" />
          )}
        </p>
      </div>

      <div className="space-y-2">
        <h4 className="font-semibold text-gray-900 flex items-center gap-1.5">
          <AlertTriangle className="w-4 h-4 text-red-600" />
          {tr('adminTransfers.markDisputed')}
        </h4>
        <p className="text-xs text-gray-500">
          {tr('adminTransfers.disputedHint')}
        </p>
        <textarea
          value={disputeNotes}
          onChange={(e) => setDisputeNotes(e.target.value)}
          rows={3}
          placeholder={tr('adminTransfers.disputedPlaceholder')}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
        <button
          type="button"
          disabled={
            busy ||
            disputeNotes.trim().length < 3 ||
            transfer.status === 'disputed' ||
            transfer.status === 'reversed'
          }
          onClick={() => onDispute(disputeNotes.trim())}
          className="w-full py-2 bg-red-600 text-white rounded-lg disabled:opacity-50 text-sm"
        >
          {tr('adminTransfers.markDisputed')}
        </button>

        <div className="pt-3 mt-3 border-t border-gray-200 space-y-2">
          <h4 className="font-semibold text-gray-900 flex items-center gap-1.5">
            <RotateCcw className="w-4 h-4 text-purple-600" />
            {tr('adminTransfers.reverseTransfer')}
          </h4>
          <p className="text-xs text-gray-500">
            {tr('adminTransfers.reverseHint')}
          </p>
          <textarea
            value={reverseNotes}
            onChange={(e) => setReverseNotes(e.target.value)}
            rows={3}
            placeholder={tr('adminTransfers.reversePlaceholder')}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <button
            type="button"
            disabled={
              busy ||
              reverseNotes.trim().length < 3 ||
              transfer.status !== 'confirmed'
            }
            onClick={() => onReverse(reverseNotes.trim())}
            className="w-full py-2 bg-purple-600 text-white rounded-lg disabled:opacity-50 text-sm"
          >
            {tr('adminTransfers.reverseTransfer')}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="font-semibold text-gray-900">{tr('adminTransfers.billing')}</h4>
        {transfer.billing ? (
          <>
            <p>
              <span className="text-gray-500">{tr('adminTransfers.feeLabel')}</span>{' '}
              <strong>
                {transfer.billing.fee_amount} {transfer.billing.fee_currency}
              </strong>
              <span className="text-xs text-gray-400"> {tr('adminTransfers.immutable')}</span>
            </p>
            <label className="block">
              <span className="text-xs text-gray-500">{tr('adminTransfers.paymentStatus')}</span>
              <select
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value)}
                className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="unpaid">{tr('adminTransfers.paymentUnpaid')}</option>
                <option value="processing">{tr('adminTransfers.paymentProcessing')}</option>
                <option value="paid">{tr('adminTransfers.paymentPaid')}</option>
                <option value="refunded">{tr('adminTransfers.paymentRefunded')}</option>
                <option value="waived">{tr('adminTransfers.paymentWaived')}</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-gray-500">{tr('adminTransfers.invoiceReference')}</span>
              <input
                value={invoiceRef}
                onChange={(e) => setInvoiceRef(e.target.value)}
                className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                onBilling({
                  payment_status: paymentStatus,
                  invoice_reference: invoiceRef,
                })
              }
              className="w-full py-2 bg-workshop-blue text-white rounded-lg disabled:opacity-50 text-sm"
            >
              {tr('adminTransfers.updateBilling')}
            </button>
            {transfer.billing.paid_at && (
              <p className="text-xs text-gray-500">
                {tr('adminTransfers.paidAt', { date: new Date(transfer.billing.paid_at).toLocaleString() })}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-gray-500">{tr('adminTransfers.noBillingRow')}</p>
        )}
      </div>
    </div>
  )
}
