import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Loader2, UserPlus, X } from 'lucide-react'
import { authApi } from '@/api'
import { getApiErrorMessage } from '@/lib/utils'

export type StaffInvite = {
  id: string
  workshop_name: string
  email: string
  first_name: string
  last_name: string
  role: string
  expires_at: string
  used_at: string | null
  status: 'valid' | 'used' | 'expired'
  invite_url: string
}

export type StaffInviteLimits = {
  daily_limit: number
  daily_used: number
  daily_remaining: number
  monthly_limit: number
  monthly_used: number
  monthly_remaining: number
}

type InviteFormState = {
  email: string
  first_name: string
  last_name: string
}

const EMPTY_FORM: InviteFormState = {
  email: '',
  first_name: '',
  last_name: '',
}

type StaffInviteModalProps = {
  open: boolean
  onClose: () => void
}

export default function StaffInviteModal({ open, onClose }: StaffInviteModalProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<InviteFormState>(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)
  const [generatedInvite, setGeneratedInvite] = useState<StaffInvite | null>(null)
  const [limits, setLimits] = useState<StaffInviteLimits | null>(null)
  const [copied, setCopied] = useState(false)

  const { data: invitesData, isLoading: limitsLoading } = useQuery({
    queryKey: ['tenant-staff-invites'],
    queryFn: () => authApi.listStaffInvites(),
    enabled: open,
  })

  useEffect(() => {
    if (invitesData?.data?.limits) {
      setLimits(invitesData.data.limits as StaffInviteLimits)
    }
  }, [invitesData])

  useEffect(() => {
    if (!open) {
      setForm(EMPTY_FORM)
      setError(null)
      setGeneratedInvite(null)
      setCopied(false)
    }
  }, [open])

  const inviteMutation = useMutation({
    mutationFn: () => authApi.createStaffInvite({ ...form, role: 'mechanic' }),
    onSuccess: (response) => {
      setGeneratedInvite(response.data as StaffInvite)
      if (response.data.limits) {
        setLimits(response.data.limits as StaffInviteLimits)
      }
      queryClient.invalidateQueries({ queryKey: ['tenant-staff-invites'] })
    },
    onError: (err: unknown) => {
      setError(getApiErrorMessage(err, t('team.inviteFailed')))
    },
  })

  const copyLink = async () => {
    if (!generatedInvite?.invite_url) return
    try {
      await navigator.clipboard.writeText(generatedInvite.invite_url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError(t('team.inviteFailed'))
    }
  }

  const atDailyLimit = limits !== null && limits.daily_remaining <= 0
  const atMonthlyLimit = limits !== null && limits.monthly_remaining <= 0
  const canGenerate = !atDailyLimit && !atMonthlyLimit

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        className="bg-white rounded-xl shadow-lg border border-gray-200 w-full max-w-lg max-h-[90vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="staff-invite-title"
      >
        <div className="flex items-start justify-between gap-4 p-6 border-b border-gray-100">
          <div>
            <h2 id="staff-invite-title" className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-brand-primary" />
              {t('settings.addMechanic')}
            </h2>
            <p className="text-sm text-gray-500 mt-1">{t('settings.inviteModalHint')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg"
            aria-label={t('common.cancel')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {limits && (
            <div className="rounded-lg bg-gray-50 border border-gray-100 px-4 py-3 text-sm text-gray-700">
              <p className="font-medium text-gray-900">{t('settings.inviteLimitsTitle')}</p>
              <p className="mt-1">
                {t('settings.inviteLimitsDaily', {
                  used: limits.daily_used,
                  limit: limits.daily_limit,
                })}
              </p>
              <p>
                {t('settings.inviteLimitsMonthly', {
                  used: limits.monthly_used,
                  limit: limits.monthly_limit,
                })}
              </p>
            </div>
          )}

          {limitsLoading && !limits && (
            <div className="flex justify-center py-4">
              <Loader2 className="w-6 h-6 animate-spin text-brand-primary" />
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {!generatedInvite ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('settings.firstName')}</label>
                  <input
                    className="input"
                    value={form.first_name}
                    onChange={(e) => setForm((prev) => ({ ...prev, first_name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('settings.lastName')}</label>
                  <input
                    className="input"
                    value={form.last_name}
                    onChange={(e) => setForm((prev) => ({ ...prev, last_name: e.target.value }))}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium mb-1">{t('team.email')}</label>
                  <input
                    className="input"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                  />
                </div>
              </div>

              {(atDailyLimit || atMonthlyLimit) && (
                <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  {atDailyLimit ? t('settings.inviteDailyLimit') : t('settings.inviteMonthlyLimit')}
                </p>
              )}
            </>
          ) : (
            <div className="space-y-4">
              <p className="text-sm font-medium text-green-800 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
                {t('team.inviteLinkReady')}
              </p>
              <p className="text-sm text-gray-600">{t('settings.inviteShareHint')}</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  className="input flex-1 font-mono text-sm"
                  readOnly
                  value={generatedInvite.invite_url}
                  onFocus={(e) => e.target.select()}
                />
                <button type="button" className="btn btn-primary shrink-0" onClick={() => void copyLink()}>
                  <Copy className="w-4 h-4 mr-2" />
                  {copied ? t('team.copied') : t('team.copyLink')}
                </button>
              </div>
              <p className="text-xs text-gray-500">{t('staffInvite.expiresHint')}</p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 p-6 border-t border-gray-100">
          <button type="button" className="btn btn-outline" onClick={onClose}>
            {generatedInvite ? t('common.done') : t('common.cancel')}
          </button>
          {!generatedInvite && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={inviteMutation.isPending || !canGenerate}
              onClick={() => {
                setError(null)
                inviteMutation.mutate()
              }}
            >
              {inviteMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t('team.generating')}
                </>
              ) : (
                t('team.generateLink')
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
