import { getApiErrorMessage } from '@/lib/utils'

export type VisitStatus = 'draft' | 'in_progress' | 'completed' | 'cancelled'

export function isVisitOpen(status: string | undefined): boolean {
  return status === 'draft' || status === 'in_progress'
}

export function isVisitClosed(status: string | undefined): boolean {
  return status === 'completed' || status === 'cancelled'
}

/** True when finish/complete was rejected because the visit is already closed. */
export function isAlreadyClosedVisitError(error: unknown): boolean {
  const msg = getApiErrorMessage(error, '').toLowerCase()
  return (
    msg.includes('cannot finish visit') ||
    msg.includes('cannot complete visit') ||
    msg.includes('already completed') ||
    msg.includes("'completed' status")
  )
}

export function visitQueryOptions(visitId: string | undefined) {
  return {
    enabled: !!visitId,
    staleTime: 0,
    refetchOnMount: 'always' as const,
  }
}
