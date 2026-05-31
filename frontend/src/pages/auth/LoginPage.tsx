import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { useTranslation } from 'react-i18next'
import { login, loginWithPin, clearError } from '@/store/authSlice'
import type { RootState, AppDispatch } from '@/store'
import { setWorkshopLanguage } from '@/lib/i18n'
import { isOwnerRole, normalizeRole } from '@/lib/roles'
import { Wrench, Mail, Lock, Eye, EyeOff, ArrowRight, CheckCircle, Cloud, Hash } from 'lucide-react'

type LoginMode = 'password' | 'pin'

export default function LoginPage() {
  const { t } = useTranslation()
  const [loginMode, setLoginMode] = useState<LoginMode>('password')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [pin, setPin] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const dispatch = useDispatch<AppDispatch>()
  const navigate = useNavigate()
  const { isLoading, error, isAuthenticated, user, sessionChecked } = useSelector(
    (state: RootState) => state.auth,
  )

  const appHome = user?.is_superuser
    ? '/admin'
    : isOwnerRole(normalizeRole(user?.role))
      ? '/owner/vehicles'
      : '/dashboard'

  useEffect(() => {
    void setWorkshopLanguage('sq')
  }, [])

  const heroFeatures = [
    t('auth.featureInspections'),
    t('auth.featureInventory'),
    t('auth.featureOffline'),
  ]

  const switchMode = (mode: LoginMode) => {
    setLoginMode(mode)
    dispatch(clearError())
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    dispatch(clearError())

    const result =
      loginMode === 'password'
        ? await dispatch(login({ username, password }))
        : await dispatch(loginWithPin({ username, pin }))

    const fulfilled = loginMode === 'password' ? login.fulfilled : loginWithPin.fulfilled
    if (fulfilled.match(result)) {
      const payload = result.payload as { role?: string; is_superuser?: boolean }
      const role = normalizeRole(payload?.role)
      if (payload?.is_superuser) {
        navigate('/admin')
      } else {
        navigate(isOwnerRole(role) ? '/owner/vehicles' : '/dashboard')
      }
    }
  }

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-gray-50 to-blue-50">
      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-5/12 min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
              backgroundSize: '40px 40px',
            }}
          />
        </div>

        <div className="relative z-10 flex flex-col flex-1 min-h-full p-12 w-full">
          <div className="flex items-center gap-3 mb-12">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg">
              <Wrench className="w-6 h-6 text-yellow-400" />
            </div>
            <span className="text-2xl font-bold text-white">{t('common.appName')}</span>
          </div>

          <div className="space-y-6">
            <h1 className="text-5xl font-bold text-white leading-tight">
              {t('auth.heroTitle')}
              <br />
              <span className="text-blue-400">{t('auth.heroTitleAccent')}</span>
            </h1>
            <p className="text-lg text-gray-300 max-w-md leading-relaxed">{t('auth.heroBody')}</p>

            <div className="space-y-4 pt-4">
              {heroFeatures.map((feature) => (
                <div key={feature} className="flex items-center gap-3 text-gray-300">
                  <CheckCircle className="w-5 h-5 text-blue-400 shrink-0" />
                  <span>{feature}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="mt-auto pt-10 text-sm text-gray-500">
            {t('loginExtra.copyright')}
          </p>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          <Link
            to="/"
            className="inline-flex text-sm text-gray-500 hover:text-brand-primary mb-4 transition-colors"
          >
            ← {t('common.back')} — {t('common.appName')}
          </Link>
          {sessionChecked && isAuthenticated && (
            <div className="mb-4 p-4 rounded-xl bg-blue-50 border border-blue-100 text-sm text-gray-700">
              <p className="font-medium">{t('landing.signedInWelcome', { username: user?.username })}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link to="/" className="btn btn-secondary text-sm py-1.5">
                  {t('common.back')}
                </Link>
                <Link to={appHome} className="btn btn-primary text-sm py-1.5">
                  {t('landing.goToDashboard')}
                </Link>
                <Link to="/register" className="text-sm text-brand-primary font-semibold self-center px-2">
                  {t('landing.applyTitle')}
                </Link>
              </div>
            </div>
          )}
          <div className="bg-white rounded-3xl shadow-xl p-8 lg:p-10">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-900">{t('auth.welcomeBack')}</h2>
              <p className="text-gray-500 mt-2">{t('auth.signInSubtitle')}</p>
            </div>

            <div className="flex bg-gray-100 rounded-xl p-1 mb-6">
              <button
                type="button"
                onClick={() => switchMode('password')}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
                  loginMode === 'password'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {t('auth.passwordTab')}
              </button>
              <button
                type="button"
                onClick={() => switchMode('pin')}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
                  loginMode === 'pin'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {t('auth.quickPinTab')}
              </button>
            </div>

            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-center gap-2">
                <Cloud className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label
                  htmlFor="username"
                  className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2"
                >
                  {loginMode === 'password' ? t('auth.emailLabel') : t('auth.usernameLabel')}
                </label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="input pl-12"
                    placeholder={
                      loginMode === 'password'
                        ? t('auth.emailPlaceholder')
                        : t('auth.usernamePlaceholder')
                    }
                    required
                    autoComplete="username"
                  />
                </div>
              </div>

              {loginMode === 'password' ? (
                <>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label
                        htmlFor="password"
                        className="block text-xs font-semibold text-gray-600 uppercase tracking-wide"
                      >
                        {t('auth.passwordLabel')}
                      </label>
                      <span
                        className="text-sm text-gray-400 cursor-not-allowed"
                        title={t('auth.forgotPassword')}
                      >
                        {t('auth.forgotPassword')}
                      </span>
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="input pl-12 pr-12"
                        placeholder="••••••••"
                        required
                        autoComplete="current-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center">
                    <input
                      id="remember"
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-brand-primary focus:ring-brand-primary"
                    />
                    <label htmlFor="remember" className="ml-2 text-sm text-gray-600">
                      {t('auth.rememberMe')}
                    </label>
                  </div>
                </>
              ) : (
                <div>
                  <label
                    htmlFor="pin"
                    className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2"
                  >
                    {t('auth.pinLabel')}
                  </label>
                  <div className="relative">
                    <Hash className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      id="pin"
                      type="password"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                      className="input pl-12 tracking-[0.3em] text-center text-lg font-semibold"
                      placeholder={t('auth.pinPlaceholder')}
                      required
                      autoComplete="one-time-code"
                    />
                  </div>
                  <p className="mt-2 text-xs text-gray-500">{t('auth.pinHint')}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="btn btn-primary w-full h-12 text-base font-semibold shadow-lg shadow-blue-500/30"
              >
                {isLoading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                    {t('auth.signingIn')}
                  </>
                ) : (
                  <>
                    {t('auth.signIn')}
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-8 pt-6 border-t border-gray-100">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-green-600">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  <span className="font-medium">{t('auth.systemOnline')}</span>
                </div>
                <div className="flex items-center gap-2 text-gray-400">
                  <Cloud className="w-4 h-4" />
                  <span>{t('auth.lastSync')}</span>
                </div>
              </div>
            </div>
          </div>

          <p className="text-center mt-8 text-sm text-gray-600">
            {t('auth.noAccount')}{' '}
            <Link to="/register" className="text-brand-primary font-semibold hover:underline">
              {t('auth.registerWorkshop')}
            </Link>
          </p>
          <p className="text-center mt-3 text-sm text-gray-600">
            {t('loginExtra.vehicleOwnerPrompt')}{' '}
            <Link to="/owner/register" className="text-brand-primary font-semibold hover:underline">
              {t('loginExtra.createOwnerAccount')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
