import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Loader2,
  Plus,
  Users,
  UserCheck,
  UserX,
  Pencil,
  Trash2,
  Link2,
} from 'lucide-react'
import { authApi } from '@/api'
import { getApiErrorMessage, unwrapList } from '@/lib/utils'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import StaffInviteModal from '@/components/settings/StaffInviteModal'
import { useSelector } from 'react-redux'
import type { RootState } from '@/store'

type TeamUser = {
  id: string
  username: string
  email: string
  first_name: string
  last_name: string
  role: string
  is_active: boolean
  date_joined?: string
}

type TeamFormState = {
  username: string
  email: string
  first_name: string
  last_name: string
  role: 'mechanic' | 'admin'
  password: string
  is_active: boolean
}

const EMPTY_FORM: TeamFormState = {
  username: '',
  email: '',
  first_name: '',
  last_name: '',
  role: 'mechanic',
  password: '',
  is_active: true,
}

function displayName(user: TeamUser) {
  const full = [user.first_name, user.last_name].filter(Boolean).join(' ')
  return full || user.username
}

function roleLabel(role: string, t: (key: string) => string) {
  if (role === 'mechanic') return t('team.roleMechanic')
  if (role === 'admin') return t('team.roleAdmin')
  return role
}

export default function TeamPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const currentUser = useSelector((state: RootState) => state.auth.user)
  const [showForm, setShowForm] = useState(false)
  const [editingUser, setEditingUser] = useState<TeamUser | null>(null)
  const [form, setForm] = useState<TeamFormState>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TeamUser | null>(null)
  const [showInviteModal, setShowInviteModal] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['tenant-users'],
    queryFn: () => authApi.listTenantUsers(),
  })

  const users = unwrapList(data) as TeamUser[]

  const resetForm = () => {
    setForm(EMPTY_FORM)
    setEditingUser(null)
    setFormError(null)
    setShowForm(false)
  }

  const openCreate = () => {
    setEditingUser(null)
    setForm(EMPTY_FORM)
    setFormError(null)
    setShowInviteModal(false)
    setShowForm(true)
  }

  const openInvite = () => {
    setShowForm(false)
    setShowInviteModal(true)
  }

  const openEdit = (user: TeamUser) => {
    setEditingUser(user)
    setForm({
      username: user.username,
      email: user.email || '',
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      role: user.role === 'admin' ? 'admin' : 'mechanic',
      password: '',
      is_active: user.is_active,
    })
    setFormError(null)
    setShowForm(true)
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        username: form.username,
        email: form.email,
        first_name: form.first_name,
        last_name: form.last_name,
        is_active: form.is_active,
      }
      if (editingUser) {
        payload.role = form.role
      } else {
        payload.role = 'mechanic'
      }
      if (form.password) {
        payload.password = form.password
      }
      if (editingUser) {
        return authApi.updateTenantUser(editingUser.id, payload)
      }
      if (!form.password) {
        throw new Error(t('team.passwordRequired'))
      }
      return authApi.createTenantUser(payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-users'] })
      queryClient.invalidateQueries({ queryKey: ['tenant-mechanics'] })
      resetForm()
    },
    onError: (error: unknown) => {
      setFormError(getApiErrorMessage(error, t('team.saveFailed')))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => authApi.deleteTenantUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-users'] })
      queryClient.invalidateQueries({ queryKey: ['tenant-mechanics'] })
      setDeleteTarget(null)
    },
    onError: (error: unknown) => {
      setFormError(getApiErrorMessage(error, t('team.deleteFailed')))
      setDeleteTarget(null)
    },
  })

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      authApi.updateTenantUser(id, { is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-users'] })
      queryClient.invalidateQueries({ queryKey: ['tenant-mechanics'] })
    },
  })

  return (
    <div className="space-y-6">
      <Link
        to="/settings"
        className="inline-flex items-center gap-2 text-sm text-workshop-charcoal/60 hover:text-workshop-blue"
      >
        <ArrowLeft className="w-4 h-4" />
        {t('team.backToSettings')}
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-workshop-charcoal flex items-center gap-2">
            <Users className="w-7 h-7 text-workshop-blue" />
            {t('team.title')}
          </h1>
          <p className="text-workshop-charcoal/60 mt-1">{t('team.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={openInvite} className="btn btn-outline">
            <Link2 className="w-4 h-4 mr-2" />
            {t('settings.addMechanic')}
          </button>
          <button type="button" onClick={openCreate} className="btn btn-primary">
            <Plus className="w-4 h-4 mr-2" />
            {t('team.addMember')}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="card p-6 space-y-4">
          <h2 className="text-lg font-semibold text-workshop-charcoal">
            {editingUser ? t('team.editMember') : t('team.newMember')}
          </h2>
          {formError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {formError}
            </p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t('team.username')} *</label>
              <input
                className="input"
                value={form.username}
                onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))}
                disabled={Boolean(editingUser)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('team.email')}</label>
              <input
                className="input"
                type="email"
                value={form.email}
                onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
              />
            </div>
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
            <div>
              <label className="block text-sm font-medium mb-1">{t('team.role')} *</label>
              {editingUser ? (
                <select
                  className="input"
                  value={form.role}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      role: e.target.value as TeamFormState['role'],
                    }))
                  }
                  disabled={editingUser.id === currentUser?.id}
                >
                  <option value="mechanic">{t('team.roleMechanic')}</option>
                  <option value="admin">{t('team.roleAdmin')}</option>
                </select>
              ) : (
                <input className="input bg-gray-50" value={t('team.roleMechanic')} readOnly disabled />
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                {editingUser ? t('team.newPasswordOptional') : t('team.password')} *
              </label>
              <input
                className="input"
                type="password"
                value={form.password}
                onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
              />
            </div>
          </div>
          {editingUser && editingUser.id !== currentUser?.id && (
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
              />
              {t('team.activeAccount')}
            </label>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn btn-outline" onClick={resetForm}>
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t('team.saving')}
                </>
              ) : (
                t('common.save')
              )}
            </button>
          </div>
        </div>
      )}

      {showInviteModal && (
        <StaffInviteModal open={showInviteModal} onClose={() => setShowInviteModal(false)} />
      )}

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-12 flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-workshop-blue" />
          </div>
        ) : users.length === 0 ? (
          <p className="p-8 text-center text-workshop-charcoal/60">{t('team.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-workshop-charcoal/5">
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-medium uppercase text-workshop-charcoal/60">
                    {t('team.member')}
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium uppercase text-workshop-charcoal/60">
                    {t('team.role')}
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium uppercase text-workshop-charcoal/60">
                    {t('team.status')}
                  </th>
                  <th className="text-right px-6 py-3 text-xs font-medium uppercase text-workshop-charcoal/60">
                    {t('team.actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-workshop-charcoal/10">
                {users.map((user) => {
                  const isSelf = user.id === currentUser?.id
                  return (
                    <tr key={user.id} className="hover:bg-workshop-charcoal/5">
                      <td className="px-6 py-4">
                        <p className="font-medium text-workshop-charcoal">{displayName(user)}</p>
                        <p className="text-sm text-workshop-charcoal/50">{user.username}</p>
                        {user.email && (
                          <p className="text-sm text-workshop-charcoal/50">{user.email}</p>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm">{roleLabel(user.role, t)}</td>
                      <td className="px-6 py-4">
                        {user.is_active ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-1 rounded-full">
                            <UserCheck className="w-3 h-3" />
                            {t('team.active')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-800 bg-amber-50 px-2 py-1 rounded-full">
                            <UserX className="w-3 h-3" />
                            {t('team.inactive')}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          {!isSelf && (
                            <>
                              <button
                                type="button"
                                className="p-2 text-workshop-charcoal/50 hover:text-workshop-blue"
                                onClick={() => openEdit(user)}
                                title={t('common.edit')}
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              {user.role !== 'admin' && (
                                <>
                              <button
                                type="button"
                                className="p-2 text-workshop-charcoal/50 hover:text-amber-600"
                                onClick={() =>
                                  toggleActiveMutation.mutate({
                                    id: user.id,
                                    is_active: !user.is_active,
                                  })
                                }
                                title={user.is_active ? t('team.deactivate') : t('team.activate')}
                              >
                                {user.is_active ? (
                                  <UserX className="w-4 h-4" />
                                ) : (
                                  <UserCheck className="w-4 h-4" />
                                )}
                              </button>
                              <button
                                type="button"
                                className="p-2 text-workshop-charcoal/50 hover:text-red-600"
                                onClick={() => setDeleteTarget(user)}
                                title={t('common.delete')}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                                </>
                              )}
                            </>
                          )}
                          {isSelf && (
                            <span className="text-xs text-workshop-charcoal/40">{t('team.you')}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={t('team.deleteTitle')}
        message={t('team.deleteMessage', { name: deleteTarget ? displayName(deleteTarget) : '' })}
        confirmLabel={t('common.delete')}
        variant="danger"
        loading={deleteMutation.isPending}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
