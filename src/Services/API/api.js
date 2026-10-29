// Trailing slashes are stripped because every endpoint starts with "/"; a "//api/..." path matches no route.
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '')

async function request(endpoint, options = {}) {
  const isFormData = options.body instanceof FormData
  const headers = new Headers(options.headers || {})
  if (!isFormData && options.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  let response
  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
      credentials: 'include',
    })
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

    throw new Error(errorMessage || `Request failed with status ${response.status}.`)
  }

  return result
}

export const api = {
  get: (endpoint, options) => request(endpoint, options),
  post: (endpoint, body, options = {}) => request(endpoint, {
    ...options,
    method: 'POST',
    body: body instanceof FormData ? body : JSON.stringify(body),
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
