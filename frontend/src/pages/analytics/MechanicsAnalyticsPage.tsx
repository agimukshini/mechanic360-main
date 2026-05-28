import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { visitsApi } from '@/api'
import { ArrowLeft, Loader2, Users } from 'lucide-react'
import { userDisplayName } from '@/lib/userDisplay'
import { formatEuro } from '@/lib/money'

type MechanicRow = {
  user: { id: string; username: string; first_name?: string; last_name?: string }
  visits_completed: number
  service_lines: number
  labor_lines: number
  labor_hours: number
  revenue_total: number
  vehicles_touched: number
}

export default function MechanicsAnalyticsPage() {
  const { t } = useTranslation()
  const { id: detailId } = useParams()
  const [days, setDays] = useState(30)

  const { data: summaryData, isLoading } = useQuery({
    queryKey: ['analytics-mechanics', days],
    queryFn: () => visitsApi.analytics.mechanicsSummary({ days }),
  })

  const { data: detailData, isLoading: detailLoading } = useQuery({
    queryKey: ['analytics-mechanic', detailId, days],
    queryFn: () => visitsApi.analytics.mechanicDetail(detailId!, { days }),
    enabled: Boolean(detailId),
  })

  const mechanics: MechanicRow[] = summaryData?.data?.mechanics || []

  if (detailId) {
    const summary = detailData?.data?.summary
    return (
      <div className="space-y-6">
        <Link to="/analytics/mechanics" className="inline-flex items-center gap-2 text-sm text-secondary hover:text-accent">
          <ArrowLeft className="w-4 h-4" />
          {t('analytics.mechanics.back')}
        </Link>
        {detailLoading || !summary ? (
          <div className="card p-12 flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-accent" />
          </div>
        ) : (
          <>
            <div>
              <h1 className="text-2xl font-bold text-primary">{userDisplayName(summary.user)}</h1>
              <p className="text-secondary mt-1">{t('analytics.mechanics.detailSubtitle', { days })}</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: t('analytics.mechanics.visitsCompleted'), value: summary.visits_completed },
                { label: t('analytics.mechanics.serviceLines'), value: summary.service_lines },
                { label: t('analytics.mechanics.laborHours'), value: summary.labor_hours.toFixed(1) },
                { label: t('analytics.mechanics.revenue'), value: formatEuro(summary.revenue_total) },
              ].map((card) => (
                <div key={card.label} className="card p-4">
                  <p className="text-xs text-secondary uppercase">{card.label}</p>
                  <p className="text-2xl font-bold text-primary mt-1">{card.value}</p>
                </div>
              ))}
            </div>
            <div className="card overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="font-semibold">{t('analytics.mechanics.recentVisits')}</h2>
              </div>
              <ul className="divide-y divide-gray-100">
                {(detailData?.data?.recent_visits || []).map((visit: {
                  id: string
                  service_date: string
                  status: string
                  vehicle: { license_plate: string; make: string; model: string }
                }) => (
                  <li key={visit.id} className="px-6 py-3 flex items-center justify-between gap-4">
                    <div>
                      <p className="font-medium">
                        {visit.vehicle.license_plate} — {visit.vehicle.make} {visit.vehicle.model}
                      </p>
                      <p className="text-sm text-secondary">
                        {new Date(visit.service_date).toLocaleDateString()} · {visit.status}
                      </p>
                    </div>
                    <Link to={`/visits/${visit.id}`} className="btn btn-outline btn-sm">
                      {t('visits.view')}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
            <Users className="w-7 h-7 text-accent" />
            {t('analytics.mechanics.title')}
          </h1>
          <p className="text-secondary mt-1">{t('analytics.mechanics.subtitle')}</p>
        </div>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="input w-auto">
          <option value={7}>{t('analytics.mechanics.last7')}</option>
          <option value={30}>{t('analytics.mechanics.last30')}</option>
          <option value={90}>{t('analytics.mechanics.last90')}</option>
        </select>
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-12 flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-accent" />
          </div>
        ) : mechanics.length === 0 ? (
          <p className="p-8 text-center text-secondary">{t('analytics.mechanics.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-medium text-secondary uppercase">
                    {t('analytics.mechanics.mechanic')}
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-secondary uppercase">
                    {t('analytics.mechanics.visitsCompleted')}
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-secondary uppercase">
                    {t('analytics.mechanics.laborHours')}
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-secondary uppercase">
                    {t('analytics.mechanics.revenue')}
                  </th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-secondary uppercase">
                    {t('analytics.mechanics.actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {mechanics.map((row) => (
                  <tr key={row.user.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium">{userDisplayName(row.user)}</td>
                    <td className="px-6 py-4">{row.visits_completed}</td>
                    <td className="px-6 py-4">{row.labor_hours.toFixed(1)}</td>
                    <td className="px-6 py-4">{formatEuro(row.revenue_total)}</td>
                    <td className="px-6 py-4 text-right">
                      <Link to={`/analytics/mechanics/${row.user.id}`} className="btn btn-outline btn-sm">
                        {t('analytics.mechanics.viewDetail')}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
