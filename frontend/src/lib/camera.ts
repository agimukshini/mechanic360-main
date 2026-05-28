/**
 * Helpers for guarding browser camera access (QR scanning and photo capture).
 *
 * The Camera API (`navigator.mediaDevices.getUserMedia`) is only exposed in
 * "secure contexts" — HTTPS or `localhost`. On http://lan-ip the browser will
 * throw a NotAllowedError no matter how many times the user clicks Allow, so
 * we classify the failure up-front and show a useful message instead of the
 * default "Permission denied" toast.
 */

/** Toggle verbose console.info traces. Always on so we can read mobile logs via remote debugger. */
const CAMERA_TRACE = true

export function cameraLog(...args: unknown[]) {
  if (!CAMERA_TRACE) return
  // eslint-disable-next-line no-console
  console.info('[camera]', ...args)
}

export type CameraPreflight =
  | { ok: true; diagnostics: CameraDiagnostics }
  | { ok: false; reason: CameraBlockReason; message: string; diagnostics: CameraDiagnostics }

export interface CameraDiagnostics {
  secureContext: boolean
  hasApi: boolean
  permission: PermissionState | 'unsupported' | 'error'
  userAgent: string
  hostname: string
  errorName?: string
  errorMessage?: string
}

export type CameraBlockReason =
  | 'insecure_context'
  | 'unsupported_browser'
  | 'permission_denied'
  | 'no_camera'
  | 'in_use'

const SUPPORTED_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])

export function isSecureCameraContext(): boolean {
  if (typeof window === 'undefined') return false
  if (window.isSecureContext) return true
  const host = window.location.hostname
  return SUPPORTED_HOSTS.has(host)
}

export function hasCameraApi(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function'
  )
}

/**
 * Best-effort permission check using the Permissions API. Returns `null` when
 * the browser does not implement it (Safari < 16, older Firefox), and we should
 * just attempt to acquire the stream.
 */
export async function queryCameraPermission(): Promise<PermissionState | null> {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
    return null
  }
  try {
    const status = await navigator.permissions.query({
      name: 'camera' as PermissionName,
    })
    return status.state
  } catch {
    return null
  }
}

/**
 * Map a `getUserMedia` failure to one of our typed reasons.
 */
function classifyMediaError(err: unknown): CameraBlockReason {
  const e = err as { name?: string; message?: string } | undefined
  const name = e?.name ?? ''
  const message = e?.message ?? ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'permission_denied'
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'no_camera'
  if (name === 'NotReadableError' || name === 'AbortError') return 'in_use'
  if (/secure|https/i.test(message)) return 'insecure_context'
  return 'permission_denied'
}

/**
 * Run a real `getUserMedia` request to force the browser permission prompt,
 * then release the stream so the actual scanner / capture surface can claim
 * the device. Many browsers (notably Safari on iOS and some Android PWAs) do
 * not show the prompt for `enumerateDevices` or `Html5Qrcode.getCameras()` —
 * we have to call `getUserMedia` ourselves.
 */
export async function preflightCameraAccess(
  t: (key: string) => string,
): Promise<CameraPreflight> {
  const diagnostics: CameraDiagnostics = {
    secureContext: isSecureCameraContext(),
    hasApi: hasCameraApi(),
    permission: 'unsupported',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    hostname: typeof window !== 'undefined' ? window.location.hostname : '',
  }
  cameraLog('preflight start', diagnostics)

  if (!diagnostics.secureContext) {
    cameraLog('preflight: not a secure context — refusing')
    return {
      ok: false,
      reason: 'insecure_context',
      message: t('camera.insecureContext'),
      diagnostics,
    }
  }
  if (!diagnostics.hasApi) {
    cameraLog('preflight: navigator.mediaDevices.getUserMedia is missing')
    return {
      ok: false,
      reason: 'unsupported_browser',
      message: t('camera.unsupportedBrowser'),
      diagnostics,
    }
  }

  // If the user has previously and permanently denied, the browser will not
  // re-prompt no matter what we do — bail out early with a clear hint.
  const permission = await queryCameraPermission()
  diagnostics.permission = permission ?? 'unsupported'
  cameraLog('preflight: permission state =', diagnostics.permission)
  if (permission === 'denied') {
    return {
      ok: false,
      reason: 'permission_denied',
      message: t('camera.permissionDenied'),
      diagnostics,
    }
  }

  // Actively request a stream — this is what triggers the browser prompt.
  // Try the broadest constraint first (`video: true`), then a softer
  // facingMode hint, and finally give up. Some Android WebViews reject the
  // simple `true` shape but accept the object form (or vice versa).
  const attempts: Array<{ label: string; constraints: MediaStreamConstraints }> = [
    { label: 'video:true', constraints: { video: true, audio: false } },
    {
      label: 'facingMode:environment',
      constraints: { video: { facingMode: 'environment' } as MediaTrackConstraints, audio: false },
    },
    {
      label: 'facingMode:user',
      constraints: { video: { facingMode: 'user' } as MediaTrackConstraints, audio: false },
    },
  ]

  let lastError: unknown = null
  for (const attempt of attempts) {
    cameraLog('preflight: trying', attempt.label, attempt.constraints)
    try {
      const stream = await navigator.mediaDevices.getUserMedia(attempt.constraints)
      const tracks = stream.getTracks()
      cameraLog('preflight: success', attempt.label, 'tracks =', tracks.map((tr) => ({
        kind: tr.kind,
        label: tr.label,
        readyState: tr.readyState,
      })))
      tracks.forEach((track) => track.stop())
      return { ok: true, diagnostics }
    } catch (err) {
      lastError = err
      const e = err as { name?: string; message?: string }
      cameraLog('preflight: attempt failed', attempt.label, {
        name: e?.name,
        message: e?.message,
      })
      // If it's a permission denial there is no point trying further variants —
      // every getUserMedia call would prompt again or fail the same way.
      if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') break
    }
  }

  const reason = classifyMediaError(lastError)
  const e = lastError as { name?: string; message?: string } | undefined
  diagnostics.errorName = e?.name
  diagnostics.errorMessage = e?.message
  const messageKey =
    reason === 'no_camera'
      ? 'camera.noCamera'
      : reason === 'in_use'
        ? 'camera.inUse'
        : reason === 'insecure_context'
          ? 'camera.insecureContext'
          : 'camera.permissionDenied'
  cameraLog('preflight: all attempts failed — reason =', reason, diagnostics)
  return { ok: false, reason, message: t(messageKey), diagnostics }
}

/** True when the device is likely a phone/tablet that benefits from `capture=environment`. */
export function shouldOfferCameraCapture(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua)
}
