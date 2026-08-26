import { DEFAULT_INCOME_CATS, DEFAULT_EXPENSE_CATS, CURRENCY_SYMBOLS } from './constants'

// Format an amount that's already in the target currency — just adds the
// symbol. For converting between currencies first, use `convert()` below.
export function fmtIn(n, currencyCode = 'NPR') {
  const symbol = CURRENCY_SYMBOLS[currencyCode] || currencyCode
  return symbol + ' ' + Math.abs(Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })
}

// Backwards-compatible alias — formats in NPR unless told otherwise.
export function fmt(n, currencyCode = 'NPR') {
  return fmtIn(n, currencyCode)
}

// Convert an amount from one currency to another using rates that are all
// expressed relative to USD (which is what the free exchange-rate API
// returns): rates[code] = how many units of `code` equal 1 USD.
export function convert(amount, fromCurrency, toCurrency, rates) {
  const n = Number(amount) || 0
  if (!rates || fromCurrency === toCurrency) return n
  const fromRate = rates[fromCurrency]
  const toRate = rates[toCurrency]
  if (!fromRate || !toRate) return n // unknown currency — show as-is rather than guessing
  const amountInUSD = n / fromRate
  return amountInUSD * toRate
}

export function parseAmount(raw) {
  if (!raw) return NaN
  const s = raw.toString().trim().replace(/,/g, '')
  const match = s.match(/^([\d.]+)\s*([kKlLmM]?)$/)
  if (!match) return NaN
  const num = parseFloat(match[1])
  if (isNaN(num)) return NaN
  const suffix = match[2].toLowerCase()
  if (suffix === 'k') return Math.round(num * 1000)
  if (suffix === 'l') return Math.round(num * 100000)
  if (suffix === 'm') return Math.round(num * 1000000)
  return Math.round(num)
}

export function mk(iso) {
  return iso.slice(0, 7)
}

export function today() {
  return new Date().toISOString().slice(0, 10)
}

export function getIncomeCats(customCats) {
  const custom = {}
  customCats.filter(c => c.type === 'income').forEach(c => { custom[c.key] = c })
  return { ...DEFAULT_INCOME_CATS, ...custom }
}

export function getExpenseCats(customCats) {
  const custom = {}
  customCats.filter(c => c.type === 'expense').forEach(c => { custom[c.key] = c })
  return { ...DEFAULT_EXPENSE_CATS, ...custom }
}

// ---- Period / date range logic ----
export function periodRange(period, customRange) {
  const now = new Date()
  let start
  if (period === 'custom' && customRange?.from && customRange?.to) {
    start = new Date(customRange.from); start.setHours(0, 0, 0, 0)
    const end = new Date(customRange.to); end.setHours(23, 59, 59, 999)
    return [start, end]
  }
  switch (period) {
    case '1d':
      start = new Date(now); start.setHours(0, 0, 0, 0); break
    case '1w': {
      start = new Date(now)
      start.setDate(now.getDate() - ((now.getDay() + 6) % 7))
      start.setHours(0, 0, 0, 0)
      break
    }
    case '1m': start = new Date(now.getFullYear(), now.getMonth(), 1); break
    case '6m': start = new Date(now.getFullYear(), now.getMonth() - 5, 1); break
    case '1y': start = new Date(now.getFullYear(), now.getMonth() - 11, 1); break
    default: start = new Date(0)
  }
  const end = new Date(now); end.setHours(23, 59, 59, 999)
  return [start, end]
}

export function inPeriod(isoDate, period, customRange) {
  const [s, e] = periodRange(period, customRange)
  const d = new Date(isoDate)
  return d >= s && d <= e
}

// ---- Accounting ----
// `displayCurrency`/`rates` are optional: when provided, every record's
// amount is converted into the display currency before being added up, so
// mixed-currency entries roll up into one meaningful total instead of just
// adding raw numbers from different currencies together.
//
// For remittances specifically, the amount that actually left the account
// is the SENT amount (sent_amount/sent_currency) — the received amount on
// the other end is a different, separately-tracked figure (see Remittance
// component for the sent-vs-received "gap"/fee).
export function recordAmountInDisplay(r, displayCurrency = null, rates = null) {
  const isRemit = r.type === 'remittance'
  const hasSent = isRemit && r.sent_amount != null && r.sent_amount !== ''
  const amt = hasSent ? Number(r.sent_amount) : (Number(r.amount) || 0)
  const cur = hasSent ? (r.sent_currency || r.currency || 'NPR') : (r.currency || 'NPR')
  if (!displayCurrency || !rates) return amt
  return convert(amt, cur, displayCurrency, rates)
}

export function accountBalance(records, openingBalances, account, excludeId = null, displayCurrency = null, rates = null) {
  // The opening balance is stored in whatever currency it was entered in
  // (openingBalances.currency), so it has to be converted like any record
  // — otherwise switching display currency leaves it at its raw value and
  // every balance comes out wrong.
  const openingRaw = Number(openingBalances[account] || 0)
  const openingCcy = openingBalances.currency || 'NPR'
  let bal = (displayCurrency && rates)
    ? convert(openingRaw, openingCcy, displayCurrency, rates)
    : openingRaw
  records.forEach(r => {
    if (excludeId && r.id === excludeId) return
    const amt = recordAmountInDisplay(r, displayCurrency, rates)
    if (r.type === 'income' && r.account === account) bal += amt
    if (r.type === 'expense' && r.account === account) bal -= amt
    if (r.type === 'remittance' && r.account === account) bal -= amt
    if (r.type === 'transfer' && r.account === account) bal -= amt
    if (r.type === 'transfer' && r.to_account === account) bal += amt
  })
  return bal
}

