import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { imageUrl } from '../../../../Services/API/api.js'
import {
  evidenceObjectUrl, getAssessment, getAssessmentCatalog, getAssessmentWorkspace, getCategoryHistory, recordOutcome,
  retryAnalysis, reviewAssessment, saveVehicleProfile, submitAssessment, uploadEvidence, verifyOutcome,
} from '../../../../Services/API/assessmentAPI.js'
import { Chip, PmIcon } from './AssessmentOverview.jsx'
import {
  ANSWERS, answerSufficiency, CHANGE, CONFIRMATIONS, DECISIONS, FAULT_CODE_EXAMPLES, hasDetails, HEALTHY_ANSWERS, hiddenQuestionTexts, loadDraft, LOW_RATINGS,
  MEASUREMENT_EXAMPLES, newUuid, NOTE_EXAMPLES, overallCondition, previousRating, RATING_EXAMPLES, RATINGS, REASSESSMENT, RESULTS, safetyFirst, SCREENING, SEVERITY, stageTone,
  STAGE_LEGEND, storeDraft, SUFFICIENCY_STATES, USAGE, VERIFICATION, visibleQuestions,
} from './assessmentStatus.js'
import { rigFor } from './rigs.js'
import { formatDate, formatKm, RECORDED_CONDITION_LABELS, todayISO } from './status.js'
import VehicleInspection from './VehicleInspection.jsx'
import CarSilhouette from '../../../Users/Components/CarSilhouette.jsx'

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

const ODOMETER_CHECK = 'Check the odometer reading: it is lower than the recorded mileage. Correct it, or confirm it is right.'

function odometerBelowRecorded(form, vehicle) {
  return form.odometer_km !== '' && vehicle.current_mileage !== null && Number.isFinite(Number(form.odometer_km))
    && Number(form.odometer_km) < vehicle.current_mileage
}

function detailIssues(form, vehicle) {
  const issues = []
  if (!form.assessed_on) issues.push('Enter the assessment date.')
  else if (form.assessed_on > todayISO()) issues.push('The assessment date cannot be in the future.')
  if (form.odometer_km !== '') {
    const reading = Number(form.odometer_km)
    if (!Number.isInteger(reading) || reading < 0 || reading > MAX_ODOMETER_KM) issues.push(`Odometer must be a whole number from 0 to ${MAX_ODOMETER_KM.toLocaleString('en-US')} km.`)
  }
  if (odometerBelowRecorded(form, vehicle) && form.odometer_confirmed !== form.odometer_km) {
    issues.push(ODOMETER_CHECK)
  }
  return issues
}

