import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchFavorites, addFavorite, removeFavorite, updateFavoriteTags } from '@/api/favorites'

export function useFavorites(deviceId: string) {
  return useQuery({
    queryKey: ['favorites', deviceId],
    queryFn: () => fetchFavorites(deviceId),
  })
}

export function useToggleFavorite(deviceId: string) {
  const qc = useQueryClient()

  const add = useMutation({
    mutationFn: ({ entryId, tags }: { entryId: number; tags?: string[] }) =>
      addFavorite({ device_id: deviceId, entry_id: entryId, tags }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['favorites', deviceId] })
      qc.invalidateQueries({ queryKey: ['entries'] })
      qc.invalidateQueries({ queryKey: ['entry'] })
    },
  })

  const remove = useMutation({
    mutationFn: (entryId: number) => removeFavorite({ device_id: deviceId, entry_id: entryId }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['favorites', deviceId] })
      qc.invalidateQueries({ queryKey: ['entries'] })
      qc.invalidateQueries({ queryKey: ['entry'] })
    },
  })

  const toggle = (entryId: number, isFav: boolean, tags?: string[]) => {
    if (isFav) remove.mutate(entryId)
    else add.mutate({ entryId, tags })
  }

  return { toggle, addPending: add.isPending, removePending: remove.isPending }
}

export function useUpdateFavoriteTags(deviceId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ entryId, tags }: { entryId: number; tags: string[] }) =>
      updateFavoriteTags(deviceId, entryId, tags),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['favorites', deviceId] })
      qc.invalidateQueries({ queryKey: ['entries'] })
      qc.invalidateQueries({ queryKey: ['tags'] })
    },
  })
}
