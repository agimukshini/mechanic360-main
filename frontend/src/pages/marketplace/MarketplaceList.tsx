import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { marketplaceApi, type SparePart } from '@/api'
import { Store, Search, Filter, Settings } from 'lucide-react'
import { useEffect, useState } from 'react'
import { parsePaginatedResponse } from '@/lib/utils'
import { useSelector } from 'react-redux'
import type { RootState } from '@/store'
import { canManageWorkshopData, normalizeRole } from '@/lib/roles'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import {
  PartsGridView,
  PartsListView,
  PartsTableView,
  MarketplacePagination,
  ViewModeToggle,
  readStoredMarketplaceView,
  MARKETPLACE_VIEW_STORAGE_KEY,
  type ViewMode,
} from '@/components/marketplace/MarketplaceListViews'

const DEFAULT_PAGE_SIZE = 12

export default function MarketplaceList() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const user = useSelector((state: RootState) => state.auth.user)
  const isAdmin = canManageWorkshopData(normalizeRole(user?.role))
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [viewMode, setViewMode] = useState<ViewMode>(readStoredMarketplaceView)

  useEffect(() => {
    setPage(1)
  }, [searchTerm, selectedCategory, pageSize])

  useEffect(() => {
    try {
      localStorage.setItem(MARKETPLACE_VIEW_STORAGE_KEY, viewMode)
    } catch {
      /* ignore */
    }
  }, [viewMode])

  const { data: categoriesData } = useQuery({
    queryKey: ['marketplace-categories'],
    queryFn: () => marketplaceApi.listCategories(),
  })

  const categories = parsePaginatedResponse<{ slug: string; name: string }>(categoriesData).results

  const { data: partsData, isLoading, isFetching } = useQuery({
    queryKey: ['marketplace-parts', searchTerm, selectedCategory, page, pageSize],
    queryFn: () => {
      const params: Record<string, string | number> = {
        page,
        page_size: pageSize,
      }
      if (searchTerm) params.search = searchTerm
      if (selectedCategory) params.category = selectedCategory
      return marketplaceApi.listParts(params)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => marketplaceApi.deletePart(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketplace-parts'] })
      queryClient.invalidateQueries({ queryKey: ['marketplace-my-parts'] })
      setDeleteId(null)
    },
  })

  const { results: parts, count: totalCount } = parsePaginatedResponse<SparePart>(partsData)

  const viewProps = {
    parts,
    canManage: isAdmin,
    onDelete: setDeleteId,
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-workshop-charcoal flex items-center gap-2">
            <Store className="w-7 h-7 text-accent" />
            {t('marketplaceList.title')}
          </h1>
          <p className="text-workshop-charcoal/60 mt-1">{t('marketplaceCatalog.subtitle')}</p>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <Link to="/marketplace/seller/new" className="btn btn-outline">
              {t('marketplaceSeller.addPart')}
            </Link>
            <Link to="/marketplace/seller" className="btn btn-primary">
              <Settings className="w-4 h-4 mr-2" />
              {t('marketplaceCatalog.manageListings')}
            </Link>
          </div>
        )}
      </div>

      <div className="card p-4 space-y-4">
        <div className="flex gap-4 flex-wrap">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-workshop-charcoal/40" />
            <input
              type="text"
              placeholder={t('marketplaceCatalog.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input pl-10"
            />
          </div>
          <div className="relative min-w-[180px]">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-workshop-charcoal/40" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="input pl-10 w-full"
            >
              <option value="">{t('marketplaceList.allCategories')}</option>
              {categories.map((cat) => (
                <option key={cat.slug} value={cat.slug}>{cat.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-workshop-charcoal/10">
          <p className="text-sm text-workshop-charcoal/60">
            {t('marketplaceCatalog.viewMode')}
          </p>
          <ViewModeToggle viewMode={viewMode} onChange={setViewMode} />
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-workshop-charcoal/40">{t('marketplaceList.loading')}</div>
      ) : parts.length === 0 ? (
        <div className="card p-12 text-center">
          <Store className="w-12 h-12 text-workshop-charcoal/20 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-workshop-charcoal mb-2">{t('marketplaceCatalog.noParts')}</h3>
          <p className="text-workshop-charcoal/60 mb-4">{t('marketplaceCatalog.noPartsHint')}</p>
          {isAdmin && (
            <Link to="/marketplace/seller" className="btn btn-primary">
              {t('marketplaceCatalog.manageListings')}
            </Link>
          )}
        </div>
      ) : (
        <div className={isFetching ? 'opacity-60 pointer-events-none transition-opacity' : ''}>
          {viewMode === 'grid' && <PartsGridView {...viewProps} />}
          {viewMode === 'list' && <PartsListView {...viewProps} />}
          {viewMode === 'table' && <PartsTableView {...viewProps} />}
        </div>
      )}

      {totalCount > 0 && (
        <MarketplacePagination
          page={page}
          pageSize={pageSize}
          totalCount={totalCount}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size)
            setPage(1)
          }}
        />
      )}

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
