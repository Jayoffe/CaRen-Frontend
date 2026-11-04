import { api } from './api.js'

export async function getVehicles() { const response = await api.get('/api/cars/available'); return response?.data || []; }
export async function getVehicleById(id) { const response = await api.get(`/api/cars/${id}`); return response?.data || null; }

/** Every vehicle, across as many pages as the API splits them into. */
export async function getAllVehicles() {
  const pageSize = 48
  const fetchPage = (page) => api.get(`/api/cars?per_page=${pageSize}&page=${page}`)
  const first = await fetchPage(1)
  const lastPage = Number(first?.meta?.last_page) || 1
  const rest = await Promise.all(Array.from({ length: lastPage - 1 }, (_, index) => fetchPage(index + 2)))
  return [first, ...rest].flatMap((response) => response?.data || [])
}

/** Fleet counts come from the API's own totals, so they stay right however large the fleet gets. */
export async function getFleetCounts() {
  const count = async (query) => Number((await api.get(`/api/cars?per_page=1${query}`))?.meta?.total || 0)
  const [total, available, rented, maintenance, unavailable] = await Promise.all([
    count(''),
    count('&status=available'),
    count('&status=rented'),
    count('&status=maintenance'),
    count('&status=unavailable'),
  ])
  return { total, available, rented, maintenance, unavailable }
}
