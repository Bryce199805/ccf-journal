import { JournalCard } from './JournalCard'
import type { EntryListItem } from '@/api/types'

interface JournalCardGridProps {
  entries: EntryListItem[]
  deviceId: string
  onSelect: (id: number) => void
}

export function JournalCardGrid({ entries, deviceId, onSelect }: JournalCardGridProps) {
  return (
    <div className="space-y-3">
      {entries.map(e => (
        <JournalCard key={e.id} entry={e} deviceId={deviceId} onClick={() => onSelect(e.id)} />
      ))}
    </div>
  )
}
