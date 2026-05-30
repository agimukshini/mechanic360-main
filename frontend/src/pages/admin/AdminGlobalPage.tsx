import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { tenantsApi } from '@/api'

export default function AdminGlobalPage() {
  const { t } = useTranslation()
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-global'],
    queryFn: () => tenantsApi.getGlobalRegistry(),
  })

  if (isLoading) {
    return (
      <div className="card p-12 flex justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-workshop-blue" />
      </div>
    )
  }

  if (error || !data?.data) {
    return <div className="card p-8 text-red-700">{t('adminGlobal.loadFailed')}</div>
  }

  const { summary, recent_vehicles } = data.data

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-workshop-charcoal">{t('adminGlobal.title')}</h2>
        <p className="text-workshop-charcoal/60 mt-1">
          {t('adminGlobal.subtitle')}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: t('adminGlobal.globalVehicles'), value: summary.global_vehicles },
          { label: t('adminGlobal.activeVehicles'), value: summary.global_vehicles_active },
          { label: t('adminGlobal.globalOwners'), value: summary.global_owners },
          { label: t('adminGlobal.ownerAccounts'), value: summary.owner_accounts },
          { label: t('adminGlobal.pendingClaims'), value: summary.claim_tokens_pending },
        ].map((item) => (
          <div key={item.label} className="card p-5">
            <p className="text-sm text-workshop-charcoal/60">{item.label}</p>
            <p className="text-2xl font-bold text-workshop-charcoal mt-1">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-workshop-charcoal/10">
          <h3 className="font-semibold text-workshop-charcoal">{t('adminGlobal.recentVehicles')}</h3>
        </div>
        <div className="table-scroll-mobile">
          <table className="w-full">
            <thead className="bg-workshop-charcoal/5">
              <tr>
                <th className="text-left px-6 py-3 text-xs font-medium text-workshop-charcoal/60 uppercase">
                  {t('adminGlobal.tablePlate')}
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-workshop-charcoal/60 uppercase">
                  {t('adminGlobal.tableVin')}
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-workshop-charcoal/60 uppercase">
                  {t('adminGlobal.tableVehicle')}
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-workshop-charcoal/60 uppercase">
                  {t('adminGlobal.tableRegisteredBy')}
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-workshop-charcoal/60 uppercase">
                  {t('adminGlobal.tableRegistered')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-workshop-charcoal/10">
              {recent_vehicles.map((vehicle: {
                id: string
                license_plate: string
                vin: string
                make: string
                model: string
                year: number
                registered_by_tenant_name: string | null
                created_at: string
              }) => (
                <tr key={vehicle.id}>
                  <td className="px-6 py-4 font-medium">{vehicle.license_plate}</td>
                  <td className="px-6 py-4 text-sm font-mono">{vehicle.vin}</td>
                  <td className="px-6 py-4 text-sm">
                    {vehicle.make} {vehicle.model} ({vehicle.year})
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {vehicle.registered_by_tenant_name || '—'}
                  </td>
                  <td className="px-6 py-4 text-sm text-workshop-charcoal/70">
                    {new Date(vehicle.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
