import { apiPost, apiGet } from './client'
import type { AuthResponse, RegisterRequest, LoginRequest, User } from './types'

export function register(req: RegisterRequest & { device_id?: string }) {
  const params = req.device_id ? `?device_id=${req.device_id}` : ''
  return apiPost<AuthResponse>(`/auth/register${params}`, req)
}

export function login(req: LoginRequest & { device_id?: string }) {
  const params = req.device_id ? `?device_id=${req.device_id}` : ''
  return apiPost<AuthResponse>(`/auth/login${params}`, req)
}

export function getMe() {
  return apiGet<{ user: User }>('/auth/me')
}
