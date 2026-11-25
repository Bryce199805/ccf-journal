import { useState, useCallback, useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from '@/lib/theme-provider'
import { useDeviceId } from '@/hooks/use-device-id'
import { useDebounce } from '@/hooks/use-debounce'
import { useEntries } from '@/hooks/use-entries'
import { useFavorites } from '@/hooks/use-favorites'
import { useAuth } from '@/hooks/use-auth'
import { Header } from '@/components/layout/Header'
import { FilterBar } from '@/components/layout/FilterBar'
import { EntryList } from '@/components/entries/EntryList'
import { DetailDialog } from '@/components/detail/DetailDialog'
import { AuthDialog } from '@/components/auth/AuthDialog'
import { TagManager } from '@/components/tags/TagManager'
import { DEFAULT_FILTER } from '@/lib/filter-state'
import { useDetailNavigation } from '@/hooks/use-detail-navigation'
import { useFilterState } from '@/hooks/use-filter-state'
import type { FilterState } from '@/api/types'

function AppContent({ auth }: { auth: ReturnType<typeof useAuth> }) {
  const deviceId = useDeviceId()
  const { user, isAuthenticated, login, register, logout } = auth
  const [filter, setFilter] = useFilterState()
  const { entryId, openEntry, closeEntry } = useDetailNavigation()
  const [authOpen, setAuthOpen] = useState(false)
  const [tagManagerOpen, setTagManagerOpen] = useState(false)

  const debouncedQuery = useDebounce(filter.query, 300)
  const filterWithDebounce = { ...filter, query: debouncedQuery }

  const { data, isLoading, isFetching, isError, refetch } = useEntries(filterWithDebounce, deviceId)
  useEffect(() => {
    if (data?.page != null) {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    }
  }, [data?.page])
  const { data: favData } = useFavorites(deviceId)
  const favCount = favData?.entry_ids?.length ?? 0

  const updateFilter = useCallback((updates: Partial<FilterState>) => {
    setFilter(prev => ({ ...prev, ...updates }))
  }, [setFilter])

  const resetFilters = useCallback(() => {
    setFilter(prev => ({ ...DEFAULT_FILTER, type: prev.type, layout: prev.layout, favOnly: prev.favOnly }))
  }, [setFilter])

  const handleSearchChange = useCallback((query: string) => {
    setFilter(prev => ({ ...prev, query, page: 1 }), true)
  }, [setFilter])

  const handleLogin = useCallback(async (username: string, password: string) => {
    return login(username, password, deviceId)
  }, [login, deviceId])

  return (
    <div className="min-h-screen bg-background">
      <Header
        filter={filter}
        favCount={favCount}
        isAuthenticated={isAuthenticated}
        username={user?.username ?? null}
        onToggleFav={() => updateFilter({ favOnly: !filter.favOnly, tag: '', page: 1 })}
        onToggleLayout={layout => updateFilter({ layout })}
        onLoginClick={() => setAuthOpen(true)}
        onLogout={logout}
      />
      <FilterBar
        filter={filter}
        onFilterChange={updateFilter}
        onSearchChange={handleSearchChange}
        onManageTags={() => setTagManagerOpen(true)}
        onReset={resetFilters}
        deviceId={deviceId}
      />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-5">
        <EntryList
          entries={data?.data ?? []}
          total={data?.total ?? 0}
          page={data?.page ?? 1}
          totalPages={data?.total_pages ?? 1}
          filter={filter}
          deviceId={deviceId}
          isLoading={isLoading}
          isFetching={isFetching || filter.query !== debouncedQuery}
          isError={isError}
          onRetry={() => void refetch()}
          onReset={resetFilters}
          onBrowse={() => updateFilter({ ...DEFAULT_FILTER, type: filter.type, layout: filter.layout })}
          onSelect={openEntry}
          onPageChange={p => updateFilter({ page: p })}
        />
      </main>
      <DetailDialog
        entryId={entryId}
        deviceId={deviceId}
        open={entryId !== null}
        onOpenChange={open => { if (!open) closeEntry() }}
      />
      <AuthDialog
        open={authOpen}
        onOpenChange={setAuthOpen}
        onLogin={handleLogin}
        onRegister={(username, password) => register(username, password, deviceId)}
      />
      <TagManager
        open={tagManagerOpen}
        onOpenChange={setTagManagerOpen}
        deviceId={deviceId}
      />
    </div>
  )
}

function SessionCatalog({ auth }: { auth: ReturnType<typeof useAuth> }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
      },
    },
  }))
  return <QueryClientProvider client={queryClient}><AppContent auth={auth} /></QueryClientProvider>
}

function App() {
  const auth = useAuth()
  return (
    <ThemeProvider>
      <SessionCatalog key={auth.session} auth={auth} />
    </ThemeProvider>
  )
}

export default App
