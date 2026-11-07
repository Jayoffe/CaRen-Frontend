import { api, API_BASE_URL } from './api.js'

const base = '/api/assessments'

export async function getAssessmentCatalog() {
  return (await api.get(`${base}/catalog`)).data
}

export async function getAssessmentFleet() {
  const data = (await api.get(`${base}/fleet`)).data
  if (!Array.isArray(data?.vehicles)) throw new Error('The assessment overview returned an invalid response.')
  return data
}

export async function getAssessmentWorkspace(vehicleId, options) {
  const data = (await api.get(`${base}/vehicles/${Number(vehicleId)}`, options)).data
  if (!data?.vehicle) throw new Error('The assessment workspace returned an invalid response.')
  return data
}

export async function saveVehicleProfile(vehicleId, values) {
  return (await api.patch(`${base}/vehicles/${Number(vehicleId)}/profile`, values)).data
}

export async function getCategoryHistory(vehicleId, categoryKey) {
  return (await api.get(`${base}/vehicles/${Number(vehicleId)}/categories/${encodeURIComponent(categoryKey)}/history`)).data
}

export async function submitAssessment(payload) {
  return (await api.post(base, payload)).data
}

export async function getAssessment(assessmentId) {
  return (await api.get(`${base}/${Number(assessmentId)}`)).data
}

export async function retryAnalysis(assessmentId) {
  return (await api.post(`${base}/${Number(assessmentId)}/analysis`, {})).data
}

export async function reviewAssessment(assessmentId, notes) {
  return (await api.post(`${base}/${Number(assessmentId)}/review`, { notes })).data
}

export async function recordOutcome(assessmentId, categoryKey, payload) {
  return (await api.post(`${base}/${Number(assessmentId)}/categories/${encodeURIComponent(categoryKey)}/outcomes`, payload)).data
}

export async function verifyOutcome(outcomeId, status) {
  return (await api.post(`${base}/outcomes/${Number(outcomeId)}/verify`, { status })).data
}

export async function uploadEvidence(assessmentId, categoryKey, file) {
  const form = new FormData()
  form.append('evidence', file)
  return (await api.post(`${base}/${Number(assessmentId)}/categories/${encodeURIComponent(categoryKey)}/evidence`, form)).data
}

/** Evidence is private, so it is fetched with credentials and shown from a blob URL. */
export async function evidenceObjectUrl(evidenceId) {
  const token = window.sessionStorage.getItem('access_token')
  const response = await fetch(`${API_BASE_URL}${base}/evidence/${Number(evidenceId)}`, {
    credentials: 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!response.ok) throw new Error('The evidence could not be loaded.')
  return URL.createObjectURL(await response.blob())
}

export async function getTrainingOverview() {
  return (await api.get(`${base}/training/overview`)).data
}

export async function getTrainingDataset(categoryKey) {
  return (await api.get(`${base}/training/${encodeURIComponent(categoryKey)}/dataset`)).data
}

export async function startTraining(categoryKey) {
  return (await api.post(`${base}/training/${encodeURIComponent(categoryKey)}/train`, {})).data
}

export async function acceptModel(categoryKey, version) {
  return (await api.post(`${base}/training/${encodeURIComponent(categoryKey)}/accept`, { version })).data
}

export async function revokeModel(categoryKey, reason) {
  return (await api.post(`${base}/training/${encodeURIComponent(categoryKey)}/revoke`, { reason })).data
}
