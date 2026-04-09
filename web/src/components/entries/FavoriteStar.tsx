import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToggleFavorite } from '@/hooks/use-favorites'

interface FavoriteStarProps {
  entryId: number
  isFavorite: boolean
  deviceId: string
  className?: string
}

export function FavoriteStar({ entryId, isFavorite, deviceId, className }: FavoriteStarProps) {
  const { toggle } = useToggleFavorite(deviceId)

  return (
    <button
      onClick={(e) => { e.stopPropagation(); toggle(entryId, isFavorite) }}
      className={cn(
        'cursor-pointer transition-all hover:scale-110 inline-flex items-center justify-center p-2 -m-2 rounded-md hover:bg-muted/60 active:scale-95',
        isFavorite ? 'text-amber-500' : 'text-muted-foreground/40 hover:text-muted-foreground/60',
        className
      )}
      aria-label={isFavorite ? '取消收藏' : '收藏'}
    >
      <Star className="h-5 w-5" fill={isFavorite ? 'currentColor' : 'none'} />
    </button>
  )
}
