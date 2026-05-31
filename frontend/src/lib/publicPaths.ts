/** Routes that must never trigger a forced redirect to login. */
export const PUBLIC_PATHS = [
  '/',
  '/login',
  '/register',
  '/owner/register',
  '/invite/',
  '/verify/',
  '/forgot-password',
  '/reset-password/',
] as const

export function isPublicPath(pathname: string): boolean {
  if (pathname === '/') return true
  return PUBLIC_PATHS.some((path) => path !== '/' && pathname.startsWith(path))
}
