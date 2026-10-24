import { api } from './api.js'

export async function getMaintenanceRecords() {
  const response = await api.get('/api/maintenance')
  return response?.data || { summary: { total_vehicles: 0, approaching: 0, overdue: 0, insufficient: 0 }, vehicles: [], records: [] }
}

export async function getMaintenancePredictions() {
  const response = await api.get('/api/maintenance/predictions')
  return response?.data || { summary: { total_vehicles: 0, approaching: 0, overdue: 0, insufficient: 0 }, vehicles: [], predictions: [] }
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
