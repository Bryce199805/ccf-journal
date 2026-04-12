import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ZoneBadge, LevelBadge, TopBadge } from '@/components/shared/ZoneBadge'
import { FavoriteStar } from './FavoriteStar'
import { NoteEditor } from './NoteEditor'
import { TagPicker } from './TagPicker'
import { TagBadge } from '@/components/tags/TagBadge'
import { useUpdateFavoriteTags } from '@/hooks/use-favorites'
import { fmt } from '@/lib/utils'
import { Tag, PencilLine } from 'lucide-react'
import type { EntryListItem } from '@/api/types'

function extractZone(json: string | null): string {
  if (!json) return ''
  try { return JSON.parse(json).bigZone || '' } catch { return '' }
}

function isTop(json: string | null): boolean {
  if (!json) return false
  try { return !!JSON.parse(json).isTop } catch { return false }
}

interface JournalCardProps {
  entry: EntryListItem
  deviceId: string
  onClick: () => void
}

export function JournalCard({ entry, deviceId, onClick }: JournalCardProps) {
  const cas = extractZone(entry.cas2025)
  const xin = extractZone(entry.xinrui)
  const isTopJournal = isTop(entry.cas2025) || isTop(entry.xinrui)

  const [noteEditing, setNoteEditing] = useState(false)
  const updateFavTags = useUpdateFavoriteTags(deviceId)
  const entryTags = entry.tags || []
  const handleTagsChange = (newTags: string[]) => {
    updateFavTags.mutate({ entryId: entry.id, tags: newTags })
  }

  return (
    <Card
      className="cursor-pointer transition-all hover:shadow-md hover:border-primary/30 py-0 group"
      onClick={onClick}
    >
      <CardContent className="p-4 pr-10 relative">
        <div className="flex items-center gap-1.5 flex-wrap mb-1">
          <LevelBadge level={entry.ccf_level} />
          <span className="font-semibold text-sm">{entry.ccf_abbr}</span>
          {isTopJournal && <TopBadge />}
        </div>
        <div className="text-xs text-muted-foreground truncate mb-2">{entry.ccf_full}</div>
        <div className="flex items-center gap-1.5 flex-wrap mb-2">
          {cas && <><span className="text-[10px] text-muted-foreground font-medium">中科院</span><ZoneBadge zone={cas} variant="cas" /></>}
          {xin && <><span className="text-[10px] text-muted-foreground font-medium">新锐</span><ZoneBadge zone={xin} variant="xinrui" /></>}
          {entry.wos_zone && <ZoneBadge zone={`JCR${entry.wos_zone}`} variant="jcr" />}
          {entry.sci_type && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-[20px] font-medium">
              {entry.sci_type}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {entry.impact_factor != null && <span className="text-xs text-muted-foreground">IF <b className="text-foreground tabular-nums">{fmt(entry.impact_factor)}</b></span>}
          {entry.cite_score != null && <span className="text-xs text-muted-foreground">CS <b className="text-foreground tabular-nums">{fmt(entry.cite_score)}</b></span>}
          {entry.h_index != null && <span className="text-xs text-muted-foreground">H <b className="text-foreground">{entry.h_index}</b></span>}
          {entry.article_count != null && <span className="text-xs text-muted-foreground">文章 <b className="text-foreground">{entry.article_count}</b></span>}
          {entry.letpub_url && (
            <a href={entry.letpub_url} target="_blank" rel="noopener"
               onClick={e => e.stopPropagation()}
               className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline font-medium"
            >
              LetPub
            </a>
          )}
          {entry.ccf_publisher && <span className="text-xs text-muted-foreground">{entry.ccf_publisher}</span>}
          {entryTags.length > 0 && entryTags.map(t => <TagBadge key={t} name={t} />)}
          {entry.note && !noteEditing && (
            <span
              onClick={e => { e.stopPropagation(); setNoteEditing(true) }}
              className="text-[11px] text-muted-foreground/70 italic truncate max-w-[140px] cursor-pointer hover:text-muted-foreground"
              title={entry.note}
            >
              📝 {entry.note}
            </span>
          )}
        </div>
        {/* Note editor - only renders when actively editing */}
        {noteEditing && (
          <NoteEditor entryId={entry.id} deviceId={deviceId} initialContent={entry.note || ''} onDone={() => setNoteEditing(false)} />
        )}
        {/* Favorite star + Tag picker - top right corner */}
        <div className="absolute top-3 right-2 flex items-center gap-0.5">
          <button
            onClick={(e) => { e.stopPropagation(); setNoteEditing(true) }}
            className="p-1.5 -m-1 rounded-md hover:bg-muted/60 text-muted-foreground/40 hover:text-muted-foreground/60 transition-all"
            aria-label="备注"
          >
            <PencilLine className="h-4 w-4" />
          </button>
          <TagPicker deviceId={deviceId} selectedTags={entryTags} onTagsChange={handleTagsChange}>
            <button
              onClick={(e) => e.stopPropagation()}
              className="p-1.5 -m-1 rounded-md hover:bg-muted/60 text-muted-foreground/40 hover:text-muted-foreground/60 transition-all"
              aria-label="标签"
            >
              <Tag className="h-4 w-4" />
            </button>
          </TagPicker>
          <FavoriteStar entryId={entry.id} isFavorite={entry.is_favorite} deviceId={deviceId} />
        </div>
      </CardContent>
    </Card>
  )
}
