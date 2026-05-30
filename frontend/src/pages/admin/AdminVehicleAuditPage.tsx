import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Loader2, Search } from 'lucide-react'
import { vehicleAuditApi } from '@/api'
import { AdminField, AdminMobileCard, AdminResponsiveTable } from '@/components/admin/AdminMobile'

interface AuditEvent {
  id: string
  tenant_schema: string
  tenant_name: string
  vehicle_tenant_id: string | null
  global_vehicle_id: string | null
  entity: string
  action: string
  target_id: string
  actor_user_id: string | null
  actor_username: string
  actor_role: string
  request_ip: string | null
  request_user_agent: string
  changes: Record<string, { before: unknown; after: unknown }>
  note: string
  occurred_at: string
}

const ENTITY_COLOR: Record<string, string> = {
  vehicle: 'bg-blue-50 text-blue-700 border-blue-200',
  ownership: 'bg-amber-50 text-amber-800 border-amber-200',
  registration: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  photo: 'bg-pink-50 text-pink-700 border-pink-200',
  assignment: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  archive: 'bg-gray-100 text-gray-700 border-gray-300',
  billing: 'bg-emerald-50 text-emerald-700 border-emerald-200',
}

export default function AdminVehicleAuditPage() {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [tenantSchema, setTenantSchema] = useState('')
  const [entity, setEntity] = useState('')
  const [action, setAction] = useState('')
  const [globalVehicleId, setGlobalVehicleId] = useState('')

  const params = useMemo(
    () => ({
      search: search || undefined,
      tenant_schema: tenantSchema || undefined,
      entity: entity || undefined,
      action: action || undefined,
      global_vehicle_id: globalVehicleId || undefined,
    }),
    [search, tenantSchema, entity, action, globalVehicleId],
  )

  const query = useQuery({
    queryKey: ['admin-vehicle-audit', params],
    queryFn: () =>
      vehicleAuditApi.list(params).then((r) => (r.data?.results ?? r.data) as AuditEvent[]),
  })

  const events = query.data ?? []

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-workshop-charcoal">{t('adminVehicleAudit.title')}</h2>
        <p className="text-workshop-charcoal/60 mt-1">
          {t('adminVehicleAudit.subtitle')}
        </p>
      </div>

      <div className="card p-4 grid grid-cols-1 sm:grid-cols-5 gap-3">
        <div className="sm:col-span-2 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('adminVehicleAudit.searchPlaceholder')}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <input
          value={tenantSchema}
          onChange={(e) => setTenantSchema(e.target.value)}
          placeholder={t('adminVehicleAudit.tenantSchemaPlaceholder')}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
        <select
          value={entity}
          onChange={(e) => setEntity(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="">{t('adminVehicleAudit.allEntities')}</option>
          <option value="vehicle">{t('adminVehicleAudit.entityVehicle')}</option>
          <option value="ownership">{t('adminVehicleAudit.entityOwnership')}</option>
          <option value="registration">{t('adminVehicleAudit.entityRegistration')}</option>
          <option value="photo">{t('adminVehicleAudit.entityPhoto')}</option>
          <option value="assignment">{t('adminVehicleAudit.entityAssignment')}</option>
          <option value="archive">{t('adminVehicleAudit.entityArchive')}</option>
          <option value="billing">{t('adminVehicleAudit.entityBilling')}</option>
        </select>
        <select
          value={action}
          onChange={(e) => setAction(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="">{t('adminVehicleAudit.allActions')}</option>
          <option value="created">{t('adminVehicleAudit.actionCreated')}</option>
          <option value="updated">{t('adminVehicleAudit.actionUpdated')}</option>
          <option value="deleted">{t('adminVehicleAudit.actionDeleted')}</option>
          <option value="archived">{t('adminVehicleAudit.actionArchived')}</option>
          <option value="restored">{t('adminVehicleAudit.actionRestored')}</option>
          <option value="transfer_initiated">{t('adminVehicleAudit.actionTransferInitiated')}</option>
          <option value="transfer_confirmed">{t('adminVehicleAudit.actionTransferConfirmed')}</option>
          <option value="transfer_cancelled">{t('adminVehicleAudit.actionTransferCancelled')}</option>
          <option value="transfer_expired">{t('adminVehicleAudit.actionTransferExpired')}</option>
          <option value="transfer_disputed">{t('adminVehicleAudit.actionTransferDisputed')}</option>
          <option value="transfer_reversed">{t('adminVehicleAudit.actionTransferReversed')}</option>
          <option value="claimed">{t('adminVehicleAudit.actionClaimed')}</option>
          <option value="billing_changed">{t('adminVehicleAudit.actionBillingChanged')}</option>
        </select>
        <input
          value={globalVehicleId}
          onChange={(e) => setGlobalVehicleId(e.target.value)}
          placeholder={t('adminVehicleAudit.globalVehicleIdPlaceholder')}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm sm:col-span-5"
        />
      </div>

      {query.isLoading && (
        <div className="card p-12 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-workshop-blue" />
        </div>
      )}

      {!query.isLoading && events.length === 0 && (
        <div className="card p-8 text-sm text-gray-500 text-center">
          {t('adminVehicleAudit.noResults')}
        </div>
      )}

      {events.length > 0 && (
        <div className="card overflow-hidden min-w-0">
          <AdminResponsiveTable
            desktop={
              <table className="w-full text-sm">
                <thead className="bg-workshop-charcoal/5">
                  <tr>
                    <th className="px-3 py-3 text-left font-medium text-workshop-charcoal/60 uppercase text-xs">
                      {t('adminVehicleAudit.tableWhen')}
                    </th>
                    <th className="px-3 py-3 text-left font-medium text-workshop-charcoal/60 uppercase text-xs">
                      {t('adminVehicleAudit.tableWorkshop')}
                    </th>
                    <th className="px-3 py-3 text-left font-medium text-workshop-charcoal/60 uppercase text-xs">
                      {t('adminVehicleAudit.tableActor')}
                    </th>
                    <th className="px-3 py-3 text-left font-medium text-workshop-charcoal/60 uppercase text-xs">
                      {t('adminVehicleAudit.tableEntityAction')}
                    </th>
                    <th className="px-3 py-3 text-left font-medium text-workshop-charcoal/60 uppercase text-xs">
                      {t('adminVehicleAudit.tableTarget')}
                    </th>
                    <th className="px-3 py-3 text-left font-medium text-workshop-charcoal/60 uppercase text-xs">
                      {t('adminVehicleAudit.tableChangesNote')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-workshop-charcoal/10">
                  {events.map((e) => (
                    <tr key={e.id} className="hover:bg-workshop-charcoal/5 align-top">
                      <td className="px-3 py-3 text-xs">
                        <div className="text-gray-700">
                          {new Date(e.occurred_at).toLocaleDateString(undefined, {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </div>
                        <div className="text-gray-400">
                          {new Date(e.occurred_at).toLocaleTimeString(undefined, {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-xs">
                        <p className="font-medium text-gray-800">
                          {e.tenant_name || e.tenant_schema}
                        </p>
                        <p className="text-gray-500">{e.tenant_schema}</p>
                      </td>
                      <td className="px-3 py-3 text-xs">
                        <p className="font-medium text-gray-800">
                          {e.actor_username || <span className="text-gray-400">{t('adminVehicleAudit.system')}</span>}
                        </p>
                        <p className="text-gray-500">{e.actor_role}</p>
                        {e.request_ip && (
                          <p className="text-gray-400 mt-1">
                            <code>{e.request_ip}</code>
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-medium uppercase ${
                            ENTITY_COLOR[e.entity] || 'bg-gray-50 text-gray-700 border-gray-200'
                          }`}
                        >
                          {e.entity}
                        </span>
                        <p className="text-xs text-gray-700 mt-1">{e.action}</p>
                      </td>
                      <td className="px-3 py-3 text-xs">
                        {e.global_vehicle_id && (
                          <code className="text-[10px] text-gray-500 break-all">
                            gv:{e.global_vehicle_id.slice(0, 8)}…
                          </code>
                        )}
                        {e.vehicle_tenant_id && (
                          <code className="text-[10px] text-gray-500 break-all block">
                            tv:{e.vehicle_tenant_id.slice(0, 8)}…
                          </code>
                        )}
                        {e.target_id && (
                          <code className="text-[10px] text-gray-400 break-all block">
                            → {e.target_id.slice(0, 12)}
                          </code>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs max-w-xs">
                        {Object.keys(e.changes).length > 0 && (
                          <ul className="space-y-0.5 mb-1">
                            {Object.entries(e.changes).map(([field, diff]) => (
                              <li key={field} className="text-gray-700 break-words">
                                <code className="text-gray-500">{field}:</code>{' '}
                                <span className="text-red-600 line-through">
                                  {String(diff.before ?? '∅')}
                                </span>{' '}
                                →{' '}
                                <span className="text-emerald-700">
                                  {String(diff.after ?? '∅')}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                        {e.note && (
                          <p className="text-gray-600 italic break-words">{e.note}</p>
                        )}
                        {Object.keys(e.changes).length === 0 && !e.note && (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            }
            mobile={events.map((e) => (
              <AdminMobileCard
                key={e.id}
                title={e.tenant_name || e.tenant_schema}
                subtitle={new Date(e.occurred_at).toLocaleString()}
                badge={
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-medium uppercase ${
                      ENTITY_COLOR[e.entity] || 'bg-gray-50 text-gray-700 border-gray-200'
                    }`}
                  >
                    {e.entity} · {e.action}
                  </span>
                }
              >
                <AdminField label={t('adminVehicleAudit.tableActor')}>
                  {e.actor_username || t('adminVehicleAudit.system')}
                  {e.actor_role ? ` (${e.actor_role})` : ''}
                </AdminField>
                {e.request_ip && (
                  <AdminField label="IP">
                    <code className="text-xs break-all">{e.request_ip}</code>
                  </AdminField>
                )}
                {(e.global_vehicle_id || e.target_id) && (
                  <AdminField label={t('adminVehicleAudit.tableTarget')}>
                    {e.global_vehicle_id && (
                      <span className="block font-mono text-xs break-all">gv:{e.global_vehicle_id}</span>
                    )}
                    {e.target_id && (
                      <span className="block font-mono text-xs break-all">{e.target_id}</span>
                    )}
                  </AdminField>
                )}
                {(Object.keys(e.changes).length > 0 || e.note) && (
                  <AdminField label={t('adminVehicleAudit.tableChangesNote')}>
                    {Object.entries(e.changes).map(([field, diff]) => (
                      <div key={field} className="text-xs break-words mb-1">
                        {field}: {String(diff.before ?? '∅')} → {String(diff.after ?? '∅')}
                      </div>
                    ))}
                    {e.note && <p className="text-xs italic break-words">{e.note}</p>}
                  </AdminField>
                )}
              </AdminMobileCard>
            ))}
          />
        </div>
      )}
    </div>
  )
}
