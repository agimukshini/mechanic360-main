import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { pmOrdersApi, type PMOrder } from '@/api'
import { Calendar, Car, Gauge, Loader2, Wrench } from 'lucide-react'

export default function MaintenanceOrdersList() {
  const { t } = useTranslation()

  const { data, isLoading } = useQuery({
    queryKey: ['pm-orders'],
    queryFn: () => pmOrdersApi.list(),
  })

  const orders: PMOrder[] = data?.data?.results ?? []
  const offeredKinds: string[] = data?.data?.offered_pm_kinds ?? []
  const emptyHint = data?.data?.detail

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-workshop-charcoal flex items-center gap-2">
          <Wrench className="w-7 h-7 text-accent" />
          {t('pmOrders.title')}
        </h1>
        <p className="text-workshop-charcoal/60 mt-1">{t('pmOrders.subtitle')}</p>
      </div>

      {offeredKinds.length > 0 && (
        <div className="card p-4 text-sm text-workshop-charcoal/70">
          {t('pmOrders.offeredKinds', { kinds: offeredKinds.map((k) => t(`pmOrders.kind.${k}`, { defaultValue: k })).join(', ') })}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
        </div>
      ) : orders.length === 0 ? (
        <div className="card p-12 text-center text-workshop-charcoal/60">
          <Car className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p>{emptyHint || t('pmOrders.empty')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <div key={order.id} className="card p-5 flex flex-col lg:flex-row lg:items-center gap-4">
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-semibold text-workshop-charcoal">{order.title}</h2>
                  <span className="text-xs bg-accent/10 text-accent px-2 py-0.5 rounded-full">
                    {t(`pmOrders.kind.${order.pm_kind}`, { defaultValue: order.pm_kind_display })}
                  </span>
                </div>
                <p className="text-sm font-medium">{order.vehicle_label}</p>
                <div className="flex flex-wrap gap-4 text-sm text-workshop-charcoal/70">
                  {order.due_date && (
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      {t('pmOrders.dueDate')}: {new Date(order.due_date).toLocaleDateString()}
                    </span>
                  )}
                  {order.due_odometer_km != null && (
                    <span className="inline-flex items-center gap-1">
                      <Gauge className="w-4 h-4" />
                      {t('pmOrders.dueKm', { km: order.due_odometer_km.toLocaleString() })}
                    </span>
                  )}
                </div>
                {order.notes && <p className="text-sm text-workshop-charcoal/60">{order.notes}</p>}
                <p className="text-xs text-workshop-charcoal/50">{t('pmOrders.contactOwnerHint')}</p>
                <p className="text-xs text-workshop-charcoal/50">{t('pmOrders.autoCompleteHint')}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-workshop-charcoal/50">
        {t('pmOrders.catalogFilterHint')}{' '}
        <Link to="/services" className="text-accent hover:underline">{t('nav.services')}</Link>
      </p>
    </div>
  )
}
