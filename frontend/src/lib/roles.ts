export type WorkshopRole = 'admin' | 'mechanic'
export type AppRole = WorkshopRole | 'owner'

export function normalizeRole(role: string | undefined | null): AppRole | null {
  if (!role) return null
  const r = role.toLowerCase().replace(/\s+/g, '_')
  if (r === 'admin') return 'admin'
  if (r === 'mechanic' || r === 'mechanic_/_technician') return 'mechanic'
  if (r === 'owner') return 'owner'
  // Legacy service_advisor accounts are migrated to mechanic on the backend.
  if (r === 'service_advisor' || r === 'serviceadvisor') return 'mechanic'
  return null
}

export function isOwnerRole(role: AppRole | null): boolean {
  return role === 'owner'
}

export function isMechanic(role: AppRole | null): boolean {
  return role === 'mechanic'
}

export function canManageWorkshopData(role: AppRole | null): boolean {
  return role === 'admin'
}

/** Admin/advisor: clients, inventory, marketplace, vehicle master data, visit lifecycle. */
export function canAccessWorkshopManagement(role: AppRole | null): boolean {
  return canManageWorkshopData(role)
}

/** Read service catalog when picking lines; only advisors/admins edit catalog entries. */
export function canManageServiceCatalog(role: AppRole | null): boolean {
  return canManageWorkshopData(role)
}

/** Log service/labor lines and inspections on open visits. */
export function canLogVisitWork(role: AppRole | null): boolean {
  return canManageWorkshopData(role) || role === 'mechanic'
}

/** Create/edit vehicles and manage owner assignment (workshop staff). */
export function canManageVehicles(role: AppRole | null): boolean {
  return canManageWorkshopData(role) || role === 'mechanic'
}

export function canViewAnalytics(role: AppRole | null): boolean {
  return canManageWorkshopData(role)
}

export function canViewMechanicKpis(role: AppRole | null): boolean {
  return role === 'admin' || role === 'mechanic'
}

export function isTenantAdmin(role: AppRole | null): boolean {
  return role === 'admin'
}

/** Sidebar entries for mechanic-focused workflow. */
export function mechanicNavigationIds(): string[] {
  return ['dashboard', 'vehicles', 'visits', 'mechanics']
}
