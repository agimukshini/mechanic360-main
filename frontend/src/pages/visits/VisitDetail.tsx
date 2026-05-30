import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, Link } from 'react-router-dom'
import { visitsApi, inspectionsApi, api } from '@/api'
import {
  ArrowLeft,
  ClipboardList,
  Wrench,
  FileText,
  CheckCircle,
  XCircle,
  FileDown,
  Printer,
  Pencil,
  Loader2,
  X,
  Car,
  Gauge,
  Plus,
} from 'lucide-react'
import { PageTabs, SegmentTabs } from '@/components/ui/PageTabs'
import VisitStatusBadge from '@/components/ui/VisitStatusBadge'
import { WorkLineList, type WorkLineRow } from '@/components/visits/WorkLineList'
import { formatEuro, MULTIPLY } from '@/lib/money'
import { userDisplayName } from '@/lib/userDisplay'
import {
  fetchServiceReportBlob,
  downloadServiceReportBlob,
  friendlyReportFilename,
  createPdfObjectUrl,
  openServiceReportInNewTab,
  getServiceReportErrorMessage,
} from '@/lib/serviceReport'
import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import ServiceLineForm from './ServiceLineForm'
import LaborLineForm from './LaborLineForm'
import MaterialLineForm from './MaterialLineForm'
import { useTranslation } from 'react-i18next'
import { useApiToast } from '@/hooks/useApiToast'
import { useSelector } from 'react-redux'
import type { RootState } from '@/store'
import { canLogVisitWork, canManageWorkshopData, isMechanic, normalizeRole } from '@/lib/roles'
import { hasInspectionContent, pickInspectionForVisit } from '@/lib/inspection'
import { isAlreadyClosedVisitError, isVisitOpen, visitQueryOptions } from '@/lib/visits'
import MarketplaceBanner from '@/components/marketplace/MarketplaceBanner'

