import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api'

const ACCESS_KEY = 'tracker_access'
const REFRESH_KEY = 'tracker_refresh'

// Tokens live in localStorage (not app data — just the login session) so
// that reloading the page, or opening the app again later on the same
// device, doesn't require signing in again. Any other device just needs
// its own sign-in with the same username/password to reach the same data.
export const tokenStore = {
  getAccess: () => localStorage.getItem(ACCESS_KEY),
  getRefresh: () => localStorage.getItem(REFRESH_KEY),
  setTokens: (access, refresh) => {
    if (access) localStorage.setItem(ACCESS_KEY, access)
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh)
  },
  clear: () => {
    localStorage.removeItem(ACCESS_KEY)
    localStorage.removeItem(REFRESH_KEY)
  },
}

// `client` — normal authenticated requests, attaches the access token and
// auto-refreshes it once on a 401 before giving up.
// `bare`   — used for register/login/refresh themselves, so those calls
// never get caught in their own retry loop.
const client = axios.create({ baseURL: API_URL })
const bare = axios.create({ baseURL: API_URL })

client.interceptors.request.use((config) => {
  const token = tokenStore.getAccess()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

let refreshPromise = null

client.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    const refresh = tokenStore.getRefresh()
    if (error.response?.status === 401 && refresh && !original._retry) {
      original._retry = true
      try {
        if (!refreshPromise) {
          refreshPromise = bare
            .post('/auth/token/refresh/', { refresh })
            .then((r) => { tokenStore.setTokens(r.data.access); return r.data.access })
            .finally(() => { refreshPromise = null })
        }
        const newAccess = await refreshPromise
        original.headers.Authorization = `Bearer ${newAccess}`
        return client(original)
      } catch (refreshErr) {
        tokenStore.clear()
        window.dispatchEvent(new Event('tracker:logout'))
        return Promise.reject(refreshErr)
      }
    }
    return Promise.reject(error)
  }
)

// ---- Auth ----
export const registerUser = (payload) => bare.post('/auth/register/', payload).then(r => r.data)
export const loginUser = (payload) => bare.post('/auth/login/', payload).then(r => r.data)
export const fetchMe = () => client.get('/auth/me/').then(r => r.data)
export const logoutUser = () => {
  const refresh = tokenStore.getRefresh()
  if (!refresh) return Promise.resolve()
  return bare.post('/auth/logout/', { refresh }).catch(() => {})
}

// ---- Records ----
// DRF paginates (PAGE_SIZE=1000). Page one alone silently truncates a
// long-running ledger — and every balance/total/chart is computed from
// this array, so missing records means quietly wrong numbers rather than
// a visible error. Follow `next` until the server runs out of pages.
export const listRecords = async (params = {}) => {
  const first = await client.get('/records/', { params }).then(r => r.data)

  // Unpaginated response (a plain array) — nothing more to fetch.
  if (Array.isArray(first)) return first

  const all = [...(first.results ?? [])]
  let next = first.next
  while (next) {
    // `next` is an absolute URL from DRF; axios accepts it as-is and the
    // auth interceptor still applies since it goes through `client`.
    const page = await client.get(next).then(r => r.data)
    all.push(...(page.results ?? []))
    next = page.next
  }
  return all
}

export const createRecord = (payload) =>
  client.post('/records/', payload).then(r => r.data)

export const updateRecord = (id, payload) =>
  client.put(`/records/${id}/`, payload).then(r => r.data)

export const deleteRecord = (id) =>
  client.delete(`/records/${id}/`)

// ---- Categories (custom only — defaults live in constants.js) ----
export const listCategories = async () => {
  const first = await client.get('/categories/').then(r => r.data)
  if (Array.isArray(first)) return first
  const all = [...(first.results ?? [])]
  let next = first.next
  while (next) {
    const page = await client.get(next).then(r => r.data)
    all.push(...(page.results ?? []))
    next = page.next
  }
  return all
}

export const createCategory = (payload) =>
  client.post('/categories/', payload).then(r => r.data)

export const updateCategory = (id, payload) =>
  client.patch(`/categories/${id}/`, payload).then(r => r.data)

export const deleteCategory = (id) =>
  client.delete(`/categories/${id}/`)

// ---- Opening balances (per user) ----
export const getOpeningBalance = () =>
  client.get('/opening-balance/').then(r => r.data)

export const saveOpeningBalance = (payload) =>
  client.put('/opening-balance/', payload).then(r => r.data)

// ---- Preferences (display currency) ----
export const getPreferences = () =>
  client.get('/preferences/').then(r => r.data)

export const savePreferences = (payload) =>
  client.put('/preferences/', payload).then(r => r.data)

export default client