import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { ZoneBadge, TopBadge } from '@/components/shared/ZoneBadge'
import { Badge } from '@/components/ui/badge'
import { TagBadge } from '@/components/tags/TagBadge'
import { FavoriteStar } from './FavoriteStar'
import { fmt } from '@/lib/utils'
import { wosStatusLabel } from '@/lib/wos'
import { CCFGrade, CCFRelations } from '@/components/shared/CCFRelations'
import type { EntryListItem } from '@/api/types'

function extractZone(json: string | null): string {
  if (!json) return ''
  try { return JSON.parse(json).bigZone || '' } catch { return '' }
}

function isTop(json: string | null): boolean {
  if (!json) return false
  try { return !!JSON.parse(json).isTop } catch { return false }
}

interface JournalTableProps {
  entries: EntryListItem[]
  deviceId: string
  onSelect: (id: number) => void
}

export function JournalTable({ entries, deviceId, onSelect }: JournalTableProps) {
  return (
    <div className="min-w-0 rounded-xl border bg-card">
      <p className="border-b px-3 py-2 text-xs leading-relaxed text-muted-foreground lg:hidden">左右滑动查看完整表格，点击条目查看详情。</p>
      <Table className="data-table">
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="min-w-[90px] text-center">目录等级</TableHead>
            <TableHead className="min-w-[100px]">简称</TableHead>
            <TableHead>全称</TableHead>
            <TableHead className="min-w-[90px]">领域</TableHead>
            <TableHead className="w-16 text-center">中科院</TableHead>
            <TableHead className="w-16 text-center">新锐</TableHead>
            <TableHead className="min-w-[100px] text-center">JCR</TableHead>
            <TableHead className="w-14 text-center">IF</TableHead>
            <TableHead className="w-14 text-center">CS</TableHead>
            <TableHead className="w-10 text-center">H</TableHead>
            <TableHead className="min-w-[80px]">标签</TableHead>
            <TableHead className="min-w-[100px]">备注</TableHead>
            <TableHead className="w-12 text-center">★</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map(e => {
            const cas = extractZone(e.cas2025)
            const xin = extractZone(e.xinrui)
            const top = isTop(e.cas2025)
            const displayName = e.ccf_abbr || e.journal_abbr || e.name || '未命名期刊'
            const displayFullName = e.ccf_full || e.name || ''
            return (
              <TableRow
                key={e.id}
                className="cursor-pointer transition-colors hover:bg-primary/5"
                onClick={() => onSelect(e.id)}
              >
                <TableCell className="text-center">
                  {e.is_ccf ? <CCFGrade entry={e} /> : <Badge variant="outline" className="text-[9px] px-1">{e.catalog_source === 'historical_ccf' ? '历史 CCF' : 'Non-CCF'}</Badge>}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1 min-w-0">
                    <button className="font-medium block max-w-[12rem] truncate text-left hover:text-primary" title={displayName} aria-label={`查看 ${displayName} 详情`} onClick={event => { event.stopPropagation(); onSelect(e.id) }}>{displayName}</button>
                    {top && <TopBadge className="shrink-0" />}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground max-w-[320px] truncate" title={displayFullName}>{displayFullName}</TableCell>
                <TableCell className="text-muted-foreground text-xs min-w-[180px]"><CCFRelations entry={e} /></TableCell>
                <TableCell className="text-center">{cas ? <ZoneBadge zone={cas} variant="cas" /> : '-'}</TableCell>
                <TableCell className="text-center">{xin ? <ZoneBadge zone={xin} variant="xinrui" /> : '-'}</TableCell>
                <TableCell className="text-center text-xs text-muted-foreground" title={e.wos_reason || undefined}>
                  {e.wos_zone ? <ZoneBadge zone={`JCR${e.wos_zone}`} variant="jcr" /> : wosStatusLabel(e.wos_status) || '-'}
                </TableCell>
                <TableCell className="text-center font-medium tabular-nums">{e.impact_factor != null ? fmt(e.impact_factor) : '-'}</TableCell>
                <TableCell className="text-center font-medium tabular-nums">{e.cite_score != null ? fmt(e.cite_score) : '-'}</TableCell>
                <TableCell className="text-center">{e.h_index ?? '-'}</TableCell>
                <TableCell>
                  {e.tags && e.tags.length > 0 ? (
                    <div className="flex gap-0.5 flex-wrap">
                      {e.tags.map(t => <TagBadge key={t} name={t} />)}
                    </div>
                  ) : '-'}
                </TableCell>
                <TableCell className="max-w-[150px] truncate text-xs text-muted-foreground">
                  {e.note || '-'}
                </TableCell>
                <TableCell className="text-center" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                  <FavoriteStar entryId={e.id} isFavorite={e.is_favorite} deviceId={deviceId} />
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
