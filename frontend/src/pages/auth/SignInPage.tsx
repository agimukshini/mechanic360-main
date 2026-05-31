import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Wrench } from 'lucide-react'
import LanguageToggle from '@/components/i18n/LanguageToggle'
import SignInForm from '@/components/auth/SignInForm'

export default function SignInPage() {
  const { t } = useTranslation()

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 text-white">
      <div className="absolute inset-0 opacity-10 pointer-events-none">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
            backgroundSize: '40px 40px',
          }}
        />
      </div>

      <div className="relative z-10 max-w-md mx-auto px-6 py-8">
        <header className="flex flex-wrap items-center justify-between gap-4 mb-10">
          <Link to="/" className="flex items-center gap-3 hover:opacity-90 transition-opacity">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
              <Wrench className="w-5 h-5 text-yellow-400" />
            </div>
            <span className="font-bold">{t('common.appName')}</span>
          </Link>
          <LanguageToggle />
        </header>

        <SignInForm variant="dark" />

        <p className="mt-6 text-center">
          <Link to="/" className="text-sm text-slate-500 hover:text-slate-300 transition-colors">
            ← {t('registerChooser.back')}
          </Link>
        </p>
      </div>
    </div>
  )
}
