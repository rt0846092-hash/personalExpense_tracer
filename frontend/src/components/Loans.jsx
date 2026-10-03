import React, { useState } from 'react'
import { useTracker } from '../context/TrackerContext.jsx'
import { useCurrency } from '../context/CurrencyContext.jsx'
import { CURRENCIES } from '../utils/constants'
import { fmt, fmtIn, convert, parseAmount, today } from '../utils/helpers'
import * as api from '../api'

/* Turn a DRF error response into one readable sentence */
const errorText = (e) => {
  const data = e?.response?.data
  if (!data) return 'Something went wrong. Please try again.'
  if (typeof data === 'string') return data
  if (data.detail) return data.detail
  const first = Object.values(data)[0]
  return Array.isArray(first) ? first[0] : String(first)
}

const dateLabel = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

function LoanForm({ onSaved, onCancel, defaultCurrency }) {
  const { loanAction, showToast } = useTracker()
  const [form, setForm] = useState({
    direction: 'borrowed', person: '', amount: '', currency: defaultCurrency,
    account: 'cash', date: today(), due_date: '', note: '',
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    const amount = parseAmount(form.amount)
    if (!(amount > 0)) { setError('Enter an amount greater than 0.'); return }
    setBusy(true); setError('')
    try {
      await loanAction(() => api.createLoan({ ...form, amount, due_date: form.due_date || null }))
      showToast(form.direction === 'borrowed' ? 'Borrowed money saved' : 'Lent money saved')
      onSaved()
    } catch (err) {
      setError(errorText(err)); setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="bg-white border border-gray-200 rounded-cardLg shadow-card p-4 space-y-3">
      <div className="flex gap-2" role="radiogroup" aria-label="Borrowed or lent">
        {[['borrowed', '⬇ I borrowed'], ['lent', '⬆ I lent']].map(([v, l]) => (
          <button key={v} type="button" role="radio" aria-checked={form.direction === v} onClick={() => setForm({ ...form, direction: v })}
            className={`flex-1 border rounded-card py-2 text-sm font-medium ${form.direction === v ? 'bg-blue-light border-blue-mid text-blue' : 'border-gray-200 text-gray-500'}`}>
            {l}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="text-sm">{form.direction === 'borrowed' ? 'Borrowed from' : 'Lent to'}
          <input className="input mt-1" required maxLength={100} placeholder="Name" value={form.person} onChange={set('person')} />
        </label>
        <label className="text-sm">Amount
          <div className="flex gap-2 mt-1">
            <input className="input flex-1" required inputMode="decimal" placeholder="5000" value={form.amount} onChange={set('amount')} />
            <select className="input w-24" value={form.currency} onChange={set('currency')} aria-label="Currency">
              {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
            </select>
          </div>
        </label>
        <label className="text-sm">{form.direction === 'borrowed' ? 'Money went into' : 'Money came from'}
          <select className="input mt-1" value={form.account} onChange={set('account')}>
            <option value="cash">Cash</option>
            <option value="digital">Digital</option>
          </select>
        </label>
        <label className="text-sm">Date
          <input className="input mt-1" type="date" required value={form.date} onChange={set('date')} />
        </label>
        <label className="text-sm">Pay back by <span className="text-gray-400">(optional)</span>
          <input className="input mt-1" type="date" min={form.date} value={form.due_date} onChange={set('due_date')} />
        </label>
        <label className="text-sm">Note <span className="text-gray-400">(optional)</span>
          <input className="input mt-1" maxLength={255} placeholder="For rent, books…" value={form.note} onChange={set('note')} />
        </label>
      </div>
      {error && <p className="text-sm text-red" role="alert">{error}</p>}
      <div className="flex gap-2">
        <button disabled={busy} className="bg-blue text-white rounded-card px-4 py-2 text-sm font-medium disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button>
        <button type="button" onClick={onCancel} className="border border-gray-300 rounded-card px-4 py-2 text-sm">Cancel</button>
      </div>
    </form>
  )
}

function PaymentForm({ loan, onDone }) {
  const { loanAction, showToast } = useTracker()
  const [form, setForm] = useState({ amount: String(loan.remaining), account: loan.account, date: today(), note: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    const amount = parseAmount(form.amount)
    if (!(amount > 0)) { setError('Enter an amount greater than 0.'); return }
    setBusy(true); setError('')
    try {
      await loanAction(() => api.addLoanPayment(loan.id, { ...form, amount }))
      showToast('Payment saved')
      onDone()
    } catch (err) {
      setError(errorText(err)); setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
      <label className="text-xs text-gray-500">Amount ({loan.currency})
        <input className="input mt-1" required inputMode="decimal" value={form.amount} onChange={set('amount')} />
      </label>
      <label className="text-xs text-gray-500">{loan.direction === 'borrowed' ? 'Paid from' : 'Received in'}
        <select className="input mt-1" value={form.account} onChange={set('account')}>
          <option value="cash">Cash</option><option value="digital">Digital</option>
        </select>
      </label>
      <label className="text-xs text-gray-500">Date
        <input className="input mt-1" type="date" required min={loan.date} value={form.date} onChange={set('date')} />
      </label>
      <div className="flex gap-2">
        <button disabled={busy} className="flex-1 bg-blue text-white rounded-card px-3 py-2 text-sm disabled:opacity-50">{busy ? '…' : 'Save'}</button>
        <button type="button" onClick={onDone} className="border border-gray-300 rounded-card px-3 py-2 text-sm" aria-label="Cancel">✕</button>
      </div>
      {error && <p className="col-span-full text-sm text-red" role="alert">{error}</p>}
    </form>
  )
}

function LoanCard({ loan }) {
  const { loanAction, showToast } = useTracker()
  const [paying, setPaying] = useState(false)
  const [open, setOpen] = useState(false)
  const borrowed = loan.direction === 'borrowed'
  const pct = Math.min(100, (Number(loan.paid) / Number(loan.amount)) * 100)
  const money = (n) => fmtIn(n, loan.currency)

  const removeLoan = async () => {
    if (!window.confirm(`Delete this loan with ${loan.person}? Its history entries and payments are deleted too.`)) return
    await loanAction(() => api.deleteLoan(loan.id)); showToast('Loan deleted')
  }
  const removePayment = async (p) => {
    if (!window.confirm(`Delete the ${money(p.amount)} payment from ${dateLabel(p.date)}?`)) return
    await loanAction(() => api.deleteLoanPayment(loan.id, p.id)); showToast('Payment deleted')
  }

  return (
    <div className={`bg-white border rounded-cardLg shadow-card p-4 ${loan.status === 'overdue' ? 'border-red' : 'border-gray-200'}`}>
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-lg grid place-items-center shrink-0 ${borrowed ? 'bg-red-light' : 'bg-green-light'}`}>{borrowed ? '⬇' : '⬆'}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold">{loan.person}</span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{borrowed ? 'I borrowed' : 'I lent'}</span>
            {loan.status === 'paid' && <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-light text-green font-medium">Paid ✓</span>}
            {loan.status === 'overdue' && <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-light text-red font-medium">Overdue</span>}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">
            {dateLabel(loan.date)} · {loan.account}{loan.due_date ? ` · pay back by ${dateLabel(loan.due_date)}` : ''}{loan.note ? ` · ${loan.note}` : ''}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-xs text-gray-400">{loan.status === 'paid' ? 'Total' : borrowed ? 'Left to pay' : 'Left to get back'}</div>
          <div className={`font-bold ${loan.status === 'paid' ? 'text-gray-500' : borrowed ? 'text-red' : 'text-green'}`}>
            {money(loan.status === 'paid' ? loan.amount : loan.remaining)}
          </div>
        </div>
      </div>

      <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}
        aria-label={`${Math.round(pct)}% paid back`}>
        <div className="h-full bg-green rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center justify-between mt-1.5 text-xs text-gray-500">
        <span>{money(loan.paid)} of {money(loan.amount)} {borrowed ? 'paid back' : 'received back'}</span>
        <div className="flex gap-3">
          {loan.payments.length > 0 && <button onClick={() => setOpen(o => !o)} className="hover:text-blue">{open ? 'Hide' : 'Show'} payments ({loan.payments.length})</button>}
          {loan.status !== 'paid' && !paying && <button onClick={() => setPaying(true)} className="text-blue font-medium">+ Add payment</button>}
          <button onClick={removeLoan} className="hover:text-red">Delete</button>
        </div>
      </div>

      {open && (
        <ul className="mt-2 space-y-1">
          {loan.payments.map(p => (
            <li key={p.id} className="flex items-center gap-2 text-xs bg-gray-50 rounded-lg px-3 py-1.5">
              <span className="flex-1">{dateLabel(p.date)} · {p.account}{p.note ? ` · ${p.note}` : ''}</span>
              <span className="font-medium">{money(p.amount)}</span>
              <button onClick={() => removePayment(p)} className="text-gray-400 hover:text-red px-1" aria-label="Delete payment">✕</button>
            </li>
          ))}
        </ul>
      )}
      {paying && <PaymentForm loan={loan} onDone={() => setPaying(false)} />}
    </div>
  )
}

export default function Loans() {
  const { loans } = useTracker()
  const { displayCurrency, rates } = useCurrency()
  const [adding, setAdding] = useState(false)
  const [filter, setFilter] = useState('open')

  const left = (direction) => loans
    .filter(l => l.direction === direction && l.status !== 'paid')
    .reduce((s, l) => s + convert(l.remaining, l.currency, displayCurrency, rates), 0)
  const shown = loans.filter(l => (filter === 'all' ? true : filter === 'paid' ? l.status === 'paid' : l.status !== 'paid'))
  const overdue = loans.filter(l => l.status === 'overdue').length

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white border border-gray-200 rounded-cardLg shadow-card px-4 py-3">
          <div className="text-xs text-gray-400">You owe</div>
          <div className="text-xl font-bold text-red">{fmt(left('borrowed'), displayCurrency)}</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-cardLg shadow-card px-4 py-3">
          <div className="text-xs text-gray-400">Others owe you</div>
          <div className="text-xl font-bold text-green">{fmt(left('lent'), displayCurrency)}</div>
        </div>
      </div>
      {overdue > 0 && (
        <div className="rounded-card border border-red bg-red-light text-red px-4 py-2.5 text-sm" role="alert">
          {overdue} loan{overdue > 1 ? 's are' : ' is'} past the pay-back date.
        </div>
      )}

      {adding
        ? <LoanForm defaultCurrency={displayCurrency} onSaved={() => setAdding(false)} onCancel={() => setAdding(false)} />
        : <button onClick={() => setAdding(true)} className="w-full border-2 border-dashed border-gray-300 rounded-cardLg py-3 text-sm font-medium text-gray-600 hover:border-blue hover:text-blue">+ Add borrowed or lent money</button>}

      <div className="flex gap-2">
        {[['open', 'Not paid yet'], ['paid', 'Paid'], ['all', 'All']].map(([v, l]) => (
          <button key={v} onClick={() => setFilter(v)}
            className={`border rounded-lg px-3 py-1 text-xs ${filter === v ? 'bg-blue-light border-blue-mid text-blue font-medium' : 'border-gray-200 text-gray-500'}`}>{l}</button>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        {shown.length === 0
          ? <p className="text-sm text-gray-400 text-center py-10">{loans.length === 0 ? 'No borrowed or lent money yet.' : 'Nothing here.'}</p>
          : shown.map(l => <LoanCard key={l.id} loan={l} />)}
      </div>
    </div>
  )
}
