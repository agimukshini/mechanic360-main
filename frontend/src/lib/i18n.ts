import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import sq from '@/locales/sq.json'
import en from '@/locales/en.json'

export type WorkshopLanguage = 'sq' | 'en'

const STORAGE_KEY = 'workshop_lang'

export function normalizeLanguage(code: string | null | undefined): WorkshopLanguage {
  if (!code) return 'sq'
  const base = code.toLowerCase().split('-')[0]
  return base === 'en' ? 'en' : 'sq'
}

export function readCachedLanguage(): WorkshopLanguage | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? normalizeLanguage(raw) : null
  } catch {
    return null
  }
}

export function cacheLanguage(code: WorkshopLanguage) {
  try {
    localStorage.setItem(STORAGE_KEY, code)
  } catch {
    /* ignore */
  }
}

export function applyDocumentLanguage(code: WorkshopLanguage) {
  document.documentElement.lang = code
}

const initial = readCachedLanguage() ?? 'sq'

void i18n.use(initReactI18next).init({
  resources: {
    sq: { translation: sq },
    en: { translation: en },
  },
  lng: initial,
  fallbackLng: 'sq',
  supportedLngs: ['sq', 'en'],
  interpolation: { escapeValue: false },
})

applyDocumentLanguage(initial)

export async function setWorkshopLanguage(code: WorkshopLanguage) {
  const lang = normalizeLanguage(code)
  cacheLanguage(lang)
  applyDocumentLanguage(lang)
  await i18n.changeLanguage(lang)
}

export default i18n
