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
  try { return JSON.parse(json)?.bigZone || '' } catch { return '' }
}

function isTop(json: string | null): boolean {
  if (!json) return false
  try { return !!JSON.parse(json)?.isTop } catch { return false }
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

  return (
    <Card
      data-entry-id={entry.id}
      className="journal-card grid row-span-3 grid-rows-subgrid group min-w-0 cursor-pointer gap-0 overflow-hidden py-0"
      onClick={event => { if (event.currentTarget.contains(event.target as Node)) onClick() }}
    >
      <CardContent className="contents">
        <div className="min-w-0 space-y-2.5 p-4">
          <div data-card-heading className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
            <h2 className="min-w-0 max-w-full text-base font-semibold leading-snug tracking-tight [overflow-wrap:anywhere]">
              <button className="rounded-sm text-left hover:text-primary" onClick={e => { e.stopPropagation(); onClick() }} aria-label={`查看 ${displayName} 详情`}>{displayName}</button>
            </h2>
            {cas && <ZoneBadge zone={cas} label={`中科院 ${cas}`} variant="cas" className="rounded-sm tracking-normal" />}
            {xin && <ZoneBadge zone={xin} label={`新锐 ${xin}`} variant="xinrui" className="rounded-sm tracking-normal" />}
            {entry.wos_zone && <ZoneBadge zone={entry.wos_zone} variant="jcr" className="rounded-sm tracking-normal" />}
            {!entry.wos_zone && wosStatusLabel(entry.wos_status) && (
              <Badge variant="outline" className="max-w-full rounded-sm whitespace-normal text-xs" title={entry.wos_reason || undefined}>JCR {wosStatusLabel(entry.wos_status)}</Badge>
            )}
            {isTopJournal && <TopBadge className="rounded-sm" />}
            {entry.sci_type && <Badge variant="secondary" className="rounded-sm px-1.5 text-xs font-medium">{entry.sci_type}</Badge>}
          </div>
          {displayFullName !== displayName && (
            <p className="text-sm leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">{displayFullName}</p>
          )}
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <div data-card-classification className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
              {entry.is_ccf ? <><CCFGrade entry={entry} /><CCFRelations entry={entry} compact /></> : (
                <Badge variant="outline" className="rounded-sm px-2 text-xs">{entry.catalog_source === 'historical_ccf' ? '历史 CCF' : 'Non-CCF'}</Badge>
              )}
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-1 text-muted-foreground">
              <button onClick={e => { e.stopPropagation(); setNoteEditing(true) }} className="inline-flex size-9 items-center justify-center rounded-md transition-colors hover:bg-muted hover:text-foreground" aria-label="备注" title="编辑备注">
                <PencilLine className="size-4" />
              </button>
              <TagPicker deviceId={deviceId} selectedTags={entryTags} onTagsChange={handleTagsChange} pending={updateFavTags.isPending} error={updateFavTags.isError}>
                <button onClick={e => e.stopPropagation()} className="inline-flex size-9 items-center justify-center rounded-md transition-colors hover:bg-muted hover:text-foreground" aria-label="标签" title="管理标签"><Tag className="size-4" /></button>
              </TagPicker>
              <FavoriteStar entryId={entry.id} isFavorite={entry.is_favorite} deviceId={deviceId} className="m-0 size-9 p-0 [&_svg]:size-4" />
            </div>
          </div>
          {entry.is_ccf && !entry.journalid && <p className="text-xs leading-relaxed text-muted-foreground">已收录 CCF 目录，期刊指标待补充</p>}
          {(entryTags.length > 0 || entry.note || noteEditing) && (
            <div data-card-personal className="min-w-0 border-t border-dashed pt-2.5">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                {entryTags.map(tag => <TagBadge key={tag} name={tag} />)}
                {entry.note && !noteEditing && (
                  <button onClick={e => { e.stopPropagation(); setNoteEditing(true) }} className="inline-flex min-h-8 min-w-0 max-w-full flex-1 basis-40 items-center gap-1.5 rounded text-left text-xs text-muted-foreground hover:text-foreground" aria-label="编辑备注内容" title={entry.note}>
                    <PencilLine className="size-3 shrink-0" /><span className="line-clamp-1 min-w-0 [overflow-wrap:anywhere]">{entry.note}</span>
                  </button>
                )}
              </div>
              {noteEditing && <NoteEditor entryId={entry.id} deviceId={deviceId} initialContent={entry.note || ''} onDone={() => setNoteEditing(false)} />}
            </div>
          )}
        </div>
        <dl className="metric-strip grid grid-cols-4 gap-px border-y">
          {[
            ['IF', entry.impact_factor != null ? fmt(entry.impact_factor) : '—', 'blue'],
            ['CiteScore', entry.cite_score != null ? fmt(entry.cite_score) : '—', 'emerald'],
            ['H-index', entry.h_index ?? '—', 'violet'],
            ['文章数', entry.article_count ?? '—', 'orange'],
          ].map(([label, value, tone]) => (
            <div key={label} data-tone={tone} className="metric-cell min-w-0 px-2 py-2.5 text-center">
              <dt className="mb-1 text-xs text-muted-foreground">{label}</dt>
              <dd className="text-sm font-semibold tabular-nums [overflow-wrap:anywhere]">{value}</dd>
            </div>
          ))}
        </dl>
        <div data-card-footer className="flex min-w-0 items-center justify-between gap-3 px-4 py-2.5">
          <span className="min-w-0 text-xs text-muted-foreground [overflow-wrap:anywhere]">{displayPublisher || '出版商待补充'}</span>
          {entry.letpub_url && <a href={entry.letpub_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="inline-flex min-h-8 shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline">LetPub <ArrowUpRight className="size-3" /></a>}
        </div>
      </CardContent>
    </Card>
  )
}
