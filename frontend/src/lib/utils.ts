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
  return parsePaginatedResponse<T>(response).results
}

export type PaginatedResult<T> = {
  results: T[]
  count: number
  next: string | null
  previous: string | null
}

/** Parse DRF paginated `{ count, next, previous, results }` or a plain array. */
export function parsePaginatedResponse<T>(
  response: { data?: unknown } | undefined,
): PaginatedResult<T> {
  const data = response?.data as
    | { results?: T[]; count?: number; next?: string | null; previous?: string | null }
    | T[]
    | undefined
  if (!data) {
    return { results: [], count: 0, next: null, previous: null }
  }
  if (Array.isArray(data)) {
    return { results: data, count: data.length, next: null, previous: null }
  }
  if (Array.isArray(data.results)) {
    return {
      results: data.results,
      count: typeof data.count === 'number' ? data.count : data.results.length,
      next: data.next ?? null,
      previous: data.previous ?? null,
    }
  }
  return { results: [], count: 0, next: null, previous: null }
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
  // Allow callers to pass a pre-extracted string straight through — keeps
  // `showError(getApiErrorMessage(e, ...))` and `showError(e, ...)` both safe.
  if (typeof error === 'string' && error.trim()) return error
  if (!error || typeof error !== 'object') return fallback

  const axiosError = error as AxiosError<unknown>
  const data = axiosError.response?.data

  if (typeof data === 'string' && data.trim()) return data
  // DRF: `raise ValidationError("text")` serialises to `["text"]`. Treat a
  // plain string-array as a single message rather than `"0: text"`.
  if (Array.isArray(data)) {
    const strings = data.filter((v): v is string => typeof v === 'string')
    if (strings.length > 0) return strings.join(' ')
  }
  if (!data || typeof data !== 'object') {
    return axiosError.message || fallback
  }

  const obj = data as Record<string, unknown>
  if (typeof obj.detail === 'string') return obj.detail
  if (typeof obj.error === 'string') return obj.error
  if (typeof obj.message === 'string') return obj.message
  // DRF non_field_errors comes through as an array of strings.
  if (Array.isArray(obj.non_field_errors)) {
    const strings = obj.non_field_errors.filter(
      (v): v is string => typeof v === 'string',
    )
    if (strings.length > 0) return strings.join(' ')
  }

  const fieldMessages: string[] = []
  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value)) {
      const strings = value.filter((v): v is string => typeof v === 'string')
      if (strings.length > 0) fieldMessages.push(`${key}: ${strings.join(', ')}`)
    } else if (typeof value === 'string') {
      fieldMessages.push(`${key}: ${value}`)
    }
  }
  if (fieldMessages.length > 0) return fieldMessages.join('; ')

  return fallback
}

/** Map DRF validation errors to field names and first message per field. */
export function getApiFieldErrors(error: unknown): Record<string, string> {
  if (!error || typeof error !== 'object') return {}

  const axiosError = error as AxiosError<unknown>
  const data = axiosError.response?.data
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {}

  const obj = data as Record<string, unknown>
  const fieldErrors: Record<string, string> = {}

  for (const [key, value] of Object.entries(obj)) {
    if (key === 'detail' || key === 'error' || key === 'message') continue
    if (Array.isArray(value)) {
      const message = value.find((v): v is string => typeof v === 'string')
      if (message) fieldErrors[key] = message
    } else if (typeof value === 'string') {
      fieldErrors[key] = value
    }
  }

  return fieldErrors
}
