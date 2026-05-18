const API_BASE = import.meta.env.VITE_API_URL || '/api/v1'

export type ServiceReportMode = 'view' | 'download'

function reportUrl(visitId: string, disposition: 'inline' | 'attachment') {
  return `${API_BASE}/visits/reports/service-report/${visitId}/?disposition=${disposition}`
}

export function friendlyReportFilename(visitId: string, plate?: string) {
  const date = new Date().toISOString().slice(0, 10)
  const platePart = plate ? `-${plate.replace(/\s+/g, '')}` : ''
  return `service-report-${date}${platePart}-${visitId.slice(0, 8)}.pdf`
}

async function parseErrorResponse(res: Response): Promise<string> {
  const text = await res.text()
  try {
    const json = JSON.parse(text)
    return json.error || json.detail || text.slice(0, 200) || 'Could not generate the service report.'
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
    throw new Error('The server did not return a valid PDF. Try signing in again or finish the visit first.')
  }
}

/** Fetch report bytes with cookies; validates PDF magic header. */
export async function fetchServiceReportBlob(
  visitId: string,
  disposition: 'inline' | 'attachment' = 'inline',
): Promise<Blob> {
  const res = await fetch(reportUrl(visitId, disposition), {
    method: 'GET',
    credentials: 'include',
    // DRF only negotiates JSON by default; */* lets the view return raw PDF bytes.
    headers: { Accept: 'application/pdf, application/json;q=0.9, */*;q=0.8' },
  })

  if (!res.ok) {
    throw new Error(await parseErrorResponse(res))
  }

  const buffer = await res.arrayBuffer()
  assertPdfBytes(buffer)

  return new Blob([buffer], { type: 'application/pdf' })
}

export function createPdfObjectUrl(blob: Blob): string {
  const pdfBlob = blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' })
  return URL.createObjectURL(pdfBlob)
}

/** Open PDF in a new tab using an iframe shell (avoids blob gibberish in Chrome/Edge). */
export function openServiceReportInNewTab(blob: Blob, title: string) {
  const url = createPdfObjectUrl(blob)
  const tab = window.open('', '_blank', 'noopener,noreferrer')
  if (!tab) {
    URL.revokeObjectURL(url)
    throw new Error('Pop-up blocked. Allow pop-ups for this site, or use the in-page preview.')
  }

  tab.document.open()
  tab.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${title.replace(/</g, '')}</title>
  <style>
    html, body { margin: 0; height: 100%; overflow: hidden; background: #525659; }
    iframe { border: 0; width: 100%; height: 100%; display: block; }
  </style>
</head>
<body>
  <iframe src="${url}" title="${title.replace(/"/g, '')}"></iframe>
</body>
</html>`)
  tab.document.close()

  tab.addEventListener('beforeunload', () => URL.revokeObjectURL(url))
  setTimeout(() => URL.revokeObjectURL(url), 300_000)
}

export function downloadServiceReportBlob(blob: Blob, filename: string) {
  const url = createPdfObjectUrl(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function handleServiceReport(
  visitId: string,
  mode: ServiceReportMode,
  options?: { licensePlate?: string },
): Promise<string | void> {
  const disposition = mode === 'download' ? 'attachment' : 'inline'
  const blob = await fetchServiceReportBlob(visitId, disposition)
  const filename = friendlyReportFilename(visitId, options?.licensePlate)

  if (mode === 'download') {
    downloadServiceReportBlob(blob, filename)
    return
  }

  // Return object URL for in-app iframe preview (caller revokes on close)
  return createPdfObjectUrl(blob)
}

export function getServiceReportErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message
  return fallback
}
