import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Building2, Car, ClipboardList, Loader2, Users } from 'lucide-react'
import { tenantsApi } from '@/api'
import { AdminField, AdminMobileCard, AdminResponsiveTable } from '@/components/admin/AdminMobile'

interface PlatformStats {
  tenants_total: number
  tenants_active: number
  tenants_inactive: number
  pending_onboarding: number
  users_total: number
  owner_accounts: number
  global_vehicles: number
  global_owners: number
  marketplace_listings: number
}

interface TenantRow {
  id: string
  name: string
  schema_name: string
  subscription_plan: string
  is_active: boolean
  stats: {
    users: number
    clients: number
    vehicles: number
    visits: number
  }
}

function StatCard({
  label,
  value,
  icon: Icon,
  hint,
}: {
  label: string
  value: number
  icon: React.ComponentType<{ className?: string }>
  hint?: string
}) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-workshop-charcoal/60">{label}</p>
          <p className="text-2xl font-bold text-workshop-charcoal mt-1">{value}</p>
          {hint && <p className="text-xs text-workshop-charcoal/50 mt-1">{hint}</p>}
        </div>
        <div className="w-10 h-10 rounded-lg bg-workshop-blue/10 flex items-center justify-center">
          <Icon className="w-5 h-5 text-workshop-blue" />
        </div>
      </div>
    </div>
  )
}

export default function AdminDashboardPage() {
  const { t } = useTranslation()
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: () => tenantsApi.getDashboard(),
  })

  if (isLoading) {
    return (
      <div className="card p-12 flex justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-workshop-blue" />
      </div>
    )
  }

  if (error || !data?.data) {
    return <div className="card p-8 text-red-700">{t('adminDashboard.loadFailed')}</div>
  }

  const platform = data.data.platform as PlatformStats
  const tenants = data.data.tenants as TenantRow[]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-workshop-charcoal">{t('adminDashboard.title')}</h2>
        <p className="text-workshop-charcoal/60 mt-1">{t('adminDashboard.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label={t('adminDashboard.workshops')}
          value={platform.tenants_total}
          icon={Building2}
          hint={t('adminDashboard.workshopsHint', {
            active: platform.tenants_active,
            inactive: platform.tenants_inactive,
          })}
        />
        <StatCard
          label={t('adminDashboard.pendingOnboarding')}
          value={platform.pending_onboarding}
          icon={ClipboardList}
        />
        <StatCard
          label={t('adminDashboard.workshopUsers')}
          value={platform.users_total}
          icon={Users}
        />
        <StatCard
          label={t('adminDashboard.globalVehicles')}
          value={platform.global_vehicles}
          icon={Car}
          hint={t('adminDashboard.globalVehiclesHint', {
            owners: platform.global_owners,
            accounts: platform.owner_accounts,
          })}
        />
      </div>

      <div className="card overflow-hidden min-w-0">
        <div className="px-4 sm:px-6 py-4 border-b border-workshop-charcoal/10 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-workshop-charcoal">{t('adminDashboard.tenants')}</h3>
          <Link to="/admin/tenants" className="text-sm text-workshop-blue hover:underline">
            {t('adminDashboard.viewAll')}
          </Link>
        </div>
        <AdminResponsiveTable
          desktop={
            <table className="w-full">
              <thead className="bg-workshop-charcoal/5">
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-medium text-workshop-charcoal/60 uppercase">
                    {t('adminDashboard.tableWorkshop')}
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-workshop-charcoal/60 uppercase">
                    {t('adminDashboard.tablePlan')}
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-workshop-charcoal/60 uppercase">
                    {t('adminDashboard.tableUsers')}
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-workshop-charcoal/60 uppercase">
                    {t('adminDashboard.tableClients')}
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-workshop-charcoal/60 uppercase">
                    {t('adminDashboard.tableVehicles')}
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-workshop-charcoal/60 uppercase">
                    {t('adminDashboard.tableVisits')}
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-workshop-charcoal/60 uppercase">
                    {t('adminDashboard.tableStatus')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-workshop-charcoal/10">
                {tenants.map((tenant) => (
                  <tr key={tenant.id} className="hover:bg-workshop-charcoal/5">
                    <td className="px-6 py-4">
                      <Link
                        to={`/admin/tenants/${tenant.id}`}
                        className="font-medium text-workshop-charcoal hover:text-workshop-blue"
                      >
                        {tenant.name}
                      </Link>
                      <div className="text-xs text-workshop-charcoal/50">{tenant.schema_name}</div>
                    </td>
                    <td className="px-6 py-4 text-sm">{tenant.subscription_plan}</td>
                    <td className="px-6 py-4 text-sm">{tenant.stats.users}</td>
                    <td className="px-6 py-4 text-sm">{tenant.stats.clients}</td>
                    <td className="px-6 py-4 text-sm">{tenant.stats.vehicles}</td>
                    <td className="px-6 py-4 text-sm">{tenant.stats.visits}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                          tenant.is_active
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {tenant.is_active ? t('adminDashboard.active') : t('adminDashboard.inactive')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
          mobile={tenants.map((tenant) => (
            <AdminMobileCard
              key={tenant.id}
              title={
                <Link
                  to={`/admin/tenants/${tenant.id}`}
                  className="hover:text-workshop-blue"
                  onClick={(e) => e.stopPropagation()}
                >
                  {tenant.name}
                </Link>
              }
              subtitle={tenant.schema_name}
              badge={
                <span
                  className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                    tenant.is_active
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                  }`}
                >
                  {tenant.is_active ? t('adminDashboard.active') : t('adminDashboard.inactive')}
                </span>
              }
            >
              <AdminField label={t('adminDashboard.tablePlan')}>{tenant.subscription_plan}</AdminField>
              <AdminField label={t('adminDashboard.tableUsers')}>{tenant.stats.users}</AdminField>
              <AdminField label={t('adminDashboard.tableClients')}>{tenant.stats.clients}</AdminField>
              <AdminField label={t('adminDashboard.tableVehicles')}>{tenant.stats.vehicles}</AdminField>
              <AdminField label={t('adminDashboard.tableVisits')}>{tenant.stats.visits}</AdminField>
            </AdminMobileCard>
          ))}
        />
      </div>
    </div>
  )
}
