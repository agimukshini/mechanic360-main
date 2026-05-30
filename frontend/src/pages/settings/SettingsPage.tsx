import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Settings, Bell, Shield, Palette, Save, Loader2, CheckCircle, AlertCircle, ScrollText, Users, UserPlus } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authApi } from '@/api'
import { useTranslation } from 'react-i18next'
import { normalizeLanguage, setWorkshopLanguage } from '@/lib/i18n'
import { getApiErrorMessage } from '@/lib/utils'
import { useDispatch, useSelector } from 'react-redux'
import { setWorkshopLanguage as setWorkshopLanguageInStore } from '@/store/authSlice'
import type { AppDispatch, RootState } from '@/store'
import { isTenantAdmin, normalizeRole } from '@/lib/roles'
import StaffInviteModal from '@/components/settings/StaffInviteModal'
import { UnderlineTabs } from '@/components/ui/PageTabs'

interface SettingsFormData {
  first_name: string
  last_name: string
  email: string
  phone: string
  workshop_address: string
  workshop_phone: string
  workshop_email: string
  theme: string
  language: string
  currency: string
  email_notifications: boolean
  sms_notifications: boolean
  whatsapp_notifications: boolean
  current_password: string
  password: string
  confirm_password: string
  quick_pin: string
  confirm_quick_pin: string
}

const EMPTY_FORM: SettingsFormData = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  workshop_address: '',
  workshop_phone: '',
  workshop_email: '',
  theme: 'light',
  language: 'sq',
  currency: 'EUR',
  email_notifications: true,
  sms_notifications: false,
  whatsapp_notifications: false,
  current_password: '',
  password: '',
  confirm_password: '',
  quick_pin: '',
  confirm_quick_pin: '',
}

