import React, { useState } from 'react'
import { useAuth } from './context/AuthContext.jsx'
import { TrackerProvider, useTracker } from './context/TrackerContext.jsx'
import { CurrencyProvider } from './context/CurrencyContext.jsx'
import AuthScreen from './components/AuthScreen.jsx'
import Navbar from './components/Navbar.jsx'
import Dashboard from './components/Dashboard.jsx'
import AddTransactionForm from './components/AddTransactionForm.jsx'
import History from './components/History.jsx'
import Remittance from './components/Remittance.jsx'

export default function App() {
  const { user, checking } = useAuth()

  if (checking) {
    return <div className="min-h-screen grid place-items-center text-gray-400">Loading…</div>
  }
  if (!user) {
    return <AuthScreen />
  }

  return (
    <TrackerProvider>
      <CurrencyProvider>
        <AuthenticatedApp />
      </CurrencyProvider>
    </TrackerProvider>
  )
}

function AuthenticatedApp() {
  const [tab, setTab] = useState('dashboard')
  const [editingRecord, setEditingRecord] = useState(null)
  const { loading, error, toast } = useTracker()

  const goEdit = (record) => {
    setEditingRecord(record)
    // Remittances have their own dedicated form — the generic Add form has
    // no country/sent-amount fields, so editing one there would silently
    // drop those values.
    setTab(record.type === 'remittance' ? 'remittance' : 'add')
  }

  // Navigating by tab abandons any in-progress edit. Without this the
  // stale `editingRecord` survives, and the next visit to "Add" silently
  // reopens in edit mode — so saving a brand-new entry would overwrite
  // the old record instead of creating one.
  const navigate = (nextTab) => {
    setEditingRecord(null)
    setTab(nextTab)
  }

  const clearEdit = () => setEditingRecord(null)

  return (
    <div className="min-h-screen">
      <Navbar tab={tab} setTab={navigate} />
      <main className="max-w-[900px] mx-auto px-4 md:px-6 py-6 w-full">
        {error && (
          <div className="mb-4 rounded-card border border-red bg-red-light text-red px-4 py-3 text-sm">
            {error}
          </div>
        )}
        {loading ? (
          <div className="text-center py-20 text-gray-400">Loading…</div>
        ) : (
          <>
            {tab === 'dashboard' && <Dashboard onSeeRemittance={() => navigate('remittance')} />}
            {tab === 'add' && (
              <AddTransactionForm editingRecord={editingRecord} onDone={clearEdit} />
            )}
            {tab === 'history' && <History onEdit={goEdit} />}
            {tab === 'remittance' && <Remittance editingRecord={editingRecord} onEditHandled={clearEdit} />}
          </>        )}
      </main>
      <div className={`toast ${toast ? 'show' : ''}`}>{toast}</div>
    </div>
  )
}