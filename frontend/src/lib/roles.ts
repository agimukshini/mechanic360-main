export type WorkshopRole = 'admin' | 'service_advisor' | 'mechanic'

export function normalizeRole(role: string | undefined | null): WorkshopRole | null {
  if (!role) return null
  const r = role.toLowerCase().replace(/\s+/g, '_')
  if (r === 'admin') return 'admin'
  if (r === 'service_advisor' || r === 'serviceadvisor') return 'service_advisor'
  if (r === 'mechanic' || r === 'mechanic_/_technician') return 'mechanic'
  return null
}

export function canManageWorkshopData(role: WorkshopRole | null): boolean {
  return role === 'admin' || role === 'service_advisor'
}

export function canViewAnalytics(role: WorkshopRole | null): boolean {
  return canManageWorkshopData(role)
}

export function isTenantAdmin(role: WorkshopRole | null): boolean {
  return role === 'admin'
}
