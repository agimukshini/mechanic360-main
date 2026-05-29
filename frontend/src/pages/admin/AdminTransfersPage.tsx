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
import { adminTransfersApi } from '@/api'
import { useApiToast } from '@/hooks/useApiToast'
import { getApiErrorMessage } from '@/lib/utils'

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
      showToast('Transfer marked as disputed', 'success')
    },
    onError: (err) => showError(getApiErrorMessage(err, 'Failed to dispute transfer')),
  })

  const reverseMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) =>
      adminTransfersApi.reverse(id, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-transfers'] })
      showToast('Transfer reversed', 'success')
    },
    onError: (err) => showError(getApiErrorMessage(err, 'Failed to reverse transfer')),
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
      showToast('Billing updated', 'success')
    },
    onError: (err) => showError(getApiErrorMessage(err, 'Failed to update billing')),
  })

  const transfers = transfersQuery.data ?? []

  const toggle = (id: string) => setExpanded((s) => ({ ...s, [id]: !s[id] }))

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-workshop-charcoal">Ownership transfers</h2>
        <p className="text-workshop-charcoal/60 mt-1">
          Cross-tenant transfer ledger. Mark disputed, reverse, or update billing.
        </p>
      </div>

      <div className="card p-4 grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="sm:col-span-2 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by VIN, plate, owner, workshop…"
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="confirmed">Confirmed</option>
          <option value="cancelled">Cancelled</option>
          <option value="expired">Expired</option>
          <option value="disputed">Disputed</option>
          <option value="reversed">Reversed</option>
        </select>
        <select
          value={paymentFilter}
          onChange={(e) => setPaymentFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="">All payments</option>
          <option value="unpaid">Unpaid</option>
          <option value="processing">Processing</option>
          <option value="paid">Paid</option>
          <option value="refunded">Refunded</option>
          <option value="waived">Waived</option>
        </select>
      </div>

      {transfersQuery.isLoading && (
        <div className="card p-12 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-workshop-blue" />
        </div>
      )}

      {!transfersQuery.isLoading && transfers.length === 0 && (
        <div className="card p-8 text-sm text-gray-500 text-center">
          No transfers match the current filters.
        </div>
      )}

      {transfers.length > 0 && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-workshop-charcoal/5">
                <tr>
                  <th className="px-3 py-3 w-8"></th>
                  <th className="px-3 py-3 text-left font-medium text-workshop-charcoal/60 uppercase text-xs">
                    Initiated
                  </th>
                  <th className="px-3 py-3 text-left font-medium text-workshop-charcoal/60 uppercase text-xs">
                    Vehicle
                  </th>
                  <th className="px-3 py-3 text-left font-medium text-workshop-charcoal/60 uppercase text-xs">
                    Tenant
                  </th>
                  <th className="px-3 py-3 text-left font-medium text-workshop-charcoal/60 uppercase text-xs">
                    From → To
                  </th>
                  <th className="px-3 py-3 text-left font-medium text-workshop-charcoal/60 uppercase text-xs">
                    Fee
                  </th>
                  <th className="px-3 py-3 text-left font-medium text-workshop-charcoal/60 uppercase text-xs">
                    Status
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
                          <p>{t.to_owner?.name || <span className="italic text-gray-400">pending</span>}</p>
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
  const [disputeNotes, setDisputeNotes] = useState('')
  const [reverseNotes, setReverseNotes] = useState('')
  const [invoiceRef, setInvoiceRef] = useState(transfer.billing?.invoice_reference ?? '')
  const [paymentStatus, setPaymentStatus] = useState(transfer.billing?.payment_status ?? 'unpaid')

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-sm">
      <div className="space-y-2">
        <h4 className="font-semibold text-gray-900">Audit metadata</h4>
        <p>
          <span className="text-gray-500">Initiator IP:</span>{' '}
          <code className="text-xs">{transfer.initiated_ip || '—'}</code>
        </p>
        <p className="text-xs text-gray-500 break-all">
          UA: {transfer.initiated_user_agent || '—'}
        </p>
        {transfer.confirmed_at && (
          <>
            <p className="pt-2 border-t border-gray-200">
              <span className="text-gray-500">Confirmed at:</span>{' '}
              {new Date(transfer.confirmed_at).toLocaleString()}
            </p>
            <p>
              <span className="text-gray-500">Confirm IP:</span>{' '}
              <code className="text-xs">{transfer.confirmed_ip || '—'}</code>
            </p>
            <p className="text-xs text-gray-500 break-all">
              UA: {transfer.confirmed_user_agent || '—'}
            </p>
          </>
        )}
        {transfer.initiator_notes && (
          <p className="pt-2 border-t border-gray-200">
            <span className="text-gray-500">Initiator notes:</span>
            <br />
            <span className="whitespace-pre-wrap">{transfer.initiator_notes}</span>
          </p>
        )}
        <p>
          <span className="text-gray-500">Docs verified:</span>{' '}
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
          Mark disputed
        </h4>
        <p className="text-xs text-gray-500">
          Freezes the vehicle's ownership changes until reviewed. Notes are
          visible only to platform superadmins.
        </p>
        <textarea
          value={disputeNotes}
          onChange={(e) => setDisputeNotes(e.target.value)}
          rows={3}
          placeholder="Reason / evidence …"
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
          Mark disputed
        </button>

        <div className="pt-3 mt-3 border-t border-gray-200 space-y-2">
          <h4 className="font-semibold text-gray-900 flex items-center gap-1.5">
            <RotateCcw className="w-4 h-4 text-purple-600" />
            Reverse transfer
          </h4>
          <p className="text-xs text-gray-500">
            Appends a new ownership row restoring the previous owner. Never deletes history.
          </p>
          <textarea
            value={reverseNotes}
            onChange={(e) => setReverseNotes(e.target.value)}
            rows={3}
            placeholder="Reason / authority …"
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
            Reverse transfer
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="font-semibold text-gray-900">Billing</h4>
        {transfer.billing ? (
          <>
            <p>
              <span className="text-gray-500">Fee:</span>{' '}
              <strong>
                {transfer.billing.fee_amount} {transfer.billing.fee_currency}
              </strong>
              <span className="text-xs text-gray-400"> (immutable)</span>
            </p>
            <label className="block">
              <span className="text-xs text-gray-500">Payment status</span>
              <select
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value)}
                className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="unpaid">Unpaid</option>
                <option value="processing">Processing</option>
                <option value="paid">Paid</option>
                <option value="refunded">Refunded</option>
                <option value="waived">Waived</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-gray-500">Invoice reference</span>
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
              Update billing
            </button>
            {transfer.billing.paid_at && (
              <p className="text-xs text-gray-500">
                Paid at {new Date(transfer.billing.paid_at).toLocaleString()}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-gray-500">No billing row.</p>
        )}
      </div>
    </div>
  )
}
