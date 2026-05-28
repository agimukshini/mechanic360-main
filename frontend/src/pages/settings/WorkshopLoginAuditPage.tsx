import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft } from 'lucide-react'
import LoginAuditLogPanel from '@/components/security/LoginAuditLogPanel'

export default function WorkshopLoginAuditPage() {
  const { t } = useTranslation()

  return (
    <div className="space-y-4">
      <Link
        to="/settings"
        className="inline-flex items-center gap-2 text-sm text-workshop-charcoal/60 hover:text-workshop-blue"
      >
        <ArrowLeft className="w-4 h-4" />
        {t('loginAudit.backToSettings')}
      </Link>
      <LoginAuditLogPanel scope="tenant" />
    </div>
  )
}
