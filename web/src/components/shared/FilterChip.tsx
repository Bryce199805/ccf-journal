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
      className={cn(
        'inline-flex items-center px-3 py-1 rounded-md text-xs font-medium cursor-pointer select-none transition-all',
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
