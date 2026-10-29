import { Search, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function EmptyState({ favorites = false, filtered = false, onReset, onBrowse }: { favorites?: boolean; filtered?: boolean; onReset: () => void; onBrowse: () => void }) {
  const Icon = favorites && !filtered ? Star : Search
  return (
    <div className="rounded-xl border border-dashed bg-card px-5 py-12 text-center" role="status">
      <Icon className="mx-auto mb-4 h-8 w-8 text-muted-foreground" />
      <h2 className="text-base font-semibold">{favorites && !filtered ? '还没有收藏' : '没有匹配结果'}</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
        {favorites && !filtered ? '点击条目上的星标，将感兴趣的期刊或会议保存在这里。' : '试试更短的关键词，或减少筛选条件。'}
      </p>
      <Button className="mt-5" variant="outline" onClick={filtered ? onReset : onBrowse}>
        {filtered ? '清除搜索和筛选' : '浏览全部目录'}
      </Button>
    </div>
  )
}
