import { useEffect, useState } from 'react'

function readEntryId() {
  const raw = new URLSearchParams(location.search).get('entry')
  const id = Number(raw)
  return raw && /^[1-9]\d*$/.test(raw) && Number.isSafeInteger(id) ? id : null
}

export function useDetailNavigation() {
  const [entryId, setEntryId] = useState(readEntryId)
  useEffect(() => {
    const restore = () => setEntryId(readEntryId())
    window.addEventListener('popstate', restore)
    return () => window.removeEventListener('popstate', restore)
  }, [])

  function openEntry(id: number) {
    const url = new URL(location.href)
    url.searchParams.set('entry', String(id))
    history.pushState({ fromCatalog: true }, '', url)
    setEntryId(id)
  }

  function closeEntry() {
    if (history.state?.fromCatalog) {
      history.back()
    } else {
      const url = new URL(location.href)
      url.searchParams.delete('entry')
      history.replaceState(history.state, '', url)
    }
    setEntryId(null)
  }

  return { entryId, openEntry, closeEntry }
}
