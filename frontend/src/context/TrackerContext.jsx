import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import * as api from '../api'

const TrackerContext = createContext(null)

export function TrackerProvider({ children }) {
  const [records, setRecords] = useState([])
  const [customCats, setCustomCats] = useState([])
  const [openingBalances, setOpeningBalances] = useState({ digital: 0, cash: 0, currency: 'NPR' })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const toastTimer = useRef(null)
  const [toast, setToast] = useState('')

  const showToast = useCallback((msg) => {
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2600)
  }, [])

  const refreshRecords = useCallback(async () => {
    const data = await api.listRecords()
    setRecords(data)
    return data
  }, [])

  const refreshCategories = useCallback(async () => {
    const data = await api.listCategories()
    setCustomCats(data)
    return data
  }, [])

  const refreshOpeningBalance = useCallback(async () => {
    const data = await api.getOpeningBalance()
    setOpeningBalances(data)
    return data
  }, [])

  useEffect(() => {
    (async () => {
      try {
        setLoading(true)
        await Promise.all([refreshRecords(), refreshCategories(), refreshOpeningBalance()])
      } catch (e) {
        console.error(e)
        setError('Could not reach the API. Is the Django server running?')
      } finally {
        setLoading(false)
      }
    })()
  }, [refreshRecords, refreshCategories, refreshOpeningBalance])

  const addRecord = useCallback(async (payload) => {
    await api.createRecord(payload)
    await refreshRecords()
  }, [refreshRecords])

  const editRecord = useCallback(async (id, payload) => {
    await api.updateRecord(id, payload)
    await refreshRecords()
  }, [refreshRecords])

  const removeRecord = useCallback(async (id) => {
    await api.deleteRecord(id)
    await refreshRecords()
  }, [refreshRecords])

  const addCategory = useCallback(async (payload) => {
    const created = await api.createCategory(payload)
    await refreshCategories()
    return created
  }, [refreshCategories])

  const renameCategory = useCallback(async (id, label) => {
    await api.updateCategory(id, { label })
    await refreshCategories()
  }, [refreshCategories])

  const removeCategory = useCallback(async (id, type, key) => {
    // Move any records using this category to "other" before deleting it,
    // mirroring the original app's behaviour.
    const inUse = records.filter(r => r.type === type && r.category === key)
    await Promise.all(inUse.map(r => api.updateRecord(r.id, { ...stripReadOnly(r), category: 'other' })))
    await api.deleteCategory(id)
    await Promise.all([refreshCategories(), refreshRecords()])
  }, [records, refreshCategories, refreshRecords])

  const saveOpeningBalances = useCallback(async (payload) => {
    await api.saveOpeningBalance(payload)
    await refreshOpeningBalance()
  }, [refreshOpeningBalance])

  const value = {
    records, customCats, openingBalances, loading, error,
    showToast, toast,
    addRecord, editRecord, removeRecord,
    addCategory, renameCategory, removeCategory,
    saveOpeningBalances,
    refreshRecords,
  }

  return <TrackerContext.Provider value={value}>{children}</TrackerContext.Provider>
}

function stripReadOnly(r) {
  const { id, created_at, updated_at, ...rest } = r
  return rest
}

export function useTracker() {
  const ctx = useContext(TrackerContext)
  if (!ctx) throw new Error('useTracker must be used within TrackerProvider')
  return ctx
}