import { cn } from '@/lib/utils'

import { TAG_COLORS } from '@/lib/tag-colors'

function getTagColorByKey(key: string) {
  return TAG_COLORS.find(c => c.key === key)
}

function getTagColorClass(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length]
}

interface TagBadgeProps {
  name: string
  color?: string
  className?: string
}

export function TagBadge({ name, color, className }: TagBadgeProps) {
  const colorByKey = color ? getTagColorByKey(color) : undefined
  const colorClass = colorByKey ? undefined : getTagColorClass(name)
  const resolved = colorByKey || colorClass
  return (
    <span
      className={cn(
        'inline-flex min-w-0 max-w-full items-center whitespace-normal [overflow-wrap:anywhere] min-h-6 px-1.5 py-0.5 rounded text-xs font-medium',
        resolved?.bg, resolved?.text,
        className,
      )}
    >
      {name}
    </span>
  )
}
