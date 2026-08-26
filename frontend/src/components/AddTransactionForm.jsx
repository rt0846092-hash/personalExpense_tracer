import React, { useEffect, useState } from 'react'
import { useTracker } from '../context/TrackerContext.jsx'
import { useCurrency } from '../context/CurrencyContext.jsx'
import { CURRENCIES } from '../utils/constants'
import { parseAmount, today, getIncomeCats, getExpenseCats } from '../utils/helpers'

function emptyForm(displayCurrency) {
  return {
    type: 'income',
    source: '',
    amount: '',
    currency: displayCurrency || 'NPR',
    date: today(),
    account: 'digital',
    to_account: 'cash',
    category: '',
    note: '',
  }
}

export default function AddTransactionForm({ editingRecord, onDone }) {
  const { customCats, addRecord, editRecord, addCategory, renameCategory, removeCategory, showToast, records } = useTracker()
  const { displayCurrency } = useCurrency()
  const [form, setForm] = useState(() => emptyForm(displayCurrency))
  const [showManage, setShowManage] = useState(false)

  const incomeCats = getIncomeCats(customCats)
  const expenseCats = getExpenseCats(customCats)
  const cats = form.type === 'income' ? incomeCats : expenseCats

  useEffect(() => {
    if (editingRecord) {
      setForm({
        type: editingRecord.type,
        source: editingRecord.source || '',
        amount: editingRecord.amount,
        currency: editingRecord.currency || 'NPR',
        date: editingRecord.date,
        account: editingRecord.account,
        to_account: editingRecord.to_account || 'cash',
        category: editingRecord.category || '',
        note: editingRecord.note || '',
      })
    }
  }, [editingRecord])

  useEffect(() => {
    // Keep category select valid whenever the type or category set changes
    if (form.type !== 'transfer' && !cats[form.category]) {
      setForm(f => ({ ...f, category: Object.keys(cats)[0] || '' }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.type, customCats])

  const setType = (type) => {
    setForm(f => ({ ...f, type, category: type === 'transfer' ? '' : f.category }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const amount = parseAmount(form.amount)
    if (isNaN(amount) || amount <= 0) { showToast('Enter a valid amount — e.g. 5,000 or 10k'); return }
    if (!form.date) return
    if (form.type === 'transfer' && form.account === form.to_account) {
      showToast('From and To accounts must be different'); return
    }

    const payload = {
      type: form.type,
      account: form.account,
      to_account: form.type === 'transfer' ? form.to_account : null,
      category: form.type === 'transfer' ? 'transfer' : form.category,
      amount,
      currency: form.currency,
      date: form.date,
      source: form.source.trim(),
      note: form.note.trim(),
    }

    try {
      if (editingRecord) {
        await editRecord(editingRecord.id, payload)
        showToast('Entry updated ✓')
      } else {
        await addRecord(payload)
        showToast(form.type === 'transfer' ? 'Transfer saved ✓' : form.type === 'income' ? 'Income saved ✓' : 'Expense saved ✓')
      }
      setForm({ ...emptyForm(displayCurrency), type: form.type, date: today() })
      onDone?.()
    } catch (err) {
      const msg = err?.response?.data ? JSON.stringify(err.response.data) : 'Could not save this entry — check the account has enough balance.'
      showToast(msg)
    }
  }

  const handleReset = () => {
    setForm(emptyForm(displayCurrency))
    onDone?.()
  }

  const handleAddCategory = async () => {
    const raw = prompt(`Enter new custom ${form.type} category name:`)
    if (raw === null) return
    const label = raw.trim()
    if (!label) return

    // Build a slug from the label. Non-Latin labels (Nepali, Korean, …)
    // have no ASCII to keep, so they'd all collapse to the same key —
    // append a short random suffix in that case to keep them distinct.
    let key = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    if (!key) key = `cat_${Math.random().toString(36).slice(2, 8)}`

    if (cats[key]) { showToast('Category already exists!'); return }
    const icons = ['🏷️', '✨', '⭐', '🎈', '🛒', '🍔', '💵', '🔧', '📦']
    const colors = ['#3b82f6', '#10b981', '#ef4444', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#14b8a6', '#f97316']
    const icon = icons[Math.floor(Math.random() * icons.length)]
    const color = colors[Math.floor(Math.random() * colors.length)]
    try {
      await addCategory({ type: form.type, key, label, color, icon })
      setForm(f => ({ ...f, category: key }))
      showToast(`Created category "${label}" ✓`)
    } catch (err) {
      // Without this the promise rejects unhandled and the UI just does
      // nothing — no toast, no explanation.
      const detail = err?.response?.data
      const msg = detail ? Object.values(detail).flat().join(' ') : 'Could not create that category.'
      showToast(msg)
    }
  }

  const customList = customCats.filter(c => c.type === form.type)

  return (
    <div className="bg-white border border-gray-200 rounded-cardLg shadow-card p-4 sm:p-6 md:p-8 max-w-[540px] mx-auto">
      <div className="text-lg font-semibold mb-6">{editingRecord ? 'Edit transaction' : 'Add transaction'}</div>

      <div className={`flex border border-gray-300 rounded-card overflow-hidden mb-6 ${editingRecord ? 'pointer-events-none opacity-60' : ''}`}>
        {['income', 'expense', 'transfer'].map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={`flex-1 py-2 text-sm font-medium ${
              form.type === t
                ? t === 'income' ? 'bg-green-light text-green'
                : t === 'expense' ? 'bg-red-light text-red'
                : 'bg-blue-light text-blue'
                : 'text-gray-500'
            }`}
          >
            {t === 'income' ? '+ Income' : t === 'expense' ? '− Expense' : '↔ Transfer'}
          </button>
        ))}
      </div>

      {form.type === 'transfer' && (
        <div className="bg-blue-light border border-blue-mid rounded-card px-3.5 py-2.5 text-sm text-blue mb-4">
          Use this to move money between accounts — e.g. ATM withdrawal from digital to cash.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label={form.type === 'transfer' ? 'Note (optional)' : 'Source / description'}>
          <input
            value={form.source}
            onChange={e => setForm(f => ({ ...f, source: e.target.value }))}
            placeholder={form.type === 'transfer' ? 'e.g. ATM withdrawal' : form.type === 'income' ? 'e.g. Monthly salary' : 'e.g. Rice & dal, Bus fare'}
            required={form.type !== 'transfer'}
            className="input"
          />
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Amount">
            <div className="flex gap-2">
              <input
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="e.g. 5000, 10k, 1.5K"
                inputMode="numeric"
                required
                className="input flex-1"
              />
              <select
                value={form.currency}
                onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
                className="input w-[90px] shrink-0"
                title="Currency this amount was entered in"
              >
                {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
              </select>
            </div>
            <div className="flex gap-1.5 mt-1.5">
              {['k', 'l', 'm'].map(s => (
                <button key={s} type="button"
                  onClick={() => setForm(f => ({ ...f, amount: f.amount.replace(/[kKlLmM]$/, '') + s }))}
                  className="flex-1 py-1.5 text-xs font-semibold border border-gray-300 rounded-md bg-gray-100 text-gray-600 active:bg-blue active:text-white"
                >{s.toUpperCase()}</button>
              ))}
            </div>
          </Field>
          <Field label="Date">
            <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required className="input" />
          </Field>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label={form.type === 'transfer' ? 'From account' : 'Account'}>
            <select value={form.account} onChange={e => setForm(f => ({ ...f, account: e.target.value }))} className="input">
              <option value="digital">💳 Digital</option>
              <option value="cash">💵 Cash</option>
            </select>
          </Field>
          {form.type === 'transfer' && (
            <Field label="To account">
              <select value={form.to_account} onChange={e => setForm(f => ({ ...f, to_account: e.target.value }))} className="input">
                <option value="cash">💵 Cash</option>
                <option value="digital">💳 Digital</option>
              </select>
            </Field>
          )}
        </div>

        {form.type !== 'transfer' && (
          <Field label="Category">
            <div className="flex gap-2">
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="input flex-1">
                {Object.entries(cats).map(([v, m]) => (
                  <option key={v} value={v}>{m.icon || '•'} {m.label}</option>
                ))}
              </select>
              <button type="button" onClick={handleAddCategory} title="Create custom category"
                className="px-3.5 border border-gray-300 rounded-card font-bold text-lg leading-none hover:bg-gray-50">+</button>
              <button type="button" onClick={() => setShowManage(s => !s)} title="Manage custom categories"
                className="px-3.5 border border-gray-300 rounded-card hover:bg-gray-50">⚙</button>
            </div>

            {showManage && (
              <div className="mt-2.5 p-3 border border-gray-200 rounded-card bg-gray-50">
                {customList.length === 0 ? (
                  <p className="text-xs text-gray-400 py-1">No custom categories yet. Use the + button to add one.</p>
                ) : customList.map(c => (
                  <div key={c.id} className="flex items-center gap-2 py-1.5 border-b last:border-0 border-gray-200">
                    <span className="w-5 text-center text-sm">{c.icon || '•'}</span>
                    <span className="flex-1 text-sm">{c.label}</span>
                    <button type="button" title="Rename"
                      onClick={async () => {
                        const raw = prompt('Rename category:', c.label)
                        if (raw === null) return
                        const label = raw.trim()
                        if (!label) return
                        await renameCategory(c.id, label)
                        showToast('Category renamed ✓')
                      }}
                      className="text-gray-400 hover:text-gray-900 px-1.5 py-1 rounded-md text-xs">✏️</button>
                    <button type="button" title="Delete"
                      onClick={async () => {
                        const inUse = records.some(r => r.type === c.type && r.category === c.key)
                        const msg = inUse ? `Delete "${c.label}"? Entries using it will be moved to "Other".` : `Delete "${c.label}"?`
                        if (!confirm(msg)) return
                        await removeCategory(c.id, c.type, c.key)
                        showToast('Category deleted')
                      }}
                      className="text-gray-400 hover:text-red px-1.5 py-1 rounded-md text-xs">✕</button>
                  </div>
                ))}
              </div>
            )}
          </Field>
        )}

        <Field label={<>Note <span className="font-normal text-gray-400">(optional)</span></>}>
          <textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
            placeholder="Any extra detail…" className="input min-h-[72px] resize-y" />
        </Field>

        {/* On a phone the primary action should be a full-width, easily
            thumbed target — and Clear should read as clearly secondary so
            it isn't fired by accident next to it. */}
        <div className="flex flex-col-reverse sm:flex-row gap-2.5 pt-1">
          <button type="button" onClick={handleReset} className="px-5 py-3 sm:py-2.5 rounded-card text-sm font-medium border border-gray-300 text-gray-600 hover:bg-gray-50 active:bg-gray-100">
            Clear
          </button>
          <button type="submit"
            className={`flex-1 sm:flex-none px-5 py-3 sm:py-2.5 rounded-card text-sm font-medium text-white transition-opacity active:opacity-80 ${
              editingRecord ? 'bg-amber' : form.type === 'income' ? 'bg-green' : form.type === 'expense' ? 'bg-red' : 'bg-blue'
            }`}
          >
            {editingRecord ? 'Update entry' : form.type === 'income' ? 'Save income' : form.type === 'expense' ? 'Save expense' : 'Save transfer'}
          </button>
        </div>
      </form>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-[13px] font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  )
}