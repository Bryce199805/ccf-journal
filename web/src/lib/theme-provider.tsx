import { useEffect, useState, type ReactNode } from 'react'
import { ThemeContext, type Theme, type ResolvedTheme } from './theme-context'

function savedTheme(): Theme {
  try {
    const value = localStorage.getItem('ccf_theme')
    if (value === 'light' || value === 'dark') return value
  } catch { /* Theme switching still works when storage is unavailable. */ }
  return 'system'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(savedTheme)
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  const resolvedTheme = theme === 'system' ? systemTheme : theme

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const update = () => setSystemTheme(media.matches ? 'dark' : 'light')
    media.addEventListener('change', update)
    const sync = (event: StorageEvent) => { if (event.key === 'ccf_theme' || event.key === null) setTheme(savedTheme()) }
    window.addEventListener('storage', sync)
    return () => { media.removeEventListener('change', update); window.removeEventListener('storage', sync) }
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark')
    document.documentElement.style.colorScheme = resolvedTheme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolvedTheme === 'dark' ? '#0c1424' : '#f3f6fb')
  }, [resolvedTheme])

  const selectTheme = (value: Theme) => {
    setTheme(value)
    try { localStorage.setItem('ccf_theme', value) } catch { /* Optional persistence. */ }
  }

  return <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme: selectTheme }}>{children}</ThemeContext.Provider>
}
