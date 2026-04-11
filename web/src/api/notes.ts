import { apiGet, apiPut, apiDelete } from './client'
import type { NotesResponse, NoteRequest } from './types'

export function fetchNotes(deviceId: string) {
  return apiGet<NotesResponse>('/notes', { device_id: deviceId })
}

export function upsertNote(req: NoteRequest) {
  return apiPut<unknown>('/notes', req)
}

export function deleteNote(req: NoteRequest) {
  return apiDelete<unknown>('/notes', req)
}
