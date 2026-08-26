import React, { useEffect, useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useTracker } from '../context/TrackerContext.jsx'
import { useCurrency } from '../context/CurrencyContext.jsx'
import { CURRENCIES } from '../utils/constants'
import {
  fmt, fmtIn, parseAmount, convert, today,
  accountBalance, recordAmountInDisplay, buildRemittanceChartData,
} from '../utils/helpers'

function emptyForm(displayCurrency) {
  return {
    from_country: '',
    to_country: '',
    sent_amount: '',
    sent_currency: displayCurrency || 'NPR',
    amount: '',       // amount actually received on the other end
    currency: displayCurrency || 'NPR',
    date: today(),
    account: 'digital',
    recipient: '',
    note: '',
  }
}

export default function Remittance({ editingRecord, onEditHandled }) {
  const { records, openingBalances, addRecord, editRecord, removeRecord, showToast } = useTracker()
  const { displayCurrency, rates } = useCurrency()
  const [form, setForm] = useState(() => emptyForm(displayCurrency))
  const [editingId, setEditingId] = useState(null)

  const money = (n) => fmt(n, displayCurrency)

  const remits = useMemo(() => records.filter(r => r.type === 'remittance'), [records])
  const total = remits.reduce((s, r) => s + recordAmountInDisplay(r, displayCurrency, rates), 0)
  const now = new Date()
  const thisMonth = remits.filter(r => {
    const d = new Date(r.date)
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  }).reduce((s, r) => s + recordAmountInDisplay(r, displayCurrency, rates), 0)

  const chartData = useMemo(
    () => buildRemittanceChartData(records, displayCurrency, rates),
    [records, displayCurrency, rates]
  )

  // Gap between what was sent and what arrived, in the *received* currency —
  // this is the transfer fee / exchange-rate spread eaten along the way.
  const gap = (() => {
    const sent = parseAmount(form.sent_amount)
    const received = parseAmount(form.amount)
    if (isNaN(sent) || sent <= 0 || isNaN(received) || received <= 0) return null
    const sentInReceivedCcy = convert(sent, form.sent_currency, form.currency, rates)
    return sentInReceivedCcy - received
  })()

  const startEdit = (r) => {
    setEditingId(r.id)
    setForm({
      from_country: r.from_country || '',
      to_country: r.to_country || '',
      sent_amount: r.sent_amount ?? '',
      sent_currency: r.sent_currency || displayCurrency,
      amount: r.amount,
      currency: r.currency || 'NPR',
      date: r.date,
      account: r.account,
      recipient: r.recipient || '',
      note: r.note || '',
    })
  }

  const resetForm = () => {
    setEditingId(null)
    setForm(emptyForm(displayCurrency))
  }

  // Arriving here from History's edit button: load that record into the
  // form, then hand the flag back so it doesn't re-trigger on every render.
  useEffect(() => {
    if (editingRecord && editingRecord.type === 'remittance') {
      startEdit(editingRecord)
      onEditHandled?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingRecord])

  const handleSubmit = async (e) => {
    e.preventDefault()
    const amount = parseAmount(form.amount)
    const sentAmount = parseAmount(form.sent_amount)
    if (isNaN(amount) || amount <= 0) { showToast('Enter a valid received amount'); return }
    if (isNaN(sentAmount) || sentAmount <= 0) { showToast('Enter a valid sent amount'); return }
    if (!form.date) return
    if (!form.from_country.trim() || !form.to_country.trim()) { showToast('Enter both countries'); return }

    const excludeId = editingId
    const fromBal = accountBalance(records, openingBalances, form.account, excludeId, displayCurrency, rates)
    const sentInDisplay = convert(sentAmount, form.sent_currency, displayCurrency, rates)
    if (sentInDisplay > fromBal) {
      showToast(`Not enough balance in ${form.account} (${money(fromBal)})`)
      return
    }

    const payload = {
      type: 'remittance',
      account: form.account,
      to_account: null,
      category: '',
      amount,
      currency: form.currency,
      sent_amount: sentAmount,
      sent_currency: form.sent_currency,
      from_country: form.from_country.trim(),
      to_country: form.to_country.trim(),
      date: form.date,
      recipient: form.recipient.trim(),
      note: form.note.trim(),
    }

    try {
      if (editingId) {
        await editRecord(editingId, payload)
        showToast('Transfer updated ✓')
      } else {
        await addRecord(payload)
        showToast('Remittance saved ✓')
      }
      resetForm()
    } catch (err) {
      showToast('Could not save this transfer.')
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this remittance?')) return
    if (editingId === id) resetForm()
    await removeRecord(id)
    showToast('Transfer deleted')
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3.5">
        <SummaryCard label="Total sent abroad" value={money(total)} />
        <SummaryCard label="This month" value={money(thisMonth)} />
        <SummaryCard label="Transfers made" value={remits.length} className="col-span-2 md:col-span-1" />
      </div>

      <div className="bg-white border border-gray-200 rounded-cardLg shadow-card p-6">
        <div className="text-lg font-semibold mb-5">{editingId ? 'Edit remittance' : 'Send money abroad'}</div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="From country">
              <input value={form.from_country} onChange={e => setForm(f => ({ ...f, from_country: e.target.value }))}
                placeholder="e.g. South Korea" required className="input" />
            </Field>
            <Field label="To country">
              <input value={form.to_country} onChange={e => setForm(f => ({ ...f, to_country: e.target.value }))}
                placeholder="e.g. Nepal" required className="input" />
            </Field>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Amount sent">
              <div className="flex gap-2">
                <input value={form.sent_amount} onChange={e => setForm(f => ({ ...f, sent_amount: e.target.value }))}
                  placeholder="e.g. 500000, 500k" inputMode="numeric" required className="input flex-1" />
                <select value={form.sent_currency} onChange={e => setForm(f => ({ ...f, sent_currency: e.target.value }))} className="input w-[90px] shrink-0">
                  {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
                </select>
              </div>
              <SuffixRow value={form.sent_amount} onChange={v => setForm(f => ({ ...f, sent_amount: v }))} suffixes={['k', 'm']} />
            </Field>
            <Field label="Amount received">
              <div className="flex gap-2">
                <input value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  placeholder="e.g. 10000, 10k" inputMode="numeric" required className="input flex-1" />
                <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} className="input w-[90px] shrink-0">
                  {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
                </select>
              </div>
              <SuffixRow value={form.amount} onChange={v => setForm(f => ({ ...f, amount: v }))} suffixes={['k', 'l', 'm']} />
            </Field>
          </div>

          {gap !== null && (
            <div className="text-[12px] text-gray-500 bg-gray-50 border border-gray-200 rounded-card px-3 py-2">
              Sent {fmtIn(form.sent_amount, form.sent_currency)} → received {fmtIn(form.amount, form.currency)}.{' '}
              {Math.abs(gap) < 0.01 ? 'No fee/spread detected.' : (
                <>Gap (fee / exchange spread): <strong className={gap > 0 ? 'text-red' : 'text-green'}>{fmtIn(Math.abs(gap), form.currency)}</strong> {gap > 0 ? 'lost in transfer' : 'better than expected'}.</>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Date">
              <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required className="input" />
            </Field>
            <Field label="From account">
              <select value={form.account} onChange={e => setForm(f => ({ ...f, account: e.target.value }))} className="input">
                <option value="digital">💳 Digital</option>
                <option value="cash">💵 Cash</option>
              </select>
            </Field>
          </div>

          <Field label={<>Recipient <span className="font-normal text-gray-400">(optional)</span></>}>
            <input value={form.recipient} onChange={e => setForm(f => ({ ...f, recipient: e.target.value }))} placeholder="e.g. Mother, Father" className="input" />
          </Field>

          <Field label={<>Note <span className="font-normal text-gray-400">(optional)</span></>}>
            <textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Any extra detail…" className="input min-h-[72px] resize-y" />
          </Field>

          <div className="flex gap-2.5 pt-1">
            <button type="submit" className={`px-5 py-2.5 rounded-card text-sm font-medium text-white ${editingId ? 'bg-amber' : 'bg-nepal'}`}>
              {editingId ? 'Update transfer' : 'Save transfer'}
            </button>
            <button type="button" onClick={resetForm} className="px-5 py-2.5 rounded-card border border-gray-300 text-sm hover:bg-gray-50">Clear</button>
          </div>
        </form>
      </div>

      <div className="bg-white border border-gray-200 rounded-cardLg shadow-card p-5">
        <div className="text-sm font-semibold mb-3">Last 6 months</div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={chartData}>
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
            <Tooltip formatter={(v) => money(v)} />
            <Bar dataKey="Sent" fill="#93c5fd" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-col gap-2">
        {remits.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <div className="text-4xl mb-2">🌍</div>
            <p className="text-sm">No transfers yet. Add one above.</p>
          </div>
        ) : remits.slice().sort((a, b) => b.date.localeCompare(a.date)).map(r => {
          const dateStr = new Date(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          const route = `${r.from_country || '?'} → ${r.to_country || '?'}`
          const sentLine = r.sent_amount ? `Sent ${fmtIn(r.sent_amount, r.sent_currency)} · ` : ''
          const receivedLine = `Received ${fmtIn(r.amount, r.currency)}`
          const rGap = r.sent_amount
            ? convert(r.sent_amount, r.sent_currency, r.currency, rates) - Number(r.amount)
            : null
          const entryLabel = r.recipient ? `${route} · ${r.recipient}` : route
          return (
            <div key={r.id} className="bg-white border border-gray-200 rounded-cardLg shadow-card px-4 py-3.5 flex items-center gap-3 hover:shadow-cardMd transition-shadow">
              <div className="w-[34px] h-[34px] rounded-lg grid place-items-center text-base shrink-0 bg-nepal-light">🌍</div>
              <button onClick={() => startEdit(r)} className="flex-1 min-w-0 text-left group">
                <div className="text-sm font-medium group-hover:text-blue group-hover:underline truncate">{entryLabel}</div>
                <div className="text-xs text-gray-400 truncate">
                  {sentLine}{receivedLine} · {dateStr}
                  {rGap !== null && Math.abs(rGap) >= 0.01 && ` · fee ${fmtIn(Math.abs(rGap), r.currency)}`}
                  {r.note ? ' · ' + r.note : ''}
                </div>
              </button>
              <div className="flex items-center gap-2.5 shrink-0">
                <span className="text-[15px] font-bold text-nepal">− {money(recordAmountInDisplay(r, displayCurrency, rates))}</span>
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${r.account === 'digital' ? 'bg-blue-light text-blue' : 'bg-green-light text-green'}`}>{r.account}</span>
                <button onClick={() => handleDelete(r.id)} title="Delete" className="text-gray-400 hover:text-red hover:bg-red-light px-1.5 py-1 rounded-md">✕</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SummaryCard({ label, value, className = '' }) {
  return (
    <div className={`bg-white border border-gray-200 border-t-4 border-t-nepal rounded-cardLg shadow-card px-5 py-4 ${className}`}>
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div className="text-xl font-bold">{value}</div>
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

function SuffixRow({ value, onChange, suffixes }) {
  return (
    <div className="flex gap-1.5 mt-1.5">
      {suffixes.map(s => (
        <button key={s} type="button"
          onClick={() => onChange(value.replace(/[kKlLmM]$/, '') + s)}
          className="flex-1 py-1.5 text-xs font-semibold border border-gray-300 rounded-md bg-gray-100 text-gray-600 active:bg-blue active:text-white"
        >{s.toUpperCase()}</button>
      ))}
    </div>
  )
}