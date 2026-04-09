import { apiGet } from './client'
import type { StatsResponse } from './types'

export function fetchStats() {
  return apiGet<StatsResponse>('/stats')
}
