import { apiGet } from './client'
import type { PaginatedResponse, EntryDetailResponse, FilterState } from './types'

export function fetchEntries(f: FilterState, deviceId: string) {
  return apiGet<PaginatedResponse>('/entries', {
    type: f.type,
    domain: f.domains.length > 0 ? f.domains.join(',') : undefined,
    level: f.levels.length > 0 ? f.levels.join(',') : undefined,
    cas_zone: f.casZones.length > 0 ? f.casZones.join(',') : undefined,
    q: f.query || undefined,
    sort: f.sort || undefined,
    order: f.sort ? f.order : undefined,
    page: f.page,
    per_page: f.perPage,
    device_id: deviceId,
    favorites: f.favOnly ? '1' : undefined,
    top: f.topOnly ? '1' : undefined,
    tag: f.tag || undefined,
  })
}

export function fetchEntryDetail(id: number, deviceId: string) {
  return apiGet<EntryDetailResponse>(`/entries/${id}`, { device_id: deviceId })
}
