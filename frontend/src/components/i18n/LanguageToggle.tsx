import { useWorkshopLanguage } from '@/hooks/useWorkshopLanguage'
import { useTranslation } from 'react-i18next'

export default function LanguageToggle({ className = '' }: { className?: string }) {
  const { t } = useTranslation()
  const { language, changeLanguage, isSaving } = useWorkshopLanguage()

  return (
    <div
      className={`inline-flex rounded-full border border-gray-200 bg-white p-0.5 shadow-sm ${className}`}
      role="group"
      aria-label={t('language.toggleAria')}
    >
      {(['sq', 'en'] as const).map((code) => (
        <button
          key={code}
          type="button"
          disabled={isSaving}
          onClick={() => void changeLanguage(code)}
          className={`px-2.5 py-1 text-xs font-semibold rounded-full transition-colors ${
            language === code
              ? 'bg-accent text-white'
              : 'text-gray-600 hover:text-primary hover:bg-gray-50'
          }`}
        >
          {code === 'sq' ? 'SQ' : 'EN'}
        </button>
      ))}
    </div>
  )
}
