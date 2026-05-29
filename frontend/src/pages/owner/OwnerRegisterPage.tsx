import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ownerApi, authApi } from '@/api'
import { getApiErrorMessage } from '@/lib/utils'

const FIELD_LABEL_KEY: Record<string, string> = {
  username: 'ownerRegister.username',
  email: 'ownerRegister.email',
  password: 'ownerRegister.password',
  first_name: 'ownerRegister.firstName',
  last_name: 'ownerRegister.lastName',
  phone: 'ownerRegister.phone',
}

export default function OwnerRegisterPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    first_name: '',
    last_name: '',
    phone: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await ownerApi.register(form)
      await authApi.login(form.username, form.password)
      navigate('/owner/vehicles')
    } catch (err) {
      setError(getApiErrorMessage(err, t('ownerRegister.registrationFailed')))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-blue-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('ownerRegister.title')}</h1>
        <p className="text-sm text-gray-600 mb-6">
          {t('ownerRegister.subtitle')}
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {(['username', 'email', 'password', 'first_name', 'last_name', 'phone'] as const).map(
            (field) => (
              <div key={field}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t(FIELD_LABEL_KEY[field])}
                  {field === 'username' || field === 'email' || field === 'password' ? ' *' : ''}
                </label>
                <input
                  type={field === 'password' ? 'password' : field === 'email' ? 'email' : 'text'}
                  required={field === 'username' || field === 'email' || field === 'password'}
                  value={form[field]}
                  onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            ),
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg disabled:opacity-50"
          >
            {loading ? t('ownerRegister.creating') : t('ownerRegister.register')}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-600">
          {t('ownerRegister.alreadyHaveAccount')}{' '}
          <Link to="/login" className="text-blue-600 hover:underline">
            {t('ownerRegister.signIn')}
          </Link>
        </p>
        <p className="mt-2 text-center text-sm text-gray-500">
          {t('ownerRegister.workshopStaff')}{' '}
          <Link to="/register" className="text-blue-600 hover:underline">
            {t('ownerRegister.registerWorkshop')}
          </Link>
        </p>
      </div>
    </div>
  )
}
