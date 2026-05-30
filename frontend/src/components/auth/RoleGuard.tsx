import { Navigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import type { RootState } from '@/store'
import {
  canBrowseMarketplace,
  canManageWorkshopData,
  canManageServiceCatalog,
  canViewAnalytics,
  canViewMechanicKpis,
  isTenantAdmin,
  normalizeRole,
} from '@/lib/roles'

type GuardMode =
  | 'analytics'
  | 'catalog'
  | 'tenant_admin'
  | 'mechanics_kpi'
  | 'workshop_manage'
  | 'marketplace_browse'

export default function RoleGuard({
  mode,
  children,
}: {
  mode: GuardMode
  children: React.ReactNode
}) {
  const user = useSelector((state: RootState) => state.auth.user)
  const role = normalizeRole(user?.role)

  const allowed =
    mode === 'analytics'
      ? canViewAnalytics(role)
      : mode === 'mechanics_kpi'
        ? canViewMechanicKpis(role)
        : mode === 'tenant_admin'
          ? isTenantAdmin(role)
          : mode === 'workshop_manage'
            ? canManageWorkshopData(role)
            : mode === 'marketplace_browse'
              ? canBrowseMarketplace(role)
              : canManageServiceCatalog(role)

  if (!allowed) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}
