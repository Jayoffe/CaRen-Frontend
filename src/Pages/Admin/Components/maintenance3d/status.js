// Display vocabulary for the three independent statuses the API returns.
// The status values themselves are always calculated by the backend.

export const CONDITION_LABELS = {
  good: 'Good',
  needs_attention: 'Needs attention',
  critical: 'Critical',
  unknown: 'Unknown',
}

export const SCHEDULE_LABELS = {
  not_yet_due: 'Not yet due',
  due_soon: 'Due soon',
  overdue: 'Overdue',
  not_configured: 'No schedule configured',
  unknown: 'Unknown',
}

export const PREDICTION_LABELS = {
  available: 'Available',
  unavailable: 'Unavailable',
}

export const RECORDED_CONDITION_LABELS = {
  good: 'Good',
  needs_attention: 'Needs attention',
  critical: 'Critical',
  not_assessed: 'Not assessed',
}

export const TONE_LABELS = {
  good: 'Verified good',
  attention: 'Attention / service due',
  critical: 'Critical',
  unknown: 'Unknown',
}

// Badge tone per status value: green / amber / red / grey.
export const CONDITION_TONES = { good: 'good', needs_attention: 'attention', critical: 'critical', unknown: 'unknown' }
export const SCHEDULE_TONES = { not_yet_due: 'good', due_soon: 'attention', overdue: 'attention', not_configured: 'unknown', unknown: 'unknown' }

/**
 * Hotspot colour. Red only for a recorded critical condition; an overdue or
 * due-soon schedule is amber because a due service is not a confirmed fault.
 */
export function markerTone(component) {
  const condition = component.condition?.status
  const schedule = component.schedule?.status
  if (condition === 'critical') return 'critical'
  if (condition === 'needs_attention' || schedule === 'overdue' || schedule === 'due_soon') return 'attention'
  if (condition === 'good') return 'good'
  return 'unknown'
}

export function formatDate(value) {
  if (!value) return null
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`)
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export function formatKm(value) {
  return value === null || value === undefined || value === '' ? null : `${Number(value).toLocaleString('en-US')} km`
}

export function todayISO() {
  return new Date().toLocaleDateString('en-CA')
}
