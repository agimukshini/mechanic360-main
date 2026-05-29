import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ownerApi } from '@/api'
import { getApiErrorMessage } from '@/lib/utils'
import OwnerLayout from '@/components/layout/OwnerLayout'

interface OwnerVehicle {
  id: string
  license_plate: string
  make: string
  model: string
  year: number
  vin: string
  odometer_km: number
}

export default function OwnerVehiclesList() {
  const { t } = useTranslation()
  const [vehicles, setVehicles] = useState<OwnerVehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ownerApi
      .listVehicles()
      .then((res) => setVehicles(res.data.results ?? res.data))
      .catch((err) => setError(getApiErrorMessage(err, t('ownerVehicles.loadFailed'))))
      .finally(() => setLoading(false))
  }, [t])

  return (
    <OwnerLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('ownerVehicles.title')}</h1>
          <p className="text-sm text-gray-600 mt-1">
            {t('ownerVehicles.subtitle')}
          </p>
        </div>
        <Link
          to="/owner/claim"
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
        >
          {t('ownerVehicles.addVehicle')}
        </Link>
      </div>

      {loading && <p className="text-gray-500">{t('ownerVehicles.loading')}</p>}
      {error && <p className="text-red-600">{error}</p>}

      {!loading && !error && vehicles.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <p className="text-gray-600 mb-4">{t('ownerVehicles.empty')}</p>
          <Link to="/owner/claim" className="text-blue-600 hover:underline">
            {t('ownerVehicles.emptyHint')}
          </Link>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {vehicles.map((v) => (
          <Link
            key={v.id}
            to={`/owner/vehicles/${v.id}`}
            className="block bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:border-blue-400 hover:shadow-md transition-colors"
          >
            <p className="text-lg font-bold text-gray-900 break-words">{v.license_plate}</p>
            <p className="text-gray-700 break-words">
              {v.make} {v.model} ({v.year})
            </p>
            <p className="text-sm text-gray-500 mt-1 font-mono break-all">{t('ownerVehicles.vinPrefix')}: {v.vin}</p>
            <p className="text-sm text-gray-500">{v.odometer_km.toLocaleString()} km</p>
            <p className="text-xs text-blue-600 mt-3 font-medium">
              {t('ownerVehicles.viewHistory')}
            </p>
          </Link>
        ))}
      </div>
    </OwnerLayout>
  )
}
