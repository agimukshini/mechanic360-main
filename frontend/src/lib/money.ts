/** Format amounts in EUR without encoding issues in source files. */
export function formatEuro(amount: string | number | null | undefined): string {
  const n = parseFloat(String(amount ?? '')) || 0
  return `\u20ac${n.toFixed(2)}`
}

export const MULTIPLY = '\u00d7'
