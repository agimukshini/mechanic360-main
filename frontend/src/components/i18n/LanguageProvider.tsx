import { useEffect } from 'react'
import { useSelector } from 'react-redux'
import type { RootState } from '@/store'
import { normalizeLanguage, setWorkshopLanguage } from '@/lib/i18n'

/**
 * Applies workshop language from the authenticated user profile (/auth/me).
 */
export default function LanguageProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, sessionChecked } = useSelector((state: RootState) => state.auth)

  useEffect(() => {
    if (!sessionChecked || !isAuthenticated || !user?.language) return
    void setWorkshopLanguage(normalizeLanguage(user.language))
  }, [sessionChecked, isAuthenticated, user?.language])

  return <>{children}</>
}
