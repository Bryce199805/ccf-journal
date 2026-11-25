import { apiGet } from './client'
import type { PaginatedResponse, EntryDetailResponse, FilterState } from './types'

export function entryParams(f: FilterState, deviceId: string) {
  return {
    type: f.type,
    catalog: f.catalog === 'all' ? undefined : f.catalog,
    domain: f.domains.length > 0 ? f.domains.join(',') : undefined,
    level: f.levels.length > 0 ? f.levels.join(',') : undefined,
    cas_zone: f.casZones.length > 0 ? f.casZones.join(',') : undefined,
    wos_zone: f.wosZones.length > 0 ? f.wosZones.join(',') : undefined,
    q: f.query || undefined,
    sort: f.sort || undefined,
    order: f.sort ? f.order : undefined,
    page: f.page,
    per_page: f.perPage,
    device_id: deviceId,
    favorites: f.favOnly ? '1' : undefined,
    top: f.topOnly ? '1' : undefined,
    tag: f.favOnly ? f.tag || undefined : undefined,
  }
}

export function fetchEntries(params: ReturnType<typeof entryParams>) {
  return apiGet<PaginatedResponse>('/entries', params)
}

export function fetchEntryDetail(id: number, deviceId: string) {
  return apiGet<EntryDetailResponse>(`/entries/${id}`, { device_id: deviceId })
}