export default function SettingsPage() {
  const { t } = useTranslation()
  const dispatch = useDispatch<AppDispatch>()
  const queryClient = useQueryClient()
  const { user } = useSelector((state: RootState) => state.auth)
  const showLoginLogLink = isTenantAdmin(normalizeRole(user?.role))
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('profile')
  const [formData, setFormData] = useState<SettingsFormData>(EMPTY_FORM)
  const [hasQuickPin, setHasQuickPin] = useState(false)
  const [canEditWorkshop, setCanEditWorkshop] = useState(false)

  const { data: settingsData, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => authApi.getSettings(),
  })

  useEffect(() => {
    if (settingsData?.data) {
      const data = settingsData.data
      setFormData({
        ...EMPTY_FORM,
        first_name: data.first_name || '',
        last_name: data.last_name || '',
        email: data.email || '',
        phone: data.phone || '',
        workshop_address: data.workshop_address || '',
        workshop_phone: data.workshop_phone || '',
        workshop_email: data.workshop_email || '',
        theme: data.theme || 'light',
        language: data.language || 'sq',
        currency: data.currency || 'EUR',
        email_notifications: data.email_notifications ?? true,
        sms_notifications: data.sms_notifications ?? false,
        whatsapp_notifications: data.whatsapp_notifications ?? false,
      })
      setHasQuickPin(Boolean(data.has_quick_pin))
      setCanEditWorkshop(Boolean(data.can_edit_workshop))
    }
  }, [settingsData])

  const clearSecurityFields = () => {
    setFormData((prev) => ({
      ...prev,
      current_password: '',
      password: '',
      confirm_password: '',
      quick_pin: '',
      confirm_quick_pin: '',
    }))
  }

  const updateMutation = useMutation({
    mutationFn: (data: object) => authApi.updateSettings(data),
    onSuccess: (_data, variables) => {
      const vars = variables as Partial<SettingsFormData>
      if (vars.quick_pin) {
        setHasQuickPin(true)
      }
      if (vars.language) {
        const lang = normalizeLanguage(vars.language)
        void setWorkshopLanguage(lang)
        dispatch(setWorkshopLanguageInStore(lang))
      }
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      setIsSaving(false)
      setSaved(true)
      setError(null)
      setTimeout(() => setSaved(false), 3000)
      clearSecurityFields()
    },
    onError: (err: unknown) => {
      setIsSaving(false)
      setError(getApiErrorMessage(err, t('settings.saveFailed')))
      setTimeout(() => setError(null), 8000)
    },
  })

  const buildProfilePayload = (): Record<string, unknown> => {
    const payload: Record<string, unknown> = {
      first_name: formData.first_name,
      last_name: formData.last_name,
      email: formData.email,
      phone: formData.phone,
      theme: formData.theme,
      language: formData.language,
      currency: formData.currency,
      email_notifications: formData.email_notifications,
      sms_notifications: formData.sms_notifications,
      whatsapp_notifications: formData.whatsapp_notifications,
    }
    if (canEditWorkshop) {
      payload.workshop_address = formData.workshop_address
      payload.workshop_phone = formData.workshop_phone
      payload.workshop_email = formData.workshop_email
    }
    return payload
  }

  const handleSaveProfile = () => {
    setIsSaving(true)
    setError(null)
    updateMutation.mutate(buildProfilePayload())
  }

  const handleSavePassword = () => {
    setError(null)
    if (!formData.current_password || !formData.password || !formData.confirm_password) {
      setError(t('settings.errors.passwordFieldsRequired'))
      return
    }
    if (formData.password.length < 8) {
      setError(t('settings.errors.passwordMinLength'))
      return
    }
    if (formData.password !== formData.confirm_password) {
      setError(t('settings.errors.passwordMismatch'))
      return
    }
    setIsSaving(true)
    updateMutation.mutate({
      current_password: formData.current_password,
      password: formData.password,
      confirm_password: formData.confirm_password,
    })
  }

  const handleSavePin = () => {
    setError(null)
    if (!formData.current_password || !formData.quick_pin || !formData.confirm_quick_pin) {
      setError(t('settings.errors.pinFieldsRequired'))
      return
    }
    if (formData.quick_pin !== formData.confirm_quick_pin) {
      setError(t('settings.errors.pinMismatch'))
      return
    }
    if (formData.quick_pin.length < 4) {
      setError(t('settings.errors.pinMinLength'))
      return
    }
    setIsSaving(true)
    updateMutation.mutate({
      current_password: formData.current_password,
      quick_pin: formData.quick_pin,
      confirm_quick_pin: formData.confirm_quick_pin,
    })
  }

  const handleInputChange = (field: keyof SettingsFormData, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  const notificationItems = [
    {
      key: 'email_notifications' as const,
      title: t('settings.emailNotifications'),
      description: t('settings.emailNotificationsHint'),
    },
    {
      key: 'sms_notifications' as const,
      title: t('settings.smsNotifications'),
      description: t('settings.smsNotificationsHint'),
    },
    {
      key: 'whatsapp_notifications' as const,
      title: t('settings.whatsappNotifications'),
      description: t('settings.whatsappNotificationsHint'),
    },
  ]

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-brand-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('settings.title')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('settings.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          {showLoginLogLink && (
            <button
              type="button"
              onClick={() => setShowInviteModal(true)}
              className="btn btn-primary"
            >
              <UserPlus className="w-4 h-4 mr-2" />
              {t('settings.addMechanic')}
            </button>
          )}
          {activeTab !== 'security' && (
            <button
              type="button"
              onClick={handleSaveProfile}
              className="btn btn-outline"
              disabled={isSaving || updateMutation.isPending}
            >
              {isSaving || updateMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t('settings.saving')}
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  {t('settings.save')}
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {showLoginLogLink && (
        <StaffInviteModal open={showInviteModal} onClose={() => setShowInviteModal(false)} />
      )}

      {saved && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-green-600" />
          <span className="text-green-800 font-medium">{t('settings.saved')}</span>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <span className="text-red-800 font-medium">{error}</span>
        </div>
      )}

      <UnderlineTabs
        active={activeTab}
        onChange={setActiveTab}
        tabs={[
          { id: 'profile', label: t('settings.profile'), icon: Settings },
          { id: 'notifications', label: t('settings.notifications'), icon: Bell },
          { id: 'appearance', label: t('settings.appearance'), icon: Palette },
          { id: 'security', label: t('settings.security'), icon: Shield },
        ]}
      />

      <div className="max-w-2xl">
        {activeTab === 'profile' && (
          <div className="card p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">{t('settings.profileInfo')}</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('settings.firstName')}
                </label>
                <input
                  type="text"
                  value={formData.first_name}
                  onChange={(e) => handleInputChange('first_name', e.target.value)}
                  className="input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('settings.lastName')}
                </label>
                <input
                  type="text"
                  value={formData.last_name}
                  onChange={(e) => handleInputChange('last_name', e.target.value)}
                  className="input"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('settings.email')}
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                className="input"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('settings.phone')}
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => handleInputChange('phone', e.target.value)}
                className="input"
              />
            </div>

            {canEditWorkshop && (
              <div className="pt-4 border-t border-gray-100 space-y-4">
                <h3 className="text-sm font-semibold text-gray-700">{t('settings.workshopInfo')}</h3>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('settings.workshopAddress')}
                  </label>
                  <textarea
                    value={formData.workshop_address}
                    onChange={(e) => handleInputChange('workshop_address', e.target.value)}
                    className="input min-h-[80px]"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {t('settings.workshopPhone')}
                    </label>
                    <input
                      type="tel"
                      value={formData.workshop_phone}
                      onChange={(e) => handleInputChange('workshop_phone', e.target.value)}
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {t('settings.workshopEmail')}
                    </label>
                    <input
                      type="email"
                      value={formData.workshop_email}
                      onChange={(e) => handleInputChange('workshop_email', e.target.value)}
                      className="input"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'notifications' && (
          <div className="card p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">{t('settings.notifications')}</h2>
            {notificationItems.map((item) => (
              <div
                key={item.key}
                className="flex items-center justify-between p-4 bg-gray-50 rounded-xl"
              >
                <div>
                  <p className="font-medium text-gray-900">{item.title}</p>
                  <p className="text-sm text-gray-500 mt-0.5">{item.description}</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData[item.key]}
                    onChange={(e) => handleInputChange(item.key, e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-primary" />
                </label>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'appearance' && (
          <div className="card p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">{t('settings.appearance')}</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('settings.theme')}
              </label>
              <select
                value={formData.theme}
                onChange={(e) => handleInputChange('theme', e.target.value)}
                className="input"
              >
                <option value="light">{t('settings.themeLight')}</option>
                <option value="dark">{t('settings.themeDark')}</option>
                <option value="system">{t('settings.themeSystem')}</option>
              </select>
            </div>
            {canEditWorkshop && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('language.label')}
                  </label>
                  <select
                    value={formData.language}
                    onChange={(e) => handleInputChange('language', e.target.value)}
                    className="input"
                  >
                    <option value="sq">{t('language.sq')}</option>
                    <option value="en">{t('language.en')}</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">{t('settings.languageHelp')}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('settings.currency')}
                  </label>
                  <select
                    value={formData.currency}
                    onChange={(e) => handleInputChange('currency', e.target.value)}
                    className="input"
                  >
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="GBP">GBP (£)</option>
                    <option value="ALL">ALL (L)</option>
                  </select>
                </div>
              </>
            )}
            {!canEditWorkshop && (
              <p className="text-sm text-gray-500">{t('settings.workshopAdminOnly')}</p>
            )}
          </div>
        )}

        {activeTab === 'security' && (
          <div className="space-y-4">
            {showLoginLogLink && (
              <>
                <div className="card p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-gray-900">{t('team.title')}</p>
                    <p className="text-sm text-gray-500 mt-0.5">{t('team.settingsHint')}</p>
                  </div>
                  <Link
                    to="/settings/team"
                    className="btn btn-outline shrink-0 inline-flex items-center gap-2"
                  >
                    <Users className="w-4 h-4" />
                    {t('team.manageTeam')}
                  </Link>
                </div>
                <div className="card p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-gray-900">{t('loginAudit.title')}</p>
                    <p className="text-sm text-gray-500 mt-0.5">{t('loginAudit.workshopHint')}</p>
                  </div>
                  <Link
                    to="/settings/login-log"
                    className="btn btn-outline shrink-0 inline-flex items-center gap-2"
                  >
                    <ScrollText className="w-4 h-4" />
                    {t('loginAudit.viewLog')}
                  </Link>
                </div>
              </>
            )}

          <div className="card p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">{t('settings.changePassword')}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('settings.currentPassword')}
                </label>
                <input
                  type="password"
                  value={formData.current_password}
                  onChange={(e) => handleInputChange('current_password', e.target.value)}
                  className="input"
                  autoComplete="current-password"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('settings.newPassword')}
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                  className="input"
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('settings.confirmPassword')}
                </label>
                <input
                  type="password"
                  value={formData.confirm_password}
                  onChange={(e) => handleInputChange('confirm_password', e.target.value)}
                  className="input"
                  autoComplete="new-password"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={handleSavePassword}
              className="btn btn-outline w-full"
              disabled={isSaving || updateMutation.isPending}
            >
              {t('settings.updatePassword')}
            </button>

            <div className="pt-8 mt-8 border-t border-gray-200">
              <h3 className="text-md font-semibold text-gray-900 mb-1">{t('settings.quickPin')}</h3>
              <p className="text-sm text-gray-500 mb-4">
                {hasQuickPin ? t('settings.quickPinSet') : t('settings.quickPinUnset')}
              </p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('settings.newPin')}
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={formData.quick_pin}
                    onChange={(e) =>
                      handleInputChange('quick_pin', e.target.value.replace(/\D/g, ''))
                    }
                    className="input tracking-widest"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('settings.confirmPin')}
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={formData.confirm_quick_pin}
                    onChange={(e) =>
                      handleInputChange('confirm_quick_pin', e.target.value.replace(/\D/g, ''))
                    }
                    className="input tracking-widest"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">{t('settings.pinCurrentPasswordHint')}</p>
              <button
                type="button"
                onClick={handleSavePin}
                className="btn btn-outline w-full mt-4"
                disabled={isSaving || updateMutation.isPending}
              >
                {hasQuickPin ? t('settings.updatePin') : t('settings.setPin')}
              </button>
            </div>
          </div>
          </div>
        )}
      </div>
    </div>
  )
}
