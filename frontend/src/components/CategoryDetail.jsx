import React, { useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useTracker } from '../context/TrackerContext.jsx'
import { useCurrency } from '../context/CurrencyContext.jsx'
import { fmt, recordAmountInDisplay, getIncomeCats, getExpenseCats } from '../utils/helpers'

const monthKey = (iso) => iso.slice(0, 7) // 'YYYY-MM'
const monthName = (key, style = 'long') =>
  new Date(`${key}-01T00:00:00`).toLocaleDateString('en-US', { month: style, year: 'numeric' })

/* Everything inside one category: what you spent on, how much, and when. */
export default function CategoryDetail({ category, onBack, onEdit }) {
  const { records, customCats } = useTracker()
  const { displayCurrency, rates } = useCurrency()
  const money = (n) => fmt(n, displayCurrency)
  const inDisplay = (r) => recordAmountInDisplay(r, displayCurrency, rates)

  const cats = category.type === 'income' ? getIncomeCats(customCats) : getExpenseCats(customCats)
  const meta = cats[category.key] || { label: category.key || 'Uncategorized', color: '#9ca3af', icon: '🏷️' }

  const entries = useMemo(
    () => records.filter(r => r.type === category.type && r.category === category.key),
    [records, category]
  )
  const months = useMemo(() => [...new Set(entries.map(r => monthKey(r.date)))].sort().reverse(), [entries])
  const thisMonth = new Date().toISOString().slice(0, 7)
  const [month, setMonth] = useState(months.includes(thisMonth) ? thisMonth : 'all')

  const shown = month === 'all' ? entries : entries.filter(r => monthKey(r.date) === month)
  const total = shown.reduce((s, r) => s + inDisplay(r), 0)
  const biggest = shown.reduce((max, r) => (inDisplay(r) > (max ? inDisplay(max) : -1) ? r : max), null)

  // Last 6 months, oldest first, so you can see if spending is going up or down
  const chart = useMemo(() => {
    const out = []
    const d = new Date(); d.setDate(1)
    for (let i = 5; i >= 0; i--) {
      const m = new Date(d.getFullYear(), d.getMonth() - i, 1)
      const key = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`
      out.push({
        key,
        name: m.toLocaleDateString('en-US', { month: 'short' }),
        total: entries.filter(r => monthKey(r.date) === key).reduce((s, r) => s + inDisplay(r), 0),
      })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, displayCurrency, rates])

  const spentWord = category.type === 'income' ? 'Earned' : 'Spent'

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-sm text-gray-500 hover:text-blue">← Back to dashboard</button>

      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl grid place-items-center text-xl" style={{ background: `${meta.color}22` }}>{meta.icon}</div>
        <div>
          <h1 className="text-xl font-bold">{meta.label}</h1>
          <p className="text-xs text-gray-400 capitalize">{category.type} category · {entries.length} entries in total</p>
        </div>
        <select className="input ml-auto w-auto" value={month} onChange={e => setMonth(e.target.value)} aria-label="Choose month">
          <option value="all">All time</option>
          {months.map(m => <option key={m} value={m}>{monthName(m)}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          [`${spentWord} ${month === 'all' ? 'in total' : 'in ' + monthName(month, 'short')}`, money(total)],
          ['Entries', shown.length],
          ['Average per entry', shown.length ? money(total / shown.length) : '—'],
        ].map(([label, value]) => (
          <div key={label} className="bg-white border border-gray-200 rounded-cardLg shadow-card px-4 py-3">
            <div className="text-xs text-gray-400">{label}</div>
            <div className="text-lg font-bold mt-0.5">{value}</div>
          </div>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-cardLg shadow-card p-4">
        <div className="text-sm font-medium mb-2">Last 6 months</div>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart}>
              <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
              <Tooltip formatter={(v) => money(v)} cursor={{ fill: '#f3f4f6' }} />
              <Bar dataKey="total" name={spentWord} fill={meta.color} radius={[6, 6, 0, 0]}
                onClick={(d) => d?.total > 0 && setMonth(d.key)} style={{ cursor: 'pointer' }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[11px] text-gray-400 mt-1">Tap a bar to see that month.</p>
      </div>

      {biggest && (
        <p className="text-sm text-gray-500">
          Biggest: <strong className="text-gray-800">{biggest.source || biggest.note || meta.label}</strong> · {money(inDisplay(biggest))}
        </p>
      )}

      <div className="flex flex-col gap-2">
        {shown.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">Nothing in {meta.label} {month === 'all' ? 'yet' : 'this month'}.</p>
        ) : shown.map(r => (
          <button key={r.id} onClick={() => onEdit(r)}
            className="bg-white border border-gray-200 rounded-cardLg shadow-card px-4 py-3 flex items-center gap-3 text-left hover:shadow-cardMd transition-shadow">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{r.source || r.note || meta.label}</div>
              <div className="text-xs text-gray-400 truncate">
                {new Date(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                {r.source && r.note ? ' · ' + r.note : ''}
              </div>
            </div>
            <span className={`hidden sm:inline text-[11px] px-2 py-0.5 rounded-full font-medium ${r.account === 'digital' ? 'bg-blue-light text-blue' : 'bg-green-light text-green'}`}>{r.account}</span>
            <span className={`text-[15px] font-bold whitespace-nowrap ${category.type === 'income' ? 'text-green' : 'text-red'}`}>{money(inDisplay(r))}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
