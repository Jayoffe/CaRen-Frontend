import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import {
  evidenceObjectUrl, getAssessment, getAssessmentCatalog, getAssessmentWorkspace, getCategoryHistory, recordOutcome,
  retryAnalysis, reviewAssessment, saveVehicleProfile, submitAssessment, uploadEvidence, verifyOutcome,
} from '../../../../Services/API/assessmentAPI.js'
import { Chip } from './AssessmentOverview.jsx'
import {
  AI_STATUS, ANSWERS, CHANGE, CONFIRMATIONS, DECISIONS, newUuid, RATINGS, REASSESSMENT, RESULTS, SCREENING, SEVERITY,
  stageTone, STAGE_LEGEND, SUFFICIENCY, USAGE, VERIFICATION,
} from './assessmentStatus.js'
import { rigFor } from './rigs.js'
import { formatDate, formatKm, RECORDED_CONDITION_LABELS, todayISO } from './status.js'
import VehicleInspection from './VehicleInspection.jsx'

const InspectionStage = lazy(() => import('./InspectionStage.jsx'))

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

function draftKey(vehicleId) {
  return `assessment-draft-${vehicleId}`
}

function loadDraft(vehicleId) {
  try {
    const stored = JSON.parse(window.localStorage.getItem(draftKey(vehicleId)) || 'null')
    return stored?.components ? stored : null
  } catch {
    return null
  }
}

