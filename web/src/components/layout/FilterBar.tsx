import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Search, ArrowUpDown, Settings2, SlidersHorizontal, ChevronDown, X } from 'lucide-react'
import { useTags } from '@/hooks/use-tags'
import { FilterChip } from '@/components/shared/FilterChip'
import { DOMAINS, LEVELS, ZONES, SORT_OPTIONS } from '@/lib/constants'
import type { FilterState } from '@/api/types'

interface FilterBarProps {
  filter: FilterState
  onFilterChange: (updates: Partial<FilterState>) => void
  onSearchChange: (query: string) => void
  onManageTags: () => void
  onReset: () => void
  deviceId: string
}

export function FilterBar({ filter, onFilterChange, onSearchChange, onManageTags, onReset, deviceId }: FilterBarProps) {
  const isJournal = filter.type === 'journal'
  const showCCFFilters = !isJournal || filter.catalog !== 'non_ccf'
  const { data: tags } = useTags(deviceId)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const activeFilterCount = filter.domains.length + filter.levels.length + filter.casZones.length + filter.wosZones.length + Number(filter.topOnly)

  const selected = [
    ...filter.domains.map(value => ({ label: DOMAINS.find(d => d.key === value)?.label || value, clear: () => onFilterChange({ domains: filter.domains.filter(d => d !== value), page: 1 }) })),
    ...filter.levels.map(value => ({ label: `CCF ${value}`, clear: () => onFilterChange({ levels: filter.levels.filter(d => d !== value), page: 1 }) })),
    ...filter.casZones.map(value => ({ label: `中科院 ${value}`, clear: () => onFilterChange({ casZones: filter.casZones.filter(d => d !== value), page: 1 }) })),
    ...filter.wosZones.map(value => ({ label: `JCR ${value}`, clear: () => onFilterChange({ wosZones: filter.wosZones.filter(d => d !== value), page: 1 }) })),
    ...(filter.topOnly ? [{ label: '中科院 TOP', clear: () => onFilterChange({ topOnly: false, page: 1 }) }] : []),
    ...(filter.catalog !== 'all' ? [{ label: filter.catalog === 'ccf' ? 'CCF 目录' : 'Non-CCF 目录', clear: () => onFilterChange({ catalog: 'all', page: 1 }) }] : []),
    ...(filter.tag && filter.favOnly ? [{ label: `标签：${filter.tag}`, clear: () => onFilterChange({ tag: '', page: 1 }) }] : []),
  ]

  return (
    <div className="filter-surface border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 space-y-2.5">
        {/* Type tabs + domain/level/zone chips in one row */}
        <div className="flex flex-wrap gap-x-5 gap-y-2 items-center">
          {/* Type toggle */}
          <div className="flex rounded-lg border p-0.5 bg-muted/50">
            <button
              aria-pressed={filter.type === 'journal'}
              className={`min-h-10 px-4 py-2 text-sm sm:min-h-0 sm:py-1.5 sm:text-xs font-semibold rounded-md transition-all ${
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
              aria-pressed={filter.type === 'conference'}
              className={`min-h-10 px-4 py-2 text-sm sm:min-h-0 sm:py-1.5 sm:text-xs font-semibold rounded-md transition-all ${
                filter.type === 'conference'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => {
                onFilterChange({ type: 'conference', catalog: 'all', page: 1, casZones: [], wosZones: [], topOnly: false, sort: '' })
              }}
            >
              会议
            </button>
          </div>

          {isJournal && (
            <div className="order-3 flex w-full flex-wrap items-center gap-1.5 sm:order-none sm:w-auto">
              <span className="text-xs text-muted-foreground font-semibold tracking-wider uppercase shrink-0">目录</span>
              {([
                ['all', '全部'],
                ['ccf', 'CCF'],
                ['non_ccf', 'Non-CCF'],
              ] as const).map(([key, label]) => (
                <FilterChip
                  key={key}
                  label={label}
                  active={filter.catalog === key}
                  onClick={() => onFilterChange({
                    catalog: key,
                    domains: key === 'non_ccf' ? [] : filter.domains,
                    levels: key === 'non_ccf' ? [] : filter.levels,
                    page: 1,
                  })}
                />
              ))}
            </div>
          )}

          <button
            className="min-h-10 ml-auto inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium text-muted-foreground sm:hidden"
            onClick={() => setFiltersOpen(open => !open)}
            aria-expanded={filtersOpen}
            aria-controls="entry-filters"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            筛选条件{activeFilterCount > 0 && <span className="rounded bg-primary/10 px-1 text-primary">{activeFilterCount}</span>}
            <ChevronDown className={`h-3 w-3 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} />
          </button>

          <div id="entry-filters" className={`${filtersOpen ? 'flex' : 'hidden'} order-4 w-full flex-wrap items-center gap-x-5 gap-y-2.5 border-t border-border/60 pt-3 sm:flex`}>
            {/* Domain chips */}
            {showCCFFilters && <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground font-semibold tracking-wider uppercase shrink-0">领域</span>
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
            </div>}

            {/* Level chips */}
            {showCCFFilters && <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground font-semibold tracking-wider uppercase shrink-0">等级</span>
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
            </div>}

            {/* CAS zone chips + TOP filter */}
            {isJournal && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground font-semibold tracking-wider uppercase shrink-0">中科院</span>
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
                  label="中科院 TOP"
                  active={filter.topOnly}
                  onClick={() => onFilterChange({ topOnly: !filter.topOnly, page: 1 })}
                />
              </div>
            )}

            {isJournal && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground font-semibold tracking-wider uppercase shrink-0">JCR</span>
                {ZONES.map(z => (
                  <FilterChip
                    key={z.key}
                    label={z.label}
                    active={filter.wosZones.includes(z.key)}
                    onClick={() => {
                      const wosZones = filter.wosZones.includes(z.key)
                        ? filter.wosZones.filter(x => x !== z.key)
                        : [...filter.wosZones, z.key]
                      onFilterChange({ wosZones, page: 1 })
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {isJournal && filter.catalog === 'non_ccf' && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            收录中科院计算机科学大类 1–3 区的 Non-CCF 期刊。
          </p>
        )}

        {/* Search + Sort */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative min-w-0 w-full sm:w-auto sm:flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="搜索名称、简称、ISSN、出版社…"
              aria-label="搜索名称、简称、ISSN、出版社"
              className="h-11 pl-9 pr-11 text-base sm:h-9 sm:text-sm"
              value={filter.query}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => onSearchChange(e.target.value)}
            />
            {filter.query && <button aria-label="清除搜索" onClick={() => onSearchChange('')} className="absolute right-0 top-0 inline-flex h-full w-10 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>}
          </div>
          {isJournal && (
            <>
              <Select
                value={filter.sort || '_default'}
                onValueChange={(v: string) => onFilterChange({ sort: v === '_default' ? '' : v, page: 1 })}
              >
                <SelectTrigger aria-label="排序方式" className="h-11 flex-1 text-sm sm:h-9 sm:w-36 sm:flex-none">
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
                className="h-11 w-11 shrink-0 sm:h-9 sm:w-9"
                aria-label={filter.order === 'desc' ? '当前降序，切换升序' : '当前升序，切换降序'}
                disabled={!filter.sort}
                title={!filter.sort ? '选择排序指标后可切换升降序' : undefined}
                onClick={() => onFilterChange({ order: filter.order === 'desc' ? 'asc' : 'desc', page: 1 })}
              >
                <ArrowUpDown className={`h-4 w-4 ${filter.order === 'asc' ? 'rotate-180' : ''} transition-transform`} />
              </Button>
            </>
          )}
        </div>

        {(selected.length > 0 || filter.query) && (
          <div className="flex flex-wrap items-center gap-2 border-t pt-2.5" aria-label="已选筛选条件">
            {selected.map(item => <button key={item.label} onClick={item.clear} aria-label={`移除${item.label}`} className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs text-primary hover:bg-primary/15"><span className="min-w-0 [overflow-wrap:anywhere]">{item.label}</span><X className="h-3 w-3 shrink-0" /></button>)}
            <Button variant="ghost" size="sm" onClick={onReset} className="min-h-9 text-xs text-muted-foreground">清除全部</Button>
          </div>
        )}

        {/* Tag filter - only in favOnly mode */}
        {filter.favOnly && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground font-semibold tracking-wider uppercase shrink-0">标签</span>
            {tags?.map(tag => (
                <FilterChip
                  key={tag.name}
                  label={tag.name}
                  active={filter.tag === tag.name}
                  onClick={() => onFilterChange({ tag: filter.tag === tag.name ? '' : tag.name, page: 1 })}
                />
              ))}
            {filter.tag && (
              <button
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => onFilterChange({ tag: '', page: 1 })}
              >
                清除筛选
              </button>
            )}
            <span className="mx-1 text-muted-foreground/30">|</span>
            <button
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
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
