import { useState, useRef, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSelector } from 'react-redux'
import { vehiclesApi, visitsApi, inspectionsApi, api } from '@/api'
import { useToast } from '@/components/ui/Toast'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import VehiclePhoto from '@/components/vehicles/VehiclePhoto'
import VehicleOwnerQrPanel from '@/components/vehicles/VehicleOwnerQrPanel'
import { VehiclePhotoGallery } from '@/components/vehicles/VehiclePhotoGallery'
import VehicleMaintenancePlans from '@/components/vehicles/VehicleMaintenancePlans'
import { unwrapList, getApiErrorMessage, resolveMediaUrl } from '@/lib/utils'
import { formatHourMeter, formatOdometer, type OdometerUnit } from '@/lib/odometer'
import { canManageVehicles, canManageWorkshopData, normalizeRole } from '@/lib/roles'
import type { RootState } from '@/store'
import { printQrCode } from '@/lib/printQr'
import {
  handleVehicleHistoryReport,
  fetchVehicleHistoryReportBlob,
  getVehicleHistoryErrorMessage,
  openVehicleHistoryInNewTab,
  type HistoryYearParam,
} from '@/lib/vehicleHistoryReport'
import {
  ArrowLeft,
  QrCode,
  Calendar,
  Gauge,
  Clock,
  Edit2,
  Printer,
  FileText,
  AlertTriangle,
  Car,
  User,
  Phone,
  Mail,
  Building,
  ChevronRight,
  Wrench,
  ClipboardList,
  Upload,
  Download,
  Trash2,
  Eye,
  Archive,
  RotateCcw,
} from 'lucide-react'

type VehicleConfirmAction = 'archive' | 'restore' | 'delete' | null

