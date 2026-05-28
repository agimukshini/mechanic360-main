import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Building2, Car, ClipboardList, Loader2, Users } from 'lucide-react'
import { tenantsApi } from '@/api'

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
    return <div className="card p-8 text-red-700">Failed to load dashboard.</div>
  }

  const platform = data.data.platform as PlatformStats
  const tenants = data.data.tenants as TenantRow[]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-workshop-charcoal">Dashboard</h2>
        <p className="text-workshop-charcoal/60 mt-1">Platform overview and tenant usage</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Workshops"
          value={platform.tenants_total}
          icon={Building2}
          hint={`${platform.tenants_active} active · ${platform.tenants_inactive} inactive`}
        />
        <StatCard
          label="Pending onboarding"
          value={platform.pending_onboarding}
          icon={ClipboardList}
        />
        <StatCard
          label="Workshop users"
          value={platform.users_total}
          icon={Users}
        />
        <StatCard
          label="Global vehicles"
          value={platform.global_vehicles}
          icon={Car}
          hint={`${platform.global_owners} owners · ${platform.owner_accounts} owner accounts`}
        />
      </div>

      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-workshop-charcoal/10 flex items-center justify-between">
          <h3 className="font-semibold text-workshop-charcoal">Tenants</h3>
          <Link to="/admin/tenants" className="text-sm text-workshop-blue hover:underline">
            View all
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-workshop-charcoal/5">
              <tr>
                <th className="text-left px-6 py-3 text-xs font-medium text-workshop-charcoal/60 uppercase">
                  Workshop
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-workshop-charcoal/60 uppercase">
                  Plan
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-workshop-charcoal/60 uppercase">
                  Users
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-workshop-charcoal/60 uppercase">
                  Clients
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-workshop-charcoal/60 uppercase">
                  Vehicles
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-workshop-charcoal/60 uppercase">
                  Visits
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-workshop-charcoal/60 uppercase">
                  Status
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
                      {tenant.is_active ? 'Active' : 'Inactive'}
                    </span>
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
