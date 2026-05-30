import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { visitsApi } from '@/api'
import { downloadBlob, filenameFromContentDisposition } from '@/lib/download'
import { formatEuro } from '@/lib/money'
import { userDisplayName } from '@/lib/userDisplay'
import { ArrowLeft, Download, FileSpreadsheet, Loader2, Users } from 'lucide-react'

const CHART_COLOR = '#0077B6'

type MechanicRow = {
  user: { id: string; username: string; first_name?: string; last_name?: string }
  visits_completed: number
  service_lines: number
  labor_lines: number
  labor_hours: number
  revenue_total: number
  vehicles_touched: number
}

type VisitsOverTimePoint = { period: string; visits: number }
type TopServiceRow = { service: string; count: number; revenue: number }

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-4 sm:p-6 min-w-0">
      <h2 className="font-semibold text-primary mb-4">{title}</h2>
      <div className="h-56 sm:h-64 min-w-0">{children}</div>
    </div>
  )
}

function ExportButtons({ days, disabled }: { days: number; disabled?: boolean }) {
  const { t } = useTranslation()
  const [exporting, setExporting] = useState<'csv' | 'pdf' | null>(null)

  const handleExport = async (format: 'csv' | 'pdf') => {
    setExporting(format)
    try {
      const response = await visitsApi.analytics.mechanicsExport({ days, export_as: format })
      const mime = format === 'pdf' ? 'application/pdf' : 'text/csv'
      const fallback = `mechanic-kpis-${days}d.${format}`
      const filename = filenameFromContentDisposition(
        response.headers['content-disposition'] as string | undefined,
        fallback,
      )
      downloadBlob(new Blob([response.data], { type: mime }), filename)
    } finally {
      setExporting(null)
    }
  }

  return (
    <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
      <button
        type="button"
        disabled={disabled || exporting !== null}
        onClick={() => handleExport('csv')}
        className="btn btn-outline text-sm w-full sm:w-auto justify-center"
      >
        {exporting === 'csv' ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <>
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            {t('analytics.mechanics.exportCsv')}
          </>
        )}
      </button>
      <button
        type="button"
        disabled={disabled || exporting !== null}
        onClick={() => handleExport('pdf')}
        className="btn btn-outline text-sm w-full sm:w-auto justify-center"
      >
        {exporting === 'pdf' ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <>
            <Download className="w-4 h-4 mr-2" />
            {t('analytics.mechanics.exportPdf')}
          </>
        )}
      </button>
    </div>
  )
}

