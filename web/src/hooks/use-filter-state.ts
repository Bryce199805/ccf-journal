import { useCallback, useEffect, useRef, useState } from 'react'
import type { FilterState } from '@/api/types'
import { readFilters, writeFilters } from '@/lib/filter-state'

type Update = FilterState | ((previous: FilterState) => FilterState)

export function useFilterState() {
  const [filter, setFilter] = useState(() => readFilters(window.location.search))
  const current = useRef(filter)
  const update = useCallback((change: Update, replace = false) => {
    const next = typeof change === 'function' ? change(current.current) : change
    current.current = next
    setFilter(next)
    const search = writeFilters(next, window.location.search)
    const url = `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`
    if (url !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      if (replace) window.history.replaceState(null, '', url)
      else window.history.pushState(null, '', url)
    }
  }, [])
  useEffect(() => {
    const restore = () => { current.current = readFilters(window.location.search); setFilter(current.current) }
    window.addEventListener('popstate', restore)
    return () => window.removeEventListener('popstate', restore)
  }, [])
  return [filter, update] as const
}
