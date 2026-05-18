import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSelector } from 'react-redux'
import { inspectionsApi, visitsApi } from '@/api'
import { ArrowLeft, Loader2, CheckCircle, XCircle, AlertTriangle, Edit2 } from 'lucide-react'
import type { RootState } from '@/store'
import { canManageWorkshopData, normalizeRole } from '@/lib/roles'

function formatValue(value: unknown): { label: string; tone: string } {
  if (value === true || value === 'pass') {
    return { label: 'Pass', tone: 'text-green-700 bg-green-50 border-green-200' }
  }
  if (value === false || value === 'fail') {
    return { label: 'Fail', tone: 'text-red-700 bg-red-50 border-red-200' }
  }
  if (value === 'green') {
    return { label: 'Good', tone: 'text-green-700 bg-green-50 border-green-200' }
  }
  if (value === 'yellow') {
    return { label: 'Caution', tone: 'text-yellow-700 bg-yellow-50 border-yellow-200' }
  }
  if (value === 'red') {
    return { label: 'Critical', tone: 'text-red-700 bg-red-50 border-red-200' }
  }
  if (typeof value === 'number') {
    return { label: `${value}%`, tone: 'text-blue-700 bg-blue-50 border-blue-200' }
  }
  return { label: String(value ?? '—'), tone: 'text-gray-700 bg-gray-50 border-gray-200' }
}

export default function InspectionDetail() {
  const { t } = useTranslation()
  const { id } = useParams()
  const user = useSelector((state: RootState) => state.auth.user)
  const canManage = canManageWorkshopData(normalizeRole(user?.role))

  const { data: inspectionRes, isLoading } = useQuery({
    queryKey: ['inspection', id],
    queryFn: () => inspectionsApi.get(id!),
    enabled: !!id,
  })

  const inspection = inspectionRes?.data
  const visitId = inspection?.visit_id ?? inspection?.visit

  const { data: visitRes } = useQuery({
    queryKey: ['visit', visitId],
    queryFn: () => visitsApi.get(String(visitId)),
    enabled: !!visitId,
  })

  const visit = visitRes?.data
  const vehicle = visit?.vehicle

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-brand-primary" />
      </div>
    )
  }

  if (!inspection) {
    return (
      <div className="card p-6 text-center">
        <p className="text-workshop-charcoal/60">{t('common.notFound')}</p>
        <Link to="/inspections-list" className="btn btn-outline mt-4 inline-flex">
          {t('inspections.backToList')}
        </Link>
      </div>
    )
  }

  const sections = inspection.data && typeof inspection.data === 'object' ? inspection.data : {}

  return (
    <div className="space-y-6 pb-8">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            to={visitId ? `/visits/${visitId}` : '/inspections-list'}
            className="p-2 text-workshop-charcoal/40 hover:text-workshop-charcoal transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-workshop-charcoal">{t('inspections.detailTitle')}</h1>
            {vehicle && (
              <p className="text-sm text-workshop-charcoal/60 mt-0.5">
                {vehicle.make} {vehicle.model} · {vehicle.license_plate}
              </p>
            )}
            {inspection.performed_at && (
              <p className="text-xs text-workshop-charcoal/50 mt-1">
                {t('inspections.performedAt', {
                  date: new Date(inspection.performed_at).toLocaleString(),
                })}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          {visitId && (
            <Link to={`/visits/${visitId}`} className="btn btn-outline text-sm">
              {t('inspections.viewVisit')}
            </Link>
          )}
          {canManage && (
            <Link to={`/inspections/${id}/edit`} className="btn btn-primary text-sm flex items-center gap-1.5">
              <Edit2 className="w-4 h-4" />
              {t('common.edit')}
            </Link>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {Object.entries(sections).map(([sectionName, items]) => (
          <div key={sectionName} className="card p-5">
            <h2 className="text-lg font-semibold text-workshop-charcoal mb-4 capitalize">{sectionName}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {items && typeof items === 'object' && !Array.isArray(items)
                ? Object.entries(items as Record<string, unknown>).map(([itemName, value]) => {
                    const formatted = formatValue(value)
                    return (
                      <div
                        key={itemName}
                        className={`flex items-center justify-between p-3 rounded-lg border ${formatted.tone}`}
                      >
                        <span className="text-sm font-medium capitalize">{itemName.replace(/_/g, ' ')}</span>
                        <span className="text-sm font-semibold">{formatted.label}</span>
                      </div>
                    )
                  })
                : null}
            </div>
          </div>
        ))}
        {Object.keys(sections).length === 0 && (
          <div className="card p-6 text-center text-workshop-charcoal/60 text-sm">
            {t('inspections.noChecklistData')}
          </div>
        )}
      </div>
    </div>
  )
}
