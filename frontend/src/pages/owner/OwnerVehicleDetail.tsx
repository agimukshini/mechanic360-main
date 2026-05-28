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
import { ownerApi } from '@/api'
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
      .catch((err) => setError(getApiErrorMessage(err, 'Failed to load vehicle')))
      .finally(() => setLoading(false))
  }, [id])

  const grandTotal = visits.reduce((acc, v) => acc + (v.grand_total || 0), 0)
  const plateSlug = (vehicle?.license_plate || 'vehicle').replace(/\s+/g, '')

  const handleDownloadSticker = async () => {
    if (!id) return
    setDownloadAction('sticker')
    try {
      const res = await ownerApi.doorStickerPdf(id, 'attachment')
      await downloadBlob(new Blob([res.data]), `door-sticker-${plateSlug}.pdf`)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to download door sticker'))
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
      setError(getApiErrorMessage(err, 'Failed to open door sticker'))
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
      setError(getApiErrorMessage(err, 'Failed to download service history'))
    } finally {
      setDownloadAction(null)
    }
  }

  if (loading) {
    return (
      <OwnerLayout>
        <div className="flex items-center gap-3 text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Loading vehicle…</span>
        </div>
      </OwnerLayout>
    )
  }

  if (error || !vehicle) {
    return (
      <OwnerLayout>
        <p className="text-red-600 mb-3">{error || 'Vehicle not found.'}</p>
        <Link to="/owner/vehicles" className="text-blue-600 hover:underline">
          ← Back to my vehicles
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
          My vehicles
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
                <p className="text-xs uppercase tracking-wider text-blue-200">Odometer</p>
                <p className="text-xl font-bold">{vehicle.odometer_km.toLocaleString()} km</p>
              </div>
            )}
          </div>
        </div>

        {/* Reports panel */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Reports & documents</h2>
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
              <p className="font-semibold text-gray-900">Service history (PDF)</p>
              <p className="text-xs text-gray-500 mt-1">
                {downloadAction === 'booklet'
                  ? 'Generating…'
                  : 'All visits across every workshop.'}
              </p>
            </button>
            <button
              type="button"
              onClick={handleDownloadSticker}
              disabled={!!downloadAction}
              className="border border-gray-200 hover:border-blue-400 hover:bg-blue-50/40 rounded-xl p-4 text-left transition-colors disabled:opacity-50"
            >
              <Printer className="w-5 h-5 text-blue-600 mb-2" />
              <p className="font-semibold text-gray-900">Door-jamb sticker (PDF)</p>
              <p className="text-xs text-gray-500 mt-1">
                {downloadAction === 'sticker'
                  ? 'Generating…'
                  : 'Print and stick on the door ridge.'}
              </p>
            </button>
            <button
              type="button"
              onClick={handlePreviewSticker}
              disabled={!!downloadAction}
              className="border border-gray-200 hover:border-blue-400 hover:bg-blue-50/40 rounded-xl p-4 text-left transition-colors disabled:opacity-50"
            >
              <QrCode className="w-5 h-5 text-blue-600 mb-2" />
              <p className="font-semibold text-gray-900">Preview sticker</p>
              <p className="text-xs text-gray-500 mt-1">
                {downloadAction === 'preview' ? 'Opening…' : 'Open the QR sticker in a new tab.'}
              </p>
            </button>
          </div>
        </div>

        {/* Aggregated history */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Service history</h2>
              <p className="text-xs text-gray-500">
                Visits from every workshop that has serviced this vehicle.
              </p>
            </div>
            <Wrench className="w-5 h-5 text-gray-400" />
          </div>

          {visits.length === 0 ? (
            <div className="border border-dashed border-gray-300 rounded-xl p-6 text-center text-sm text-gray-500">
              No completed visits on record yet.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto -mx-5 sm:mx-0">
                <table className="w-full text-sm min-w-[480px]">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wider text-gray-500 border-b border-gray-200">
                      <th className="py-2 px-3 font-medium">Date</th>
                      <th className="py-2 px-3 font-medium">Workshop</th>
                      <th className="py-2 px-3 font-medium text-right">Mileage</th>
                      <th className="py-2 px-3 font-medium text-right">Total</th>
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
                <span className="text-gray-500">Grand total</span>
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
