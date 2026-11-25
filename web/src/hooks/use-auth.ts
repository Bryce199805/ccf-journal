import { useState, useCallback, useEffect } from 'react'
import { ApiError, setSessionToken } from '@/api/client'
import * as authApi from '@/api/auth'
import type { User } from '@/api/types'

export function useAuth() {
  const [session, setSession] = useState(0)
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(() => Boolean(localStorage.getItem('ccf_token')))

  const [verificationFailed, setVerificationFailed] = useState(false)

  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.storageArea === localStorage && (event.key === 'ccf_token' || event.key === null)) {
        window.location.reload()
      }
    }
    window.addEventListener('storage', sync)
    const token = localStorage.getItem('ccf_token')
    if (token) {
      authApi.getMe()
        .then(res => { if (localStorage.getItem('ccf_token') === token) setUser(res.user) })
        .catch(error => {
          if (error instanceof ApiError && error.status === 401 && localStorage.getItem('ccf_token') === token) {
            setSessionToken(null)
            setSession(previous => previous + 1)
          } else if (localStorage.getItem('ccf_token') === token) {
            setVerificationFailed(true)
          }
        })
        .finally(() => setIsLoading(false))
    }
    return () => window.removeEventListener('storage', sync)
  }, [])

  const login = useCallback(async (username: string, password: string, deviceId: string) => {
    const res = await authApi.login({ username, password, device_id: deviceId })
    setSessionToken(res.token)
    setUser(res.user)
    setSession(previous => previous + 1)
    return res
  }, [])

  const register = useCallback(async (username: string, password: string, deviceId: string) => {
    const res = await authApi.register({ username, password, device_id: deviceId })
    setSessionToken(res.token)
    setUser(res.user)
    setSession(previous => previous + 1)
    return res
  }, [])

  const logout = useCallback(() => {
    setSessionToken(null)
    setUser(null)
    setSession(previous => previous + 1)
  }, [])

  return {
    session,
    verificationFailed,
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    register,
    logout,
  }
}
