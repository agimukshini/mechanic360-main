import { Link } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { useTranslation } from 'react-i18next'
import { ArrowRight, Wrench } from 'lucide-react'
import LanguageToggle from '@/components/i18n/LanguageToggle'
import LandingMarketplaceSection from '@/components/landing/LandingMarketplaceSection'
import LandingWorkflowDiagram from '@/components/landing/LandingWorkflowDiagram'
import type { RootState } from '@/store'
import { isOwnerRole, normalizeRole } from '@/lib/roles'

function continuePath(user: RootState['auth']['user']): string | null {
  if (!user) return null
  if (user.is_superuser) return '/admin'
  if (isOwnerRole(normalizeRole(user.role))) return '/owner/vehicles'
  if (user.tenant) return '/dashboard'
  return null
}

export default function LandingPage() {
  const { t } = useTranslation()
  const { isAuthenticated, user, sessionChecked } = useSelector((state: RootState) => state.auth)
  const continueTo = isAuthenticated ? continuePath(user) : null

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 text-white flex flex-col">
      <div className="absolute inset-0 opacity-10 pointer-events-none">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
            backgroundSize: '40px 40px',
          }}
        />
      </div>

      <div className="relative z-10 flex flex-col flex-1 max-w-6xl mx-auto w-full px-6 py-8">
        <header className="flex flex-wrap items-center justify-between gap-4 mb-auto">
          <Link to="/" className="flex items-center gap-3 hover:opacity-90 transition-opacity">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg">
              <Wrench className="w-6 h-6 text-yellow-400" />
            </div>
            <div>
              <p className="text-xl font-bold">{t('common.appName')}</p>
              <p className="text-sm text-blue-200/80">{t('landing.tagline')}</p>
            </div>
          </Link>

          <div className="flex flex-wrap items-center gap-3">
            <LanguageToggle />
            <Link
              to="/login"
              className="inline-flex items-center px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-sm font-medium transition-colors"
            >
              {t('landing.signInCta')}
            </Link>
            {sessionChecked && continueTo && (
              <Link
                to={continueTo}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/30 text-sm font-medium transition-colors"
              >
                {t('landing.goToDashboard')}
                <ArrowRight className="w-4 h-4" />
              </Link>
            )}
          </div>
        </header>

        <main className="flex-1 py-12 lg:py-16">
          {sessionChecked && isAuthenticated && continueTo && (
            <div className="mb-8 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm max-w-3xl">
              <p className="font-medium text-emerald-100">
                {t('landing.signedInWelcome', { username: user?.username })}
              </p>
            </div>
          )}

          <div className="max-w-3xl space-y-8 text-center lg:text-left mb-10 lg:mb-12">
            <div className="space-y-4">
              <h1 className="text-4xl lg:text-5xl font-bold leading-tight">
                {t('landing.heroTitle')}{' '}
                <span className="text-blue-400">{t('landing.heroTitleAccent')}</span>
              </h1>
              <p className="text-lg text-slate-300 max-w-xl leading-relaxed mx-auto lg:mx-0">
                {t('landing.heroBody')}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start">
              <Link
                to="/register"
                className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-white text-slate-900 text-base font-semibold hover:bg-blue-50 transition-colors shadow-lg"
              >
                {t('landing.registerCta')}
                <ArrowRight className="w-5 h-5" />
              </Link>
              <Link
                to="/login"
                className="text-sm text-slate-400 hover:text-white transition-colors"
              >
                {t('landing.signInCta')}
              </Link>
            </div>
          </div>

          <LandingWorkflowDiagram />
          <LandingMarketplaceSection />
        </main>

        <footer className="mt-auto pt-8 text-sm text-slate-500 text-center lg:text-left">
          {t('landing.footer')}
        </footer>
      </div>
    </div>
  )
}
