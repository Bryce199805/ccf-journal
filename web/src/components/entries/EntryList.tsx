import { JournalCardGrid } from './JournalCardGrid'
import { JournalTable } from './JournalTable'
import { ConferenceList } from './ConferenceList'
import { Pagination } from '@/components/shared/Pagination'
import { EmptyState } from '@/components/shared/EmptyState'
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
  onSelect: (id: number) => void
  onPageChange: (p: number) => void
}

export function EntryList({
  entries, total, page, totalPages, filter, deviceId, isLoading, onSelect, onPageChange
}: EntryListProps) {
  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (entries.length === 0) {
    return <EmptyState />
  }

  const isJournal = filter.type === 'journal'

  return (
    <>
      {isJournal ? (
        filter.layout === 'card' ? (
          <JournalCardGrid entries={entries} deviceId={deviceId} onSelect={onSelect} />
        ) : (
          <JournalTable entries={entries} deviceId={deviceId} onSelect={onSelect} />
        )
      ) : (
        <ConferenceList entries={entries} deviceId={deviceId} />
      )}
      <Pagination page={page} totalPages={totalPages} total={total} onPageChange={onPageChange} />
    </>
  )
}
