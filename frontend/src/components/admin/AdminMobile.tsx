import type { ReactNode } from 'react'
import clsx from 'clsx'

export function AdminField({
  label,
  children,
  className,
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={clsx('grid grid-cols-1 gap-0.5 min-w-0', className)}>
      <dt className="text-[11px] font-medium text-workshop-charcoal/55 uppercase tracking-wide">
        {label}
      </dt>
      <dd className="text-sm text-workshop-charcoal break-words min-w-0">{children}</dd>
    </div>
  )
}

export function AdminMobileCard({
  title,
  subtitle,
  badge,
  actions,
  children,
  className,
  onClick,
}: {
  title?: ReactNode
  subtitle?: ReactNode
  badge?: ReactNode
  actions?: ReactNode
  children?: ReactNode
  className?: string
  onClick?: () => void
}) {
  const Wrapper = onClick ? 'button' : 'div'
  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={clsx(
        'block w-full text-left p-4 space-y-3 min-w-0',
        onClick && 'hover:bg-workshop-charcoal/[0.03] active:bg-workshop-charcoal/[0.06]',
        className,
      )}
    >
      {(title || subtitle || badge || actions) && (
        <div className="flex items-start justify-between gap-3 min-w-0">
          <div className="min-w-0 flex-1">
            {title && (
              <div className="font-medium text-workshop-charcoal break-words">{title}</div>
            )}
            {subtitle && (
              <div className="text-xs text-workshop-charcoal/60 mt-0.5 break-words">{subtitle}</div>
            )}
          </div>
          {(badge || actions) && (
            <div className="flex flex-col items-end gap-2 shrink-0 max-w-[45%]">{badge}{actions}</div>
          )}
        </div>
      )}
      {children && <dl className="space-y-2.5 min-w-0">{children}</dl>}
    </Wrapper>
  )
}

/** Desktop table + stacked mobile cards — no horizontal scroll on small screens. */
export function AdminResponsiveTable({
  desktop,
  mobile,
}: {
  desktop: ReactNode
  mobile: ReactNode
}) {
  return (
    <>
      <div className="hidden md:block min-w-0">{desktop}</div>
      <div className="md:hidden divide-y divide-workshop-charcoal/10 min-w-0">{mobile}</div>
    </>
  )
}
