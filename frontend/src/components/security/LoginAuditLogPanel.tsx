import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { authApi } from '@/api'

export type LoginAuditScope = 'tenant' | 'platform'

interface LoginAuditEvent {
  id: string
  username_attempted: string
  user_display: string | null
  tenant_name: string | null
  outcome: string
  auth_method: string
  ip_address: string | null
  user_agent: string
  created_at: string
}

const OUTCOME_KEYS = [
  'success',
  'failed_password',
  'failed_pin',
  'failed_unknown_user',
  'failed_inactive',
  'failed_tenant_inactive',
] as const

function formatDate(value: string) {
  return new Date(value).toLocaleString()
}

type LoginAuditLogPanelProps = {
  scope: LoginAuditScope
}

export default function LoginAuditLogPanel({ scope }: LoginAuditLogPanelProps) {
  const { t } = useTranslation()
  const [outcomeFilter, setOutcomeFilter] = useState<string>('all')
  const [usernameFilter, setUsernameFilter] = useState('')

  const queryParams = useMemo(() => {
    const params: Record<string, string> = { days: '30' }
    if (scope === 'platform' && outcomeFilter !== 'all') {
      params.outcome = outcomeFilter
    }
    if (scope === 'platform' && usernameFilter.trim()) {
      params.username = usernameFilter.trim()
    }
    return params
  }, [scope, outcomeFilter, usernameFilter])

  const { data, isLoading, error } = useQuery({
    queryKey: ['login-audit', scope, queryParams],
    queryFn: () =>
      scope === 'platform'
        ? authApi.getAdminLoginAudit(queryParams)
        : authApi.getLoginAudit(queryParams),
  })

  const events: LoginAuditEvent[] = data?.data?.results ?? data?.data ?? []

  const outcomeLabel = (outcome: string) => {
    const key = OUTCOME_KEYS.find((k) => k === outcome)
    return key ? t(`loginAudit.outcomes.${key}`) : outcome
  }

  const authMethodLabel = (method: string) => {
    if (method === 'password') return t('loginAudit.methods.password')
    if (method === 'pin') return t('loginAudit.methods.pin')
    if (method === 'refresh') return t('loginAudit.methods.refresh')
    return method
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-workshop-charcoal">{t('loginAudit.title')}</h2>
        <p className="text-workshop-charcoal/60 mt-1">{t('loginAudit.subtitle')}</p>
      </div>

      {scope === 'platform' && (
        <div className="flex flex-wrap gap-3">
          <select
            value={outcomeFilter}
            onChange={(e) => setOutcomeFilter(e.target.value)}
            className="input max-w-xs"
          >
            <option value="all">{t('loginAudit.filters.allOutcomes')}</option>
            {OUTCOME_KEYS.map((key) => (
              <option key={key} value={key}>
                {t(`loginAudit.outcomes.${key}`)}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={usernameFilter}
            onChange={(e) => setUsernameFilter(e.target.value)}
            placeholder={t('loginAudit.filters.username')}
            className="input max-w-xs"
          />
        </div>
      )}

      {isLoading && (
        <div className="card p-12 flex justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-workshop-blue" />
        </div>
      )}

      {error && (
        <div className="card p-8 text-red-700">{t('loginAudit.loadFailed')}</div>
      )}

      {!isLoading && !error && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-workshop-charcoal/5">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-workshop-charcoal/60">
                    {t('loginAudit.columns.time')}
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-workshop-charcoal/60">
                    {t('loginAudit.columns.username')}
                  </th>
                  {scope === 'platform' && (
                    <th className="text-left px-4 py-3 font-medium text-workshop-charcoal/60">
                      {t('loginAudit.columns.workshop')}
                    </th>
                  )}
                  <th className="text-left px-4 py-3 font-medium text-workshop-charcoal/60">
                    {t('loginAudit.columns.outcome')}
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-workshop-charcoal/60">
                    {t('loginAudit.columns.method')}
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-workshop-charcoal/60">
                    {t('loginAudit.columns.ip')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-workshop-charcoal/10">
                {events.length === 0 ? (
                  <tr>
                    <td colSpan={scope === 'platform' ? 6 : 5} className="px-4 py-8 text-center text-workshop-charcoal/50">
                      {t('loginAudit.empty')}
                    </td>
                  </tr>
                ) : (
                  events.map((event) => (
                    <tr key={event.id} className="hover:bg-workshop-charcoal/5">
                      <td className="px-4 py-3 whitespace-nowrap">{formatDate(event.created_at)}</td>
                      <td className="px-4 py-3 font-medium">{event.username_attempted}</td>
                      {scope === 'platform' && (
                        <td className="px-4 py-3">{event.tenant_name || '—'}</td>
                      )}
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                            event.outcome === 'success'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {outcomeLabel(event.outcome)}
                        </span>
                      </td>
                      <td className="px-4 py-3">{authMethodLabel(event.auth_method)}</td>
                      <td className="px-4 py-3 font-mono text-xs">{event.ip_address || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
