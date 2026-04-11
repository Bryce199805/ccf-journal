import { apiGet, apiPost, apiPut, apiDelete } from './client'
import type { TagsResponse, CreateTagRequest, Tag } from './types'

export function fetchTags(deviceId: string) {
  return apiGet<TagsResponse>('/tags', { device_id: deviceId })
}

export function createTag(req: CreateTagRequest) {
  return apiPost<{ tag: Tag }>('/tags', req)
}

export function updateTag(id: number, req: CreateTagRequest) {
  return apiPut<{ tag: Tag }>(`/tags/${id}`, req)
}

export function deleteTag(id: number) {
  return apiDelete<unknown>(`/tags/${id}`, {})
}
