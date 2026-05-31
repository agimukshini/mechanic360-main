import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { useTranslation } from 'react-i18next'
import { login, loginWithPin, clearError } from '@/store/authSlice'
import type { RootState, AppDispatch } from '@/store'
import { isOwnerRole, normalizeRole } from '@/lib/roles'
import { ArrowRight, Cloud, Eye, EyeOff, Hash, Lock, Mail } from 'lucide-react'

type LoginMode = 'password' | 'pin'

type SignInFormProps = {
  variant?: 'light' | 'dark'
}

export default function SignInForm({ variant = 'light' }: SignInFormProps) {
  const { t } = useTranslation()
  const dark = variant === 'dark'
  const [loginMode, setLoginMode] = useState<LoginMode>('password')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [pin, setPin] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const dispatch = useDispatch<AppDispatch>()
  const navigate = useNavigate()
  const { isLoading, error } = useSelector((state: RootState) => state.auth)

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

  const cardClass = dark
    ? 'bg-slate-800/80 border border-white/10 text-white'
    : 'bg-white border border-gray-100 text-gray-900 shadow-xl'
  const mutedClass = dark ? 'text-slate-400' : 'text-gray-500'
  const labelClass = dark
    ? 'text-slate-300'
    : 'text-xs font-semibold text-gray-600 uppercase tracking-wide'
  const tabWrapClass = dark ? 'bg-white/10' : 'bg-gray-100'
  const tabActiveClass = dark ? 'bg-white/15 text-white' : 'bg-white text-gray-900 shadow-sm'
  const tabIdleClass = dark ? 'text-slate-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'
  const inputClass = dark
    ? 'w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 pl-12 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-400'
    : 'input pl-12'

  return (
    <div className={`rounded-2xl p-6 lg:p-8 ${cardClass}`}>
      <div className="text-center mb-6">
        <h2 className={`text-xl font-bold ${dark ? 'text-white' : 'text-gray-900'}`}>
          {t('auth.welcomeBack')}
        </h2>
        <p className={`mt-1 text-sm ${mutedClass}`}>{t('auth.signInSubtitle')}</p>
      </div>

      <div className={`flex rounded-xl p-1 mb-5 ${tabWrapClass}`}>
        <button
          type="button"
          onClick={() => switchMode('password')}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
            loginMode === 'password' ? tabActiveClass : tabIdleClass
          }`}
        >
          {t('auth.passwordTab')}
        </button>
        <button
          type="button"
          onClick={() => switchMode('pin')}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
            loginMode === 'pin' ? tabActiveClass : tabIdleClass
          }`}
        >
          {t('auth.quickPinTab')}
        </button>
      </div>

      {error && (
        <div
          className={`mb-5 p-3 rounded-xl text-sm flex items-center gap-2 ${
            dark ? 'bg-red-500/15 border border-red-400/30 text-red-200' : 'bg-red-50 border border-red-200 text-red-700'
          }`}
        >
          <Cloud className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="signin-username" className={`block mb-2 text-sm ${labelClass}`}>
            {loginMode === 'password' ? t('auth.emailLabel') : t('auth.usernameLabel')}
          </label>
          <div className="relative">
            <Mail className={`absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 ${dark ? 'text-slate-500' : 'text-gray-400'}`} />
            <input
              id="signin-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={inputClass}
              placeholder={
                loginMode === 'password' ? t('auth.emailPlaceholder') : t('auth.usernamePlaceholder')
              }
              required
              autoComplete="username"
            />
          </div>
        </div>

        {loginMode === 'password' ? (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="signin-password" className={`text-sm ${labelClass}`}>
                {t('auth.passwordLabel')}
              </label>
              <Link
                to="/forgot-password"
                className={`text-xs font-medium ${dark ? 'text-blue-300 hover:text-blue-200' : 'text-workshop-blue hover:underline'}`}
              >
                {t('auth.forgotPassword')}
              </Link>
            </div>
            <div className="relative">
              <Lock className={`absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 ${dark ? 'text-slate-500' : 'text-gray-400'}`} />
              <input
                id="signin-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${inputClass} pr-12`}
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className={`absolute right-4 top-1/2 -translate-y-1/2 ${dark ? 'text-slate-500 hover:text-white' : 'text-gray-400 hover:text-gray-600'}`}
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>
        ) : (
          <div>
            <label htmlFor="signin-pin" className={`block mb-2 text-sm ${labelClass}`}>
              {t('auth.pinLabel')}
            </label>
            <div className="relative">
              <Hash className={`absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 ${dark ? 'text-slate-500' : 'text-gray-400'}`} />
              <input
                id="signin-pin"
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                className={`${inputClass} tracking-[0.3em] text-center text-lg font-semibold`}
                placeholder={t('auth.pinPlaceholder')}
                required
                autoComplete="one-time-code"
              />
            </div>
            <p className={`mt-2 text-xs ${mutedClass}`}>{t('auth.pinHint')}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading}
          className="btn btn-primary w-full h-11 font-semibold"
        >
          {isLoading ? t('auth.signingIn') : t('auth.signIn')}
          {!isLoading && <ArrowRight className="w-5 h-5 ml-2" />}
        </button>
      </form>

      <p className={`text-center mt-5 text-sm ${mutedClass}`}>
        {t('auth.noAccount')}{' '}
        <Link to="/register" className="text-blue-400 font-semibold hover:underline">
          {t('auth.registerWorkshop')}
        </Link>
      </p>
    </div>
  )
}
