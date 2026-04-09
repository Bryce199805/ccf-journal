import { Search } from 'lucide-react'

export function EmptyState() {
  return (
    <div className="text-center py-12 text-muted-foreground">
      <Search className="mx-auto mb-2 h-8 w-8 opacity-50" />
      <p className="text-xs">没有匹配结果</p>
    </div>
  )
}
