import { api } from './api.js'
import { getFleetVehicles } from './maintenanceAPI.js'

const BASE_PATH = '/api/maintenance/data-records'

export async function getMaintenanceDataRecords(filters = {}) {
  const query = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== '' && value !== null && value !== undefined) query.set(key, value)
  })
  const queryString = query.toString()
  const response = await api.get(`${BASE_PATH}${queryString ? `?${queryString}` : ''}`)
  if (!Array.isArray(response?.data?.records)) {
    throw new Error('The maintenance data endpoint returned an invalid response.')
  }
  return response.data
}

export async function getMaintenanceDataRecord(id) {
  const response = await api.get(`${BASE_PATH}/${id}`)
  if (!response?.data?.record || !Array.isArray(response?.data?.history)) {
    throw new Error('The maintenance record detail returned an invalid response.')
  }
  return response.data
}

export async function createMaintenanceDataRecord(payload, idempotencyKey = crypto.randomUUID()) {
  const response = await api.post(BASE_PATH, payload, {
    headers: { 'Idempotency-Key': idempotencyKey },
  })
  return response?.data
}

export async function updateMaintenanceDataRecord(id, payload) {
  const response = await api.patch(`${BASE_PATH}/${id}`, payload)
  return response?.data
}

export async function submitMaintenanceDataRecord(id) {
  const response = await api.post(`${BASE_PATH}/${id}/submit`, {})
  return response?.data
}

export async function verifyMaintenanceDataRecord(id, verificationStatus, reason = '') {
  const response = await api.post(`${BASE_PATH}/${id}/verify`, {
    verification_status: verificationStatus,
    reason,
  })
  return response?.data
}

export async function supersedeMaintenanceDataRecord(id, replacementRecordId, reason) {
  const response = await api.post(`${BASE_PATH}/${id}/supersede`, {
    replacement_record_id: Number(replacementRecordId),
    reason,
  })
  return response?.data
}

export async function exportVerifiedMaintenanceData() {
  const response = await api.get(`${BASE_PATH}/export?format=json`)
  const json = JSON.stringify({
    schema_version: response?.data?.schema_version,
    label_policy: response?.data?.label_policy,
    missing_value_policy: 'Unrecorded values are null or empty lists; they are not inferred as normal.',
    records: response?.data?.records,
  }, null, 2)
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'verified-maintenance-data.json'
  link.click()
  URL.revokeObjectURL(url)
}

export { getFleetVehicles }
