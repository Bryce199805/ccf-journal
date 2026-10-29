import { Button } from '@/components/ui/button'
import { BookOpen, Star, LayoutGrid, Table2, User, LogOut } from 'lucide-react'
import { ThemePicker } from './ThemePicker'
import { useStats } from '@/hooks/use-stats'
import type { FilterState } from '@/api/types'

function formatDataDate(value: string | null | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.slice(0, 10)
  return new Intl.DateTimeFormat('en-GB', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Shanghai',
  }).format(date)
}

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
  const { data: stats } = useStats()
  const isJournal = filter.type === 'journal'
  const dataUpdatedDate = formatDataDate(stats?.data_updated_at)

  return (
    <header className="site-header sticky top-0 z-40 border-b bg-card/95 backdrop-blur-xl supports-[backdrop-filter]:bg-card/85">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 min-h-16 flex flex-wrap items-center justify-between gap-3 py-3 sm:flex-nowrap sm:py-2">
        <div className="flex min-w-0 items-center gap-3">
          <div className="brand-mark flex shrink-0 w-9 h-9 rounded-xl bg-primary items-center justify-center text-primary-foreground text-sm font-bold">
            <BookOpen className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-bold leading-tight tracking-tight">CCF 推荐目录</h1>
            <span className="text-xs text-muted-foreground">
              {stats ? `${stats.total_journals} 期刊 / ${stats.total_conferences} 会议` : ''}
              {dataUpdatedDate && (
                <span className="hidden md:inline" title={`最近一次数据更新：${stats?.data_updated_at}`}> · 数据更新 {dataUpdatedDate}</span>
              )}
            </span>
            {isJournal && stats?.journal_catalog && (
              <a href={stats.journal_catalog.officialAnnouncement} target="_blank" rel="noopener noreferrer"
                className="hidden sm:block text-xs text-muted-foreground hover:underline">
                期刊目录：CCF {stats.journal_catalog.edition} · {stats.journal_catalog.publishedAt} · {stats.ccf_journals} 本
              </a>
            )}
          </div>
        </div>
        <div className="flex w-full flex-wrap items-center justify-between gap-1 sm:w-auto sm:justify-end sm:gap-2">
          {isJournal && (
            <div className="flex rounded-lg border bg-muted/60 p-0.5">
              <Button
                variant={filter.layout === 'card' ? 'secondary' : 'ghost'}
                size="icon"
                className="h-10 w-10 sm:h-8 sm:w-8"
                onClick={() => onToggleLayout('card')}
                aria-label="卡片视图"
                aria-pressed={filter.layout === 'card'}
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                variant={filter.layout === 'table' ? 'secondary' : 'ghost'}
                size="icon"
                className="h-10 w-10 sm:h-8 sm:w-8"
                onClick={() => onToggleLayout('table')}
                aria-label="表格视图"
                aria-pressed={filter.layout === 'table'}
              >
                <Table2 className="h-4 w-4" />
              </Button>
            </div>
          )}
          {isAuthenticated ? (
            <div className="flex items-center gap-1.5">
              <span className="max-w-28 truncate text-xs text-muted-foreground hidden sm:inline">{username}</span>
              <Button variant="ghost" size="icon" className="h-10 w-10 sm:h-8 sm:w-8" onClick={onLogout} aria-label="退出登录">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Button variant="ghost" size="icon" className="h-10 w-10 sm:h-8 sm:w-8" onClick={onLoginClick} aria-label="登录或注册">
              <User className="h-4 w-4" />
            </Button>
          )}
          <ThemePicker />
          <Button asChild variant="ghost" size="icon" className="h-10 w-10 sm:h-8 sm:w-8">
            <a
              href="https://github.com/Bryce199805/ccf-journal"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="查看 GitHub 仓库"
              title="GitHub 仓库"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 .7a11.5 11.5 0 0 0-3.64 22.4c.58.1.79-.25.79-.56v-2.24c-3.22.7-3.9-1.37-3.9-1.37-.52-1.34-1.28-1.7-1.28-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.57-.3-5.27-1.29-5.27-5.69 0-1.26.45-2.28 1.18-3.09-.12-.29-.51-1.47.11-3.05 0 0 .96-.31 3.16 1.18a10.9 10.9 0 0 1 5.75 0C17.04 5.2 18 5.5 18 5.5c.62 1.58.23 2.76.11 3.05.74.81 1.18 1.83 1.18 3.09 0 4.42-2.71 5.39-5.29 5.68.42.36.79 1.06.79 2.14v3.08c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .7Z" />
              </svg>
            </a>
          </Button>
          <Button
            variant={filter.favOnly ? 'default' : 'outline'}
            size="sm"
            className="h-10 gap-1.5 text-xs sm:h-8"
            onClick={onToggleFav}
            aria-pressed={filter.favOnly}
            aria-label="收藏"
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
