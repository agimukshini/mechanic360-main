import { useTranslation } from 'react-i18next'

const STATUS_STYLES: Record<string, string> = {
  completed: 'badge-success',
  in_progress: 'badge-info',
  draft: 'badge-warning',
  cancelled: 'badge-danger',
}

export function visitStatusLabel(status: string, t?: (key: string) => string): string {
  if (t) {
    const key = `status.${status}`
    const translated = t(key)
    if (translated !== key) return translated
  }
  return status.replace(/_/g, ' ')
}

export default function VisitStatusBadge({ status, className = '' }: { status: string; className?: string }) {
  const { t } = useTranslation()
  const style = STATUS_STYLES[status] ?? 'badge-neutral'
  return <span className={`badge ${style} ${className}`.trim()}>{visitStatusLabel(status, t)}</span>
}
