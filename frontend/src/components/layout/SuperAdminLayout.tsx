import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import {
  Building2,
  Car,
  ClipboardList,
  FileText,
  LayoutDashboard,
  LogOut,
  Repeat,
  ShieldCheck,
} from 'lucide-react'
import { logoutUser } from '@/store/authSlice'
import type { AppDispatch, RootState } from '@/store'

const NAV_ITEMS = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/tenants', label: 'Tenants', icon: Building2 },
  { to: '/admin/onboarding', label: 'Onboarding', icon: ClipboardList },
  { to: '/admin/global', label: 'Global registry', icon: Car },
  { to: '/admin/transfers', label: 'Ownership transfers', icon: Repeat },
  { to: '/admin/audit', label: 'Vehicle audit log', icon: FileText },
  { to: '/admin/security/logins', label: 'Login log', icon: ShieldCheck },
]

export default function SuperAdminLayout() {
  const dispatch = useDispatch<AppDispatch>()
  const navigate = useNavigate()
  const { user } = useSelector((state: RootState) => state.auth)

  const handleLogout = async () => {
    await dispatch(logoutUser())
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-workshop-gray">
      <header className="bg-white border-b border-workshop-charcoal/10 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-workshop-blue flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-workshop-charcoal">Platform Admin</h1>
              <p className="text-sm text-workshop-charcoal/60">Workshop360 superuser console</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-workshop-charcoal/70 hidden sm:inline">
              {user?.username}
            </span>
            <button type="button" onClick={handleLogout} className="btn btn-secondary">
              <LogOut className="w-4 h-4 mr-2" />
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6 flex flex-col lg:flex-row gap-6">
        <nav className="lg:w-56 shrink-0">
          <div className="card p-2 space-y-1">
            {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-workshop-blue text-white'
                      : 'text-workshop-charcoal hover:bg-workshop-charcoal/5'
                  }`
                }
              >
                <Icon className="w-4 h-4" />
                {label}
              </NavLink>
            ))}
          </div>
        </nav>

        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
