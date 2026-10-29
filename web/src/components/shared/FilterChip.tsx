import { cn } from '@/lib/utils'

interface FilterChipProps {
  label: string
  active: boolean
  onClick: () => void
}

export function FilterChip({ label, active, onClick }: FilterChipProps) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex max-w-full min-h-10 items-center whitespace-normal [overflow-wrap:anywhere] px-3 py-2 sm:min-h-0 sm:py-1 rounded-md text-xs font-medium cursor-pointer select-none transition-all',
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
