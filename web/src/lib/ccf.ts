import type { EntryListItem } from '@/api/types'

export interface CCFRelation {
  domain: string
  level: string
}

export function ccfRelations(entry: EntryListItem): CCFRelation[] {
  if (!entry.is_ccf) return []
  let parsed: unknown
  try { parsed = JSON.parse(entry.ccf_relations || '[]') } catch { /* Legacy entry */ }
  const relations: CCFRelation[] = []
  if (Array.isArray(parsed)) {
    for (const value of parsed) {
      if (!value || typeof value !== 'object') continue
      const { domain, level } = value
      if (typeof domain !== 'string' || !['A', 'B', 'C'].includes(level)) continue
      if (!relations.some(r => r.domain === domain.trim() && r.level === level)) {
        relations.push({ domain: domain.trim(), level })
      }
    }
  }
  return relations.length ? relations : [{ domain: entry.ccf_domain || '', level: entry.ccf_level || '' }]
}
