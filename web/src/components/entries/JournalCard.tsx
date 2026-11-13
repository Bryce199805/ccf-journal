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

  return (
    <Card
      className="journal-card group min-w-0 h-full cursor-pointer gap-0 overflow-hidden py-0"
      onClick={event => { if (event.currentTarget.contains(event.target as Node)) onClick() }}
    >
      <CardContent className="flex h-full flex-col p-0">
        <div className="flex-1 p-4 sm:p-5">
          <div className="mb-3 flex flex-col items-start justify-between gap-3 sm:flex-row">
            <div className="min-w-0 w-full flex-1">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {entry.is_ccf ? <CCFGrade entry={entry} /> : (
                  <Badge variant="outline" className="h-[22px] px-2 text-xs">
                    {entry.catalog_source === 'historical_ccf' ? '历史 CCF' : 'Non-CCF'}
                  </Badge>
                )}
                {isTopJournal && <TopBadge />}
              </div>
              <h2 className="[overflow-wrap:anywhere] text-base font-semibold leading-snug tracking-tight" title={displayName}><button className="rounded-sm text-left hover:text-primary" onClick={e => { e.stopPropagation(); onClick() }} aria-label={`查看 ${displayName} 详情`}>{displayName}</button></h2>
              {displayFullName !== displayName && (
                <p className="mt-1 [overflow-wrap:anywhere] text-sm leading-relaxed text-muted-foreground" title={displayFullName}>{displayFullName}</p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-0.5 rounded-lg border border-border/60 p-0.5 text-muted-foreground">
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
          {entry.is_ccf && <div className="mb-3"><CCFRelations entry={entry} /></div>}
          {entry.is_ccf && !entry.journalid && (
            <p className="mb-3 rounded-md bg-muted/50 px-2.5 py-2 text-xs text-muted-foreground">已收录 CCF 目录，期刊指标待补充</p>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {cas && <span className="inline-flex items-center gap-1.5"><span className="text-xs text-muted-foreground">中科院</span><ZoneBadge zone={cas} variant="cas" /></span>}
            {xin && <span className="inline-flex items-center gap-1.5"><span className="text-xs text-muted-foreground">新锐</span><ZoneBadge zone={xin} variant="xinrui" /></span>}
            {entry.wos_zone && <ZoneBadge zone={`JCR${entry.wos_zone}`} variant="jcr" />}
            {!entry.wos_zone && wosStatusLabel(entry.wos_status) && (
              <span className="text-xs text-muted-foreground" title={entry.wos_reason || undefined}>JCR {wosStatusLabel(entry.wos_status)}</span>
            )}
            {entry.sci_type && <Badge variant="secondary" className="px-1.5 py-0 text-xs font-medium">{entry.sci_type}</Badge>}
          </div>
        </div>
        <dl className="metric-strip grid grid-cols-4 gap-px border-y">
          {[
            ['IF', entry.impact_factor != null ? fmt(entry.impact_factor) : '—', 'blue'],
            ['CiteScore', entry.cite_score != null ? fmt(entry.cite_score) : '—', 'emerald'],
            ['H-index', entry.h_index ?? '—', 'violet'],
            ['文章数', entry.article_count ?? '—', 'orange'],
          ].map(([label, value, tone]) => (
            <div key={label} data-tone={tone} className="metric-cell min-w-0 px-2 py-3 text-center">
              <dt className="mb-1 text-xs text-muted-foreground">{label}</dt>
              <dd className="[overflow-wrap:anywhere] text-sm font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
          <span className="min-w-0 [overflow-wrap:anywhere] text-xs text-muted-foreground" title={displayPublisher}>{displayPublisher || '出版商待补充'}</span>
          {entry.letpub_url && (
            <a href={entry.letpub_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
              className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline">
              LetPub <ArrowUpRight className="h-3 w-3" />
            </a>
          )}
        </div>
        {(entryTags.length > 0 || entry.note || noteEditing) && (
          <div className="space-y-2 border-t border-dashed px-4 py-3 sm:px-5">
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
      </CardContent>
    </Card>
  )
}
