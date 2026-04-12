import { cn } from '@/lib/utils'

const TAG_COLORS = [
  { key: 'blue', bg: 'bg-blue-100 dark:bg-blue-900/40', text: 'text-blue-700 dark:text-blue-300' },
  { key: 'emerald', bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-700 dark:text-emerald-300' },
  { key: 'violet', bg: 'bg-violet-100 dark:bg-violet-900/40', text: 'text-violet-700 dark:text-violet-300' },
  { key: 'orange', bg: 'bg-orange-100 dark:bg-orange-900/40', text: 'text-orange-700 dark:text-orange-300' },
  { key: 'pink', bg: 'bg-pink-100 dark:bg-pink-900/40', text: 'text-pink-700 dark:text-pink-300' },
  { key: 'cyan', bg: 'bg-cyan-100 dark:bg-cyan-900/40', text: 'text-cyan-700 dark:text-cyan-300' },
  { key: 'amber', bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-700 dark:text-amber-300' },
  { key: 'rose', bg: 'bg-rose-100 dark:bg-rose-900/40', text: 'text-rose-700 dark:text-rose-300' },
]

export function getTagColorByKey(key: string) {
  return TAG_COLORS.find(c => c.key === key)
}

export function getTagColorClass(name: string) {
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
        'inline-flex items-center h-[18px] px-1.5 rounded text-[10px] font-medium',
        resolved?.bg, resolved?.text,
        className,
      )}
    >
      {name}
    </span>
  )
}

export { TAG_COLORS }
