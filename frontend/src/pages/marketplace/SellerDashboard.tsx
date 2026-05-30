import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { marketplaceApi, type MarketplaceSeller, type SparePart } from '@/api'
import { ArrowLeft, Loader2, Plus, Trash2, AlertCircle, CheckCircle2, Pencil } from 'lucide-react'
import { formatEuro } from '@/lib/money'
import { unwrapList } from '@/lib/utils'
import { useState } from 'react'
import ConfirmDialog from '@/components/ui/ConfirmDialog'

export default function SellerDashboard() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const { data: sellerData, isLoading: sellerLoading, error: sellerError } = useQuery({
    queryKey: ['marketplace-seller-me'],
    queryFn: () => marketplaceApi.getSellerMe(),
    retry: false,
  })

  const createSeller = useMutation({
    mutationFn: () => marketplaceApi.createSellerMe(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['marketplace-seller-me'] }),
  })

  const seller = sellerData?.data as MarketplaceSeller | undefined
  const needsRegistration = sellerError && (sellerError as { response?: { status?: number } }).response?.status === 404

  const { data: partsData, isLoading: partsLoading } = useQuery({
    queryKey: ['marketplace-my-parts'],
    queryFn: () => marketplaceApi.listParts({ mine: '1', page_size: 100 }),
    enabled: Boolean(seller),
  })

  const parts = unwrapList<SparePart>(partsData)

  const deleteMutation = useMutation({
    mutationFn: (id: string) => marketplaceApi.deletePart(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketplace-my-parts'] })
      queryClient.invalidateQueries({ queryKey: ['marketplace-parts'] })
      setDeleteId(null)
    },
  })

  if (sellerLoading) {
    return (
      <div className="card p-12 flex justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    )
  }

  if (needsRegistration) {
    return (
      <div className="max-w-lg mx-auto card p-8 text-center space-y-4">
        <StoreIcon />
        <h1 className="text-xl font-bold">{t('marketplaceSeller.registerTitle')}</h1>
        <p className="text-secondary text-sm">{t('marketplaceSeller.registerHint')}</p>
        <button
          type="button"
          onClick={() => createSeller.mutate()}
          disabled={createSeller.isPending}
          className="btn btn-primary"
        >
          {createSeller.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t('marketplaceSeller.registerCta')}
        </button>
      </div>
    )
  }

  if (!seller) {
    return <div className="card p-8 text-red-700">{t('marketplaceSeller.loadFailed')}</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <Link to="/marketplace" className="p-2 text-workshop-charcoal/40 hover:text-workshop-charcoal">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-workshop-charcoal">{t('marketplaceSeller.title')}</h1>
            <p className="text-workshop-charcoal/60 text-sm">{seller.business_name}</p>
          </div>
        </div>
        <Link to="/marketplace/seller/new" className="btn btn-primary">
          <Plus className="w-4 h-4 mr-2" />
          {t('marketplaceSeller.addPart')}
        </Link>
      </div>

      <div
        className={`card p-4 flex items-start gap-3 ${
          seller.is_approved ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'
        }`}
      >
        {seller.is_approved ? (
          <CheckCircle2 className="w-5 h-5 text-green-700 shrink-0 mt-0.5" />
        ) : (
          <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
        )}
        <div>
          <p className="font-medium text-sm">
            {seller.is_approved
              ? t('marketplaceSeller.approved')
              : t('marketplaceSeller.pendingApproval')}
          </p>
          {!seller.is_approved && (
            <p className="text-xs text-workshop-charcoal/70 mt-1">{t('marketplaceSeller.pendingHint')}</p>
          )}
        </div>
      </div>

      <div className="card overflow-hidden">
        {partsLoading ? (
          <div className="p-12 flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-accent" />
          </div>
        ) : parts.length === 0 ? (
          <p className="p-8 text-center text-secondary">{t('marketplaceSeller.noParts')}</p>
        ) : (
          <div className="table-scroll-mobile">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-3">{t('marketplaceSeller.colTitle')}</th>
                  <th className="text-left px-4 py-3">{t('marketplaceSeller.colType')}</th>
                  <th className="text-left px-4 py-3">{t('marketplaceSeller.colIdentifiers')}</th>
                  <th className="text-left px-4 py-3">{t('marketplaceSeller.colCategory')}</th>
                  <th className="text-left px-4 py-3">{t('marketplaceSeller.colPrice')}</th>
                  <th className="text-left px-4 py-3">{t('marketplaceSeller.colQty')}</th>
                  <th className="text-left px-4 py-3">{t('marketplaceSeller.colStatus')}</th>
                  <th className="text-right px-4 py-3">{t('marketplaceSeller.colActions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {parts.map((part) => (
                  <tr key={part.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{part.title}</td>
                    <td className="px-4 py-3 text-xs">
                      {part.listing_type === 'identified'
                        ? t('marketplaceSeller.typeIdentifiedShort')
                        : t('marketplaceSeller.typeGenericShort')}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-workshop-charcoal/70">
                      {part.listing_type === 'identified'
                        ? [part.oem_number, part.part_number].filter(Boolean).join(' · ') || '—'
                        : '—'}
                    </td>
                    <td className="px-4 py-3">{part.category_name}</td>
                    <td className="px-4 py-3">{formatEuro(Number(part.price))}</td>
                    <td className="px-4 py-3">{part.quantity}</td>
                    <td className="px-4 py-3">
                      {part.is_active === false ? (
                        <span className="text-red-600">{t('marketplaceSeller.inactive')}</span>
                      ) : (
                        <span className="text-green-700">{t('marketplaceSeller.active')}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right space-x-1">
                      <Link
                        to={`/marketplace/seller/${part.id}/edit`}
                        className="btn btn-outline btn-sm inline-flex"
                      >
                        <Pencil className="w-4 h-4" />
                      </Link>
                      <button
                        type="button"
                        onClick={() => setDeleteId(part.id)}
                        className="btn btn-outline btn-sm text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(deleteId)}
        title={t('marketplaceSeller.deleteTitle')}
        message={t('marketplaceSeller.deleteBody')}
        confirmLabel={t('marketplaceList.delete')}
        variant="danger"
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        onCancel={() => setDeleteId(null)}
        loading={deleteMutation.isPending}
      />
    </div>
  )
}

function StoreIcon() {
  return (
    <div className="w-14 h-14 rounded-xl bg-accent/10 flex items-center justify-center mx-auto">
      <Plus className="w-7 h-7 text-accent" />
    </div>
  )
}
