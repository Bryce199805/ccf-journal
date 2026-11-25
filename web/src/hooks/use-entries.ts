import { useQuery } from '@tanstack/react-query'
import { entryParams, fetchEntries, fetchEntryDetail } from '@/api/entries'
import type { FilterState, PaginatedResponse } from '@/api/types'

export function useEntries(f: FilterState, deviceId: string) {
  const filters = entryParams(f, deviceId)
  return useQuery({
    queryKey: ['entries', filters],
    queryFn: () => fetchEntries(filters),
    placeholderData: (prev: PaginatedResponse | undefined, query) => {
      const previousFilter = query?.queryKey[1] as ReturnType<typeof entryParams> | undefined
      return previousFilter?.type === f.type ? prev : undefined
    },
  })
}

export function useEntryDetail(id: number | null, deviceId: string) {
  return useQuery({
    queryKey: ['entry', id, deviceId],
    queryFn: () => fetchEntryDetail(id!, deviceId),
    enabled: id != null,
  })
}
