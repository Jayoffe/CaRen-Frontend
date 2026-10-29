import { api } from './api.js'

const vehiclePath = (vehicleId) => `/api/maintenance/vehicles/${Number(vehicleId)}/components`
const componentPath = (vehicleId, componentKey) => `${vehiclePath(vehicleId)}/${encodeURIComponent(componentKey)}`

export async function getVehicleComponents(vehicleId, options) {
  const response = await api.get(vehiclePath(vehicleId), options)
  if (!response?.data?.vehicle || !Array.isArray(response?.data?.components)) {
    throw new Error('The component maintenance endpoint returned an invalid response.')
  }
  return response.data
}

export async function getComponentHistory(vehicleId, componentKey, options) {
  const response = await api.get(`${componentPath(vehicleId, componentKey)}/history`, options)
  if (!Array.isArray(response?.data?.records)) {
    throw new Error('The component history endpoint returned an invalid response.')
  }
  return response.data.records
}

export async function recordComponentInspection(vehicleId, componentKey, payload) {
  const response = await api.post(`${componentPath(vehicleId, componentKey)}/inspections`, payload)
  return response?.data || null
}

export async function saveComponentSchedule(vehicleId, componentKey, payload) {
  await api.put(`${componentPath(vehicleId, componentKey)}/schedule`, payload)
}

export async function deleteComponentSchedule(vehicleId, componentKey, scope) {
  await api.delete(`${componentPath(vehicleId, componentKey)}/schedule?scope=${encodeURIComponent(scope)}`)
}

export async function explainComponent(vehicleId, component) {
  const response = await api.post('/api/chat', {
    mode: 'diagnostic',
    vehicle_id: Number(vehicleId),
    component: component.name,
    component_key: component.key,
    message: `Explain the recorded inspection evidence and maintenance schedule for the ${component.name} on this vehicle. Separate recorded facts from general guidance, and state what information is missing. Do not infer condition, measurements, or faults that are not recorded.`,
  })
  return response?.data || null
}
