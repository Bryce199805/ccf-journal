import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchNotes, upsertNote, deleteNote } from '@/api/notes'

export function useNotes(deviceId: string) {
  return useQuery({
    queryKey: ['notes', deviceId],
    queryFn: () => fetchNotes(deviceId),
    select: (data) => {
      const map = new Map<number, string>()
      for (const n of data.notes) {
        map.set(n.entry_id, n.content)
      }
      return map
    },
  })
}

export function useUpsertNote(deviceId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ entryId, content }: { entryId: number; content: string }) =>
      upsertNote({ device_id: deviceId, entry_id: entryId, content }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['notes'] })
      qc.invalidateQueries({ queryKey: ['entries'] })
    },
  })
}

export function useDeleteNote(deviceId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (entryId: number) =>
      deleteNote({ device_id: deviceId, entry_id: entryId, content: '' }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['notes'] })
      qc.invalidateQueries({ queryKey: ['entries'] })
    },
  })
}
