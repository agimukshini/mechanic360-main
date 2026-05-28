import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowRight, Building2, Car, Wrench } from 'lucide-react'
import LanguageToggle from '@/components/i18n/LanguageToggle'

export default function RegisterChooserPage() {
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

      <div className="relative z-10 max-w-2xl mx-auto px-6 py-8">
        <header className="flex flex-wrap items-center justify-between gap-4 mb-12">
          <Link to="/" className="flex items-center gap-3 hover:opacity-90 transition-opacity">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
              <Wrench className="w-5 h-5 text-yellow-400" />
            </div>
            <span className="font-bold">Workshop360</span>
          </Link>
          <LanguageToggle />
        </header>

        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold mb-2">{t('registerChooser.title')}</h1>
          <p className="text-slate-400">{t('registerChooser.subtitle')}</p>
        </div>

        <div className="space-y-4">
          <Link
            to="/register/mechanic"
            className="block bg-white text-slate-900 p-6 rounded-2xl shadow-xl hover:shadow-2xl hover:-translate-y-0.5 transition-all group"
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                <Building2 className="w-6 h-6 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <h2 className="text-lg font-semibold group-hover:text-blue-600 transition-colors">
                  {t('registerChooser.mechanicTitle')}
                </h2>
                <p className="text-sm text-slate-600 mt-1">{t('registerChooser.mechanicBody')}</p>
              </div>
              <ArrowRight className="w-5 h-5 text-slate-400 group-hover:text-blue-600 shrink-0 mt-1 transition-colors" />
            </div>
          </Link>

          <Link
            to="/register/owner"
            className="block bg-white text-slate-900 p-6 rounded-2xl shadow-xl hover:shadow-2xl hover:-translate-y-0.5 transition-all group"
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                <Car className="w-6 h-6 text-emerald-600" />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <h2 className="text-lg font-semibold group-hover:text-emerald-600 transition-colors">
                  {t('registerChooser.ownerTitle')}
                </h2>
                <p className="text-sm text-slate-600 mt-1">{t('registerChooser.ownerBody')}</p>
              </div>
              <ArrowRight className="w-5 h-5 text-slate-400 group-hover:text-emerald-600 shrink-0 mt-1 transition-colors" />
            </div>
          </Link>
        </div>

        <p className="mt-8 text-center text-sm text-slate-400">
          {t('registerChooser.hasAccount')}{' '}
          <Link to="/login" className="text-blue-300 font-medium hover:text-blue-200 transition-colors">
            {t('registerChooser.signIn')}
          </Link>
        </p>

        <p className="mt-4 text-center">
          <Link to="/" className="text-sm text-slate-500 hover:text-slate-300 transition-colors">
            ← {t('registerChooser.back')}
          </Link>
        </p>
      </div>
    </div>
  )
}
