import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  MapPin, Phone, Mail, MessageCircle, Tag, Pencil, Trash2, ChevronLeft, ChevronRight,
  LayoutGrid, List, Table2,
} from 'lucide-react'
import type { SparePart } from '@/api'
import { formatEuro } from '@/lib/money'

export type ViewMode = 'grid' | 'list' | 'table'

export function ViewModeToggle({
  viewMode,
  onChange,
}: {
  viewMode: ViewMode
  onChange: (mode: ViewMode) => void
}) {
  const { t } = useTranslation()
  const modes: { id: ViewMode; icon: typeof LayoutGrid; label: string }[] = [
    { id: 'grid', icon: LayoutGrid, label: t('marketplaceCatalog.viewModeGrid') },
    { id: 'list', icon: List, label: t('marketplaceCatalog.viewModeList') },
    { id: 'table', icon: Table2, label: t('marketplaceCatalog.viewModeTable') },
  ]

  return (
    <div
      className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 shadow-sm"
      role="group"
      aria-label={t('marketplaceCatalog.viewMode')}
    >
      {modes.map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          type="button"
          title={label}
          aria-label={label}
          aria-pressed={viewMode === id}
          onClick={() => onChange(id)}
          className={`p-2 rounded-md transition-colors ${
            viewMode === id ? 'bg-accent text-white' : 'text-gray-500 hover:bg-gray-50 hover:text-primary'
          }`}
        >
          <Icon className="w-4 h-4" />
        </button>
      ))}
    </div>
  )
}

type PartViewProps = {
  parts: SparePart[]
  canManage: boolean
  onDelete: (id: string) => void
}

function OwnBadge() {
  const { t } = useTranslation()
  return (
    <span className="text-[10px] font-semibold text-accent bg-accent/10 px-2 py-0.5 rounded-full whitespace-nowrap">
      {t('marketplaceCatalog.yourListing')}
    </span>
  )
}

function SponsoredBadge() {
  const { t } = useTranslation()
  return (
    <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full whitespace-nowrap">
      {t('marketplaceCatalog.sponsored')}
    </span>
  )
}

function PartMeta({ part }: { part: SparePart }) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-2 flex-wrap text-sm text-workshop-charcoal/70">
      <Tag className="w-3.5 h-3.5 text-workshop-charcoal/40 shrink-0" />
      <span>{part.category_name}</span>
      <span className="text-workshop-charcoal/40 capitalize">· {part.condition}</span>
      {part.listing_type === 'generic' && (
        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
          {t('marketplaceSeller.typeGenericShort')}
        </span>
      )}
    </div>
  )
}

function PartIdentifiers({ part }: { part: SparePart }) {
  const { t } = useTranslation()
  if (part.listing_type !== 'identified') return null
  if (!part.oem_number && !part.part_number && !part.brand) return null
  return (
    <div className="text-xs font-mono text-workshop-charcoal/60 space-y-0.5">
      {part.oem_number && <p>OEM: {part.oem_number}</p>}
      {part.part_number && <p>{t('marketplaceSeller.partNumber')}: {part.part_number}</p>}
      {part.brand && <p>{t('marketplaceSeller.brand')}: {part.brand}</p>}
    </div>
  )
}

function OwnerActions({
  part,
  canManage,
  onDelete,
}: {
  part: SparePart
  canManage: boolean
  onDelete: (id: string) => void
}) {
  const { t } = useTranslation()
  if (!canManage || !part.is_own) return null
  return (
    <div className="flex flex-wrap gap-2">
      <Link to={`/marketplace/seller/${part.id}/edit`} className="btn btn-primary btn-sm">
        <Pencil className="w-3 h-3 mr-1" />
        {t('marketplaceSeller.editPart')}
      </Link>
      <button
        type="button"
        onClick={() => onDelete(part.id)}
        className="btn btn-outline btn-sm text-red-600"
      >
        <Trash2 className="w-3 h-3 mr-1" />
        {t('marketplaceList.delete')}
      </button>
    </div>
  )
}

