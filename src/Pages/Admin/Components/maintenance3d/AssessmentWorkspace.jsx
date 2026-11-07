import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { imageUrl } from '../../../../Services/API/api.js'
import {
  evidenceObjectUrl, getAssessment, getAssessmentCatalog, getAssessmentWorkspace, getCategoryHistory, recordOutcome,
  retryAnalysis, reviewAssessment, saveVehicleProfile, submitAssessment, uploadEvidence, verifyOutcome,
} from '../../../../Services/API/assessmentAPI.js'
import { Chip, PmIcon } from './AssessmentOverview.jsx'
import {
  ANSWERS, CHANGE, CONFIRMATIONS, DECISIONS, FAULT_CODE_EXAMPLES, loadDraft, MEASUREMENT_EXAMPLES, newUuid, NOTE_EXAMPLES, overallCondition, RATING_EXAMPLES,
  RATINGS, REASSESSMENT, RESULTS, SCREENING, SEVERITY, stageTone, STAGE_LEGEND, storeDraft, USAGE, VERIFICATION,
} from './assessmentStatus.js'
import { rigFor } from './rigs.js'
import { formatDate, formatKm, RECORDED_CONDITION_LABELS, todayISO } from './status.js'
import VehicleInspection from './VehicleInspection.jsx'

const InspectionStage = lazy(() => import('./InspectionStage.jsx'))

const MAX_ODOMETER_KM = 2000000
const MAX_FAULT_CODES = 40
const FAULT_CODE = /^[PBCU][0-9][0-9A-F]{3}$/

function emptyComponent(rating = 'not_assessed') {
  return { rating, answers: {}, symptoms: [], measurements: {}, measurementModes: {}, fault_codes: '', last_maintenance_date: '', notes: '' }
}

function emptyForm(catalog, vehicle) {
  const components = {}
  catalog.categories.forEach((category) => { components[category.key] = emptyComponent() })
  // The vehicle record says it has no AC. This is a visible default the assessor can change.
  if (!vehicle.has_air_conditioning) components.air_conditioning = emptyComponent('not_applicable')
  return { assessed_on: todayISO(), odometer_km: '', notes: '', idempotency_key: newUuid(), components }
}

function faultCodes(component) {
  return component.fault_codes.split(/[\s,;]+/).filter(Boolean)
}

function toPayload(form, vehicleId) {
  const components = {}
  Object.entries(form.components).forEach(([key, component]) => {
    const measurements = {}
    Object.entries(component.measurements).forEach(([field, value]) => {
      const mode = component.measurementModes[field] || 'value'
      if (mode !== 'value') measurements[field] = mode
      else if (value !== '' && value !== null) measurements[field] = Number(value)
    })
    Object.keys(component.measurementModes).forEach((field) => {
      if (component.measurementModes[field] !== 'value') measurements[field] = component.measurementModes[field]
    })
    components[key] = {
      rating: component.rating,
      answers: component.answers,
      symptoms: component.symptoms,
      measurements,
      fault_codes: faultCodes(component),
      last_maintenance_date: component.last_maintenance_date || null,
      notes: component.notes || null,
    }
  })
  return {
    vehicle_id: vehicleId,
    idempotency_key: form.idempotency_key,
    assessed_on: form.assessed_on,
    // Blank stays null: zero is a real reading and is sent as 0.
    odometer_km: form.odometer_km === '' ? null : Number(form.odometer_km),
    notes: form.notes || null,
    components,
  }
}

/* The same limits the backend enforces, so problems surface before submitting. */

function detailIssues(form) {
  const issues = []
  if (!form.assessed_on) issues.push('Enter the assessment date.')
  else if (form.assessed_on > todayISO()) issues.push('The assessment date cannot be in the future.')
  if (form.odometer_km !== '') {
    const reading = Number(form.odometer_km)
    if (!Number.isInteger(reading) || reading < 0 || reading > MAX_ODOMETER_KM) issues.push(`Odometer must be a whole number from 0 to ${MAX_ODOMETER_KM.toLocaleString('en-US')} km.`)
  }
  return issues
}

function categoryIssues(category, component, assessedOn) {
  const issues = []
  if (component.rating === 'not_assessed') issues.push('Choose a condition rating.')
  if (component.rating !== 'not_applicable') {
    const open = category.questions.filter((question) => !component.answers[question.key]).length
    if (open) issues.push(`Answer the remaining ${open === 1 ? 'question' : `${open} questions`}.`)
  }
  category.measurements.forEach((measurement) => {
    const raw = component.measurements[measurement.key]
    if ((component.measurementModes[measurement.key] || 'value') !== 'value' || raw === undefined || raw === '') return
    const value = Number(raw)
    if (!Number.isFinite(value) || value < measurement.min || value > measurement.max) {
      issues.push(`${measurement.label} must be between ${measurement.min} and ${measurement.max} ${measurement.unit}.`)
    }
  })
  const codes = faultCodes(component)
  const invalid = codes.filter((code) => !FAULT_CODE.test(code))
  if (invalid.length) issues.push(`Check fault ${invalid.length === 1 ? 'code' : 'codes'} ${invalid.join(', ')}. Use a format such as P0118.`)
  if (codes.length > MAX_FAULT_CODES) issues.push(`Enter at most ${MAX_FAULT_CODES} fault codes.`)
  if (component.last_maintenance_date && assessedOn && component.last_maintenance_date > assessedOn) issues.push('The last maintenance date cannot be after the assessment date.')
  return issues
}

function VehicleThumb({ listing }) {
  return listing?.primary_image
    ? <img className="am-thumb" src={imageUrl(listing.primary_image)} alt="" onError={(event) => { event.currentTarget.style.visibility = 'hidden' }} />
    : <span className="am-thumb am-thumb-empty"><PmIcon name="car" size={22} /></span>
}

/* ------------------------------------------------------------------ Assessment */

