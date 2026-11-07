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
  attention: { label: 'Maintenance recommended', tone: 'poor' },
  monitor: { label: 'Needs attention', tone: 'fair' },
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
  { tone: 'attention', label: 'Needs attention or maintenance' },
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

/* Assessment drafts are kept on this device until the assessment is submitted. */

function draftKey(vehicleId) {
  return `assessment-draft-${vehicleId}`
}

export function loadDraft(vehicleId) {
  try {
    const stored = JSON.parse(window.localStorage.getItem(draftKey(vehicleId)) || 'null')
    return stored?.components ? stored : null
  } catch {
    return null
  }
}

export function storeDraft(vehicleId, form) {
  try {
    if (form) window.localStorage.setItem(draftKey(vehicleId), JSON.stringify(form))
    else window.localStorage.removeItem(draftKey(vehicleId))
  } catch {
    // A draft is only a convenience; the form still works without storage.
  }
}

/** The status shown on a vehicle panel: a local draft, otherwise the backend's reassessment state. */
export function assessmentStatus(reassessmentStatus, hasDraft) {
  if (hasDraft) return { key: 'in_progress', label: 'Assessment In Progress', tone: 'pending' }
  if (reassessmentStatus === 'never_assessed') return { key: 'required', label: 'Assessment Required', tone: 'poor' }
  if (reassessmentStatus === 'current') return { key: 'completed', label: 'Assessment Completed', tone: 'good' }
  return { key: 'due', label: 'Assessment Due', tone: reassessmentStatus === 'overdue' ? 'poor' : 'fair' }
}

// Each label restates the backend's worst screening severity. Nothing here is a score.
const CONDITIONS = {
  critical: { label: 'Critical Condition', tone: 'critical', priority: 'Immediate: keep out of rental until cleared' },
  attention: { label: 'Maintenance Recommended', tone: 'poor', priority: 'High: schedule repair' },
  monitor: { label: 'Needs Attention', tone: 'fair', priority: 'Moderate: monitor at next reassessment' },
  no_concerns_recorded: { label: 'Good Condition', tone: 'good', priority: 'Routine: no action recorded' },
  limited: { label: 'Limited Information', tone: 'insufficient', priority: 'Not determined' },
}

/**
 * Overall condition from stored screening. The backend's overall status is the
 * worst one present, so a single clean category outranks categories with no usable
 * data. Good Condition therefore also requires that every category was evaluated.
 */
export function overallCondition(assessment, categories) {
  const statuses = categories.map((category) => assessment.components[category.key]?.screening_status)
  const unevaluated = statuses.filter((status) => !status || ['insufficient_data', 'not_assessed'].includes(status)).length
  const flagged = statuses.filter((status) => ['critical', 'attention', 'monitor'].includes(status)).length
  const overall = assessment.overall_screening
  if (CONDITIONS[overall] && overall !== 'no_concerns_recorded') {
    const extra = unevaluated ? ` ${unevaluated} could not be evaluated from what was recorded.` : ''
    return { ...CONDITIONS[overall], summary: `Screening flagged ${flagged} of ${categories.length} categories.${extra}` }
  }
  if (overall === 'no_concerns_recorded' && unevaluated === 0) {
    return { ...CONDITIONS.no_concerns_recorded, summary: 'No screening rule fired in any evaluated category. This reflects what was recorded and is not a mechanical certification.' }
  }
  return { ...CONDITIONS.limited, summary: `${unevaluated} of ${categories.length} categories could not be evaluated from what was recorded, so no overall condition is assigned.` }
}

/* Survey examples. These are placeholder hints only: they are never pre-filled or submitted. */

export const RATING_EXAMPLES = {
  excellent: 'Example: looks and works like new, with no wear seen.',
  good: 'Example: normal wear for its age, and no defect seen.',
  fair: 'Example: wear or a defect was seen, but it does not need immediate work yet.',
  poor: 'Example: a defect was found that needs repair.',
  critical: 'Example: the component is unsafe or unfit for use.',
  not_applicable: 'Example: this vehicle does not have this component.',
  unknown: 'Example: you could not inspect it this time.',
  not_assessed: 'Example: choose Fair if wear is visible but no immediate work is needed.',
}

export const MEASUREMENT_EXAMPLES = {
  oil_pressure_kpa: '250',
  engine_hours: '3200',
  battery_rest_voltage_v: '12.6',
  charging_voltage_v: '14.2',
  cranking_voltage_v: '10.5',
  battery_age_months: '24',
  front_pad_mm: '8',
  rear_pad_mm: '6',
  front_rotor_mm: '26',
  fluid_temperature_c: '85',
  steering_free_play_mm: '10',
  tread_depth_min_mm: '6',
  tire_pressure_min_psi: '32',
  tire_age_months: '36',
  coolant_temperature_c: '90',
  vent_temperature_c: '8',
  ambient_temperature_c: '32',
}

export const FAULT_CODE_EXAMPLES = {
  engine: 'P0301',
  battery_electrical: 'P0562',
  brakes: 'C0035',
  transmission: 'P0700',
  suspension_steering: 'C0460',
  cooling: 'P0118',
  air_conditioning: 'P0530',
}

export const NOTE_EXAMPLES = {
  engine: 'e.g. Slight oil seepage near the valve cover; no drips on the ground.',
  battery_electrical: 'e.g. Light corrosion on the positive terminal; cleaned during inspection.',
  brakes: 'e.g. Front pads about half worn; pedal felt firm on the test drive.',
  transmission: 'e.g. Slight delay shifting into reverse when cold.',
  suspension_steering: 'e.g. Faint knock from the front left over speed bumps.',
  tires_wheels: 'e.g. Rear right tire has a small sidewall scuff; no bulge.',
  cooling: 'e.g. Coolant at the minimum line; topped up during inspection.',
  air_conditioning: 'e.g. Cools well at idle; slight musty smell at start-up.',
}
