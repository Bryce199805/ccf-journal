import { useState, useCallback } from 'react'
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
import type { FilterState } from '@/api/types'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})

const DEFAULT_FILTER: FilterState = {
  type: 'journal',
  domains: [],
  levels: [],
  casZones: [],
  query: '',
  sort: '',
  order: 'desc',
  page: 1,
  perPage: 20,
  favOnly: false,
  topOnly: false,
  layout: 'card',
  tag: '',
}

function AppContent() {
  const deviceId = useDeviceId()
  const { user, isAuthenticated, login, register, logout } = useAuth()
  const [filter, setFilter] = useState<FilterState>(DEFAULT_FILTER)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [tagManagerOpen, setTagManagerOpen] = useState(false)

  const debouncedQuery = useDebounce(filter.query, 300)
  const filterWithDebounce = { ...filter, query: debouncedQuery }

  const { data, isLoading } = useEntries(filterWithDebounce, deviceId)
  const { data: favData } = useFavorites(deviceId)
  const favCount = favData?.entry_ids?.length ?? 0

  const updateFilter = useCallback((updates: Partial<FilterState>) => {
    setFilter(prev => ({ ...prev, ...updates }))
  }, [])

  const handleSearchChange = useCallback((query: string) => {
    setFilter(prev => ({ ...prev, query, page: 1 }))
  }, [])

  const handleSelect = useCallback((id: number) => {
    setDetailId(id)
    setDialogOpen(true)
  }, [])

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
        onToggleFav={() => updateFilter({ favOnly: !filter.favOnly, page: 1 })}
        onToggleLayout={layout => updateFilter({ layout, page: 1 })}
        onLoginClick={() => setAuthOpen(true)}
        onLogout={logout}
      />
      <FilterBar
        filter={filter}
        onFilterChange={updateFilter}
        onSearchChange={handleSearchChange}
        onManageTags={() => setTagManagerOpen(true)}
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
          onSelect={handleSelect}
          onPageChange={p => updateFilter({ page: p })}
        />
      </main>
      <DetailDialog
        entryId={detailId}
        deviceId={deviceId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
      <AuthDialog
        open={authOpen}
        onOpenChange={setAuthOpen}
        onLogin={handleLogin}
        onRegister={register}
      />
      <TagManager
        open={tagManagerOpen}
        onOpenChange={setTagManagerOpen}
        deviceId={deviceId}
      />
    </div>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AppContent />
      </ThemeProvider>
    </QueryClientProvider>
  )
}

export default App
