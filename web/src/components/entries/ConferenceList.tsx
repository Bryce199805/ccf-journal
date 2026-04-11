import { LevelBadge } from '@/components/shared/ZoneBadge'
import { FavoriteStar } from './FavoriteStar'
import { ExternalLink } from 'lucide-react'
import { Card } from '@/components/ui/card'
import type { EntryListItem } from '@/api/types'

interface ConferenceListProps {
  entries: EntryListItem[]
  deviceId: string
}

export function ConferenceList({ entries, deviceId }: ConferenceListProps) {
  return (
    <Card className="py-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2 px-3 w-14 text-center font-medium text-muted-foreground text-xs">等级</th>
            <th className="py-2 px-2 font-medium text-muted-foreground text-xs whitespace-nowrap">简称</th>
            <th className="py-2 px-2 font-medium text-muted-foreground text-xs">全称</th>
            <th className="py-2 px-2 font-medium text-muted-foreground text-xs whitespace-nowrap">领域</th>
            <th className="py-2 px-2 font-medium text-muted-foreground text-xs whitespace-nowrap hidden md:table-cell">出版社</th>
            <th className="py-2 px-2 w-16 font-medium text-muted-foreground text-xs">链接</th>
            <th className="py-2 px-2 min-w-[80px] font-medium text-muted-foreground text-xs">备注</th>
            <th className="py-2 px-2 w-12 text-center font-medium text-muted-foreground text-xs">★</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(e => (
            <tr key={e.id} className="border-b last:border-0 hover:bg-accent/50 transition-colors">
              <td className="py-2 px-3 text-center"><LevelBadge level={e.ccf_level} /></td>
              <td className="py-2 px-2"><span className="font-semibold text-xs whitespace-nowrap">{e.ccf_abbr}</span></td>
              <td className="py-2 px-2 text-xs text-muted-foreground truncate max-w-[400px]">{e.ccf_full}</td>
              <td className="py-2 px-2 text-xs text-muted-foreground whitespace-nowrap">{e.ccf_domain}</td>
              <td className="py-2 px-2 text-xs text-muted-foreground whitespace-nowrap hidden md:table-cell">{e.ccf_publisher || '-'}</td>
              <td className="py-2 px-2">
                {e.ccf_url && (
                  <a href={e.ccf_url} target="_blank" rel="noopener"
                     onClick={(ev) => ev.stopPropagation()}
                     className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline"
                  >
                    DBLP <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </td>
              <td className="py-2 px-2 text-xs text-muted-foreground truncate max-w-[150px]">{e.note || '-'}</td>
              <td className="py-2 px-2 text-center" onClick={(ev) => ev.stopPropagation()}>
                <FavoriteStar entryId={e.id} isFavorite={e.is_favorite} deviceId={deviceId} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}
