import { useState, useEffect } from 'react'
import { Settings, Bell, Shield, Palette, Save, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authApi } from '@/api'
import { useTranslation } from 'react-i18next'
import { normalizeLanguage, setWorkshopLanguage } from '@/lib/i18n'
import { useDispatch } from 'react-redux'
import { setWorkshopLanguage as setWorkshopLanguageInStore } from '@/store/authSlice'
import type { AppDispatch } from '@/store'

export default function SettingsPage() {
  const { t } = useTranslation()
  const dispatch = useDispatch<AppDispatch>()
  const queryClient = useQueryClient()
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('profile')

  // Form state
  const [formData, setFormData] = useState({
    // Profile
    first_name: '',
    last_name: '',
    email: '',
    // Workshop
    workshop_address: '',
    workshop_phone: '',
    workshop_email: '',
    // Preferences
    theme: 'light',
    language: 'sq',
    currency: 'EUR',
    email_notifications: true,
    sms_notifications: false,
    whatsapp_notifications: false,
    // Password
    current_password: '',
    password: '',
    confirm_password: '',
    quick_pin: '',
    confirm_quick_pin: '',
  })
  const [hasQuickPin, setHasQuickPin] = useState(false)

  // Load settings
  const { data: settingsData, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => authApi.getSettings(),
  })

  useEffect(() => {
    if (settingsData?.data) {
      const data = settingsData.data
      setFormData({
        first_name: data.first_name || '',
        last_name: data.last_name || '',
        email: data.email || '',
        workshop_address: data.workshop_address || '',
        workshop_phone: data.workshop_phone || '',
        workshop_email: data.workshop_email || '',
        theme: data.theme || 'light',
        language: data.language || 'sq',
        currency: data.currency || 'EUR',
        email_notifications: data.email_notifications ?? true,
        sms_notifications: data.sms_notifications ?? false,
        whatsapp_notifications: data.whatsapp_notifications ?? false,
        current_password: '',
        password: '',
        confirm_password: '',
        quick_pin: '',
        confirm_quick_pin: '',
      })
      setHasQuickPin(Boolean(data.has_quick_pin))
    }
  }, [settingsData])

  const updateMutation = useMutation({
    mutationFn: (data: any) => authApi.updateSettings(data),
    onSuccess: (_data, variables) => {
      if (variables.quick_pin) {
        setHasQuickPin(true)
      }
      if (variables.language) {
        const lang = normalizeLanguage(variables.language)
        void setWorkshopLanguage(lang)
        dispatch(setWorkshopLanguageInStore(lang))
      }
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      setIsSaving(false)
      setSaved(true)
      setError(null)
      setTimeout(() => setSaved(false), 3000)
      // Clear password fields
      setFormData(prev => ({
        ...prev,
        current_password: '',
        password: '',
        confirm_password: '',
        quick_pin: '',
        confirm_quick_pin: '',
      }))
    },
    onError: (error: any) => {
      setIsSaving(false)
      setError(error.response?.data?.message || t('settings.saveFailed'))
      setTimeout(() => setError(null), 5000)
    },
  })

  const handleSave = () => {
    setIsSaving(true)
    setError(null)
    
    // Prepare data to send (exclude empty password fields)
    const dataToSend: any = {
      first_name: formData.first_name,
      last_name: formData.last_name,
      email: formData.email,
      workshop_address: formData.workshop_address,
      workshop_phone: formData.workshop_phone,
      workshop_email: formData.workshop_email,
      theme: formData.theme,
      language: formData.language,
      currency: formData.currency,
      email_notifications: formData.email_notifications,
      sms_notifications: formData.sms_notifications,
      whatsapp_notifications: formData.whatsapp_notifications,
    }

    // Include password change if fields are filled
    if (formData.password || formData.current_password || formData.confirm_password) {
      dataToSend.current_password = formData.current_password
      dataToSend.password = formData.password
      dataToSend.confirm_password = formData.confirm_password
    }

    if (formData.quick_pin || formData.confirm_quick_pin) {
      dataToSend.current_password = formData.current_password
      dataToSend.quick_pin = formData.quick_pin
      dataToSend.confirm_quick_pin = formData.confirm_quick_pin
    }

    updateMutation.mutate(dataToSend)
  }

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-brand-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage your workshop preferences
          </p>
        </div>
        <button 
          onClick={handleSave} 
          className="btn btn-primary" 
          disabled={isSaving || updateMutation.isPending}
        >
          {isSaving || updateMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              Save Changes
            </>
          )}
        </button>
      </div>

      {/* Alerts */}
      {saved && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-green-600" />
          <span className="text-green-800 font-medium">Settings saved successfully!</span>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600" />
          <span className="text-red-800 font-medium">{error}</span>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-8">
          {[
            { id: 'profile', label: 'Profile', icon: Settings },
            { id: 'notifications', label: 'Notifications', icon: Bell },
            { id: 'appearance', label: 'Appearance', icon: Palette },
            { id: 'security', label: 'Security', icon: Shield },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-brand-primary text-brand-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="max-w-2xl">
        {/* Profile Tab */}
        {activeTab === 'profile' && (
          <div className="card p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Profile Information</h2>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                <input
                  type="text"
                  value={formData.first_name}
                  onChange={(e) => handleInputChange('first_name', e.target.value)}
                  className="input"
                  placeholder="John"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                <input
                  type="text"
                  value={formData.last_name}
                  onChange={(e) => handleInputChange('last_name', e.target.value)}
                  className="input"
                  placeholder="Doe"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                className="input"
                placeholder="john@example.com"
              />
            </div>

            <div className="pt-4 border-t border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Workshop Information</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Workshop Address</label>
                  <textarea
                    value={formData.workshop_address}
                    onChange={(e) => handleInputChange('workshop_address', e.target.value)}
                    className="input min-h-[80px]"
                    placeholder="123 Main Street, City, State 12345"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                    <input
                      type="tel"
                      value={formData.workshop_phone}
                      onChange={(e) => handleInputChange('workshop_phone', e.target.value)}
                      className="input"
                      placeholder="+1 (555) 123-4567"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Workshop Email</label>
                    <input
                      type="email"
                      value={formData.workshop_email}
                      onChange={(e) => handleInputChange('workshop_email', e.target.value)}
                      className="input"
                      placeholder="workshop@example.com"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Notifications Tab */}
        {activeTab === 'notifications' && (
          <div className="card p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Notification Preferences</h2>
            
            {[
              {
                key: 'email_notifications',
                title: 'Email Notifications',
                description: 'Receive maintenance reminders and updates via email',
              },
              {
                key: 'sms_notifications',
                title: 'SMS Notifications',
                description: 'Receive maintenance reminders and updates via SMS',
              },
              {
                key: 'whatsapp_notifications',
                title: 'WhatsApp Notifications',
                description: 'Receive maintenance reminders and updates via WhatsApp',
              },
            ].map((item) => (
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
                    checked={formData[item.key as keyof typeof formData] as boolean}
                    onChange={(e) => handleInputChange(item.key, e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-primary"></div>
                </label>
              </div>
            ))}
          </div>
        )}

        {/* Appearance Tab */}
        {activeTab === 'appearance' && (
          <div className="card p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Appearance Settings</h2>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Theme</label>
              <select
                value={formData.theme}
                onChange={(e) => handleInputChange('theme', e.target.value)}
                className="input"
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="system">System</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('language.label')}</label>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
              <select
                value={formData.currency}
                onChange={(e) => handleInputChange('currency', e.target.value)}
                className="input"
              >
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
                <option value="BRL">BRL (R$)</option>
              </select>
            </div>
          </div>
        )}

        {/* Security Tab */}
        {activeTab === 'security' && (
          <div className="card p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Change Password</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
                <input
                  type="password"
                  value={formData.current_password}
                  onChange={(e) => handleInputChange('current_password', e.target.value)}
                  className="input"
                  placeholder="••••••••"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                  className="input"
                  placeholder="••••••••"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
                <input
                  type="password"
                  value={formData.confirm_password}
                  onChange={(e) => handleInputChange('confirm_password', e.target.value)}
                  className="input"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div className="pt-4">
              <button
                onClick={() => {
                  if (!formData.current_password || !formData.password || !formData.confirm_password) {
                    setError('Please fill in all password fields')
                    return
                  }
                  if (formData.password !== formData.confirm_password) {
                    setError('New passwords do not match')
                    return
                  }
                  handleSave()
                }}
                className="btn btn-outline w-full"
              >
                Update Password
              </button>
            </div>

            <div className="pt-8 mt-8 border-t border-gray-200">
              <h3 className="text-md font-semibold text-gray-900 mb-1">Quick PIN</h3>
              <p className="text-sm text-gray-500 mb-4">
                {hasQuickPin
                  ? 'A PIN is set for quick sign-in at the login screen.'
                  : 'Set a 4–6 digit PIN for quick sign-in (login → Quick PIN tab).'}
              </p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">New PIN</label>
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
                    placeholder="••••"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Confirm PIN</label>
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
                    placeholder="••••"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Use the current password field above when saving a PIN.
              </p>
              <button
                onClick={() => {
                  if (!formData.current_password || !formData.quick_pin || !formData.confirm_quick_pin) {
                    setError('Please fill in current password and both PIN fields')
                    return
                  }
                  if (formData.quick_pin !== formData.confirm_quick_pin) {
                    setError('PINs do not match')
                    return
                  }
                  if (formData.quick_pin.length < 4) {
                    setError('PIN must be at least 4 digits')
                    return
                  }
                  handleSave()
                }}
                className="btn btn-outline w-full mt-4"
              >
                {hasQuickPin ? 'Update PIN' : 'Set PIN'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
