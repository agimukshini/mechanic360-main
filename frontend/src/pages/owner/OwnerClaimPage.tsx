import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import QRScanner from '@/components/QRScanner'
import { ownerApi } from '@/api'
import { getApiErrorMessage } from '@/lib/utils'
import OwnerLayout from '@/components/layout/OwnerLayout'

interface PreviewVehicle {
  make: string
  model: string
  license_plate: string
  vin: string
}

interface PreviewToken {
  purpose: string
  new_license_plate?: string
}

export default function OwnerClaimPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [token, setToken] = useState(searchParams.get('token') ?? '')
  const [preview, setPreview] = useState<PreviewVehicle | null>(null)
  const [previewToken, setPreviewToken] = useState<PreviewToken | null>(null)
  const [isValid, setIsValid] = useState<boolean | null>(null)
  const [showScanner, setShowScanner] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (token) {
      void loadPreview(token)
    }
  }, [token])

  const loadPreview = async (raw: string) => {
    setError(null)
    try {
      const res = await ownerApi.claimPreview(raw)
      setPreview(res.data.vehicle)
      setPreviewToken(res.data.token ?? null)
      setIsValid(res.data.is_valid)
    } catch (err) {
      setPreview(null)
      setIsValid(false)
      setError(getApiErrorMessage(err, 'Invalid QR code'))
    }
  }

  const handleScan = (code: string) => {
    setShowScanner(false)
    const value = code.startsWith('m360:claim:') ? code.split(':')[2] : code
    setToken(value)
  }

  const handleClaim = async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      await ownerApi.claim(token)
      setSuccess(true)
      setTimeout(() => navigate('/owner/vehicles'), 1500)
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to claim vehicle'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <OwnerLayout>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Add vehicle</h1>
      <p className="text-sm text-gray-600 mb-6">
        Scan the QR code from your workshop after they register the vehicle, or paste the claim code.
      </p>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4 max-w-lg">
        <button
          type="button"
          onClick={() => setShowScanner(true)}
          className="w-full py-2.5 bg-slate-800 text-white rounded-lg hover:bg-slate-900"
        >
          Scan QR code
        </button>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Claim code</label>
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            onBlur={() => token && void loadPreview(token)}
            placeholder="Paste code from QR"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          />
        </div>

        {preview && (
          <div className="p-4 bg-blue-50 rounded-lg">
            <p className="font-medium text-gray-900">{preview.license_plate}</p>
            <p className="text-sm text-gray-700">
              {preview.make} {preview.model}
            </p>
            <p className="text-xs text-gray-500">VIN: {preview.vin}</p>
            {previewToken?.purpose === 'ownership_transfer' && previewToken.new_license_plate && (
              <p className="text-sm text-amber-800 mt-2">
                New registration plate: <strong>{previewToken.new_license_plate}</strong>
              </p>
            )}
            {isValid === false && (
              <p className="text-sm text-amber-700 mt-2">This code is expired or already used.</p>
            )}
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && (
          <p className="text-sm text-green-700">Vehicle added to your inventory!</p>
        )}

        <button
          type="button"
          disabled={!token || loading || isValid === false || success}
          onClick={handleClaim}
          className="w-full py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Adding…' : 'Add to my vehicles'}
        </button>
      </div>

      {showScanner && (
        <QRScanner
          onScanSuccess={handleScan}
          onClose={() => setShowScanner(false)}
        />
      )}
    </OwnerLayout>
  )
}
