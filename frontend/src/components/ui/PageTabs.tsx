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

/** Primary page navigation — pill bar, scrollable on small screens. */
export function PageTabs({ tabs, active, onChange, className = '' }: PageTabsProps) {
  const visible = tabs.filter((t) => !t.hidden)
  if (visible.length === 0) return null

  return (
    <div
      className={`rounded-xl border border-gray-200/80 bg-gray-50/80 p-1 ${className}`}
      role="tablist"
    >
      <div className="flex gap-1 overflow-x-auto scrollbar-none">
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
              className={`flex items-center justify-center gap-2 min-w-0 flex-1 sm:flex-none px-5 py-3 rounded-lg text-base font-medium whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200/80'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-white/60'
              }`}
            >
              {Icon && <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-accent' : 'text-gray-400'}`} />}
              <span>{tab.label}</span>
              {tab.badge !== undefined && tab.badge !== '' && (
                <span
                  className={`text-xs font-semibold tabular-nums px-2 py-0.5 rounded-md ${
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
      className={`inline-flex flex-wrap gap-1 rounded-lg bg-gray-100 p-1 ${className}`}
      role="tablist"
    >
      {visible.map((tab) => {
        const isActive = active === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              isActive ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {tab.label}
            {tab.badge !== undefined && (
              <span className={`ml-1.5 ${isActive ? 'text-accent' : 'text-gray-400'}`}>{tab.badge}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
