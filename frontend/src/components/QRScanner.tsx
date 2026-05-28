import { useEffect, useRef, useState } from 'react'
import { X, Camera, AlertCircle } from 'lucide-react'
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode'
import { useTranslation } from 'react-i18next'
import {
  cameraLog,
  hasCameraApi,
  isSecureCameraContext,
  preflightCameraAccess,
  type CameraBlockReason,
  type CameraDiagnostics,
} from '@/lib/camera'

interface QRScannerProps {
  onScanSuccess: (decodedText: string) => void
  onScanError?: (error: string) => void
  onClose: () => void
}

type CameraDevice = { id: string; label: string }

type ScannerState = 'initializing' | 'running' | 'error'

type ErrorKind = CameraBlockReason | 'unknown'

const errorKeyByKind: Record<ErrorKind, string> = {
  insecure_context: 'camera.insecureContext',
  unsupported_browser: 'camera.unsupportedBrowser',
  permission_denied: 'camera.permissionDenied',
  no_camera: 'camera.noCamera',
  in_use: 'camera.inUse',
  unknown: 'camera.unknown',
}

function classifyError(err: unknown): ErrorKind {
  const e = err as { name?: string; message?: string } | undefined
  const name = e?.name ?? ''
  const message = e?.message ?? ''
  if (name === 'NotAllowedError' || /Permission/i.test(message)) return 'permission_denied'
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || /no camera|getCameras/i.test(message)) return 'no_camera'
  if (name === 'NotReadableError' || /NotReadable|in use/i.test(message)) return 'in_use'
  if (/secure|https/i.test(message)) return 'insecure_context'
  return 'unknown'
}

const SCAN_CONFIG = { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 }

