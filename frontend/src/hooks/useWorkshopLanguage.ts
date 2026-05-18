import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useDispatch } from 'react-redux'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { authApi } from '@/api'
import { setWorkshopLanguage as setWorkshopLanguageInStore } from '@/store/authSlice'
import type { AppDispatch } from '@/store'
import {
  normalizeLanguage,
  setWorkshopLanguage,
  type WorkshopLanguage,
} from '@/lib/i18n'

export function useWorkshopLanguage() {
  const { i18n } = useTranslation()
  const dispatch = useDispatch<AppDispatch>()
  const queryClient = useQueryClient()
  const language = normalizeLanguage(i18n.language)

  const mutation = useMutation({
    mutationFn: (code: WorkshopLanguage) => authApi.updateSettings({ language: code }),
    onSuccess: (_data, code) => {
      dispatch(setWorkshopLanguageInStore(code))
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
  })

  const changeLanguage = useCallback(
    async (code: WorkshopLanguage, options?: { persist?: boolean }) => {
      const lang = normalizeLanguage(code)
      await setWorkshopLanguage(lang)
      if (options?.persist !== false) {
        await mutation.mutateAsync(lang)
      }
    },
    [mutation],
  )

  return {
    language,
    changeLanguage,
    isSaving: mutation.isPending,
  }
}
