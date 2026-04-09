import { useQuery } from '@tanstack/react-query'
import { fetchEntries, fetchEntryDetail } from '@/api/entries'
import type { FilterState, PaginatedResponse } from '@/api/types'

export function useEntries(f: FilterState, deviceId: string) {
  return useQuery({
    queryKey: ['entries', f, deviceId],
    queryFn: () => fetchEntries(f, deviceId),
    placeholderData: (prev: PaginatedResponse | undefined) => prev,
  })
}

export function useEntryDetail(id: number | null, deviceId: string) {
  return useQuery({
    queryKey: ['entry', id, deviceId],
    queryFn: () => fetchEntryDetail(id!, deviceId),
    enabled: id != null,
  })
}
