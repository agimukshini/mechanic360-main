import { Link } from 'react-router-dom'
import { Car, ChevronRight, LayoutGrid, List, Table2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import VehiclePhoto from '@/components/vehicles/VehiclePhoto'
import { formatOdometer, type OdometerUnit } from '@/lib/odometer'

export type VehicleRow = {
  id: string
  make?: string
  model?: string
  year?: number
  license_plate?: string
  vin?: string
  odometer_km?: number | null
  odometer_unit?: OdometerUnit
  photo?: string | null
  last_service_date?: string | null
  service_due_soon?: boolean
  owner?: { name?: string; company?: string }
  visits?: { status: string; completed_at?: string }[]
  is_active?: boolean
}

export type ViewMode = 'grid' | 'list' | 'table'

export function vehicleInService(vehicle: VehicleRow) {
  return vehicle.visits?.some((v) => v.status === 'in_progress')
}

function ownerLabel(vehicle: VehicleRow) {
  return vehicle.owner?.name || vehicle.owner?.company || '—'
}

function odometerLabel(vehicle: VehicleRow) {
  return formatOdometer(
    vehicle.odometer_km,
    vehicle.odometer_unit === 'mi' ? 'mi' : 'km',
  )
}

function useLastServiceLabel() {
  const { t } = useTranslation()
  return (vehicle: VehicleRow) =>
    vehicle.last_service_date
      ? new Date(vehicle.last_service_date).toLocaleDateString()
      : t('vehicles.lastServiceNever')
}

function VehicleStatusBadges({ vehicle }: { vehicle: VehicleRow }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap gap-1 justify-end">
      {vehicle.is_active === false && (
        <span className="px-2 py-0.5 bg-amber-50 text-amber-800 text-[10px] font-bold rounded-full border border-amber-200 shrink-0">
          {t('vehicles.badgeArchived')}
        </span>
      )}
      {vehicleInService(vehicle) && (
        <span className="px-2 py-0.5 bg-blue-50 text-accent text-[10px] font-bold rounded-full border border-blue-200 shrink-0">
          {t('vehicles.badgeInService')}
        </span>
      )}
      {vehicle.service_due_soon && !vehicleInService(vehicle) && (
        <span className="px-2 py-0.5 bg-amber-50 text-amber-700 text-[10px] font-bold rounded-full border border-amber-200 shrink-0">
          {t('vehicles.badgeDueSoon')}
        </span>
      )}
    </div>
  )
}

export function ViewModeToggle({
  viewMode,
  onChange,
}: {
  viewMode: ViewMode
  onChange: (mode: ViewMode) => void
}) {
  const { t } = useTranslation()
  const modes: { id: ViewMode; icon: typeof LayoutGrid; label: string }[] = [
    { id: 'grid', icon: LayoutGrid, label: t('vehicles.viewModeGrid') },
    { id: 'list', icon: List, label: t('vehicles.viewModeList') },
    { id: 'table', icon: Table2, label: t('vehicles.viewModeTable') },
  ]

  return (
    <div
      className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 shadow-sm"
      role="group"
      aria-label={t('vehicles.viewMode')}
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

export function VehiclesGridView({ vehicles }: { vehicles: VehicleRow[] }) {
  const { t } = useTranslation()
  const lastServiceLabel = useLastServiceLabel()
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {vehicles.map((vehicle) => (
        <Link
          key={vehicle.id}
          to={`/vehicles/${vehicle.id}`}
          className="bg-surface rounded-xl shadow-soft border border-gray-100 overflow-hidden hover:shadow-float transition-all block"
        >
          {vehicle.photo ? (
            <VehiclePhoto
              src={vehicle.photo}
              alt={`${vehicle.make} ${vehicle.model}`}
              variant="grid"
            />
          ) : null}
          <div className="p-4">
            <div className="flex items-start justify-between mb-3 gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                {!vehicle.photo && (
                  <div className="w-8 h-8 bg-gray-50 rounded-lg flex items-center justify-center shrink-0">
                    <Car className="w-4 h-4 text-gray-400" />
                  </div>
                )}
                <div className="min-w-0">
                  <h3 className="font-bold text-gray-900 text-sm truncate">
                    {vehicle.make} {vehicle.model}
                  </h3>
                  <p className="text-[11px] text-secondary">{vehicle.license_plate}</p>
                </div>
              </div>
              <VehicleStatusBadges vehicle={vehicle} />
            </div>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-gray-500">{t('vehicles.owner')}</span>
                <span className="font-medium text-gray-900 truncate">{ownerLabel(vehicle)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-gray-500">{t('vehicles.lastService')}</span>
                <span className="font-medium text-gray-900">{lastServiceLabel(vehicle)}</span>
              </div>
            </div>
            <div className="mt-3 w-full py-2 bg-gray-50 text-gray-700 font-medium rounded-lg flex items-center justify-center gap-1.5 text-xs">
              {t('vehicles.viewDetails')}
              <ChevronRight className="w-3.5 h-3.5" />
            </div>
          </div>
        </Link>
      ))}
    </div>
  )
}

