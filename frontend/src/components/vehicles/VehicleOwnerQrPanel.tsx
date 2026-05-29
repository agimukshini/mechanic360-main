import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { transfersApi, vehiclesApi } from '@/api'
import { useApiToast } from '@/hooks/useApiToast'
import { getApiErrorMessage } from '@/lib/utils'
import { printQrCode } from '@/lib/printQr'
import { Ban, Printer, QrCode, ShieldCheck, UserCheck } from 'lucide-react'

interface RegistrationRecord {
  license_plate: string
  owner?: { name?: string }
  is_current?: boolean
}

interface PendingTransfer {
  id: string
  status: string
  new_license_plate: string
  initiator_username: string
  initiated_at: string
  expires_at: string
  qr_payload: string
  billing?: { fee_amount: string; fee_currency: string; payment_status: string }
}

interface VehicleOwnerQrPanelProps {
  vehicleId: string
  globalVehicleId?: string | null
  licensePlate: string
  make: string
  model: string
  vin: string
  globalCurrentOwner?: { name?: string } | null
  registrationHistory?: RegistrationRecord[]
}

export default function VehicleOwnerQrPanel({
  vehicleId,
  globalVehicleId,
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
  const [notes, setNotes] = useState('')
  const [editPlate, setEditPlate] = useState('')

  const hasGlobalOwner = Boolean(globalCurrentOwner?.name)
  const displayPlate = editPlate || licensePlate

  // Pending / historical transfers for this vehicle (workshop view).
  const transfersQuery = useQuery({
    queryKey: ['transfers', 'vehicle', globalVehicleId],
    queryFn: () =>
      transfersApi
        .list({ vehicle: globalVehicleId as string })
        .then((r) => (r.data?.results ?? r.data) as PendingTransfer[]),
    enabled: Boolean(globalVehicleId),
  })

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
    onError: (err) => showError(err, 'Failed to generate QR'),
  })

  const transferMutation = useMutation({
    mutationFn: () => {
      if (!globalVehicleId) {
        return Promise.reject(
          new Error('Vehicle is not yet registered in the global registry.'),
        )
      }
      return transfersApi.start({
        vehicle_id: globalVehicleId,
        documents_verified: documentsVerified,
        new_license_plate: newLicensePlate,
        notes,
      })
    },
    onSuccess: (res) => {
      const data = res.data
      setQrData(data.qr.qr_code)
      setQrTitle('Ownership transfer QR')
      setQrLines([
        `New registration: ${data.new_license_plate}`,
        `${make} ${model} · VIN ${vin}`,
        `Fee: ${data.billing?.fee_amount ?? '—'} ${data.billing?.fee_currency ?? ''}`.trim(),
        'New owner scans after document verification',
      ])
      setNewLicensePlate('')
      setNotes('')
      setDocumentsVerified(false)
      transfersQuery.refetch()
      showToast('Transfer initiated — share the QR with the new owner', 'success')
    },
    onError: (err) => showError(err, 'Failed to start transfer'),
  })

  const cancelMutation = useMutation({
    mutationFn: (id: string) => transfersApi.cancel(id),
    onSuccess: () => {
      transfersQuery.refetch()
      showToast('Transfer cancelled', 'success')
    },
    onError: (err) => showError(err, 'Failed to cancel transfer'),
  })

  useEffect(() => {
    // Clear stale QR when the vehicle changes.
    setQrData(null)
  }, [vehicleId])

  const registrationMutation = useMutation({
    mutationFn: (plate: string) => vehiclesApi.updateRegistration(vehicleId, plate),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicle', vehicleId] })
      showToast('Registration plate updated', 'success')
    },
    onError: (err) => showError(err, 'Failed to update registration'),
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

      {transfersQuery.data && transfersQuery.data.length > 0 && (
        <div className="pt-3 border-t border-gray-100">
          <p className="text-sm font-medium text-gray-900 mb-2">Transfers</p>
          <ul className="space-y-2">
            {transfersQuery.data.map((t) => {
              const statusLower = (t.status || '').toLowerCase()
              const badgeClass = {
                pending: 'bg-amber-50 text-amber-800 border-amber-200',
                confirmed: 'bg-emerald-50 text-emerald-800 border-emerald-200',
                cancelled: 'bg-gray-50 text-gray-700 border-gray-200',
                expired: 'bg-gray-50 text-gray-500 border-gray-200',
                disputed: 'bg-red-50 text-red-700 border-red-200',
                reversed: 'bg-purple-50 text-purple-700 border-purple-200',
              }[statusLower] || 'bg-gray-50 text-gray-700 border-gray-200'
              return (
                <li
                  key={t.id}
                  className="rounded-lg border border-gray-200 p-3 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`px-2 py-0.5 rounded-full border text-[10px] font-medium uppercase ${badgeClass}`}>
                      {t.status}
                    </span>
                    <span className="text-gray-500">
                      {new Date(t.initiated_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-gray-700">
                    New plate <span className="font-semibold">{t.new_license_plate}</span>
                    {' · by '}{t.initiator_username}
                  </p>
                  {t.billing && (
                    <p className="text-gray-500">
                      Fee: {t.billing.fee_amount} {t.billing.fee_currency} ({t.billing.payment_status})
                    </p>
                  )}
                  {statusLower === 'pending' && (
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => cancelMutation.mutate(t.id)}
                        disabled={cancelMutation.isPending}
                        className="flex items-center gap-1 text-red-600 hover:text-red-700 disabled:opacity-50"
                      >
                        <Ban className="w-3.5 h-3.5" />
                        Cancel
                      </button>
                    </div>
                  )}
                </li>
              )
            })}
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
          <p className="text-sm text-gray-600 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-amber-600" />
            Transfer: verify documents, enter the buyer&apos;s new plate, then start a tracked transfer.
          </p>
          <input
            value={newLicensePlate}
            onChange={(e) => setNewLicensePlate(e.target.value.toUpperCase())}
            placeholder="New registration plate"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg uppercase text-sm"
          />
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional) — visible to platform support"
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
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
            disabled={!documentsVerified || !newLicensePlate.trim() || transferMutation.isPending || !globalVehicleId}
            className="w-full py-2.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 text-sm"
          >
            {transferMutation.isPending ? 'Starting…' : 'Start transfer & generate QR'}
          </button>
          {!globalVehicleId && (
            <p className="text-xs text-amber-700">
              This vehicle is not yet registered in the global registry. Save it first.
            </p>
          )}
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
