import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { visitsApi, authApi, vehiclesApi, globalVehiclesApi } from '@/api'
import { Search, Loader2, Calendar, QrCode, Car, Globe, ArrowRight } from 'lucide-react'
import { useState, useMemo } from 'react'
import PageHeader from '@/components/ui/PageHeader'
import VisitStatusBadge from '@/components/ui/VisitStatusBadge'
import QRScanner from '@/components/QRScanner'
import { useApiToast } from '@/hooks/useApiToast'
import { useTranslation } from 'react-i18next'
import { useSelector } from 'react-redux'
import { canManageWorkshopData, normalizeRole } from '@/lib/roles'
import type { RootState } from '@/store'

type VisitRow = {
  id: string
  status: string
  service_date: string
  mileage_km: number
  grand_total?: string
  line_summary?: string
  vehicle?: { license_plate?: string; make?: string; model?: string }
}

type LocalVehicle = {
  id: string
  license_plate?: string
  vin?: string
  make?: string
  model?: string
  year?: number
  global_vehicle_id?: string | null
  owner?: { name?: string } | null
  odometer_km?: number
}

type GlobalVehicleRow = {
  id: string
  license_plate?: string
  vin?: string
  make?: string
  model?: string
  year?: number
  registered_by_tenant?: { name?: string } | null
}

