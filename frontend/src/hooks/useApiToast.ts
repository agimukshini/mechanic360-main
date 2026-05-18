import { useCallback } from 'react'
import { useToast } from '@/components/ui/Toast'
import { getApiErrorMessage } from '@/lib/utils'

export function useApiToast() {
  const { showToast } = useToast()

  const showError = useCallback(
    (error: unknown, fallback = 'Something went wrong') => {
      showToast(getApiErrorMessage(error, fallback), 'error')
    },
    [showToast],
  )

  const showSuccess = useCallback(
    (message: string) => {
      showToast(message, 'success')
    },
    [showToast],
  )

  return { showError, showSuccess, showToast }
}
