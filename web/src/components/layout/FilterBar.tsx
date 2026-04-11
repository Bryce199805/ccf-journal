import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Search, ArrowUpDown, Settings2 } from 'lucide-react'
import { useTags } from '@/hooks/use-tags'
import { FilterChip } from '@/components/shared/FilterChip'
import { DOMAINS, LEVELS, ZONES, SORT_OPTIONS } from '@/lib/constants'
import type { FilterState } from '@/api/types'

interface FilterBarProps {
  filter: FilterState
  onFilterChange: (updates: Partial<FilterState>) => void
  onSearchChange: (query: string) => void
  onManageTags: () => void
  deviceId: string
}

export function FilterBar({ filter, onFilterChange, onSearchChange, onManageTags, deviceId }: FilterBarProps) {
  const isJournal = filter.type === 'journal'

  return (
    <div className="border-b bg-card/70">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 space-y-2.5">
        {/* Type tabs + domain/level/zone chips in one row */}
        <div className="flex flex-wrap gap-x-5 gap-y-2 items-center">
          {/* Type toggle */}
          <div className="flex rounded-lg border p-0.5 bg-muted/50">
            <button
              className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${
                filter.type === 'journal'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => {
                const updates: Partial<FilterState> = { type: 'journal', page: 1 }
                onFilterChange(updates)
              }}
            >
              期刊
            </button>
            <button
              className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${
                filter.type === 'conference'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => {
                onFilterChange({ type: 'conference', page: 1, casZones: [], sort: '' })
              }}
            >
              会议
            </button>
          </div>

          {/* Domain chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground font-semibold tracking-wider uppercase shrink-0">领域</span>
            {DOMAINS.map(d => (
              <FilterChip
                key={d.key}
                label={d.label}
                active={filter.domains.includes(d.key)}
                onClick={() => {
                  const domains = filter.domains.includes(d.key)
                    ? filter.domains.filter(x => x !== d.key)
                    : [...filter.domains, d.key]
                  onFilterChange({ domains, page: 1 })
                }}
              />
            ))}
          </div>

          {/* Level chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground font-semibold tracking-wider uppercase shrink-0">等级</span>
            {LEVELS.map(l => (
              <FilterChip
                key={l.key}
                label={l.label}
                active={filter.levels.includes(l.key)}
                onClick={() => {
                  const levels = filter.levels.includes(l.key)
                    ? filter.levels.filter(x => x !== l.key)
                    : [...filter.levels, l.key]
                  onFilterChange({ levels, page: 1 })
                }}
              />
            ))}
          </div>

          {/* CAS zone chips + TOP filter */}
          {isJournal && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground font-semibold tracking-wider uppercase shrink-0">分区</span>
              {ZONES.map(z => (
                <FilterChip
                  key={z.key}
                  label={z.label}
                  active={filter.casZones.includes(z.key)}
                  onClick={() => {
                    const casZones = filter.casZones.includes(z.key)
                      ? filter.casZones.filter(x => x !== z.key)
                      : [...filter.casZones, z.key]
                    onFilterChange({ casZones, page: 1 })
                  }}
                />
              ))}
              <span className="mx-1 text-muted-foreground/30">|</span>
              <FilterChip
                label="TOP"
                active={filter.topOnly}
                onClick={() => onFilterChange({ topOnly: !filter.topOnly, page: 1 })}
              />
            </div>
          )}
        </div>

        {/* Search + Sort */}
        <div className="flex gap-2 items-center">
          <div className="flex-1 relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="搜索名称、简称、出版社…"
              className="h-9 pl-8 text-xs"
              value={filter.query}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => onSearchChange(e.target.value)}
            />
          </div>
          {isJournal && (
            <>
              <Select
                value={filter.sort || '_default'}
                onValueChange={(v: string) => onFilterChange({ sort: v === '_default' ? '' : v, page: 1 })}
              >
                <SelectTrigger className="h-9 w-32 text-xs">
                  <SelectValue placeholder="排序" />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map(o => (
                    <SelectItem key={o.value || '_default'} value={o.value || '_default'} className="text-xs">
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9"
                onClick={() => onFilterChange({ order: filter.order === 'desc' ? 'asc' : 'desc' })}
              >
                <ArrowUpDown className={`h-4 w-4 ${filter.order === 'asc' ? 'rotate-180' : ''} transition-transform`} />
              </Button>
            </>
          )}
        </div>

        {/* Tag filter - only in favOnly mode */}
        {filter.favOnly && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground font-semibold tracking-wider uppercase shrink-0">标签</span>
            {(() => {
              const { data: tags } = useTags(deviceId)
              return tags?.map(tag => (
                <FilterChip
                  key={tag.name}
                  label={tag.name}
                  active={filter.tag === tag.name}
                  onClick={() => onFilterChange({ tag: filter.tag === tag.name ? '' : tag.name, page: 1 })}
                />
              ))
            })()}
            {filter.tag && (
              <button
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => onFilterChange({ tag: '', page: 1 })}
              >
                清除筛选
              </button>
            )}
            <span className="mx-1 text-muted-foreground/30">|</span>
            <button
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              onClick={onManageTags}
            >
              <Settings2 className="h-3 w-3" />
              管理标签
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
