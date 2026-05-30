import type { LucideIcon } from 'lucide-react'

export type PageTab = {
  id: string
  label: string
  icon?: LucideIcon
  badge?: string | number
  hidden?: boolean
}

type PageTabsProps = {
  tabs: PageTab[]
  active: string
  onChange: (id: string) => void
  className?: string
}

const tabButtonBase =
  'min-w-0 rounded-lg text-sm sm:text-base font-medium transition-all flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-5 py-2.5 sm:py-3'

/** Primary page navigation — wraps on small screens (no horizontal scroll). */
export function PageTabs({ tabs, active, onChange, className = '' }: PageTabsProps) {
  const visible = tabs.filter((t) => !t.hidden)
  if (visible.length === 0) return null

  return (
    <div
      className={`rounded-xl border border-gray-200/80 bg-gray-50/80 p-1 min-w-0 ${className}`}
      role="tablist"
    >
      <div className="flex flex-wrap gap-1 w-full min-w-0">
        {visible.map((tab) => {
          const isActive = active === tab.id
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(tab.id)}
              className={`${tabButtonBase} flex-1 basis-[calc(50%-0.125rem)] sm:flex-none sm:basis-auto ${
                isActive
                  ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200/80'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-white/60'
              }`}
            >
              {Icon && (
                <Icon className={`w-4 h-4 sm:w-5 sm:h-5 shrink-0 ${isActive ? 'text-accent' : 'text-gray-400'}`} />
              )}
              <span className="truncate">{tab.label}</span>
              {tab.badge !== undefined && tab.badge !== '' && (
                <span
                  className={`text-xs font-semibold tabular-nums px-1.5 sm:px-2 py-0.5 rounded-md shrink-0 ${
                    isActive ? 'bg-accent/10 text-accent' : 'bg-gray-200/80 text-gray-600'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

type SegmentTabsProps = {
  tabs: PageTab[]
  active: string
  onChange: (id: string) => void
  className?: string
}

/** Secondary navigation inside a panel (e.g. Services / Parts / Labor). */
export function SegmentTabs({ tabs, active, onChange, className = '' }: SegmentTabsProps) {
  const visible = tabs.filter((t) => !t.hidden)

  return (
    <div
      className={`w-full min-w-0 rounded-lg bg-gray-100 p-1 ${className}`}
      role="tablist"
    >
      <div className="flex flex-wrap gap-1 w-full min-w-0">
        {visible.map((tab) => {
          const isActive = active === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(tab.id)}
              className={`min-w-0 flex-1 basis-[calc(33.333%-0.25rem)] sm:flex-none sm:basis-auto px-2 sm:px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <span className="truncate">{tab.label}</span>
              {tab.badge !== undefined && (
                <span className={`ml-1 ${isActive ? 'text-accent' : 'text-gray-400'}`}>{tab.badge}</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

type UnderlineTab = {
  id: string
  label: string
  icon?: LucideIcon
}

type UnderlineTabsProps = {
  tabs: UnderlineTab[]
  active: string
  onChange: (id: string) => void
  className?: string
}

/** Underline-style tabs that wrap on mobile instead of scrolling horizontally. */
export function UnderlineTabs({ tabs, active, onChange, className = '' }: UnderlineTabsProps) {
  return (
    <div className={`border-b border-gray-200 min-w-0 ${className}`}>
      <nav className="grid grid-cols-2 gap-x-1 sm:flex sm:flex-wrap sm:gap-x-6 w-full min-w-0" role="tablist">
        {tabs.map((tab) => {
          const isActive = active === tab.id
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(tab.id)}
              className={`flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 py-2.5 sm:py-3 px-1 min-w-0 text-xs sm:text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? 'border-brand-primary text-brand-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {Icon && <Icon className="w-4 h-4 shrink-0" />}
              <span className="truncate">{tab.label}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
