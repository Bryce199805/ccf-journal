import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface PaginationProps {
  page: number
  totalPages: number
  total: number
  onPageChange: (p: number) => void
  pending?: boolean
}

export function Pagination({ page, totalPages, total, onPageChange, pending }: PaginationProps) {
  if (totalPages <= 1) {
    return <div className="text-center text-xs text-muted-foreground py-3">共 {total} 条</div>
  }

  const pages: (number | '...')[] = [1]
  for (let i = Math.max(2, page - 2); i <= Math.min(totalPages - 1, page + 2); i++) {
    pages.push(i)
  }
  if (totalPages > 1) pages.push(totalPages)

  // Insert ellipsis
  const result: (number | '...')[] = []
  let last = 0
  for (const p of pages) {
    if (p !== '...' && p - last > 1) result.push('...')
    result.push(p)
    last = p as number
  }

  return (
    <div className="flex flex-wrap justify-center items-center gap-2 py-5">
      <Button
        variant="outline"
        size="icon"
        className="h-10 min-w-10 w-auto px-2 sm:h-8 sm:min-w-8"
        disabled={pending || page <= 1}
        aria-label="上一页"
        onClick={() => onPageChange(page - 1)}
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </Button>
      <span className="text-sm tabular-nums sm:hidden">{page} / {totalPages}</span>
      {result.map((p, i) =>
        p === '...' ? (
          <span key={`e${i}`} className="hidden text-xs text-muted-foreground px-1 sm:inline">…</span>
        ) : (
          <Button
            key={p}
            variant={p === page ? 'default' : 'outline'}
            size="icon"
            className="hidden h-8 min-w-8 w-auto px-2 text-xs sm:inline-flex"
            disabled={pending}
            aria-label={`第 ${p} 页`}
            aria-current={p === page ? 'page' : undefined}
            onClick={() => onPageChange(p as number)}
          >
            {p}
          </Button>
        )
      )}
      <Button
        variant="outline"
        size="icon"
        className="h-10 min-w-10 w-auto px-2 sm:h-8 sm:min-w-8"
        disabled={pending || page >= totalPages}
        aria-label="下一页"
        onClick={() => onPageChange(page + 1)}
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </Button>
      <form key={page} className="flex items-center gap-2 text-xs" onSubmit={event => {
        event.preventDefault()
        if (pending) return
        const value = Number(new FormData(event.currentTarget).get('page'))
        if (Number.isSafeInteger(value) && value >= 1 && value <= totalPages && value !== page) onPageChange(value)
      }}>
        <label htmlFor="page-jump" className="text-muted-foreground">跳至</label>
        <input id="page-jump" name="page" type="number" inputMode="numeric" min={1} max={totalPages} required defaultValue={page} disabled={pending} className="h-10 w-16 rounded-md border bg-background px-2 text-base tabular-nums sm:h-8 sm:text-sm" />
        <Button type="submit" variant="outline" size="sm" disabled={pending} className="h-10 sm:h-8">跳转</Button>
      </form>
      <span className="w-full text-center text-xs text-muted-foreground sm:ml-1 sm:w-auto">共 {total} 条</span>
    </div>
  )
}