function storeDraft(vehicleId, form) {
  try {
    if (form) window.localStorage.setItem(draftKey(vehicleId), JSON.stringify(form))
    else window.localStorage.removeItem(draftKey(vehicleId))
  } catch {
    // A draft is only a convenience; the form still works without storage.
  }
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
      fault_codes: component.fault_codes.split(/[\s,;]+/).filter(Boolean),
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

function recorded(component) {
  return component.rating !== 'not_assessed' || Object.keys(component.answers).length > 0 || component.symptoms.length > 0
    || Object.keys(component.measurements).length > 0 || component.fault_codes.trim() !== '' || component.notes.trim() !== ''
}

/* ------------------------------------------------------------------ Questionnaire */

function CategoryForm({ category, component, onChange }) {
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

  return (
    <div className="am-form-body">
      <h3>{category.name}</h3>
      <fieldset className="am-field">
        <legend>Physical condition rating</legend>
        <div className="am-rating" role="radiogroup" aria-label={`${category.name} rating`}>
          {Object.entries(RATINGS).map(([key, rating]) => (
            <label key={key} className={`am-rating-option am-tone-${rating.tone}${component.rating === key ? ' is-selected' : ''}`}>
              <input type="radio" name={`rating-${category.key}`} checked={component.rating === key} onChange={() => set({ rating: key })} />
              <b>{rating.short}</b><span>{rating.long || rating.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="am-field">
        <legend>Inspection questions</legend>
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
        <legend>Symptoms</legend>
        <div className="am-checks">
          {category.symptoms.map((symptom) => (
            <label key={symptom.key}><input type="checkbox" checked={component.symptoms.includes(symptom.key)} onChange={() => toggleSymptom(symptom.key)} />{symptom.label}</label>
          ))}
        </div>
      </fieldset>

      <fieldset className="am-field">
        <legend>Measurements <small>Optional. Leave blank if not taken.</small></legend>
        {category.measurements.map((measurement) => {
          const mode = component.measurementModes[measurement.key] || 'value'
          return (
            <div className="am-measure" key={measurement.key}>
              <label htmlFor={`m-${measurement.key}`}>{measurement.label} <small>({measurement.unit})</small></label>
              <input
                id={`m-${measurement.key}`} type="number" step="any" min={measurement.min} max={measurement.max} disabled={mode !== 'value'}
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
          <label>Fault codes<input placeholder="e.g. P0118, C0035" value={component.fault_codes} onChange={(event) => set({ fault_codes: event.target.value.toUpperCase() })} /></label>
        )}
        <label>Last maintenance date<input type="date" max={todayISO()} value={component.last_maintenance_date} onChange={(event) => set({ last_maintenance_date: event.target.value })} /></label>
      </div>
      <label className="am-field-block">Assessor notes<textarea rows={2} maxLength={4000} value={component.notes} onChange={(event) => set({ notes: event.target.value })} /></label>
      <p className="am-note">Photos can be attached on the Results tab after submitting.</p>
    </div>
  )
}

function AssessmentTab({ workspace, catalog, onSubmitted }) {
  const { vehicle, parts } = workspace
  const [form, setForm] = useState(() => loadDraft(vehicle.id) || emptyForm(catalog, vehicle))
  const [categoryKey, setCategoryKey] = useState(catalog.categories[0].key)
  const [selectedPart, setSelectedPart] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const rig = useMemo(() => (vehicle.body_type ? rigFor(vehicle.body_type, { make: vehicle.make, model: vehicle.model }) : null), [vehicle])
  const category = catalog.categories.find((item) => item.key === categoryKey)

  // Hotspots show the latest stored screening. The rating being entered is not a result yet.
  const stageParts = useMemo(() => parts.map((part) => ({
    key: part.key,
    name: part.name,
    tone: stageTone(part.screening_status),
    statusLabel: SCREENING[part.screening_status]?.label,
  })), [parts])
  const selected = parts.find((part) => part.key === selectedPart) || null

  const selectPart = useCallback((key) => {
    setSelectedPart(key)
    const part = parts.find((item) => item.key === key)
    if (part?.category_key) setCategoryKey(part.category_key)
  }, [parts])

  function selectCategory(key) {
    setCategoryKey(key)
    const entry = catalog.categories.find((item) => item.key === key)
    const part = entry.component_keys.find((partKey) => rig?.components[partKey] && parts.some((item) => item.key === partKey))
    setSelectedPart(part || null)
  }

  function update(next) {
    setForm(next)
    storeDraft(vehicle.id, next)
  }

  async function submit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const result = await submitAssessment(toPayload(form, vehicle.id))
      storeDraft(vehicle.id, null)
      setForm(emptyForm(catalog, vehicle))
      onSubmitted(result)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  const done = catalog.categories.filter((item) => recorded(form.components[item.key])).length

  return (
    <form className="am-assess" onSubmit={submit}>
      <div className="am-assess-stage">
        {rig ? (
          <div className="am-stage-frame">
            <Suspense fallback={<div className="pm-stage pm-stage-message" role="status"><div><span className="pm-spinner" />Loading 3D model…</div></div>}>
              <InspectionStage rig={rig} vehicle={vehicle} components={stageParts} selectedKey={selectedPart} onSelect={selectPart} legend={STAGE_LEGEND}>
                {selected && (
                  <div className="am-callout">
                    <strong>{selected.name}</strong>
                    <dl>
                      <div><dt>Latest rating</dt><dd><Chip tone={RATINGS[selected.rating].tone}>{RATINGS[selected.rating].label}</Chip></dd></div>
                      <div><dt>Screening</dt><dd><Chip tone={SCREENING[selected.screening_status].tone}>{SCREENING[selected.screening_status].label}</Chip></dd></div>
                    </dl>
                    <p>Assessed under {catalog.categories.find((item) => item.key === selected.category_key)?.name}. The category rating applies to all its parts.</p>
                  </div>
                )}
              </InspectionStage>
            </Suspense>
          </div>
        ) : (
          <p className="am-note am-no-rig">No 3D model exists for the category “{vehicle.category}”. Use the list to complete the assessment.</p>
        )}
        <nav className="am-category-nav" aria-label="Assessment categories">
          {catalog.categories.map((item) => {
            const component = form.components[item.key]
            return (
              <button type="button" key={item.key} className={item.key === categoryKey ? 'is-active' : ''} aria-current={item.key === categoryKey} onClick={() => selectCategory(item.key)}>
                <span>{item.name}</span>
                <Chip tone={RATINGS[component.rating].tone}>{RATINGS[component.rating].label}</Chip>
              </button>
            )
          })}
        </nav>
      </div>

      <div className="am-assess-form">
        <div className="am-field-row am-form-head">
          <label>Assessment date<input type="date" required max={todayISO()} value={form.assessed_on} onChange={(event) => update({ ...form, assessed_on: event.target.value })} /></label>
          <label>Odometer (km)<input type="number" min="0" max="2000000" step="1" placeholder="Not recorded" value={form.odometer_km} onChange={(event) => update({ ...form, odometer_km: event.target.value })} /></label>
        </div>
        <CategoryForm
          key={categoryKey}
          category={category}
          component={form.components[categoryKey]}
          onChange={(component) => update({ ...form, components: { ...form.components, [categoryKey]: component } })}
        />
        <div className="am-submit-bar">
          {error && <p className="am-error" role="alert">{error}</p>}
          <span>{done} of {catalog.categories.length} categories recorded. Anything left blank is saved as Not Assessed.</span>
          <button type="submit" className="is-primary" disabled={saving}>{saving ? 'Saving…' : 'Submit assessment'}</button>
        </div>
      </div>
    </form>
  )
}

/* ------------------------------------------------------------------ Results */

function SafetyWarnings({ warnings }) {
  if (!warnings?.length) return null
  return (
    <section className="am-safety" role="alert" aria-label="Safety warnings">
      <h2>{warnings.length} safety {warnings.length === 1 ? 'warning' : 'warnings'}</h2>
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

function CategoryResult({ category, assessment, onChanged }) {
  const component = assessment.components[category.key]
  const findings = assessment.findings.filter((finding) => finding.category_key === category.key)
  const ai = assessment.analysis.findings[category.key]
  const evidence = assessment.evidence.filter((item) => item.category_key === category.key)
  const [error, setError] = useState('')
  const rating = RATINGS[component.rating]
  const screening = SCREENING[component.screening_status]

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
    <details className="am-result" open={['critical', 'attention'].includes(component.screening_status)}>
      <summary>
        <span>{category.name}</span>
        <span className="am-result-chips">
          <Chip tone={rating.tone} title="Physical condition rating">{rating.label}</Chip>
          <Chip tone={screening.tone} title="Condition-based screening">{screening.label}</Chip>
        </span>
      </summary>
      <div className="am-result-body">
        <div className="am-status-grid">
          <div><dt>Physical condition rating</dt><dd>{rating.label}{component.rating_score !== null && ` (${component.rating_score} of 5)`}</dd></div>
          <div><dt>Condition-based screening</dt><dd>{screening.label}</dd></div>
          <div><dt>AI analysis</dt><dd>{ai ? 'Completed' : AI_STATUS[assessment.ai_status].label}</dd></div>
          <div><dt>Machine learning prediction</dt><dd>{ai?.prediction?.available ? (ai.risk_level === 'elevated' ? 'Elevated risk' : 'Not elevated') : 'Prediction unavailable'}</dd></div>
          <div><dt>Data sufficiency</dt><dd>{SUFFICIENCY[component.data_sufficiency]}</dd></div>
        </div>

        {findings.length > 0 ? (
          <ul className="am-findings">
            {findings.map((finding) => (
              <li key={finding.id}>
                <Chip tone={SEVERITY[finding.severity].tone}>{SEVERITY[finding.severity].label}</Chip>
                <div><strong>{finding.observation}</strong><span>{finding.reason}</span><b>{finding.recommended_action}</b></div>
              </li>
            ))}
          </ul>
        ) : <p className="am-note">No screening rule was triggered. This does not mean the component is healthy.</p>}

        {component.missing_questions.length > 0 && (
          <p className="am-note">Unanswered or unknown: {component.missing_questions.join(' ')}</p>
        )}

        {ai && (
          <div className="am-ai">
            <h4>AI analysis details</h4>
            <p>{ai.explanation}</p>
            {ai.identified_faults.map((fault) => (
              <div className="am-fault" key={fault.code}>
                <strong>{fault.found ? fault.title : `${fault.code}: not in the reference`}</strong>
                <p>{fault.explanation}</p>
                {fault.recorded_under_other_category && <small className="am-flag">This code may belong to another category.</small>}
                {fault.source && <small>Source: {fault.source}. Generic meaning; manufacturer definitions can differ.</small>}
              </div>
            ))}
            {ai.diagnostic_guidance.length > 0 && <p className="am-note">Possibly related reference. It was matched on symptom wording and is not a diagnosis of this vehicle.</p>}
            {ai.diagnostic_guidance.map((guide) => (
              <div className="am-fault" key={guide.title}>
                <strong>{guide.title}</strong>
                <p>{guide.text}</p>
                <small>Source: {guide.source}. {guide.note}</small>
              </div>
            ))}
            {ai.prediction?.available ? (
              <div className={`am-prediction${ai.risk_level === 'elevated' ? ' is-elevated' : ''}`}>
                <h4>Machine learning prediction, within {ai.prediction.horizon_days} days</h4>
                <p><Chip tone={ai.risk_level === 'elevated' ? 'poor' : 'good'}>{ai.risk_level === 'elevated' ? 'Elevated risk' : 'Not elevated'}</Chip></p>
                <p>{ai.prediction.explanation}</p>
                <small>Model {ai.ai_model_version}. On its evaluation data it caught {Math.round(ai.prediction.evaluation.recall * ai.prediction.evaluation.faults)} of {ai.prediction.evaluation.faults} faults. It estimates risk and does not replace an inspection.</small>
              </div>
            ) : (
              <p className="am-note"><b>Prediction unavailable.</b> {ai.prediction?.reason || 'No accepted model exists for this category.'} The results above come from rules and reference lookups, not a model.</p>
            )}
          </div>
        )}

        <div className="am-evidence">
          {evidence.map((item) => <EvidenceImage key={item.id} item={item} />)}
          <label className="am-file">Attach photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={attach} /></label>
          {error && <p className="am-error" role="alert">{error}</p>}
        </div>
      </div>
    </details>
  )
}

function ResultsTab({ assessment, catalog, onChanged }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notes, setNotes] = useState('')

  if (!assessment) return <p className="am-empty">No assessment has been recorded for this vehicle yet.</p>

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

  const ai = AI_STATUS[assessment.ai_status]
  return (
    <div className="am-results">
      <header className="am-results-head">
        <div>
          <h2>Condition-based screening</h2>
          <p>{formatDate(assessment.assessed_on)} · {assessment.assessor_name} · {assessment.odometer_km === null ? 'Odometer not recorded' : formatKm(assessment.odometer_km)}</p>
          {assessment.odometer_flag === 'decrease' && <p className="am-flag">Odometer is lower than the previous reading of {formatKm(assessment.previous_odometer_km)}. Vehicle mileage was not changed.</p>}
        </div>
        <div className="am-ai-state">
          <span>AI analysis</span>
          <Chip tone={ai.tone}>{ai.label}</Chip>
          {['failed', 'pending'].includes(assessment.ai_status) && (
            <button type="button" className="is-primary" disabled={busy} onClick={() => act(() => retryAnalysis(assessment.id))}>{busy ? 'Retrying…' : 'Retry analysis'}</button>
          )}
        </div>
      </header>
      {assessment.ai_status === 'failed' && (
        <p className="am-banner">AI analysis failed ({assessment.ai_last_error}). The assessment and its screening results are saved. Fault-code lookup is missing until a retry succeeds.</p>
      )}
      {assessment.analysis.knowledge_message && <p className="am-banner">{assessment.analysis.knowledge_message}</p>}
      {error && <p className="am-error" role="alert">{error}</p>}

      <SafetyWarnings warnings={assessment.safety_warnings} />

      {assessment.analysis.predictive_capability && (
        <p className="am-note"><b>Failure prediction: {assessment.analysis.predictive_capability.label}.</b> {assessment.analysis.predictive_capability.reason}</p>
      )}

      {catalog.categories.map((category) => <CategoryResult key={category.key} category={category} assessment={assessment} onChanged={onChanged} />)}

      {assessment.review_status === 'reviewed' ? (
        <p className="am-note">Reviewed {formatDate(assessment.reviewed_at)}{assessment.review_notes ? `: ${assessment.review_notes}` : '.'}</p>
      ) : (
        <div className="am-inline-form">
          <label>Review notes<input maxLength={4000} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
          <button type="button" disabled={busy} onClick={() => act(() => reviewAssessment(assessment.id, notes))}>Mark as reviewed</button>
        </div>
      )}
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

function HistoryTab({ workspace, catalog, assessment }) {
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
            <p className="am-note">Record healthy results too, using No fault found. Without them, a future model only ever sees problems.</p>
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
            <p className="am-note">Outcomes stay unverified until someone reviews them below. Only verified outcomes count toward model training, and nothing retrains automatically.</p>
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
        <label>Acquisition date<input type="date" max={todayISO()} value={form.acquisition_date} onChange={set('acquisition_date')} /></label>
        <label>Usage frequency
          <select value={form.usage_frequency} onChange={set('usage_frequency')}>
            <option value="">Not recorded</option>
            {Object.entries(USAGE).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        <label>Previous maintenance date<input type="date" max={todayISO()} value={form.previous_maintenance_date} onChange={set('previous_maintenance_date')} /></label>
      </div>
      {error && <p className="am-error" role="alert">{error}</p>}
      {saved && <p className="am-note" role="status">Vehicle profile saved.</p>}
      <button type="submit" className="is-primary">Save profile</button>
    </form>
  )
}

/* ------------------------------------------------------------------ Workspace */

export default function AssessmentWorkspace({ vehicleId, onBack }) {
  const [workspace, setWorkspace] = useState(null)
  const [catalog, setCatalog] = useState(null)
  const [assessment, setAssessment] = useState(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('assess')

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

  const submitted = useCallback((result) => {
    setAssessment(result)
    setTab('results')
    void refreshWorkspace()
  }, [refreshWorkspace])

  const changed = useCallback((result) => {
    setAssessment(result)
    void refreshWorkspace()
  }, [refreshWorkspace])

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
  const tabs = [
    ['assess', 'New assessment'],
    ['results', 'Screening results'],
    ['history', 'History and comparison'],
    ['outcomes', 'Outcomes'],
    ['profile', 'Vehicle profile'],
    ['legacy', 'Component records'],
  ]

  return (
    <section className="am-workspace" aria-label="Vehicle assessment workspace">
      <header className="am-workspace-head">
        <button type="button" className="pm-back" onClick={onBack}><span aria-hidden="true">←</span> Fleet</button>
        <div className="am-vehicle">
          <h1>{vehicle.make} {vehicle.model} <span>{vehicle.year}</span></h1>
          <p>{[vehicle.plate_number || `Vehicle #${vehicle.id}`, vehicle.category, vehicle.current_mileage === null ? 'Mileage not recorded' : formatKm(vehicle.current_mileage)].join(' · ')}</p>
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

      <div className="am-tabs" role="tablist" aria-label="Assessment workspace">
        {tabs.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'is-active' : ''} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>

      <div className="am-tab-panel" role="tabpanel">
        {tab === 'assess' && <AssessmentTab workspace={workspace} catalog={catalog} onSubmitted={submitted} />}
        {tab === 'results' && <ResultsTab assessment={assessment} catalog={catalog} onChanged={changed} />}
        {tab === 'history' && <HistoryTab workspace={workspace} catalog={catalog} assessment={assessment} />}
        {tab === 'outcomes' && <OutcomesTab assessment={assessment} catalog={catalog} parts={workspace.parts} onChanged={changed} />}
        {tab === 'profile' && <ProfileTab key={vehicle.id} workspace={workspace} onSaved={refreshWorkspace} />}
        {tab === 'legacy' && <VehicleInspection key={vehicle.id} vehicleId={vehicle.id} onBack={() => setTab('assess')} />}
      </div>
    </section>
  )
}
