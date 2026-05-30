import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CalendarClock, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { visitsApi } from '@/api'
import { useToast } from '@/components/ui/Toast'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { getApiErrorMessage, unwrapList } from '@/lib/utils'

export type MaintenancePlan = {
  id: string
  vehicle: string
  name: string
  pm_kind: string
  pm_kind_display?: string
  schedule_mode: 'interval' | 'seasonal'
  schedule_mode_display?: string
  interval_km?: number | null
  interval_days?: number | null
  interval_hours?: number | null
  season_start_month?: number | null
  season_start_day?: number | null
  season_end_month?: number | null
  season_end_day?: number | null
  reminder_days_before?: number
  last_service_date?: string | null
  last_mileage_km?: number | null
  last_hours?: number | null
  is_active: boolean
  notes?: string
  next_due_summary?: string | null
}

type PlanFormState = {
  name: string
  pm_kind: string
  schedule_mode: 'interval' | 'seasonal'
  interval_km: string
  interval_days: string
  interval_hours: string
  season_start_month: string
  season_start_day: string
  season_end_month: string
  season_end_day: string
  reminder_days_before: string
  last_service_date: string
  last_mileage_km: string
  last_hours: string
  notes: string
  is_active: boolean
}

const PM_KINDS = [
  { value: 'regular_service', labelKey: 'pmOrders.kind.regular_service' },
  { value: 'major_service', labelKey: 'pmOrders.kind.major_service' },
  { value: 'tire_change', labelKey: 'pmOrders.kind.tire_change' },
] as const

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1)

function emptyForm(): PlanFormState {
  return {
    name: '',
    pm_kind: 'regular_service',
    schedule_mode: 'interval',
    interval_km: '',
    interval_days: '365',
    interval_hours: '',
    season_start_month: '11',
    season_start_day: '1',
    season_end_month: '4',
    season_end_day: '15',
    reminder_days_before: '14',
    last_service_date: '',
    last_mileage_km: '',
    last_hours: '',
    notes: '',
    is_active: true,
  }
}

function planToForm(plan: MaintenancePlan): PlanFormState {
  return {
    name: plan.name,
    pm_kind: plan.pm_kind || 'regular_service',
    schedule_mode: plan.schedule_mode,
    interval_km: plan.interval_km?.toString() ?? '',
    interval_days: plan.interval_days?.toString() ?? '',
    interval_hours: plan.interval_hours?.toString() ?? '',
    season_start_month: plan.season_start_month?.toString() ?? '11',
    season_start_day: plan.season_start_day?.toString() ?? '1',
    season_end_month: plan.season_end_month?.toString() ?? '4',
    season_end_day: plan.season_end_day?.toString() ?? '15',
    reminder_days_before: plan.reminder_days_before?.toString() ?? '14',
    last_service_date: plan.last_service_date ?? '',
    last_mileage_km: plan.last_mileage_km?.toString() ?? '',
    last_hours: plan.last_hours?.toString() ?? '',
    notes: plan.notes ?? '',
    is_active: plan.is_active,
  }
}

