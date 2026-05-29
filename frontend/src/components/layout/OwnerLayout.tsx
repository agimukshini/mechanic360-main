import { NavLink, useNavigate } from 'react-router-dom'
import { useDispatch } from 'react-redux'
import { useTranslation } from 'react-i18next'
import { Car, LogOut, QrCode } from 'lucide-react'
import { logoutUser } from '@/store/authSlice'
import type { AppDispatch } from '@/store'

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const dispatch = useDispatch<AppDispatch>()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await dispatch(logoutUser())
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-slate-900 text-white shadow-md">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Car className="w-6 h-6 text-blue-400" />
            <span className="font-bold text-lg">Workshop360 — {t('ownerLayout.myVehicles')}</span>
          </div>
          <nav className="flex items-center gap-4">
            <NavLink
              to="/owner/vehicles"
              className={({ isActive }) =>
                `text-sm font-medium ${isActive ? 'text-blue-300' : 'text-gray-300 hover:text-white'}`
              }
            >
              {t('ownerLayout.myVehicles')}
            </NavLink>
            <NavLink
              to="/owner/claim"
              className={({ isActive }) =>
                `text-sm font-medium flex items-center gap-1 ${isActive ? 'text-blue-300' : 'text-gray-300 hover:text-white'}`
              }
            >
              <QrCode className="w-4 h-4" />
              {t('ownerLayout.addVehicle')}
            </NavLink>
            <button
              type="button"
              onClick={handleLogout}
              className="text-sm text-gray-300 hover:text-white flex items-center gap-1"
            >
              <LogOut className="w-4 h-4" />
              {t('ownerLayout.logout')}
            </button>
          </nav>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-8">{children}</main>
    </div>
  )
}