function PeriodSelect({ days, onChange }: { days: number; onChange: (days: number) => void }) {
  const { t } = useTranslation()
  return (
    <select value={days} onChange={(e) => onChange(Number(e.target.value))} className="input w-full sm:w-auto min-w-0">
      <option value={7}>{t('analytics.mechanics.last7')}</option>
      <option value={30}>{t('analytics.mechanics.last30')}</option>
      <option value={90}>{t('analytics.mechanics.last90')}</option>
    </select>
  )
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

  const teamChartData = useMemo(
    () =>
      mechanics.map((row) => ({
        name: userDisplayName(row.user),
        visits: row.visits_completed,
        hours: Number(row.labor_hours.toFixed(1)),
      })),
    [mechanics],
  )

  if (detailId) {
    const summary = detailData?.data?.summary as MechanicRow | undefined
    const visitsOverTime: VisitsOverTimePoint[] = detailData?.data?.visits_over_time || []
    const topServices: TopServiceRow[] = detailData?.data?.top_services || []

    return (
      <div className="space-y-6 min-w-0">
        <Link
          to="/analytics/mechanics"
          className="inline-flex items-center gap-2 text-sm text-secondary hover:text-accent"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('analytics.mechanics.back')}
        </Link>
        {detailLoading || !summary ? (
          <div className="card p-12 flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-accent" />
          </div>
        ) : (
          <>
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 min-w-0">
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl font-bold text-primary break-words">
                  {userDisplayName(summary.user)}
                </h1>
                <p className="text-secondary mt-1">{t('analytics.mechanics.detailSubtitle', { days })}</p>
              </div>
              <PeriodSelect days={days} onChange={setDays} />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
              {[
                { label: t('analytics.mechanics.visitsCompleted'), value: summary.visits_completed },
                { label: t('analytics.mechanics.serviceLines'), value: summary.service_lines },
                { label: t('analytics.mechanics.laborHours'), value: summary.labor_hours.toFixed(1) },
                { label: t('analytics.mechanics.revenue'), value: formatEuro(summary.revenue_total) },
              ].map((card) => (
                <div key={card.label} className="card p-3 sm:p-4 min-w-0">
                  <p className="text-[10px] sm:text-xs text-secondary uppercase">{card.label}</p>
                  <p className="text-xl sm:text-2xl font-bold text-primary mt-1 truncate">{card.value}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-w-0">
              <ChartCard title={t('analytics.mechanics.visitsOverTime')}>
                {visitsOverTime.length === 0 ? (
                  <p className="text-sm text-secondary flex items-center justify-center h-full">
                    {t('analytics.mechanics.noChartData')}
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={visitsOverTime}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="period" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={32} />
                      <Tooltip />
                      <Line
                        type="monotone"
                        dataKey="visits"
                        name={t('analytics.mechanics.visitsCompleted')}
                        stroke={CHART_COLOR}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard title={t('analytics.mechanics.topServices')}>
                {topServices.length === 0 ? (
                  <p className="text-sm text-secondary flex items-center justify-center h-full">
                    {t('analytics.mechanics.noChartData')}
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topServices} layout="vertical" margin={{ left: 8, right: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                      <YAxis
                        type="category"
                        dataKey="service"
                        width={100}
                        tick={{ fontSize: 10 }}
                        tickFormatter={(v: string) => (v.length > 18 ? `${v.slice(0, 18)}…` : v)}
                      />
                      <Tooltip />
                      <Bar
                        dataKey="count"
                        name={t('analytics.mechanics.serviceCount')}
                        fill={CHART_COLOR}
                        radius={[0, 4, 4, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
            </div>

            <div className="card overflow-hidden min-w-0">
              <div className="px-4 sm:px-6 py-4 border-b border-gray-100">
                <h2 className="font-semibold">{t('analytics.mechanics.recentVisits')}</h2>
              </div>
              <ul className="divide-y divide-gray-100">
                {(detailData?.data?.recent_visits || []).map((visit: {
                  id: string
                  service_date: string
                  status: string
                  vehicle: { license_plate: string; make: string; model: string }
                }) => (
                  <li
                    key={visit.id}
                    className="px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 min-w-0"
                  >
                    <div className="min-w-0">
                      <p className="font-medium break-words">
                        {visit.vehicle.license_plate} — {visit.vehicle.make} {visit.vehicle.model}
                      </p>
                      <p className="text-sm text-secondary">
                        {new Date(visit.service_date).toLocaleDateString()} · {visit.status}
                      </p>
                    </div>
                    <Link
                      to={`/visits/${visit.id}`}
                      className="btn btn-outline btn-sm w-full sm:w-auto justify-center shrink-0"
                    >
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
    <div className="space-y-6 min-w-0">
      <div className="flex flex-col gap-4 min-w-0">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-primary flex items-center gap-2">
            <Users className="w-6 h-6 sm:w-7 sm:h-7 text-accent shrink-0" />
            <span className="truncate">{t('analytics.mechanics.title')}</span>
          </h1>
          <p className="text-secondary mt-1">{t('analytics.mechanics.subtitle')}</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <PeriodSelect days={days} onChange={setDays} />
          <ExportButtons days={days} disabled={isLoading || mechanics.length === 0} />
        </div>
      </div>

      {!isLoading && mechanics.length > 0 && (
        <ChartCard title={t('analytics.mechanics.teamVisitsChart')}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={teamChartData} margin={{ left: 0, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10 }}
                interval={0}
                angle={teamChartData.length > 4 ? -25 : 0}
                textAnchor={teamChartData.length > 4 ? 'end' : 'middle'}
                height={teamChartData.length > 4 ? 56 : 32}
              />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={32} />
              <Tooltip />
              <Bar
                dataKey="visits"
                name={t('analytics.mechanics.visitsCompleted')}
                fill={CHART_COLOR}
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      <div className="card overflow-hidden min-w-0">
        {isLoading ? (
          <div className="p-12 flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-accent" />
          </div>
        ) : mechanics.length === 0 ? (
          <p className="p-8 text-center text-secondary">{t('analytics.mechanics.empty')}</p>
        ) : (
          <>
            <div className="hidden md:block">
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
            <div className="md:hidden divide-y divide-gray-100">
              {mechanics.map((row) => (
                <div key={row.user.id} className="p-4 space-y-2 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium text-primary break-words">{userDisplayName(row.user)}</p>
                    <Link to={`/analytics/mechanics/${row.user.id}`} className="btn btn-outline btn-sm shrink-0">
                      {t('analytics.mechanics.viewDetail')}
                    </Link>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <p className="text-[10px] uppercase text-secondary">{t('analytics.mechanics.visitsCompleted')}</p>
                      <p className="font-semibold">{row.visits_completed}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-secondary">{t('analytics.mechanics.laborHours')}</p>
                      <p className="font-semibold">{row.labor_hours.toFixed(1)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-secondary">{t('analytics.mechanics.revenue')}</p>
                      <p className="font-semibold truncate">{formatEuro(row.revenue_total)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
