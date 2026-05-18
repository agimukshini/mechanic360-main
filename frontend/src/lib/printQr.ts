import { escapeHtml } from './utils'

export interface QrPrintOptions {
  qrCodeData: string
  title?: string
  lines?: string[]
}

/** Open a print dialog with a QR image and escaped text lines (XSS-safe). */
export function printQrCode({ qrCodeData, title = 'Vehicle QR Code', lines = [] }: QrPrintOptions): void {
  const printWindow = window.open('', '_blank')
  if (!printWindow) return

  const safeTitle = escapeHtml(title)
  const safeSrc = escapeHtml(qrCodeData)
  const bodyLines = lines
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('')

  printWindow.document.write(`<!DOCTYPE html>
<html>
  <head>
    <title>${safeTitle}</title>
    <style>
      body { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; font-family: Arial, sans-serif; }
      img { max-width: 300px; height: auto; }
      p { margin: 10px 0; text-align: center; }
    </style>
  </head>
  <body>
    <img src="${safeSrc}" alt="QR Code" />
    ${bodyLines}
  </body>
</html>`)
  printWindow.document.close()
  printWindow.print()
}
