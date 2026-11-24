import type { CASPartition } from '@/api/types'

export function parseCAS(json: string | null): CASPartition | null {
  if (!json) return null
  try {
    const parsed = JSON.parse(json)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch { return null }
}
