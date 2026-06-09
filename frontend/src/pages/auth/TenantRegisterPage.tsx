import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { tenantsApi } from '@/api'
import { getApiErrorMessage, getApiFieldErrors } from '@/lib/utils'
import { Cog, Copy, Loader2, Phone } from 'lucide-react'

interface PlatformContact {
  company_name: string
  email: string
  phone: string
}

interface RegistrationSuccess {
  verification_code: string
  platform_contact: PlatformContact
}

export default function TenantRegisterPage() {
  const { t } = useTranslation()
  const [formData, setFormData] = useState({
    workshop_name: '',
    business_registration_number: '',
    address: '',
    contact_email: '',
    contact_phone: '',
    admin_username: '',
    admin_email: '',
    admin_password: '',
    website: '',
  })
  const [platformContact, setPlatformContact] = useState<PlatformContact | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [success, setSuccess] = useState<RegistrationSuccess | null>(null)

  const fieldLabels: Record<string, string> = {
    business_registration_number: t('tenantRegister.businessNumber'),
    workshop_name: t('tenantRegister.workshopName'),
    address: t('tenantRegister.workshopAddress'),
    contact_email: t('tenantRegister.contactEmail'),
    contact_phone: t('tenantRegister.contactPhone'),
    admin_username: t('tenantRegister.adminUsername'),
    admin_email: t('tenantRegister.adminEmail'),
    admin_password: t('tenantRegister.adminPassword'),
    non_field_errors: t('tenantRegister.errorTitle'),
  }

  const formatFieldErrorSummary = (errors: Record<string, string>) =>
    Object.entries(errors)
      .map(([field, message]) => {
        const label = fieldLabels[field] ?? field
        return `${label}: ${message}`
      })
      .join('\n')

  const clearFieldError = (field: string) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }

  const fieldError = (field: string) => fieldErrors[field]
  const inputClass = (field: string) =>
    fieldErrors[field] ? 'input border-red-500 focus:border-red-500' : 'input'

  useEffect(() => {
    tenantsApi
      .getOnboardingContact()
      .then((response) => setPlatformContact(response.data))
      .catch(() => setPlatformContact(null))
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)
    setFieldErrors({})

    try {
      const response = await tenantsApi.register(formData)
      setSuccess({
        verification_code: response.data.verification_code,
        platform_contact: response.data.platform_contact,
      })
    } catch (err: unknown) {
      const parsedFieldErrors = getApiFieldErrors(err)
      if (Object.keys(parsedFieldErrors).length > 0) {
        setFieldErrors(parsedFieldErrors)
        setError(formatFieldErrorSummary(parsedFieldErrors))
      } else {
        setError(getApiErrorMessage(err, t('tenantRegister.registrationFailedDefault')))
      }
    } finally {
      setIsLoading(false)
    }
  }

  const copyVerificationCode = async () => {
    if (!success?.verification_code) return
    try {
      await navigator.clipboard.writeText(success.verification_code)
    } catch {
      // Clipboard may be unavailable on some mobile browsers.
    }
  }

  const contact = success?.platform_contact ?? platformContact

  return (
    <div className="min-h-screen flex items-center justify-center bg-workshop-gray p-4">
      <div className="max-w-lg w-full">
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
            <div className="py-4 space-y-6">
              <div className="text-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-workshop-charcoal mb-2">
                  {t('tenantRegister.applicationSubmitted')}
                </h2>
                <p className="text-workshop-charcoal/60">{t('tenantRegister.applicationSubmittedBody')}</p>
              </div>

              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
                <h3 className="font-semibold text-workshop-charcoal">{t('tenantRegister.verificationTitle')}</h3>
                <p className="text-sm text-workshop-charcoal/70">{t('tenantRegister.verificationIntro')}</p>
                <div className="flex items-center justify-between gap-3 rounded-lg bg-white border border-workshop-charcoal/10 px-4 py-3">
                  <code className="text-lg font-bold tracking-widest text-workshop-blue">
                    {success.verification_code}
                  </code>
                  <button type="button" onClick={copyVerificationCode} className="btn btn-secondary btn-sm">
                    <Copy className="w-4 h-4 mr-1" />
                    {t('tenantRegister.copyCode')}
                  </button>
                </div>
                <div className="text-sm text-workshop-charcoal/70 space-y-2">
                  {contact?.email && (
                    <p>
                      {t('tenantRegister.sendToEmail')}{' '}
                      <a href={`mailto:${contact.email}`} className="font-medium text-workshop-blue hover:underline">
                        {contact.email}
                      </a>
                    </p>
                  )}
                  {contact?.phone && (
                    <p className="flex items-center gap-2 flex-wrap">
                      <Phone className="w-4 h-4 shrink-0" />
                      <span>{t('tenantRegister.sendToPhone')}</span>
                      <a href={`tel:${contact.phone}`} className="font-medium text-workshop-blue hover:underline">
                        {contact.phone}
                      </a>
                    </p>
                  )}
                </div>
                <p className="text-sm text-workshop-charcoal/70">{t('tenantRegister.verificationAfterSend')}</p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link to="/" className="btn btn-secondary inline-flex justify-center">
                  {t('tenantRegister.backHome')}
                </Link>
                <Link to="/login" className="btn btn-primary inline-flex justify-center">
                  {t('tenantRegister.signIn')}
                </Link>
              </div>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-workshop-charcoal mb-2">{t('tenantRegister.applyTitle')}</h2>
              <p className="text-sm text-workshop-charcoal/60 mb-6">{t('tenantRegister.arbkIntro')}</p>

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

                <div className="rounded-lg border border-workshop-charcoal/10 p-4 space-y-4">
                  <h3 className="text-sm font-semibold text-workshop-charcoal">{t('tenantRegister.arbkSectionTitle')}</h3>

                  <div>
                    <label className="block text-sm font-medium text-workshop-charcoal mb-1">
                      {t('tenantRegister.businessNumber')} *
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formData.business_registration_number}
                      onChange={(e) => {
                        clearFieldError('business_registration_number')
                        setFormData({ ...formData, business_registration_number: e.target.value })
                      }}
                      className={inputClass('business_registration_number')}
                      placeholder={t('tenantRegister.businessNumberPlaceholder')}
                      required
                    />
                    {fieldError('business_registration_number') && (
                      <p className="text-sm text-red-600 mt-1">{fieldError('business_registration_number')}</p>
                    )}
                    <p className="text-xs text-workshop-charcoal/40 mt-1">{t('tenantRegister.businessNumberHint')}</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-workshop-charcoal mb-1">
                      {t('tenantRegister.workshopName')} *
                    </label>
                    <input
                      type="text"
                      value={formData.workshop_name}
                      onChange={(e) => {
                        clearFieldError('workshop_name')
                        setFormData({ ...formData, workshop_name: e.target.value })
                      }}
                      className={inputClass('workshop_name')}
                      placeholder={t('tenantRegister.workshopNamePlaceholder')}
                      required
                    />
                    {fieldError('workshop_name') && (
                      <p className="text-sm text-red-600 mt-1">{fieldError('workshop_name')}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-workshop-charcoal mb-1">
                      {t('tenantRegister.workshopAddress')} *
                    </label>
                    <input
                      type="text"
                      value={formData.address}
                      onChange={(e) => {
                        clearFieldError('address')
                        setFormData({ ...formData, address: e.target.value })
                      }}
                      className={inputClass('address')}
                      placeholder={t('tenantRegister.workshopAddressPlaceholder')}
                      required
                    />
                    {fieldError('address') && (
                      <p className="text-sm text-red-600 mt-1">{fieldError('address')}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-workshop-charcoal mb-1">
                        {t('tenantRegister.contactEmail')} *
                      </label>
                      <input
                        type="email"
                        value={formData.contact_email}
                        onChange={(e) => {
                          clearFieldError('contact_email')
                          setFormData({ ...formData, contact_email: e.target.value })
                        }}
                        className={inputClass('contact_email')}
                        placeholder={t('tenantRegister.contactEmailPlaceholder')}
                        required
                      />
                      {fieldError('contact_email') && (
                        <p className="text-sm text-red-600 mt-1">{fieldError('contact_email')}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-workshop-charcoal mb-1">
                        {t('tenantRegister.contactPhone')} *
                      </label>
                      <input
                        type="text"
                        value={formData.contact_phone}
                        onChange={(e) => {
                          clearFieldError('contact_phone')
                          setFormData({ ...formData, contact_phone: e.target.value })
                        }}
                        className={inputClass('contact_phone')}
                        placeholder={t('tenantRegister.contactPhonePlaceholder')}
                        required
                      />
                      {fieldError('contact_phone') && (
                        <p className="text-sm text-red-600 mt-1">{fieldError('contact_phone')}</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-workshop-charcoal/10 p-4 space-y-4">
                  <h3 className="text-sm font-semibold text-workshop-charcoal">{t('tenantRegister.adminSectionTitle')}</h3>

                  <div>
                    <label className="block text-sm font-medium text-workshop-charcoal mb-1">
                      {t('tenantRegister.adminUsername')} *
                    </label>
                    <input
                      type="text"
                      value={formData.admin_username}
                      onChange={(e) => {
                        clearFieldError('admin_username')
                        setFormData({ ...formData, admin_username: e.target.value })
                      }}
                      className={inputClass('admin_username')}
                      placeholder={t('tenantRegister.adminUsernamePlaceholder')}
                      required
                    />
                    {fieldError('admin_username') && (
                      <p className="text-sm text-red-600 mt-1">{fieldError('admin_username')}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-workshop-charcoal mb-1">
                      {t('tenantRegister.adminEmail')} *
                    </label>
                    <input
                      type="email"
                      value={formData.admin_email}
                      onChange={(e) => {
                        clearFieldError('admin_email')
                        setFormData({ ...formData, admin_email: e.target.value })
                      }}
                      className={inputClass('admin_email')}
                      placeholder={t('tenantRegister.adminEmailPlaceholder')}
                      required
                    />
                    {fieldError('admin_email') && (
                      <p className="text-sm text-red-600 mt-1">{fieldError('admin_email')}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-workshop-charcoal mb-1">
                      {t('tenantRegister.adminPassword')} *
                    </label>
                    <input
                      type="password"
                      value={formData.admin_password}
                      onChange={(e) => {
                        clearFieldError('admin_password')
                        setFormData({ ...formData, admin_password: e.target.value })
                      }}
                      className={inputClass('admin_password')}
                      placeholder={t('tenantRegister.adminPasswordPlaceholder')}
                      minLength={8}
                      required
                    />
                    {fieldError('admin_password') && (
                      <p className="text-sm text-red-600 mt-1">{fieldError('admin_password')}</p>
                    )}
                    <p className="text-xs text-workshop-charcoal/40 mt-1">{t('tenantRegister.passwordHint')}</p>
                  </div>
                </div>

                <button type="submit" disabled={isLoading} className="btn btn-primary w-full">
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
