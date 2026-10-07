import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import * as api from '../api'
import { tokenStore, fetchMe, loginUser, registerUser, logoutUser } from '../api'

const AuthContext = createContext(null)

/* Say what actually went wrong. A sleeping or unreachable server is not a wrong password. */
function loginErrorMessage(err) {
  const res = err?.response
  if (!res) return "Can't reach the server right now. If the app was idle, it can take up to a minute to wake up — please try again."
  if (res.status === 429) return 'Too many sign-in attempts. Please wait a minute and try again.'
  if (res.status >= 500) return 'Something went wrong on the server. Please try again in a moment.'
  return 'Wrong username/email or password.'
}

/* Turn any API error into one sentence to show the person */
export function errorText(err) {
  const res = err?.response
  if (!res) return "Can't reach the server right now. If the app was idle, it can take up to a minute to wake up — please try again."
  const d = res.data
  if (d?.detail) return d.detail
  if (res.status === 429) return 'Too many tries. Please wait a minute and try again.'
  if (res.status >= 500) return 'Something went wrong on the server. Please try again in a moment.'
  if (d && typeof d === 'object') return Object.values(d).flat().join(' ')
  return 'Something went wrong. Please try again.'
}

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

  // Save the tokens the server sent and show the app
  const finish = useCallback((data) => {
    tokenStore.setTokens(data.access, data.refresh)
    setUser(data.user)
  }, [])

  // Returns { ok }, or { verify: email } when the account still needs its email code
  const login = useCallback(async (username, password) => {
    setAuthError('')
    try {
      const data = await loginUser({ username, password })
      tokenStore.setTokens(data.access, data.refresh)
      setUser(await fetchMe())
      return { ok: true }
    } catch (err) {
      if (err?.response?.data?.code === 'email_not_verified') return { verify: err.response.data.email }
      setAuthError(err?.response?.status === 401 ? 'Wrong username/email or password.' : loginErrorMessage(err))
      return { ok: false }
    }
  }, [])

  // Returns { ok }, or { verify: email, message } when a code was emailed
  const register = useCallback(async (username, email, password) => {
    setAuthError('')
    try {
      const data = await registerUser({ username, email, password })
      if (data.verification_required) return { verify: data.email, message: data.detail }
      finish(data)
      return { ok: true }
    } catch (err) {
      setAuthError(errorText(err))
      return { ok: false }
    }
  }, [finish])

  // These throw on failure; the screen shows errorText(err)
  const verifyEmail = useCallback(async (email, code) => finish(await api.verifyEmail({ email, code })), [finish])
  const resetPassword = useCallback(async (email, code, newPassword) =>
    finish(await api.confirmPasswordReset({ email, code, new_password: newPassword })), [finish])
  const loginWithGoogle = useCallback(async (credential) => finish(await api.googleLogin(credential)), [finish])

  const logout = useCallback(async () => {
    await logoutUser()
    clearSession()
  }, [clearSession])

  return (
    <AuthContext.Provider value={{ user, checking, authError, setAuthError, login, register, logout, verifyEmail, resetPassword, loginWithGoogle }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