export default function VisitsList() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { showError, showToast } = useApiToast()
  const { user } = useSelector((state: RootState) => state.auth)
  const canFilterByMechanic = canManageWorkshopData(normalizeRole(user?.role))
  const [search, setSearch] = useState('')
  const [mechanicFilter, setMechanicFilter] = useState('')
  const [showScanner, setShowScanner] = useState(false)
  const [isLookingUp, setIsLookingUp] = useState(false)

  const trimmedSearch = search.trim()
  const hasSearch = trimmedSearch.length > 0

  const { data: mechanicsData } = useQuery({
    queryKey: ['tenant-mechanics'],
    queryFn: () => authApi.listMechanics(),
    enabled: canFilterByMechanic,
  })

  const { data, isLoading } = useQuery({
    queryKey: ['visits', search, mechanicFilter],
    queryFn: () =>
      visitsApi.list({
        search,
        ...(mechanicFilter ? { mechanic: mechanicFilter } : {}),
      }),
  })

  // Search the local vehicle list when the user is typing — the same payload
  // already powers the dedicated Vehicles page so we get plate/VIN/make/model
  // matches for free.
  const { data: localVehiclesData, isFetching: localVehiclesFetching } = useQuery({
    queryKey: ['visits-vehicle-search-local', trimmedSearch],
    queryFn: () => vehiclesApi.list({ search: trimmedSearch }),
    enabled: hasSearch && canFilterByMechanic,
  })

  // Cross-workshop registry hits — surfaced separately so the user can see
  // vehicles that exist platform-wide but haven't been registered locally yet.
  const { data: globalVehiclesData, isFetching: globalVehiclesFetching } = useQuery({
    queryKey: ['visits-vehicle-search-global', trimmedSearch],
    queryFn: () => globalVehiclesApi.list({ search: trimmedSearch }),
    enabled: hasSearch && canFilterByMechanic,
  })

  const visits: VisitRow[] = data?.data?.results || data?.data || []
  const mechanics = mechanicsData?.data || []
  const localVehicles: LocalVehicle[] =
    localVehiclesData?.data?.results || localVehiclesData?.data || []
  const globalVehicles: GlobalVehicleRow[] =
    globalVehiclesData?.data?.results || globalVehiclesData?.data || []

  // De-dupe globals already mirrored locally so we don't show the same plate
  // twice (once as "at this workshop" and once as "global").
  const localGlobalIds = useMemo(
    () => new Set(localVehicles.map((v) => v.global_vehicle_id).filter(Boolean) as string[]),
    [localVehicles],
  )
  const globalOnly = useMemo(
    () => globalVehicles.filter((g) => !localGlobalIds.has(g.id)).slice(0, 8),
    [globalVehicles, localGlobalIds],
  )
  const localTrimmed = useMemo(() => localVehicles.slice(0, 8), [localVehicles])

  // Single-shot "check in this vehicle" mutation. Accepts either an existing
  // local vehicle ID (`{ vehicleId }`) or a global registry ID (`{ globalId }`)
  // — globals are adopted into the tenant first (idempotent) before opening
  // the visit. No new global vehicle is created on adoption.
  const checkInMutation = useMutation({
    mutationFn: async (input: { vehicleId?: string; globalId?: string }) => {
      let vehicleId = input.vehicleId
      if (!vehicleId && input.globalId) {
        const adopted = await vehiclesApi.adoptGlobal(input.globalId)
        vehicleId = adopted.data.id
      }
      if (!vehicleId) {
        throw new Error('check-in needs vehicleId or globalId')
      }
      const vehicleRes = await vehiclesApi.get(vehicleId)
      const odometer = vehicleRes.data?.odometer_km || 0
      return visitsApi.create({
        vehicle_id: vehicleId,
        mileage_km: odometer,
        notes: '',
        service_date: new Date().toISOString(),
        status: 'draft',
      })
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['visits'] })
      queryClient.invalidateQueries({ queryKey: ['vehicles'] })
      navigate(`/visits/${response.data.id}/edit`, { replace: true })
    },
    onError: (error) => showError(error, t('visits.checkInFailed')),
  })

  const handleScanSuccess = async (decodedText: string) => {
    setShowScanner(false)
    setIsLookingUp(true)
    try {
      const response = await vehiclesApi.lookup(decodedText)
      const data = response.data
      if (data && !Array.isArray(data) && data.id) {
        checkInMutation.mutate({ vehicleId: data.id })
        return
      }
      if (Array.isArray(data) && data.length === 1) {
        checkInMutation.mutate({ vehicleId: data[0].id })
        return
      }
      if (Array.isArray(data) && data.length > 1) {
        setSearch(decodedText)
        return
      }
      showToast(t('visits.vehicleNotFoundShort'), 'info')
    } catch (error: unknown) {
      const err = error as { response?: { status?: number } }
      if (err.response?.status === 404) {
        showToast(t('visits.vehicleNotFoundShort'), 'info')
      } else {
        showError(error, t('visits.vehicleLookupFailed'))
      }
    } finally {
      setIsLookingUp(false)
    }
  }

  const isCheckingIn = isLookingUp || checkInMutation.isPending
  const showVehiclePicker = hasSearch && canFilterByMechanic
  const vehicleSearchLoading = showVehiclePicker && (localVehiclesFetching || globalVehiclesFetching)
  const hasAnyMatch = localTrimmed.length > 0 || globalOnly.length > 0

  return (
    <div className="space-y-6">
      <PageHeader title={t('visits.listTitle')} description={t('visits.listDescription')} />

      {canFilterByMechanic && (
        <button
          type="button"
          onClick={() => setShowScanner(true)}
          disabled={isCheckingIn}
          className="w-full bg-primary rounded-xl shadow-float p-4 border border-gray-800 flex items-center gap-4 text-left text-white hover:opacity-95 transition relative overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-accent/25 to-transparent opacity-60 pointer-events-none" />
          <div className="relative w-12 h-12 bg-white/10 rounded-full flex items-center justify-center backdrop-blur-sm border border-white/20 shrink-0">
            {isCheckingIn ? <Loader2 className="w-5 h-5 animate-spin" /> : <QrCode className="w-6 h-6" />}
          </div>
          <div className="relative min-w-0 flex-1">
            <p className="font-bold text-base">
              {checkInMutation.isPending
                ? t('visits.checkingIn')
                : isLookingUp
                  ? t('visits.scanLookingUp')
                  : t('visits.scanQrCheckIn')}
            </p>
            <p className="text-xs text-gray-300 mt-0.5 truncate">
              {isCheckingIn ? t('visits.scanFinding') : t('visits.scanQrCheckInHint')}
            </p>
          </div>
        </button>
      )}

      <div className="flex flex-col sm:flex-row gap-3 max-w-2xl">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary/60" />
          <input
            type="search"
            placeholder={t('visits.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-10 w-full"
          />
        </div>
        {canFilterByMechanic && (
          <select
            value={mechanicFilter}
            onChange={(e) => setMechanicFilter(e.target.value)}
            className="input w-full sm:w-56"
          >
            <option value="">{t('visits.allMechanics')}</option>
            {mechanics.map((mechanic: { id: string; first_name?: string; last_name?: string; username: string }) => (
              <option key={mechanic.id} value={mechanic.id}>
                {[mechanic.first_name, mechanic.last_name].filter(Boolean).join(' ') || mechanic.username}
              </option>
            ))}
          </select>
        )}
      </div>

      {showVehiclePicker && (
        <div className="space-y-4">
          {vehicleSearchLoading && !hasAnyMatch ? (
            <div className="card p-4 text-sm text-secondary flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> {t('visits.scanLookingUp')}
            </div>
          ) : null}

          {localTrimmed.length > 0 && (
            <section className="card p-3 sm:p-4">
              <header className="flex items-center gap-2 px-1 pb-2 text-xs font-medium uppercase tracking-wide text-secondary/80">
                <Car className="w-4 h-4" />
                {t('visits.vehiclesAtWorkshop')}
              </header>
              <ul className="divide-y divide-gray-100">
                {localTrimmed.map((v) => (
                  <li key={v.id} className="flex items-center gap-3 py-2 px-1">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-primary truncate">
                        {v.license_plate || '—'} <span className="text-secondary font-normal">— {v.make} {v.model}{v.year ? ` (${v.year})` : ''}</span>
                      </p>
                      <p className="text-xs text-secondary mt-0.5 truncate">
                        {v.vin ? `VIN ${v.vin}` : ''}
                        {v.owner?.name ? `${v.vin ? ' · ' : ''}${t('visits.ownerLabel')}: ${v.owner.name}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => checkInMutation.mutate({ vehicleId: v.id })}
                      disabled={checkInMutation.isPending}
                      className="btn btn-primary btn-sm shrink-0"
                    >
                      {checkInMutation.isPending && checkInMutation.variables?.vehicleId === v.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <ArrowRight className="w-4 h-4" />
                      )}
                      {t('visits.checkIn')}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {globalOnly.length > 0 && (
            <section className="card p-3 sm:p-4">
              <header className="flex items-center gap-2 px-1 pb-2 text-xs font-medium uppercase tracking-wide text-secondary/80">
                <Globe className="w-4 h-4" />
                {t('visits.vehiclesGlobalRegistry')}
                <span className="font-normal normal-case text-secondary/60">— {t('visits.vehiclesGlobalRegistryHint')}</span>
              </header>
              <ul className="divide-y divide-gray-100">
                {globalOnly.map((g) => (
                  <li key={g.id} className="flex items-center gap-3 py-2 px-1">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-primary truncate">
                        {g.license_plate || '—'} <span className="text-secondary font-normal">— {g.make} {g.model}{g.year ? ` (${g.year})` : ''}</span>
                      </p>
                      <p className="text-xs text-secondary mt-0.5 truncate">
                        {g.vin ? `VIN ${g.vin}` : ''}
                        {g.registered_by_tenant?.name
                          ? `${g.vin ? ' · ' : ''}${t('visits.registeredAt')}: ${g.registered_by_tenant.name}`
                          : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => checkInMutation.mutate({ globalId: g.id })}
                      disabled={checkInMutation.isPending}
                      className="btn btn-primary btn-sm shrink-0"
                    >
                      {checkInMutation.isPending && checkInMutation.variables?.globalId === g.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <ArrowRight className="w-4 h-4" />
                      )}
                      {t('visits.checkIn')}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {!vehicleSearchLoading && !hasAnyMatch && hasSearch && (
            <p className="text-sm text-secondary px-1">{t('visits.noVehicleMatches')}</p>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="card p-12 text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-accent" />
        </div>
      ) : visits.length === 0 ? (
        <div className="card p-12 text-center text-secondary">{t('visits.empty')}</div>
      ) : (
        <>
          <div className="md:hidden space-y-3">
            {visits.map((visit) => (
              <Link
                key={visit.id}
                to={
                  visit.status === 'draft' || visit.status === 'in_progress'
                    ? `/visits/${visit.id}/edit`
                    : `/visits/${visit.id}`
                }
                className="card block p-4 hover:border-accent/40 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-primary truncate">
                      {visit.vehicle?.license_plate} — {visit.vehicle?.make} {visit.vehicle?.model}
                    </p>
                    <p className="text-sm text-secondary mt-0.5">
                      {new Date(visit.service_date).toLocaleDateString()} · {visit.mileage_km?.toLocaleString() ?? 0} km
                    </p>
                    {visit.line_summary ? (
                      <p className="text-xs text-secondary mt-1 truncate">{visit.line_summary}</p>
                    ) : null}
                  </div>
                  <VisitStatusBadge status={visit.status} />
                </div>
                <p className="text-sm font-semibold text-primary mt-3">
                  €{parseFloat(visit.grand_total || '0').toFixed(2)}
                </p>
              </Link>
            ))}
          </div>

          <div className="card overflow-hidden hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-6 py-3 text-xs font-medium text-secondary uppercase">{t('visits.vehicle')}</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-secondary uppercase">{t('visits.date')}</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-secondary uppercase">{t('visits.mileage')}</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-secondary uppercase">{t('visits.total')}</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-secondary uppercase">{t('visits.status')}</th>
                    <th className="text-right px-6 py-3 text-xs font-medium text-secondary uppercase">{t('visits.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {visits.map((visit) => (
                    <tr key={visit.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 font-medium text-primary">
                        {visit.vehicle?.license_plate} — {visit.vehicle?.make} {visit.vehicle?.model}
                      </td>
                      <td className="px-6 py-4 text-sm text-secondary">
                        {new Date(visit.service_date).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-sm text-secondary">
                        {visit.mileage_km?.toLocaleString() ?? 0} km
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-primary">
                        €{parseFloat(visit.grand_total || '0').toFixed(2)}
                      </td>
                      <td className="px-6 py-4">
                        <VisitStatusBadge status={visit.status} />
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link
                          to={
                            visit.status === 'draft' || visit.status === 'in_progress'
                              ? `/visits/${visit.id}/edit`
                              : `/visits/${visit.id}`
                          }
                          className="btn btn-outline btn-sm"
                        >
                          <Calendar className="w-4 h-4 mr-2" />
                          {visit.status === 'draft' || visit.status === 'in_progress' ? t('visits.continue') : t('visits.view')}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {showScanner && (
        <QRScanner
          onScanSuccess={handleScanSuccess}
          onScanError={(error) => {
            // eslint-disable-next-line no-console
            console.error('Scanner error:', error)
          }}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  )
}
