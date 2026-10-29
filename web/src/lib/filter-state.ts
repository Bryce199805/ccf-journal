import type { FilterState } from '@/api/types'
import { DOMAINS, LEVELS, ZONES, SORT_OPTIONS } from './constants'

export const DEFAULT_FILTER: FilterState = {
  type: 'journal', catalog: 'all', domains: [], levels: [], casZones: [], wosZones: [],
  query: '', sort: '', order: 'desc', page: 1, perPage: 20, favOnly: false,
  topOnly: false, layout: 'card', tag: '',
}

const listKeys = ['domains', 'levels', 'casZones', 'wosZones'] as const
const scalarKeys = ['type', 'catalog', 'query', 'sort', 'order', 'page', 'favOnly', 'topOnly', 'layout', 'tag'] as const

export function readFilters(search: string): FilterState {
  const params = new URLSearchParams(search)
  const filter = { ...DEFAULT_FILTER }
  if (params.get('type') === 'conference') filter.type = 'conference'
  if (params.get('catalog') === 'ccf' || params.get('catalog') === 'non_ccf') filter.catalog = params.get('catalog') as FilterState['catalog']
  if (params.get('layout') === 'table') filter.layout = 'table'
  if (params.get('order') === 'asc') filter.order = 'asc'
  filter.query = params.get('query') || ''
  filter.favOnly = params.get('favOnly') === 'true'
  filter.topOnly = params.get('topOnly') === 'true'
  filter.tag = filter.favOnly ? params.get('tag') || '' : ''
  filter.sort = SORT_OPTIONS.find(o => o.value === params.get('sort'))?.value || ''
  const page = Number(params.get('page'))
  filter.page = Number.isSafeInteger(page) && page > 0 ? page : 1
  const allowed = { domains: DOMAINS, levels: LEVELS, casZones: ZONES, wosZones: ZONES }
  for (const key of listKeys) {
    filter[key] = [...new Set(params.getAll(key))].filter(value => allowed[key].some(item => item.key === value))
  }
  if (filter.type === 'conference') {
    filter.catalog = 'all'; filter.casZones = []; filter.wosZones = []; filter.topOnly = false; filter.sort = ''
  }
  if (filter.catalog === 'non_ccf') { filter.domains = []; filter.levels = [] }
  return filter
}

export function writeFilters(filter: FilterState, search: string): string {
  const params = new URLSearchParams(search)
  for (const key of [...scalarKeys, ...listKeys]) params.delete(key)
  for (const key of scalarKeys) {
    if (filter[key] !== DEFAULT_FILTER[key]) params.set(key, String(filter[key]))
  }
  for (const key of listKeys) for (const value of filter[key]) params.append(key, value)
  return params.toString()
}
