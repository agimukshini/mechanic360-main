import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Cog, Loader2, Mail } from 'lucide-react'
import { authApi } from '@/api'
import { getApiErrorMessage } from '@/lib/utils'

export default function ForgotPasswordPage() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await authApi.forgotPassword(email.trim())
      setSent(true)
    } catch (err) {
      setError(getApiErrorMessage(err, t('passwordReset.forgotFailed')))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-workshop-gray p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-workshop-blue rounded-xl mb-4">
            <Cog className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-workshop-charcoal">{t('passwordReset.forgotTitle')}</h1>
          <p className="text-workshop-charcoal/60 mt-1">{t('passwordReset.forgotSubtitle')}</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-workshop-charcoal/10 p-8">
          {sent ? (
            <div className="text-center space-y-3">
              <Mail className="w-12 h-12 text-workshop-blue mx-auto" />
              <p className="font-medium text-workshop-charcoal">{t('passwordReset.emailSentTitle')}</p>
              <p className="text-sm text-workshop-charcoal/70">{t('passwordReset.emailSentBody')}</p>
            </div>
          ) : (
            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
              <div>
                <label className="label">{t('auth.emailLabel')}</label>
                <input
                  type="email"
                  className="input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('auth.emailPlaceholder')}
                  required
                  autoComplete="email"
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button type="submit" disabled={submitting} className="btn btn-primary w-full">
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    {t('passwordReset.sending')}
                  </>
                ) : (
                  t('passwordReset.sendLink')
                )}
              </button>
            </form>
          )}

          <Link
            to="/login"
            className="mt-6 flex items-center justify-center gap-2 text-sm text-workshop-blue hover:underline"
          >
            <ArrowLeft className="w-4 h-4" />
            {t('passwordReset.backToLogin')}
          </Link>
        </div>
      </div>
    </div>
  )
}
