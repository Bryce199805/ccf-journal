import { JournalCardGrid } from './JournalCardGrid'
import { JournalTable } from './JournalTable'
import { ConferenceList } from './ConferenceList'
import { Pagination } from '@/components/shared/Pagination'
import { EmptyState } from '@/components/shared/EmptyState'
import { CatalogLegend } from '@/components/shared/CatalogLegend'
import { RequestError } from '@/components/shared/RequestError'
import { Loader2 } from 'lucide-react'
import type { EntryListItem, FilterState } from '@/api/types'

interface EntryListProps {
  entries: EntryListItem[]
  total: number
  page: number
  totalPages: number
  filter: FilterState
  deviceId: string
  isLoading: boolean
  isFetching: boolean
  isError: boolean
  onRetry: () => void
  onReset: () => void
  onBrowse: () => void
  onSelect: (id: number) => void
  onPageChange: (p: number) => void
}

export function EntryList({
  entries, total, page, totalPages, filter, deviceId, isLoading, isFetching, isError, onRetry, onReset, onBrowse, onSelect, onPageChange
}: EntryListProps) {
  if (isLoading) {
    return (
      <div role="status" className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />正在加载目录…
      </div>
    )
  }

  const filtered = Boolean(filter.query || filter.catalog !== 'all' || filter.domains.length || filter.levels.length || filter.casZones.length || filter.wosZones.length || filter.topOnly || filter.tag)
  if (entries.length === 0) {
    if (isError) return <RequestError onRetry={onRetry} pending={isFetching} />
    if (isFetching) return <div role="status" className="py-12 text-center text-sm text-muted-foreground">正在更新结果…</div>
    return <EmptyState favorites={filter.favOnly} filtered={filtered} onReset={onReset} onBrowse={onBrowse} />
  }

  const isJournal = filter.type === 'journal'

  return (
    <>
      {isError && <RequestError message="更新失败，当前显示上次加载的结果。" onRetry={onRetry} pending={isFetching} />}
      <div role="status" aria-live="polite" className="sr-only">
        {isFetching ? <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" />正在更新结果…</span> : `找到 ${total} 条${filter.favOnly ? '收藏' : '结果'}`}
      </div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          {isJournal ? '期刊列表' : '会议列表'}
          <span className="rounded-full border border-primary/15 bg-primary/10 px-2.5 py-0.5 text-xs font-medium tabular-nums text-primary">{total}</span>
          {isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" aria-hidden="true" />}
        </div>
        <div className="flex shrink-0 items-center gap-1"><span className="text-xs tabular-nums text-muted-foreground">第 {page} / {totalPages} 页</span><CatalogLegend /></div>
      </div>
      {isJournal ? (
        filter.layout === 'card' ? (
          <JournalCardGrid entries={entries} deviceId={deviceId} onSelect={onSelect} />
        ) : (
          <JournalTable entries={entries} deviceId={deviceId} onSelect={onSelect} />
        )
      ) : (
        <ConferenceList entries={entries} deviceId={deviceId} />
      )}
      <Pagination page={page} totalPages={totalPages} total={total} onPageChange={onPageChange} pending={isFetching} />
    </>
  )
}
