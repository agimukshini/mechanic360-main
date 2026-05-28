import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Cog, Loader2 } from 'lucide-react'
import { authApi } from '@/api'
import { getApiErrorMessage } from '@/lib/utils'

type InvitePreview = {
  token_id: string
  status: 'valid' | 'used' | 'expired'
  workshop_name: string
  role: string
  email: string
  first_name: string
  last_name: string
  expires_at: string
}

export default function StaffInviteAcceptPage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [preview, setPreview] = useState<InvitePreview | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    username: '',
    password: '',
    confirm_password: '',
    email: '',
    first_name: '',
    last_name: '',
  })

  useEffect(() => {
    if (!token) return
    void (async () => {
      setLoadingPreview(true)
      setError(null)
      try {
        const res = await authApi.staffInvitePreview(token)
        setPreview(res.data)
        setForm((prev) => ({
          ...prev,
          email: res.data.email || prev.email,
          first_name: res.data.first_name || prev.first_name,
          last_name: res.data.last_name || prev.last_name,
        }))
      } catch (err) {
        setError(getApiErrorMessage(err, t('staffInvite.loadFailed')))
      } finally {
        setLoadingPreview(false)
      }
    })()
  }, [token, t])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) return
    if (form.password !== form.confirm_password) {
      setError(t('staffInvite.passwordMismatch'))
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await authApi.acceptStaffInvite(token, {
        username: form.username,
        password: form.password,
        email: form.email,
        first_name: form.first_name,
        last_name: form.last_name,
      })
      navigate('/login', { replace: true, state: { inviteAccepted: true } })
    } catch (err) {
      setError(getApiErrorMessage(err, t('staffInvite.acceptFailed')))
    } finally {
      setSubmitting(false)
    }
  }

  const roleLabel =
    preview?.role === 'admin' ? t('team.roleAdmin') : t('team.roleMechanic')

  return (
    <div className="min-h-screen flex items-center justify-center bg-workshop-gray p-4">
      <div className="max-w-lg w-full">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-workshop-blue rounded-xl mb-4">
            <Cog className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-workshop-charcoal">{t('staffInvite.title')}</h1>
          <p className="text-workshop-charcoal/60 mt-1">{t('staffInvite.subtitle')}</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-workshop-charcoal/10 p-8">
          {loadingPreview ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-workshop-blue" />
            </div>
          ) : preview?.status !== 'valid' ? (
            <div className="text-center space-y-4">
              <p className="text-workshop-charcoal/70">
                {preview?.status === 'used'
                  ? t('staffInvite.used')
                  : t('staffInvite.expired')}
              </p>
              <Link to="/login" className="text-workshop-blue hover:underline text-sm">
                {t('staffInvite.goToLogin')}
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-6 p-4 bg-workshop-blue/5 rounded-lg border border-workshop-blue/10">
                <p className="text-sm text-workshop-charcoal/60">{t('staffInvite.joining')}</p>
                <p className="font-semibold text-workshop-charcoal">{preview.workshop_name}</p>
                <p className="text-sm text-workshop-charcoal/70 mt-1">
                  {t('staffInvite.asRole', { role: roleLabel })}
                </p>
                <p className="text-xs text-workshop-charcoal/50 mt-2">
                  {t('staffInvite.expiresHint')}
                </p>
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-4">
                  {error}
                </p>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('team.username')} *</label>
                  <input
                    className="input"
                    required
                    value={form.username}
                    onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('team.email')}</label>
                  <input
                    className="input"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">{t('settings.firstName')}</label>
                    <input
                      className="input"
                      value={form.first_name}
                      onChange={(e) => setForm((prev) => ({ ...prev, first_name: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">{t('settings.lastName')}</label>
                    <input
                      className="input"
                      value={form.last_name}
                      onChange={(e) => setForm((prev) => ({ ...prev, last_name: e.target.value }))}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('team.password')} *</label>
                  <input
                    className="input"
                    type="password"
                    required
                    minLength={8}
                    value={form.password}
                    onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    {t('staffInvite.confirmPassword')} *
                  </label>
                  <input
                    className="input"
                    type="password"
                    required
                    minLength={8}
                    value={form.confirm_password}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, confirm_password: e.target.value }))
                    }
                  />
                </div>
                <button type="submit" className="btn btn-primary w-full" disabled={submitting}>
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {t('staffInvite.creating')}
                    </>
                  ) : (
                    t('staffInvite.createAccount')
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
