import { Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { LevelBadge, ZoneBadge, TopBadge } from './ZoneBadge'

export function CatalogLegend() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-9 gap-1 text-xs text-muted-foreground" aria-label="查看标识说明"><Info className="h-3.5 w-3.5" /><span className="hidden sm:inline">标识说明</span></Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] rounded-xl p-4">
        <h2 className="text-sm font-semibold">目录标识与颜色</h2>
        <dl className="mt-4 space-y-4 text-xs leading-relaxed">
          <div><dt className="mb-2 font-medium">CCF 推荐等级</dt><dd className="flex flex-wrap gap-2">{['A', 'B', 'C'].map(level => <LevelBadge key={level} level={level} label={`CCF ${level}`} />)}</dd></div>
          <div><dt className="mb-2 font-medium">中科院分区 · 实色标识</dt><dd className="flex flex-wrap gap-2">{['1区', '2区', '3区', '4区'].map(zone => <ZoneBadge key={zone} zone={zone} variant="cas" />)}</dd></div>
          <div><dt className="mb-2 font-medium">其他标识</dt><dd className="space-y-2 text-muted-foreground"><p className="flex items-center gap-2"><ZoneBadge zone="1区" variant="xinrui" />新锐分区，浅底与侧边色条</p><p className="flex items-center gap-2"><ZoneBadge zone="Q1" variant="jcr" />JCR 分区，紫色标识</p><p className="flex items-center gap-2"><TopBadge />中科院 TOP 期刊</p></dd></div>
        </dl>
        <p className="mt-4 border-t pt-3 text-xs leading-relaxed text-muted-foreground">不同评价体系独立展示，请结合标识名称和年份阅读。</p>
      </PopoverContent>
    </Popover>
  )
}
