import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchTags, createTag, updateTag, deleteTag } from '@/api/tags'
import type { CreateTagRequest } from '@/api/types'

export function useTags(deviceId: string) {
  return useQuery({
    queryKey: ['tags', deviceId],
    queryFn: () => fetchTags(deviceId),
    select: (data) => data.tags,
  })
}

export function useCreateTag(deviceId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (req: CreateTagRequest) => createTag(req),
    onSettled: () => qc.invalidateQueries({ queryKey: ['tags'] }),
  })
}

export function useUpdateTag(deviceId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...req }: { id: number } & CreateTagRequest) => updateTag(id, req),
    onSettled: () => qc.invalidateQueries({ queryKey: ['tags'] }),
  })
}

export function useDeleteTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => deleteTag(id),
    onSettled: () => qc.invalidateQueries({ queryKey: ['tags'] }),
  })
}
