import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { visitsApi, authApi } from '@/api'
import { Plus, Search, Loader2, Calendar } from 'lucide-react'
import { useState } from 'react'
import PageHeader from '@/components/ui/PageHeader'
import VisitStatusBadge from '@/components/ui/VisitStatusBadge'
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

export default function VisitsList() {
  const { t } = useTranslation()
  const { user } = useSelector((state: RootState) => state.auth)
  const canFilterByMechanic = canManageWorkshopData(normalizeRole(user?.role))
  const [search, setSearch] = useState('')
  const [mechanicFilter, setMechanicFilter] = useState('')

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

  const visits: VisitRow[] = data?.data?.results || data?.data || []
  const mechanics = mechanicsData?.data || []

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('visits.listTitle')}
        description={t('visits.listDescription')}
        action={
          canFilterByMechanic ? (
            <Link to="/visits/new" className="btn btn-primary">
              <Plus className="w-4 h-4 mr-2" />
              {t('visits.new')}
            </Link>
          ) : undefined
        }
      />

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
                    <th className="text-left px-6 py-3 text-xs font-medium text-secondary uppercase">Vehicle</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-secondary uppercase">Date</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-secondary uppercase">Mileage</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-secondary uppercase">Total</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-secondary uppercase">Status</th>
                    <th className="text-right px-6 py-3 text-xs font-medium text-secondary uppercase">Actions</th>
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
    </div>
  )
}
