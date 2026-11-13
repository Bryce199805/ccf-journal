import { cn } from '@/lib/utils'

interface FilterChipProps {
  label: string
  active: boolean
  grade?: string
  onClick: () => void
}

export function FilterChip({ label, active, grade, onClick }: FilterChipProps) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      data-grade={grade}
      className={cn(
        'filter-chip inline-flex max-w-full min-h-10 items-center whitespace-normal [overflow-wrap:anywhere] px-3 py-2 sm:min-h-0 sm:py-1 rounded-md text-xs font-medium cursor-pointer select-none transition-all',
        'border',
        active
          ? 'bg-primary text-primary-foreground border-primary shadow-sm'
          : 'bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground'
      )}
    >
      {label}
    </button>
  )
}
