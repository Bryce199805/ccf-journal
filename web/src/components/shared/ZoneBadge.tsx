import { cn } from '@/lib/utils'

interface ZoneBadgeProps {
  zone: string
  variant?: 'cas' | 'xinrui' | 'jcr' | 'default'
  className?: string
}

/**
 * Extract zone number from strings like "1区", "2区", "Q1", "JCR1区", "中科院2区", "新锐3区", or just "1"
 */
function extractZoneNum(zone: string): string {
  // Try to find a single digit 1-4 in the string
  const match = zone.match(/([1-4])/)
  return match ? match[1] : ''
}

export function ZoneBadge({ zone, variant = 'default', className }: ZoneBadgeProps) {
  const n = extractZoneNum(zone)

  let colorClass: string
  if (variant === 'xinrui') {
    colorClass = ['1', '2', '3', '4'].includes(n) ? `xinrui-${n}` : 'zone-n'
  } else if (variant === 'jcr') {
    colorClass = 'zone-jcr'
  } else {
    // CAS: solid, strong colors
    colorClass = ['1', '2', '3', '4'].includes(n) ? `zone-${n}` : 'zone-n'
  }

  // Display text: show the zone label cleanly
  const displayText = zone.replace('中科院', '').replace('新锐', '')

  return (
    <span className={cn(
      'inline-flex items-center justify-center h-[22px] px-2 rounded text-[11px] font-bold tracking-wide',
      colorClass,
      className
    )}>
      {displayText}
    </span>
  )
}

interface LevelBadgeProps {
  level: string
  className?: string
}

export function LevelBadge({ level, className }: LevelBadgeProps) {
  const colorClass = level === 'A' ? 'level-a' : level === 'B' ? 'level-b' : level === 'C' ? 'level-c' : ''
  return (
    <span className={cn(
      'inline-flex items-center justify-center h-[22px] min-w-[1.75rem] px-2 rounded text-[11px] font-bold tracking-wide',
      colorClass,
      className
    )}>
      {level}
    </span>
  )
}

interface TopBadgeProps {
  className?: string
}

export function TopBadge({ className }: TopBadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center justify-center h-[18px] px-1.5 rounded text-[9px] font-extrabold tracking-wider bg-gradient-to-r from-amber-500 to-orange-500 text-white',
      className
    )}>
      TOP
    </span>
  )
}
