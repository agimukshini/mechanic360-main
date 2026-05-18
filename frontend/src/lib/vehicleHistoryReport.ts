import {
  createPdfObjectUrl,
  downloadServiceReportBlob,
  openServiceReportInNewTab,
} from './serviceReport'

const API_BASE = import.meta.env.VITE_API_URL || '/api/v1'

export type VehicleHistoryReportMode = 'view' | 'download'

export type HistoryYearParam = number | 'all'

function historyUrl(vehicleId: string, year: HistoryYearParam, disposition: 'inline' | 'attachment') {
  const yearQuery = year === 'all' ? 'all' : String(year)
  return `${API_BASE}/vehicles/reports/service-booklet/${vehicleId}/?year=${yearQuery}&disposition=${disposition}`
}

export function friendlyHistoryFilename(licensePlate: string, year: HistoryYearParam) {
  const plate = licensePlate.replace(/\s+/g, '') || 'vehicle'
  const yearPart = year === 'all' ? 'all' : String(year)
  return `vehicle-history-${plate}-${yearPart}.pdf`
}

async function parseErrorResponse(res: Response): Promise<string> {
  const text = await res.text()
  try {
    const json = JSON.parse(text)
    return json.error || json.detail || text.slice(0, 200) || 'Could not generate the history report.'
  } catch {
    return text.slice(0, 200) || `Server error (${res.status})`
  }
}

function assertPdfBytes(buffer: ArrayBuffer): void {
  const bytes = new Uint8Array(buffer)
  if (bytes.length < 4) {
    throw new Error('Empty response from server.')
  }
  const header = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])
  if (header !== '%PDF') {
    throw new Error('The server did not return a valid PDF.')
  }
}

export async function fetchVehicleHistoryReportBlob(
  vehicleId: string,
  year: HistoryYearParam,
  disposition: 'inline' | 'attachment' = 'attachment',
): Promise<Blob> {
  const res = await fetch(historyUrl(vehicleId, year, disposition), {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/pdf, application/json;q=0.9, */*;q=0.8' },
  })

  if (!res.ok) {
    throw new Error(await parseErrorResponse(res))
  }

  const buffer = await res.arrayBuffer()
  assertPdfBytes(buffer)
  return new Blob([buffer], { type: 'application/pdf' })
}

export async function handleVehicleHistoryReport(
  vehicleId: string,
  year: HistoryYearParam,
  mode: VehicleHistoryReportMode,
  options?: { licensePlate?: string },
): Promise<string | void> {
  const disposition = mode === 'download' ? 'attachment' : 'inline'
  const blob = await fetchVehicleHistoryReportBlob(vehicleId, year, disposition)
  const filename = friendlyHistoryFilename(options?.licensePlate || 'vehicle', year)

  if (mode === 'download') {
    downloadServiceReportBlob(blob, filename)
    return
  }

  return createPdfObjectUrl(blob)
}

export function openVehicleHistoryInNewTab(blob: Blob, title: string) {
  openServiceReportInNewTab(blob, title)
}

export function getVehicleHistoryErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message
  return fallback
}
