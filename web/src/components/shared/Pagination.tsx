import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface PaginationProps {
  page: number
  totalPages: number
  total: number
  onPageChange: (p: number) => void
}

export function Pagination({ page, totalPages, total, onPageChange }: PaginationProps) {
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
    <div className="flex justify-center items-center gap-1 py-3">
      <Button
        variant="outline"
        size="icon"
        className="h-7 w-7"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </Button>
      {result.map((p, i) =>
        p === '...' ? (
          <span key={`e${i}`} className="text-xs text-muted-foreground px-1">…</span>
        ) : (
          <Button
            key={p}
            variant={p === page ? 'default' : 'outline'}
            size="icon"
            className="h-7 w-7 text-xs"
            onClick={() => onPageChange(p as number)}
          >
            {p}
          </Button>
        )
      )}
      <Button
        variant="outline"
        size="icon"
        className="h-7 w-7"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </Button>
      <span className="text-xs text-muted-foreground ml-1">共 {total} 条</span>
    </div>
  )
}
