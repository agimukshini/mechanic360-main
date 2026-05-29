import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { tenantsApi } from '@/api'
import { Cog, Loader2 } from 'lucide-react'

export default function TenantRegisterPage() {
  const { t } = useTranslation()
  const [formData, setFormData] = useState({
    workshop_name: '',
    address: '',
    contact_email: '',
    contact_phone: '',
    admin_username: '',
    admin_email: '',
    admin_password: '',
    website: '',
  })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      console.log('Submitting registration:', formData)
      const response = await tenantsApi.register(formData)
      console.log('Registration successful:', response.data)
      setSuccess(true)
    } catch (err: any) {
      console.error('Registration error:', err.response?.data)
      const responseData = err.response?.data
      let errorMsg = t('tenantRegister.registrationFailedDefault')
      
      if (responseData) {
        if (typeof responseData === 'string') {
          errorMsg = responseData
        } else if (typeof responseData === 'object') {
          // Collect all field errors
          const errors = Object.entries(responseData)
            .map(([field, messages]) => {
              const msg = Array.isArray(messages) ? messages.join(', ') : String(messages)
              return `${msg}`
            })
            .join('\n')
          errorMsg = errors || JSON.stringify(responseData)
        }
      }
      setError(errorMsg)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-workshop-gray p-4">
      <div className="max-w-lg w-full">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/register" className="inline-flex text-sm text-workshop-charcoal/60 hover:text-workshop-blue mb-4">
            ← {t('tenantRegister.back')}
          </Link>
          <div className="inline-flex items-center justify-center w-16 h-16 bg-workshop-blue rounded-xl mb-4">
            <Cog className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-workshop-charcoal">{t('tenantRegister.appName')}</h1>
          <p className="text-workshop-charcoal/60 mt-1">{t('tenantRegister.tagline')}</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-workshop-charcoal/10 p-8">
          {success ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-workshop-charcoal mb-2">{t('tenantRegister.applicationSubmitted')}</h2>
              <p className="text-workshop-charcoal/60 mb-6">
                {t('tenantRegister.applicationSubmittedBody')}
              </p>
              <Link to="/" className="btn btn-secondary inline-flex mr-3">
                {t('tenantRegister.backHome')}
              </Link>
              <Link to="/login" className="btn btn-primary inline-flex">
                {t('tenantRegister.signIn')}
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-workshop-charcoal mb-6">{t('tenantRegister.applyTitle')}</h2>

              {error && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm font-semibold text-red-800 mb-1">{t('tenantRegister.errorTitle')}</p>
                  <p className="text-sm text-red-700 whitespace-pre-line">{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <input
                  type="text"
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                  className="absolute opacity-0 h-0 w-0 pointer-events-none"
                  aria-hidden
                  value={formData.website}
                  onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                />
                <div>
                  <label className="block text-sm font-medium text-workshop-charcoal mb-1">
                    {t('tenantRegister.workshopName')} *
                  </label>
                  <input
                    type="text"
                    value={formData.workshop_name}
                    onChange={(e) => setFormData({ ...formData, workshop_name: e.target.value })}
                    className="input"
                    placeholder={t('tenantRegister.workshopNamePlaceholder')}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-workshop-charcoal mb-1">
                    {t('tenantRegister.workshopAddress')}
                  </label>
                  <input
                    type="text"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className="input"
                    placeholder={t('tenantRegister.workshopAddressPlaceholder')}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-workshop-charcoal mb-1">
                      {t('tenantRegister.contactEmail')}
                    </label>
                    <input
                      type="email"
                      value={formData.contact_email}
                      onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                      className="input"
                      placeholder={t('tenantRegister.contactEmailPlaceholder')}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-workshop-charcoal mb-1">
                      {t('tenantRegister.contactPhone')}
                    </label>
                    <input
                      type="text"
                      value={formData.contact_phone}
                      onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                      className="input"
                      placeholder={t('tenantRegister.contactPhonePlaceholder')}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-workshop-charcoal mb-1">
                    {t('tenantRegister.adminUsername')} *
                  </label>
                  <input
                    type="text"
                    value={formData.admin_username}
                    onChange={(e) => setFormData({ ...formData, admin_username: e.target.value })}
                    className="input"
                    placeholder={t('tenantRegister.adminUsernamePlaceholder')}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-workshop-charcoal mb-1">
                    {t('tenantRegister.adminEmail')} *
                  </label>
                  <input
                    type="email"
                    value={formData.admin_email}
                    onChange={(e) => setFormData({ ...formData, admin_email: e.target.value })}
                    className="input"
                    placeholder={t('tenantRegister.adminEmailPlaceholder')}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-workshop-charcoal mb-1">
                    {t('tenantRegister.adminPassword')} *
                  </label>
                  <input
                    type="password"
                    value={formData.admin_password}
                    onChange={(e) => setFormData({ ...formData, admin_password: e.target.value })}
                    className="input"
                    placeholder={t('tenantRegister.adminPasswordPlaceholder')}
                    minLength={8}
                    required
                  />
                  <p className="text-xs text-workshop-charcoal/40 mt-1">{t('tenantRegister.passwordHint')}</p>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="btn btn-primary w-full"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {t('tenantRegister.creating')}
                    </>
                  ) : (
                    t('tenantRegister.submit')
                  )}
                </button>
              </form>

              <div className="mt-6 text-center">
                <p className="text-sm text-workshop-charcoal/60">
                  {t('tenantRegister.alreadyHaveAccount')}{' '}
                  <Link to="/login" className="text-workshop-blue hover:underline font-medium">
                    {t('tenantRegister.signIn')}
                  </Link>
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
