// Trailing slashes are stripped because every endpoint starts with "/"; a "//api/..." path matches no route.
// An empty VITE_API_BASE_URL means same-origin, for use with VITE_API_PROXY_TARGET in development.
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3000').replace(/\/+$/, '')

const ACCESS_TOKEN = 'access_token'
const REFRESH_TOKEN = 'refresh_token'

// A 401 from these means the credentials themselves were wrong, not that the session expired.
const NO_RENEWAL = ['/api/login', '/api/google-auth', '/api/register', '/api/refresh', '/api/logout']

export function storeTokens(tokens) {
  if (tokens?.access_token) window.sessionStorage.setItem(ACCESS_TOKEN, tokens.access_token)
  if (tokens?.refresh_token) window.sessionStorage.setItem(REFRESH_TOKEN, tokens.refresh_token)
}

export function clearTokens() {
  window.sessionStorage.removeItem(ACCESS_TOKEN)
  window.sessionStorage.removeItem(REFRESH_TOKEN)
}

export function getRefreshToken() {
  return window.sessionStorage.getItem(REFRESH_TOKEN)
}

let renewal = null

/**
 * Exchanges the refresh token for a new pair. The server revokes a refresh token
 * when it is used, so concurrent 401s share this one request.
 * Resolves to 'renewed', 'rejected' (sign in again) or 'failed' (try again later).
 */
function renewSession() {
  renewal ||= (async () => {
    const refreshToken = getRefreshToken()
    if (!refreshToken) return 'rejected'
    try {
      const response = await fetch(`${API_BASE_URL}/api/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      })
      if (response.status === 401 || response.status === 403) return 'rejected'
      const result = await response.json()
      if (!response.ok || !result?.tokens?.access_token) return 'failed'
      storeTokens(result.tokens)
      return 'renewed'
    } catch {
      // A network failure says nothing about the token, so it is kept for the next attempt.
      return 'failed'
    }
  })().finally(() => { renewal = null })
  return renewal
}

function send(url, options, accessToken) {
  const headers = new Headers(options.headers || {})
  if (accessToken && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${accessToken}`)
  return fetch(url, { ...options, headers, credentials: 'include' })
}

/** fetch for an API path that sends the login token and, if it has expired, renews it and retries once. */
export async function authorizedFetch(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`
  const accessToken = window.sessionStorage.getItem(ACCESS_TOKEN)
  const response = await send(url, options, accessToken)
  if (response.status !== 401 || NO_RENEWAL.includes(endpoint) || (!accessToken && !getRefreshToken())) return response

  // Another request may already have renewed the token while this one was in flight.
  const current = window.sessionStorage.getItem(ACCESS_TOKEN)
  const outcome = current && current !== accessToken ? 'renewed' : await renewSession()
  if (outcome === 'renewed') return send(url, options, window.sessionStorage.getItem(ACCESS_TOKEN))
  if (outcome === 'rejected') {
    clearTokens()
    window.dispatchEvent(new Event('auth:expired'))
  }
  return response
}

async function request(endpoint, options = {}) {
  const isFormData = options.body instanceof FormData
  const isUrlEncoded = options.body instanceof URLSearchParams
  const headers = new Headers(options.headers || {})
  if (isUrlEncoded && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/x-www-form-urlencoded;charset=UTF-8')
  } else if (!isFormData && !isUrlEncoded && options.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  let response
  try {
    response = await authorizedFetch(endpoint, { ...options, headers })
  } catch {
    throw new Error(`Could not connect to the LavaLust API at ${API_BASE_URL}.`)
  }

  const contentType = response.headers.get('content-type') || ''
  let result
  try {
    result = contentType.includes('application/json')
      ? await response.json()
      : await response.text()
  } catch {
    throw new Error('The API returned an invalid response.')
  }

  if (!response.ok || result?.success === false) {
    const errorMessage = typeof result === 'object' && result !== null
      ? (
          typeof result.message === 'string' ? result.message
            : typeof result.error === 'string' ? result.error
            : typeof result.error?.message === 'string' ? result.error.message
            : Array.isArray(result.error) && typeof result.error[0]?.message === 'string'
              ? result.error[0].message
              : null
        )
      : null

    const error = new Error(errorMessage || `Request failed with status ${response.status}.`)
    // Lets pages react to specific failures, e.g. code 'email_not_verified' or HTTP 429.
    error.status = response.status
    error.code = typeof result === 'object' && result !== null && typeof result.code === 'string' ? result.code : null
    throw error
  }

  return result
}

export const api = {
  get: (endpoint, options) => request(endpoint, options),
  post: (endpoint, body, options = {}) => request(endpoint, {
    ...options,
    method: 'POST',
    body: body instanceof FormData || body instanceof URLSearchParams ? body : JSON.stringify(body),
  }),
  put: (endpoint, body, options = {}) => request(endpoint, {
    ...options,
    method: 'PUT',
    body: body instanceof FormData ? body : JSON.stringify(body),
  }),
  patch: (endpoint, body, options = {}) => request(endpoint, {
    ...options,
    method: 'PATCH',
    body: body instanceof FormData ? body : JSON.stringify(body),
  }),
  delete: (endpoint, options) => request(endpoint, { ...options, method: 'DELETE' }),
}

export function imageUrl(path) {
  if (!path) return ''
  if (/^https?:\/\//i.test(path)) return path
  return `${API_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`
}