function parseOptionalInt(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

function buildPayload(form: PlanFormState, vehicleId: string) {
  const isSeasonal = form.pm_kind === 'tire_change' || form.schedule_mode === 'seasonal'
  return {
    vehicle: vehicleId,
    name: form.name.trim(),
    pm_kind: form.pm_kind,
    schedule_mode: isSeasonal ? 'seasonal' : 'interval',
    interval_km: isSeasonal ? null : parseOptionalInt(form.interval_km),
    interval_days: isSeasonal ? null : parseOptionalInt(form.interval_days),
    interval_hours: isSeasonal ? null : parseOptionalInt(form.interval_hours),
    season_start_month: isSeasonal ? parseOptionalInt(form.season_start_month) : null,
    season_start_day: isSeasonal ? parseOptionalInt(form.season_start_day) : null,
    season_end_month: isSeasonal ? parseOptionalInt(form.season_end_month) : null,
    season_end_day: isSeasonal ? parseOptionalInt(form.season_end_day) : null,
    reminder_days_before: parseOptionalInt(form.reminder_days_before) ?? 14,
    last_service_date: form.last_service_date || null,
    last_mileage_km: parseOptionalInt(form.last_mileage_km),
    last_hours: parseOptionalInt(form.last_hours),
    notes: form.notes.trim(),
    is_active: form.is_active,
  }
}

type Props = {
  vehicleId: string
  canEdit: boolean
}

export default function VehicleMaintenancePlans({ vehicleId, canEdit }: Props) {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<PlanFormState>(emptyForm())
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['maintenance-plans', vehicleId],
    queryFn: () => visitsApi.maintenancePlans.list({ vehicle: vehicleId }),
  })

  const plans = unwrapList(data) as MaintenancePlan[]

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['maintenance-plans', vehicleId] })
  }

  const createMutation = useMutation({
    mutationFn: (payload: object) => visitsApi.maintenancePlans.create(payload),
    onSuccess: () => {
      invalidate()
      setShowForm(false)
      setEditingId(null)
      setForm(emptyForm())
      showToast(t('vehicleMaintenance.saved'), 'success')
    },
    onError: (error: unknown) => {
      showToast(getApiErrorMessage(error, t('vehicleMaintenance.saveFailed')), 'error')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: object }) =>
      visitsApi.maintenancePlans.update(id, payload),
    onSuccess: () => {
      invalidate()
      setShowForm(false)
      setEditingId(null)
      setForm(emptyForm())
      showToast(t('vehicleMaintenance.saved'), 'success')
    },
    onError: (error: unknown) => {
      showToast(getApiErrorMessage(error, t('vehicleMaintenance.saveFailed')), 'error')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => visitsApi.maintenancePlans.delete(id),
    onSuccess: () => {
      invalidate()
      setDeleteId(null)
      showToast(t('vehicleMaintenance.deleted'), 'success')
    },
    onError: (error: unknown) => {
      showToast(getApiErrorMessage(error, t('vehicleMaintenance.deleteFailed')), 'error')
    },
  })

  const defaultNameForKind = useMemo(
    () => ({
      regular_service: t('vehicleMaintenance.defaultNames.regular'),
      major_service: t('vehicleMaintenance.defaultNames.major'),
      tire_change: t('vehicleMaintenance.defaultNames.tire'),
    }),
    [t],
  )

  const openCreate = (pmKind: string) => {
    const isTire = pmKind === 'tire_change'
    setForm({
      ...emptyForm(),
      pm_kind: pmKind,
      schedule_mode: isTire ? 'seasonal' : 'interval',
      name: defaultNameForKind[pmKind as keyof typeof defaultNameForKind] ?? '',
    })
    setEditingId(null)
    setShowForm(true)
  }

  const openEdit = (plan: MaintenancePlan) => {
    setForm(planToForm(plan))
    setEditingId(plan.id)
    setShowForm(true)
  }

  const handlePmKindChange = (pmKind: string) => {
    const isTire = pmKind === 'tire_change'
    setForm((current) => ({
      ...current,
      pm_kind: pmKind,
      schedule_mode: isTire ? 'seasonal' : 'interval',
      name: current.name || defaultNameForKind[pmKind as keyof typeof defaultNameForKind] || '',
    }))
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const payload = buildPayload(form, vehicleId)
    if (editingId) {
      updateMutation.mutate({ id: editingId, payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  const isSeasonal = form.pm_kind === 'tire_change' || form.schedule_mode === 'seasonal'
  const saving = createMutation.isPending || updateMutation.isPending

  const formatSeasonRange = (plan: MaintenancePlan) =>
    t('vehicleMaintenance.seasonRange', {
      startDay: plan.season_start_day,
      startMonth: plan.season_start_month,
      endDay: plan.season_end_day,
      endMonth: plan.season_end_month,
    })

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-brand-primary" />
            {t('vehicleMaintenance.title')}
          </h3>
          <p className="text-xs text-gray-500 mt-1">{t('vehicleMaintenance.subtitle')}</p>
        </div>
        {canEdit && !showForm && (
          <div className="flex flex-wrap gap-2 justify-end">
            {PM_KINDS.map((kind) => (
              <button
                key={kind.value}
                type="button"
                onClick={() => openCreate(kind.value)}
                className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-200 hover:bg-gray-50"
              >
                <Plus className="w-3.5 h-3.5 inline mr-1" />
                {t(kind.labelKey)}
              </button>
            ))}
          </div>
        )}
      </div>

      {showForm && canEdit && (
        <form onSubmit={handleSubmit} className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block text-xs font-medium text-gray-600">
              {t('vehicleMaintenance.fields.name')}
              <input
                className="input w-full mt-1 text-sm"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </label>
            <label className="block text-xs font-medium text-gray-600">
              {t('vehicleMaintenance.fields.type')}
              <select
                className="input w-full mt-1 text-sm"
                value={form.pm_kind}
                onChange={(e) => handlePmKindChange(e.target.value)}
              >
                {PM_KINDS.map((kind) => (
                  <option key={kind.value} value={kind.value}>
                    {t(kind.labelKey)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {isSeasonal ? (
            <>
              <p className="text-xs text-gray-600">{t('vehicleMaintenance.seasonHint')}</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <label className="block text-xs font-medium text-gray-600">
                  {t('vehicleMaintenance.fields.winterFromMonth')}
                  <select
                    className="input w-full mt-1 text-sm"
                    value={form.season_start_month}
                    onChange={(e) => setForm({ ...form, season_start_month: e.target.value })}
                  >
                    {MONTHS.map((month) => (
                      <option key={month} value={month}>
                        {t(`vehicleMaintenance.months.${month}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-medium text-gray-600">
                  {t('vehicleMaintenance.fields.day')}
                  <input
                    type="number"
                    min={1}
                    max={31}
                    className="input w-full mt-1 text-sm"
                    value={form.season_start_day}
                    onChange={(e) => setForm({ ...form, season_start_day: e.target.value })}
                  />
                </label>
                <label className="block text-xs font-medium text-gray-600">
                  {t('vehicleMaintenance.fields.winterUntilMonth')}
                  <select
                    className="input w-full mt-1 text-sm"
                    value={form.season_end_month}
                    onChange={(e) => setForm({ ...form, season_end_month: e.target.value })}
                  >
                    {MONTHS.map((month) => (
                      <option key={month} value={month}>
                        {t(`vehicleMaintenance.months.${month}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-medium text-gray-600">
                  {t('vehicleMaintenance.fields.day')}
                  <input
                    type="number"
                    min={1}
                    max={31}
                    className="input w-full mt-1 text-sm"
                    value={form.season_end_day}
                    onChange={(e) => setForm({ ...form, season_end_day: e.target.value })}
                  />
                </label>
              </div>
              <label className="block text-xs font-medium text-gray-600 max-w-xs">
                {t('vehicleMaintenance.fields.reminderDays')}
                <input
                  type="number"
                  min={1}
                  max={90}
                  className="input w-full mt-1 text-sm"
                  value={form.reminder_days_before}
                  onChange={(e) => setForm({ ...form, reminder_days_before: e.target.value })}
                />
              </label>
            </>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label className="block text-xs font-medium text-gray-600">
                {t('vehicleMaintenance.fields.intervalKm')}
                <input
                  type="number"
                  min={0}
                  className="input w-full mt-1 text-sm"
                  value={form.interval_km}
                  onChange={(e) => setForm({ ...form, interval_km: e.target.value })}
                />
              </label>
              <label className="block text-xs font-medium text-gray-600">
                {t('vehicleMaintenance.fields.intervalDays')}
                <input
                  type="number"
                  min={0}
                  className="input w-full mt-1 text-sm"
                  value={form.interval_days}
                  onChange={(e) => setForm({ ...form, interval_days: e.target.value })}
                />
              </label>
              <label className="block text-xs font-medium text-gray-600">
                {t('vehicleMaintenance.fields.lastServiceDate')}
                <input
                  type="date"
                  className="input w-full mt-1 text-sm"
                  value={form.last_service_date}
                  onChange={(e) => setForm({ ...form, last_service_date: e.target.value })}
                />
              </label>
              <label className="block text-xs font-medium text-gray-600">
                {t('vehicleMaintenance.fields.lastServiceKm')}
                <input
                  type="number"
                  min={0}
                  className="input w-full mt-1 text-sm"
                  value={form.last_mileage_km}
                  onChange={(e) => setForm({ ...form, last_mileage_km: e.target.value })}
                />
              </label>
            </div>
          )}

          <label className="block text-xs font-medium text-gray-600">
            {t('vehicleMaintenance.fields.notes')}
            <textarea
              className="input w-full mt-1 text-sm min-h-[72px]"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </label>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            />
            {t('vehicleMaintenance.fields.active')}
          </label>

          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="btn btn-primary text-sm py-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : t('common.save')}
            </button>
            <button
              type="button"
              className="btn btn-outline text-sm py-2"
              onClick={() => {
                setShowForm(false)
                setEditingId(null)
                setForm(emptyForm())
              }}
            >
              {t('common.cancel')}
            </button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-brand-primary" />
        </div>
      ) : plans.length === 0 ? (
        <p className="text-sm text-gray-500 py-4 text-center">{t('vehicleMaintenance.empty')}</p>
      ) : (
        <div className="space-y-2">
          {plans.map((plan) => (
            <div key={plan.id} className="rounded-lg border border-gray-200 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-gray-900 text-sm">{plan.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {t(`pmOrders.kind.${plan.pm_kind}`, { defaultValue: plan.pm_kind_display })}
                    {plan.schedule_mode === 'seasonal' && plan.season_start_month
                      ? ` • ${formatSeasonRange(plan)}`
                      : ''}
                  </p>
                  {plan.next_due_summary && (
                    <p className="text-xs text-brand-primary mt-1">{plan.next_due_summary}</p>
                  )}
                </div>
                {canEdit && (
                  <div className="flex gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEdit(plan)}
                      className="p-2 text-gray-400 hover:text-brand-primary"
                      title={t('common.edit')}
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteId(plan.id)}
                      className="p-2 text-gray-400 hover:text-red-600"
                      title={t('common.delete')}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
              {!plan.is_active && (
                <span className="inline-block mt-2 px-2 py-0.5 text-[10px] rounded-full bg-gray-100 text-gray-600">
                  {t('vehicleMaintenance.inactive')}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteId)}
        title={t('vehicleMaintenance.deleteTitle')}
        message={t('vehicleMaintenance.deleteMessage')}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        variant="danger"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  )
}
