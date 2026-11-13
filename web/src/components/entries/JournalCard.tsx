import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ZoneBadge, TopBadge } from '@/components/shared/ZoneBadge'
import { FavoriteStar } from './FavoriteStar'
import { NoteEditor } from './NoteEditor'
import { TagPicker } from './TagPicker'
import { TagBadge } from '@/components/tags/TagBadge'
import { useUpdateFavoriteTags } from '@/hooks/use-favorites'
import { fmt } from '@/lib/utils'
import { wosStatusLabel } from '@/lib/wos'
import { CCFGrade, CCFRelations } from '@/components/shared/CCFRelations'
import { Tag, PencilLine, ArrowUpRight } from 'lucide-react'
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
  const isTopJournal = isTop(entry.cas2025)
  const displayName = entry.ccf_abbr || entry.journal_abbr || entry.ccf_full || entry.name || '未命名期刊'
  const displayFullName = entry.ccf_full || entry.name || ''
  const displayPublisher = entry.ccf_publisher || entry.publisher || ''

  const [noteEditing, setNoteEditing] = useState(false)
  const updateFavTags = useUpdateFavoriteTags(deviceId)
  const entryTags = entry.tags || []
  const handleTagsChange = (newTags: string[]) => {
    updateFavTags.mutate({ entryId: entry.id, tags: newTags })
  }

  const metrics = [
    ['IF', entry.impact_factor != null ? fmt(entry.impact_factor) : '—', 'blue'],
    ['CiteScore', entry.cite_score != null ? fmt(entry.cite_score) : '—', 'emerald'],
    ['H-index', entry.h_index ?? '—', 'violet'],
    ['文章数', entry.article_count ?? '—', 'orange'],
  ]

  return (
    <Card
      className="journal-card group min-w-0 h-full cursor-pointer gap-0 overflow-hidden py-0"
      onClick={event => { if (event.currentTarget.contains(event.target as Node)) onClick() }}
    >
      <CardContent className="grid h-full p-0 md:grid-cols-[minmax(0,1fr)_12.5rem]">
        <div className="min-w-0 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              {entry.is_ccf ? <CCFGrade entry={entry} /> : (
                <Badge variant="outline" className="h-[22px] px-2 text-xs">
                  {entry.catalog_source === 'historical_ccf' ? '历史 CCF' : 'Non-CCF'}
                </Badge>
              )}
              {isTopJournal && <TopBadge />}
              {entry.sci_type && <Badge variant="secondary" className="px-1.5 py-0 text-xs font-medium">{entry.sci_type}</Badge>}
            </div>
            <div className="-mr-1 -mt-1 flex shrink-0 items-center text-muted-foreground">
              <button
                onClick={e => { e.stopPropagation(); setNoteEditing(true) }}
                className="inline-flex h-10 w-10 sm:h-8 sm:w-8 items-center justify-center rounded-md transition-colors hover:bg-muted hover:text-foreground"
                aria-label="备注" title="编辑备注"
              >
                <PencilLine className="h-4 w-4" />
              </button>
              <TagPicker deviceId={deviceId} selectedTags={entryTags} onTagsChange={handleTagsChange} pending={updateFavTags.isPending} error={updateFavTags.isError}>
                <button
                  onClick={e => e.stopPropagation()}
                  className="inline-flex h-10 w-10 sm:h-8 sm:w-8 items-center justify-center rounded-md transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="标签" title="管理标签"
                >
                  <Tag className="h-4 w-4" />
                </button>
              </TagPicker>
              <FavoriteStar entryId={entry.id} isFavorite={entry.is_favorite} deviceId={deviceId} className="m-0 h-10 w-10 sm:h-8 sm:w-8 p-0 [&_svg]:h-4 [&_svg]:w-4" />
            </div>
          </div>
          <h2 className="mt-1.5 [overflow-wrap:anywhere] text-base font-semibold leading-snug tracking-tight" title={displayName}><button className="rounded-sm text-left hover:text-primary" onClick={e => { e.stopPropagation(); onClick() }} aria-label={`查看 ${displayName} 详情`}>{displayName}</button></h2>
          {displayFullName !== displayName && (
            <p className="mt-0.5 line-clamp-2 [overflow-wrap:anywhere] text-sm leading-snug text-muted-foreground" title={displayFullName}>{displayFullName}</p>
          )}
          <div className="mt-1 flex items-center gap-x-3 text-xs text-muted-foreground">
            <span className="min-w-0 truncate" title={displayPublisher}>{displayPublisher || '出版商待补充'}</span>
            {entry.letpub_url && (
              <a href={entry.letpub_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                className="inline-flex shrink-0 items-center gap-0.5 font-medium text-primary hover:underline">
                LetPub <ArrowUpRight className="h-3 w-3" />
              </a>
            )}
          </div>
          {entry.is_ccf && <div className="mt-2"><CCFRelations entry={entry} /></div>}
          {entry.is_ccf && !entry.journalid && (
            <p className="mt-2 rounded-md bg-muted/50 px-2.5 py-1.5 text-xs text-muted-foreground">已收录 CCF 目录，期刊指标待补充</p>
          )}
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {cas && <span className="inline-flex items-center gap-1.5"><span className="text-xs text-muted-foreground">中科院</span><ZoneBadge zone={cas} variant="cas" /></span>}
            {xin && <span className="inline-flex items-center gap-1.5"><span className="text-xs text-muted-foreground">新锐</span><ZoneBadge zone={xin} variant="xinrui" /></span>}
            {entry.wos_zone && <ZoneBadge zone={`JCR${entry.wos_zone}`} variant="jcr" />}
            {!entry.wos_zone && wosStatusLabel(entry.wos_status) && (
              <span className="text-xs text-muted-foreground" title={entry.wos_reason || undefined}>JCR {wosStatusLabel(entry.wos_status)}</span>
            )}
          </div>
          {(entryTags.length > 0 || entry.note || noteEditing) && (
            <div className="mt-2.5 space-y-2 border-t border-dashed pt-2.5">
              {entryTags.length > 0 && <div className="flex flex-wrap gap-1">{entryTags.map(t => <TagBadge key={t} name={t} />)}</div>}
              {entry.note && !noteEditing && (
                <button
                  onClick={e => { e.stopPropagation(); setNoteEditing(true) }}
                  className="flex w-full items-center gap-1.5 text-left text-xs text-muted-foreground hover:text-foreground" title={entry.note}
                >
                  <PencilLine className="h-3 w-3 shrink-0" /><span className="min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]">{entry.note}</span>
                </button>
              )}
              {noteEditing && <NoteEditor entryId={entry.id} deviceId={deviceId} initialContent={entry.note || ''} onDone={() => setNoteEditing(false)} />}
            </div>
          )}
        </div>
        <div className="metric-aside border-t md:flex md:items-center md:border-l md:border-t-0 md:p-3">
          <dl className="metric-strip grid w-full grid-cols-4 gap-px md:grid-cols-2 md:gap-2 md:bg-transparent">
            {metrics.map(([label, value, tone]) => (
              <div key={label} data-tone={tone} className="metric-cell min-w-0 px-2 py-2.5 text-center md:rounded-lg md:border md:border-[color:var(--tone-line)] md:py-2">
                <dt className="mb-0.5 text-xs text-muted-foreground">{label}</dt>
                <dd className="[overflow-wrap:anywhere] text-base font-semibold tabular-nums md:text-lg">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </CardContent>
    </Card>
  )
}
