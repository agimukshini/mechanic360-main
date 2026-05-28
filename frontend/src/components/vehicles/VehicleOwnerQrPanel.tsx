import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { vehiclesApi } from '@/api'
import { useApiToast } from '@/hooks/useApiToast'
import { getApiErrorMessage } from '@/lib/utils'
import { printQrCode } from '@/lib/printQr'
import { Printer, QrCode, UserCheck } from 'lucide-react'

interface RegistrationRecord {
  license_plate: string
  owner?: { name?: string }
  is_current?: boolean
}

interface VehicleOwnerQrPanelProps {
  vehicleId: string
  licensePlate: string
  make: string
  model: string
  vin: string
  globalCurrentOwner?: { name?: string } | null
  registrationHistory?: RegistrationRecord[]
}

export default function VehicleOwnerQrPanel({
  vehicleId,
  licensePlate,
  make,
  model,
  vin,
  globalCurrentOwner,
  registrationHistory = [],
}: VehicleOwnerQrPanelProps) {
  const queryClient = useQueryClient()
  const { showError, showToast } = useApiToast()
  const [qrData, setQrData] = useState<string | null>(null)
  const [qrTitle, setQrTitle] = useState('')
  const [qrLines, setQrLines] = useState<string[]>([])
  const [documentsVerified, setDocumentsVerified] = useState(false)
  const [newLicensePlate, setNewLicensePlate] = useState('')
  const [editPlate, setEditPlate] = useState('')

  const hasGlobalOwner = Boolean(globalCurrentOwner?.name)
  const displayPlate = editPlate || licensePlate

  const ownerClaimMutation = useMutation({
    mutationFn: () => vehiclesApi.ownerClaimQr(vehicleId),
    onSuccess: (res) => {
      setQrData(res.data.qr_code)
      setQrTitle('Owner claim QR')
      setQrLines([
        `${licensePlate} — ${make} ${model}`,
        'Owner scans to add this vehicle to their app',
        `Expires: ${new Date(res.data.expires_at).toLocaleString()}`,
      ])
      showToast('Owner claim QR generated', 'success')
    },
    onError: (err) => showError(getApiErrorMessage(err, 'Failed to generate QR')),
  })

  const transferMutation = useMutation({
    mutationFn: () => vehiclesApi.transferQr(vehicleId, documentsVerified, newLicensePlate),
    onSuccess: (res) => {
      setQrData(res.data.qr_code)
      setQrTitle('Ownership transfer QR')
      setQrLines([
        `New registration: ${res.data.new_license_plate}`,
        `${make} ${model} · VIN ${vin}`,
        'New owner scans after document verification',
      ])
      showToast('Transfer QR generated', 'success')
    },
    onError: (err) => showError(getApiErrorMessage(err, 'Failed to generate transfer QR')),
  })

  const registrationMutation = useMutation({
    mutationFn: (plate: string) => vehiclesApi.updateRegistration(vehicleId, plate),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicle', vehicleId] })
      showToast('Registration plate updated', 'success')
    },
    onError: (err) => showError(getApiErrorMessage(err, 'Failed to update registration')),
  })

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-4">
      <div>
        <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
          <QrCode className="w-4 h-4" />
          Owner & registration
        </h3>
        <p className="text-xs text-gray-500 mt-1">
          VIN is permanent. Registration plate can change with each owner (XK/AL).
        </p>
      </div>

      <p className="text-sm text-gray-600">
        App owner: {globalCurrentOwner?.name ?? 'Not linked yet'}
      </p>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">Current registration plate</label>
        <div className="flex gap-2">
          <input
            value={displayPlate}
            onChange={(e) => setEditPlate(e.target.value.toUpperCase())}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg uppercase text-sm"
          />
          <button
            type="button"
            onClick={() => registrationMutation.mutate(displayPlate)}
            disabled={registrationMutation.isPending || !displayPlate.trim()}
            className="px-3 py-2 bg-gray-800 text-white text-sm rounded-lg disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>

      {registrationHistory.length > 0 && (
        <div>
          <p className="text-sm font-medium text-gray-900 mb-1">Registration history</p>
          <ul className="text-xs text-gray-600 space-y-1">
            {registrationHistory.map((entry) => (
              <li key={`${entry.license_plate}-${entry.is_current}`}>
                <span className="font-medium text-gray-800">{entry.license_plate}</span>
                {' · '}
                {entry.owner?.name ?? '—'}
                {entry.is_current ? ' (current)' : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!hasGlobalOwner ? (
        <button
          type="button"
          onClick={() => ownerClaimMutation.mutate()}
          disabled={ownerClaimMutation.isPending}
          className="w-full py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2 text-sm"
        >
          <UserCheck className="w-4 h-4" />
          Generate owner claim QR
        </button>
      ) : (
        <div className="space-y-3 pt-2 border-t border-gray-100">
          <p className="text-sm text-gray-600">
            Transfer: verify documents, enter the buyer&apos;s new plate, then generate a transfer QR.
          </p>
          <input
            value={newLicensePlate}
            onChange={(e) => setNewLicensePlate(e.target.value.toUpperCase())}
            placeholder="New registration plate"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg uppercase text-sm"
          />
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={documentsVerified}
              onChange={(e) => setDocumentsVerified(e.target.checked)}
            />
            I verified identity documents for the new owner
          </label>
          <button
            type="button"
            onClick={() => transferMutation.mutate()}
            disabled={!documentsVerified || !newLicensePlate.trim() || transferMutation.isPending}
            className="w-full py-2.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 text-sm"
          >
            Generate transfer QR
          </button>
        </div>
      )}

      {qrData && (
        <div className="pt-3 border-t text-center">
          <img src={qrData} alt="QR code" className="mx-auto w-40 h-40" />
          <button
            type="button"
            onClick={() => printQrCode({ qrCodeData: qrData, title: qrTitle, lines: qrLines })}
            className="mt-2 inline-flex items-center gap-2 text-sm text-brand-primary hover:underline"
          >
            <Printer className="w-4 h-4" />
            Print QR
          </button>
        </div>
      )}
    </div>
  )
}
