import type { WorkshopLanguage } from '@/lib/i18n'

export function localeTag(language: WorkshopLanguage): string {
  return language === 'en' ? 'en-US' : 'sq-AL'
}

export function formatDate(
  value: Date | string | number,
  language: WorkshopLanguage,
  options?: Intl.DateTimeFormatOptions,
) {
  const date = value instanceof Date ? value : new Date(value)
  return date.toLocaleDateString(localeTag(language), options)
}

export function formatDateTime(value: Date | string | number, language: WorkshopLanguage) {
  const date = value instanceof Date ? value : new Date(value)
  return date.toLocaleString(localeTag(language))
}

export function formatNumber(value: number, language: WorkshopLanguage) {
  return value.toLocaleString(localeTag(language))
}
