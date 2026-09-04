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

function wosStatusLabel(status: EntryListItem['wos_status']): string {
  if (status === 'not_indexed') return 'WOS 未收录'
  if (status === 'partition_unavailable') return 'WOS 暂无分区'
  if (status === 'auth_required') return 'WOS 需登录更新'
  if (status === 'source_missing') return 'WOS 状态待确认'
  if (status === 'detail_not_found') return 'WOS 无详情'
  return ''
}

interface JournalCardProps {
  entry: EntryListItem
  deviceId: string
  onClick: () => void
}

export function JournalCard({ entry, deviceId, onClick }: JournalCardProps) {
  const cas = extractZone(entry.cas2025)
  const xin = extractZone(entry.xinrui)
  const isTopJournal = isTop(entry.cas2025)
  const displayName = entry.ccf_abbr || entry.journal_abbr || entry.name || '未命名期刊'
  const displayFullName = entry.ccf_full || entry.name || ''
  const displayPublisher = entry.ccf_publisher || entry.publisher || ''

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
          {entry.is_ccf ? (
            <LevelBadge level={entry.ccf_level} />
          ) : (
            <Badge variant="outline" className="h-[22px] px-2 text-[10px]">Non-CCF</Badge>
          )}
          <span className="font-semibold text-sm max-w-[16rem] truncate" title={displayName}>{displayName}</span>
          {isTopJournal && <TopBadge />}
        </div>
        {displayFullName !== displayName && <div className="text-xs text-muted-foreground truncate mb-2">{displayFullName}</div>}
        <div className="flex items-center gap-1.5 flex-wrap mb-2">
          {cas && <><span className="text-[10px] text-muted-foreground font-medium">中科院</span><ZoneBadge zone={cas} variant="cas" /></>}
          {xin && <><span className="text-[10px] text-muted-foreground font-medium">新锐</span><ZoneBadge zone={xin} variant="xinrui" /></>}
          {entry.wos_zone && <ZoneBadge zone={`JCR${entry.wos_zone}`} variant="jcr" />}
          {!entry.wos_zone && wosStatusLabel(entry.wos_status) && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-[20px]" title={entry.wos_reason || undefined}>
              {wosStatusLabel(entry.wos_status)}
            </Badge>
          )}
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
          {displayPublisher && <span className="text-xs text-muted-foreground">{displayPublisher}</span>}
          {entryTags.length > 0 && entryTags.map(t => <TagBadge key={t} name={t} />)}
          {entry.note && !noteEditing && (
            <span
              onClick={e => { e.stopPropagation(); setNoteEditing(true) }}
              className="flex-1 text-[11px] text-muted-foreground/70 italic truncate cursor-pointer hover:text-muted-foreground min-w-0"
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
        <div className="absolute top-3 right-2 flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); setNoteEditing(true) }}
            className="p-2 -m-1.5 rounded-md hover:bg-muted/60 text-muted-foreground/40 hover:text-muted-foreground/60 transition-all"
            aria-label="备注"
          >
            <PencilLine className="h-5 w-5" />
          </button>
          <TagPicker deviceId={deviceId} selectedTags={entryTags} onTagsChange={handleTagsChange}>
            <button
              onClick={(e) => e.stopPropagation()}
              className="p-2 -m-1.5 rounded-md hover:bg-muted/60 text-muted-foreground/40 hover:text-muted-foreground/60 transition-all"
              aria-label="标签"
            >
              <Tag className="h-5 w-5" />
            </button>
          </TagPicker>
          <FavoriteStar entryId={entry.id} isFavorite={entry.is_favorite} deviceId={deviceId} />
        </div>
      </CardContent>
    </Card>
  )
}
