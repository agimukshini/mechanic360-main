import { useEffect, useRef } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { logoutUser } from '@/store/authSlice'
import type { RootState, AppDispatch } from '@/store'
import { canViewAnalytics, canViewMechanicKpis, isMechanic, mechanicNavigationIds, normalizeRole } from '@/lib/roles'
import { useTranslation } from 'react-i18next'
import {
  Wrench,
  LayoutGrid,
  Car,
  ClipboardList,
  Box,
  Store,
  Users,
  Settings,
  LogOut,
  Package,
  BarChart3,
  X,
} from 'lucide-react'

type NavItem = {
  id: string
  href: string
  icon: typeof LayoutGrid
  requiresAnalytics?: boolean
}

const baseNavigation: NavItem[] = [
  { id: 'dashboard', href: '/dashboard', icon: LayoutGrid },
  { id: 'vehicles', href: '/vehicles', icon: Car },
  { id: 'visits', href: '/visits', icon: ClipboardList },
  { id: 'services', href: '/services', icon: Package },
  { id: 'inventory', href: '/inventory', icon: Box },
  { id: 'marketplace', href: '/marketplace', icon: Store },
  { id: 'clients', href: '/clients', icon: Users },
  { id: 'analytics', href: '/analytics', icon: BarChart3, requiresAnalytics: true },
]

interface SidebarProps {
  mobileOpen?: boolean
  onMobileClose?: () => void
}

function SidebarContent({
  navigation,
  onNavigate,
  showClose,
  onClose,
}: {
  navigation: NavItem[]
  onNavigate?: () => void
  showClose?: boolean
  onClose?: () => void
}) {
  const { t } = useTranslation()
  const dispatch = useDispatch<AppDispatch>()
  const navigate = useNavigate()

  const handleLogout = async () => {
    onNavigate?.()
    await dispatch(logoutUser())
    navigate('/')
  }

  return (
    <div className="flex flex-col h-full w-full min-h-0">
      <div className="flex items-center justify-between w-full mb-8 px-1 shrink-0">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-accent rounded-xl flex items-center justify-center text-white shadow-soft">
          <Wrench className="w-5 h-5" />
        </div>
        <span className="text-lg font-bold text-white">Workshop360</span>
      </div>
      {showClose && onClose && (
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800 lg:hidden"
          aria-label="Close menu"
        >
          <X className="w-5 h-5" />
        </button>
      )}
    </div>

    <nav className="flex flex-col gap-2 w-full px-3 flex-1 overflow-y-auto min-h-0">
      {navigation.map((item) => (
        <NavLink
          key={item.id}
          to={item.href}
          end={item.href === '/'}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center gap-3 px-4 py-3 rounded-2xl transition-all ${
              isActive
                ? 'bg-accent text-white shadow-soft'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`
          }
        >
          <item.icon className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm font-medium">{t(`nav.${item.id}`)}</span>
        </NavLink>
      ))}
    </nav>

    <div className="flex flex-col gap-2 w-full px-3 pt-4 shrink-0">
      <NavLink
        to="/settings"
        onClick={onNavigate}
        className={({ isActive }) =>
          `flex items-center gap-3 px-4 py-3 rounded-2xl transition-all ${
            isActive
              ? 'bg-accent text-white shadow-soft'
              : 'text-gray-400 hover:text-white hover:bg-gray-800'
          }`
        }
      >
        <Settings className="w-5 h-5 flex-shrink-0" />
        <span className="text-sm font-medium">{t('nav.settings')}</span>
      </NavLink>

      <button
        type="button"
        onClick={handleLogout}
        className="flex items-center gap-3 px-4 py-3 rounded-2xl transition-all text-gray-400 hover:text-danger hover:bg-gray-800 w-full"
      >
        <LogOut className="w-5 h-5 flex-shrink-0" />
        <span className="text-sm font-medium">{t('nav.logout')}</span>
      </button>
    </div>
    </div>
  )
}

export default function Sidebar({ mobileOpen = false, onMobileClose }: SidebarProps) {
  const user = useSelector((state: RootState) => state.auth.user)
  const role = normalizeRole(user?.role)
  const location = useLocation()
  const allowedIds = isMechanic(role) ? new Set(mechanicNavigationIds()) : null

  const navigation = [
    ...baseNavigation.filter((item) => {
      if (allowedIds && !allowedIds.has(item.id)) return false
      return !item.requiresAnalytics || canViewAnalytics(role)
    }),
    ...(canViewMechanicKpis(role)
      ? [{ id: 'mechanics', href: '/analytics/mechanics', icon: Users }]
      : []),
  ].filter((item) => !allowedIds || allowedIds.has(item.id))

  const pathRef = useRef(location.pathname)
  useEffect(() => {
    if (pathRef.current !== location.pathname) {
      pathRef.current = location.pathname
      onMobileClose?.()
    }
  }, [location.pathname, onMobileClose])

  useEffect(() => {
    if (!mobileOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [mobileOpen])

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex fixed left-0 top-0 bottom-0 w-[200px] bg-primary z-40 flex-col py-8 px-2 rounded-r-[32px] shadow-float">
        <SidebarContent navigation={navigation} />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Close menu"
            onClick={onMobileClose}
          />
          <aside className="absolute left-0 top-0 bottom-0 w-[min(280px,88vw)] bg-primary flex flex-col py-6 px-2 rounded-r-[24px] shadow-float">
            <SidebarContent
              navigation={navigation}
              onNavigate={onMobileClose}
              showClose
              onClose={onMobileClose}
            />
          </aside>
        </div>
      )}
    </>
  )
}
