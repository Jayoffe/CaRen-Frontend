import { api } from './api.js'

const EMPTY_SUMMARY = { total_vehicles: 0, approaching: 0, overdue: 0, insufficient: 0 }

export async function getFleetVehicles() {
  const vehicles = []
  let page = 1

  while (true) {
    const response = await api.get(`/api/cars?page=${page}&per_page=48`)
    if (!Array.isArray(response?.data)) {
      throw new Error('The vehicle inventory returned an invalid response.')
    }
    vehicles.push(...response.data)
    const totalPages = Math.max(1, Number(response?.meta?.total_pages || 1))
    if (page >= totalPages) break
    page += 1
  }

  return vehicles
}

export async function getMaintenanceRecords() {
  const response = await api.get('/api/maintenance')
  return response?.data || { summary: EMPTY_SUMMARY, vehicles: [], records: [] }
}

export async function getMaintenancePredictions() {
  const response = await api.get('/api/maintenance/predictions')
  return response?.data || { summary: EMPTY_SUMMARY, vehicles: [], predictions: [] }
}

export async function generateMaintenancePredictions() {
  const response = await api.post('/api/maintenance/predictions/generate', {})
  return response?.data || []
}

export async function recordMaintenance(payload) {
  const response = await api.post('/api/maintenance/records', payload)
  return response?.data || null
}

export async function updateVehicleMileage(payload) {
  const response = await api.patch('/api/maintenance/mileage', payload)
  return response?.data || null
}

export async function updateMaintenanceRecord(id, payload) {
  const response = await api.patch(`/api/maintenance/records/${id}`, payload)
  return response?.data || null
}

export async function requestDiagnosticAnalysis(payload) {
  const response = await api.post('/api/chat', { ...payload, mode: 'diagnostic' })
  return response?.data || null
}
