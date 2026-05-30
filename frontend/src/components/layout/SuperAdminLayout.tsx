import { useCallback, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { useTranslation } from 'react-i18next'
import {
  Building2,
  Car,
  ClipboardList,
  FileText,
  Languages,
  LayoutDashboard,
  LogOut,
  Menu,
  Repeat,
  ShieldCheck,
  X,
} from 'lucide-react'
import { logoutUser } from '@/store/authSlice'
import type { AppDispatch, RootState } from '@/store'

const NAV_ITEMS = [
  { to: '/admin', tk: 'superAdminLayout.navDashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/tenants', tk: 'superAdminLayout.navTenants', icon: Building2 },
  { to: '/admin/onboarding', tk: 'superAdminLayout.navOnboarding', icon: ClipboardList },
  { to: '/admin/global', tk: 'superAdminLayout.navGlobal', icon: Car },
  { to: '/admin/transfers', tk: 'superAdminLayout.navTransfers', icon: Repeat },
  { to: '/admin/audit', tk: 'superAdminLayout.navAudit', icon: FileText },
  { to: '/admin/security/logins', tk: 'superAdminLayout.navLoginLog', icon: ShieldCheck },
  { to: '/admin/translation-coverage', tk: 'superAdminLayout.navTranslation', icon: Languages },
]

function AdminNavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation()

  return (
    <div className="space-y-1">
      {NAV_ITEMS.map(({ to, tk, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isActive
                ? 'bg-workshop-blue text-white'
                : 'text-workshop-charcoal hover:bg-workshop-charcoal/5'
            }`
          }
        >
          <Icon className="w-4 h-4 shrink-0" />
          <span className="truncate">{t(tk)}</span>
        </NavLink>
      ))}
    </div>
  )
}

export default function SuperAdminLayout() {
  const { t } = useTranslation()
  const dispatch = useDispatch<AppDispatch>()
  const navigate = useNavigate()
  const { user } = useSelector((state: RootState) => state.auth)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  const closeMobileNav = useCallback(() => setMobileNavOpen(false), [])

  const handleLogout = async () => {
    closeMobileNav()
    await dispatch(logoutUser())
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-workshop-gray overflow-x-clip">
      <header className="bg-white border-b border-workshop-charcoal/10 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3 min-w-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              type="button"
              className="lg:hidden p-2 -ml-1 rounded-lg text-workshop-charcoal hover:bg-workshop-charcoal/5 shrink-0"
              onClick={() => setMobileNavOpen(true)}
              aria-label={t('a11y.openMenu')}
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-workshop-blue flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-semibold text-workshop-charcoal truncate">
                {t('superAdminLayout.platformAdmin')}
              </h1>
              <p className="text-xs sm:text-sm text-workshop-charcoal/60 truncate hidden sm:block">
                {t('superAdminLayout.consoleSubtitle')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-sm text-workshop-charcoal/70 hidden md:inline truncate max-w-[8rem]">
              {user?.username}
            </span>
            <button type="button" onClick={handleLogout} className="btn btn-secondary text-sm px-3 py-2">
              <LogOut className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">{t('superAdminLayout.signOut')}</span>
            </button>
          </div>
        </div>
      </header>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label={t('a11y.closeMenu')}
            onClick={closeMobileNav}
          />
          <aside className="absolute top-0 left-0 h-full w-[min(100%,18rem)] bg-white shadow-xl flex flex-col">
            <div className="flex items-center justify-between px-4 py-4 border-b border-workshop-charcoal/10">
              <span className="font-semibold text-workshop-charcoal">{t('superAdminLayout.navMenu')}</span>
              <button
                type="button"
                onClick={closeMobileNav}
                className="p-2 rounded-lg hover:bg-workshop-charcoal/5"
                aria-label={t('a11y.closeMenu')}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto p-3">
              <AdminNavLinks onNavigate={closeMobileNav} />
            </nav>
          </aside>
        </div>
      )}

      <div className="page-shell max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6 flex flex-col lg:flex-row gap-4 sm:gap-6">
        <nav className="hidden lg:block lg:w-56 shrink-0">
          <div className="card p-2">
            <AdminNavLinks />
          </div>
        </nav>

        <main className="flex-1 min-w-0 max-w-full">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
