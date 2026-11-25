import { createContext, useContext, useState } from 'react'
import type { EntryListItem } from '@/api/types'

export interface Candidate {
  id: number
  name: string
  abbreviation: string
}

export function candidate(entry: EntryListItem): Candidate {
  return {
    id: entry.id,
    name: entry.ccf_full || entry.name || entry.ccf_abbr || '未命名期刊',
    abbreviation: entry.ccf_abbr || entry.journal_abbr || '',
  }
}

export function useComparisonSelection() {
  const [selected, setSelected] = useState<Candidate[]>([])
  function add(item: Candidate) {
    setSelected(list => list.length < 3 && !list.some(e => e.id === item.id) ? [...list, item] : list)
  }
  function remove(id: number) {
    setSelected(list => list.filter(e => e.id !== id))
  }
  function replace(id: number, item: Candidate) {
    setSelected(list => list.some(e => e.id === item.id) ? list : list.map(e => e.id === id ? item : e))
  }
  return { selected, add, remove, replace }
}

export const ComparisonContext = createContext<ReturnType<typeof useComparisonSelection> | null>(null)

export function useComparison() {
  const context = useContext(ComparisonContext)
  if (!context) throw new Error('Comparison provider required')
  return context
}
