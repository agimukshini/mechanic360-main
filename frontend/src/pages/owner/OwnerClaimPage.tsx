import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
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

interface TransferDetails {
  id: string
  status: string
  new_license_plate: string
  initiator_username: string
  initiated_at: string
  tenant_name: string
  from_owner?: { name?: string } | null
  billing?: { fee_amount: string; fee_currency: string; payment_status: string }
}

export default function OwnerClaimPage() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [token, setToken] = useState(searchParams.get('token') ?? '')
  const [preview, setPreview] = useState<PreviewVehicle | null>(null)
  const [previewToken, setPreviewToken] = useState<PreviewToken | null>(null)
  const [transfer, setTransfer] = useState<TransferDetails | null>(null)
  const [isValid, setIsValid] = useState<boolean | null>(null)
  const [showScanner, setShowScanner] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const isTransfer = previewToken?.purpose === 'ownership_transfer'

  useEffect(() => {
    if (token) {
      void loadPreview(token)
    }
  }, [token])

  const loadPreview = async (raw: string) => {
    setError(null)
    setTransfer(null)
    try {
      const res = await ownerApi.claimPreview(raw)
      setPreview(res.data.vehicle)
      setPreviewToken(res.data.token ?? null)
      setIsValid(res.data.is_valid)

      // For ownership transfers, also load the OwnershipTransfer row so we
      // can show fee, initiator, etc. before the owner confirms.
      if (res.data.token?.purpose === 'ownership_transfer') {
        try {
          const tr = await ownerApi.listTransfers({ token: raw })
          const list = (tr.data?.results ?? tr.data) as TransferDetails[]
          if (list.length > 0) {
            setTransfer(list[0])
          }
        } catch {
          // Best-effort — preview still renders without the transfer details.
        }
      }
    } catch (err) {
      setPreview(null)
      setIsValid(false)
      setError(getApiErrorMessage(err, t('ownerClaim.errInvalidQr')))
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
      // Ownership transfer? Use the lifecycle endpoint so we get audit + billing.
      if (isTransfer && transfer) {
        await ownerApi.confirmTransfer(transfer.id)
      } else {
        await ownerApi.claim(token)
      }
      setSuccess(true)
      setTimeout(() => navigate('/owner/vehicles'), 1500)
    } catch (err) {
      setError(getApiErrorMessage(err, t('ownerClaim.errAddVehicle')))
    } finally {
      setLoading(false)
    }
  }

  return (
    <OwnerLayout>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('ownerClaim.title')}</h1>
      <p className="text-sm text-gray-600 mb-6">
        {t('ownerClaim.subtitle')}
      </p>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4 max-w-lg">
        <button
          type="button"
          onClick={() => setShowScanner(true)}
          className="w-full py-2.5 bg-slate-800 text-white rounded-lg hover:bg-slate-900"
        >
          {t('ownerClaim.scanQr')}
        </button>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t('ownerClaim.claimCode')}</label>
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            onBlur={() => token && void loadPreview(token)}
            placeholder={t('ownerClaim.pastePlaceholder')}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
          />
        </div>

        {preview && (
          <div className={`p-4 rounded-lg ${isTransfer ? 'bg-amber-50 border border-amber-200' : 'bg-blue-50'}`}>
            {isTransfer && (
              <p className="text-xs uppercase tracking-wider font-semibold text-amber-800 mb-2">
                {t('ownerClaim.ownershipTransfer')}
              </p>
            )}
            <p className="font-medium text-gray-900">{preview.license_plate}</p>
            <p className="text-sm text-gray-700">
              {preview.make} {preview.model}
            </p>
            <p className="text-xs text-gray-500">VIN: {preview.vin}</p>

            {isTransfer && previewToken?.new_license_plate && (
              <p className="text-sm text-amber-800 mt-2">
                {t('ownerClaim.newPlate')} <strong>{previewToken.new_license_plate}</strong>
              </p>
            )}

            {transfer && (
              <div className="mt-3 space-y-1 text-xs text-gray-700">
                <p>
                  <span className="text-gray-500">{t('ownerClaim.from')}</span>{' '}
                  <span className="font-medium">
                    {transfer.from_owner?.name || t('ownerClaim.unknown')}
                  </span>
                </p>
                <p>
                  <span className="text-gray-500">{t('ownerClaim.initiatedBy')}</span>{' '}
                  <span className="font-medium">{transfer.initiator_username}</span>
                  {transfer.tenant_name && (
                    <>
                      {t('ownerClaim.atSeparator')}
                      <span className="font-medium">{transfer.tenant_name}</span>
                    </>
                  )}
                </p>
                <p className="text-gray-500">
                  {new Date(transfer.initiated_at).toLocaleString()}
                </p>
                {transfer.billing && (
                  <p className="pt-1 border-t border-amber-200 mt-2">
                    <span className="text-gray-500">{t('ownerClaim.transferFee')}</span>{' '}
                    <span className="font-semibold">
                      {transfer.billing.fee_amount} {transfer.billing.fee_currency}
                    </span>
                    {' · '}
                    <span className="text-gray-500">{transfer.billing.payment_status}</span>
                  </p>
                )}
              </div>
            )}

            {isValid === false && (
              <p className="text-sm text-amber-700 mt-2">{t('ownerClaim.expired')}</p>
            )}
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && (
          <p className="text-sm text-green-700">{t('ownerClaim.addedSuccess')}</p>
        )}

        <button
          type="button"
          disabled={!token || loading || isValid === false || success}
          onClick={handleClaim}
          className={`w-full py-2.5 text-white rounded-lg disabled:opacity-50 ${
            isTransfer
              ? 'bg-amber-600 hover:bg-amber-700'
              : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {loading
            ? isTransfer
              ? t('ownerClaim.confirming')
              : t('ownerClaim.adding')
            : isTransfer
              ? t('ownerClaim.confirmTransfer')
              : t('ownerClaim.addToMyVehicles')}
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
