import type { EntryListItem } from '@/api/types'
import { LevelBadge } from './ZoneBadge'
import { ccfRelations } from '@/lib/ccf'

export function CCFGrade({ entry }: { entry: EntryListItem }) {
  if (!entry.is_ccf) return null
  const levels = [...new Set(ccfRelations(entry).map(r => r.level).filter(level => ['A', 'B', 'C'].includes(level)))]
  const level = levels.length === 1 ? levels[0] : ''
  return (
    <span data-ccf-grade={level || 'mixed'} className="inline-flex shrink-0">
      {level ? <LevelBadge level={level} label={`CCF ${level}`} /> : (
        <span className="rounded-md border bg-muted/50 px-2 py-0.5 text-xs font-medium">{levels.length > 1 ? 'CCF 多等级' : 'CCF'}</span>
      )}
    </span>
  )
}

export function CCFRelations({ entry }: { entry: EntryListItem }) {
  if (!entry.is_ccf) return null
  const relations = ccfRelations(entry).filter(r => r.domain)
  const hasDifferentLevels = new Set(relations.map(r => r.level)).size > 1
  if (!relations.length) return null
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs leading-relaxed text-muted-foreground" aria-label="CCF 所属领域">
      {relations.map((relation, index) => (
        <span key={`${relation.domain}-${index}`} className="inline-flex min-w-0 max-w-full items-center gap-1.5 [overflow-wrap:anywhere]">
          <span className="h-1 w-1 shrink-0 rounded-full bg-muted-foreground/40" aria-hidden="true" />
          <span className="min-w-0 whitespace-normal">{relation.domain}</span>{hasDifferentLevels && <LevelBadge level={relation.level} />}
        </span>
      ))}
    </div>
  )
}
