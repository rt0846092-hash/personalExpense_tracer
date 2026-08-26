import React from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { useCurrency } from '../context/CurrencyContext.jsx'
import { CURRENCIES } from '../utils/constants'

const TABS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'add', label: 'Add' },
  { key: 'history', label: 'History' },
  { key: 'remittance', label: 'Remittance' },
]

export default function Navbar({ tab, setTab }) {
  const { user, logout } = useAuth()
  const { displayCurrency, setDisplayCurrency, ratesError } = useCurrency()

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="max-w-[900px] mx-auto px-4 md:px-6 h-14 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-semibold text-gray-900 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-blue text-white grid place-items-center text-sm font-bold">
            ₨
          </div>
          <span className="hidden sm:inline">Tracker</span>
        </div>
        <nav className="flex gap-1 overflow-x-auto scrollbar-none">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                tab === t.key ? 'bg-blue-light text-blue' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-2 shrink-0">
          <select
            value={displayCurrency}
            onChange={e => setDisplayCurrency(e.target.value)}
            title={ratesError || 'Display currency'}
            className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 bg-white"
          >
            {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
          </select>
          <span className="text-sm font-medium text-gray-900 max-w-[100px] truncate" title={user?.username}>
          {user?.username}
</span>
          <button
            onClick={logout}
            title="Sign out"
            className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  )
}
