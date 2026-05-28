import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ownerApi, authApi } from '@/api'
import { getApiErrorMessage } from '@/lib/utils'
import OwnerLayout from '@/components/layout/OwnerLayout'

export default function OwnerRegisterPage() {
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
      setError(getApiErrorMessage(err, 'Registration failed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-blue-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Create owner account</h1>
        <p className="text-sm text-gray-600 mb-6">
          Register to add vehicles from workshop QR codes to your personal inventory.
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {(['username', 'email', 'password', 'first_name', 'last_name', 'phone'] as const).map(
            (field) => (
              <div key={field}>
                <label className="block text-sm font-medium text-gray-700 mb-1 capitalize">
                  {field.replace('_', ' ')}
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
            {loading ? 'Creating account…' : 'Register'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-600">
          Already have an account?{' '}
          <Link to="/login" className="text-blue-600 hover:underline">
            Sign in
          </Link>
        </p>
        <p className="mt-2 text-center text-sm text-gray-500">
          Workshop staff?{' '}
          <Link to="/register" className="text-blue-600 hover:underline">
            Register a workshop
          </Link>
        </p>
      </div>
    </div>
  )
}
