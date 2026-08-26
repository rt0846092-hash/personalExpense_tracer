import React, { useEffect, useMemo, useState } from 'react'
import { useTracker } from '../context/TrackerContext.jsx'
import { useCurrency } from '../context/CurrencyContext.jsx'
import * as api from '../api'
import { fmt, fmtIn, recordAmountInDisplay, mk, getIncomeCats, getExpenseCats } from '../utils/helpers'
import { CURRENCIES } from '../utils/constants'

const PREVIEW_LIMIT = 5

export default function History({ onEdit }) {
  const { records, customCats, openingBalances, removeRecord, saveOpeningBalances, showToast, addCategory, refreshRecords } = useTracker()
  const { displayCurrency, rates } = useCurrency()
  const [typeF, setTypeF] = useState('')
  const [accountF, setAccountF] = useState('')
  const [monthF, setMonthF] = useState('')
  const [fromF, setFromF] = useState('')
  const [toF, setToF] = useState('')
  const [search, setSearch] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const [ob, setOb] = useState({
    digital: openingBalances.digital,
    cash: openingBalances.cash,
    currency: openingBalances.currency || 'NPR',
  })

  // The balances arrive from the API after first render, so mirror them
  // into the form once they land.
  useEffect(() => {
    setOb({
      digital: openingBalances.digital,
      cash: openingBalances.cash,
      currency: openingBalances.currency || 'NPR',
    })
  }, [openingBalances])

  const money = (n) => fmt(n, displayCurrency)
  const inDisplay = (r) => recordAmountInDisplay(r, displayCurrency, rates)

  const incomeCats = getIncomeCats(customCats)
  const expenseCats = getExpenseCats(customCats)

  const months = useMemo(() => [...new Set(records.map(r => mk(r.date)))].sort().reverse(), [records])

  const searchQ = search.toLowerCase().trim()
  const searchNum = searchQ.replace(/,/g, '')

  const filtered = useMemo(() => records.filter(r => {
    const tOk = !typeF || r.type === typeF
    const aOk = !accountF || r.account === accountF || r.to_account === accountF
    const mOk = !monthF || mk(r.date) === monthF
    const dOk = (!fromF || r.date >= fromF) && (!toF || r.date <= toF)
    const matchesSearch = !searchQ ||
      (r.source && r.source.toLowerCase().includes(searchQ)) ||
      (r.note && r.note.toLowerCase().includes(searchQ)) ||
      (r.category && r.category.toLowerCase().includes(searchQ)) ||
      (r.recipient && r.recipient.toLowerCase().includes(searchQ)) ||
      (r.from_country && r.from_country.toLowerCase().includes(searchQ)) ||
      (r.to_country && r.to_country.toLowerCase().includes(searchQ)) ||
      (r.account && r.account.toLowerCase().includes(searchQ)) ||
      (r.to_account && r.to_account.toLowerCase().includes(searchQ)) ||
      (searchNum && r.amount != null && r.amount.toString().includes(searchNum))
    return tOk && aOk && mOk && dOk && matchesSearch
  }), [records, typeF, accountF, monthF, fromF, toF, searchQ, searchNum])

  const hasActiveFilter = !!(typeF || accountF || monthF || fromF || toF || searchQ)
  const shouldLimit = !hasActiveFilter && !showAll && filtered.length > PREVIEW_LIMIT
  const visible = shouldLimit ? filtered.slice(0, PREVIEW_LIMIT) : filtered

  const incTotal = filtered.filter(r => r.type === 'income').reduce((s, r) => s + inDisplay(r), 0)
  const expTotal = filtered.filter(r => r.type === 'expense').reduce((s, r) => s + inDisplay(r), 0)
  const remitTotal = filtered.filter(r => r.type === 'remittance').reduce((s, r) => s + inDisplay(r), 0)
  const transferTotal = filtered.filter(r => r.type === 'transfer').reduce((s, r) => s + inDisplay(r), 0)
  const spentTotal = expTotal + remitTotal
  const net = incTotal - spentTotal

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this transaction entry?')) return
    await removeRecord(id)
    showToast('Entry deleted')
  }

  const handleSaveOpening = async () => {
    await saveOpeningBalances(ob)
    showToast('Opening balances saved ✓')
  }

  const exportJSON = () => {
    const dataStr = JSON.stringify({ records, customCats, openingBalances }, null, 2)
    downloadBlob(dataStr, 'application/json', `tracker_backup_${new Date().toISOString().slice(0,10)}.json`)
    showToast('Data exported successfully 📤')
  }

  const exportCSV = () => {
    const headers = ['id','type','date','account','to_account','category','amount','currency','from_country','to_country','sent_amount','sent_currency','recipient','source','note']
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const rows = records.map(r => headers.map(h => esc(r[h])).join(','))
    const csv = [headers.join(','), ...rows].join('\r\n')
    downloadBlob(csv, 'text/csv;charset=utf-8;', `tracker_export_${new Date().toISOString().slice(0,10)}.csv`)
    showToast('CSV exported 📤')
  }

  // ---- One-time restore from a pre-backend JSON backup ----
  // Reads a file exported by the old localStorage-only version of the app
  // and pushes it into the database through the normal API. Tolerates
  // both the current snake_case shape and the older camelCase field names,
  // and skips anything that looks like it's already been imported.
  const handleImportFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = '' // let the same file be picked again after a retry

    let parsed
    try {
      parsed = JSON.parse(await file.text())
    } catch {
      showToast('That file isn’t valid JSON.')
      return
    }

    const incoming = Array.isArray(parsed) ? parsed : (parsed.records || [])
    if (!Array.isArray(incoming) || incoming.length === 0) {
      showToast('No records found in that file.')
      return
    }

    // Signature of what's already stored, so a re-run doesn't duplicate.
    const seen = new Set(records.map(r => `${r.type}|${r.date}|${Number(r.amount)}|${r.account}`))

    setImporting(true)
    let added = 0, skipped = 0, failed = 0

    try {
      // Custom categories first, so imported records can reference them.
      const existingKeys = new Set(customCats.map(c => `${c.type}|${c.key}`))
      const cats = Array.isArray(parsed.customCats) ? parsed.customCats : []
      for (const c of cats) {
        const type = c.type, key = c.key
        if (!type || !key || existingKeys.has(`${type}|${key}`)) continue
        try {
          await addCategory({
            type, key,
            label: c.label || key,
            color: c.color || '#6b7280',
            icon: c.icon || '🏷️',
          })
        } catch { /* a category that fails shouldn't stop the records */ }
      }

      for (const r of incoming) {
        const pick = (...keys) => keys.map(k => r[k]).find(v => v !== undefined && v !== null && v !== '')
        const type = pick('type')
        const date = pick('date')
        const amount = Number(pick('amount'))
        const account = pick('account') || 'digital'

        if (!type || !date || !Number.isFinite(amount) || amount <= 0) { failed++; continue }
        if (seen.has(`${type}|${date}|${amount}|${account}`)) { skipped++; continue }

        const sentAmount = pick('sent_amount', 'sentAmount')
        const payload = {
          type,
          account,
          to_account: type === 'transfer' ? (pick('to_account', 'toAccount') || 'cash') : null,
          category: type === 'transfer' ? 'transfer' : (pick('category') || ''),
          amount,
          currency: pick('currency') || 'NPR',
          date: String(date).slice(0, 10),
          source: pick('source', 'description') || '',
          note: pick('note') || '',
          from_country: pick('from_country', 'fromCountry') || '',
          to_country: pick('to_country', 'toCountry') || '',
          sent_amount: sentAmount != null ? Number(sentAmount) : null,
          sent_currency: pick('sent_currency', 'sentCurrency') || '',
          recipient: pick('recipient') || '',
        }

        try {
          // Direct API call rather than the context's addRecord, which
          // re-fetches the whole list after every insert — that would mean
          // hundreds of redundant round trips on a big import. One refresh
          // at the end covers it.
          await api.createRecord(payload)
          seen.add(`${type}|${date}|${amount}|${account}`)
          added++
        } catch {
          failed++
        }
        setImportProgress(added + skipped + failed)
      }

      // Opening balances, if the file carried them.
      const ob = parsed.openingBalances
      if (ob && (ob.digital != null || ob.cash != null)) {
        try {
          await saveOpeningBalances({
            digital: Number(ob.digital) || 0,
            cash: Number(ob.cash) || 0,
            currency: ob.currency || 'NPR',
          })
        } catch { /* non-fatal */ }
      }

      showToast(`Imported ${added} · skipped ${skipped}${failed ? ` · failed ${failed}` : ''}`)
    } finally {
      // Single refresh so the newly imported rows appear in the list.
      try { await refreshRecords() } catch { /* list will refresh on reload */ }
      setImporting(false)
      setImportProgress(0)
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-cardLg shadow-card p-4 sm:p-5 flex flex-col gap-3">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by description, note, amount, account, country…" className="input" />
        <div className="flex gap-2.5 flex-wrap">
          <select value={typeF} onChange={e => setTypeF(e.target.value)} className="input flex-1 min-w-[120px]">
            <option value="">All types</option>
            <option value="income">Income</option>
            <option value="expense">Expense</option>
            <option value="transfer">Transfer</option>
            <option value="remittance">Remittance</option>
          </select>
          <select value={accountF} onChange={e => setAccountF(e.target.value)} className="input flex-1 min-w-[120px]">
            <option value="">All accounts</option>
            <option value="digital">Digital</option>
            <option value="cash">Cash</option>
          </select>
          <select value={monthF} onChange={e => setMonthF(e.target.value)} className="input flex-1 min-w-[120px]">
            <option value="">All months</option>
            {months.map(m => {
              const [y, mo] = m.split('-')
              const lbl = new Date(+y, +mo - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })
              return <option key={m} value={m}>{lbl}</option>
            })}
          </select>
        </div>
        <div className="flex gap-2.5 flex-wrap items-center">
          <input type="date" value={fromF} onChange={e => setFromF(e.target.value)} className="input flex-1 min-w-[130px]" />
          <span className="text-xs text-gray-400">to</span>
          <input type="date" value={toF} onChange={e => setToF(e.target.value)} className="input flex-1 min-w-[130px]" />
          <button onClick={() => { setFromF(''); setToF('') }} className="px-4 py-2.5 rounded-card border border-gray-300 text-sm hover:bg-gray-50">Clear dates</button>
        </div>
      </div>

      {hasActiveFilter && (
        <div className="bg-white border border-gray-200 rounded-cardLg shadow-card px-4 py-2.5 flex items-center flex-wrap gap-3.5 text-[13px] text-gray-600">
          <span className="font-semibold text-gray-900">{filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}</span>
          {incTotal > 0 && <span>Income <strong className="text-green">{money(incTotal)}</strong></span>}
          {spentTotal > 0 && <span>Spent <strong className="text-red">{money(spentTotal)}</strong></span>}
          {transferTotal > 0 && <span>Transferred <strong className="text-blue">{money(transferTotal)}</strong></span>}
          {incTotal > 0 && spentTotal > 0 && (
            <span>Net <strong className={net < 0 ? 'text-red' : ''}>{net >= 0 ? '+' : '−'} {money(net)}</strong></span>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {filtered.length === 0 ? (
          <EmptyState icon="📭" text="No entries match this filter." />
        ) : visible.map(r => {
          const isTransfer = r.type === 'transfer'
          const isRemit = r.type === 'remittance'
          const cats = r.type === 'income' ? incomeCats : r.type === 'expense' ? expenseCats : {}
          const catMeta = cats[r.category] || {}
          const icon = isTransfer ? '↔' : isRemit ? '🌍' : catMeta.icon || '•'
          const label = isTransfer
            ? `Transfer: ${r.account} → ${r.to_account}`
            : isRemit
              ? `${r.from_country || '?'} → ${r.to_country || '?'}${r.recipient ? ' · ' + r.recipient : ''}`
              : catMeta.label || r.category
          const sign = (r.type === 'expense' || isRemit) ? '− ' : '+ '
          const amtClass = isTransfer ? 'text-blue' : isRemit ? 'text-nepal' : r.type === 'income' ? 'text-green' : 'text-red'
          const dateStr = new Date(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          const entryLabel = r.source || label
          const showsOriginal = r.currency && r.currency !== displayCurrency

          return (
            <div key={r.id} className="bg-white border border-gray-200 rounded-cardLg shadow-card px-4 py-3.5 flex items-center gap-3 hover:shadow-cardMd transition-shadow">
              <div className={`w-[34px] h-[34px] rounded-lg grid place-items-center text-base shrink-0 ${
                r.type === 'income' ? 'bg-green-light' : r.type === 'expense' ? 'bg-red-light' : r.type === 'transfer' ? 'bg-blue-light' : 'bg-nepal-light'
              }`}>{icon}</div>
              <button
                onClick={() => onEdit(r)}
                className="flex-1 min-w-0 text-left group"
              >
                <div className="text-sm font-medium group-hover:text-blue group-hover:underline truncate">{entryLabel}</div>
                <div className="text-xs text-gray-400 truncate">{label} · {dateStr}{r.note ? ' · ' + r.note : ''}</div>
              </button>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <div className="flex items-center gap-2.5">
                  <span className={`text-[15px] font-bold ${amtClass}`}>{sign}{money(inDisplay(r))}</span>
                  {/* Account is secondary detail — on a narrow phone it
                      competes with the entry description for space, so it
                      only shows once the row can afford it. */}
                  <span className={`hidden sm:inline text-[11px] px-2 py-0.5 rounded-full font-medium ${r.account === 'digital' ? 'bg-blue-light text-blue' : 'bg-green-light text-green'}`}>{r.account}</span>
                  {/* Destructive action — needs a target big enough to hit
                      deliberately, and not so tight against the edit area
                      that it gets tapped by accident. */}
                  <button
                    onClick={() => handleDelete(r.id)}
                    title="Delete"
                    aria-label="Delete entry"
                    className="w-8 h-8 grid place-items-center shrink-0 text-gray-400 hover:text-red hover:bg-red-light active:bg-red-light rounded-md transition-colors"
                  >
                    ✕
                  </button>
                </div>
                {showsOriginal && (
                  <span className="text-[10px] text-gray-400">orig. {fmtIn(r.amount, r.currency)}</span>
                )}
              </div>
            </div>
          )
        })}
        {shouldLimit && (
          <button onClick={() => setShowAll(true)} className="self-center mt-1.5 px-5 py-2 rounded-card border border-gray-300 text-sm hover:bg-gray-50">
            Show all {filtered.length} entries
          </button>
        )}
        {showAll && !hasActiveFilter && filtered.length > PREVIEW_LIMIT && (
          <button onClick={() => setShowAll(false)} className="self-center mt-1.5 px-5 py-2 rounded-card border border-gray-300 text-sm hover:bg-gray-50">
            Show less
          </button>
        )}
      </div>

      {/* Opening balances */}
      <div className="mt-6 bg-white border border-dashed border-gray-300 rounded-cardLg p-5 text-center">
        <div className="text-[13px] font-semibold text-gray-600 uppercase tracking-wide mb-3">Opening Balances</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-[420px] mx-auto mb-3 text-left">
          <div>
            <label className="block text-[13px] font-medium text-gray-600 mb-1">💳 Digital account</label>
            <input value={ob.digital} onChange={e => setOb(o => ({ ...o, digital: e.target.value }))} className="input" placeholder="e.g. 0" />
          </div>
          <div>
            <label className="block text-[13px] font-medium text-gray-600 mb-1">💵 Cash account</label>
            <input value={ob.cash} onChange={e => setOb(o => ({ ...o, cash: e.target.value }))} className="input" placeholder="e.g. 0" />
          </div>
        </div>
        <div className="max-w-[420px] mx-auto mb-3 text-left">
          <label className="block text-[13px] font-medium text-gray-600 mb-1">Currency these were entered in</label>
          <select value={ob.currency} onChange={e => setOb(o => ({ ...o, currency: e.target.value }))} className="input">
            {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code} — {c.label}</option>)}
          </select>
        </div>
        <p className="text-[11px] text-gray-400 mb-3">Set what you already had in each account before you started tracking — this gets added into every balance calculation, converted to {displayCurrency}.</p>
        <button onClick={handleSaveOpening} className="px-5 py-2.5 rounded-card bg-blue text-white text-sm font-medium">Save opening balances</button>
      </div>

      {/* Backup / restore — deliberately understated, utility rather than
          a feature most people need. Delete the restore link once the old
          backup has been imported. */}
      <div className="mt-6 pt-4 border-t border-gray-200 text-center">
        <div className="flex gap-4 justify-center flex-wrap items-center">
          <button onClick={exportJSON} className="text-[11px] text-gray-400 underline hover:text-gray-600">
            export JSON
          </button>
          <button onClick={exportCSV} className="text-[11px] text-gray-400 underline hover:text-gray-600">
            export CSV
          </button>
          <label className={`text-[11px] underline ${importing ? 'text-gray-300' : 'text-gray-400 hover:text-gray-600 cursor-pointer'}`}>
            {importing ? `restoring… ${importProgress} processed` : 'restore from backup'}
            <input
              type="file"
              accept="application/json,.json"
              onChange={handleImportFile}
              disabled={importing}
              className="hidden"
            />
          </label>
        </div>
      </div>
    </div>
  )
}

function downloadBlob(content, type, filename) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function EmptyState({ icon, text }) {
  return (
    <div className="text-center py-12 text-gray-400">
      <div className="text-4xl mb-2">{icon}</div>
      <p className="text-sm">{text}</p>
    </div>
  )
}