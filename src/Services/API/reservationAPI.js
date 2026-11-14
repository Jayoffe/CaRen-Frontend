import { api } from './api.js'

// Records when each reservation was fetched, so hold_seconds_left (time left to pay) can be
// turned into a deadline in the browser without comparing server and browser time zones.
function stamp(reservation) {
  return reservation ? { ...reservation, loadedAt: Date.now() } : reservation
}

export async function getReservations() {
  const response = await api.get('/api/reservations')
  return (response?.data || []).map(stamp)
}

export async function getReservationById(id) {
  const response = await api.get(`/api/reservations/${id}`)
  return stamp(response?.data || null)
}

/** Paid payments an administrator must act on (payment after cancellation or expiry, duplicates). */
export async function getPaymentsNeedingReview() {
  const response = await api.get('/api/payments/review')
  return response?.data || []
}

export async function createReservation(payload) {
  return api.post('/api/reservations', payload)
}

export async function updateReservationStatus(id, status) {
  return api.patch(`/api/reservations/${id}`, { status })
}

export async function createPaymentCheckout(id) {
  return api.post(`/api/reservations/${id}/payment`, {})
}

export async function updateVehicleUse(id, action) {
  return api.post(`/api/reservations/${id}/${action}`, {})
}