export default function VisitDetail() {
  const { t } = useTranslation()
  const { showError, showToast } = useApiToast()
  const { id } = useParams()
  const queryClient = useQueryClient()
  const user = useSelector((state: RootState) => state.auth.user)
  const role = normalizeRole(user?.role)
  const canManageVisit = canManageWorkshopData(role)
  const canLogWork = canLogVisitWork(role)
  const mechanicUser = isMechanic(role)
  const [showConfirmDialog, setShowConfirmDialog] = useState<string | null>(null)
  const [showServiceForm, setShowServiceForm] = useState(false)
  const [showLaborForm, setShowLaborForm] = useState(false)
  const [showMaterialForm, setShowMaterialForm] = useState(false)
  const [reportAction, setReportAction] = useState<'view' | 'download' | null>(null)
  const [reportPreviewUrl, setReportPreviewUrl] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'work' | 'inspection' | 'report'>('overview')
  const [workSegment, setWorkSegment] = useState<'services' | 'parts' | 'labor'>('services')

  const closeReportPreview = () => {
    setReportPreviewUrl((url) => {
      if (url) URL.revokeObjectURL(url)
      return null
    })
  }

  useEffect(() => () => closeReportPreview(), [])

  const { data: visitData, isLoading } = useQuery({
    queryKey: ['visit', id],
    queryFn: () => visitsApi.get(id!),
    ...visitQueryOptions(id),
  })

  const { data: inspectionData } = useQuery({
    queryKey: ['inspection', { visit: id }],
    queryFn: () => inspectionsApi.list({ visit: id }),
    enabled: !!id,
  })

  const { data: serviceLinesData } = useQuery({
    queryKey: ['service-lines', { visit: id }],
    queryFn: () => visitsApi.serviceLines.list({ visit: id }),
    enabled: !!id,
    staleTime: 0,
    refetchOnMount: 'always',
  })

  const { data: laborLinesData, refetch: refetchLaborLines } = useQuery({
    queryKey: ['labor-lines', { visit: id }],
    queryFn: () => visitsApi.laborLines.list({ visit: id }),
    enabled: !!id,
    staleTime: 0,
    refetchOnMount: 'always',
  })

  const { data: materialLinesData } = useQuery({
    queryKey: ['material-lines', { visit: id }],
    queryFn: () => visitsApi.materialLines.list({ visit: id }),
    enabled: !!id,
    staleTime: 0,
    refetchOnMount: 'always',
  })

  const finishVisitMutation = useMutation({
    mutationFn: async () => {
      const fresh = await visitsApi.get(id!)
      const current = fresh.data
      if (current?.status === 'completed' || current?.status === 'cancelled') {
        const err = new Error('Visit already closed') as Error & { code?: string }
        err.code = 'ALREADY_CLOSED'
        throw err
      }
      return visitsApi.finishVisit(id!, {
        mileage_km: current?.mileage_km,
        hour_meter: current?.hour_meter,
        notes: current?.notes,
      })
    },
    onSuccess: (response) => {
      queryClient.setQueryData(['visit', id], response)
      queryClient.invalidateQueries({ queryKey: ['visits'] })
      const vehicleId = response.data?.vehicle?.id ?? response.data?.vehicle_id
      if (vehicleId) {
        queryClient.invalidateQueries({ queryKey: ['vehicle', vehicleId] })
        queryClient.invalidateQueries({ queryKey: ['visits', { vehicle: vehicleId }] })
      }
      setShowConfirmDialog(null)
      if (response.data?.already_completed) {
        showToast(t('visits.alreadyCompleted'), 'info')
      }
    },
    onError: (error: unknown) => {
      setShowConfirmDialog(null)
      if (
        (error as { code?: string })?.code === 'ALREADY_CLOSED' ||
        isAlreadyClosedVisitError(error)
      ) {
        queryClient.invalidateQueries({ queryKey: ['visit', id] })
        showToast(t('visits.alreadyCompletedShort'), 'info')
        return
      }
      showError(error, t('visits.finishFailed'))
    },
  })

  const cancelVisitMutation = useMutation({
    mutationFn: () => visitsApi.cancelVisit(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visit', id] })
      setShowConfirmDialog(null)
    },
  })

  const deleteServiceLineMutation = useMutation({
    mutationFn: (lineId: string) => api.delete(`/visits/service-lines/${lineId}/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-lines', { visit: id }] })
    },
  })

  const deleteMaterialLineMutation = useMutation({
    mutationFn: (lineId: string) => api.delete(`/visits/material-lines/${lineId}/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['material-lines', { visit: id }] })
    },
  })

  const deleteLaborLineMutation = useMutation({
    mutationFn: (lineId: string) => api.delete(`/visits/labor-lines/${lineId}/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['labor-lines', { visit: id }] })
    },
  })

  if (isLoading) {
    return <div className="flex items-center justify-center h-64">{t('visits.loading')}</div>
  }

  const visit = visitData?.data
  if (!visit) return null

  const inspectionList = inspectionData?.data?.results || inspectionData?.data || []
  const inspectionRecord = pickInspectionForVisit(inspectionList, id!)
  const inspection = hasInspectionContent(inspectionRecord) ? inspectionRecord : undefined

  const canEdit = isVisitOpen(visit.status)
  const canFinish = canManageVisit && canEdit && !!inspection && (visit.mileage_km || 0) > 0
  const canCancel = canManageVisit && canEdit
  const canEditWork = canLogWork && canEdit
  const grandTotalFromApi = parseFloat(visit.grand_total || '0')
  const canExport = visit.status === 'completed'

  const serviceLines = serviceLinesData?.data?.results || serviceLinesData?.data || []
  const materialLines = materialLinesData?.data?.results || materialLinesData?.data || []
  const laborLines = laborLinesData?.data?.results || laborLinesData?.data || []

  const sumLines = (lines: { total_price?: string | number }[]) =>
    lines.reduce((s, line) => s + (parseFloat(String(line.total_price)) || 0), 0)

  const servicesTotal = sumLines(serviceLines)
  const materialsTotal = sumLines(materialLines)
  const laborTotal = sumLines(laborLines)
  const visitTotal = servicesTotal + materialsTotal + laborTotal

  const serviceRows: WorkLineRow[] = serviceLines.map((line: {
    id: string
    description: string
    quantity: number
    unit_price?: string | number
    total_price: string | number
    performed_by?: { first_name?: string; last_name?: string; username?: string }
  }) => ({
    id: line.id,
    label: line.description,
    sub: `${line.quantity} ${MULTIPLY} ${formatEuro(line.unit_price)}`,
    meta: line.performed_by
      ? `${t('visits.performedBy')}: ${userDisplayName(line.performed_by)}`
      : undefined,
    total: line.total_price,
  }))

  const materialRows: WorkLineRow[] = materialLines.map((line: {
    id: string
    inventory_item_detail?: { name: string }
    quantity: number
    unit_price?: string | number
    total_price: string | number
  }) => ({
    id: line.id,
    label: line.inventory_item_detail?.name || 'Part',
    sub: `${line.quantity} ${MULTIPLY} ${formatEuro(line.unit_price)}`,
    total: line.total_price,
  }))

  const laborRows: WorkLineRow[] = laborLines.map((line: {
    id: string
    description: string
    hours: number
    hourly_rate?: string | number
    total_price: string | number
    performed_by?: { first_name?: string; last_name?: string; username?: string }
  }) => ({
    id: line.id,
    label: line.description,
    sub: `${line.hours}h ${MULTIPLY} ${formatEuro(line.hourly_rate)}/hr`,
    meta: line.performed_by
      ? `${t('visits.performedBy')}: ${userDisplayName(line.performed_by)}`
      : undefined,
    total: line.total_price,
  }))

  const openAddForWorkSegment = () => {
    if (workSegment === 'services') setShowServiceForm(true)
    else if (workSegment === 'parts' && canManageVisit) setShowMaterialForm(true)
    else if (workSegment === 'labor') setShowLaborForm(true)
  }

  const lineOwnedByCurrentUser = (line: { performed_by?: { id?: string } }) =>
    !mechanicUser || line.performed_by?.id === user?.id

  const guardedDelete =
    (lines: { id: string; performed_by?: { id?: string } }[], mutate: (id: string) => void) =>
    (lineId: string) => {
      const line = lines.find((row) => row.id === lineId)
      if (line && lineOwnedByCurrentUser(line)) mutate(lineId)
    }

  const activeWorkRows =
    workSegment === 'services' ? serviceRows : workSegment === 'parts' ? materialRows : laborRows
  const activeWorkEmpty =
    workSegment === 'services'
      ? t('visits.noServicesYet')
      : workSegment === 'parts'
        ? t('visits.noPartsYet')
        : t('visits.noLaborYet')
  const activeWorkDelete =
    workSegment === 'services'
      ? guardedDelete(serviceLines, (lineId) => deleteServiceLineMutation.mutate(lineId))
      : workSegment === 'parts'
        ? (lineId: string) => deleteMaterialLineMutation.mutate(lineId)
        : guardedDelete(laborLines, (lineId) => deleteLaborLineMutation.mutate(lineId))
  const activeSegmentTotal =
    workSegment === 'services' ? servicesTotal : workSegment === 'parts' ? materialsTotal : laborTotal

  const runReport = async (mode: 'view' | 'download') => {
    if (!id) return
    setReportAction(mode)
    try {
      const blob = await fetchServiceReportBlob(id, mode === 'download' ? 'attachment' : 'inline')
      const filename = friendlyReportFilename(id, visit?.vehicle?.license_plate)

      if (mode === 'download') {
        downloadServiceReportBlob(blob, filename)
      } else {
        closeReportPreview()
        setReportPreviewUrl(createPdfObjectUrl(blob))
      }
    } catch (error) {
      showError(error, getServiceReportErrorMessage(error, t('visits.reportFailedView')))
    } finally {
      setReportAction(null)
    }
  }

  const openReportInNewTab = async () => {
    if (!id) return
    try {
      const blob = await fetchServiceReportBlob(id, 'inline')
      openServiceReportInNewTab(
        blob,
        `${t('visits.reportTitle')} \u2014 ${visit?.vehicle?.license_plate || id.slice(0, 8)}`,
      )
    } catch (error) {
      showError(error, getServiceReportErrorMessage(error, t('visits.reportFailedOpen')))
    }
  }

  const handlePrintSticker = async () => {
    try {
      const response = await api.get(`/visits/reports/door-sticker/${id}/`, {
        responseType: 'blob',
      })
      const url = window.URL.createObjectURL(
        new Blob([response.data], { type: 'application/pdf' }),
      )
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `door-sticker-${id}.pdf`)
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (error) {
      console.error('Failed to print sticker:', error)
      showError(error, t('visits.stickerFailed'))
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/visits" className="p-2 text-workshop-charcoal/40 hover:text-workshop-charcoal transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-workshop-charcoal">
              {t('visits.visitNumber', { id: id?.slice(0, 8) })}
            </h1>
            <p className="text-workshop-charcoal/60">
              {visit.vehicle?.license_plate} - {visit.vehicle?.make} {visit.vehicle?.model}
            </p>
          </div>
        </div>
        <VisitStatusBadge status={visit.status} />
      </div>

      <PageTabs
        active={activeTab}
        onChange={(id) => setActiveTab(id as typeof activeTab)}
        tabs={[
          { id: 'overview', label: t('visits.tabOverview'), icon: Gauge },
          {
            id: 'work',
            label: t('visits.tabWork'),
            icon: Wrench,
            badge: serviceLines.length + materialLines.length + laborLines.length || undefined,
          },
          { id: 'inspection', label: t('visits.tabInspection'), icon: ClipboardList },
          { id: 'report', label: t('visits.tabReport'), icon: FileText, hidden: !canExport },
        ]}
      />

      {activeTab === 'overview' && (
        <>
      {/* Status Transition Actions */}
      {canEdit && canManageVisit && (
        <div className="card p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold">{t('visits.openVisit')}</h2>
            <p className="text-sm text-workshop-charcoal/60 mt-1">
              {t('visits.openVisitHint')}
            </p>
          </div>
          <div className="flex gap-3 flex-wrap">
            <Link to={`/visits/${id}/edit`} className="btn btn-primary">
              <Pencil className="w-4 h-4 mr-2" />
              {t('visits.editVisit')}
            </Link>
            {canFinish && (
              <button
                onClick={() => setShowConfirmDialog('finish')}
                className="btn btn-success"
                disabled={finishVisitMutation.isPending}
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                {t('visits.finishVisit')}
              </button>
            )}
            {canCancel && (
              <button
                onClick={() => setShowConfirmDialog('cancel')}
                className="btn btn-outline btn-danger"
                disabled={cancelVisitMutation.isPending}
              >
                <XCircle className="w-4 h-4 mr-2" />
                {t('visits.cancelVisit')}
              </button>
            )}
          </div>
        </div>
      )}

      {canEdit && mechanicUser && (
        <div className="card p-6">
          <h2 className="font-semibold">{t('visits.mechanicWorkHintTitle')}</h2>
          <p className="text-sm text-workshop-charcoal/60 mt-1">{t('visits.mechanicWorkHint')}</p>
        </div>
      )}

      {/* Confirmation Dialog */}
      {showConfirmDialog && createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
          <div className="card p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">
              {showConfirmDialog === 'finish' && t('visits.confirmFinishTitle')}
              {showConfirmDialog === 'cancel' && t('visits.confirmCancelTitle')}
            </h3>
            <p className="text-workshop-charcoal/60 mb-6">
              {showConfirmDialog === 'finish' && t('visits.confirmFinishBody')}
              {showConfirmDialog === 'cancel' && t('visits.confirmCancelBody')}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowConfirmDialog(null)}
                className="btn btn-outline"
              >
                {t('visits.confirmNo')}
              </button>
              <button
                onClick={() => {
                  if (showConfirmDialog === 'finish') finishVisitMutation.mutate()
                  if (showConfirmDialog === 'cancel') cancelVisitMutation.mutate()
                }}
                className={`btn ${
                  showConfirmDialog === 'cancel' ? 'btn-danger' : 'btn-primary'
                }`}
              >
                {t('visits.confirmYes')}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Visit Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-4">
            <ClipboardList className="w-5 h-5 text-workshop-blue" />
            <h2 className="font-semibold">{t('visits.visitDetails')}</h2>
          </div>
          <div className="space-y-3 text-sm">
            <div>
              <span className="text-workshop-charcoal/40">{t('visits.date')}</span>
              <p>{new Date(visit.service_date).toLocaleString()}</p>
            </div>
            <div>
              <span className="text-workshop-charcoal/40">{t('visits.mileage')}</span>
              <p>{visit.mileage_km.toLocaleString()} km</p>
            </div>
            <div>
              <span className="text-workshop-charcoal/40">{t('visits.hourMeter')}</span>
              <p>{visit.hour_meter} {t('visits.hourMeterUnit')}</p>
            </div>
            {visit.notes && (
              <div>
                <span className="text-workshop-charcoal/40">{t('visits.notes')}</span>
                <p>{visit.notes}</p>
              </div>
            )}
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center gap-3 mb-4">
            <svg className="w-5 h-5 text-workshop-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            <h2 className="font-semibold">{t('visits.vehicle')}</h2>
          </div>
          <div className="space-y-3 text-sm">
            {(() => {
              const ownerName =
                visit.client?.name ||
                visit.client?.company_name ||
                visit.vehicle?.owner?.name ||
                visit.vehicle?.owner?.company_name ||
                ''
              const ownerPhone = visit.client?.phone || visit.vehicle?.owner?.phone || ''
              const ownerEmail = visit.client?.email || visit.vehicle?.owner?.email || ''
              return (
                <div>
                  <span className="text-workshop-charcoal/40">{t('visits.owner')}</span>
                  {ownerName ? (
                    <>
                      <p className="font-medium">{ownerName}</p>
                      {(ownerPhone || ownerEmail) && (
                        <p className="text-xs text-workshop-charcoal/60">
                          {[ownerPhone, ownerEmail].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-workshop-charcoal/60 italic">
                      {t('visits.noOwnerAssigned')}
                      {visit.vehicle?.id && (
                        <>
                          {' · '}
                          <a
                            href={`/vehicles/${visit.vehicle.id}`}
                            className="text-accent underline hover:no-underline"
                          >
                            {t('visits.assignOwner')}
                          </a>
                        </>
                      )}
                    </p>
                  )}
                </div>
              )
            })()}
            {visit.vehicle?.description && (
              <div>
                <span className="text-workshop-charcoal/40">{t('visits.notes')}</span>
                <p className="whitespace-pre-wrap">{visit.vehicle.description}</p>
              </div>
            )}
            <div>
              <span className="text-workshop-charcoal/40">{t('visits.vin')}</span>
              <p className="font-mono">{visit.vehicle?.vin || '—'}</p>
            </div>
          </div>
        </div>
      </div>
        </>
      )}

      {activeTab === 'work' && (
      <>
      {visit.vehicle?.id && (
        <MarketplaceBanner vehicleId={visit.vehicle.id} />
      )}

      <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
        <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
          <Car className="w-5 h-5 text-accent" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900 truncate">
            {visit.vehicle?.make} {visit.vehicle?.model}
          </p>
          {(() => {
            const ownerLabel =
              visit.client?.name ||
              visit.client?.company_name ||
              visit.vehicle?.owner?.name ||
              visit.vehicle?.owner?.company_name ||
              ''
            return (
              <p className="text-sm text-secondary truncate">
                {visit.vehicle?.license_plate}
                {ownerLabel ? ` \u00b7 ${ownerLabel}` : ''}
              </p>
            )
          })()}
        </div>
        <span className="text-xl font-bold text-accent tabular-nums shrink-0">
          {formatEuro(visitTotal)}
        </span>
      </div>

      <div className="card p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <SegmentTabs
            active={workSegment}
            onChange={(id) => setWorkSegment(id as typeof workSegment)}
            tabs={[
              { id: 'services', label: t('visits.tabServices'), badge: serviceLines.length || undefined },
              ...(canManageVisit
                ? [{ id: 'parts' as const, label: t('visits.tabParts'), badge: materialLines.length || undefined }]
                : []),
              { id: 'labor', label: t('visits.tabLabor'), badge: laborLines.length || undefined },
            ]}
          />
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-base font-semibold text-gray-900 tabular-nums">
              {formatEuro(activeSegmentTotal)}
            </span>
            {canEditWork && (workSegment !== 'parts' || canManageVisit) && (
              <button type="button" onClick={openAddForWorkSegment} className="btn btn-primary">
                <Plus className="w-4 h-4 mr-1" />
                {workSegment === 'services'
                  ? t('visits.addService')
                  : workSegment === 'parts'
                    ? t('visits.addPart')
                    : t('visits.addLabor')}
              </button>
            )}
          </div>
        </div>
        <WorkLineList
          empty={activeWorkEmpty}
          lines={activeWorkRows}
          isEditable={canEditWork}
          onDelete={activeWorkDelete}
          canDeleteLine={(lineId) => {
            if (workSegment === 'parts') return canManageVisit
            const lines = workSegment === 'services' ? serviceLines : laborLines
            const line = lines.find((row: { id: string }) => row.id === lineId)
            return line ? lineOwnedByCurrentUser(line) : false
          }}
        />
      </div>

      <div className="card p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">{t('visits.visitTotal')}</h2>
          <span className="text-2xl font-bold text-accent tabular-nums">{formatEuro(visitTotal)}</span>
        </div>
      </div>
      </>
      )}

      {activeTab === 'inspection' && (
      <>
      {!inspection ? (
        <div className="card p-6 text-center">
          <p className="text-secondary mb-4">{t('visits.noInspection')}</p>
          {canEditWork && (
            <Link to={`/visits/${id}/inspection/new`} className="btn btn-primary">
              {t('visits.startInspection')}
            </Link>
          )}
        </div>
      ) : (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <ClipboardList className="w-5 h-5 text-workshop-blue" />
              <h2 className="font-semibold">{t('visits.inspectionTitle')}</h2>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-workshop-charcoal/40">
                {inspection.performed_at
                  ? t('visits.inspectionPerformed', { date: new Date(inspection.performed_at).toLocaleString() })
                  : t('visits.inspectionOnFile')}
              </span>
              <Link
                to={`/inspections/${inspection.id}`}
                className="btn btn-outline btn-sm"
              >
                {t('visits.viewFull')}
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(inspection.data || {}).map(([section, result]: [string, any]) => (
              <div key={section} className="p-4 bg-workshop-charcoal/5 rounded-lg">
                <h3 className="text-sm font-semibold text-workshop-charcoal mb-2 capitalize">{section}</h3>
                <div className="space-y-1">
                  {Object.entries(result || {}).map(([item, value]: [string, any]) => (
                    <div key={item} className="flex items-center justify-between text-xs">
                      <span className="text-workshop-charcoal/60">{item}</span>
                      <span className={`px-2 py-0.5 rounded-full font-medium ${
                        value === 'pass' ? 'bg-green-100 text-green-700' :
                        value === 'fail' ? 'bg-red-100 text-red-700' :
                        value === 'green' ? 'bg-green-100 text-green-700' :
                        value === 'yellow' ? 'bg-yellow-100 text-yellow-700' :
                        value === 'red' ? 'bg-red-100 text-red-700' :
                        'bg-workshop-charcoal/10 text-workshop-charcoal'
                      }`}>
                        {typeof value === 'number' ? `${value}%` : value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      </>
      )}

      {activeTab === 'report' && canExport && (
        <div className="card p-6 space-y-3">
          <h2 className="font-semibold">{t('visits.serviceReport')}</h2>
          <p className="text-sm text-secondary">{t('visits.reportHint')}</p>
          <button type="button" onClick={() => runReport('view')} disabled={!!reportAction} className="btn btn-primary w-full">
            {reportAction === 'view' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
            {reportAction === 'view' ? t('visits.opening') : t('visits.viewReport')}
          </button>
          <button type="button" onClick={() => runReport('download')} disabled={!!reportAction} className="btn btn-outline w-full">
            {reportAction === 'download' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileDown className="w-4 h-4 mr-2" />}
            {reportAction === 'download' ? t('visits.preparing') : t('visits.downloadPdf')}
          </button>
          <button type="button" onClick={handlePrintSticker} className="btn btn-outline w-full">
            <Printer className="w-4 h-4 mr-2" />
            {t('visits.printDoorSticker')}
          </button>
        </div>
      )}

      {/* Line Item Forms */}
      <ServiceLineForm isOpen={showServiceForm} onClose={() => setShowServiceForm(false)} />
      <LaborLineForm isOpen={showLaborForm} onClose={() => setShowLaborForm(false)} />
      <MaterialLineForm
        isOpen={showMaterialForm}
        onClose={() => setShowMaterialForm(false)}
        visitId={id}
      />

      {reportPreviewUrl &&
        createPortal(
          <ReportPreviewModal
            url={reportPreviewUrl}
            plate={visit.vehicle?.license_plate}
            onClose={closeReportPreview}
            onOpenNewTab={openReportInNewTab}
            onDownload={() => runReport('download')}
          />,
          document.body,
        )}
    </div>
  )
}

function ReportPreviewModal({
  url,
  plate,
  onClose,
  onOpenNewTab,
  onDownload,
}: {
  url: string
  plate?: string
  onClose: () => void
  onOpenNewTab: () => void
  onDownload: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-workshop-charcoal/90">
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-workshop-charcoal text-white shrink-0">
        <div>
          <p className="font-semibold">{t('visits.reportTitle')}</p>
          {plate && <p className="text-sm text-white/70">{plate}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onDownload} className="btn btn-outline btn-sm text-white border-white/30 hover:bg-white/10">
            <FileDown className="w-4 h-4 mr-1" />
            {t('visits.reportDownload')}
          </button>
          <button type="button" onClick={onOpenNewTab} className="btn btn-outline btn-sm text-white border-white/30 hover:bg-white/10">
            {t('visits.reportNewTab')}
          </button>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-white/10" aria-label={t('visits.reportClose')}>
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
      <iframe
        src={url}
        title={t('visits.reportPreviewTitle')}
        className="flex-1 w-full min-h-0 bg-neutral-600 border-0"
      />
    </div>
  )
}
