import { Star, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToggleFavorite } from '@/hooks/use-favorites'

interface FavoriteStarProps {
  entryId: number
  isFavorite: boolean
  deviceId: string
  className?: string
}

export function FavoriteStar({ entryId, isFavorite, deviceId, className }: FavoriteStarProps) {
  const { toggle, addPending, removePending, isError } = useToggleFavorite(deviceId)

  const pending = addPending || removePending
  return (
    <span className="relative inline-flex shrink-0">
    <button
      disabled={pending}
      aria-busy={pending}
      aria-pressed={isFavorite}
      onClick={(e) => { e.stopPropagation(); toggle(entryId, isFavorite) }}
      className={cn(
        'disabled:opacity-50 disabled:cursor-wait cursor-pointer transition-all hover:scale-110 inline-flex items-center justify-center p-2 -m-2 rounded-md hover:bg-muted/60 active:scale-95',
        isFavorite ? 'text-amber-500' : 'text-muted-foreground hover:text-foreground',
        className
      )}
      aria-label={isFavorite ? '取消收藏' : '收藏'}
    >
      <>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Star className="h-5 w-5" fill={isFavorite ? 'currentColor' : 'none'} />}</>
    </button>
    {isError && <span role="alert" className="absolute right-0 top-full z-10 mt-2 w-40 whitespace-normal rounded-md border bg-popover p-2 text-xs text-destructive shadow-md">收藏操作失败，请点击星标重试。</span>}
    </span>
  )
}
