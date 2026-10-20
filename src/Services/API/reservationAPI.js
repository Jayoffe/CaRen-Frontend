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
