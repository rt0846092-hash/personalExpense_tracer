import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { tokenStore, fetchMe, loginUser, registerUser, logoutUser } from '../api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [checking, setChecking] = useState(true)
  const [authError, setAuthError] = useState('')

  const clearSession = useCallback(() => {
    tokenStore.clear()
    setUser(null)
  }, [])

  useEffect(() => {
    (async () => {
      if (!tokenStore.getAccess()) { setChecking(false); return }
      try {
        const me = await fetchMe()
        setUser(me)
      } catch {
        clearSession()
      } finally {
        setChecking(false)
      }
    })()
  }, [clearSession])

  useEffect(() => {
    const onForcedLogout = () => setUser(null)
    window.addEventListener('tracker:logout', onForcedLogout)
    return () => window.removeEventListener('tracker:logout', onForcedLogout)
  }, [])

  const login = useCallback(async (username, password) => {
    setAuthError('')
    try {
      const data = await loginUser({ username, password })
      tokenStore.setTokens(data.access, data.refresh)
      const me = await fetchMe()
      setUser(me)
      return true
    } catch (err) {
      setAuthError(err?.response?.data?.detail || 'Invalid username or password.')
      return false
    }
  }, [])

  const register = useCallback(async (username, email, password) => {
    setAuthError('')
    try {
      const data = await registerUser({ username, email, password })
      tokenStore.setTokens(data.access, data.refresh)
      setUser(data.user)
      return true
    } catch (err) {
      const d = err?.response?.data
      const msg = d ? Object.values(d).flat().join(' ') : 'Could not create that account.'
      setAuthError(msg)
      return false
    }
  }, [])

  const logout = useCallback(async () => {
    await logoutUser()
    clearSession()
  }, [clearSession])

  return (
    <AuthContext.Provider value={{ user, checking, authError, setAuthError, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
