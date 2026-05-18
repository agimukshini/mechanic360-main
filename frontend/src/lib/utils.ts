import type { AxiosError } from 'axios'

/** Escape text for safe insertion into HTML (e.g. print windows). */
export function escapeHtml(value: unknown): string {
  const str = String(value ?? '')
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Unwrap DRF paginated or plain list responses from Axios. */
export function unwrapList<T>(response: { data?: unknown } | undefined): T[] {
  const data = response?.data as { results?: T[] } | T[] | undefined
  if (!data) return []
  if (Array.isArray(data)) return data
  if (Array.isArray(data.results)) return data.results
  return []
}

/**
 * Build a browser-loadable URL for Django media files.
 * Uses same-origin `/media/...` so Vite/Docker proxy can reach the backend.
 */
export function resolveMediaUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined
  if (url.startsWith('blob:') || url.startsWith('data:')) return url

  try {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      const parsed = new URL(url)
      if (parsed.pathname.startsWith('/media/')) {
        return parsed.pathname
      }
      // Docker internal hostname from misconfigured absolute URLs
      if (parsed.hostname === 'backend') {
        return parsed.pathname
      }
      return url
    }
  } catch {
    return url
  }

  return url.startsWith('/') ? url : `/${url}`
}

/** Extract a user-facing message from API errors. */
export function getApiErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (!error || typeof error !== 'object') return fallback

  const axiosError = error as AxiosError<Record<string, unknown>>
  const data = axiosError.response?.data

  if (typeof data === 'string') return data
  if (!data || typeof data !== 'object') {
    return axiosError.message || fallback
  }

  if (typeof data.detail === 'string') return data.detail
  if (typeof data.error === 'string') return data.error
  if (typeof data.message === 'string') return data.message

  const fieldMessages: string[] = []
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) {
      fieldMessages.push(`${key}: ${value.join(', ')}`)
    } else if (typeof value === 'string') {
      fieldMessages.push(`${key}: ${value}`)
    }
  }
  if (fieldMessages.length > 0) return fieldMessages.join('; ')

  return fallback
}
