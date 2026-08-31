import React, { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { useCurrency } from '../context/CurrencyContext.jsx'
import { CURRENCIES, CURRENCY_GLYPHS, FREQUENT_CURRENCIES } from '../utils/constants'

const TABS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'add', label: 'Add' },
  { key: 'history', label: 'History' },
  { key: 'remittance', label: 'Remittance' },
]

export default function Navbar({ tab, setTab }) {
  const { user, logout } = useAuth()
  const { displayCurrency, setDisplayCurrency, ratesError } = useCurrency()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  // The logo badge reflects the currency you're currently viewing in,
  // rather than being permanently stuck on one symbol.
  const glyph = CURRENCY_GLYPHS[displayCurrency] || displayCurrency
  // Arabic-script symbols are several characters wide — shrink the type
  // so they still fit the badge instead of overflowing it.
  const glyphSize = glyph.length > 1 ? 'text-[10px]' : 'text-sm'

  const frequent = CURRENCIES.filter(c => FREQUENT_CURRENCIES.includes(c.code))
  const rest = CURRENCIES.filter(c => !FREQUENT_CURRENCIES.includes(c.code))

  const go = (key) => { setTab(key); setMenuOpen(false) }

  // Close on outside click and on Escape — a menu you can't dismiss
  // without picking something is a trap on a phone.
  useEffect(() => {
    if (!menuOpen) return
    const onClick = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="max-w-[900px] mx-auto px-4 md:px-6 h-14 flex items-center gap-3">

        {/* Brand — tapping it returns to the dashboard, the usual
            "logo goes home" convention. */}
        <button
          onClick={() => go('dashboard')}
          className="flex items-center gap-2 font-semibold text-gray-900 shrink-0"
          aria-label="Go to dashboard"
        >
          <div className={`w-7 h-7 rounded-lg bg-blue text-white grid place-items-center font-bold ${glyphSize}`}>
            {glyph}
          </div>
          <span className="hidden sm:inline">Tracker</span>
        </button>

        {/* Mobile-only Dashboard shortcut so the main screen is always one
            tap away without opening the menu. */}
        <button
          onClick={() => go('dashboard')}
          className={`sm:hidden px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            tab === 'dashboard' ? 'bg-blue-light text-blue' : 'text-gray-500 active:bg-gray-100'
          }`}
        >
          Dashboard
        </button>

        {/* Tabs — desktop only. Below sm they live in the menu. */}
        <nav className="hidden sm:flex gap-1 flex-1 justify-center">
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

        {/* Spacer so the right cluster stays right-aligned on mobile,
            where the nav above is hidden and can't push it over. */}
        <div className="flex-1 sm:hidden" />

        <div className="flex items-center gap-2 shrink-0">
          <select
            value={displayCurrency}
            onChange={e => setDisplayCurrency(e.target.value)}
            title={ratesError || 'Display currency'}
            aria-label="Display currency"
            className="text-xs border border-gray-300 rounded-lg pl-2 pr-1 py-1.5 bg-white text-gray-700"
          >
            <optgroup label="Frequent">
              {frequent.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
            </optgroup>
            <optgroup label="All currencies">
              {rest.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
            </optgroup>
          </select>

          {/* Desktop: name and sign-out sit inline. */}
          <span className="hidden sm:inline text-sm font-medium text-gray-900 max-w-[120px] truncate" title={user?.username}>
            {user?.username}
          </span>
          <button
            onClick={logout}
            className="hidden sm:inline-block text-xs px-2.5 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-100"
          >
            Sign out
          </button>

          {/* Mobile: everything else folds into this menu. */}
          <div className="relative sm:hidden" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(o => !o)}
              aria-label="Menu"
              aria-expanded={menuOpen}
              className="w-9 h-9 grid place-items-center rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 active:bg-gray-200"
            >
              {menuOpen ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M3 6h18M3 12h18M3 18h18" />
                </svg>
              )}
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-2 w-52 bg-white border border-gray-200 rounded-cardLg shadow-cardMd overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100">
                  <div className="text-[11px] text-gray-400">Signed in as</div>
                  <div className="text-sm font-medium text-gray-900 truncate">{user?.username}</div>
                </div>
                <nav className="py-1">
                  {/* Dashboard is excluded here — it has its own dedicated
                      button in the top bar, so listing it twice is noise. */}
                  {TABS.filter(t => t.key !== 'dashboard').map(t => (
                    <button
                      key={t.key}
                      onClick={() => go(t.key)}
                      className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                        tab === t.key ? 'bg-blue-light text-blue font-medium' : 'text-gray-700 active:bg-gray-100'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </nav>
                <div className="border-t border-gray-100">
                  <button
                    onClick={() => { setMenuOpen(false); logout() }}
                    className="w-full text-left px-4 py-2.5 text-sm text-red active:bg-red-light"
                  >
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}