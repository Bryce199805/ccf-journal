import { createContext, useContext } from 'react'

export type Theme = 'light' | 'dark' | 'system'
export type ResolvedTheme = Exclude<Theme, 'system'>

export const ThemeContext = createContext<{
  theme: Theme
  resolvedTheme: ResolvedTheme
  setTheme: (theme: Theme) => void
}>({ theme: 'system', resolvedTheme: 'light', setTheme: () => {} })

export function useTheme() {
  return useContext(ThemeContext)
}