export function accountInOut(records, account, displayCurrency = null, rates = null) {
  let inAmt = 0, outAmt = 0
  records.forEach(r => {
    const amt = recordAmountInDisplay(r, displayCurrency, rates)
    if (r.type === 'income' && r.account === account) inAmt += amt
    if (r.type === 'expense' && r.account === account) outAmt += amt
    if (r.type === 'remittance' && r.account === account) outAmt += amt
    if (r.type === 'transfer' && r.account === account) outAmt += amt
    if (r.type === 'transfer' && r.to_account === account) inAmt += amt
  })
  return { inAmt, outAmt }
}

// ---- Chart bucketing (income/expense over time) ----
export function buildBuckets(period, customRange) {
  const now = new Date()
  const buckets = []

  if (period === '1d') {
    // `Record.date` is a DateField — no time of day is ever stored, so
    // splitting today into 4-hour blocks put every entry in whichever
    // bucket matched the timezone offset and left the rest permanently
    // empty. One bucket for the day is what the data can actually support.
    const iso = now.toISOString().slice(0, 10)
    buckets.push({ label: 'Today', inc: 0, exp: 0, matches: (r) => r.slice(0, 10) === iso })
  } else if (period === '1w') {
    const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
    const mon = new Date(now); mon.setDate(now.getDate() - ((now.getDay() + 6) % 7)); mon.setHours(0,0,0,0)
    for (let i = 0; i < 7; i++) {
      const d = new Date(mon); d.setDate(mon.getDate() + i)
      const iso = d.toISOString().slice(0, 10)
      buckets.push({ label: days[i], inc: 0, exp: 0, matches: (r) => r.slice(0, 10) === iso })
    }
  } else if (period === '1m') {
    const year = now.getFullYear(), month = now.getMonth()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    for (let w = 0; w < 5; w++) {
      const startDay = w * 7 + 1, endDay = Math.min(startDay + 6, daysInMonth)
      if (startDay > daysInMonth) break
      buckets.push({ label: 'W' + (w + 1), inc: 0, exp: 0, matches: (iso) => {
        const d = new Date(iso)
        return d.getFullYear() === year && d.getMonth() === month && d.getDate() >= startDay && d.getDate() <= endDay
      }})
    }
  } else if (period === '6m' || period === '1y') {
    const count = period === '6m' ? 6 : 12
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const y = d.getFullYear(), m = d.getMonth()
      buckets.push({ label: d.toLocaleString('en-US', { month: 'short' }), inc: 0, exp: 0, matches: (iso) => {
        const dt = new Date(iso); return dt.getFullYear() === y && dt.getMonth() === m
      }})
    }
  } else if (period === 'custom' && customRange?.from && customRange?.to) {
    const start = new Date(customRange.from)
    const end = new Date(customRange.to)
    const dayMs = 86400000
    const spanDays = Math.round((end - start) / dayMs) + 1

    if (spanDays <= 1) {
      // Same reason as the '1d' case above — date-only data can't be
      // split by hour.
      const dayIso = customRange.from
      const label = new Date(dayIso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      buckets.push({ label, inc: 0, exp: 0, matches: (r) => r.slice(0, 10) === dayIso })
    } else if (spanDays <= 14) {
      for (let i = 0; i < spanDays; i++) {
        const d = new Date(start); d.setDate(start.getDate() + i)
        const iso = d.toISOString().slice(0, 10)
        buckets.push({ label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), inc: 0, exp: 0, matches: (r) => r.slice(0, 10) === iso })
      }
    } else if (spanDays <= 90) {
      let cur = new Date(start)
      while (cur <= end) {
        const wkStart = new Date(cur)
        let wkEnd = new Date(cur); wkEnd.setDate(wkEnd.getDate() + 6)
        if (wkEnd > end) wkEnd = new Date(end)
        const label = wkStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        buckets.push({ label, inc: 0, exp: 0, matches: (iso) => {
          const d = new Date(iso); return d >= wkStart && d <= wkEnd
        }})
        cur.setDate(cur.getDate() + 7)
      }
    } else {
      let y = start.getFullYear(), m = start.getMonth()
      const endY = end.getFullYear(), endM = end.getMonth()
      while (y < endY || (y === endY && m <= endM)) {
        const yy = y, mm = m
        buckets.push({ label: new Date(yy, mm, 1).toLocaleString('en-US', { month: 'short' }), inc: 0, exp: 0, matches: (iso) => {
          const dt = new Date(iso); return dt.getFullYear() === yy && dt.getMonth() === mm
        }})
        m++; if (m > 11) { m = 0; y++ }
      }
    }
  }
  return buckets
}

export function buildChartData(records, period, customRange, displayCurrency = null, rates = null) {
  const buckets = buildBuckets(period, customRange)
  records.forEach(r => {
    const bkt = buckets.find(b => b.matches(r.date))
    if (!bkt) return
    const amt = recordAmountInDisplay(r, displayCurrency, rates)
    if (r.type === 'income') bkt.inc += amt
    if (r.type === 'expense') bkt.exp += amt
  })
  return buckets.map(b => ({ label: b.label, Income: b.inc, Expense: b.exp }))
}

export function buildRemittanceChartData(records, displayCurrency = null, rates = null) {
  const buckets = buildBuckets('6m')
  records.forEach(r => {
    if (r.type !== 'remittance') return
    const bkt = buckets.find(b => b.matches(r.date))
    if (bkt) bkt.exp += recordAmountInDisplay(r, displayCurrency, rates)
  })
  return buckets.map(b => ({ label: b.label, Sent: b.exp }))
}