export default function QRScanner({ onScanSuccess, onScanError, onClose }: QRScannerProps) {
  const { t } = useTranslation()
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const scannerContainerId = 'html5qr-code-full-region'
  const [scannerState, setScannerState] = useState<ScannerState>('initializing')
  const [errorKind, setErrorKind] = useState<ErrorKind>('unknown')
  const [errorDetail, setErrorDetail] = useState<string>('')
  const [availableCameras, setAvailableCameras] = useState<CameraDevice[]>([])
  const [selectedCameraId, setSelectedCameraId] = useState<string>('')
  const [diagnostics, setDiagnostics] = useState<CameraDiagnostics | null>(null)
  const [showDiagnostics, setShowDiagnostics] = useState(false)

  // Start the camera and decoder. Accepts either a deviceId string (when the
  // user explicitly picked a camera) or a constraints object — we prefer the
  // constraints object on first launch because it works across browsers even
  // when `enumerateDevices()` returns an empty list (a known Safari/PWA quirk).
  const startCamera = async (target: string | MediaTrackConstraints) => {
    cameraLog('startCamera with target =', target)
    await stopScanner()
    const scanner = new Html5Qrcode(scannerContainerId)
    scannerRef.current = scanner
    try {
      await scanner.start(
        target,
        SCAN_CONFIG,
        (decodedText) => {
          cameraLog('QR decoded:', decodedText)
          onScanSuccess(decodedText)
          void stopScanner()
        },
        (msg) => {
          if (typeof msg === 'string' && msg.includes('NotFoundException')) return
          // eslint-disable-next-line no-console
          console.debug('QR scan frame:', msg)
        },
      )
      cameraLog('startCamera success')
    } catch (err) {
      const e = err as { name?: string; message?: string }
      cameraLog('startCamera failed', { name: e?.name, message: e?.message })
      throw err
    }
  }

  // Best-effort camera enumeration. We only call this *after* we've started
  // (or attempted to start) a stream, because most browsers won't expose
  // device labels — and Safari won't even list devices — before permission
  // has been granted via `getUserMedia`.
  const loadCameraList = async () => {
    try {
      const devices = await Html5Qrcode.getCameras()
      if (devices?.length) {
        setAvailableCameras(devices)
        const back =
          devices.find((d) => /back|environment|rear/i.test(d.label || '')) || devices[0]
        if (!selectedCameraId) setSelectedCameraId(back.id)
      }
    } catch {
      // Non-fatal: the camera is already running via facingMode, the user just
      // won't get a device picker. That's fine for single-camera devices.
    }
  }

  useEffect(() => {
    let cancelled = false

    const initScanner = async () => {
      const preflight = await preflightCameraAccess(t)
      if (cancelled) return
      setDiagnostics(preflight.diagnostics)
      if (!preflight.ok) {
        cameraLog('initScanner: preflight failed', preflight)
        setScannerState('error')
        setErrorKind(preflight.reason)
        setErrorDetail(preflight.message)
        onScanError?.(preflight.message)
        return
      }

      // Try a ladder of start configurations. Each entry is independent so we
      // can fall back if a browser rejects a particular constraint shape.
      const startAttempts: Array<{
        label: string
        target: string | MediaTrackConstraints
      }> = [
        { label: 'facingMode:environment(string)', target: { facingMode: 'environment' } },
        {
          label: 'facingMode:environment(ideal)',
          target: { facingMode: { ideal: 'environment' } },
        },
        { label: 'facingMode:user', target: { facingMode: 'user' } },
      ]

      let lastErr: unknown = null
      for (const attempt of startAttempts) {
        if (cancelled) return
        try {
          cameraLog('initScanner: attempting', attempt.label)
          await startCamera(attempt.target)
          if (cancelled) {
            await stopScanner()
            return
          }
          cameraLog('initScanner: started via', attempt.label)
          setScannerState('running')
          void loadCameraList()
          return
        } catch (err) {
          lastErr = err
          const e = err as { name?: string; message?: string }
          cameraLog('initScanner: attempt failed', attempt.label, {
            name: e?.name,
            message: e?.message,
          })
          // If permission denied, no point trying more variants.
          if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') break
        }
      }

      // Final fallback: enumerate cameras explicitly and use the first one.
      try {
        cameraLog('initScanner: falling back to enumerateDevices')
        const devices = await Html5Qrcode.getCameras()
        cameraLog('initScanner: getCameras returned', devices)
        if (cancelled) return
        if (devices?.length) {
          setAvailableCameras(devices)
          const first = devices[0]
          setSelectedCameraId(first.id)
          await startCamera(first.id)
          if (!cancelled) setScannerState('running')
          return
        }
      } catch (fallbackErr) {
        lastErr = fallbackErr
        const e = fallbackErr as { name?: string; message?: string }
        cameraLog('initScanner: enumerate fallback failed', {
          name: e?.name,
          message: e?.message,
        })
      }

      if (cancelled) return
      const kind = classifyError(lastErr)
      const e = lastErr as { name?: string; message?: string } | undefined
      // Surface the actual browser error to the diagnostics panel.
      setDiagnostics((prev) =>
        prev
          ? { ...prev, errorName: e?.name, errorMessage: e?.message }
          : null,
      )
      setScannerState('error')
      setErrorKind(kind)
      setErrorDetail(t(errorKeyByKind[kind]))
      onScanError?.((lastErr as Error)?.message || t(errorKeyByKind[kind]))
    }

    void initScanner()

    return () => {
      cancelled = true
      void stopScanner()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const stopScanner = async () => {
    if (!scannerRef.current) return
    try {
      if (scannerRef.current.getState() === Html5QrcodeScannerState.SCANNING) {
        await scannerRef.current.stop()
      }
      scannerRef.current.clear()
    } catch {
      // Ignored — the modal is being torn down.
    }
    scannerRef.current = null
  }

  const handleRetry = async () => {
    setScannerState('initializing')
    setErrorDetail('')
    try {
      const target: string | MediaTrackConstraints = selectedCameraId
        ? selectedCameraId
        : { facingMode: { ideal: 'environment' } }
      await startCamera(target)
      setScannerState('running')
      void loadCameraList()
    } catch (err) {
      const kind = classifyError(err)
      setScannerState('error')
      setErrorKind(kind)
      setErrorDetail(t(errorKeyByKind[kind]))
      onScanError?.((err as Error)?.message || t(errorKeyByKind[kind]))
    }
  }

  const handleSwitchCamera = async (deviceId: string) => {
    setSelectedCameraId(deviceId)
    setScannerState('initializing')
    setErrorDetail('')
    try {
      await startCamera(deviceId)
      setScannerState('running')
    } catch (err) {
      const kind = classifyError(err)
      setScannerState('error')
      setErrorKind(kind)
      setErrorDetail(t(errorKeyByKind[kind]))
      onScanError?.((err as Error)?.message || t(errorKeyByKind[kind]))
    }
  }

  const handleClose = async () => {
    await stopScanner()
    onClose()
  }

  const helpHint = (() => {
    switch (errorKind) {
      case 'permission_denied':
        return t('camera.permissionHint')
      case 'insecure_context':
        return t('camera.insecureHint')
      case 'in_use':
        return t('camera.inUseHint')
      case 'no_camera':
        return t('camera.noCameraHint')
      default:
        return null
    }
  })()

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-accent/10 rounded-xl flex items-center justify-center">
              <Camera className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">{t('camera.scanTitle')}</h2>
              <p className="text-sm text-gray-500">{t('camera.scanSubtitle')}</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="w-10 h-10 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        <div className="relative bg-black" style={{ minHeight: '400px' }}>
          {/*
            The scanner container MUST stay in the DOM with non-zero dimensions
            at all times. html5-qrcode reads the container's measured width/
            height when `start()` is called and uses it to size its internal
            <video>/<canvas>. If the container is `display:none` (or unmounted)
            at start time, every decoded frame fails with `IndexSizeError: The
            source width is 0` and you get a black screen.
          */}
          <div
            id={scannerContainerId}
            className="absolute inset-0 w-full h-full"
            style={{ minHeight: '400px' }}
          />

          {scannerState === 'initializing' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <div className="text-center">
                <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-white text-lg font-medium">{t('camera.initializing')}</p>
              </div>
            </div>
          )}

          {scannerState === 'error' && (
            <div className="absolute inset-0 flex items-center justify-center p-8 bg-black/80">
              <div className="text-center max-w-md">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertCircle className="w-8 h-8 text-red-600" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">{t('camera.errorTitle')}</h3>
                <p className="text-gray-200 mb-3">{errorDetail || t('camera.unknown')}</p>
                {helpHint && (
                  <p className="text-xs text-gray-300 mb-4">{helpHint}</p>
                )}

                {availableCameras.length > 1 && (
                  <div className="mb-4">
                    <label className="block text-white text-sm mb-2">
                      {t('camera.tryAnother')}
                    </label>
                    <select
                      value={selectedCameraId}
                      onChange={(e) => handleSwitchCamera(e.target.value)}
                      className="w-full p-3 rounded-lg bg-gray-800 text-white border border-gray-600"
                    >
                      {availableCameras.map((camera) => (
                        <option key={camera.id} value={camera.id}>
                          {camera.label || t('camera.unnamedCamera')}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="flex gap-3 justify-center">
                  {hasCameraApi() && isSecureCameraContext() && (
                    <button onClick={handleRetry} className="btn btn-primary">
                      {t('camera.tryCamera')}
                    </button>
                  )}
                  <button onClick={handleClose} className="btn btn-secondary">
                    {t('common.close')}
                  </button>
                </div>

                {diagnostics && (
                  <div className="mt-4 text-left">
                    <button
                      type="button"
                      onClick={() => setShowDiagnostics((v) => !v)}
                      className="text-xs text-gray-300 underline hover:text-white"
                    >
                      {showDiagnostics ? 'Hide diagnostics' : 'Show diagnostics'}
                    </button>
                    {showDiagnostics && (
                      <pre className="mt-2 text-[10px] leading-snug bg-gray-900/80 text-gray-100 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words">
{JSON.stringify(
  {
    host: diagnostics.hostname,
    secureContext: diagnostics.secureContext,
    hasApi: diagnostics.hasApi,
    permission: diagnostics.permission,
    errorName: diagnostics.errorName,
    errorMessage: diagnostics.errorMessage,
    cameraCount: availableCameras.length,
    cameraLabels: availableCameras.map((c) => c.label || c.id).slice(0, 4),
    userAgent: diagnostics.userAgent,
  },
  null,
  2,
)}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

        <div className="p-6 bg-gray-50 border-t border-gray-200">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-gray-600 flex-1">
              {scannerState === 'running' && t('camera.scanning')}
            </p>
            {scannerState === 'running' && availableCameras.length > 1 && (
              <select
                value={selectedCameraId}
                onChange={(e) => handleSwitchCamera(e.target.value)}
                className="px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white"
              >
                {availableCameras.map((camera) => (
                  <option key={camera.id} value={camera.id}>
                    {camera.label || t('camera.unnamedCamera')}
                  </option>
                ))}
              </select>
            )}
            <button onClick={handleClose} className="btn btn-secondary">
              {t('common.cancel')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
