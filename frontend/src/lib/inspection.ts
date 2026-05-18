export type InspectionRecord = {
  id: string
  visit_id?: string
  visit?: { id?: string }
  performed_at?: string
  data?: Record<string, unknown>
}

/** True when the inspection JSON has at least one completed checklist item. */
export function hasInspectionContent(
  inspection: { data?: Record<string, unknown> } | null | undefined,
): boolean {
  if (!inspection?.data || typeof inspection.data !== 'object') return false
  return Object.values(inspection.data).some((section) => {
    if (!section || typeof section !== 'object' || Array.isArray(section)) return false
    return Object.keys(section as object).length > 0
  })
}

/** Pick the inspection that belongs to this visit (never another visit's record). */
export function pickInspectionForVisit(
  list: InspectionRecord[] | undefined,
  visitId: string,
): InspectionRecord | undefined {
  if (!list?.length) return undefined
  return list.find(
    (row) => row.visit_id === visitId || row.visit?.id === visitId,
  )
}
