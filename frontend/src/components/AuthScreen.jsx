import React, { useEffect, useState } from 'react'
import { useAuth, errorText } from '../context/AuthContext.jsx'
import * as api from '../api'
import GoogleButton from './GoogleButton.jsx'

/* Screens: login · register · verify (code after sign-up) · forgot (ask for code) · reset (code + new password) */
export default function AuthScreen() {
  const [mode, setMode] = useState('login')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [resendWait, setResendWait] = useState(0)
  // Only offer email features when the server can actually send emails
  const [emailCodes, setEmailCodes] = useState(false)
  useEffect(() => {
    api.getAuthOptions().then(o => setEmailCodes(!!o.email_codes)).catch(() => {})
  }, [])
  const { login, register, verifyEmail, resetPassword, loginWithGoogle, authError, setAuthError } = useAuth()

  // Count down until "Send a new code" can be used again
  useEffect(() => {
    if (!resendWait) return
    const t = setTimeout(() => setResendWait(w => w - 1), 1000)
    return () => clearTimeout(t)
  }, [resendWait])

  const go = (next, { keepNotice = false } = {}) => {
    setMode(next); setError(''); setAuthError(''); setCode('')
    if (!keepNotice) setNotice('')
  }

  const run = async (fn) => {
    setSubmitting(true); setError('')
    try { await fn() } catch (err) { setError(errorText(err)) } finally { setSubmitting(false) }
  }

  const toVerify = (addr, message) => {
    setEmail(addr); setPassword(''); setResendWait(60)
    go('verify', { keepNotice: true })
    setNotice(message || `Enter the 6-digit code we sent to ${addr}.`)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    run(async () => {
      if (mode === 'login') {
        const res = await login(username, password)
        if (res.verify) toVerify(res.verify, 'Your email isn’t confirmed yet. Enter the code we sent you, or ask for a new one.')
      } else if (mode === 'register') {
        const res = await register(username, email, password)
        if (res.verify) toVerify(res.verify, res.message)
      } else if (mode === 'verify') {
        await verifyEmail(email, code)
      } else if (mode === 'forgot') {
        const res = await api.requestPasswordReset(email)
        setResendWait(60); go('reset', { keepNotice: true }); setNotice(res.detail)
      } else if (mode === 'reset') {
        await resetPassword(email, code, password)
      }
    })
  }

  const resend = () => run(async () => {
    const res = await api.resendCode({ email, purpose: mode === 'reset' ? 'reset' : 'verify' })
    setNotice(res.detail); setCode(''); setResendWait(60)
  })

  const onGoogle = (credential) => run(() => loginWithGoogle(credential))

  const isTabs = mode === 'login' || mode === 'register'
  const shownError = error || authError
  const titles = {
    verify: 'Confirm your email',
    forgot: 'Forgot your password?',
    reset: 'Set a new password',
  }
  const buttonText = {
    login: 'Sign in', register: 'Create account', verify: 'Confirm email',
    forgot: 'Send code', reset: 'Save new password',
  }[mode]

  return (
    <div className="min-h-screen grid place-items-center px-4 bg-gray-100">
      <div className="w-full max-w-[400px] bg-white border border-gray-200 rounded-cardLg shadow-card p-8">
        <div className="flex items-center gap-2 font-semibold text-gray-900 mb-6 justify-center">
          <div className="w-8 h-8 rounded-lg bg-blue text-white grid place-items-center text-sm font-bold">₨</div>
          <span className="text-lg">Tracker</span>
        </div>

        {isTabs ? (
          <>
            <div className="flex border border-gray-300 rounded-card overflow-hidden mb-5">
              {[['login', 'Sign in'], ['register', 'Create account']].map(([m, label]) => (
                <button key={m} type="button" onClick={() => go(m)}
                  className={`flex-1 py-2 text-sm font-medium ${mode === m ? 'bg-blue-light text-blue' : 'text-gray-500'}`}>
                  {label}
                </button>
              ))}
            </div>
            <GoogleButton onCredential={onGoogle} text={mode === 'register' ? 'signup_with' : 'continue_with'} />
            <div className="flex items-center gap-3 my-5 text-xs text-gray-400">
              <div className="flex-1 h-px bg-gray-200" /> or <div className="flex-1 h-px bg-gray-200" />
            </div>
          </>
        ) : (
          <div className="mb-5">
            <button type="button" onClick={() => go('login')} className="text-sm text-gray-500 hover:text-blue">← Back to sign in</button>
            <h1 className="text-lg font-semibold mt-3">{titles[mode]}</h1>
            {mode === 'forgot' && <p className="text-sm text-gray-500 mt-1">Enter your account email and we’ll send you a 6-digit code.</p>}
          </div>
        )}

        {notice && <div className="text-sm text-blue bg-blue-light border border-blue-mid rounded-card px-3 py-2 mb-4" role="status">{notice}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          {(mode === 'login' || mode === 'register') && (
            <div>
              <label className="block text-[13px] font-medium text-gray-600 mb-1" htmlFor="auth-username">
                {mode === 'login' ? 'Username or email' : 'Username'}
              </label>
              <input id="auth-username" value={username} onChange={e => setUsername(e.target.value)} required
                autoComplete="username" className="input" />
            </div>
          )}

          {(mode === 'register' || mode === 'forgot') && (
            <div>
              <label className="block text-[13px] font-medium text-gray-600 mb-1" htmlFor="auth-email">Email</label>
              <input id="auth-email" type="email" value={email} onChange={e => setEmail(e.target.value)} required
                autoComplete="email" className="input" />
              {mode === 'register' && emailCodes && <p className="text-xs text-gray-400 mt-1">We’ll send a code here to confirm it’s really yours.</p>}
            </div>
          )}

          {(mode === 'verify' || mode === 'reset') && (
            <div>
              <label className="block text-[13px] font-medium text-gray-600 mb-1" htmlFor="auth-code">6-digit code</label>
              <input id="auth-code" value={code} required inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                pattern="\d{6}" title="The 6 numbers from the email"
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="input text-center tracking-[0.5em] text-lg font-semibold" placeholder="••••••" />
              <p className="text-xs text-gray-400 mt-1">Sent to {email}. Check your spam folder too.</p>
            </div>
          )}

          {(mode === 'login' || mode === 'register' || mode === 'reset') && (
            <div>
              <div className="flex justify-between items-baseline mb-1">
                <label className="block text-[13px] font-medium text-gray-600" htmlFor="auth-password">
                  {mode === 'reset' ? 'New password' : 'Password'}
                </label>
                {mode === 'login' && emailCodes && (
                  <button type="button" onClick={() => { setEmail(username.includes('@') ? username : ''); go('forgot') }}
                    className="text-xs text-blue hover:underline">Forgot password?</button>
                )}
              </div>
              <input id="auth-password" type="password" value={password} onChange={e => setPassword(e.target.value)} required
                minLength={mode === 'login' ? undefined : 8}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'} className="input" />
              {mode !== 'login' && <p className="text-xs text-gray-400 mt-1">At least 8 characters, not too common.</p>}
            </div>
          )}

          {shownError && (
            <div className="text-sm text-red bg-red-light border border-red rounded-card px-3 py-2" role="alert">{shownError}</div>
          )}

          <button type="submit" disabled={submitting}
            className="w-full py-2.5 rounded-card bg-blue text-white text-sm font-medium disabled:opacity-60">
            {submitting ? 'Please wait…' : buttonText}
          </button>

          {(mode === 'verify' || mode === 'reset') && (
            <button type="button" onClick={resend} disabled={submitting || resendWait > 0}
              className="w-full text-sm text-blue disabled:text-gray-400">
              {resendWait > 0 ? `Send a new code in ${resendWait}s` : 'Send a new code'}
            </button>
          )}
        </form>

        {isTabs && (
          <p className="text-xs text-gray-400 text-center mt-5">
            Sign in with the same account on any device to see the same data.
          </p>
        )}
      </div>
    </div>
  )
}
