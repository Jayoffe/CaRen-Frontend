import { api } from './api.js'

export async function getReservations() {
  const response = await api.get('/api/reservations')
  return response?.data || []
}

export async function getReservationById(id) {
  const response = await api.get(`/api/reservations/${id}`)
  return response?.data || null
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

export async function submitManualPayment(id, reference_number) {
  return api.post(`/api/reservations/${id}/payment/manual`, new URLSearchParams({ reference_number }))
}

export async function verifyManualPayment(id, decision) {
  return api.post(`/api/reservations/${id}/payment/${decision}`, {})
}

export async function updateVehicleUse(id, action) {
  return api.post(`/api/reservations/${id}/${action}`, {})
}
