import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { tenantsApi } from '@/api'
import { Cog, Loader2 } from 'lucide-react'

export default function TenantRegisterPage() {
  const [formData, setFormData] = useState({
    workshop_name: '',
    admin_username: '',
    admin_email: '',
    admin_password: '',
    website: '',
  })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      console.log('Submitting registration:', formData)
      const response = await tenantsApi.register(formData)
      console.log('Registration successful:', response.data)
      setSuccess(true)
      setTimeout(() => navigate('/login'), 2000)
    } catch (err: any) {
      console.error('Registration error:', err.response?.data)
      const responseData = err.response?.data
      let errorMsg = 'Registration failed. Please try again.'
      
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
          <div className="inline-flex items-center justify-center w-16 h-16 bg-workshop-blue rounded-xl mb-4">
            <Cog className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-workshop-charcoal">Workshop360</h1>
          <p className="text-workshop-charcoal/60 mt-1">Register your workshop</p>
        </div>

        {/* Registration Form */}
        <div className="bg-white rounded-xl shadow-sm border border-workshop-charcoal/10 p-8">
          {success ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-workshop-charcoal mb-2">Workshop Registered!</h2>
              <p className="text-workshop-charcoal/60">Redirecting to login...</p>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-workshop-charcoal mb-6">Create your workshop</h2>

              {error && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm font-semibold text-red-800 mb-1">Registration Error</p>
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
                    Workshop Name *
                  </label>
                  <input
                    type="text"
                    value={formData.workshop_name}
                    onChange={(e) => setFormData({ ...formData, workshop_name: e.target.value })}
                    className="input"
                    placeholder="My Auto Workshop"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-workshop-charcoal mb-1">
                    Admin Username *
                  </label>
                  <input
                    type="text"
                    value={formData.admin_username}
                    onChange={(e) => setFormData({ ...formData, admin_username: e.target.value })}
                    className="input"
                    placeholder="admin"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-workshop-charcoal mb-1">
                    Admin Email *
                  </label>
                  <input
                    type="email"
                    value={formData.admin_email}
                    onChange={(e) => setFormData({ ...formData, admin_email: e.target.value })}
                    className="input"
                    placeholder="admin@myworkshop.com"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-workshop-charcoal mb-1">
                    Admin Password *
                  </label>
                  <input
                    type="password"
                    value={formData.admin_password}
                    onChange={(e) => setFormData({ ...formData, admin_password: e.target.value })}
                    className="input"
                    placeholder="Min 8 characters"
                    minLength={8}
                    required
                  />
                  <p className="text-xs text-workshop-charcoal/40 mt-1">Minimum 8 characters</p>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="btn btn-primary w-full"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating workshop...
                    </>
                  ) : (
                    'Create Workshop'
                  )}
                </button>
              </form>

              <div className="mt-6 text-center">
                <p className="text-sm text-workshop-charcoal/60">
                  Already have an account?{' '}
                  <Link to="/login" className="text-workshop-blue hover:underline font-medium">
                    Sign in
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
