import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchFavorites, addFavorite, removeFavorite } from '@/api/favorites'

export function useFavorites(deviceId: string) {
  return useQuery({
    queryKey: ['favorites', deviceId],
    queryFn: () => fetchFavorites(deviceId),
  })
}

export function useToggleFavorite(deviceId: string) {
  const qc = useQueryClient()

  const add = useMutation({
    mutationFn: (entryId: number) => addFavorite({ device_id: deviceId, entry_id: entryId }),
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

  const toggle = (entryId: number, isFav: boolean) => {
    if (isFav) remove.mutate(entryId)
    else add.mutate(entryId)
  }

  return { toggle, addPending: add.isPending, removePending: remove.isPending }
}
