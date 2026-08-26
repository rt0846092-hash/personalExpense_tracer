import React, { useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useTracker } from '../context/TrackerContext.jsx'
import { useCurrency } from '../context/CurrencyContext.jsx'
import { PERIODS } from '../utils/constants'
import {
  fmt, recordAmountInDisplay, accountBalance, accountInOut, inPeriod, buildChartData,
  getIncomeCats, getExpenseCats,
} from '../utils/helpers'

export default function Dashboard({ onSeeRemittance }) {
  const { records, customCats, openingBalances } = useTracker()
  const { displayCurrency, rates, ratesError, loading: ratesLoading } = useCurrency()
  const [period, setPeriod] = useState('1m')
  const [customRange, setCustomRange] = useState({ from: '', to: '' })
  const [showCustomBar, setShowCustomBar] = useState(false)
  const [catType, setCatType] = useState('income')

  const money = (n) => fmt(n, displayCurrency)
  const inDisplay = (r) => recordAmountInDisplay(r, displayCurrency, rates)

  const dBal = accountBalance(records, openingBalances, 'digital', null, displayCurrency, rates)
  const cBal = accountBalance(records, openingBalances, 'cash', null, displayCurrency, rates)
  const dStats = accountInOut(records, 'digital', displayCurrency, rates)
  const cStats = accountInOut(records, 'cash', displayCurrency, rates)

  const allInc = records.filter(r => r.type === 'income').reduce((s, r) => s + inDisplay(r), 0)
  const allExp = records.filter(r => r.type === 'expense').reduce((s, r) => s + inDisplay(r), 0)
  const allRemit = records.filter(r => r.type === 'remittance').reduce((s, r) => s + inDisplay(r), 0)
  const allNet = allInc - allExp - allRemit
  const totalBal = dBal + cBal

  const effectiveRange = period === 'custom' ? customRange : null
  const pRecs = useMemo(
    () => records.filter(r => inPeriod(r.date, period, effectiveRange)),
    [records, period, effectiveRange]
  )
  const pInc = pRecs.filter(r => r.type === 'income').reduce((s, r) => s + inDisplay(r), 0)
  const pExp = pRecs.filter(r => r.type === 'expense').reduce((s, r) => s + inDisplay(r), 0)
  const pRemit = pRecs.filter(r => r.type === 'remittance').reduce((s, r) => s + inDisplay(r), 0)
  const pNet = pInc - pExp - pRemit

  const chartData = useMemo(
    () => buildChartData(records, period, effectiveRange, displayCurrency, rates),
    [records, period, effectiveRange, displayCurrency, rates]
  )

  const periodLabel = period === 'custom'
    ? (customRange.from && customRange.to
        ? `${new Date(customRange.from).toLocaleDateString('en-US',{month:'short',day:'numeric'})} – ${new Date(customRange.to).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}`
        : 'Custom range')
    : (PERIODS.find(p => p.key === period)?.label || '')

  const cats = catType === 'income' ? getIncomeCats(customCats) : getExpenseCats(customCats)
  const totals = {}
  pRecs.filter(r => r.type === catType).forEach(r => {
    totals[r.category] = (totals[r.category] || 0) + inDisplay(r)
  })
  const grandTotal = Object.values(totals).reduce((s, v) => s + v, 0)
  const grand = grandTotal || 1
  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1])

  // ---- Remittance summary widget (kept small / secondary, per destination) ----
  const remittances = records.filter(r => r.type === 'remittance')
  const byDestination = {}
  remittances.forEach(r => {
    const key = r.to_country || 'Unspecified'
    byDestination[key] = (byDestination[key] || 0) + inDisplay(r)
  })
  const topDestinations = Object.entries(byDestination).sort((a, b) => b[1] - a[1]).slice(0, 3)

  return (
    <div className="space-y-5">
      {ratesError && (
        <div className="rounded-card border border-amber bg-amber-light text-amber px-4 py-2 text-xs">
          {ratesError}
        </div>
      )}

      {/* Period bar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-sm font-semibold text-gray-500">
          Showing: <span className="text-gray-900">{periodLabel}</span>
        </span>
        <div className="flex gap-1 bg-white border border-gray-200 rounded-card p-1 flex-wrap">
          {PERIODS.map(p => (
            <button
              key={p.key}
              onClick={() => { setPeriod(p.key); setShowCustomBar(false) }}
              className={`px-3 py-2 sm:py-1 rounded-lg text-xs font-medium transition-colors ${period === p.key ? 'bg-blue text-white' : 'text-gray-500 hover:bg-gray-50 active:bg-gray-100'}`}
            >
              {p.label}
            </button>
          ))}
          <button
            onClick={() => setShowCustomBar(s => !s)}
            className={`px-3 py-2 sm:py-1 rounded-lg text-xs font-medium transition-colors ${period === 'custom' ? 'bg-blue text-white' : 'text-gray-500 hover:bg-gray-50 active:bg-gray-100'}`}
          >
            Custom
          </button>
        </div>
      </div>

      {showCustomBar && (
        <div className="flex items-center gap-2 flex-wrap bg-white border border-gray-200 rounded-card px-3.5 py-2.5">
          <input type="date" value={customRange.from} onChange={e => setCustomRange(r => ({ ...r, from: e.target.value }))}
            className="flex-1 min-w-[130px] border border-gray-300 rounded-card px-3 py-2 text-sm" />
          <span className="text-xs text-gray-400">to</span>
          <input type="date" value={customRange.to} onChange={e => setCustomRange(r => ({ ...r, to: e.target.value }))}
            className="flex-1 min-w-[130px] border border-gray-300 rounded-card px-3 py-2 text-sm" />
          <button
            onClick={() => { if (customRange.from && customRange.to) setPeriod('custom') }}
            className="bg-blue text-white px-5 py-2 rounded-card text-sm font-medium"
          >
            Apply
          </button>
        </div>
      )}

      {/* Totals strip */}
      <div className="bg-white border border-gray-200 rounded-cardLg shadow-card px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          All-time total {ratesLoading && <span className="normal-case font-normal">(loading rates…)</span>}
        </span>
        {/* Four items in a wrapping flex row broke into ragged lines on a
            phone — a 2×2 grid keeps them aligned and predictable. */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:flex sm:gap-8">
          <TotalItem label="Income" value={money(allInc)} className="text-green" />
          <TotalItem label="Expense" value={money(allExp)} className="text-red" />
          <TotalItem label="Net" value={`${allNet >= 0 ? '+' : '−'} ${money(allNet)}`} className={allNet < 0 ? 'text-red' : 'text-gray-900'} />
          <TotalItem label="Total balance" value={money(totalBal)} className={totalBal < 0 ? 'text-red' : 'text-blue'} />
        </div>
      </div>

      {/* Accounts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <AccountCard label="💳 Digital account" balance={dBal} stats={dStats} accentClass="border-t-blue" money={money} />
        <AccountCard label="💵 Cash account" balance={cBal} stats={cStats} accentClass="border-t-green" money={money} />
      </div>

      {/* Period summary strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StripCard label={`${periodLabel} — income`} value={money(pInc)} className="text-green" />
        <StripCard label={`${periodLabel} — expense`} value={money(pExp)} className="text-red" />
        <StripCard label={`${periodLabel} — net`} value={`${pNet >= 0 ? '+' : '−'} ${money(pNet)}`} className={pNet < 0 ? 'text-red' : 'text-gray-900'} />
      </div>

      {/* Chart */}
      <div className="bg-white border border-gray-200 rounded-cardLg shadow-card p-4 sm:p-5">
        <div className="text-sm font-semibold mb-3">{periodLabel}</div>
        <div className="flex gap-4 mb-2 text-xs text-gray-500">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-blue-mid inline-block" /> Income</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: '#fca5a5' }} /> Expense</span>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} barGap={2}>
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
            <Tooltip formatter={(v) => money(v)} />
            <Bar dataKey="Income" fill="#bfdbfe" radius={[3, 3, 0, 0]} />
            <Bar dataKey="Expense" fill="#fca5a5" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Category breakdown */}
      <div className="bg-white border border-gray-200 rounded-cardLg shadow-card p-4 sm:p-5">
        <div className="flex gap-1.5 mb-4 flex-wrap">
          {['income', 'expense'].map(t => (
            <button
              key={t}
              onClick={() => setCatType(t)}
              className={`border rounded-lg px-3 py-1 text-xs ${catType === t ? 'bg-blue-light border-blue-mid text-blue font-medium' : 'border-gray-200 text-gray-500'}`}
            >
              By {t} category
            </button>
          ))}
        </div>
        {sorted.length === 0 ? (
          <p className="text-sm text-gray-400">No entries for this period.</p>
        ) : (
          <div className="space-y-2.5">
            {sorted.map(([cat, val]) => {
              const meta = cats[cat] || { label: cat, color: '#6b7280' }
              const pct = ((val / grand) * 100).toFixed(0)
              return (
                <div key={cat} className="flex items-center gap-2.5">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: meta.color }} />
                  <span className="text-sm flex-1 truncate">{meta.label}</span>
                  {/* The bar is decoration; on a narrow phone it steals the
                      room the label actually needs, so it only appears
                      once there's space for it. */}
                  <div className="hidden sm:block flex-[2] h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: meta.color }} />
                  </div>
                  <span className="text-sm font-medium text-right whitespace-nowrap shrink-0">{money(val)}</span>
                </div>
              )
            })}
            <div className="flex items-center gap-2.5 pt-2.5 mt-1 border-t border-gray-200 font-bold">
              <div className="w-2.5 h-2.5" />
              <span className="text-sm flex-1">Total</span>
              <div className="hidden sm:block flex-[2]" />
              <span className="text-sm text-right whitespace-nowrap shrink-0">{money(grandTotal)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Remittance summary — small, secondary widget */}
      {remittances.length > 0 && (
        <button
          onClick={onSeeRemittance}
          className="w-full text-left bg-nepal-light border border-blue-mid rounded-cardLg px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-blue-light transition-colors"
        >
          <div>
            <div className="text-xs font-semibold text-blue uppercase tracking-wide mb-0.5">Sent abroad · all-time</div>
            <div className="text-sm text-gray-600">
              {topDestinations.map(([country, amt], i) => (
                <span key={country}>
                  {i > 0 && ' · '}
                  <strong className="text-gray-900">{country}</strong>: {money(amt)}
                </span>
              ))}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-lg font-bold text-blue">{money(allRemit)}</div>
            <div className="text-[11px] text-gray-400">view remittance →</div>
          </div>
        </button>
      )}
    </div>
  )
}

function TotalItem({ label, value, className }) {
  return (
    <div className="text-center">
      <div className="text-[11px] text-gray-400">{label}</div>
      <div className={`text-[17px] font-bold ${className}`}>{value}</div>
    </div>
  )
}

function StripCard({ label, value, className }) {
  return (
    <div className="bg-white border border-gray-200 rounded-cardLg shadow-card px-5 py-4">
      <div className="text-xs text-gray-400 mb-0.5">{label}</div>
      <div className={`text-xl font-bold ${className}`}>{value}</div>
    </div>
  )
}

function AccountCard({ label, balance, stats, accentClass, money }) {
  return (
    <div className={`bg-white border border-gray-200 border-t-4 ${accentClass} rounded-cardLg shadow-card px-4 sm:px-6 py-5`}>
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">{label}</div>
      <div className={`text-[26px] font-bold tracking-tight ${balance < 0 ? 'text-red' : 'text-gray-900'}`}>{money(balance)}</div>
      <div className="flex gap-3.5 mt-2.5 flex-wrap text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green inline-block" /> In: <strong>{money(stats.inAmt)}</strong></span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red inline-block" /> Out: <strong>{money(stats.outAmt)}</strong></span>
      </div>
    </div>
  )
}