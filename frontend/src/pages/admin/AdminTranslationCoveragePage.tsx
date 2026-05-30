import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, CheckCircle2, Globe2, Loader2 } from 'lucide-react'
import { authApi } from '@/api'
import { AdminField, AdminMobileCard, AdminResponsiveTable } from '@/components/admin/AdminMobile'

type CoverageArea = {
  total: number
  translated: Record<string, number>
  note?: string
  missing?: MissingEntry[]
}

type MissingEntry = {
  area: string
  id: string
  label: string
}

type TranslationCoverageReport = {
  service_catalog: CoverageArea
  inspection_items: CoverageArea
  frontend_locales: string[]
  missing: MissingEntry[]
}

function coveragePercent(translated: number, total: number): number {
  if (total <= 0) return 100
  return Math.round((translated / total) * 100)
}

function CoverageBar({ locale, translated, total }: { locale: string; translated: number; total: number }) {
  const pct = coveragePercent(translated, total)
  const complete = pct >= 100
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="font-medium uppercase text-workshop-charcoal/80">{locale}</span>
        <span className={complete ? 'text-emerald-700' : 'text-amber-700'}>
          {translated}/{total} ({pct}%)
        </span>
      </div>
      <div className="h-2 rounded-full bg-workshop-charcoal/10 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${complete ? 'bg-emerald-500' : 'bg-amber-500'}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  )
}

function AreaCard({
  title,
  area,
  noteFallback,
}: {
  title: string
  area: CoverageArea
  noteFallback?: string
}) {
  const locales = Object.keys(area.translated)
  const allComplete = area.total > 0 && locales.every((loc) => area.translated[loc] >= area.total)

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-workshop-charcoal">{title}</h3>
          <p className="text-sm text-workshop-charcoal/60 mt-1">
            {area.note || noteFallback || ''}
          </p>
        </div>
        {allComplete ? (
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
        ) : (
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
        )}
      </div>
      {area.total > 0 ? (
        <div className="space-y-3">
          {locales.map((locale) => (
            <CoverageBar
              key={locale}
              locale={locale}
              translated={area.translated[locale] ?? 0}
              total={area.total}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-workshop-charcoal/50 italic">
          {area.note || noteFallback}
        </p>
      )}
    </div>
  )
}

export default function AdminTranslationCoveragePage() {
  const { t } = useTranslation()

  const query = useQuery({
    queryKey: ['admin-translation-coverage'],
    queryFn: () => authApi.getTranslationCoverage().then((r) => r.data as TranslationCoverageReport),
  })

  const report = query.data
  const missing = report?.missing ?? []

  const overallHealthy = useMemo(() => {
    if (!report) return false
    const catalog = report.service_catalog
    if (catalog.total <= 0) return missing.length === 0
    return (
      missing.length === 0 &&
      (catalog.translated.sq ?? 0) >= catalog.total &&
      (catalog.translated.en ?? 0) >= catalog.total
    )
  }, [report, missing.length])

  if (query.isLoading) {
    return (
      <div className="card p-12 flex justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-workshop-blue" />
      </div>
    )
  }

  if (query.error || !report) {
    return <div className="card p-8 text-red-700">{t('adminTranslationCoverage.loadFailed')}</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-workshop-charcoal">{t('adminTranslationCoverage.title')}</h2>
        <p className="text-workshop-charcoal/60 mt-1">{t('adminTranslationCoverage.subtitle')}</p>
      </div>

      <div
        className={`card p-4 flex items-start gap-3 border ${
          overallHealthy
            ? 'bg-emerald-50 border-emerald-200'
            : 'bg-amber-50 border-amber-200'
        }`}
      >
        {overallHealthy ? (
          <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
        ) : (
          <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
        )}
        <div>
          <p className="font-medium text-workshop-charcoal">
            {overallHealthy
              ? t('adminTranslationCoverage.statusHealthy')
              : t('adminTranslationCoverage.statusGaps')}
          </p>
          <p className="text-sm text-workshop-charcoal/70 mt-1">
            {t('adminTranslationCoverage.statusHint')}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AreaCard
          title={t('adminTranslationCoverage.serviceCatalog')}
          area={report.service_catalog}
        />
        <AreaCard
          title={t('adminTranslationCoverage.inspectionItems')}
          area={report.inspection_items}
          noteFallback={t('adminTranslationCoverage.inspectionNote')}
        />
      </div>

      <div className="card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Globe2 className="w-5 h-5 text-workshop-blue" />
          <h3 className="font-semibold text-workshop-charcoal">{t('adminTranslationCoverage.frontendLocales')}</h3>
        </div>
        <p className="text-sm text-workshop-charcoal/60">{t('adminTranslationCoverage.frontendHint')}</p>
        <div className="flex flex-wrap gap-2">
          {report.frontend_locales.map((locale) => (
            <span
              key={locale}
              className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-workshop-blue/10 text-workshop-blue"
            >
              {locale.toUpperCase()}
            </span>
          ))}
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
          <h3 className="font-semibold text-workshop-charcoal">{t('adminTranslationCoverage.missingTitle')}</h3>
          <span className="text-sm text-workshop-charcoal/60">
            {t('adminTranslationCoverage.missingCount', { count: missing.length })}
          </span>
        </div>
        {missing.length === 0 ? (
          <p className="px-4 sm:px-6 py-8 text-sm text-workshop-charcoal/60">{t('adminTranslationCoverage.noMissing')}</p>
        ) : (
          <AdminResponsiveTable
            desktop={
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase text-workshop-charcoal/60">
                  <tr>
                    <th className="px-6 py-3">{t('adminTranslationCoverage.colArea')}</th>
                    <th className="px-6 py-3">{t('adminTranslationCoverage.colLabel')}</th>
                    <th className="px-6 py-3">{t('adminTranslationCoverage.colId')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {missing.map((row) => (
                    <tr key={`${row.area}-${row.id}`}>
                      <td className="px-6 py-3 capitalize">{row.area.replace(/_/g, ' ')}</td>
                      <td className="px-6 py-3 font-medium text-workshop-charcoal break-words">{row.label}</td>
                      <td className="px-6 py-3 font-mono text-xs text-workshop-charcoal/60 break-all">{row.id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            }
            mobile={missing.map((row) => (
              <AdminMobileCard
                key={`${row.area}-${row.id}`}
                title={row.label}
                subtitle={row.area.replace(/_/g, ' ')}
              >
                <AdminField label={t('adminTranslationCoverage.colId')}>
                  <span className="font-mono text-xs break-all">{row.id}</span>
                </AdminField>
              </AdminMobileCard>
            ))}
          />
        )}
      </div>
    </div>
  )
}
