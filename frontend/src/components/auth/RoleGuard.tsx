import { Navigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import type { RootState } from '@/store'
import { canManageWorkshopData, canViewAnalytics, normalizeRole } from '@/lib/roles'

type GuardMode = 'analytics' | 'catalog'

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
    mode === 'analytics' ? canViewAnalytics(role) : canManageWorkshopData(role)

  if (!allowed) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
