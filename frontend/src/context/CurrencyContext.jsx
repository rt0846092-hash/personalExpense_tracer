import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { EXCHANGE_RATE_API } from '../utils/constants'
import { convert as convertAmount } from '../utils/helpers'
import { getPreferences, savePreferences } from '../api'

const CurrencyContext = createContext(null)

export function CurrencyProvider({ children }) {
  const [rates, setRates] = useState(null) // { USD: 1, NPR: 133.5, KRW: 1330, ... }
  const [ratesUpdatedAt, setRatesUpdatedAt] = useState(null)
  const [ratesError, setRatesError] = useState(null)
  const [displayCurrency, setDisplayCurrencyState] = useState('NPR')
  const [loading, setLoading] = useState(true)

  const loadRates = useCallback(async () => {
    try {
      const res = await fetch(EXCHANGE_RATE_API)
      const data = await res.json()
      if (data?.rates) {
        setRates(data.rates)
        setRatesUpdatedAt(data.time_last_update_utc || new Date().toISOString())
        setRatesError(null)
      } else {
        setRatesError('Exchange rate API returned no rates.')
      }
    } catch (e) {
      setRatesError('Could not reach the exchange rate API — showing amounts unconverted.')
    }
  }, [])

  useEffect(() => {
    (async () => {
      setLoading(true)
      await Promise.all([
        loadRates(),
        getPreferences().then(p => setDisplayCurrencyState(p.display_currency)).catch(() => {}),
      ])
      setLoading(false)
    })()
  }, [loadRates])

  const setDisplayCurrency = useCallback(async (code) => {
    setDisplayCurrencyState(code)
    try {
      await savePreferences({ display_currency: code })
    } catch {
      // Non-fatal — the choice still applies for this session.
    }
  }, [])

  const convert = useCallback((amount, fromCurrency, toCurrency = displayCurrency) => {
    return convertAmount(amount, fromCurrency, toCurrency, rates)
  }, [rates, displayCurrency])

  const value = {
    rates, ratesUpdatedAt, ratesError, loading,
    displayCurrency, setDisplayCurrency,
    convert,
  }

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext)
  if (!ctx) throw new Error('useCurrency must be used within CurrencyProvider')
  return ctx
}
