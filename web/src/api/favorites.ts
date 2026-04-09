import { apiGet, apiPost, apiDelete } from './client'
import type { FavoritesResponse, FavoriteRequest } from './types'

export function fetchFavorites(deviceId: string) {
  return apiGet<FavoritesResponse>('/favorites', { device_id: deviceId })
}

export function addFavorite(req: FavoriteRequest) {
  return apiPost<unknown>('/favorites', req)
}

export function removeFavorite(req: FavoriteRequest) {
  return apiDelete<unknown>('/favorites', req)
}
