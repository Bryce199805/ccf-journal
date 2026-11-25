import { CompareButton } from '@/components/compare/CompareButton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { ZoneBadge, TopBadge } from '@/components/shared/ZoneBadge'
import { Badge } from '@/components/ui/badge'
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
      <Table className="data-table min-w-[60rem] table-fixed">
        <colgroup>
          <col className="w-24" />
          <col className="w-28" />
          <col />
          <col className="w-32" />
          <col className="w-16" />
          <col className="w-16" />
          <col className="w-14" />
          <col className="w-20" />
          <col className="w-14" />
          <col className="w-14" />
          <col className="w-14" />
          <col className="w-12" />
        </colgroup>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="text-center">目录等级</TableHead>
            <TableHead>简称</TableHead>
            <TableHead>全称</TableHead>
            <TableHead>领域</TableHead>
            <TableHead className="text-center">中科院</TableHead>
            <TableHead className="text-center">新锐</TableHead>
            <TableHead className="text-center">TOP</TableHead>
            <TableHead className="text-center">JCR</TableHead>
            <TableHead className="text-center">IF</TableHead>
            <TableHead className="text-center">CS</TableHead>
            <TableHead className="text-center">H</TableHead>
            <TableHead className="text-center">★</TableHead>
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
                    <button className="font-medium block max-w-full truncate text-left hover:text-primary" title={displayName} aria-label={`查看 ${displayName} 详情`} onClick={event => { event.stopPropagation(); onSelect(e.id) }}>{displayName}</button>
                  </div>
                  <CompareButton entry={e} />
                </TableCell>
                <TableCell className="text-muted-foreground whitespace-normal [overflow-wrap:anywhere]" title={displayFullName}>{displayFullName}</TableCell>
                <TableCell className="text-muted-foreground text-xs whitespace-normal"><CCFRelations entry={e} /></TableCell>
                <TableCell className="text-center">{cas ? <ZoneBadge zone={cas} variant="cas" /> : '-'}</TableCell>
                <TableCell className="text-center">{xin ? <ZoneBadge zone={xin} variant="xinrui" /> : '-'}</TableCell>
                <TableCell className="text-center">{top ? <TopBadge /> : '-'}</TableCell>
                <TableCell className="text-center text-xs text-muted-foreground whitespace-normal [overflow-wrap:anywhere]" title={e.wos_reason || undefined}>
                  {e.wos_zone ? <ZoneBadge zone={`JCR${e.wos_zone}`} variant="jcr" /> : wosStatusLabel(e.wos_status) || '-'}
                </TableCell>
                <TableCell data-tone="blue" className="metric-value text-center font-semibold tabular-nums whitespace-normal [overflow-wrap:anywhere]">{e.impact_factor != null ? fmt(e.impact_factor) : '-'}</TableCell>
                <TableCell data-tone="emerald" className="metric-value text-center font-semibold tabular-nums whitespace-normal [overflow-wrap:anywhere]">{e.cite_score != null ? fmt(e.cite_score) : '-'}</TableCell>
                <TableCell data-tone="violet" className="metric-value text-center font-semibold tabular-nums whitespace-normal [overflow-wrap:anywhere]">{e.h_index ?? '-'}</TableCell>
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
