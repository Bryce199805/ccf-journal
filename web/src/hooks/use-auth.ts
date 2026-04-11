import { useState, useCallback, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import * as authApi from '@/api/auth'
import type { User } from '@/api/types'

export function useAuth() {
  const qc = useQueryClient()
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('ccf_token')
    if (token) {
      authApi.getMe()
        .then(res => setUser(res.user))
        .catch(() => localStorage.removeItem('ccf_token'))
        .finally(() => setIsLoading(false))
    } else {
      setIsLoading(false)
    }
  }, [])

  const login = useCallback(async (username: string, password: string, deviceId: string) => {
    const res = await authApi.login({ username, password, device_id: deviceId })
    localStorage.setItem('ccf_token', res.token)
    setUser(res.user)
    qc.invalidateQueries()
    return res
  }, [qc])

  const register = useCallback(async (username: string, password: string) => {
    const res = await authApi.register({ username, password })
    localStorage.setItem('ccf_token', res.token)
    setUser(res.user)
    qc.invalidateQueries()
    return res
  }, [qc])

  const logout = useCallback(() => {
    localStorage.removeItem('ccf_token')
    setUser(null)
    qc.invalidateQueries()
  }, [qc])

  return {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    register,
    logout,
  }
}
