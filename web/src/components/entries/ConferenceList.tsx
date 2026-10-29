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
    <>
      <div className="grid gap-3 md:hidden">
        {entries.map(e => (
          <Card key={e.id} className="journal-card min-w-0 gap-3 p-4">
            <div className="flex items-center justify-between gap-3">
              <LevelBadge level={e.ccf_level} />
              <FavoriteStar entryId={e.id} isFavorite={e.is_favorite} deviceId={deviceId} className="h-10 w-10 p-2" />
            </div>
            <div className="min-w-0 space-y-1 [overflow-wrap:anywhere]">
              <h2 className="text-base font-semibold leading-snug">{e.ccf_abbr || e.ccf_full}</h2>
              {e.ccf_full !== e.ccf_abbr && <p className="text-sm leading-relaxed text-muted-foreground">{e.ccf_full}</p>}
            </div>
            <dl className="space-y-2 border-t pt-3 text-sm leading-relaxed">
              {([['领域', e.ccf_domain], ['出版社', e.ccf_publisher], ['备注', e.note]] as const).map(([label, value]) => value && (
                <div key={label} className="flex gap-3">
                  <dt className="w-12 shrink-0 text-muted-foreground">{label}</dt>
                  <dd className="min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]">{value}</dd>
                </div>
              ))}
            </dl>
            {e.ccf_url && <a href={e.ccf_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1 text-sm text-primary hover:underline">DBLP <ExternalLink className="h-4 w-4" /></a>}
          </Card>
        ))}
      </div>
      <Card className="hidden min-w-0 overflow-x-auto py-0 md:block">
      <table className="data-table w-full text-sm">
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
    </>
  )
}
