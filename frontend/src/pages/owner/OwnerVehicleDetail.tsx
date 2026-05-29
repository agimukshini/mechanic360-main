import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Car,
  Calendar,
  Download,
  FileText,
  Loader2,
  Printer,
  QrCode,
  Wrench,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ownerApi, ownerPhotosApi } from '@/api'
import { getApiErrorMessage } from '@/lib/utils'
import OwnerLayout from '@/components/layout/OwnerLayout'

interface OwnerVehicle {
  id: string
  license_plate: string
  make: string
  model: string
  year: number
  vin: string
  odometer_km: number
}

interface AggregatedVisit {
  visit_id: string
  tenant_schema: string
  tenant_name: string
  service_date: string
  mileage_km: number | null
  hour_meter: number | null
  notes: string
  service_total: number
  material_total: number
  labor_total: number
  grand_total: number
}

function formatMoney(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

async function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => window.URL.revokeObjectURL(url), 30_000)
}

export default function OwnerVehicleDetail() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const [vehicle, setVehicle] = useState<OwnerVehicle | null>(null)
  const [visits, setVisits] = useState<AggregatedVisit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [downloadAction, setDownloadAction] = useState<
    null | 'sticker' | 'booklet' | 'preview'
  >(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    Promise.all([ownerApi.getVehicle(id), ownerApi.serviceHistory(id)])
      .then(([vRes, hRes]) => {
        setVehicle(vRes.data)
        setVisits(hRes.data.visits || [])
      })
      .catch((err) => setError(getApiErrorMessage(err, t('ownerVehicleDetail.loadFailed'))))
      .finally(() => setLoading(false))
  }, [id, t])

  const grandTotal = visits.reduce((acc, v) => acc + (v.grand_total || 0), 0)
  const plateSlug = (vehicle?.license_plate || 'vehicle').replace(/\s+/g, '')

  const handleDownloadSticker = async () => {
    if (!id) return
    setDownloadAction('sticker')
    try {
      const res = await ownerApi.doorStickerPdf(id, 'attachment')
      await downloadBlob(new Blob([res.data]), `door-sticker-${plateSlug}.pdf`)
    } catch (err) {
      setError(getApiErrorMessage(err, t('ownerVehicleDetail.stickerFailed')))
    } finally {
      setDownloadAction(null)
    }
  }

  const handlePreviewSticker = async () => {
    if (!id) return
    setDownloadAction('preview')
    try {
      const res = await ownerApi.doorStickerPdf(id, 'inline')
      const blob = new Blob([res.data], { type: 'application/pdf' })
      const url = window.URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener')
      setTimeout(() => window.URL.revokeObjectURL(url), 30_000)
    } catch (err) {
      setError(getApiErrorMessage(err, t('ownerVehicleDetail.stickerOpenFailed')))
    } finally {
      setDownloadAction(null)
    }
  }

  const handleDownloadBooklet = async () => {
    if (!id) return
    setDownloadAction('booklet')
    try {
      const res = await ownerApi.serviceBookletPdf(id, 'attachment')
      await downloadBlob(new Blob([res.data]), `service-history-${plateSlug}.pdf`)
    } catch (err) {
      setError(getApiErrorMessage(err, t('ownerVehicleDetail.bookletFailed')))
    } finally {
      setDownloadAction(null)
    }
  }

  if (loading) {
    return (
      <OwnerLayout>
        <div className="flex items-center gap-3 text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>{t('ownerVehicleDetail.loadingVehicle')}</span>
        </div>
      </OwnerLayout>
    )
  }

  if (error || !vehicle) {
    return (
      <OwnerLayout>
        <p className="text-red-600 mb-3">{error || t('ownerVehicleDetail.vehicleNotFound')}</p>
        <Link to="/owner/vehicles" className="text-blue-600 hover:underline">
          {t('ownerVehicleDetail.backLink')}
        </Link>
      </OwnerLayout>
    )
  }

  return (
    <OwnerLayout>
      <div className="space-y-6">
        <Link
          to="/owner/vehicles"
          className="inline-flex items-center gap-2 text-sm text-blue-600 hover:underline"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('ownerVehicleDetail.myVehicles')}
        </Link>

        {/* Vehicle header */}
        <div className="bg-gradient-to-r from-gray-900 via-gray-800 to-blue-900 text-white rounded-2xl p-5 sm:p-6 overflow-hidden">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center shrink-0">
                <Car className="w-6 h-6 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wider text-blue-200">
                  {vehicle.license_plate}
                </p>
                <h1 className="text-2xl font-bold truncate">
                  {vehicle.make} {vehicle.model}
                </h1>
                <p className="text-sm text-gray-300 mt-0.5 truncate">
                  {vehicle.year}
                  {vehicle.vin && (
                    <>
                      {' · '}
                      <span className="font-mono">{vehicle.vin}</span>
                    </>
                  )}
                </p>
              </div>
            </div>
            {vehicle.odometer_km != null && (
              <div className="text-left sm:text-right shrink-0">
                <p className="text-xs uppercase tracking-wider text-blue-200">{t('ownerVehicleDetail.odometer')}</p>
                <p className="text-xl font-bold">{vehicle.odometer_km.toLocaleString()} km</p>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="text-lg font-semibold text-gray-900">{t('ownerVehicleDetail.reportsTitle')}</h2>
            <FileText className="w-5 h-5 text-gray-400" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={handleDownloadBooklet}
              disabled={!!downloadAction}
              className="border border-gray-200 hover:border-blue-400 hover:bg-blue-50/40 rounded-xl p-4 text-left transition-colors disabled:opacity-50"
            >
              <Download className="w-5 h-5 text-blue-600 mb-2" />
              <p className="font-semibold text-gray-900">{t('ownerVehicleDetail.serviceHistoryPdf')}</p>
              <p className="text-xs text-gray-500 mt-1">
                {downloadAction === 'booklet'
                  ? t('ownerVehicleDetail.generating')
                  : t('ownerVehicleDetail.serviceHistoryHint')}
              </p>
            </button>
            <button
              type="button"
              onClick={handleDownloadSticker}
              disabled={!!downloadAction}
              className="border border-gray-200 hover:border-blue-400 hover:bg-blue-50/40 rounded-xl p-4 text-left transition-colors disabled:opacity-50"
            >
              <Printer className="w-5 h-5 text-blue-600 mb-2" />
              <p className="font-semibold text-gray-900">{t('ownerVehicleDetail.doorStickerPdf')}</p>
              <p className="text-xs text-gray-500 mt-1">
                {downloadAction === 'sticker'
                  ? t('ownerVehicleDetail.generating')
                  : t('ownerVehicleDetail.doorStickerHint')}
              </p>
            </button>
            <button
              type="button"
              onClick={handlePreviewSticker}
              disabled={!!downloadAction}
              className="border border-gray-200 hover:border-blue-400 hover:bg-blue-50/40 rounded-xl p-4 text-left transition-colors disabled:opacity-50"
            >
              <QrCode className="w-5 h-5 text-blue-600 mb-2" />
              <p className="font-semibold text-gray-900">{t('ownerVehicleDetail.previewSticker')}</p>
              <p className="text-xs text-gray-500 mt-1">
                {downloadAction === 'preview' ? t('ownerVehicleDetail.opening') : t('ownerVehicleDetail.previewStickerHint')}
              </p>
            </button>
          </div>
        </div>

        <OwnerVehiclePhotoGallery vehicleId={id!} />

        {/* Aggregated history */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{t('ownerVehicleDetail.serviceHistoryTitle')}</h2>
              <p className="text-xs text-gray-500">
                {t('ownerVehicleDetail.serviceHistorySubtitle')}
              </p>
            </div>
            <Wrench className="w-5 h-5 text-gray-400" />
          </div>

          {visits.length === 0 ? (
            <div className="border border-dashed border-gray-300 rounded-xl p-6 text-center text-sm text-gray-500">
              {t('ownerVehicleDetail.noVisitsRecorded')}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto -mx-5 sm:mx-0">
                <table className="w-full text-sm min-w-[480px]">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wider text-gray-500 border-b border-gray-200">
                      <th className="py-2 px-3 font-medium">{t('ownerVehicleDetail.tableDate')}</th>
                      <th className="py-2 px-3 font-medium">{t('ownerVehicleDetail.tableWorkshop')}</th>
                      <th className="py-2 px-3 font-medium text-right">{t('ownerVehicleDetail.tableMileage')}</th>
                      <th className="py-2 px-3 font-medium text-right">{t('ownerVehicleDetail.tableTotal')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visits.map((v) => (
                      <tr key={v.visit_id} className="border-b border-gray-100">
                        <td className="py-3 px-3 align-top">
                          <div className="flex items-center gap-1.5 text-gray-900">
                            <Calendar className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            {formatDate(v.service_date)}
                          </div>
                        </td>
                        <td className="py-3 px-3 align-top text-gray-700">
                          {v.tenant_name || v.tenant_schema}
                          {v.notes && (
                            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{v.notes}</p>
                          )}
                        </td>
                        <td className="py-3 px-3 align-top text-right tabular-nums text-gray-700">
                          {v.mileage_km != null ? `${v.mileage_km.toLocaleString()} km` : '—'}
                        </td>
                        <td className="py-3 px-3 align-top text-right tabular-nums font-semibold text-gray-900">
                          {formatMoney(v.grand_total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-end gap-2 mt-4 text-sm">
                <span className="text-gray-500">{t('ownerVehicleDetail.grandTotal')}</span>
                <span className="text-lg font-bold text-gray-900 tabular-nums">
                  {formatMoney(grandTotal)}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </OwnerLayout>
  )
}

interface OwnerPhoto {
  id: string
  image_url: string
  caption: string
  workshop_name: string
  uploaded_by_username: string
  created_at: string
}

function OwnerVehiclePhotoGallery({ vehicleId }: { vehicleId: string }) {
  const [lightbox, setLightbox] = useState<OwnerPhoto | null>(null)
  const { t } = useTranslation()

  const { data, isLoading } = useQuery({
    queryKey: ['owner-vehicle-photos', vehicleId],
    queryFn: () =>
      ownerPhotosApi.list(vehicleId).then((r) => (r.data.photos || []) as OwnerPhoto[]),
    enabled: Boolean(vehicleId),
  })

  const photos = data || []

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 sm:p-6 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    )
  }

  if (photos.length === 0) return null

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{t('photoGallery.title')}</h2>
          <p className="text-xs text-gray-500">
            {t('photoGallery.ownerSubtitle')}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {photos.map((p) => (
          <button
            key={p.id}
            type="button"
            className="group relative rounded-lg overflow-hidden border border-gray-200"
            onClick={() => setLightbox(p)}
          >
            <img
              src={p.image_url}
              alt={p.caption || 'Vehicle'}
              className="w-full h-32 object-cover transition-transform group-hover:scale-105"
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent text-white text-xs p-2 pt-6 text-left">
              <p className="truncate font-medium">{p.workshop_name}</p>
              {p.caption && <p className="truncate text-white/80">{p.caption}</p>}
            </div>
          </button>
        ))}
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-6"
          onClick={() => setLightbox(null)}
        >
          <div onClick={(e) => e.stopPropagation()} className="max-w-5xl max-h-full">
            <img src={lightbox.image_url} alt={lightbox.caption} className="max-h-[80vh] w-auto rounded-lg" />
            <div className="text-white text-sm mt-3 space-y-1">
              <p className="font-semibold">{lightbox.caption || '—'}</p>
              <p className="text-white/70 text-xs">
                {t('ownerVehicleDetail.uploadedByLabel', { workshop: lightbox.workshop_name })}
                {lightbox.uploaded_by_username && ` · ${lightbox.uploaded_by_username}`}
                {' · '}
                {new Date(lightbox.created_at).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
