import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { vehiclesApi, visitsApi, api } from '@/api'
import QRScanner from '@/components/QRScanner'
import VisitStatusBadge from '@/components/ui/VisitStatusBadge'
import { useApiToast } from '@/hooks/useApiToast'
import { canViewAnalytics, normalizeRole } from '@/lib/roles'
import type { RootState } from '@/store'
import {
  Calendar,
  Wrench,
  AlertTriangle,
  QrCode,
  Car,
  ArrowRight,
  Plus,
  Bell,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

type MaintenanceForecastRow = {
  plan_id: string
  plan_name: string
  vehicle: string
  next_due: string
}

type VisitRow = {
  id: string
  status: string
  service_date?: string
  line_summary?: string
  vehicle?: { make?: string; model?: string; license_plate?: string }
  client?: { name?: string }
}

export default function Dashboard() {
  const { t } = useTranslation()
  const { showToast } = useApiToast()
  const navigate = useNavigate()
  const user = useSelector((state: RootState) => state.auth.user)
  const role = normalizeRole(user?.role)
  const showMaintenanceAlerts = canViewAnalytics(role)

  const [showQRScanner, setShowQRScanner] = useState(false)

  const { data: visitsData } = useQuery({
    queryKey: ['visits'],
    queryFn: () => visitsApi.list(),
  })

  const { data: inventoryData } = useQuery({
    queryKey: ['inventory'],
    queryFn: () => api.get('/inventory/items/'),
  })

  const { data: forecastData } = useQuery({
    queryKey: ['maintenance-forecast'],
    queryFn: () => visitsApi.analytics.maintenanceForecast(),
    enabled: showMaintenanceAlerts,
  })

  const visitsList: VisitRow[] = visitsData?.data?.results || visitsData?.data || []
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const todayVisits = visitsList.filter((v) => {
    if (!v.service_date) return false
    const visitDate = new Date(v.service_date)
    visitDate.setHours(0, 0, 0, 0)
    return visitDate.getTime() === today.getTime()
  }).length

  const activeVisits = visitsList.filter(
    (v) => v.status === 'in_progress' || v.status === 'draft',
  )

  const inventoryItems = inventoryData?.data?.results || inventoryData?.data || []
  const lowStockAlerts = inventoryItems.filter(
    (item: { current_stock: number; minimum_stock: number }) =>
      item.current_stock <= item.minimum_stock,
  ).length

  const forecast: MaintenanceForecastRow[] = forecastData?.data || []
  const overdueMaintenance = showMaintenanceAlerts
    ? forecast.filter((row) => row.next_due?.includes('Overdue')).length
    : 0

  const alertCount = lowStockAlerts + overdueMaintenance

  return (
    <div className="page-shell space-y-4">
      <section className="card p-4 lg:p-5">
        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            to="/visits"
            className="btn btn-primary flex-1 h-12 text-base font-semibold justify-center gap-2"
          >
            <Plus className="w-5 h-5" />
            {t('dashboard.newVisit')}
          </Link>
          <button
            type="button"
            onClick={() => setShowQRScanner(true)}
            className="btn btn-outline h-12 px-5 justify-center gap-2 sm:w-auto"
          >
            <QrCode className="w-5 h-5" />
            <span className="hidden sm:inline">{t('dashboard.scanQr')}</span>
          </button>
        </div>
      </section>

      <section className="grid grid-cols-1 min-[420px]:grid-cols-3 gap-3">
        <StatPill
          to="/visits"
          icon={Calendar}
          label={t('dashboard.todayVisits')}
          value={todayVisits}
        />
        <StatPill
          to="/visits"
          icon={Wrench}
          label={t('dashboard.openVisits')}
          value={activeVisits.length}
        />
        <StatPill
          to={alertCount > 0 ? (lowStockAlerts > 0 ? '/inventory' : '/analytics') : undefined}
          icon={alertCount > 0 ? AlertTriangle : Bell}
          label={t('dashboard.alerts')}
          value={alertCount}
          highlight={alertCount > 0}
        />
      </section>

      <section className="card p-4 lg:p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-primary">
            {t('dashboard.openVisitsTitle', { count: activeVisits.length })}
          </h2>
          <Link to="/visits" className="text-xs font-medium text-accent hover:underline">
            {t('common.viewAll')}
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {activeVisits.length > 0 ? (
            activeVisits.slice(0, 8).map((visit) => (
              <Link
                key={visit.id}
                to={`/visits/${visit.id}/edit`}
                className="w-full bg-gray-50 rounded-xl p-4 border border-gray-200 flex flex-col gap-3 hover:shadow-md hover:border-accent/30 transition-all"
              >
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <h4 className="font-bold text-primary text-sm truncate">
                      {visit.vehicle?.make} {visit.vehicle?.model}
                    </h4>
                    <p className="text-xs text-secondary truncate">
                      {visit.vehicle?.license_plate}
                      {visit.line_summary ? ` · ${visit.line_summary}` : ''}
                    </p>
                  </div>
                  <VisitStatusBadge status={visit.status} />
                </div>
                <div className="flex items-center justify-between mt-auto pt-1">
                  <span className="text-xs text-secondary truncate">
                    {visit.client?.name || t('dashboard.walkIn')}
                  </span>
                  <span className="text-xs font-medium text-accent flex items-center gap-0.5 shrink-0">
                    {t('common.continue')} <ArrowRight className="w-3 h-3" />
                  </span>
                </div>
              </Link>
            ))
          ) : (
            <div className="text-center py-10 w-full">
              <Car className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-secondary">{t('dashboard.noOpenVisits')}</p>
              <Link to="/visits" className="mt-3 inline-block text-accent hover:underline text-sm font-medium">
                {t('dashboard.startNewVisit')}
              </Link>
            </div>
          )}
        </div>
      </section>

      {alertCount > 0 && (
        <section className="card p-4 lg:p-5 space-y-3">
          <h2 className="text-base font-bold text-primary">{t('dashboard.needsAttention')}</h2>
          {lowStockAlerts > 0 && (
            <AlertRow
              tone="danger"
              title={t('dashboard.lowStockAlert')}
              message={t('dashboard.lowStockMessage', { count: lowStockAlerts })}
              href="/inventory"
              linkLabel={t('dashboard.viewInventory')}
            />
          )}
          {overdueMaintenance > 0 && (
            <AlertRow
              tone="warning"
              title={t('dashboard.overdueMaintenance')}
              message={t('dashboard.overdueMessage', { count: overdueMaintenance })}
              href="/maintenance-orders"
              linkLabel={t('dashboard.viewMaintenance')}
            />
          )}
        </section>
      )}

      {showQRScanner && (
        <QRScanner
          onScanSuccess={async (decodedText) => {
            setShowQRScanner(false)
            try {
              const response = await vehiclesApi.lookup(decodedText)
              const data = response.data
              if (data && !Array.isArray(data)) {
                navigate(`/vehicles/${data.id}`)
              } else {
                navigate(`/vehicles?search=${encodeURIComponent(decodedText)}`)
              }
            } catch {
              showToast(t('dashboardExtra.vehicleNotFound'), 'info')
              navigate('/vehicles/new')
            }
          }}
          onScanError={() => {}}
          onClose={() => setShowQRScanner(false)}
        />
      )}
    </div>
  )
}

function StatPill({
  to,
  icon: Icon,
  label,
  value,
  highlight,
}: {
  to?: string
  icon: typeof Calendar
  label: string
  value: number
  highlight?: boolean
}) {
  const inner = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-secondary truncate">{label}</p>
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
            highlight ? 'bg-amber-50 text-warning' : 'bg-gray-50 text-secondary'
          }`}
        >
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <p className={`text-2xl font-bold mt-2 ${highlight ? 'text-warning' : 'text-primary'}`}>{value}</p>
    </>
  )

  const className = `card p-4 min-h-[88px] flex flex-col justify-center ${
    to ? 'hover:bg-gray-50/80 hover:border-accent/30 transition-all' : ''
  }`

  if (to) {
    return (
      <Link to={to} className={className}>
        {inner}
      </Link>
    )
  }

  return <div className={className}>{inner}</div>
}

function AlertRow({
  tone,
  title,
  message,
  href,
  linkLabel,
}: {
  tone: 'danger' | 'warning'
  title: string
  message: string
  href: string
  linkLabel: string
}) {
  const box = tone === 'danger' ? 'bg-red-50 border-red-100' : 'bg-amber-50 border-amber-100'
  const link = tone === 'danger' ? 'text-danger' : 'text-warning'

  return (
    <Link
      to={href}
      className={`flex flex-col gap-1 p-3 rounded-xl border transition-colors hover:shadow-sm ${box}`}
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-semibold text-primary">{title}</h4>
        <ArrowRight className={`w-4 h-4 shrink-0 ${link}`} />
      </div>
      <p className="text-xs text-secondary">{message}</p>
      <span className={`text-xs font-medium mt-1 ${link}`}>{linkLabel}</span>
    </Link>
  )
}
