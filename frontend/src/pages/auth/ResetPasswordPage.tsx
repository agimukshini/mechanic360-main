import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Cog, Eye, EyeOff, Loader2 } from 'lucide-react'
import { authApi } from '@/api'
import { getApiErrorMessage } from '@/lib/utils'

type ResetPreview = {
  token_id: string
  status: 'valid' | 'used' | 'expired' | 'inactive'
  email: string
  username: string
  expires_at: string
}

export default function ResetPasswordPage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [preview, setPreview] = useState<ResetPreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [form, setForm] = useState({ password: '', confirm_password: '' })

  useEffect(() => {
    if (!token) return
    void (async () => {
      setLoading(true)
      try {
        const res = await authApi.passwordResetPreview(token)
        setPreview(res.data)
      } catch (err) {
        setError(getApiErrorMessage(err, t('passwordReset.loadFailed')))
      } finally {
        setLoading(false)
      }
    })()
  }, [token, t])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) return
    if (form.password !== form.confirm_password) {
      setError(t('passwordReset.passwordMismatch'))
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await authApi.passwordResetConfirm(token, {
        password: form.password,
        confirm_password: form.confirm_password,
      })
      navigate('/login', { replace: true, state: { passwordReset: true } })
    } catch (err) {
      setError(getApiErrorMessage(err, t('passwordReset.resetFailed')))
    } finally {
      setSubmitting(false)
    }
  }

  const invalid = preview && preview.status !== 'valid'

  return (
    <div className="min-h-screen flex items-center justify-center bg-workshop-gray p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-workshop-blue rounded-xl mb-4">
            <Cog className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-workshop-charcoal">{t('passwordReset.resetTitle')}</h1>
          <p className="text-workshop-charcoal/60 mt-1">{t('passwordReset.resetSubtitle')}</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-workshop-charcoal/10 p-8">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-workshop-blue" />
            </div>
          ) : invalid ? (
            <p className="text-center text-workshop-charcoal/70">
              {preview?.status === 'used'
                ? t('passwordReset.linkUsed')
                : preview?.status === 'expired'
                  ? t('passwordReset.linkExpired')
                  : t('passwordReset.linkInvalid')}
            </p>
          ) : (
            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
              {preview?.username && (
                <p className="text-sm text-workshop-charcoal/70">
                  {t('passwordReset.account')}: <strong>{preview.username}</strong>
                </p>
              )}
              <div>
                <label className="label">{t('passwordReset.newPassword')}</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="input pr-10"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    minLength={8}
                    required
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-workshop-charcoal/40"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="label">{t('passwordReset.confirmPassword')}</label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="input"
                  value={form.confirm_password}
                  onChange={(e) => setForm({ ...form, confirm_password: e.target.value })}
                  minLength={8}
                  required
                  autoComplete="new-password"
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button type="submit" disabled={submitting} className="btn btn-primary w-full">
                {submitting ? t('passwordReset.saving') : t('passwordReset.savePassword')}
              </button>
            </form>
          )}

          <Link to="/login" className="block text-center mt-6 text-sm text-workshop-blue hover:underline">
            {t('passwordReset.backToLogin')}
          </Link>
        </div>
      </div>
    </div>
  )
}