export default function VehicleDetail() {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const { id } = useParams()
  const navigate = useNavigate()
  const user = useSelector((state: RootState) => state.auth.user)
  const canManageVehiclesData = canManageVehicles(normalizeRole(user?.role))
  const canManage = canManageWorkshopData(normalizeRole(user?.role))
  const [activeTab, setActiveTab] = useState('overview')
  const [confirmAction, setConfirmAction] = useState<VehicleConfirmAction>(null)
  const [historyYear, setHistoryYear] = useState<HistoryYearParam>(new Date().getFullYear())
  const [historyAction, setHistoryAction] = useState<'view' | 'download' | null>(null)
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data: vehicleData, isLoading } = useQuery({
    queryKey: ['vehicle', id],
    queryFn: () => vehiclesApi.get(id!),
  })

  const { data: visitsData } = useQuery({
    queryKey: ['visits', { vehicle: id }],
    queryFn: () => visitsApi.list({ vehicle: id }),
  })

  // Fetch inspections for this vehicle
  const { data: inspectionsResponse, isLoading: inspectionsLoading } = useQuery({
    queryKey: ['inspections', { vehicle: id }],
    queryFn: () => inspectionsApi.list({ vehicle: id }),
    enabled: activeTab === 'inspections',
  })
  const inspectionsList = unwrapList(inspectionsResponse)

  // Fetch documents for this vehicle (using visits with attached files)
  const { data: documentsData, isLoading: docsLoading } = useQuery({
    queryKey: ['vehicle-documents', id],
    queryFn: async () => {
      const response = await vehiclesApi.documents.list(id!)
      return unwrapList(response)
    },
    enabled: activeTab === 'documents' && !!id,
  })

  const uploadDocMutation = useMutation({
    mutationFn: (file: File) => vehiclesApi.documents.upload(id!, file, file.name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicle-documents', id] })
      showToast(t('vehicles.detail.documentUploadedToast'), 'success')
    },
    onError: (error: unknown) => {
      showToast(getApiErrorMessage(error, t('vehicles.detail.uploadFailed')), 'error')
    },
  })

  const deleteDocMutation = useMutation({
    mutationFn: (docId: string) => vehiclesApi.documents.delete(docId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicle-documents', id] })
      showToast(t('vehicles.detail.documentDeletedToast'), 'success')
    },
    onError: (error: unknown) => {
      showToast(getApiErrorMessage(error, t('vehicles.detail.deleteFailed')), 'error')
    },
  })

  const archiveMutation = useMutation({
    mutationFn: () => vehiclesApi.patch(id!, { is_active: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicle', id] })
      queryClient.invalidateQueries({ queryKey: ['vehicles'] })
      setConfirmAction(null)
      showToast(t('vehicles.archivedSuccess'), 'success')
    },
    onError: (error: unknown) => {
      showToast(getApiErrorMessage(error, t('vehicles.detail.archiveFailed')), 'error')
    },
  })

  const restoreMutation = useMutation({
    mutationFn: () => vehiclesApi.patch(id!, { is_active: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicle', id] })
      queryClient.invalidateQueries({ queryKey: ['vehicles'] })
      setConfirmAction(null)
      showToast(t('vehicles.restoredSuccess'), 'success')
    },
    onError: (error: unknown) => {
      showToast(getApiErrorMessage(error, t('vehicles.detail.restoreFailed')), 'error')
    },
  })

  const deleteVehicleMutation = useMutation({
    mutationFn: () => vehiclesApi.delete(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] })
      setConfirmAction(null)
      showToast(t('vehicles.deletedSuccess'), 'success')
      navigate('/vehicles')
    },
    onError: (error: unknown) => {
      const msg = getApiErrorMessage(error, t('vehicles.detail.deleteVehicleFailed'))
      showToast(
        msg.toLowerCase().includes('visit') ? t('vehicles.deleteBlocked') : msg,
        'error',
      )
    },
  })

  const handleUploadDocument = () => {
    fileInputRef.current?.click()
  }

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      uploadDocMutation.mutate(file)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const [docToDelete, setDocToDelete] = useState<string | null>(null)

  const handleDeleteDocument = (docId: string) => {
    setDocToDelete(docId)
  }

  const confirmPending =
    archiveMutation.isPending || restoreMutation.isPending || deleteVehicleMutation.isPending

  const historyYearOptions = useMemo(() => {
    const y = new Date().getFullYear()
    return ['all', y, y - 1, y - 2, y - 3, y - 4] as HistoryYearParam[]
  }, [])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-brand-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const vehicle = vehicleData?.data
  if (!vehicle) return null

  const odometerUnit = (vehicle.odometer_unit === 'mi' ? 'mi' : 'km') as OdometerUnit
  const odometerLabel = formatOdometer(vehicle.odometer_km, odometerUnit)
  const hourMeterLabel = formatHourMeter(vehicle.hour_meter)

  const visits = visitsData?.data?.results || visitsData?.data || []

  const handlePrintQR = async () => {
    try {
      const response = await vehiclesApi.ownerClaimQr(id!)
      printQrCode({
        qrCodeData: response.data.qr_code,
        title: t('vehicles.detail.qrPrintTitle'),
        lines: [
          `${vehicle.make} ${vehicle.model}`,
          t('vehicles.detail.qrPrintPlate', { plate: vehicle.license_plate }),
          t('vehicles.detail.qrPrintScan'),
        ],
      })
    } catch (error) {
      showToast(getApiErrorMessage(error, t('vehicles.detail.qrCodeFailed')), 'error')
    }
  }

  const handlePrintSticker = async () => {
    if (!id) return
    try {
      const response = await vehiclesApi.doorStickerPdf(id, 'attachment')
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      const plate = (vehicle?.license_plate || 'vehicle').replace(/\s+/g, '')
      link.setAttribute('download', `door-sticker-${plate}.pdf`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      showToast(getApiErrorMessage(error, t('vehicles.detail.doorStickerFailed')), 'error')
    }
  }

  const handlePreviewSticker = async () => {
    if (!id) return
    try {
      const response = await vehiclesApi.doorStickerPdf(id, 'inline')
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }))
      window.open(url, '_blank', 'noopener')
      setTimeout(() => window.URL.revokeObjectURL(url), 30_000)
    } catch (error) {
      showToast(getApiErrorMessage(error, t('vehicles.detail.doorStickerOpenFailed')), 'error')
    }
  }

  const runHistoryReport = async (mode: 'view' | 'download') => {
    if (!id || !vehicle) return
    setHistoryAction(mode)
    try {
      if (mode === 'download') {
        await handleVehicleHistoryReport(id, historyYear, 'download', {
          licensePlate: vehicle.license_plate,
        })
        showToast(t('vehicles.historyReport'), 'success')
      } else {
        const blob = await fetchVehicleHistoryReportBlob(id, historyYear, 'inline')
        openVehicleHistoryInNewTab(
          blob,
          `${t('vehicles.historyReport')} — ${vehicle.license_plate}`,
        )
      }
    } catch (error) {
      showToast(getVehicleHistoryErrorMessage(error, t('vehicles.historyFailed')), 'error')
    } finally {
      setHistoryAction(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Back Navigation */}
      <div className="flex items-center gap-2">
        <Link to="/vehicles" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </Link>
        <div>
          <h1 className="text-base font-semibold text-gray-900">{t('vehicles.detail.profile')}</h1>
          <p className="text-xs text-gray-500">{vehicle.license_plate} • {vehicle.make} {vehicle.model}</p>
        </div>
      </div>

      {/* Hero Card */}
      <div className="bg-gradient-to-r from-gray-900 via-gray-800 to-blue-900 rounded-xl p-4 text-white overflow-hidden">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3 min-w-0">
            {vehicle.photo ? (
              <VehiclePhoto
                src={vehicle.photo}
                alt={`${vehicle.make} ${vehicle.model}`}
                variant="hero"
              />
            ) : (
              <div className="w-12 h-12 bg-white/10 rounded-lg flex items-center justify-center flex-shrink-0">
                <Car className="w-7 h-7 text-white" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold truncate max-w-full">{vehicle.make} {vehicle.model}</h2>
                <span className="px-2 py-0.5 bg-white/20 rounded text-[10px] font-medium whitespace-nowrap">
                  {vehicle.license_plate}
                </span>
                {vehicle.is_active === false && (
                  <span className="px-2 py-0.5 bg-amber-500/30 border border-amber-400/50 rounded text-[10px] font-medium text-amber-100 whitespace-nowrap">
                    {t('vehicles.archived')}
                  </span>
                )}
                {visits.some((v: any) => v.status === 'in_progress') && (
                  <span className="px-2 py-0.5 bg-blue-500/30 border border-blue-400/50 rounded text-[10px] font-medium text-blue-100 whitespace-nowrap">
                    {t('vehicles.detail.inServiceLabel')}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-gray-300">
                <span className="flex items-center gap-1 min-w-0">
                  <Gauge className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{t('vehicles.detail.vinPrefix')}: {vehicle.vin?.substring(0, 12)}…</span>
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 shrink-0" />
                  {t('vehicles.detail.yearPrefix')}: {vehicle.year}
                </span>
                {vehicle.odometer_km != null && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 shrink-0" />
                    {odometerLabel}
                  </span>
                )}
                {vehicle.hour_meter != null && (
                  <span className="flex items-center gap-1">
                    <Gauge className="w-3.5 h-3.5 shrink-0" />
                    {hourMeterLabel}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end shrink-0">
            {canManageVehiclesData && (
              <Link
                to={`/vehicles/${id}/edit`}
                className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white font-medium rounded-lg transition-colors flex items-center gap-1.5 text-sm"
              >
                <Edit2 className="w-4 h-4" />
                {t('common.edit')}
              </Link>
            )}
            {canManage && (
              <>
                {vehicle.is_active !== false ? (
                  <button
                    type="button"
                    onClick={() => setConfirmAction('archive')}
                    className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white font-medium rounded-lg transition-colors flex items-center gap-1.5 text-sm"
                  >
                    <Archive className="w-4 h-4" />
                    {t('vehicles.archive')}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmAction('restore')}
                    className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white font-medium rounded-lg transition-colors flex items-center gap-1.5 text-sm"
                  >
                    <RotateCcw className="w-4 h-4" />
                    {t('vehicles.restore')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setConfirmAction('delete')}
                  className="px-3 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-100 font-medium rounded-lg transition-colors flex items-center gap-1.5 text-sm"
                >
                  <Trash2 className="w-4 h-4" />
                  {t('common.delete')}
                </button>
              </>
            )}
            <button
              onClick={handlePrintQR}
              className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white font-medium rounded-lg transition-colors flex items-center gap-1.5 text-sm"
            >
              <QrCode className="w-4 h-4" />
              {t('vehicles.detail.showOwnerQr')}
            </button>
            {vehicle.is_active !== false && canManage && (
              <Link
                to={`/visits/new?vehicleId=${id}`}
                className="px-3 py-2 bg-brand-primary hover:bg-brand-primary-dark text-white font-medium rounded-lg transition-colors flex items-center gap-1.5 text-sm shadow-lg shadow-blue-500/30"
              >
                <ClipboardList className="w-4 h-4" />
                {t('vehicles.detail.startVisit')}
              </Link>
            )}
          </div>
        </div>
      </div>

      {vehicle.photo && (
        <div className="card overflow-hidden">
          <VehiclePhoto
            src={vehicle.photo}
            alt={`${vehicle.make} ${vehicle.model}`}
            variant="card"
          />
        </div>
      )}

      {vehicle.is_active === false && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t('vehicles.archivedViewHint')}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6 overflow-x-auto">
          {[
            { id: 'overview', label: t('vehicles.detail.tabOverview') },
            { id: 'history', label: t('vehicles.detail.tabHistory') },
            { id: 'inspections', label: t('vehicles.detail.tabInspections') },
            { id: 'documents', label: t('vehicles.detail.tabDocuments') },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-brand-primary text-brand-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-4">
          {/* Overview Tab Content */}
          {activeTab === 'overview' && (
            <>
          {/* Service Alert */}
          {visits.some((v: any) => v.status === 'in_progress') && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3.5">
              <div className="flex items-start gap-2.5">
                <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-amber-900 text-sm">{t('vehicles.detail.alertInService')}</h3>
                  <p className="text-xs text-amber-800 mt-0.5">
                    {t('vehicles.detail.alertInServiceBody')}
                  </p>
                  <Link
                    to={`/visits/${visits.find((v: any) => v.status === 'in_progress')?.id}/edit`}
                    className="mt-2 inline-block px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium rounded-lg transition-colors"
                  >
                    {t('vehicles.detail.viewActiveVisit')}
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Vehicle Specifications */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-gray-900">{t('vehicles.detail.specifications')}</h3>
              {canManageVehiclesData && (
              <Link to={`/vehicles/${id}/edit`} className="text-brand-primary hover:text-brand-primary-dark text-xs font-medium flex items-center gap-1">
                <Edit2 className="w-3.5 h-3.5" />
                {t('vehicles.detail.edit')}
              </Link>
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: t('vehicles.detail.specEngine'), value: vehicle.engine_type || t('vehicles.detail.notAvailable') },
                { label: t('vehicles.detail.specFuel'), value: vehicle.fuel_type || t('vehicles.detail.notAvailable') },
                { label: t('vehicles.odometer'), value: odometerLabel },
                { label: t('vehicles.hourMeter'), value: hourMeterLabel },
                {
                  label: t('vehicles.assignedMechanic'),
                  value: vehicle.assigned_mechanic
                    ? [vehicle.assigned_mechanic.first_name, vehicle.assigned_mechanic.last_name]
                        .filter(Boolean)
                        .join(' ') || vehicle.assigned_mechanic.username
                    : t('vehicles.unassignedMechanic'),
                },
              ].map((spec) => (
                <div key={spec.label}>
                  <p className="text-xs text-gray-500">{spec.label}</p>
                  <p className="font-medium text-gray-900 mt-0.5">{spec.value}</p>
                </div>
              ))}
            </div>
          </div>

          {vehicle.description?.trim() && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <h3 className="text-base font-semibold text-gray-900 mb-2">{t('vehicles.description')}</h3>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{vehicle.description}</p>
            </div>
          )}

          <VehicleOwnerQrPanel
            vehicleId={id!}
            globalVehicleId={vehicle.global_vehicle_id}
            licensePlate={vehicle.license_plate}
            make={vehicle.make}
            model={vehicle.model}
            vin={vehicle.vin}
            globalCurrentOwner={vehicle.global_current_owner}
            registrationHistory={vehicle.registration_history}
          />

          <VehiclePhotoGallery
            vehicleId={id!}
            canEdit={canManageVehicles(normalizeRole(user?.role))}
          />

          <VehicleMaintenancePlans vehicleId={id!} canEdit={canManage} />

          {/* Recent Visits */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-gray-900">{t('vehicles.detail.recentVisits')}</h3>
              <Link to="/visits" className="text-brand-primary hover:text-brand-primary-dark text-xs font-medium flex items-center gap-1">
                {t('vehicles.detail.viewAll')}
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="space-y-2">
              {visits.length > 0 ? (
                visits.slice(0, 5).map((visit: any) => (
                  <Link
                    key={visit.id}
                    to={
                      visit.status === 'draft' || visit.status === 'in_progress'
                        ? `/visits/${visit.id}/edit`
                        : `/visits/${visit.id}`
                    }
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors group"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-sm">
                        <Wrench className="w-4 h-4 text-gray-400" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 text-sm">
                          {visit.line_summary || t('vehicles.detail.serviceVisitFallback')}
                        </p>
                        <p className="text-xs text-gray-500">
                          {new Date(visit.service_date).toLocaleDateString()} • {visit.mileage_km?.toLocaleString() || 0} km
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${
                        visit.status === 'completed' ? 'bg-green-50 text-green-700 border-green-200' :
                        visit.status === 'in_progress' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' :
                        visit.status === 'draft' ? 'bg-gray-50 text-gray-700 border-gray-200' :
                        'bg-red-50 text-red-700 border-red-200'
                      }`}>
                        {visit.status === 'in_progress'
                          ? t('vehicles.detail.visitStatusInProgress')
                          : visit.status === 'completed'
                            ? t('vehicles.detail.visitStatusCompleted')
                            : visit.status === 'draft'
                              ? t('vehicles.detail.visitStatusDraft')
                              : t('vehicles.detail.visitStatusCancelled')}
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-gray-400 group-hover:text-gray-600" />
                    </div>
                  </Link>
                ))
              ) : (
                <div className="text-center py-6 text-gray-500 text-sm">
                  {t('vehicles.detail.noHistoryYet')}
                </div>
              )}
            </div>
          </div>
            </>
          )}

          {activeTab === 'history' && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <h3 className="text-base font-semibold text-gray-900 mb-3">{t('vehicles.detail.completeHistory')}</h3>
              {visits.length > 0 ? (
                <div className="space-y-2">
                  {visits.map((visit: any) => (
                    <Link
                      key={visit.id}
                      to={
                        visit.status === 'draft' || visit.status === 'in_progress'
                          ? `/visits/${visit.id}/edit`
                          : `/visits/${visit.id}`
                      }
                      className="flex items-center justify-between border border-gray-200 rounded-lg p-3 hover:bg-gray-50 hover:border-gray-300 transition-colors group"
                    >
                      <div>
                        <p className="font-medium text-gray-900 text-sm">{visit.line_summary || t('vehicles.detail.serviceVisitFallback')}</p>
                        <p className="text-xs text-gray-500">
                          {new Date(visit.service_date).toLocaleDateString()} •{' '}
                          {visit.mileage_km?.toLocaleString() ?? 0} km
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                          visit.status === 'completed' ? 'bg-green-50 text-green-700' :
                          visit.status === 'in_progress' ? 'bg-yellow-50 text-yellow-700' :
                          visit.status === 'draft' ? 'bg-gray-50 text-gray-700' :
                          'bg-red-50 text-red-700'
                        }`}>
                          {visit.status === 'in_progress'
                            ? t('vehicles.detail.visitStatusInProgress')
                            : visit.status === 'completed'
                              ? t('vehicles.detail.visitStatusCompleted')
                              : visit.status === 'draft'
                                ? t('vehicles.detail.visitStatusDraft')
                                : t('vehicles.detail.visitStatusCancelled')}
                        </span>
                        <ChevronRight className="w-3.5 h-3.5 text-gray-400 group-hover:text-gray-600" />
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-6 text-sm">{t('vehicles.detail.noVisitHistory')}</p>
              )}
            </div>
          )}

          {/* Inspections Tab Content */}
          {activeTab === 'inspections' && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <h3 className="text-base font-semibold text-gray-900 mb-3">{t('vehicles.detail.inspectionReports')}</h3>
              {inspectionsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : inspectionsList.length > 0 ? (
                <div className="space-y-3">
                  {inspectionsList.map((inspection: any) => (
                    <div key={inspection.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="font-medium text-gray-900 text-sm">
                            {inspection.vehicle_label || t('vehicles.detail.inspectionFallbackName')}
                          </p>
                          <p className="text-xs text-gray-500">
                            {new Date(inspection.performed_at).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </p>
                        </div>
                        <span className="px-2 py-0.5 text-xs font-medium bg-blue-50 text-blue-700 rounded-full">
                          {t('vehicles.detail.sectionsLabel', { count: Object.keys(inspection.data || {}).length })}
                        </span>
                      </div>
                      {/* Inspection summary */}
                      {inspection.data && (
                        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {Object.entries(inspection.data).map(([section, items]: [string, any]) => {
                            const passCount = Array.isArray(items)
                              ? items.filter((item: any) => item.status === 'pass' || item.rating === 'good').length
                              : 0
                            const totalCount = Array.isArray(items) ? items.length : 0
                            const hasIssues = totalCount > 0 && passCount < totalCount
                            return (
                              <div key={section} className="flex items-center gap-1.5 text-xs">
                                <div className={`w-2 h-2 rounded-full ${hasIssues ? 'bg-amber-500' : 'bg-green-500'}`} />
                                <span className="text-gray-600 capitalize">{section.replace(/_/g, ' ')}</span>
                                {totalCount > 0 && (
                                  <span className="text-gray-400 ml-auto">{passCount}/{totalCount}</span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                      <div className="mt-3 flex items-center gap-3">
                        <Link
                          to={`/inspections/${inspection.id}`}
                          className="text-xs text-brand-primary hover:underline font-medium flex items-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          {t('inspections.viewDetails')}
                        </Link>
                        {canManage && (
                          <Link
                            to={`/inspections/${inspection.id}/edit`}
                            className="text-xs text-gray-600 hover:underline font-medium flex items-center gap-1"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            {t('common.edit')}
                          </Link>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <ClipboardList className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500 text-sm">{t('vehicles.detail.noInspections')}</p>
                  <p className="text-gray-400 text-xs mt-1">{t('vehicles.detail.inspectionsHint')}</p>
                </div>
              )}
            </div>
          )}

          {/* Documents Tab Content */}
          {activeTab === 'documents' && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-semibold text-gray-900">{t('vehicles.detail.documents')}</h3>
                <button
                  onClick={handleUploadDocument}
                  disabled={uploadDocMutation.isPending}
                  className="px-3 py-1.5 bg-brand-primary hover:bg-brand-primary-dark text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {t('vehicles.detail.uploadAction')}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                  onChange={handleFileSelected}
                  className="hidden"
                />
              </div>
              {docsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : documentsData && documentsData.length > 0 ? (
                <div className="space-y-2">
                  {documentsData.map((doc: any) => (
                    <div key={doc.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm">
                          <FileText className="w-5 h-5 text-brand-primary" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 text-sm">{doc.name || doc.filename}</p>
                          <p className="text-xs text-gray-500">
                            {new Date(doc.uploaded_at).toLocaleDateString()} • {doc.size ? `${(doc.size / 1024).toFixed(1)} KB` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <a
                          href={doc.file_url || doc.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 text-gray-400 hover:text-brand-primary transition-colors"
                          title={t('vehicles.detail.viewTitle')}
                        >
                          <Eye className="w-4 h-4" />
                        </a>
                        <a
                          href={doc.file_url || doc.url}
                          download
                          className="p-2 text-gray-400 hover:text-green-600 transition-colors"
                          title={t('vehicles.detail.downloadTitle')}
                        >
                          <Download className="w-4 h-4" />
                        </a>
                        <button
                          onClick={() => handleDeleteDocument(doc.id)}
                          disabled={deleteDocMutation.isPending}
                          className="p-2 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50"
                          title={t('vehicles.detail.deleteTitle')}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <FileText className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500 text-sm">{t('vehicles.detail.noDocuments')}</p>
                  <p className="text-gray-400 text-xs mt-1">{t('vehicles.detail.documentsHint')}</p>
                </div>
              )}
              {uploadDocMutation.isError && (
                <p className="mt-2 text-xs text-red-600">{t('vehicles.detail.uploadFailedRetry')}</p>
              )}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Owner Information */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <h3 className="text-base font-semibold text-gray-900 mb-3">{t('vehicles.detail.ownerInformation')}</h3>
            {!vehicle.owner ? (
              <p className="text-sm text-gray-500">
                {t('vehicles.detail.ownerNotLinked')}
              </p>
            ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <Building className="w-4 h-4 text-brand-primary" />
                </div>
                <div>
                  <p className="font-medium text-gray-900 text-sm">
                    {vehicle.owner?.company_name || vehicle.owner?.name || t('vehicles.detail.notAvailable')}
                  </p>
                  <p className="text-xs text-gray-500">
                    {vehicle.owner?.type === 'company' ? t('vehicles.detail.ownerCorporate') : t('vehicles.detail.ownerPrivate')}
                  </p>
                </div>
              </div>

              <div className="pt-3 border-t border-gray-100 space-y-2.5">
                <div className="flex items-center gap-2.5 text-sm">
                  <User className="w-3.5 h-3.5 text-gray-400" />
                  <div>
                    <p className="text-[10px] text-gray-500">{t('vehicles.detail.primaryContact')}</p>
                    <p className="font-medium text-gray-900 text-sm">{vehicle.owner?.name || t('vehicles.detail.notAvailable')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 text-sm">
                  <Phone className="w-3.5 h-3.5 text-gray-400" />
                  <div>
                    <p className="text-[10px] text-gray-500">{t('vehicles.detail.phone')}</p>
                    {vehicle.owner?.phone ? (
                      <a href={`tel:${vehicle.owner.phone}`} className="font-medium text-brand-primary hover:underline text-sm">
                        {vehicle.owner.phone}
                      </a>
                    ) : (
                      <p className="font-medium text-gray-900 text-sm">{t('vehicles.detail.notAvailable')}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2.5 text-sm">
                  <Mail className="w-3.5 h-3.5 text-gray-400" />
                  <div>
                    <p className="text-[10px] text-gray-500">{t('vehicles.detail.email')}</p>
                    {vehicle.owner?.email ? (
                      <a href={`mailto:${vehicle.owner.email}`} className="font-medium text-brand-primary hover:underline text-sm">
                        {vehicle.owner.email}
                      </a>
                    ) : (
                      <p className="font-medium text-gray-900 text-sm">{t('vehicles.detail.notAvailable')}</p>
                    )}
                  </div>
                </div>
              </div>

              <Link to={`/clients/${vehicle.owner.id}`} className="w-full py-2 bg-gray-50 hover:bg-gray-100 text-gray-700 font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5 text-sm">
                <User className="w-3.5 h-3.5" />
                {t('vehicles.detail.viewClientProfile')}
              </Link>
            </div>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <h3 className="text-base font-semibold text-gray-900 mb-1">{t('vehicles.historyReport')}</h3>
            <p className="text-xs text-gray-500 mb-3">{t('vehicles.historyReportHint')}</p>
            <label className="block text-xs font-medium text-gray-600 mb-1">{t('vehicles.historyYear')}</label>
            <select
              value={String(historyYear)}
              onChange={(e) => {
                const v = e.target.value
                setHistoryYear(v === 'all' ? 'all' : Number(v))
              }}
              className="input w-full text-sm mb-3"
            >
              {historyYearOptions.map((y) => (
                <option key={String(y)} value={String(y)}>
                  {y === 'all' ? t('vehicles.historyAllYears') : y}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => runHistoryReport('view')}
                disabled={!!historyAction}
                className="btn btn-outline flex-1 text-sm py-2"
              >
                {historyAction === 'view' ? t('vehicles.historyPreparing') : t('vehicles.historyView')}
              </button>
              <button
                type="button"
                onClick={() => runHistoryReport('download')}
                disabled={!!historyAction}
                className="btn btn-primary flex-1 text-sm py-2"
              >
                <Download className="w-3.5 h-3.5 mr-1.5 inline" />
                {historyAction === 'download' ? t('vehicles.historyPreparing') : t('vehicles.historyDownload')}
              </button>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <h3 className="text-base font-semibold text-gray-900 mb-3">{t('vehicles.detail.quickActions')}</h3>
            <div className="grid grid-cols-2 gap-2">
              {canManage && (
                <button
                  onClick={() => navigate(`/visits/new?vehicleId=${id}`)}
                  className="p-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors flex flex-col items-center gap-1.5"
                >
                  <FileText className="w-4 h-4 text-gray-600" />
                  <span className="text-[11px] font-medium text-gray-700">{t('vehicles.detail.newVisit')}</span>
                </button>
              )}
              <button
                onClick={() => {
                  const openVisit = visits.find(
                    (v: { status: string }) => v.status === 'draft' || v.status === 'in_progress',
                  )
                  if (openVisit) {
                    navigate(`/visits/${openVisit.id}/inspection/new`)
                  } else {
                    showToast(t('vehicles.detail.noOpenVisitToast'), 'info')
                  }
                }}
                className="p-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors flex flex-col items-center gap-1.5"
              >
                <ClipboardList className="w-4 h-4 text-gray-600" />
                <span className="text-[11px] font-medium text-gray-700">{t('vehicles.detail.inspection')}</span>
              </button>
              <button
                onClick={handlePrintSticker}
                title={t('vehicles.detail.doorStickerTooltip')}
                className="p-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors flex flex-col items-center gap-1.5"
              >
                <Printer className="w-4 h-4 text-gray-600" />
                <span className="text-[11px] font-medium text-gray-700">{t('vehicles.detail.doorSticker')}</span>
              </button>
              <button
                onClick={handlePreviewSticker}
                title={t('vehicles.detail.previewQrTooltip')}
                className="p-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors flex flex-col items-center gap-1.5"
              >
                <QrCode className="w-4 h-4 text-gray-600" />
                <span className="text-[11px] font-medium text-gray-700">{t('vehicles.detail.previewQr')}</span>
              </button>
              <button
                type="button"
                onClick={() => runHistoryReport('download')}
                disabled={!!historyAction}
                className="p-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors flex flex-col items-center gap-1.5 disabled:opacity-50"
              >
                <FileText className="w-4 h-4 text-gray-600" />
                <span className="text-[11px] font-medium text-gray-700">{t('vehicles.historyReport')}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmAction === 'archive'}
        title={t('vehicles.archiveTitle')}
        message={t('vehicles.archiveMessage')}
        confirmLabel={t('vehicles.archive')}
        cancelLabel={t('common.cancel')}
        loading={confirmPending}
        onConfirm={() => archiveMutation.mutate()}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmDialog
        open={confirmAction === 'restore'}
        title={t('vehicles.restoreTitle')}
        message={t('vehicles.restoreMessage')}
        confirmLabel={t('vehicles.restore')}
        cancelLabel={t('common.cancel')}
        loading={confirmPending}
        onConfirm={() => restoreMutation.mutate()}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmDialog
        open={confirmAction === 'delete'}
        title={t('vehicles.deleteTitle')}
        message={t('vehicles.deleteMessage')}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        variant="danger"
        loading={confirmPending}
        onConfirm={() => deleteVehicleMutation.mutate()}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmDialog
        open={Boolean(docToDelete)}
        title={t('common.delete')}
        message={t('vehicles.detail.deleteDocumentMessage')}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        variant="danger"
        loading={deleteDocMutation.isPending}
        onConfirm={() => {
          if (docToDelete) deleteDocMutation.mutate(docToDelete)
          setDocToDelete(null)
        }}
        onCancel={() => setDocToDelete(null)}
      />
    </div>
  )
}