// Only the rating is required. Questions are optional; the remaining checks are the limits the backend enforces.
function categoryIssues(category, component, assessedOn) {
  const issues = []
  if (component.rating === 'not_assessed') issues.push('Choose a condition rating.')
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

function VehicleThumb({ listing, category }) {
  if (listing?.primary_image) return <img className="am-thumb" src={imageUrl(listing.primary_image)} alt="" onError={(event) => { event.currentTarget.style.visibility = 'hidden' }} />
  // CarSilhouette renders nothing for unknown body types; CSS then shows the generic icon instead.
  return <span className="am-thumb am-thumb-empty"><CarSilhouette category={category} /><PmIcon name="car" size={22} /></span>
}

/* ------------------------------------------------------------------ Assessment */

function CategoryForm({ category, component, issues, previous, detailsOpen, onToggleDetails, onChange }) {
  const [filled, setFilled] = useState(null)
  const set = (changes) => onChange({ ...component, ...changes })
  const setAnswer = (key, value) => {
    const answers = { ...component.answers }
    if (answers[key] === value) delete answers[key]
    else answers[key] = value
    setFilled(null)
    set({ answers })
  }
  const toggleSymptom = (key) => set({
    symptoms: component.symptoms.includes(key) ? component.symptoms.filter((item) => item !== key) : [...component.symptoms, key],
  })
  const notApplicable = component.rating === 'not_applicable'
  const questions = visibleQuestions(category)
  const healthy = HEALTHY_ANSWERS[category.key] || {}
  const fillable = questions.filter((question) => healthy[question.key] && !component.answers[question.key])
  const answered = questions.filter((question) => component.answers[question.key]).length
  const sufficiency = answerSufficiency(category, component)
  const state = SUFFICIENCY_STATES[sufficiency.status]
  const withoutNormal = questions.filter((question) => !healthy[question.key] && !component.answers[question.key]).length

  // Fills only unanswered questions whose normal answer the screening rules define. Nothing is submitted.
  function noIssuesFound() {
    const answers = { ...component.answers }
    fillable.forEach((question) => { answers[question.key] = healthy[question.key] })
    setFilled({ count: fillable.length, left: withoutNormal })
    set({ answers })
  }

  return (
    <div className="am-form-body">
      <header className="am-step-head">
        <h2>{category.name}</h2>
        {category.safety_critical && <span className="am-safety-tag"><PmIcon name="alert" size={13} /> Safety-critical</span>}
        <span className="am-step-state"><Chip tone={state.tone}>{state.label}</Chip></span>
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
        <p className="am-previous">
          {previous
            ? <>Last assessment: <Chip tone={RATINGS[previous.rating].tone}>{RATINGS[previous.rating].long || RATINGS[previous.rating].label}</Chip> · {formatDate(previous.date) || 'date not recorded'}</>
            : 'No previous assessment'}
        </p>
        <p className="am-hint">{RATING_EXAMPLES[component.rating]}</p>
      </fieldset>

      <fieldset className="am-field">
        <legend>Inspection questions <small>Optional</small></legend>
        <div className="am-questions-head">
          <span className="am-answered">{answered} of {questions.length} answered</span>
          <button type="button" className="am-noissues" disabled={fillable.length === 0 || notApplicable} onClick={noIssuesFound}>
            <PmIcon name="check" size={14} /> No Issues Found
          </button>
        </div>
        {notApplicable
          ? <p className="am-hint">This category does not apply to this vehicle, so no answers are needed.</p>
          : <p className="am-hint">Answer at least half for sufficient information. <b className="am-normal-key">Normal</b> marks the answer that means no problem.</p>}
        {questions.map((question) => (
          <div className="am-question" key={question.key}>
            <span>{question.text}</span>
            <div className="am-segment" role="group" aria-label={question.text}>
              {Object.entries(ANSWERS).map(([value, label]) => {
                const normal = healthy[question.key] === value
                return (
                  <button type="button" key={value} className={`${component.answers[question.key] === value ? 'is-selected' : ''}${normal ? ' is-normal' : ''}`} aria-pressed={component.answers[question.key] === value} aria-label={normal ? `${label}, normal` : label} onClick={() => setAnswer(question.key, value)}>
                    {label}{normal && <small>Normal</small>}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
        {filled && (
          <p className="am-filled" role="status">
            <PmIcon name="check" size={14} /> Filled {filled.count} {filled.count === 1 ? 'answer' : 'answers'} with the normal result. Change any that do not match what you saw.
            {filled.left > 0 && ` ${filled.left} ${filled.left === 1 ? 'question has' : 'questions have'} no defined normal answer and ${filled.left === 1 ? 'was' : 'were'} left for you.`}
          </p>
        )}
        {sufficiency.status === 'needs_more' && RATINGS[component.rating] && component.rating !== 'unknown' && (
          <p className="am-sufficiency-note">Answer {sufficiency.needed} more {sufficiency.needed === 1 ? 'question' : 'questions'} for sufficient information. You can still submit without them.</p>
        )}
      </fieldset>

      <div className={`am-details${detailsOpen ? ' is-open' : ''}`}>
        <button type="button" className="am-details-toggle" aria-expanded={detailsOpen} onClick={onToggleDetails}>
          <PmIcon name="right" size={14} />
          {detailsOpen ? 'Hide details' : 'Add details'}
          <small>Symptoms, measurements{category.supports_fault_codes ? ', fault codes' : ''}, last service and notes{hasDetails(component) ? ' · details entered' : ''}</small>
        </button>
        {detailsOpen && (
          <div className="am-details-body">
            <fieldset className="am-field">
              <legend>Symptoms <small>Select any that were observed.</small></legend>
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
          </div>
        )}
      </div>

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
  const questions = visibleQuestions(category)
  const answered = questions.filter((question) => component.answers[question.key]).length
  const measured = category.measurements.filter((item) => (component.measurementModes[item.key] || 'value') === 'value' && component.measurements[item.key] !== undefined)
  const sufficiency = answerSufficiency(category, component)
  const state = SUFFICIENCY_STATES[sufficiency.status]
  return (
    <li className={`am-review-item${issues.length ? ' is-incomplete' : ''}`}>
      <div className="am-review-head">
        <strong>{category.name}</strong>
        {component.rating !== 'not_assessed' && <Chip tone={rating.tone}>{rating.long || rating.label}</Chip>}
        {component.rating !== 'not_assessed' && <Chip tone={state.tone}>{state.short}</Chip>}
        <button type="button" className="am-link" onClick={onEdit}>{issues.length ? 'Complete' : 'Edit'}</button>
      </div>
      {issues.length > 0
        ? <ul className="am-review-issues">{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
        : (
          <p>
            {answered} of {questions.length} questions answered
            {sufficiency.status === 'needs_more' && sufficiency.needed > 0 && <> ({sufficiency.needed} more for sufficient information)</>}
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
  const details = detailIssues(form, vehicle)
  const lowOdometer = odometerBelowRecorded(form, vehicle)
  const complete = catalog.categories.filter((category) => issues[category.key].length === 0).length
  const total = catalog.categories.length
  const ready = complete === total && details.length === 0
  const category = catalog.categories.find((item) => item.key === step)
  const limited = catalog.categories.filter((item) => answerSufficiency(item, form.components[item.key]).status === 'needs_more')
  const [detailOverride, setDetailOverride] = useState({})
  // Details open for a low rating or when something is already entered. A manual toggle wins until the rating changes.
  const detailsOpenFor = (key) => detailOverride[key] ?? (LOW_RATINGS.includes(form.components[key].rating) || hasDetails(form.components[key]))

  function goTo(next) {
    setStep(next)
    // The admin layout scrolls an inner container. Move only when the panel's top is above the
    // screen, or so far down (small phones) that the step and its navigation bar are not visible.
    const top = panel.current?.getBoundingClientRect().top
    if (top !== undefined && (top < 70 || top > window.innerHeight * 0.5)) panel.current.scrollIntoView({ block: 'start' })
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
      setError(`${requestError.message} Your answers are kept. If this was a server problem, submitting again is safe: it will not create a second assessment.`)
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
        <div className="am-progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={complete} aria-label="Categories rated">
          <div className="am-progress-label"><span><strong>{complete} of {total}</strong> categories rated</span><b className="am-progress-pct">{Math.round((complete / total) * 100)}%</b></div>
          <div className="am-progress-track"><span style={{ width: `${(complete / total) * 100}%` }} /></div>
        </div>
        <div className="am-step-dots" role="list" aria-label="Assessment steps">
          {steps.map((key, index) => {
            const entry = catalog.categories.find((item) => item.key === key)
            const label = key === 'details' ? 'Assessment details' : key === 'review' ? 'Review and submit' : entry.name
            const component = entry ? form.components[key] : null
            const state = key === 'details' ? (details.length ? 'open' : 'done')
              : key === 'review' ? (ready ? 'done' : 'open')
                : issues[key].length ? (component.rating === 'not_assessed' ? 'open' : 'error')
                  : answerSufficiency(entry, component).status === 'needs_more' ? 'partial' : 'done'
            const stateLabel = { open: 'not complete', done: 'complete', partial: 'needs more information', error: 'check entries' }[state]
            return (
              <button type="button" role="listitem" key={key} className={`is-${state}${key === step ? ' is-current' : ''}`} aria-current={key === step ? 'step' : undefined} aria-label={`${label}: ${stateLabel}`} title={label} onClick={() => goTo(key)}>
                {key === 'details' ? <PmIcon name="car" size={14} /> : key === 'review' ? <PmIcon name="clipboard" size={14} /> : index}
              </button>
            )
          })}
        </div>
        <nav className="am-category-nav" aria-label="Assessment steps">
          <button type="button" className={step === 'details' ? 'is-active' : ''} aria-current={step === 'details' ? 'step' : undefined} onClick={() => goTo('details')}>
            <span className={`am-step-mark${details.length ? '' : ' is-done'}`}><PmIcon name={details.length ? 'circle' : 'check'} size={14} /></span>
            <span>Assessment details</span>
          </button>
          {catalog.categories.map((item) => {
            const done = issues[item.key].length === 0
            const component = form.components[item.key]
            const note = !done ? (component.rating === 'not_assessed' ? 'Not rated' : 'Check entries') : SUFFICIENCY_STATES[answerSufficiency(item, component).status].short
            return (
              <button type="button" key={item.key} className={item.key === step ? 'is-active' : ''} aria-current={item.key === step ? 'step' : undefined} onClick={() => goTo(item.key)}>
                <span className={`am-step-mark${done ? ' is-done' : ''}`}><PmIcon name={done ? 'check' : 'circle'} size={14} /></span>
                <span>{item.name}</span>
                <small>{note}</small>
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
              {lowOdometer && (
                <div className="am-odometer-warning" role="alert">
                  <strong><PmIcon name="alert" size={14} /> Your entered odometer reading is lower than the vehicle's previously recorded mileage. Please verify the value before submitting.</strong>
                  <span>Previously recorded: {vehicle.current_mileage.toLocaleString('en-US')} km · Entered now: {Number(form.odometer_km).toLocaleString('en-US')} km</span>
                  <label className="am-confirm">
                    <input type="checkbox" checked={form.odometer_confirmed === form.odometer_km} onChange={(event) => update({ ...form, odometer_confirmed: event.target.checked ? form.odometer_km : '' })} />
                    I checked the dashboard and this reading is correct.
                  </label>
                  <small>The recorded mileage is not lowered automatically; the server flags the decrease for review.</small>
                </div>
              )}
              <label className="am-field-block">General notes <small>Optional</small><textarea rows={3} maxLength={4000} placeholder="e.g. Inspected at the main garage after a 3-day rental." value={form.notes} onChange={(event) => update({ ...form, notes: event.target.value })} /></label>
              {details.filter((issue) => issue !== ODOMETER_CHECK).length > 0 && <div className="am-needed" role="status"><ul>{details.filter((issue) => issue !== ODOMETER_CHECK).map((issue) => <li key={issue}>{issue}</li>)}</ul></div>}
              <details className="am-disclosure">
                <summary>Vehicle profile</summary>
                <ProfileTab key={vehicle.id} workspace={workspace} onSaved={onProfileSaved} />
              </details>
            </div>
          )}
          {category && (
            <CategoryForm
              key={step}
              category={category}
              component={form.components[step]}
              issues={issues[step]}
              previous={previousRating(workspace.latest, step)}
              detailsOpen={detailsOpenFor(step)}
              onToggleDetails={() => setDetailOverride({ ...detailOverride, [step]: !detailsOpenFor(step) })}
              onChange={(component) => {
                if (component.rating !== form.components[step].rating) {
                  const next = { ...detailOverride }
                  delete next[step]
                  setDetailOverride(next)
                }
                update({ ...form, components: { ...form.components, [step]: component } })
              }}
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
              {limited.length > 0 && (
                <p className="am-sufficiency-note am-review-note">
                  {limited.length} {limited.length === 1 ? 'category has' : 'categories have'} fewer than half of their questions answered: {limited.map((item) => item.name).join(', ')}. You can still submit; the results will show this as limited information.
                </p>
              )}
              <ul className="am-review">
                {catalog.categories.map((item) => <ReviewCategory key={item.key} category={item} component={form.components[item.key]} issues={issues[item.key]} onEdit={() => goTo(item.key)} />)}
              </ul>
              {error && <p className="am-error" role="alert">{error}</p>}
              <p className="am-note">Submitting creates a new assessment record. Earlier assessments for this vehicle are kept.</p>
            </div>
          )}
        </div>

        <div className="am-submit-bar">
          <button type="button" disabled={stepIndex === 0} onClick={() => goTo(steps[stepIndex - 1])}><PmIcon name="left" /> <span className="am-bar-label">Previous</span></button>
          <span className="am-bar-step">{step === 'details' ? 'Assessment details' : step === 'review' ? 'Review and submit' : category.name}<small>Step {stepIndex + 1} of {steps.length}</small></span>
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
  const hiddenTexts = hiddenQuestionTexts(category)
  const missing = component.missing_questions.filter((text) => !hiddenTexts.includes(text))

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
        <span className={`am-result-score am-tone-${rating.tone}`} aria-hidden="true">{rating.short}</span>
        <span className="am-result-name">
          {category.name}
          {category.safety_critical && <span className="am-safety-tag"><PmIcon name="alert" size={13} /> Safety-critical</span>}
        </span>
        <span className="am-result-chips">
          <Chip tone={rating.tone} title="Condition rating recorded by the assessor">{rating.label}</Chip>
          <Chip tone={screening.tone} title="Result of the condition-based screening rules">{screening.label}</Chip>
        </span>
        <span className="am-result-chevron" aria-hidden="true"><PmIcon name="right" size={16} /></span>
      </summary>
      <div className="am-result-body">
        <Findings findings={findings} />

        {['partial', 'insufficient'].includes(component.data_sufficiency) && (
          <p className="am-note">
            Limited assessment information: fewer than half of the questions were answered.
            {missing.length > 0 && ` Not answered or Unknown: ${missing.join(' ')}`}
          </p>
        )}

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
  // How many categories received each recorded rating, in scale order.
  const breakdown = Object.entries(RATINGS)
    .map(([key, rating]) => ({ key, rating, count: catalog.categories.filter((category) => assessment.components[category.key]?.rating === key).length }))
    .filter((entry) => entry.count > 0)
  const reviewed = assessment.review_status === 'reviewed'
  const warnings = Number(assessment.safety_warning_count) || 0
  return (
    <div className="am-results">
      <section className={`am-summary am-tone-${condition.tone}`} aria-label="Vehicle overview">
        <div className="am-summary-condition">
          <span>Overall condition</span>
          <strong>{condition.label}</strong>
          <p>{condition.summary}</p>
          {breakdown.length > 0 && (
            <div className="am-breakdown">
              <div className="am-breakdown-bar" aria-hidden="true">
                {breakdown.map(({ key, rating, count }) => <span key={key} className={`am-tone-${rating.tone}`} style={{ flexGrow: count }} />)}
              </div>
              <ul className="am-breakdown-legend" aria-label="Condition ratings by category">
                {breakdown.map(({ key, rating, count }) => <li key={key} className={`am-tone-${rating.tone}`}><i aria-hidden="true" />{rating.long || rating.label}<b>{count}</b></li>)}
              </ul>
            </div>
          )}
          <dl className="am-summary-priority"><dt>Maintenance priority</dt><dd>{condition.priority}</dd></dl>
        </div>
        <div className="am-summary-vehicle">
          <dl className="am-status-grid">
            <div><dt>Assessment date</dt><dd>{formatDate(assessment.assessed_on)}</dd></div>
            <div><dt>Assessed by</dt><dd>{assessment.assessor_name}</dd></div>
            <div><dt>Odometer at assessment</dt><dd>{assessment.odometer_km === null ? 'Not recorded' : formatKm(assessment.odometer_km)}</dd></div>
            <div><dt>Current mileage</dt><dd>{vehicle.current_mileage === null ? 'Not recorded' : formatKm(vehicle.current_mileage)}</dd></div>
            <div className={warnings > 0 ? 'is-alert' : 'is-clear'}><dt>Safety warnings</dt><dd>{warnings}</dd></div>
            <div className={reviewed ? 'is-clear' : 'is-pending'}><dt>Review</dt><dd>{reviewed ? 'Reviewed' : 'Not yet reviewed'}</dd></div>
          </dl>
        </div>
      </section>

      {assessment.odometer_flag === 'decrease' && <p className="am-flag">Odometer is lower than the previous reading of {formatKm(assessment.previous_odometer_km)}. Vehicle mileage was not changed.</p>}
      {['failed', 'pending', 'processing'].includes(assessment.ai_status) && (
        <div className="am-banner">
          <span className="am-banner-icon" aria-hidden="true"><PmIcon name="alert" size={18} /></span>
          <p>{assessment.ai_status === 'processing' ? 'The assessment and its findings are saved. Fault code lookup is still marked as running; if this does not change, retry it.' : 'The assessment and its findings are saved. Fault code lookup could not finish, so it is missing until a retry succeeds.'}</p>
          <button type="button" disabled={busy} onClick={() => act(() => retryAnalysis(assessment.id))}>{busy ? 'Retrying…' : 'Retry analysis'}</button>
        </div>
      )}
      {error && <p className="am-error" role="alert">{error}</p>}

      <SafetyWarnings warnings={assessment.safety_warnings} />

      <div className="am-results-head">
        <h2 className="am-results-title">Component results</h2>
        <span>{catalog.categories.length} categories · open a row for findings, recorded details and photos</span>
      </div>
      {catalog.categories.map((category) => (
        <CategoryResult key={category.key} category={category} assessment={assessment} canInspect={partsByCategory.has(category.key)} onInspect={onInspect} onChanged={onChanged} />
      ))}

      <PredictionNotice assessment={assessment} catalog={catalog} />

      <section className="am-review-card" aria-labelledby="am-review-title">
        <div className="am-review-card-head">
          <span className={`am-review-card-icon${reviewed ? ' is-done' : ''}`} aria-hidden="true"><PmIcon name={reviewed ? 'check' : 'clipboard'} size={18} /></span>
          <div>
            <h3 id="am-review-title">Assessor review</h3>
            <p>{reviewed ? 'This assessment has been reviewed.' : 'Check the findings above, then mark the assessment as reviewed.'}</p>
          </div>
        </div>
        {reviewed ? (
          <p className="am-note">Reviewed {formatDate(assessment.reviewed_at)}{assessment.review_notes ? `: ${assessment.review_notes}` : '.'}</p>
        ) : (
          <div className="am-inline-form">
            <label>Review notes <small>Optional</small><input maxLength={4000} value={notes} placeholder="e.g. Findings match the workshop check." onChange={(event) => setNotes(event.target.value)} /></label>
            <button type="button" className="is-primary" disabled={busy} onClick={() => act(() => reviewAssessment(assessment.id, notes))}><PmIcon name="check" size={15} /> Mark as reviewed</button>
          </div>
        )}
      </section>
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
  if (!comparison) {
    return (
      <section className="am-section am-compare-empty">
        <span className="am-compare-icon" aria-hidden="true"><PmIcon name="clipboard" size={20} /></span>
        <div>
          <h3>Assessment comparison</h3>
          <p>A comparison appears once the vehicle has two assessments.</p>
        </div>
      </section>
    )
  }
  return (
    <section className="am-section am-compare">
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

const SERVICE_STATUS_TONES = { scheduled: 'pending', pending: 'pending', in_progress: 'fair', completed: 'good', done: 'good', cancelled: 'na', canceled: 'na' }

function humanize(value) {
  const text = String(value || '').replace(/[-_]+/g, ' ').trim()
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '–'
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
  // Service records are vehicle-wide, so the last loaded list stays visible while another category loads.
  const serviceRecords = state.data?.service_records
  const historyCount = workspace.history.length

  return (
    <div className="am-history">
      <section className="am-section">
        <div className="am-section-head">
          <h3>Assessment history</h3>
          <span className="am-count">{historyCount} {historyCount === 1 ? 'assessment' : 'assessments'}</span>
        </div>
        <ol className="am-timeline">
          {workspace.history.map((row) => {
            const screening = SCREENING[row.overall_screening]
            const shown = row.id === assessment?.id
            return (
              <li key={row.id} className={shown ? 'is-shown' : ''}>
                <span className={`am-timeline-dot am-tone-${screening?.tone || 'na'}`} aria-hidden="true" />
                <div className="am-timeline-body">
                  <div className="am-timeline-top">
                    <strong>{formatDate(row.assessed_on)}</strong>
                    {screening && <Chip tone={screening.tone}>{screening.label}</Chip>}
                  </div>
                  <small>{[row.assessor_name, row.odometer_km === null ? 'Odometer not recorded' : formatKm(row.odometer_km), row.safety_warning_count > 0 ? `${row.safety_warning_count} safety ${row.safety_warning_count === 1 ? 'warning' : 'warnings'}` : null].filter(Boolean).join(' · ')}</small>
                </div>
                {shown ? <span className="am-shown-badge"><PmIcon name="check" size={13} /> Shown now</span> : <button type="button" className="am-view-btn" onClick={() => onView(row.id)}>View results <PmIcon name="right" size={14} /></button>}
              </li>
            )
          })}
        </ol>
      </section>
      <ComparisonTable assessment={assessment} catalog={catalog} />
      <section className="am-section">
        <div className="am-section-head">
          <div>
            <h3>Component history</h3>
            <p className="am-section-sub">Ratings and screening for one category across every assessment.</p>
          </div>
        </div>
        <div className="am-cat-picker" role="group" aria-label="Category">
          {catalog.categories.map((category) => (
            <button key={category.key} type="button" aria-pressed={categoryKey === category.key} className={categoryKey === category.key ? 'is-active' : ''} onClick={() => setCategoryKey(category.key)}>
              {category.name}
            </button>
          ))}
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
          </>
        )}
      </section>
      {serviceRecords && (
        <section className="am-section">
          <div className="am-section-head">
            <div>
              <h3>Vehicle service records</h3>
              <p className="am-section-sub">Vehicle-wide, not tied to one component.</p>
            </div>
            <span className="am-count">{serviceRecords.length} {serviceRecords.length === 1 ? 'record' : 'records'}</span>
          </div>
          {serviceRecords.length === 0 ? <p className="am-empty">No service records yet.</p> : (
            <div className="am-table-wrap">
              <table className="am-table">
                <thead><tr><th>Date</th><th>Type</th><th>Status</th><th>Odometer</th></tr></thead>
                <tbody>
                  {serviceRecords.map((row) => (
                    <tr key={row.id}>
                      <td>{formatDate(row.date)}</td>
                      <td>{humanize(row.type)}</td>
                      <td><Chip tone={SERVICE_STATUS_TONES[String(row.status || '').toLowerCase()] || 'na'}>{humanize(row.status)}</Chip></td>
                      <td>{row.odometer_km === null ? <em>Not recorded</em> : formatKm(row.odometer_km)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ Outcomes */

function OutcomeList({ outcomes, canVerify, onVerify }) {
  return (
    <ul className="am-outcomes">
      {outcomes.map((outcome) => {
        const facts = [
          ['Mechanic', `${CONFIRMATIONS[outcome.mechanic_confirmed]}${outcome.mechanic_name ? ` · ${outcome.mechanic_name}` : ''}`],
          outcome.maintenance_performed && ['Work', outcome.maintenance_performed],
          outcome.parts_replaced && ['Parts', outcome.parts_replaced],
          outcome.failure_date && ['Failed', formatDate(outcome.failure_date)],
          outcome.repair_date && ['Repaired', formatDate(outcome.repair_date)],
          outcome.mileage_km !== null && outcome.mileage_km !== undefined && ['Mileage', formatKm(outcome.mileage_km)],
        ].filter(Boolean)
        return (
          <li key={outcome.id} className={`am-outcome is-${outcome.verification_status}`}>
            <div className="am-outcome-head">
              <strong>{DECISIONS[outcome.decision]}</strong>
              <span className="am-outcome-result">{RESULTS[outcome.result]}</span>
              <Chip tone={outcome.verification_status === 'verified' ? 'good' : outcome.verification_status === 'rejected' ? 'failed' : 'pending'}>{VERIFICATION[outcome.verification_status]}</Chip>
            </div>
            <p className="am-outcome-rec"><small>Original recommendation, {formatDate(outcome.recommended_at)}</small>{outcome.original_recommendation}</p>
            <dl className="am-outcome-facts">
              {facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
            </dl>
            {canVerify && outcome.verification_status === 'unverified' && (
              <div className="am-outcome-actions">
                <button type="button" className="is-verify" onClick={() => onVerify(outcome.id, 'verified')}><PmIcon name="check" size={14} /> Verify</button>
                <button type="button" className="is-reject" onClick={() => onVerify(outcome.id, 'rejected')}>Reject</button>
              </div>
            )}
          </li>
        )
      })}
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
        <header className="am-outcome-form-head">
          <h3>Record a maintenance outcome</h3>
          <p>What happened after this assessment: the repair, a deferral, or a check that found nothing wrong.</p>
        </header>

        <fieldset className="am-ogroup">
          <legend><span>1</span>What is this about? <small>Required</small></legend>
          <label className="am-field-block">Recommendation or category
            <select required value={form.source} onChange={set('source')}>
              <option value="">Choose one</option>
              {findings.map((item) => <option key={item.id} value={`f:${item.id}`}>{item.component_name}: {item.recommended_action}</option>)}
              {catalog.categories.filter((category) => !flagged.has(category.key)).map((category) => <option key={category.key} value={`c:${category.key}`}>{category.name}: nothing was flagged</option>)}
            </select>
          </label>
          <p className="am-tip"><PmIcon name="check" size={14} /> Record healthy results too, using No fault found, so the history is not limited to problems.</p>
        </fieldset>

        <fieldset className="am-ogroup">
          <legend><span>2</span>Decision and result</legend>
          <div className="am-field-row">
            <label>Decision<select value={form.decision} onChange={set('decision')}>{Object.entries(DECISIONS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <label>Mechanic confirmation<select value={form.mechanic_confirmed} onChange={set('mechanic_confirmed')}>{Object.entries(CONFIRMATIONS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <label>Result<select value={form.result} onChange={set('result')}>{Object.entries(RESULTS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          </div>
        </fieldset>

        <fieldset className="am-ogroup">
          <legend><span>3</span>Where and who <small>Optional</small></legend>
          <div className="am-field-row">
            <label>Component
              <select value={form.component_key} onChange={set('component_key')} disabled={!categoryKey}>
                <option value="">Whole category</option>
                {categoryParts.map((part) => <option key={part.key} value={part.key}>{part.name}</option>)}
              </select>
            </label>
            <label>Mechanic<input maxLength={150} placeholder="Name of the mechanic" value={form.mechanic_name} onChange={set('mechanic_name')} /></label>
            <label>Mileage (km)<input type="number" min="0" placeholder="Leave blank if not recorded" value={form.mileage_km} onChange={set('mileage_km')} /></label>
          </div>
          {!categoryKey && <p className="am-hint">Choose what this is about first to pick a specific component.</p>}
        </fieldset>

        <fieldset className="am-ogroup">
          <legend><span>4</span>Dates <small>Optional</small></legend>
          <div className="am-field-row">
            <label>Failure date<input type="date" max={todayISO()} value={form.failure_date} onChange={set('failure_date')} /><span className="am-hint">When the part failed, if it did.</span></label>
            <label>Repair date<input type="date" max={todayISO()} value={form.repair_date} onChange={set('repair_date')} /><span className="am-hint">When the repair was finished.</span></label>
            <label>Check date<input type="date" max={todayISO()} value={form.outcome_date} onChange={set('outcome_date')} /><span className="am-hint">Use this when no fault was found.</span></label>
          </div>
        </fieldset>

        <fieldset className="am-ogroup">
          <legend><span>5</span>Work done <small>Optional</small></legend>
          <label className="am-field-block">Maintenance performed<textarea rows={2} placeholder="e.g. Replaced front brake pads and bled the brake lines." value={form.maintenance_performed} onChange={set('maintenance_performed')} /></label>
          <label className="am-field-block">Parts replaced<input placeholder="e.g. Front brake pads (set of 4)" value={form.parts_replaced} onChange={set('parts_replaced')} /></label>
          <label className="am-field-block">Notes<textarea rows={2} value={form.notes} onChange={set('notes')} /></label>
        </fieldset>

        {error && <p className="am-error" role="alert">{error}</p>}
        <div className="am-outcome-submit">
          <p className="am-note">Outcomes stay unverified until someone reviews them.</p>
          <button type="submit" className="is-primary" disabled={saving}><PmIcon name="check" size={15} /> {saving ? 'Saving…' : 'Record outcome'}</button>
        </div>
      </form>
      <section className="am-section am-outcome-panel">
        <div className="am-section-head">
          <h3>Outcomes on this assessment</h3>
          <span className="am-count">{assessment.outcomes.length} recorded</span>
        </div>
        {assessment.outcomes.length === 0 ? (
          <div className="am-outcome-empty">
            <span className="am-compare-icon" aria-hidden="true"><PmIcon name="clipboard" size={20} /></span>
            <strong>None recorded yet</strong>
            <p>Outcomes you record appear here. Each one stays unverified until someone checks it and chooses Verify or Reject.</p>
          </div>
        ) : <OutcomeList outcomes={assessment.outcomes} canVerify onVerify={verify} />}
      </section>
    </div>
  )
}

/* ------------------------------------------------------------------ Profile */

/** "3 months ago"-style wording for a past ISO date; null when the date is missing or in the future. */
function timeSince(value) {
  if (!value) return null
  const then = new Date(`${String(value).slice(0, 10)}T00:00:00`)
  const days = Math.floor((Date.now() - then.getTime()) / 86400000)
  if (!Number.isFinite(days) || days < 0) return null
  if (days === 0) return { short: 'today', long: 'less than a day' }
  if (days < 60) return { short: `${days} ${days === 1 ? 'day' : 'days'} ago`, long: `${days} ${days === 1 ? 'day' : 'days'}` }
  const months = Math.floor(days / 30.44)
  if (months < 24) return { short: `${months} months ago`, long: `${months} months` }
  const years = Math.floor(days / 365.25)
  return { short: `${years} years ago`, long: `${years} years` }
}

function ProfileTab({ workspace, onSaved }) {
  const { vehicle } = workspace
  const initial = {
    acquisition_date: vehicle.acquisition_date || '',
    usage_frequency: vehicle.usage_frequency || '',
    previous_maintenance_date: vehicle.previous_maintenance_date || '',
  }
  const [form, setForm] = useState(initial)
  const [baseline, setBaseline] = useState(initial)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const setValue = (field, value) => { setSaved(false); setForm({ ...form, [field]: value }) }
  const set = (field) => (event) => setValue(field, event.target.value)
  const dirty = Object.keys(form).some((key) => form[key] !== baseline[key])
  const inFleet = timeSince(form.acquisition_date)
  const sinceService = timeSince(form.previous_maintenance_date)

  async function submit(event) {
    event.preventDefault()
    setError('')
    setSaving(true)
    try {
      await saveVehicleProfile(vehicle.id, form)
      setBaseline(form)
      setSaved(true)
      onSaved()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="am-section am-profile" onSubmit={submit}>
      <header className="am-profile-head">
        <h3>Vehicle profile</h3>
        <p>Background details the maintenance screening uses alongside each assessment.</p>
      </header>

      <div className="am-profile-block">
        <h4>From the vehicle record <small>Read-only</small></h4>
        <dl className="am-status-grid am-profile-facts">
          <div><dt>Current mileage</dt><dd>{vehicle.current_mileage === null ? 'Not recorded' : formatKm(vehicle.current_mileage)}</dd></div>
          <div><dt>Age from model year</dt><dd>{vehicle.age_years === null ? 'Unavailable' : `${vehicle.age_years} ${vehicle.age_years === 1 ? 'year' : 'years'}`}</dd></div>
          <div><dt>Fuel</dt><dd>{vehicle.fuel_type || 'Not recorded'}</dd></div>
        </dl>
      </div>

      <div className="am-profile-block">
        <h4>Usage and service <small>Editable</small></h4>
        <div className="am-field-row">
          <label>Acquisition date
            <input type="date" max={todayISO()} value={form.acquisition_date} onChange={set('acquisition_date')} />
            <span className="am-hint">{inFleet ? <>In the fleet for <b>{inFleet.long}</b>.</> : 'Example: the day the vehicle joined the fleet.'}</span>
          </label>
          <label>Previous maintenance date
            <input type="date" max={todayISO()} value={form.previous_maintenance_date} onChange={set('previous_maintenance_date')} />
            <span className="am-hint">{sinceService ? <>Last general service <b>{sinceService.short}</b>.</> : 'Example: the date of its last general service.'}</span>
          </label>
        </div>
        <fieldset className="am-usage">
          <legend>Usage frequency</legend>
          <div className="am-usage-options" role="radiogroup" aria-label="Usage frequency">
            {[['', 'Not recorded'], ...Object.entries(USAGE)].map(([key, label]) => (
              <label key={key || 'none'} className={form.usage_frequency === key ? 'is-selected' : ''}>
                <input type="radio" name={`usage-${vehicle.id}`} value={key} checked={form.usage_frequency === key} onChange={() => setValue('usage_frequency', key)} />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="am-profile-foot">
        <div className="am-profile-status" aria-live="polite">
          {error && <p className="am-error" role="alert">{error}</p>}
          {!error && saved && <p className="am-saved"><PmIcon name="check" size={14} /> Vehicle profile saved.</p>}
          {!error && !saved && dirty && <p className="am-note">You have unsaved changes.</p>}
        </div>
        <button type="submit" className="is-primary" disabled={!dirty || saving}>{saving ? 'Saving…' : 'Save profile'}</button>
      </div>
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
      setCatalog(safetyFirst(nextCatalog))
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
        <VehicleThumb listing={listing} category={vehicle.body_type || vehicle.category} />
        <div className="am-vehicle">
          <h1>{vehicle.make} {vehicle.model} <span>{vehicle.year}</span></h1>
          <ul className="am-vehicle-meta" aria-label="Vehicle details">
            {[vehicle.plate_number || 'Plate not recorded', `Fleet ID #${vehicle.id}`, vehicle.category, vehicle.current_mileage === null ? 'Mileage not recorded' : formatKm(vehicle.current_mileage)].filter(Boolean).map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
        <div className={`am-reassess am-tone-${reassessmentStatus.tone}`}>
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
