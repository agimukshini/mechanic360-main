import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CalendarClock, CheckCircle2, Loader2, Plus } from 'lucide-react'
import { pmOrdersApi, visitsApi, type PMOrder } from '@/api'
import { useApiToast } from '@/hooks/useApiToast'

type CatalogItem = {
  id: string
  name: string
  pm_kind?: string
  is_pm_closure?: boolean
}

type ServiceLine = {
  id: string
  catalog_item?: string | null
  description?: string
}

interface VisitPmPanelProps {
  visitId: string
  globalVehicleId?: string | null
  serviceLines: ServiceLine[]
  isEditable: boolean
}

export default function VisitPmPanel({
  visitId,
  globalVehicleId,
  serviceLines,
  isEditable,
}: VisitPmPanelProps) {
  const { t } = useTranslation()
  const { showError } = useApiToast()
  const queryClient = useQueryClient()

  const { data: pmData, isLoading: pmLoading } = useQuery({
    queryKey: ['pm-orders', { global_vehicle: globalVehicleId, status: 'open' }],
    queryFn: () =>
      pmOrdersApi.list({
        global_vehicle: globalVehicleId!,
        status: 'open',
      }),
    enabled: !!globalVehicleId && isEditable,
  })

  const { data: closureCatalogData } = useQuery({
    queryKey: ['service-catalog', { is_pm_closure: true }],
    queryFn: () => visitsApi.catalog.list({ is_pm_closure: 'true' }),
    enabled: isEditable,
  })

  const openOrders: PMOrder[] = pmData?.data?.results ?? []
  const closureItems: CatalogItem[] =
    closureCatalogData?.data?.results ?? closureCatalogData?.data ?? []

  const closureByKind = useMemo(() => {
    const map = new Map<string, CatalogItem>()
    for (const item of closureItems) {
      if (item.pm_kind) map.set(item.pm_kind, item)
    }
    return map
  }, [closureItems])

  const closureCatalogIds = useMemo(
    () => new Set(closureItems.map((item) => item.id)),
    [closureItems],
  )

  const closedKinds = useMemo(() => {
    const kinds = new Set<string>()
    for (const line of serviceLines) {
      if (!line.catalog_item || !closureCatalogIds.has(line.catalog_item)) continue
      const item = closureItems.find((row) => row.id === line.catalog_item)
      if (item?.pm_kind) kinds.add(item.pm_kind)
    }
    return kinds
  }, [serviceLines, closureCatalogIds, closureItems])

  const addClosureMutation = useMutation({
    mutationFn: async (pmKind: string) => {
      const item = closureByKind.get(pmKind)
      if (!item) {
        throw new Error(t('visits.pmClosureMissingCatalog'))
      }
      return visitsApi.serviceLines.create({
        visit_id: visitId,
        catalog_item: item.id,
        description: item.name,
        quantity: 1,
        unit_price: 0,
        total_price: 0,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-lines', { visit: visitId }] })
    },
    onError: (error: unknown) => showError(error, t('visits.pmClosureAddFailed')),
  })

  if (!isEditable || !globalVehicleId) return null
  if (pmLoading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-gray-100 bg-white px-4 py-3 text-sm text-secondary shadow-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        {t('visits.pmPanelLoading')}
      </div>
    )
  }
  if (openOrders.length === 0) return null

  return (
    <div className="rounded-xl border border-accent/20 bg-accent/5 px-4 py-4 shadow-sm space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-accent/15 flex items-center justify-center shrink-0">
          <CalendarClock className="w-5 h-5 text-accent" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900">{t('visits.pmPanelTitle')}</p>
          <p className="text-sm text-secondary mt-0.5">{t('visits.pmPanelHint')}</p>
        </div>
      </div>

      <ul className="space-y-2">
        {openOrders.map((order) => {
          const isClosedOnVisit = closedKinds.has(order.pm_kind)
          const closureItem = closureByKind.get(order.pm_kind)
          return (
            <li
              key={order.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-white/80 bg-white px-3 py-3"
            >
              <div className="min-w-0">
                <p className="font-medium text-gray-900">
                  {t(`pmOrders.kind.${order.pm_kind}`, { defaultValue: order.pm_kind_display })}
                </p>
                <p className="text-xs text-secondary mt-0.5">
                  {order.due_date && (
                    <span>
                      {t('pmOrders.dueDate')}: {new Date(order.due_date).toLocaleDateString()}
                    </span>
                  )}
                  {order.due_date && order.due_odometer_km != null && ' · '}
                  {order.due_odometer_km != null && (
                    <span>{t('pmOrders.dueKm', { km: order.due_odometer_km.toLocaleString() })}</span>
                  )}
                </p>
                {closureItem && (
                  <p className="text-xs text-secondary mt-1">
                    {t('visits.pmClosureCatalogLine')}: {closureItem.name}
                  </p>
                )}
              </div>
              {isClosedOnVisit ? (
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-700 shrink-0">
                  <CheckCircle2 className="w-4 h-4" />
                  {t('visits.pmClosureAdded')}
                </span>
              ) : isEditable && closureItem ? (
                <button
                  type="button"
                  onClick={() => addClosureMutation.mutate(order.pm_kind)}
                  disabled={addClosureMutation.isPending}
                  className="btn btn-primary btn-sm shrink-0"
                >
                  {addClosureMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Plus className="w-4 h-4 mr-1" />
                      {t('visits.pmAddClosure')}
                    </>
                  )}
                </button>
              ) : (
                <span className="text-xs text-amber-700 shrink-0">{t('visits.pmClosureMissingCatalog')}</span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
