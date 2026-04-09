import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { ZoneBadge, LevelBadge, TopBadge } from '@/components/shared/ZoneBadge'
import { FavoriteStar } from './FavoriteStar'
import { fmt } from '@/lib/utils'
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
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12 text-center">等级</TableHead>
            <TableHead className="min-w-[100px]">简称</TableHead>
            <TableHead>全称</TableHead>
            <TableHead className="min-w-[90px]">领域</TableHead>
            <TableHead className="w-16 text-center">中科院</TableHead>
            <TableHead className="w-16 text-center">新锐</TableHead>
            <TableHead className="w-14 text-center">IF</TableHead>
            <TableHead className="w-14 text-center">CS</TableHead>
            <TableHead className="w-10 text-center">H</TableHead>
            <TableHead className="w-12 text-center">★</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map(e => {
            const cas = extractZone(e.cas2025)
            const xin = extractZone(e.xinrui)
            const top = isTop(e.cas2025) || isTop(e.xinrui)
            return (
              <TableRow
                key={e.id}
                className="cursor-pointer"
                onClick={() => onSelect(e.id)}
              >
                <TableCell className="text-center"><LevelBadge level={e.ccf_level} /></TableCell>
                <TableCell>
                  <span className="font-medium">{e.ccf_abbr}</span>
                  {top && <TopBadge className="ml-1" />}
                </TableCell>
                <TableCell className="text-muted-foreground max-w-[320px] truncate">{e.ccf_full}</TableCell>
                <TableCell className="text-muted-foreground text-xs whitespace-nowrap">{e.ccf_domain}</TableCell>
                <TableCell className="text-center">{cas ? <ZoneBadge zone={cas} variant="cas" /> : '-'}</TableCell>
                <TableCell className="text-center">{xin ? <ZoneBadge zone={xin} variant="xinrui" /> : '-'}</TableCell>
                <TableCell className="text-center font-medium tabular-nums">{e.impact_factor != null ? fmt(e.impact_factor) : '-'}</TableCell>
                <TableCell className="text-center font-medium tabular-nums">{e.cite_score != null ? fmt(e.cite_score) : '-'}</TableCell>
                <TableCell className="text-center">{e.h_index ?? '-'}</TableCell>
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
