import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { tenantsApi } from '@/api'
import { AdminField, AdminMobileCard, AdminResponsiveTable } from '@/components/admin/AdminMobile'

type OnboardingStatus = 'pending' | 'approved' | 'rejected'

interface OnboardingApplication {
  id: string
  workshop_name: string
  address: string
  contact_email: string
  contact_phone: string
  admin_username: string
  admin_email: string
  status: OnboardingStatus
  rejection_reason: string
  tenant_id: string | null
  tenant_schema_name: string | null
  reviewed_by_username: string | null
  reviewed_at: string | null
  created_at: string
}

const STATUS_TABS: { value: OnboardingStatus | 'all'; tk: string }[] = [
  { value: 'pending', tk: 'adminOnboarding.tabPending' },
  { value: 'approved', tk: 'adminOnboarding.tabApproved' },
  { value: 'rejected', tk: 'adminOnboarding.tabRejected' },
  { value: 'all', tk: 'adminOnboarding.tabAll' },
]

function formatDate(value: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

export default function TenantOnboardingAdminPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<OnboardingStatus | 'all'>('pending')
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const queryParams = useMemo(
    () => (statusFilter === 'all' ? undefined : { status: statusFilter }),
    [statusFilter],
  )

  const { data, isLoading, error } = useQuery({
    queryKey: ['onboarding-applications', statusFilter],
    queryFn: () => tenantsApi.listOnboardingApplications(queryParams),
  })

  const invalidateAdminQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['onboarding-applications'] })
    queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] })
  }

  const approveMutation = useMutation({
    mutationFn: (id: string) => tenantsApi.approveOnboardingApplication(id),
    onSuccess: invalidateAdminQueries,
  })

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      tenantsApi.rejectOnboardingApplication(id, reason),
    onSuccess: () => {
      setRejectingId(null)
      setRejectReason('')
      invalidateAdminQueries()
    },
  })

  const applications: OnboardingApplication[] = data?.data?.results ?? data?.data ?? []

  const statusLabel = (s: OnboardingStatus) => {
    if (s === 'pending') return t('adminOnboarding.statusPending')
    if (s === 'approved') return t('adminOnboarding.statusApproved')
    return t('adminOnboarding.statusRejected')
  }

  const renderPendingActions = (application: OnboardingApplication) => {
    if (application.status !== 'pending') {
      return (
        <div className="text-sm text-workshop-charcoal/60">
          {application.reviewed_by_username
            ? t('adminOnboarding.byActor', { name: application.reviewed_by_username })
            : '—'}
          <div>{formatDate(application.reviewed_at)}</div>
        </div>
      )
    }

    return (
      <div className="flex flex-col gap-2 w-full">
        <button
          type="button"
          onClick={() => approveMutation.mutate(application.id)}
          disabled={approveMutation.isPending}
          className="btn btn-primary w-full justify-center"
        >
          {approveMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4 mr-2" />
              {t('adminOnboarding.approve')}
            </>
          )}
        </button>
        {rejectingId === application.id ? (
          <div className="w-full space-y-2">
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="input min-h-[80px] w-full"
              placeholder={t('adminOnboarding.rejectionPlaceholder')}
            />
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                className="btn btn-secondary flex-1"
                onClick={() => {
                  setRejectingId(null)
                  setRejectReason('')
                }}
              >
                {t('adminOnboarding.cancel')}
              </button>
              <button
                type="button"
                className="btn btn-danger flex-1"
                disabled={rejectMutation.isPending}
                onClick={() =>
                  rejectMutation.mutate({
                    id: application.id,
                    reason: rejectReason,
                  })
                }
              >
                {t('adminOnboarding.confirmReject')}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setRejectingId(application.id)}
            className="btn btn-secondary w-full justify-center"
          >
            <XCircle className="w-4 h-4 mr-2" />
            {t('adminOnboarding.reject')}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-workshop-charcoal">{t('adminOnboarding.title')}</h2>
        <p className="text-workshop-charcoal/60 mt-1">
          {t('adminOnboarding.subtitle')}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setStatusFilter(tab.value)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              statusFilter === tab.value
                ? 'bg-workshop-blue text-white'
                : 'bg-white text-workshop-charcoal border border-workshop-charcoal/10 hover:bg-workshop-charcoal/5'
            }`}
          >
            {t(tab.tk)}
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-workshop-blue" />
          </div>
        ) : error ? (
          <div className="p-8 text-center text-red-700">
            {t('adminOnboarding.loadFailed')}
          </div>
        ) : applications.length === 0 ? (
          <div className="p-12 text-center text-workshop-charcoal/60">
            {statusFilter === 'all'
              ? t('adminOnboarding.noApplications')
              : t('adminOnboarding.noApplicationsFiltered', {
                  status: statusLabel(statusFilter as OnboardingStatus),
                })}
          </div>
        ) : (
          <AdminResponsiveTable
            desktop={
              <table className="w-full">
                <thead className="bg-workshop-charcoal/5">
                  <tr>
                    <th className="text-left px-6 py-3 text-xs font-medium text-workshop-charcoal/60 uppercase">
                      {t('adminOnboarding.tableWorkshop')}
                    </th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-workshop-charcoal/60 uppercase">
                      {t('adminOnboarding.tableAdmin')}
                    </th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-workshop-charcoal/60 uppercase">
                      {t('adminOnboarding.tableSubmitted')}
                    </th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-workshop-charcoal/60 uppercase">
                      {t('adminOnboarding.tableStatus')}
                    </th>
                    <th className="text-right px-6 py-3 text-xs font-medium text-workshop-charcoal/60 uppercase">
                      {t('adminOnboarding.tableActions')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-workshop-charcoal/10">
                  {applications.map((application) => (
                    <tr key={application.id} className="align-top">
                      <td className="px-6 py-4">
                        <div className="font-medium text-workshop-charcoal">
                          {application.workshop_name}
                        </div>
                        {application.address && (
                          <div className="text-sm text-workshop-charcoal/60 mt-1">
                            {application.address}
                          </div>
                        )}
                        {(application.contact_email || application.contact_phone) && (
                          <div className="text-sm text-workshop-charcoal/60 mt-1">
                            {[application.contact_email, application.contact_phone]
                              .filter(Boolean)
                              .join(' · ')}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-workshop-charcoal">{application.admin_username}</div>
                        <div className="text-sm text-workshop-charcoal/60">{application.admin_email}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-workshop-charcoal/70">
                        {formatDate(application.created_at)}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                            application.status === 'pending'
                              ? 'bg-amber-100 text-amber-800'
                              : application.status === 'approved'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {statusLabel(application.status)}
                        </span>
                        {application.status === 'rejected' && application.rejection_reason && (
                          <div className="text-sm text-workshop-charcoal/60 mt-2 max-w-xs break-words">
                            {application.rejection_reason}
                          </div>
                        )}
                        {application.status === 'approved' && application.tenant_schema_name && (
                          <div className="text-sm text-workshop-charcoal/60 mt-2">
                            {t('adminOnboarding.schemaPrefix')} {application.tenant_schema_name}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">{renderPendingActions(application)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            }
            mobile={applications.map((application) => (
              <AdminMobileCard
                key={application.id}
                title={application.workshop_name}
                subtitle={formatDate(application.created_at)}
                badge={
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                      application.status === 'pending'
                        ? 'bg-amber-100 text-amber-800'
                        : application.status === 'approved'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {statusLabel(application.status)}
                  </span>
                }
              >
                {application.address && (
                  <AdminField label={t('adminOnboarding.tableWorkshop')}>{application.address}</AdminField>
                )}
                {(application.contact_email || application.contact_phone) && (
                  <AdminField label={t('adminTenants.tableContact')}>
                    {[application.contact_email, application.contact_phone].filter(Boolean).join(' · ')}
                  </AdminField>
                )}
                <AdminField label={t('adminOnboarding.tableAdmin')}>
                  {application.admin_username}
                  <span className="block text-workshop-charcoal/60">{application.admin_email}</span>
                </AdminField>
                {application.status === 'rejected' && application.rejection_reason && (
                  <AdminField label={t('adminOnboarding.tableStatus')}>
                    {application.rejection_reason}
                  </AdminField>
                )}
                {application.status === 'approved' && application.tenant_schema_name && (
                  <AdminField label={t('adminOnboarding.schemaPrefix')}>
                    {application.tenant_schema_name}
                  </AdminField>
                )}
                <div className="pt-2">{renderPendingActions(application)}</div>
              </AdminMobileCard>
            ))}
          />
        )}
      </div>
    </div>
  )
}