export function VehiclesListView({ vehicles }: { vehicles: VehicleRow[] }) {
  const { t } = useTranslation()
  const lastServiceLabel = useLastServiceLabel()
  return (
    <div className="space-y-2">
      {vehicles.map((vehicle) => (
        <Link
          key={vehicle.id}
          to={`/vehicles/${vehicle.id}`}
          className="card flex items-center gap-4 p-4 hover:border-accent/40 transition-colors"
        >
          {vehicle.photo ? (
            <VehiclePhoto
              src={vehicle.photo}
              alt={`${vehicle.make} ${vehicle.model}`}
              variant="list"
            />
          ) : (
            <div className="w-16 h-16 rounded-lg bg-gray-50 flex items-center justify-center shrink-0">
              <Car className="w-7 h-7 text-gray-300" />
            </div>
          )}
          <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
            <div>
              <p className="font-semibold text-primary truncate">
                {vehicle.make} {vehicle.model}
                {vehicle.year ? ` (${vehicle.year})` : ''}
              </p>
              <p className="text-sm text-secondary">{vehicle.license_plate}</p>
            </div>
            <div>
              <p className="text-xs text-secondary">{t('vehicles.owner')}</p>
              <p className="text-sm font-medium text-primary truncate">{ownerLabel(vehicle)}</p>
            </div>
            <div>
              <p className="text-xs text-secondary">{t('vehicles.lastService')}</p>
              <p className="text-sm font-medium text-primary">{lastServiceLabel(vehicle)}</p>
            </div>
            <div>
              <p className="text-xs text-secondary">{t('vehicles.odometer.label')}</p>
              <p className="text-sm font-medium text-primary">
                {odometerLabel(vehicle)}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <VehicleStatusBadges vehicle={vehicle} />
            <ChevronRight className="w-5 h-5 text-gray-300" />
          </div>
        </Link>
      ))}
    </div>
  )
}

export function VehiclesTableView({ vehicles }: { vehicles: VehicleRow[] }) {
  const { t } = useTranslation()
  const lastServiceLabel = useLastServiceLabel()
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-medium text-secondary uppercase">{t('vehicles.vehicle')}</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-secondary uppercase">{t('vehicles.plate')}</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-secondary uppercase hidden md:table-cell">{t('vehicles.owner')}</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-secondary uppercase hidden lg:table-cell">{t('vehicles.odometer.label')}</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-secondary uppercase hidden sm:table-cell">{t('vehicles.lastService')}</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-secondary uppercase">{t('vehicles.status')}</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-secondary uppercase"> </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {vehicles.map((vehicle) => (
              <tr key={vehicle.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-primary text-sm">
                  {vehicle.make} {vehicle.model}
                  {vehicle.year ? ` (${vehicle.year})` : ''}
                </td>
                <td className="px-4 py-3 text-sm text-secondary">{vehicle.license_plate}</td>
                <td className="px-4 py-3 text-sm text-secondary hidden md:table-cell">{ownerLabel(vehicle)}</td>
                <td className="px-4 py-3 text-sm text-secondary hidden lg:table-cell">
                  {odometerLabel(vehicle)}
                </td>
                <td className="px-4 py-3 text-sm text-secondary hidden sm:table-cell">{lastServiceLabel(vehicle)}</td>
                <td className="px-4 py-3">
                  <VehicleStatusBadges vehicle={vehicle} />
                </td>
                <td className="px-4 py-3 text-right">
                  <Link to={`/vehicles/${vehicle.id}`} className="btn btn-outline btn-sm">
                    {t('vehicles.viewAction')}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
