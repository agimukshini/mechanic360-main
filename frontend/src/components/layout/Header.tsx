import { useNavigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import type { RootState } from '@/store'
import { Bell, Settings, Search, Menu } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import LanguageToggle from '@/components/i18n/LanguageToggle'
import { useWorkshopLanguage } from '@/hooks/useWorkshopLanguage'
import { localeTag } from '@/lib/locale'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api'

interface HeaderProps {
  darkMode?: boolean
  onToggleDarkMode?: () => void
  onOpenMobileNav?: () => void
}

export default function Header({ onOpenMobileNav }: HeaderProps) {
  const { t } = useTranslation()
  const { language } = useWorkshopLanguage()
  const navigate = useNavigate()
  const { user } = useSelector((state: RootState) => state.auth)
  const [showNotifications, setShowNotifications] = useState(false)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const queryClient = useQueryClient()

  const { data: notificationsData } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const response = await api.get('/auth/notifications/')
      return response.data
    },
    refetchInterval: 30000,
  })

  const markReadMutation = useMutation({
    mutationFn: (id: string) => api.post(`/auth/notifications/${id}/mark-read/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  const notifications = notificationsData?.notifications || []
  const unreadCount = notificationsData?.unread_count || 0

  const handleNotificationClick = (notif: { id: string; is_read: boolean; link?: string }) => {
    if (!notif.is_read) {
      markReadMutation.mutate(notif.id)
    }
    if (notif.link) {
      navigate(notif.link)
    }
    setShowNotifications(false)
  }

  const today = new Date()
  const dateStr = today.toLocaleDateString(localeTag(language), {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <header className="relative w-full px-4 sm:px-6 lg:px-10 py-4 lg:py-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 sticky top-0 z-30 bg-background/80 backdrop-blur-md">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileNav}
          className="lg:hidden w-10 h-10 shrink-0 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-600 hover:text-primary hover:bg-gray-50 transition-colors shadow-sm"
          aria-label={t('a11y.openMenu')}
        >
          <Menu className="w-5 h-5" />
        </button>
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 truncate">
          {user?.tenant_name || 'Workshop360'}
        </h1>
        <div className="hidden sm:flex items-center gap-2 bg-white px-3 py-1.5 rounded-full shadow-sm border border-gray-100 shrink-0">
          <div className="w-2 h-2 rounded-full bg-success" />
          <span className="text-xs font-medium text-gray-500">{t('common.online')}</span>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 justify-end w-full sm:w-auto">
        <LanguageToggle />
        <button
          type="button"
          onClick={() => setMobileSearchOpen((open) => !open)}
          className="lg:hidden w-10 h-10 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-500 hover:text-primary shadow-sm"
          aria-label={t('a11y.search')}
        >
          <Search className="w-5 h-5" />
        </button>
        <div
          className={`${mobileSearchOpen ? 'flex' : 'hidden'} lg:flex absolute left-4 right-4 top-full mt-2 lg:relative lg:mt-0 lg:left-auto lg:right-auto flex-1`}
        >
          <div className="relative w-full lg:w-72">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5 pointer-events-none" />
            <input
              type="search"
              placeholder={t('header.searchPlaceholder')}
              className="w-full pl-11 pr-4 py-2.5 bg-white border border-gray-200 rounded-full focus:ring-2 focus:ring-accent focus:border-accent outline-none text-gray-900 text-sm shadow-sm"
            />
          </div>
        </div>

        <div className="hidden lg:flex items-center gap-2 px-4 py-2.5 bg-white rounded-full border border-gray-200 shadow-sm text-sm font-medium text-gray-700">
          <span className="text-gray-400">📅</span>
          <span>{dateStr}</span>
        </div>

        <button
          type="button"
          onClick={() => navigate('/settings')}
          className="hidden lg:flex w-10 h-10 rounded-full bg-white border border-gray-200 items-center justify-center text-gray-500 hover:text-primary hover:bg-gray-50 transition-colors shadow-sm"
          title={t('a11y.settings')}
        >
          <Settings className="w-5 h-5" />
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => setShowNotifications(!showNotifications)}
            className="w-10 h-10 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-500 hover:text-primary hover:bg-gray-50 transition-colors shadow-sm relative"
            title={t('a11y.notifications')}
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 top-12 w-80 max-w-[calc(100vw-2rem)] bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden">
              <div className="p-3 border-b border-gray-100 bg-gray-50">
                <h3 className="font-semibold text-gray-900 text-sm">{t('header.notifications')}</h3>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {notifications.length > 0 ? (
                  notifications.map((notif: { id: string; is_read: boolean; link?: string; title: string; message: string; type?: string }) => (
                    <button
                      key={notif.id}
                      type="button"
                      onClick={() => handleNotificationClick(notif)}
                      className={`w-full text-left p-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                        !notif.is_read ? 'bg-blue-50/50' : ''
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <div
                          className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                            notif.type === 'warning'
                              ? 'bg-amber-500'
                              : notif.type === 'success'
                                ? 'bg-green-500'
                                : notif.type === 'error'
                                  ? 'bg-red-500'
                                  : 'bg-blue-500'
                          }`}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 text-xs truncate">{notif.title}</p>
                          <p className="text-[11px] text-gray-500 truncate">{notif.message}</p>
                        </div>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="p-6 text-center text-gray-400 text-sm">{t('header.noNotifications')}</div>
                )}
              </div>
            </div>
          )}
        </div>

        <button type="button" className="w-10 h-10 rounded-full overflow-hidden border-2 border-white shadow-soft shrink-0">
          <div className="w-full h-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-semibold">
            {user?.username?.[0]?.toUpperCase() || 'U'}
          </div>
        </button>
      </div>
    </header>
  )
}
