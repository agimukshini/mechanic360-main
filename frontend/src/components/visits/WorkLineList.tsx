import { Trash2 } from 'lucide-react'
import { formatEuro } from '@/lib/money'

export type WorkLineRow = {
  id: string
  label: string
  sub: string
  total: string | number
}

type WorkLineListProps = {
  empty: string
  lines: WorkLineRow[]
  isEditable: boolean
  onDelete: (id: string) => void
}

export function WorkLineList({ empty, lines, isEditable, onDelete }: WorkLineListProps) {
  if (lines.length === 0) {
    return (
      <p className="text-base text-secondary text-center py-10 border border-dashed border-gray-200 rounded-lg">
        {empty}
      </p>
    )
  }

  return (
    <ul className="space-y-2">
      {lines.map((line) => (
        <li
          key={line.id}
          className="flex items-center justify-between gap-3 p-4 bg-gray-50 rounded-lg border border-gray-100"
        >
          <div className="min-w-0 flex-1">
            <p className="font-medium text-base text-gray-900">{line.label}</p>
            <p className="text-sm text-secondary mt-0.5">{line.sub}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-base font-semibold text-gray-900 tabular-nums whitespace-nowrap">
              {formatEuro(line.total)}
            </span>
            {isEditable && (
              <button
                type="button"
                onClick={() => onDelete(line.id)}
                className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50"
                aria-label="Remove line"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}