function ContactActions({ part }: { part: SparePart }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap gap-2">
      {part.contact_phone && (
        <a href={`tel:${part.contact_phone}`} className="btn btn-outline btn-sm">
          <Phone className="w-3 h-3 mr-1" />
          {t('marketplaceCatalog.call')}
        </a>
      )}
      {part.contact_whatsapp && (
        <a
          href={`https://wa.me/${part.contact_whatsapp.replace(/\D/g, '')}`}
          target="_blank"
          rel="noreferrer"
          className="btn btn-outline btn-sm"
        >
          <MessageCircle className="w-3 h-3 mr-1" />
          WhatsApp
        </a>
      )}
      {part.contact_email && (
        <a href={`mailto:${part.contact_email}`} className="btn btn-outline btn-sm">
          <Mail className="w-3 h-3 mr-1" />
          {t('marketplaceCatalog.email')}
        </a>
      )}
    </div>
  )
}

export function PartsGridView({ parts, canManage, onDelete }: PartViewProps) {
  const { t } = useTranslation()

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {parts.map((part) => {
        const showOwnerActions = canManage && part.is_own
        return (
          <div
            key={part.id}
            className={`card p-5 hover:shadow-md transition-shadow ${showOwnerActions ? 'ring-1 ring-accent/20' : ''}`}
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <h3 className="font-semibold text-workshop-charcoal">{part.title}</h3>
              <div className="flex flex-col items-end gap-1 shrink-0">
                {showOwnerActions && <OwnBadge />}
                {part.is_sponsored && <SponsoredBadge />}
              </div>
            </div>
            <p className="text-sm text-workshop-charcoal/60 mb-3 line-clamp-2">
              {part.description || t('marketplaceList.noDescription')}
            </p>
            <div className="mb-3">
              <PartMeta part={part} />
            </div>
            <div className="mb-3">
              <PartIdentifiers part={part} />
            </div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xl font-bold text-accent">{formatEuro(Number(part.price))}</span>
              <span className="text-sm text-workshop-charcoal/60">
                {t('marketplaceCatalog.qtyLabel', { count: part.quantity })}
              </span>
            </div>
            <div className="border-t border-workshop-charcoal/10 pt-4 space-y-2">
              <div className="flex items-center gap-2 text-sm text-workshop-charcoal/70">
                <MapPin className="w-4 h-4" />
                <span>{part.seller_name}{part.seller_city ? ` · ${part.seller_city}` : ''}</span>
              </div>
              <OwnerActions part={part} canManage={canManage} onDelete={onDelete} />
              <ContactActions part={part} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function PartsListView({ parts, canManage, onDelete }: PartViewProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-3">
      {parts.map((part) => {
        const showOwnerActions = canManage && part.is_own
        return (
          <div
            key={part.id}
            className={`card p-4 flex flex-col lg:flex-row lg:items-center gap-4 ${showOwnerActions ? 'ring-1 ring-accent/20' : ''}`}
          >
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-start gap-2 flex-wrap">
                <h3 className="font-semibold text-workshop-charcoal">{part.title}</h3>
                {showOwnerActions && <OwnBadge />}
                {part.is_sponsored && <SponsoredBadge />}
              </div>
              <p className="text-sm text-workshop-charcoal/60 line-clamp-1">
                {part.description || t('marketplaceList.noDescription')}
              </p>
              <PartMeta part={part} />
              <PartIdentifiers part={part} />
              <div className="flex items-center gap-2 text-sm text-workshop-charcoal/70">
                <MapPin className="w-4 h-4 shrink-0" />
                <span className="truncate">{part.seller_name}{part.seller_city ? ` · ${part.seller_city}` : ''}</span>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row lg:flex-col items-start lg:items-end gap-3 shrink-0">
              <div className="text-right">
                <p className="text-xl font-bold text-accent">{formatEuro(Number(part.price))}</p>
                <p className="text-sm text-workshop-charcoal/60">
                  {t('marketplaceCatalog.qtyLabel', { count: part.quantity })}
                </p>
              </div>
              <OwnerActions part={part} canManage={canManage} onDelete={onDelete} />
              <ContactActions part={part} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function PartsTableView({ parts, canManage, onDelete }: PartViewProps) {
  const { t } = useTranslation()

  return (
    <div className="card overflow-hidden">
      <div className="table-scroll-mobile">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3">{t('marketplaceSeller.colTitle')}</th>
              <th className="text-left px-4 py-3">{t('marketplaceSeller.colCategory')}</th>
              <th className="text-left px-4 py-3">{t('marketplaceList.tableSeller')}</th>
              <th className="text-left px-4 py-3">{t('marketplaceSeller.colPrice')}</th>
              <th className="text-left px-4 py-3">{t('marketplaceSeller.colQty')}</th>
              <th className="text-right px-4 py-3">{t('marketplaceSeller.colActions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {parts.map((part) => (
              <tr key={part.id} className={`hover:bg-gray-50 ${part.is_own ? 'bg-accent/5' : ''}`}>
                <td className="px-4 py-3">
                  <div className="font-medium">{part.title}</div>
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {part.is_own && <OwnBadge />}
                    {part.is_sponsored && <SponsoredBadge />}
                  </div>
                  {part.oem_number && (
                    <p className="text-xs font-mono text-workshop-charcoal/50 mt-1">OEM: {part.oem_number}</p>
                  )}
                </td>
                <td className="px-4 py-3">{part.category_name}</td>
                <td className="px-4 py-3">
                  {part.seller_name}
                  {part.seller_city ? <span className="text-workshop-charcoal/50"> · {part.seller_city}</span> : null}
                </td>
                <td className="px-4 py-3 font-medium">{formatEuro(Number(part.price))}</td>
                <td className="px-4 py-3">{part.quantity}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap justify-end gap-1">
                    {canManage && part.is_own && (
                      <>
                        <Link
                          to={`/marketplace/seller/${part.id}/edit`}
                          className="btn btn-outline btn-sm"
                          title={t('marketplaceSeller.editPart')}
                        >
                          <Pencil className="w-4 h-4" />
                        </Link>
                        <button
                          type="button"
                          onClick={() => onDelete(part.id)}
                          className="btn btn-outline btn-sm text-red-600"
                          title={t('marketplaceList.delete')}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                    {part.contact_phone && (
                      <a href={`tel:${part.contact_phone}`} className="btn btn-outline btn-sm" title={t('marketplaceCatalog.call')}>
                        <Phone className="w-4 h-4" />
                      </a>
                    )}
                    {part.contact_whatsapp && (
                      <a
                        href={`https://wa.me/${part.contact_whatsapp.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-outline btn-sm"
                        title="WhatsApp"
                      >
                        <MessageCircle className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

type PaginationProps = {
  page: number
  pageSize: number
  totalCount: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
}

export function MarketplacePagination({
  page,
  pageSize,
  totalCount,
  onPageChange,
  onPageSizeChange,
}: PaginationProps) {
  const { t } = useTranslation()
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const from = totalCount === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, totalCount)

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 card p-4">
      <p className="text-sm text-workshop-charcoal/60">
        {t('marketplaceCatalog.paginationShowing', { from, to, total: totalCount })}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-workshop-charcoal/70">
          {t('marketplaceCatalog.pageSize')}
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="input py-1 px-2 w-auto"
          >
            {[12, 24, 48].map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="btn btn-outline btn-sm"
            aria-label={t('marketplaceCatalog.pagePrev')}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm px-2 min-w-[5rem] text-center">
            {t('marketplaceCatalog.pageOf', { page, total: totalPages })}
          </span>
          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="btn btn-outline btn-sm"
            aria-label={t('marketplaceCatalog.pageNext')}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

export const MARKETPLACE_VIEW_STORAGE_KEY = 'marketplace_view_mode'

export function readStoredMarketplaceView(): ViewMode {
  try {
    const raw = localStorage.getItem(MARKETPLACE_VIEW_STORAGE_KEY)
    if (raw === 'grid' || raw === 'list' || raw === 'table') return raw
  } catch {
    /* ignore */
  }
  return 'grid'
}
