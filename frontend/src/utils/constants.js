export const CURRENCY = 'Nrs'

export const DEFAULT_INCOME_CATS = {
  salary:    { label: 'Salary',        color: '#2563eb', icon: '🏦' },
  freelance: { label: 'Freelance',     color: '#7c3aed', icon: '💻' },
  parttime:  { label: 'Part-time job', color: '#059669', icon: '🛍️' },
  gift:      { label: 'Gift',          color: '#d97706', icon: '🎁' },
  other:     { label: 'Other income',  color: '#6b7280', icon: '💰' },
}

export const DEFAULT_EXPENSE_CATS = {
  food:      { label: 'Food & drinks', color: '#ef4444', icon: '🍜' },
  transport: { label: 'Transport',     color: '#f97316', icon: '🚌' },
  study:     { label: 'Study',         color: '#8b5cf6', icon: '📚' },
  rent:      { label: 'Rent & bills',  color: '#06b6d4', icon: '🏠' },
  shopping:  { label: 'Shopping',      color: '#ec4899', icon: '🛒' },
  health:    { label: 'Health',        color: '#10b981', icon: '💊' },
  other:     { label: 'Other expense', color: '#6b7280', icon: '💸' },
}

// Currencies available throughout the app. `symbol` is used for display;
// exchange rates for all of these (relative to USD) come from the live
// rates API at runtime — see CurrencyContext.
export const CURRENCIES = [
  { code: 'NPR', label: 'Nepali Rupee', symbol: 'Nrs' },
  { code: 'USD', label: 'US Dollar', symbol: '$' },
  { code: 'KRW', label: 'Korean Won', symbol: '₩' },
  { code: 'INR', label: 'Indian Rupee', symbol: '₹' },
  { code: 'EUR', label: 'Euro', symbol: '€' },
  { code: 'GBP', label: 'British Pound', symbol: '£' },
  { code: 'AED', label: 'UAE Dirham', symbol: 'د.إ' },
  { code: 'SAR', label: 'Saudi Riyal', symbol: '﷼' },
  { code: 'QAR', label: 'Qatari Riyal', symbol: 'ر.ق' },
  { code: 'MYR', label: 'Malaysian Ringgit', symbol: 'RM' },
  { code: 'SGD', label: 'Singapore Dollar', symbol: 'S$' },
  { code: 'AUD', label: 'Australian Dollar', symbol: 'A$' },
  { code: 'CAD', label: 'Canadian Dollar', symbol: 'C$' },
  { code: 'JPY', label: 'Japanese Yen', symbol: '¥' },
  { code: 'CNY', label: 'Chinese Yuan', symbol: '¥' },
  { code: 'THB', label: 'Thai Baht', symbol: '฿' },
]

export const CURRENCY_SYMBOLS = Object.fromEntries(CURRENCIES.map(c => [c.code, c.symbol]))

// The free, no-key exchange-rate API used for live conversion. Returns
// rates for ~160 currencies relative to a base (we always fetch USD as
// the pivot, then convert between any two currencies via that).
export const EXCHANGE_RATE_API = 'https://open.er-api.com/v6/latest/USD'

export const PERIODS = [
  { key: '1d', label: 'Today' },
  { key: '1w', label: 'Week' },
  { key: '1m', label: 'Month' },
  { key: '6m', label: '6 months' },
  { key: '1y', label: 'Year' },
]
