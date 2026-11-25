import { useState, useCallback, useEffect } from 'react'
import { ApiError } from '@/api/client'
import * as authApi from '@/api/auth'
import type { User } from '@/api/types'

export function useAuth() {
  const [session, setSession] = useState(0)
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(() => Boolean(localStorage.getItem('ccf_token')))

  useEffect(() => {
    const token = localStorage.getItem('ccf_token')
    if (token) {
      authApi.getMe()
        .then(res => { if (localStorage.getItem('ccf_token') === token) setUser(res.user) })
        .catch(error => {
          if (error instanceof ApiError && error.status === 401 && localStorage.getItem('ccf_token') === token) {
            localStorage.removeItem('ccf_token')
            setSession(previous => previous + 1)
          }
        })
        .finally(() => setIsLoading(false))
    }
  }, [])

  const login = useCallback(async (username: string, password: string, deviceId: string) => {
    const res = await authApi.login({ username, password, device_id: deviceId })
    localStorage.setItem('ccf_token', res.token)
    setUser(res.user)
    setSession(previous => previous + 1)
    return res
  }, [])

  const register = useCallback(async (username: string, password: string, deviceId: string) => {
    const res = await authApi.register({ username, password, device_id: deviceId })
    localStorage.setItem('ccf_token', res.token)
    setUser(res.user)
    setSession(previous => previous + 1)
    return res
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('ccf_token')
    setUser(null)
    setSession(previous => previous + 1)
  }, [])

  return {
    session,
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    register,
    logout,
  }
}
