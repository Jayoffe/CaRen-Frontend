// Display vocabulary for assessments. Physical rating, rule-based screening, AI
// processing and predictive capability are separate statuses and stay separate.

export const RATINGS = {
  excellent: { label: 'Excellent', short: '5', tone: 'excellent' },
  good: { label: 'Good', short: '4', tone: 'good' },
  fair: { label: 'Fair', short: '3', tone: 'fair' },
  poor: { label: 'Poor', short: '2', tone: 'poor' },
  critical: { label: 'Critical', short: '1', tone: 'critical' },
  not_applicable: { label: 'N/A', long: 'Not Applicable', short: 'N/A', tone: 'na' },
  unknown: { label: 'Unknown', short: '?', tone: 'unknown' },
  not_assessed: { label: 'Not Assessed', short: '–', tone: 'not-assessed' },
}

export const SCREENING = {
  critical: { label: 'Critical finding', tone: 'critical' },
  attention: { label: 'Needs attention', tone: 'poor' },
  monitor: { label: 'Monitor', tone: 'fair' },
  no_concerns_recorded: { label: 'No concerns recorded', tone: 'good' },
  insufficient_data: { label: 'Insufficient Data', tone: 'insufficient' },
  not_assessed: { label: 'Not Assessed', tone: 'not-assessed' },
  not_applicable: { label: 'N/A', tone: 'na' },
}

export const AI_STATUS = {
  pending: { label: 'Pending', tone: 'pending' },
  processing: { label: 'Processing', tone: 'pending' },
  completed: { label: 'Completed', tone: 'good' },
  failed: { label: 'Failed', tone: 'failed' },
}

export const SEVERITY = {
  critical: { label: 'Critical', tone: 'critical' },
  warning: { label: 'Warning', tone: 'poor' },
  advisory: { label: 'Advisory', tone: 'fair' },
}

export const REASSESSMENT = {
  never_assessed: { label: 'Never assessed', tone: 'not-assessed' },
  current: { label: 'Current', tone: 'good' },
  due_soon: { label: 'Due soon', tone: 'fair' },
  overdue: { label: 'Overdue', tone: 'poor' },
}

export const SUFFICIENCY = {
  sufficient: 'Sufficient',
  partial: 'Partial',
  insufficient: 'Insufficient Data',
  not_assessed: 'Not Assessed',
  not_applicable: 'N/A',
}

export const USAGE = {
  daily: 'Daily',
  several_per_week: 'Several times a week',
  weekly: 'Weekly',
  occasional: 'Occasional',
}

export const ANSWERS = { yes: 'Yes', no: 'No', unknown: 'Unknown', not_applicable: 'N/A' }

export const DECISIONS = { completed: 'Completed', deferred: 'Deferred', rejected: 'Rejected' }
export const CONFIRMATIONS = { not_checked: 'Not checked', confirmed: 'Confirmed by a mechanic', not_confirmed: 'Not confirmed by a mechanic' }
export const RESULTS = { pending: 'No result yet', confirmed_failure: 'Followed by a confirmed failure', successful_repair: 'Followed by a successful repair', no_fault_found: 'No fault found' }
export const VERIFICATION = { unverified: 'Unverified', verified: 'Verified', rejected: 'Rejected' }

export const CHANGE = {
  improved: { label: 'Improved', tone: 'good' },
  worsened: { label: 'Worsened', tone: 'poor' },
  unchanged: { label: 'Unchanged', tone: 'na' },
  not_comparable: { label: 'Not comparable', tone: 'not-assessed' },
}

const STAGE_TONES = { critical: 'critical', attention: 'attention', monitor: 'attention', no_concerns_recorded: 'good' }

/** Hotspot colour for a 3D part, from rule-based screening only. */
export function stageTone(screeningStatus) {
  return STAGE_TONES[screeningStatus] || 'unknown'
}

export const STAGE_LEGEND = [
  { tone: 'good', label: 'No concerns recorded' },
  { tone: 'attention', label: 'Monitor or attention' },
  { tone: 'critical', label: 'Critical finding' },
  { tone: 'unknown', label: 'Not assessed or no data' },
]

export function newUuid() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID()
  const bytes = window.crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
