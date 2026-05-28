export type UserLike = {
  first_name?: string
  last_name?: string
  username?: string
}

export function userDisplayName(user?: UserLike | null): string {
  if (!user) return ''
  const full = [user.first_name, user.last_name].filter(Boolean).join(' ')
  return full || user.username || ''
}
