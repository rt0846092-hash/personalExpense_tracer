import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'

export default function AuthScreen() {
  const [mode, setMode] = useState('login') // 'login' | 'register'
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { login, register, authError, setAuthError } = useAuth()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    if (mode === 'login') {
      await login(username, password)
    } else {
      await register(username, email, password)
    }
    setSubmitting(false)
  }

  const switchMode = (m) => {
    setMode(m)
    setAuthError('')
  }

  return (
    <div className="min-h-screen grid place-items-center px-4 bg-gray-100">
      <div className="w-full max-w-[400px] bg-white border border-gray-200 rounded-cardLg shadow-card p-8">
        <div className="flex items-center gap-2 font-semibold text-gray-900 mb-6 justify-center">
          <div className="w-8 h-8 rounded-lg bg-blue text-white grid place-items-center text-sm font-bold">₨</div>
          <span className="text-lg">Tracker</span>
        </div>

        <div className="flex border border-gray-300 rounded-card overflow-hidden mb-6">
          <button
            onClick={() => switchMode('login')}
            className={`flex-1 py-2 text-sm font-medium ${mode === 'login' ? 'bg-blue-light text-blue' : 'text-gray-500'}`}
          >
            Sign in
          </button>
          <button
            onClick={() => switchMode('register')}
            className={`flex-1 py-2 text-sm font-medium ${mode === 'register' ? 'bg-blue-light text-blue' : 'text-gray-500'}`}
          >
            Create account
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[13px] font-medium text-gray-600 mb-1">
              {mode === 'login' ? 'Username or email' : 'Username'}
            </label>
            <input value={username} onChange={e => setUsername(e.target.value)} required autoFocus className="input" />
          </div>

          {mode === 'register' && (
            <div>
              <label className="block text-[13px] font-medium text-gray-600 mb-1">
                Email <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="input" />
            </div>
          )}

          <div>
            <label className="block text-[13px] font-medium text-gray-600 mb-1">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} className="input" />
          </div>

          {authError && (
            <div className="text-sm text-red bg-red-light border border-red rounded-card px-3 py-2">{authError}</div>
          )}

          <button type="submit" disabled={submitting}
            className="w-full py-2.5 rounded-card bg-blue text-white text-sm font-medium disabled:opacity-60">
            {submitting ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <p className="text-xs text-gray-400 text-center mt-5">
          Sign in with the same account on any device to see the same data.
        </p>
      </div>
    </div>
  )
}