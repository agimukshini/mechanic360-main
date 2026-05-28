import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { authApi } from '@/api'
import { userDisplayName } from '@/lib/userDisplay'

type MechanicSelectProps = {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  required?: boolean
}

export default function MechanicSelect({ value, onChange, disabled, required }: MechanicSelectProps) {
  const { t } = useTranslation()
  const { data, isLoading } = useQuery({
    queryKey: ['tenant-mechanics'],
    queryFn: () => authApi.listMechanics(),
  })

  const mechanics = data?.data || []

  return (
    <div>
      <label className="block text-sm font-medium mb-2">{t('visits.performedBy')}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input w-full"
        disabled={disabled || isLoading}
        required={required}
      >
        <option value="">{t('visits.performedByUnassigned')}</option>
        {mechanics.map((mechanic: { id: string; username: string; first_name?: string; last_name?: string }) => (
          <option key={mechanic.id} value={mechanic.id}>
            {userDisplayName(mechanic)}
          </option>
        ))}
      </select>
    </div>
  )
}
