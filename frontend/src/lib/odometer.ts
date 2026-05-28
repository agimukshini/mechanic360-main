export type OdometerUnit = 'km' | 'mi'

export const MI_TO_KM = 1.609344

export function kmToOdometerDisplay(
  km: number | null | undefined,
  unit: OdometerUnit,
): number | undefined {
  if (km == null) return undefined
  if (unit === 'mi') return Math.round(km / MI_TO_KM)
  return km
}

export function odometerDisplayToKm(
  value: number | string | null | undefined,
  unit: OdometerUnit,
): number | null {
  if (value === '' || value == null || value === undefined) return null
  const n = typeof value === 'number' ? value : Number(value)
  if (Number.isNaN(n) || n < 0) return null
  if (unit === 'mi') return Math.round(n * MI_TO_KM)
  return Math.round(n)
}

export function formatOdometer(
  km: number | null | undefined,
  unit: OdometerUnit = 'km',
): string {
  if (km == null) return '—'
  const display = kmToOdometerDisplay(km, unit)!
  return `${display.toLocaleString()} ${unit}`
}

export function formatHourMeter(hours: number | null | undefined): string {
  if (hours == null) return '—'
  return `${hours.toLocaleString()} hrs`
}
