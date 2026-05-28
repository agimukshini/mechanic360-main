import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { tenantsApi } from '@/api'

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

const STATUS_TABS: { value: OnboardingStatus | 'all'; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all', label: 'All' },
]

function formatDate(value: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

export default function TenantOnboardingAdminPage() {
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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-workshop-charcoal">Onboarding queue</h2>
        <p className="text-workshop-charcoal/60 mt-1">
          Review workshop signup requests before tenant schemas and admin accounts are created.
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
            {tab.label}
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
            Failed to load onboarding applications.
          </div>
        ) : applications.length === 0 ? (
          <div className="p-12 text-center text-workshop-charcoal/60">
            No {statusFilter === 'all' ? '' : `${statusFilter} `}applications found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-workshop-charcoal/5">
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-medium text-workshop-charcoal/60 uppercase">
                    Workshop
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-workshop-charcoal/60 uppercase">
                    Admin
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-workshop-charcoal/60 uppercase">
                    Submitted
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-workshop-charcoal/60 uppercase">
                    Status
                  </th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-workshop-charcoal/60 uppercase">
                    Actions
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
                        {application.status}
                      </span>
                      {application.status === 'rejected' && application.rejection_reason && (
                        <div className="text-sm text-workshop-charcoal/60 mt-2 max-w-xs">
                          {application.rejection_reason}
                        </div>
                      )}
                      {application.status === 'approved' && application.tenant_schema_name && (
                        <div className="text-sm text-workshop-charcoal/60 mt-2">
                          Schema: {application.tenant_schema_name}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {application.status === 'pending' ? (
                        <div className="flex flex-col items-end gap-2">
                          <button
                            type="button"
                            onClick={() => approveMutation.mutate(application.id)}
                            disabled={approveMutation.isPending}
                            className="btn btn-primary"
                          >
                            {approveMutation.isPending ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <>
                                <CheckCircle2 className="w-4 h-4 mr-2" />
                                Approve
                              </>
                            )}
                          </button>
                          {rejectingId === application.id ? (
                            <div className="w-full max-w-xs space-y-2">
                              <textarea
                                value={rejectReason}
                                onChange={(e) => setRejectReason(e.target.value)}
                                className="input min-h-[80px]"
                                placeholder="Optional rejection reason"
                              />
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  onClick={() => {
                                    setRejectingId(null)
                                    setRejectReason('')
                                  }}
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-danger"
                                  disabled={rejectMutation.isPending}
                                  onClick={() =>
                                    rejectMutation.mutate({
                                      id: application.id,
                                      reason: rejectReason,
                                    })
                                  }
                                >
                                  Confirm reject
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setRejectingId(application.id)}
                              className="btn btn-secondary"
                            >
                              <XCircle className="w-4 h-4 mr-2" />
                              Reject
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="text-right text-sm text-workshop-charcoal/60">
                          {application.reviewed_by_username
                            ? `By ${application.reviewed_by_username}`
                            : '—'}
                          <div>{formatDate(application.reviewed_at)}</div>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
