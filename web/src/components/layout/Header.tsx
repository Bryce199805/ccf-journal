import { Button } from '@/components/ui/button'
import { Sun, Moon, Star, LayoutGrid, Table2, User, LogOut } from 'lucide-react'
import { useTheme } from '@/lib/theme-provider'
import { useStats } from '@/hooks/use-stats'
import type { FilterState } from '@/api/types'

interface HeaderProps {
  filter: FilterState
  favCount: number
  isAuthenticated: boolean
  username: string | null
  onToggleFav: () => void
  onToggleLayout: (layout: 'card' | 'table') => void
  onLoginClick: () => void
  onLogout: () => void
}

export function Header({ filter, favCount, isAuthenticated, username, onToggleFav, onToggleLayout, onLoginClick, onLogout }: HeaderProps) {
  const { theme, toggleTheme } = useTheme()
  const { data: stats } = useStats()
  const isJournal = filter.type === 'journal'

  return (
    <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold">
            C
          </div>
          <div>
            <h1 className="text-base font-bold leading-tight">CCF 推荐目录</h1>
            <span className="text-[11px] text-muted-foreground">
              {stats ? `${stats.total_journals} 期刊 / ${stats.total_conferences} 会议` : ''}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isJournal && (
            <div className="flex rounded-md border p-0.5">
              <Button
                variant={filter.layout === 'card' ? 'secondary' : 'ghost'}
                size="icon"
                className="h-7 w-7"
                onClick={() => onToggleLayout('card')}
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                variant={filter.layout === 'table' ? 'secondary' : 'ghost'}
                size="icon"
                className="h-7 w-7"
                onClick={() => onToggleLayout('table')}
              >
                <Table2 className="h-4 w-4" />
              </Button>
            </div>
          )}
          {isAuthenticated ? (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground hidden sm:inline">{username}</span>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onLogout}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onLoginClick}>
              <User className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleTheme}>
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <Button
            variant={filter.favOnly ? 'default' : 'outline'}
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={onToggleFav}
          >
            <Star className="h-3.5 w-3.5" fill={filter.favOnly ? 'currentColor' : 'none'} />
            <span className="hidden sm:inline">收藏</span>
            {favCount > 0 && <span className="opacity-70">({favCount})</span>}
          </Button>
        </div>
      </div>
    </header>
  )
}
