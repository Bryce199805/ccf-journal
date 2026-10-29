import { Sun, Moon, Monitor, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useTheme } from '@/lib/theme-context'

const options = [
  { value: 'light', label: '浅色', description: '清透纸白', icon: Sun },
  { value: 'dark', label: '深色', description: '静谧藏蓝', icon: Moon },
  { value: 'system', label: '跟随系统', description: '自动切换', icon: Monitor },
] as const

export function ThemePicker() {
  const { theme, resolvedTheme, setTheme } = useTheme()
  const Icon = theme === 'system' ? Monitor : resolvedTheme === 'dark' ? Moon : Sun
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-10 w-10 sm:h-8 sm:w-8" aria-label="外观设置" title="外观设置"><Icon className="h-4 w-4" /></Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 max-w-[calc(100vw-2rem)] rounded-xl p-4">
        <h2 className="text-sm font-semibold">外观设置</h2>
        <p className="mt-1 text-xs text-muted-foreground">选择适合你的阅读环境</p>
        <div className="mt-4 grid grid-cols-3 gap-2" role="group" aria-label="主题模式">
          {options.map(({ value, label, description, icon: OptionIcon }) => (
            <button key={value} onClick={() => setTheme(value)} aria-pressed={theme === value} className="theme-option rounded-lg border p-2 text-left" data-selected={theme === value}>
              <span className={`theme-preview theme-preview-${value}`} aria-hidden="true"><span /><span /><span /></span>
              <span className="mt-2 flex items-center gap-1 text-xs font-medium"><OptionIcon className="h-3 w-3 shrink-0" />{label}</span>
              <span className="mt-1 block text-[11px] text-muted-foreground">{description}</span>
            </button>
          ))}
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground" role="status"><Check className="h-3.5 w-3.5 text-primary" />当前为{resolvedTheme === 'dark' ? '深色' : '浅色'}主题</p>
      </PopoverContent>
    </Popover>
  )
}
