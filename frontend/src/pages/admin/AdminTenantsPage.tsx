import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { tenantsApi } from '@/api'
import { AdminField, AdminMobileCard, AdminResponsiveTable } from '@/components/admin/AdminMobile'
import {
  formatTenantSubscription,
  formatSubscriptionPeriodTimeline,
  type SubscriptionDisplayKey,
  type TenantSubscription,
} from '@/lib/tenantSubscription'

interface TenantRow {
  id: string
  name: string
  schema_name: string
  subscription?: TenantSubscription
  subscription_display_key?: SubscriptionDisplayKey
  is_active: boolean
  contact_email: string
  contact_phone: string
  stats: {
    users: number
    clients: number
    vehicles: number
    visits: number
    global_vehicles_registered: number
  }
}

export default function AdminTenantsPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: () => tenantsApi.getDashboard(),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      tenantsApi.update(id, { is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['admin-tenant'] })
    },
  })

  const tenants = (data?.data?.tenants ?? []) as TenantRow[]

  const subscriptionSummary = (tenant: TenantRow) =>
    formatTenantSubscription(tenant.subscription, tenant.subscription_display_key, t)

  const subscriptionPeriod = (tenant: TenantRow) =>
    formatSubscriptionPeriodTimeline(tenant.subscription, t)

  if (isLoading) {
    return (
      <div className="card p-12 flex justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-workshop-blue" />
      </div>
    )
  }

  if (error) {
    return <div className="card p-8 text-red-700">{t('adminTenants.loadFailed')}</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-workshop-charcoal">{t('adminTenants.title')}</h2>
        <p className="text-workshop-charcoal/60 mt-1">{t('adminTenants.subtitle')}</p>
      </div>

      <div className="card overflow-hidden min-w-0">
        <AdminResponsiveTable
          desktop={
            <table className="w-full">
              <thead className="bg-workshop-charcoal/5">
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-medium text-workshop-charcoal/60 uppercase">
                    {t('adminTenants.tableWorkshop')}
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-workshop-charcoal/60 uppercase">
                    {t('adminTenants.tableSubscription')}
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-workshop-charcoal/60 uppercase">
                    {t('adminTenants.tablePeriod')}
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-workshop-charcoal/60 uppercase">
                    {t('adminTenants.tableContact')}
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-workshop-charcoal/60 uppercase">
                    {t('adminTenants.tableUsage')}
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-workshop-charcoal/60 uppercase">
                    {t('adminTenants.tableStatus')}
                  </th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-workshop-charcoal/60 uppercase">
                    {t('adminTenants.tableActions')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-workshop-charcoal/10">
                {tenants.map((tenant) => (
                  <tr key={tenant.id}>
                    <td className="px-6 py-4">
                      <Link
                        to={`/admin/tenants/${tenant.id}`}
                        className="font-medium text-workshop-charcoal hover:text-workshop-blue"
                      >
                        {tenant.name}
                      </Link>
                      <div className="text-xs text-workshop-charcoal/50">{tenant.schema_name}</div>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <Link
                        to="/admin/subscriptions"
                        className="text-workshop-blue hover:underline"
                        title={t('adminTenants.editSubscription')}
                      >
                        {subscriptionSummary(tenant)}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-sm text-workshop-charcoal/70 whitespace-nowrap">
                      {subscriptionPeriod(tenant)}
                    </td>
                    <td className="px-6 py-4 text-sm text-workshop-charcoal/70">
                      {tenant.contact_email || '—'}
                      {tenant.contact_phone && (
                        <div className="text-xs">{tenant.contact_phone}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-workshop-charcoal/70">
                      {t('adminTenants.usageSummary', {
                        users: tenant.stats.users,
                        clients: tenant.stats.clients,
                        vehicles: tenant.stats.vehicles,
                        visits: tenant.stats.visits,
                      })}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                          tenant.is_active
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {tenant.is_active ? t('adminTenants.active') : t('adminTenants.inactive')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        type="button"
                        className="btn btn-secondary text-sm"
                        disabled={toggleMutation.isPending}
                        onClick={() =>
                          toggleMutation.mutate({
                            id: tenant.id,
                            is_active: !tenant.is_active,
                          })
                        }
                      >
                        {tenant.is_active ? t('adminTenants.deactivate') : t('adminTenants.activate')}
                      </button>
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
                <Link to={`/admin/tenants/${tenant.id}`} className="hover:text-workshop-blue">
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
                  {tenant.is_active ? t('adminTenants.active') : t('adminTenants.inactive')}
                </span>
              }
              actions={
                <button
                  type="button"
                  className="btn btn-secondary text-xs px-2 py-1.5"
                  disabled={toggleMutation.isPending}
                  onClick={() =>
                    toggleMutation.mutate({
                      id: tenant.id,
                      is_active: !tenant.is_active,
                    })
                  }
                >
                  {tenant.is_active ? t('adminTenants.deactivate') : t('adminTenants.activate')}
                </button>
              }
            >
              <AdminField label={t('adminTenants.tableSubscription')}>
                <Link to="/admin/subscriptions" className="text-workshop-blue hover:underline">
                  {subscriptionSummary(tenant)}
                </Link>
              </AdminField>
              <AdminField label={t('adminTenants.tablePeriod')}>{subscriptionPeriod(tenant)}</AdminField>
              <AdminField label={t('adminTenants.tableContact')}>
                {tenant.contact_email || '—'}
                {tenant.contact_phone ? ` · ${tenant.contact_phone}` : ''}
              </AdminField>
              <AdminField label={t('adminTenants.tableUsage')}>
                {t('adminTenants.usageSummary', {
                  users: tenant.stats.users,
                  clients: tenant.stats.clients,
                  vehicles: tenant.stats.vehicles,
                  visits: tenant.stats.visits,
                })}
              </AdminField>
            </AdminMobileCard>
          ))}
        />
      </div>
    </div>
  )
}