function CategoryForm({ category, component, issues, onChange }) {
  const set = (changes) => onChange({ ...component, ...changes })
  const setAnswer = (key, value) => {
    const answers = { ...component.answers }
    if (answers[key] === value) delete answers[key]
    else answers[key] = value
    set({ answers })
  }
  const toggleSymptom = (key) => set({
    symptoms: component.symptoms.includes(key) ? component.symptoms.filter((item) => item !== key) : [...component.symptoms, key],
  })
  const notApplicable = component.rating === 'not_applicable'

  return (
    <div className="am-form-body">
      <header className="am-step-head">
        <h2>{category.name}</h2>
        {category.safety_critical && <span className="am-safety-tag"><PmIcon name="alert" size={13} /> Safety-critical</span>}
      </header>

      <fieldset className="am-field">
        <legend>Condition rating <small>Required</small></legend>
        <div className="am-rating" role="radiogroup" aria-label={`${category.name} rating`}>
          {Object.entries(RATINGS).filter(([key]) => key !== 'not_assessed').map(([key, rating]) => (
            <label key={key} className={`am-rating-option am-tone-${rating.tone}${component.rating === key ? ' is-selected' : ''}`}>
              <input type="radio" name={`rating-${category.key}`} checked={component.rating === key} onChange={() => set({ rating: key })} />
              <b>{rating.short}</b><span>{rating.long || rating.label}</span>
            </label>
          ))}
        </div>
        <p className="am-hint">{RATING_EXAMPLES[component.rating]}</p>
      </fieldset>

      {notApplicable && <p className="am-note">This category does not apply to this vehicle, so the questions below are optional.</p>}

      <fieldset className="am-field">
        <legend>Inspection questions {!notApplicable && <small>Required. Choose Unknown if it could not be checked.</small>}</legend>
        <p className="am-hint">Example: for “{category.questions[0].text}”, choose Yes or No from what you saw, or Unknown if you could not check it.</p>
        {category.questions.map((question) => (
          <div className="am-question" key={question.key}>
            <span>{question.text}</span>
            <div className="am-segment" role="group" aria-label={question.text}>
              {Object.entries(ANSWERS).map(([value, label]) => (
                <button type="button" key={value} className={component.answers[question.key] === value ? 'is-selected' : ''} aria-pressed={component.answers[question.key] === value} onClick={() => setAnswer(question.key, value)}>{label}</button>
              ))}
            </div>
          </div>
        ))}
      </fieldset>

      <fieldset className="am-field">
        <legend>Symptoms <small>Select any that were observed.</small></legend>
        <p className="am-hint">Example: tick “{category.symptoms[0].label}” only if you noticed it. Leave the rest unticked.</p>
        <div className="am-checks">
          {category.symptoms.map((symptom) => (
            <label key={symptom.key}><input type="checkbox" checked={component.symptoms.includes(symptom.key)} onChange={() => toggleSymptom(symptom.key)} />{symptom.label}</label>
          ))}
        </div>
      </fieldset>

      <fieldset className="am-field">
        <legend>Measurements <small>Optional. Leave blank if not taken.</small></legend>
        <p className="am-hint">The grey values are examples only and are not saved. Enter what you actually measured.</p>
        {category.measurements.map((measurement) => {
          const mode = component.measurementModes[measurement.key] || 'value'
          return (
            <div className="am-measure" key={measurement.key}>
              <label htmlFor={`m-${measurement.key}`}>{measurement.label} <small>({measurement.unit})</small></label>
              <input
                id={`m-${measurement.key}`} type="number" step="any" min={measurement.min} max={measurement.max} disabled={mode !== 'value'}
                placeholder={MEASUREMENT_EXAMPLES[measurement.key] ? `e.g. ${MEASUREMENT_EXAMPLES[measurement.key]}` : undefined}
                value={mode === 'value' ? (component.measurements[measurement.key] ?? '') : ''}
                onChange={(event) => {
                  const measurements = { ...component.measurements }
                  if (event.target.value === '') delete measurements[measurement.key]
                  else measurements[measurement.key] = event.target.value
                  set({ measurements })
                }}
              />
              <select aria-label={`${measurement.label} state`} value={mode} onChange={(event) => set({ measurementModes: { ...component.measurementModes, [measurement.key]: event.target.value } })}>
                <option value="value">Measured</option>
                <option value="unknown">Unknown</option>
                <option value="not_applicable">N/A</option>
              </select>
            </div>
          )
        })}
      </fieldset>

      <div className="am-field-row">
        {category.supports_fault_codes && (
          <label>Fault codes <small>Optional</small><input placeholder={`e.g. ${FAULT_CODE_EXAMPLES[category.key] || 'P0118'}`} value={component.fault_codes} onChange={(event) => set({ fault_codes: event.target.value.toUpperCase() })} /></label>
        )}
        <label>Last maintenance date <small>Optional</small><input type="date" max={todayISO()} value={component.last_maintenance_date} onChange={(event) => set({ last_maintenance_date: event.target.value })} /><span className="am-hint">Example: the date of the last service on this part, such as 03/15/2026.</span></label>
      </div>
      <label className="am-field-block">Assessor notes <small>Optional</small><textarea rows={3} maxLength={4000} placeholder={NOTE_EXAMPLES[category.key]} value={component.notes} onChange={(event) => set({ notes: event.target.value })} /></label>

      {issues.length > 0 && (
        <div className="am-needed" role="status">
          <strong>Still needed in this category</strong>
          <ul>{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
        </div>
      )}
    </div>
  )
}

function ReviewCategory({ category, component, issues, onEdit }) {
  const rating = RATINGS[component.rating]
  const symptoms = category.symptoms.filter((symptom) => component.symptoms.includes(symptom.key)).map((symptom) => symptom.label)
  const answered = Object.keys(component.answers).length
  const measured = category.measurements.filter((item) => (component.measurementModes[item.key] || 'value') === 'value' && component.measurements[item.key] !== undefined)
  return (
    <li className={`am-review-item${issues.length ? ' is-incomplete' : ''}`}>
      <div className="am-review-head">
        <strong>{category.name}</strong>
        {component.rating !== 'not_assessed' && <Chip tone={rating.tone}>{rating.long || rating.label}</Chip>}
        <button type="button" className="am-link" onClick={onEdit}>{issues.length ? 'Complete' : 'Edit'}</button>
      </div>
      {issues.length > 0
        ? <ul className="am-review-issues">{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
        : (
          <p>
            {answered} of {category.questions.length} questions answered
            {symptoms.length > 0 && <>. Symptoms: {symptoms.join(', ')}</>}
            {measured.length > 0 && <>. Measured: {measured.map((item) => `${item.label} ${component.measurements[item.key]} ${item.unit}`).join(', ')}</>}
            {faultCodes(component).length > 0 && <>. Fault codes: {faultCodes(component).join(', ')}</>}
            .
          </p>
        )}
    </li>
  )
}

const PROCESSING_STEPS = [
  ['Saving vehicle assessment', 'saving'],
  ['Analyzing vehicle condition', 'saving'],
  ['Evaluating maintenance indicators', 'saving'],
  ['Preparing maintenance recommendations', 'preparing'],
]

/** Shows only real request states: the first three lines are one server request, the last one the reload. */
function Processing({ phase, vehicle }) {
  return (
    <section className="am-processing" role="status" aria-live="polite">
      <h2>Processing assessment</h2>
      <p>{vehicle.make} {vehicle.model}. Please keep this page open.</p>
      <ul>
        {PROCESSING_STEPS.map(([label, stage]) => {
          const done = phase === 'preparing' && stage === 'saving'
          return (
            <li key={label} className={done ? 'is-done' : phase === stage ? 'is-active' : ''}>
              {done ? <PmIcon name="check" /> : phase === stage ? <span className="pm-spinner" /> : <PmIcon name="circle" />}
              {label}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function AssessmentFlow({ workspace, catalog, onSubmitted, onExit, onProfileSaved }) {
  const { vehicle } = workspace
  const [form, setForm] = useState(() => loadDraft(vehicle.id) || emptyForm(catalog, vehicle))
  const [step, setStep] = useState('details')
  const [error, setError] = useState('')
  const [phase, setPhase] = useState('idle')
  const panel = useRef(null)

  const steps = useMemo(() => ['details', ...catalog.categories.map((category) => category.key), 'review'], [catalog])
  const stepIndex = steps.indexOf(step)
  const issues = useMemo(() => {
    const result = {}
    catalog.categories.forEach((category) => { result[category.key] = categoryIssues(category, form.components[category.key], form.assessed_on) })
    return result
  }, [catalog, form])
  const details = detailIssues(form)
  const complete = catalog.categories.filter((category) => issues[category.key].length === 0).length
  const total = catalog.categories.length
  const ready = complete === total && details.length === 0
  const category = catalog.categories.find((item) => item.key === step)

  function goTo(next) {
    setStep(next)
    // The admin layout scrolls an inner container. Only move when the panel's top is out of view.
    if (panel.current && panel.current.getBoundingClientRect().top < 70) panel.current.scrollIntoView({ block: 'start' })
  }

  function update(next) {
    setForm(next)
    storeDraft(vehicle.id, next)
  }

  function discard() {
    if (!window.confirm('Discard this draft? The answers entered so far will be removed.')) return
    storeDraft(vehicle.id, null)
    setForm(emptyForm(catalog, vehicle))
    goTo('details')
  }

  async function submit() {
    if (!ready || phase !== 'idle') return
    setPhase('saving')
    setError('')
    let result
    try {
      result = await submitAssessment(toPayload(form, vehicle.id))
      if (Number(result.vehicle_id) !== Number(vehicle.id)) throw new Error('The server returned an assessment for a different vehicle, so it is not shown. Check this vehicle’s history before submitting again.')
    } catch (requestError) {
      // The draft and its idempotency key are kept, so retrying cannot create a duplicate.
      setError(requestError.message)
      setPhase('idle')
      return
    }
    storeDraft(vehicle.id, null)
    setPhase('preparing')
    await onSubmitted(result)
  }

  if (phase !== 'idle') return <Processing phase={phase} vehicle={vehicle} />

  return (
    <div className="am-assess">
      <aside className="am-assess-nav">
        <div className="am-progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={complete} aria-label="Categories completed">
          <div className="am-progress-label"><strong>{complete} of {total}</strong> categories completed</div>
          <div className="am-progress-track"><span style={{ width: `${(complete / total) * 100}%` }} /></div>
        </div>
        <nav className="am-category-nav" aria-label="Assessment steps">
          <button type="button" className={step === 'details' ? 'is-active' : ''} aria-current={step === 'details' ? 'step' : undefined} onClick={() => goTo('details')}>
            <span className={`am-step-mark${details.length ? '' : ' is-done'}`}><PmIcon name={details.length ? 'circle' : 'check'} size={14} /></span>
            <span>Assessment details</span>
          </button>
          {catalog.categories.map((item) => {
            const done = issues[item.key].length === 0
            return (
              <button type="button" key={item.key} className={item.key === step ? 'is-active' : ''} aria-current={item.key === step ? 'step' : undefined} onClick={() => goTo(item.key)}>
                <span className={`am-step-mark${done ? ' is-done' : ''}`}><PmIcon name={done ? 'check' : 'circle'} size={14} /></span>
                <span>{item.name}</span>
                <small>{done ? 'Completed' : 'Incomplete'}</small>
              </button>
            )
          })}
          <button type="button" className={step === 'review' ? 'is-active' : ''} aria-current={step === 'review' ? 'step' : undefined} onClick={() => goTo('review')}>
            <span className={`am-step-mark${ready ? ' is-done' : ''}`}><PmIcon name="clipboard" size={14} /></span>
            <span>Review and submit</span>
          </button>
        </nav>
        <p className="am-note">Answers save automatically on this device while you work.</p>
        <div className="am-nav-actions">
          <button type="button" className="am-link" onClick={onExit}>Save and exit</button>
          <button type="button" className="am-link is-danger" onClick={discard}>Discard draft</button>
        </div>
      </aside>

      <div className="am-assess-form" ref={panel}>
        <div key={step} className="am-step-panel">
          {step === 'details' && (
            <div className="am-form-body">
              <header className="am-step-head"><h2>Assessment details</h2></header>
              <div className="am-field-row">
                <label>Assessment date <small>Required</small><input type="date" required max={todayISO()} value={form.assessed_on} onChange={(event) => update({ ...form, assessed_on: event.target.value })} /><span className="am-hint">Example: today’s date, if you inspected the vehicle today.</span></label>
                <label>Odometer (km) <small>Optional</small><input type="number" min="0" max={MAX_ODOMETER_KM} step="1" placeholder="e.g. 45200" value={form.odometer_km} onChange={(event) => update({ ...form, odometer_km: event.target.value })} /><span className="am-hint">Read it from the dashboard. {vehicle.current_mileage === null ? 'No mileage is recorded yet.' : `Last recorded: ${vehicle.current_mileage.toLocaleString('en-US')} km.`}</span></label>
              </div>
              <label className="am-field-block">General notes <small>Optional</small><textarea rows={3} maxLength={4000} placeholder="e.g. Inspected at the main garage after a 3-day rental." value={form.notes} onChange={(event) => update({ ...form, notes: event.target.value })} /></label>
              {details.length > 0 && <div className="am-needed" role="status"><ul>{details.map((issue) => <li key={issue}>{issue}</li>)}</ul></div>}
              <details className="am-disclosure">
                <summary>Vehicle profile</summary>
                <ProfileTab key={vehicle.id} workspace={workspace} onSaved={onProfileSaved} />
              </details>
            </div>
          )}
          {category && (
            <CategoryForm
              category={category}
              component={form.components[step]}
              issues={issues[step]}
              onChange={(component) => update({ ...form, components: { ...form.components, [step]: component } })}
            />
          )}
          {step === 'review' && (
            <div className="am-form-body">
              <header className="am-step-head"><h2>Review and submit</h2></header>
              <dl className="am-status-grid">
                <div><dt>Assessment date</dt><dd>{formatDate(form.assessed_on) || 'Not entered'}</dd></div>
                <div><dt>Odometer</dt><dd>{form.odometer_km === '' ? 'Not recorded' : formatKm(form.odometer_km)}</dd></div>
              </dl>
              {details.length > 0 && <div className="am-needed" role="status"><ul>{details.map((issue) => <li key={issue}>{issue}</li>)}</ul></div>}
              <ul className="am-review">
                {catalog.categories.map((item) => <ReviewCategory key={item.key} category={item} component={form.components[item.key]} issues={issues[item.key]} onEdit={() => goTo(item.key)} />)}
              </ul>
              {error && <p className="am-error" role="alert">{error}</p>}
              <p className="am-note">Submitting creates a new assessment record. Earlier assessments for this vehicle are kept.</p>
            </div>
          )}
        </div>

        <div className="am-submit-bar">
          <button type="button" disabled={stepIndex === 0} onClick={() => goTo(steps[stepIndex - 1])}><PmIcon name="left" /> Previous</button>
          {step === 'review' ? (
            <button type="button" className="is-primary" disabled={!ready} onClick={submit}>Submit assessment</button>
          ) : (
            <button type="button" className="is-primary" onClick={() => goTo(steps[stepIndex + 1])}>Next <PmIcon name="right" /></button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ Results */

function SafetyWarnings({ warnings }) {
  if (!warnings?.length) return null
  return (
    <section className="am-safety" role="alert" aria-label="Safety warnings">
      <h2><PmIcon name="alert" /> {warnings.length} safety {warnings.length === 1 ? 'warning' : 'warnings'}</h2>
      <ul>
        {warnings.map((warning) => (
          <li key={warning.id}>
            <strong>{warning.component_name}: {warning.observation}</strong>
            <span>{warning.reason}</span>
            <b>{warning.recommended_action}</b>
          </li>
        ))}
      </ul>
    </section>
  )
}

function EvidenceImage({ item }) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    let active = true
    let created = null
    evidenceObjectUrl(item.id).then((objectUrl) => {
      created = objectUrl
      if (active) setUrl(objectUrl)
    }).catch(() => {})
    return () => {
      active = false
      if (created) URL.revokeObjectURL(created)
    }
  }, [item.id])
  return url ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={item.original_name} /></a> : <span className="am-note">{item.original_name}</span>
}

function Findings({ findings }) {
  if (findings.length === 0) return <p className="am-note">No screening rule was triggered. This does not mean the component is healthy.</p>
  return (
    <ul className="am-findings">
      {findings.map((finding) => (
        <li key={finding.id}>
          <Chip tone={SEVERITY[finding.severity].tone}>{SEVERITY[finding.severity].label}</Chip>
          <div><strong>{finding.observation}</strong><span>{finding.reason}</span><b>{finding.recommended_action}</b></div>
        </li>
      ))}
    </ul>
  )
}

function RecordedDetails({ category, component }) {
  const symptoms = category.symptoms.filter((symptom) => component.symptoms.includes(symptom.key)).map((symptom) => symptom.label)
  const answers = category.questions.filter((question) => component.answers[question.key])
  const measured = category.measurements.filter((item) => component.measurements[item.key] !== undefined)
  if (!symptoms.length && !answers.length && !measured.length && !component.fault_codes.length && !component.last_maintenance_date && !component.notes) return null
  return (
    <details className="am-disclosure">
      <summary>Recorded assessment details</summary>
      <dl className="am-recorded">
        {answers.map((question) => <div key={question.key}><dt>{question.text}</dt><dd>{ANSWERS[component.answers[question.key]]}</dd></div>)}
        {symptoms.length > 0 && <div><dt>Symptoms</dt><dd>{symptoms.join(', ')}</dd></div>}
        {measured.map((item) => <div key={item.key}><dt>{item.label}</dt><dd>{formatMeasurement(component.measurements[item.key])} {typeof component.measurements[item.key] === 'number' ? item.unit : ''}</dd></div>)}
        {component.fault_codes.length > 0 && <div><dt>Fault codes</dt><dd>{component.fault_codes.join(', ')}</dd></div>}
        {component.last_maintenance_date && <div><dt>Last maintenance</dt><dd>{formatDate(component.last_maintenance_date)}</dd></div>}
        {component.notes && <div><dt>Notes</dt><dd>{component.notes}</dd></div>}
      </dl>
    </details>
  )
}

function Prediction({ ai }) {
  const elevated = ai.risk_level === 'elevated'
  return (
    <div className={`am-prediction${elevated ? ' is-elevated' : ''}`}>
      <h4>Machine learning prediction, within {ai.prediction.horizon_days} days</h4>
      <p><Chip tone={elevated ? 'poor' : 'good'}>{elevated ? 'Elevated risk' : 'Not elevated'}</Chip></p>
      <p>{ai.prediction.explanation}</p>
      <small>On its evaluation data this model caught {Math.round(ai.prediction.evaluation.recall * ai.prediction.evaluation.faults)} of {ai.prediction.evaluation.faults} faults. It estimates risk and does not replace an inspection.</small>
    </div>
  )
}

function CategoryResult({ category, assessment, canInspect, onInspect, onChanged }) {
  const component = assessment.components[category.key]
  const findings = assessment.findings.filter((finding) => finding.category_key === category.key)
  const ai = assessment.analysis.findings[category.key]
  const evidence = assessment.evidence.filter((item) => item.category_key === category.key)
  const [error, setError] = useState('')
  const rating = RATINGS[component.rating]
  const screening = SCREENING[component.screening_status]
  const safetyFlag = category.safety_critical && findings.length > 0
  const references = (ai?.identified_faults?.length || 0) + (ai?.diagnostic_guidance?.length || 0)

  async function attach(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError('')
    try {
      await uploadEvidence(assessment.id, category.key, file)
      onChanged(await getAssessment(assessment.id))
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  return (
    <details className={`am-result${safetyFlag ? ' is-safety' : ''}`} open={findings.length > 0}>
      <summary>
        <span className="am-result-name">
          {category.name}
          {category.safety_critical && <span className="am-safety-tag"><PmIcon name="alert" size={13} /> Safety-critical</span>}
        </span>
        <span className="am-result-chips">
          <Chip tone={rating.tone} title="Condition rating recorded by the assessor">{rating.label}</Chip>
          <Chip tone={screening.tone} title="Result of the condition-based screening rules">{screening.label}</Chip>
        </span>
      </summary>
      <div className="am-result-body">
        <Findings findings={findings} />

        {component.missing_questions.length > 0 && <p className="am-note">Answered Unknown or not answered: {component.missing_questions.join(' ')}</p>}

        <RecordedDetails category={category} component={component} />

        {references > 0 && (
          <details className="am-disclosure">
            <summary>Fault code and reference information</summary>
            {ai.identified_faults.map((fault) => (
              <div className="am-fault" key={fault.code}>
                <strong>{fault.found ? fault.title : `${fault.code}: not in the reference`}</strong>
                <p>{fault.explanation}</p>
                {fault.recorded_under_other_category && <small className="am-flag">This code may belong to another category.</small>}
                {fault.source && <small>Source: {fault.source}. Generic meaning; manufacturer definitions can differ.</small>}
              </div>
            ))}
            {ai.diagnostic_guidance.length > 0 && <p className="am-note">Possibly related reference, matched on symptom wording. It is not a diagnosis of this vehicle.</p>}
            {ai.diagnostic_guidance.map((guide) => (
              <div className="am-fault" key={guide.title}>
                <strong>{guide.title}</strong>
                <p>{guide.text}</p>
                <small>Source: {guide.source}. {guide.note}</small>
              </div>
            ))}
          </details>
        )}

        {ai?.prediction?.available && <Prediction ai={ai} />}

        <div className="am-evidence">
          {evidence.map((item) => <EvidenceImage key={item.id} item={item} />)}
          <label className="am-file">Attach photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={attach} /></label>
          {canInspect && <button type="button" className="am-link" onClick={() => onInspect(category.key)}><PmIcon name="cube" size={14} /> View in 3D</button>}
          {error && <p className="am-error" role="alert">{error}</p>}
        </div>
      </div>
    </details>
  )
}

/** One statement for the whole assessment, so unavailability is never repeated per component. */
function PredictionNotice({ assessment, catalog }) {
  const available = catalog.categories.filter((category) => assessment.analysis.findings[category.key]?.prediction?.available)
  let text
  if (['failed', 'pending', 'processing'].includes(assessment.ai_status)) {
    text = 'Machine learning availability will be known once the analysis has finished. The findings above are complete without it.'
  } else if (available.length === 0) {
    text = 'Machine learning prediction is not currently available for any category, so no risk figures are shown. The findings above come from condition-based screening of this assessment.'
  } else {
    const others = catalog.categories.filter((category) => !available.includes(category)).map((category) => category.name)
    text = `Machine learning prediction is shown for ${available.map((category) => category.name).join(', ')}.${others.length ? ` It is not currently available for ${others.join(', ')}, which rely on condition-based screening.` : ''}`
  }
  return <p className="am-prediction-notice"><strong>Predictive information.</strong> {text}</p>
}

function ResultsSummary({ assessment, catalog, vehicle, partsByCategory, onInspect, onChanged, onReassess }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notes, setNotes] = useState('')

  async function act(action) {
    setBusy(true)
    setError('')
    try {
      onChanged(await action())
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  const condition = overallCondition(assessment, catalog.categories)
  return (
    <div className="am-results">
      <section className={`am-summary am-tone-${condition.tone}`} aria-label="Vehicle overview">
        <div className="am-summary-vehicle">
          <dl className="am-status-grid">
            <div><dt>Assessment date</dt><dd>{formatDate(assessment.assessed_on)}</dd></div>
            <div><dt>Assessed by</dt><dd>{assessment.assessor_name}</dd></div>
            <div><dt>Odometer at assessment</dt><dd>{assessment.odometer_km === null ? 'Not recorded' : formatKm(assessment.odometer_km)}</dd></div>
            <div><dt>Current mileage</dt><dd>{vehicle.current_mileage === null ? 'Not recorded' : formatKm(vehicle.current_mileage)}</dd></div>
            <div><dt>Safety warnings</dt><dd>{assessment.safety_warning_count}</dd></div>
            <div><dt>Review</dt><dd>{assessment.review_status === 'reviewed' ? 'Reviewed' : 'Not yet reviewed'}</dd></div>
          </dl>
        </div>
        <div className="am-summary-condition">
          <span>Overall condition</span>
          <strong>{condition.label}</strong>
          <p>{condition.summary}</p>
          <dl className="am-summary-priority"><dt>Maintenance priority</dt><dd>{condition.priority}</dd></dl>
        </div>
      </section>

      {assessment.odometer_flag === 'decrease' && <p className="am-flag">Odometer is lower than the previous reading of {formatKm(assessment.previous_odometer_km)}. Vehicle mileage was not changed.</p>}
      {['failed', 'pending'].includes(assessment.ai_status) && (
        <div className="am-banner">
          <p>The assessment and its findings are saved. Fault code lookup could not finish, so it is missing until a retry succeeds.</p>
          <button type="button" disabled={busy} onClick={() => act(() => retryAnalysis(assessment.id))}>{busy ? 'Retrying…' : 'Retry analysis'}</button>
        </div>
      )}
      {error && <p className="am-error" role="alert">{error}</p>}

      <SafetyWarnings warnings={assessment.safety_warnings} />

      <h2 className="am-results-title">Component results</h2>
      {catalog.categories.map((category) => (
        <CategoryResult key={category.key} category={category} assessment={assessment} canInspect={partsByCategory.has(category.key)} onInspect={onInspect} onChanged={onChanged} />
      ))}

      <PredictionNotice assessment={assessment} catalog={catalog} />

      {assessment.review_status === 'reviewed' ? (
        <p className="am-note">Reviewed {formatDate(assessment.reviewed_at)}{assessment.review_notes ? `: ${assessment.review_notes}` : '.'}</p>
      ) : (
        <div className="am-inline-form">
          <label>Review notes<input maxLength={4000} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
          <button type="button" disabled={busy} onClick={() => act(() => reviewAssessment(assessment.id, notes))}>Mark as reviewed</button>
        </div>
      )}
      <div className="am-results-actions">
        <button type="button" onClick={onReassess}><PmIcon name="clipboard" /> New assessment</button>
        <button type="button" className="is-primary" onClick={() => onInspect(null)}><PmIcon name="cube" /> Explore 3D inspection</button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ 3D inspection */

function Inspection3D({ assessment, catalog, vehicle, parts, rig, initialCategory, onBack }) {
  const firstPart = useCallback((categoryKey) => {
    const entry = catalog.categories.find((item) => item.key === categoryKey)
    return entry?.component_keys.find((key) => rig?.components[key] && parts.some((part) => part.key === key)) || null
  }, [catalog, parts, rig])

  const [categoryKey, setCategoryKey] = useState(initialCategory)
  const [selectedPart, setSelectedPart] = useState(() => (initialCategory ? firstPart(initialCategory) : null))

  // Hotspots show the assessment on screen, so an older one is never coloured by newer data.
  const stageParts = useMemo(() => parts.filter((part) => part.category_key).map((part) => {
    const status = assessment.components[part.category_key]?.screening_status || 'not_assessed'
    return { key: part.key, name: part.name, tone: stageTone(status), statusLabel: SCREENING[status].label }
  }), [parts, assessment])

  const selectPart = useCallback((key) => {
    setSelectedPart(key)
    const part = parts.find((item) => item.key === key)
    if (part?.category_key) setCategoryKey(part.category_key)
  }, [parts])

  function selectCategory(key) {
    setCategoryKey(key)
    setSelectedPart(firstPart(key))
  }

  const category = catalog.categories.find((item) => item.key === categoryKey)
  const component = category ? assessment.components[category.key] : null
  const selected = parts.find((part) => part.key === selectedPart)

  return (
    <div className="am-inspect">
      <div className="am-inspect-stage">
        {rig ? (
          <div className="am-stage-frame">
            <Suspense fallback={<div className="pm-stage pm-stage-message" role="status"><div><span className="pm-spinner" />Loading 3D model…</div></div>}>
              <InspectionStage rig={rig} vehicle={vehicle} components={stageParts} selectedKey={selectedPart} onSelect={selectPart} legend={STAGE_LEGEND}>
                {selected && component && (
                  <div className="am-callout">
                    <strong>{selected.name}</strong>
                    <Chip tone={SCREENING[component.screening_status].tone}>{SCREENING[component.screening_status].label}</Chip>
                  </div>
                )}
              </InspectionStage>
            </Suspense>
          </div>
        ) : <p className="am-note am-no-rig">No 3D model exists for the category “{vehicle.category}”. The findings for each category are listed here.</p>}
      </div>

      <aside className="am-inspect-side">
        <button type="button" className="am-back" onClick={onBack}><PmIcon name="left" /> Maintenance summary</button>
        <nav className="am-category-nav am-inspect-nav" aria-label="Vehicle categories">
          {catalog.categories.map((item) => {
            const status = SCREENING[assessment.components[item.key].screening_status]
            return (
              <button type="button" key={item.key} className={item.key === categoryKey ? 'is-active' : ''} aria-current={item.key === categoryKey ? 'true' : undefined} onClick={() => selectCategory(item.key)}>
                <span>{item.name}</span>
                <Chip tone={status.tone}>{status.label}</Chip>
              </button>
            )
          })}
        </nav>
        {category ? (
          <section className="am-inspect-detail">
            <h3>{category.name}</h3>
            <p className="am-note">Condition rating: {RATINGS[component.rating].long || RATINGS[component.rating].label}. The rating applies to every part in this category.</p>
            <Findings findings={assessment.findings.filter((finding) => finding.category_key === category.key)} />
          </section>
        ) : <p className="am-note">Select a category or a marker on the vehicle to see its assessment findings.</p>}
      </aside>
    </div>
  )
}

/* ------------------------------------------------------------------ History */

function formatMeasurement(value) {
  if (value === undefined || value === null) return '–'
  return ANSWERS[value] || String(value)
}

function ComparisonTable({ assessment, catalog }) {
  const comparison = assessment?.comparison
  if (!comparison) return <p className="am-empty">A comparison appears once the vehicle has two assessments.</p>
  return (
    <section className="am-section">
      <h3>Compared with {formatDate(comparison.previous_assessed_on)} ({comparison.previous_odometer_km === null ? 'odometer not recorded' : formatKm(comparison.previous_odometer_km)})</h3>
      <div className="am-table-wrap">
        <table className="am-table">
          <thead><tr><th>Category</th><th>Previous</th><th>Latest</th><th>Change</th><th>Measurements</th></tr></thead>
          <tbody>
            {catalog.categories.map((category) => {
              const row = comparison.categories[category.key]
              const change = CHANGE[row.change]
              const measured = category.measurements.filter((item) => row.current_measurements[item.key] !== undefined || row.previous_measurements[item.key] !== undefined)
              return (
                <tr key={category.key}>
                  <td>{category.name}</td>
                  <td>{row.previous_rating ? RATINGS[row.previous_rating].label : '–'}</td>
                  <td>{RATINGS[row.current_rating].label}</td>
                  <td><Chip tone={change.tone}>{change.label}</Chip></td>
                  <td>{measured.map((item) => <small key={item.key}>{item.label}: {formatMeasurement(row.previous_measurements[item.key])} → {formatMeasurement(row.current_measurements[item.key])} {item.unit}</small>)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function HistoryTab({ workspace, catalog, assessment, onView }) {
  const [categoryKey, setCategoryKey] = useState(catalog.categories[0].key)
  const [state, setState] = useState({ key: null, data: null, error: '' })
  const vehicleId = workspace.vehicle.id

  useEffect(() => {
    let active = true
    getCategoryHistory(vehicleId, categoryKey)
      .then((data) => { if (active) setState({ key: categoryKey, data, error: '' }) })
      .catch((error) => { if (active) setState({ key: categoryKey, data: null, error: error.message }) })
    return () => { active = false }
  }, [vehicleId, categoryKey])

  const data = state.key === categoryKey ? state.data : null

  return (
    <div className="am-history">
      <section className="am-section">
        <h3>Assessment history</h3>
        <ul className="am-past-list">
          {workspace.history.map((row) => {
            const screening = SCREENING[row.overall_screening]
            return (
              <li key={row.id}>
                <strong>{formatDate(row.assessed_on)}</strong>
                {screening && <Chip tone={screening.tone}>{screening.label}</Chip>}
                <small>{[row.assessor_name, row.odometer_km === null ? 'Odometer not recorded' : formatKm(row.odometer_km), row.safety_warning_count > 0 ? `${row.safety_warning_count} safety ${row.safety_warning_count === 1 ? 'warning' : 'warnings'}` : null].filter(Boolean).join(' · ')}</small>
                {row.id === assessment?.id ? <span className="is-shown">Shown now</span> : <button type="button" className="am-link" onClick={() => onView(row.id)}>View results</button>}
              </li>
            )
          })}
        </ul>
      </section>
      <ComparisonTable assessment={assessment} catalog={catalog} />
      <section className="am-section">
        <div className="am-section-head">
          <h3>Component history</h3>
          <select aria-label="Category" value={categoryKey} onChange={(event) => setCategoryKey(event.target.value)}>
            {catalog.categories.map((category) => <option key={category.key} value={category.key}>{category.name}</option>)}
          </select>
        </div>
        {state.key === categoryKey && state.error && <p className="am-error" role="alert">{state.error}</p>}
        {!data && !state.error && <p className="am-note" role="status">Loading…</p>}
        {data && (
          <>
            {data.assessments.length === 0 && <p className="am-empty">No assessments recorded for this category.</p>}
            {data.assessments.length > 0 && (
              <div className="am-table-wrap">
                <table className="am-table">
                  <thead><tr><th>Date</th><th>Rating</th><th>Screening</th><th>Odometer</th><th>Fault codes</th><th>Assessor</th></tr></thead>
                  <tbody>
                    {data.assessments.map((row) => (
                      <tr key={row.assessment_id}>
                        <td>{formatDate(row.assessed_on)}</td>
                        <td><Chip tone={RATINGS[row.rating].tone}>{RATINGS[row.rating].label}</Chip></td>
                        <td>{SCREENING[row.screening_status].label}</td>
                        <td>{row.odometer_km === null ? <em>Not recorded</em> : formatKm(row.odometer_km)}</td>
                        <td>{row.fault_codes.join(', ') || '–'}</td>
                        <td>{row.assessor_name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {data.legacy_inspections.length > 0 && (
              <>
                <h4>Earlier inspections (original three-level scale)</h4>
                <p className="am-note">Shown as recorded. These ratings are not converted to the five-level scale.</p>
                <div className="am-table-wrap">
                  <table className="am-table">
                    <thead><tr><th>Date</th><th>Component</th><th>Original rating</th><th>Findings</th><th>Work performed</th></tr></thead>
                    <tbody>
                      {data.legacy_inspections.map((row) => (
                        <tr key={row.id}>
                          <td>{formatDate(row.inspected_on)}</td>
                          <td>{row.component_key}</td>
                          <td>{RECORDED_CONDITION_LABELS[row.condition_rating] || row.condition_rating}</td>
                          <td>{row.findings || '–'}</td>
                          <td>{row.work_performed || '–'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {data.outcomes.length > 0 && <OutcomeList outcomes={data.outcomes} />}

            <h4>Vehicle service records</h4>
            {data.service_records.length === 0 ? <p className="am-note">No service records. These are vehicle-wide, not tied to one component.</p> : (
              <div className="am-table-wrap">
                <table className="am-table">
                  <thead><tr><th>Date</th><th>Type</th><th>Status</th><th>Odometer</th></tr></thead>
                  <tbody>
                    {data.service_records.map((row) => (
                      <tr key={row.id}><td>{formatDate(row.date)}</td><td>{row.type}</td><td>{row.status}</td><td>{row.odometer_km === null ? <em>Not recorded</em> : formatKm(row.odometer_km)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}

/* ------------------------------------------------------------------ Outcomes */

function OutcomeList({ outcomes, canVerify, onVerify }) {
  return (
    <ul className="am-outcomes">
      {outcomes.map((outcome) => (
        <li key={outcome.id}>
          <div className="am-outcome-head">
            <strong>{DECISIONS[outcome.decision]}</strong>
            <span>{RESULTS[outcome.result]}</span>
            <Chip tone={outcome.verification_status === 'verified' ? 'good' : outcome.verification_status === 'rejected' ? 'failed' : 'pending'}>{VERIFICATION[outcome.verification_status]}</Chip>
          </div>
          <p><small>Original recommendation, {formatDate(outcome.recommended_at)}:</small> {outcome.original_recommendation}</p>
          <p>{CONFIRMATIONS[outcome.mechanic_confirmed]}{outcome.mechanic_name ? ` · ${outcome.mechanic_name}` : ''}</p>
          {outcome.maintenance_performed && <p>Work: {outcome.maintenance_performed}</p>}
          {outcome.parts_replaced && <p>Parts: {outcome.parts_replaced}</p>}
          <p>
            {outcome.failure_date && `Failed ${formatDate(outcome.failure_date)}. `}
            {outcome.repair_date && `Repaired ${formatDate(outcome.repair_date)}. `}
            {outcome.mileage_km !== null && `At ${formatKm(outcome.mileage_km)}.`}
          </p>
          {canVerify && outcome.verification_status === 'unverified' && (
            <div className="am-outcome-actions">
              <button type="button" onClick={() => onVerify(outcome.id, 'verified')}>Verify</button>
              <button type="button" onClick={() => onVerify(outcome.id, 'rejected')}>Reject</button>
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

function OutcomesTab({ assessment, catalog, parts, onChanged }) {
  const initial = { source: '', outcome_date: '', decision: 'deferred', mechanic_confirmed: 'not_checked', result: 'pending', component_key: '', maintenance_performed: '', parts_replaced: '', failure_date: '', repair_date: '', mileage_km: '', mechanic_name: '', notes: '' }
  const [form, setForm] = useState(initial)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  if (!assessment) return <p className="am-empty">Outcomes are recorded against an assessment. None exists for this vehicle yet.</p>

  const findings = assessment.findings.filter((finding) => finding.category_key)
  const flagged = new Set(findings.map((item) => item.category_key))
  const finding = findings.find((item) => `f:${item.id}` === form.source)
  const categoryKey = finding?.category_key || (form.source.startsWith('c:') ? form.source.slice(2) : undefined)
  const set = (field) => (event) => setForm({ ...form, [field]: event.target.value })
  const categoryParts = categoryKey ? parts.filter((part) => part.category_key === categoryKey) : []

  async function submit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await recordOutcome(assessment.id, categoryKey, {
        ...form,
        finding_id: finding ? finding.id : null,
        mileage_km: form.mileage_km === '' ? null : Number(form.mileage_km),
      })
      setForm(initial)
      onChanged(await getAssessment(assessment.id))
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  async function verify(id, status) {
    setError('')
    try {
      await verifyOutcome(id, status)
      onChanged(await getAssessment(assessment.id))
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  return (
    <div className="am-outcome-layout">
      <form className="am-section am-outcome-form" onSubmit={submit}>
        <h3>Record a maintenance outcome</h3>
        <>
            <label className="am-field-block">Recommendation or category
              <select required value={form.source} onChange={set('source')}>
                <option value="">Choose one</option>
                {findings.map((item) => <option key={item.id} value={`f:${item.id}`}>{item.component_name}: {item.recommended_action}</option>)}
                {catalog.categories.filter((category) => !flagged.has(category.key)).map((category) => <option key={category.key} value={`c:${category.key}`}>{category.name}: nothing was flagged</option>)}
              </select>
            </label>
            <p className="am-note">Record healthy results too, using No fault found, so the history is not limited to problems.</p>
            <div className="am-field-row">
              <label>Decision<select value={form.decision} onChange={set('decision')}>{Object.entries(DECISIONS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
              <label>Mechanic confirmation<select value={form.mechanic_confirmed} onChange={set('mechanic_confirmed')}>{Object.entries(CONFIRMATIONS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
              <label>Result<select value={form.result} onChange={set('result')}>{Object.entries(RESULTS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            </div>
            <div className="am-field-row">
              <label>Component
                <select value={form.component_key} onChange={set('component_key')}>
                  <option value="">Whole category</option>
                  {categoryParts.map((part) => <option key={part.key} value={part.key}>{part.name}</option>)}
                </select>
              </label>
              <label>Mechanic<input maxLength={150} value={form.mechanic_name} onChange={set('mechanic_name')} /></label>
              <label>Mileage (km)<input type="number" min="0" placeholder="Not recorded" value={form.mileage_km} onChange={set('mileage_km')} /></label>
            </div>
            <div className="am-field-row">
              <label>Failure date<input type="date" max={todayISO()} value={form.failure_date} onChange={set('failure_date')} /></label>
              <label>Repair date<input type="date" max={todayISO()} value={form.repair_date} onChange={set('repair_date')} /></label>
              <label>Check date, if no fault found<input type="date" max={todayISO()} value={form.outcome_date} onChange={set('outcome_date')} /></label>
            </div>
            <label className="am-field-block">Maintenance performed<textarea rows={2} value={form.maintenance_performed} onChange={set('maintenance_performed')} /></label>
            <label className="am-field-block">Parts replaced<input value={form.parts_replaced} onChange={set('parts_replaced')} /></label>
            <label className="am-field-block">Notes<textarea rows={2} value={form.notes} onChange={set('notes')} /></label>
            {error && <p className="am-error" role="alert">{error}</p>}
            <button type="submit" className="is-primary" disabled={saving}>{saving ? 'Saving…' : 'Record outcome'}</button>
            <p className="am-note">Outcomes stay unverified until someone reviews them below.</p>
        </>
      </form>
      <section className="am-section">
        <h3>Outcomes on this assessment</h3>
        {assessment.outcomes.length === 0 ? <p className="am-empty">None recorded yet.</p> : <OutcomeList outcomes={assessment.outcomes} canVerify onVerify={verify} />}
      </section>
    </div>
  )
}

/* ------------------------------------------------------------------ Profile */

function ProfileTab({ workspace, onSaved }) {
  const { vehicle } = workspace
  const [form, setForm] = useState({
    acquisition_date: vehicle.acquisition_date || '',
    usage_frequency: vehicle.usage_frequency || '',
    previous_maintenance_date: vehicle.previous_maintenance_date || '',
  })
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const set = (field) => (event) => { setSaved(false); setForm({ ...form, [field]: event.target.value }) }

  async function submit(event) {
    event.preventDefault()
    setError('')
    try {
      await saveVehicleProfile(vehicle.id, form)
      setSaved(true)
      onSaved()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  return (
    <form className="am-section am-profile" onSubmit={submit}>
      <h3>Vehicle profile</h3>
      <dl className="am-status-grid">
        <div><dt>Current mileage</dt><dd>{vehicle.current_mileage === null ? 'Not recorded' : formatKm(vehicle.current_mileage)}</dd></div>
        <div><dt>Age from model year</dt><dd>{vehicle.age_years === null ? 'Unavailable' : `${vehicle.age_years} ${vehicle.age_years === 1 ? 'year' : 'years'}`}</dd></div>
        <div><dt>Fuel</dt><dd>{vehicle.fuel_type || 'Not recorded'}</dd></div>
      </dl>
      <div className="am-field-row">
        <label>Acquisition date<input type="date" max={todayISO()} value={form.acquisition_date} onChange={set('acquisition_date')} /><span className="am-hint">Example: the day the vehicle joined the fleet.</span></label>
        <label>Usage frequency
          <select value={form.usage_frequency} onChange={set('usage_frequency')}>
            <option value="">Not recorded</option>
            {Object.entries(USAGE).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        <label>Previous maintenance date<input type="date" max={todayISO()} value={form.previous_maintenance_date} onChange={set('previous_maintenance_date')} /><span className="am-hint">Example: the date of its last general service.</span></label>
      </div>
      {error && <p className="am-error" role="alert">{error}</p>}
      {saved && <p className="am-note" role="status">Vehicle profile saved.</p>}
      <button type="submit" className="is-primary">Save profile</button>
    </form>
  )
}

/* ------------------------------------------------------------------ Workspace */

function FlowSteps({ view, hasAssessment, onFleet, onAssess, onResults }) {
  const steps = [
    ['Select vehicle', onFleet, 'done'],
    ['Assessment', onAssess, view === 'assess' ? 'current' : 'done'],
    ['Results', hasAssessment ? onResults : null, view === 'results' ? 'current' : 'next'],
  ]
  return (
    <ol className="am-flow" aria-label="Workflow">
      {steps.map(([label, action, state], index) => (
        <li key={label} className={`is-${state}`}>
          <button type="button" disabled={!action} aria-current={state === 'current' ? 'step' : undefined} onClick={action || undefined}>
            <span>{index + 1}</span>{label}
          </button>
        </li>
      ))}
    </ol>
  )
}

const RESULT_TABS = [
  ['summary', 'Summary'],
  ['inspect', '3D inspection'],
  ['history', 'History'],
  ['outcomes', 'Maintenance outcomes'],
  ['profile', 'Vehicle profile'],
  ['records', 'Component records'],
]

export default function AssessmentWorkspace({ vehicleId, view, listing, onView, onBack }) {
  const [workspace, setWorkspace] = useState(null)
  const [catalog, setCatalog] = useState(null)
  const [assessment, setAssessment] = useState(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('summary')
  const [focusCategory, setFocusCategory] = useState(null)

  const load = useCallback(async () => {
    setError('')
    try {
      const [nextWorkspace, nextCatalog] = await Promise.all([getAssessmentWorkspace(vehicleId), getAssessmentCatalog()])
      setWorkspace(nextWorkspace)
      setCatalog(nextCatalog)
      setAssessment(nextWorkspace.latest)
    } catch (requestError) {
      setError(requestError.message)
    }
  }, [vehicleId])

  useEffect(() => {
    void Promise.resolve().then(load)
  }, [load])

  const refreshWorkspace = useCallback(async () => {
    try {
      setWorkspace(await getAssessmentWorkspace(vehicleId))
    } catch (requestError) {
      setError(requestError.message)
    }
  }, [vehicleId])

  const submitted = useCallback(async (result) => {
    await refreshWorkspace()
    setAssessment(result)
    setTab('summary')
    onView('results')
  }, [onView, refreshWorkspace])

  const changed = useCallback((result) => {
    setAssessment(result)
    void refreshWorkspace()
  }, [refreshWorkspace])

  const rig = useMemo(() => {
    const vehicle = workspace?.vehicle
    return vehicle?.body_type ? rigFor(vehicle.body_type, { make: vehicle.make, model: vehicle.model }) : null
  }, [workspace?.vehicle])

  const partsByCategory = useMemo(() => {
    const keys = new Set()
    workspace?.parts.forEach((part) => { if (part.category_key && rig?.components[part.key]) keys.add(part.category_key) })
    return keys
  }, [workspace?.parts, rig])

  async function viewPast(id) {
    setError('')
    try {
      const detail = await getAssessment(id)
      setAssessment(detail)
      setTab('summary')
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  function openInspection(categoryKey) {
    setFocusCategory(categoryKey)
    setTab('inspect')
  }

  if (error && !workspace) {
    return (
      <div className="pm-page-state" role="alert">
        <h2>Could not load this vehicle</h2>
        <p>{error}</p>
        <button type="button" className="is-primary" onClick={load}>Retry</button>
        <button type="button" onClick={onBack}>Back to fleet</button>
      </div>
    )
  }
  if (!workspace || !catalog) return <div className="pm-page-state" role="status"><span className="pm-spinner" />Loading vehicle…</div>

  const { vehicle, reassessment, data_flags: flags } = workspace
  const reassessmentStatus = REASSESSMENT[reassessment.status]
  // Results and the 3D view do not exist until an assessment has been submitted.
  const activeView = assessment && view !== 'assess' ? 'results' : 'assess'
  const viewingPast = assessment && workspace.latest && assessment.id !== workspace.latest.id

  return (
    <section className="am-workspace" aria-label="Vehicle assessment workspace">
      <FlowSteps view={activeView} hasAssessment={Boolean(assessment)} onFleet={onBack} onAssess={() => onView('assess')} onResults={() => onView('results')} />

      <header className="am-workspace-head">
        <VehicleThumb listing={listing} />
        <div className="am-vehicle">
          <h1>{vehicle.make} {vehicle.model} <span>{vehicle.year}</span></h1>
          <p>{[vehicle.plate_number || 'Plate not recorded', `Fleet ID #${vehicle.id}`, vehicle.category, vehicle.current_mileage === null ? 'Mileage not recorded' : formatKm(vehicle.current_mileage)].join(' · ')}</p>
        </div>
        <div className="am-reassess">
          <span>Monthly reassessment</span>
          <Chip tone={reassessmentStatus.tone}>{reassessmentStatus.label}</Chip>
          {reassessment.due_on && <small>Due {formatDate(reassessment.due_on)}</small>}
        </div>
      </header>

      {flags.length > 0 && (
        <div className="am-record-flags" role="note">
          <strong>Vehicle record needs review.</strong> {flags.join(' ')} Nothing has been changed automatically.
        </div>
      )}
      {error && <p className="am-error" role="alert">{error}</p>}

      {activeView === 'assess' ? (
        <AssessmentFlow workspace={workspace} catalog={catalog} onSubmitted={submitted} onExit={onBack} onProfileSaved={refreshWorkspace} />
      ) : (
        <>
          {viewingPast && (
            <div className="am-past" role="status">
              <span>Viewing the assessment from {formatDate(assessment.assessed_on)}, not the latest one.</span>
              <button type="button" className="am-link" onClick={() => viewPast(workspace.latest.id)}>Return to latest</button>
            </div>
          )}
          <div className="am-tabs" role="tablist" aria-label="Assessment results">
            {RESULT_TABS.map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'is-active' : ''} onClick={() => { setFocusCategory(null); setTab(key) }}>{label}</button>
            ))}
          </div>
          <div key={tab} className="am-tab-panel" role="tabpanel">
            {tab === 'summary' && <ResultsSummary assessment={assessment} catalog={catalog} vehicle={vehicle} partsByCategory={partsByCategory} onInspect={openInspection} onChanged={changed} onReassess={() => onView('assess')} />}
            {tab === 'inspect' && <Inspection3D key={assessment.id} assessment={assessment} catalog={catalog} vehicle={vehicle} parts={workspace.parts} rig={rig} initialCategory={focusCategory} onBack={() => setTab('summary')} />}
            {tab === 'history' && <HistoryTab workspace={workspace} catalog={catalog} assessment={assessment} onView={viewPast} />}
            {tab === 'outcomes' && <OutcomesTab assessment={assessment} catalog={catalog} parts={workspace.parts} onChanged={changed} />}
            {tab === 'profile' && <ProfileTab key={vehicle.id} workspace={workspace} onSaved={refreshWorkspace} />}
            {tab === 'records' && <VehicleInspection key={vehicle.id} vehicleId={vehicle.id} onBack={() => setTab('summary')} />}
          </div>
        </>
      )}
    </section>
  )
}
