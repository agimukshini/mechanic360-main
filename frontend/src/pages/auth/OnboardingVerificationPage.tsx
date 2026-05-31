import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Cog, Loader2, XCircle } from 'lucide-react'
import { tenantsApi } from '@/api'
import { getApiErrorMessage } from '@/lib/utils'

type VerifyPreview = {
  token_id: string
  status: 'valid' | 'used' | 'expired' | 'closed'
  workshop_name: string
  application_id: string
  verification_confirmed: boolean
  clicked_at: string | null
  expires_at: string
}

export default function OnboardingVerificationPage() {
  const { token } = useParams<{ token: string }>()
  const { t } = useTranslation()
  const [preview, setPreview] = useState<VerifyPreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [confirming, setConfirming] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    void (async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await tenantsApi.onboardingVerifyPreview(token)
        setPreview(res.data)
        if (res.data.verification_confirmed || res.data.status === 'used') {
          setConfirmed(true)
        }
      } catch (err) {
        setError(getApiErrorMessage(err, t('onboardingVerify.loadFailed')))
      } finally {
        setLoading(false)
      }
    })()
  }, [token, t])

  const handleConfirm = async () => {
    if (!token) return
    setConfirming(true)
    setError(null)
    try {
      await tenantsApi.onboardingVerifyConfirm(token)
      setConfirmed(true)
      const res = await tenantsApi.onboardingVerifyPreview(token)
      setPreview(res.data)
    } catch (err) {
      setError(getApiErrorMessage(err, t('onboardingVerify.confirmFailed')))
    } finally {
      setConfirming(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-workshop-gray p-4">
      <div className="max-w-lg w-full">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-workshop-blue rounded-xl mb-4">
            <Cog className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-workshop-charcoal">{t('onboardingVerify.title')}</h1>
          <p className="text-workshop-charcoal/60 mt-1">{t('onboardingVerify.subtitle')}</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-workshop-charcoal/10 p-8">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-workshop-blue" />
            </div>
          ) : error ? (
            <div className="flex items-start gap-3 text-red-700 bg-red-50 border border-red-100 rounded-lg p-4">
              <XCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <p>{error}</p>
            </div>
          ) : confirmed || preview?.verification_confirmed ? (
            <div className="text-center space-y-4">
              <CheckCircle2 className="w-14 h-14 text-green-600 mx-auto" />
              <p className="text-lg font-semibold text-workshop-charcoal">{t('onboardingVerify.successTitle')}</p>
              <p className="text-workshop-charcoal/70 text-sm">{t('onboardingVerify.successBody')}</p>
              {preview?.workshop_name && (
                <p className="text-sm text-workshop-charcoal/60">
                  {t('onboardingVerify.workshop')}: <strong>{preview.workshop_name}</strong>
                </p>
              )}
            </div>
          ) : preview?.status === 'expired' ? (
            <p className="text-center text-workshop-charcoal/70">{t('onboardingVerify.expired')}</p>
          ) : preview?.status === 'closed' ? (
            <p className="text-center text-workshop-charcoal/70">{t('onboardingVerify.closed')}</p>
          ) : (
            <div className="space-y-6">
              <p className="text-workshop-charcoal/80">{t('onboardingVerify.intro')}</p>
              {preview?.workshop_name && (
                <p className="text-sm">
                  <span className="text-workshop-charcoal/60">{t('onboardingVerify.workshop')}:</span>{' '}
                  <strong>{preview.workshop_name}</strong>
                </p>
              )}
              <button
                type="button"
                onClick={() => void handleConfirm()}
                disabled={confirming}
                className="btn btn-primary w-full"
              >
                {confirming ? t('onboardingVerify.confirming') : t('onboardingVerify.confirmCta')}
              </button>
              <p className="text-xs text-workshop-charcoal/50">{t('onboardingVerify.auditNote')}</p>
            </div>
          )}

          <p className="text-center mt-6 text-sm text-workshop-charcoal/60">
            <Link to="/login" className="text-workshop-blue font-medium hover:underline">
              {t('onboardingVerify.backToLogin')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
