import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  generateMaintenancePredictions,
  getFleetVehicles,
  getMaintenancePredictions,
  getMaintenanceRecords,
  recordMaintenance,
  requestDiagnosticAnalysis,
  updateMaintenanceRecord,
  updateVehicleMileage,
} from '../../../Services/API/maintenanceAPI.js'
import MaintenanceVehicleViewer from '../Components/MaintenanceVehicleViewer.jsx'
import './MaintenancePredictions.css'

const COMPONENTS = [
  { key: 'engine', label: 'Engine & lubrication', aliases: ['engine', 'oil', 'lubrication', 'spark plug', 'air filter'], position: [1.34, 0.91, 0] },
  { key: 'battery', label: 'Battery', aliases: ['battery', 'alternator'], position: [0.55, 0.54, 0] },
  { key: 'brakes-front', label: 'Front brakes', aliases: ['front brake', 'brake service', 'brakes', 'brake', 'abs'], position: [1.33, 0.43, 0.93] },
  { key: 'brakes-rear', label: 'Rear brakes', aliases: ['rear brake', 'brake service', 'brakes', 'brake', 'abs'], position: [-1.34, 0.43, -0.93] },
  { key: 'tire-front-left', label: 'Front-left tire', aliases: ['front left tire', 'front left tyre', 'tire', 'tyre', 'wheel', 'alignment'], position: [1.33, 0.46, 0.83] },
  { key: 'tire-front-right', label: 'Front-right tire', aliases: ['front right tire', 'front right tyre', 'tire', 'tyre', 'wheel', 'alignment'], position: [1.33, 0.46, -0.83] },
  { key: 'tire-rear-left', label: 'Rear-left tire', aliases: ['rear left tire', 'rear left tyre', 'tire', 'tyre', 'wheel', 'alignment'], position: [-1.33, 0.46, 0.83] },
  { key: 'tire-rear-right', label: 'Rear-right tire', aliases: ['rear right tire', 'rear right tyre', 'tire', 'tyre', 'wheel', 'alignment'], position: [-1.33, 0.46, -0.83] },
  { key: 'transmission', label: 'Transmission', aliases: ['transmission', 'gearbox', 'clutch'], position: [-0.26, 0.53, 0] },
  { key: 'cooling', label: 'Cooling system', aliases: ['cooling', 'coolant', 'radiator'], position: [1.82, 0.64, 0] },
  { key: 'suspension', label: 'Suspension', aliases: ['suspension', 'shock', 'strut'], position: [-0.91, 0.44, 0.92] },
  { key: 'steering', label: 'Steering', aliases: ['steering', 'tie rod'], position: [0.93, 0.87, 0] },
  { key: 'electrical', label: 'Electrical system', aliases: ['electrical', 'wiring', 'alternator'], position: [-0.55, 0.9, 0] },
]

const EMPTY_MAINTENANCE = { records: [], summary: {}, vehicles: [] }
const EMPTY_PREDICTIONS = { predictions: [], summary: {}, vehicles: [] }
const TODAY = new Date().toLocaleDateString('en-CA')

const STATUS_LABELS = {
  critical: 'Critical finding reported',
  overdue: 'Scheduled service overdue',
  due_soon: 'Service due soon',
  needs_review: 'Reported finding',
  inspection_recorded: 'Inspection recorded',
  service_recorded: 'Service recorded',
  scheduled: 'Service scheduled',
  insufficient: 'Not inspected',
}

function normalize(value) {
  return String(value || '').toLowerCase().replace(/[_-]+/g, ' ').trim()
}

function recordsForComponent(records, component) {
  return records
    .filter((record) => {
      const searchable = normalize(`${record.maintenanceType} ${record.description}`)
      return component.aliases.some((alias) => searchable.includes(normalize(alias)))
    })
    .sort((left, right) => (
      String(right.maintenanceDate || '').localeCompare(String(left.maintenanceDate || ''))
      || Number(right.maintenanceID || 0) - Number(left.maintenanceID || 0)
    ))
}

function componentStatus(records, component) {
  const matchingRecords = recordsForComponent(records, component)
  if (!matchingRecords.length) return { key: 'insufficient', record: null, history: matchingRecords }

  const latest = matchingRecords[0]
  const typeAndNotes = normalize(`${latest.maintenanceType} ${latest.description}`)
  const notes = normalize(latest.description)
  const explicitlyNegated = /\b(no issues?|no faults?|no problems?|none reported|clear)\b/.test(notes)
  const criticalFinding = !explicitlyNegated && /\b(critical|unsafe|failed|severe|immediate attention)\b/.test(notes)
  const reportedFinding = !explicitlyNegated && /\b(leak|worn|crack|damage|fault|warning|noise|vibration|loose|overheat|replace|issue|defect)\b/.test(notes)
  const scheduled = ['scheduled', 'pending', 'overdue'].includes(normalize(latest.maintenanceStatus))
  const dueDate = latest.nextMaintenanceDate || (scheduled ? latest.maintenanceDate : null)
  const daysUntilDue = dueDate
    ? Math.round((Date.parse(`${dueDate}T00:00:00`) - Date.parse(`${TODAY}T00:00:00`)) / 86400000)
    : null

  if (criticalFinding) return { key: 'critical', record: latest, history: matchingRecords }
  if (scheduled && daysUntilDue !== null && daysUntilDue < 0) return { key: 'overdue', record: latest, history: matchingRecords }
  if (dueDate && daysUntilDue !== null && daysUntilDue >= 0 && daysUntilDue <= 30) {
    return { key: 'due_soon', record: latest, history: matchingRecords }
  }
  if (reportedFinding) return { key: 'needs_review', record: latest, history: matchingRecords }
  if (scheduled) return { key: 'scheduled', record: latest, history: matchingRecords }
  if (/\b(inspection|diagnostic|condition check)\b/.test(typeAndNotes)) {
    return { key: 'inspection_recorded', record: latest, history: matchingRecords }
  }
  return { key: 'service_recorded', record: latest, history: matchingRecords }
}

function formatMileage(value) {
  return value === null || value === undefined || value === ''
    ? 'Not recorded'
    : `${Number(value).toLocaleString('en-US')} km`
}

function formatDate(value) {
  return value || 'Not recorded'
}

function Field({ label, children }) {
  return <div className="diag-data-field"><span>{label}</span><strong>{children || 'Not recorded'}</strong></div>
}

function MaintenanceEditor({ mode, component, record, car, saving, onCancel, onSave }) {
  const [date, setDate] = useState(record?.maintenanceDate || TODAY)
  const [findings, setFindings] = useState(record?.description || '')
  const [nextServiceDate, setNextServiceDate] = useState(record?.nextMaintenanceDate || '')
  const [odometer, setOdometer] = useState(record?.odometerReading ?? '')
  const [status, setStatus] = useState(record?.maintenanceStatus || (mode === 'schedule' ? 'scheduled' : 'completed'))

  const submit = (event) => {
    event.preventDefault()
    onSave({ date, findings, nextServiceDate, odometer, status })
  }

  return (
    <form className="diag-editor" onSubmit={submit}>
      <div className="diag-editor-heading">
        <div><span className="diag-kicker">{mode === 'schedule' ? 'SCHEDULE SERVICE' : mode === 'edit' ? 'UPDATE RECORD' : 'RECORD INSPECTION'}</span><h3>{component.label}</h3></div>
        <button type="button" className="diag-icon-button" onClick={onCancel} aria-label="Close form">×</button>
      </div>
      <label>
        {mode === 'schedule' ? 'Scheduled service date' : 'Service / inspection date'}
        <input type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
      </label>
      <label>
        {mode === 'schedule' ? 'Service notes (optional)' : 'Recorded findings / notes'}
        <textarea value={findings} onChange={(event) => setFindings(event.target.value)} rows="3" maxLength="2000" required={mode !== 'schedule'} placeholder={mode === 'schedule' ? 'Add details if known' : 'Enter only findings actually observed'} />
      </label>
      <div className="diag-editor-row">
        <label>Odometer (km)<input type="number" min="0" value={odometer} onChange={(event) => setOdometer(event.target.value)} placeholder={car?.current_mileage ?? 'Not recorded'} /></label>
        <label>Next service date<input type="date" value={nextServiceDate} onChange={(event) => setNextServiceDate(event.target.value)} /></label>
      </div>
      {mode === 'edit' && (
        <label>Task status
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="scheduled">Scheduled</option>
            <option value="completed">Completed</option>
            <option value="overdue">Overdue</option>
          </select>
        </label>
      )}
      <div className="diag-editor-actions">
        <button type="button" onClick={onCancel}>Cancel</button>
        <button type="submit" disabled={saving}>{saving ? 'Saving…' : mode === 'schedule' ? 'Save scheduled service' : 'Save record'}</button>
      </div>
    </form>
  )
}

export default function MaintenancePredictions({ navigate }) {
  const [vehicles, setVehicles] = useState([])
  const [maintenance, setMaintenance] = useState(EMPTY_MAINTENANCE)
  const [predictionData, setPredictionData] = useState(EMPTY_PREDICTIONS)
  const [selectedVehicleId, setSelectedVehicleId] = useState('')
  const [selectedComponentKey, setSelectedComponentKey] = useState(COMPONENTS[0].key)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formMode, setFormMode] = useState('')
  const [error, setError] = useState('')
  const [mileageError, setMileageError] = useState('')
  const [mileageEditing, setMileageEditing] = useState(false)
  const [mileageInput, setMileageInput] = useState('')
  const [assistantBusy, setAssistantBusy] = useState(false)
  const [assistantError, setAssistantError] = useState('')
  const [assistantMessage, setAssistantMessage] = useState('')
  const [conversationId, setConversationId] = useState(null)

  const loadData = useCallback(async () => {
    try {
      const [fleet, maintenanceResponse, predictionsResponse] = await Promise.all([
        getFleetVehicles(),
        getMaintenanceRecords(),
        getMaintenancePredictions(),
      ])
      setVehicles(fleet)
      setMaintenance(maintenanceResponse)
      setPredictionData(predictionsResponse)
      setSelectedVehicleId((current) => (
        fleet.some((vehicle) => String(vehicle.id) === current)
          ? current
          : String(fleet[0]?.id ?? '')
      ))
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void Promise.resolve().then(loadData)
  }, [loadData])

  const selectedVehicle = vehicles.find((vehicle) => String(vehicle.id) === selectedVehicleId) || null
  const selectedComponent = COMPONENTS.find((component) => component.key === selectedComponentKey) || COMPONENTS[0]
  const vehicleRecords = useMemo(() => maintenance.records.filter(
    (record) => Number(record.vehicleID) === Number(selectedVehicleId),
  ), [maintenance.records, selectedVehicleId])
  const selectedState = useMemo(() => componentStatus(vehicleRecords, selectedComponent), [vehicleRecords, selectedComponent])
  const vehiclePrediction = predictionData.predictions.find(
    (prediction) => Number(prediction.vehicleID) === Number(selectedVehicleId),
  ) || null
  const componentStates = useMemo(() => COMPONENTS.map((component) => ({
    component,
    ...componentStatus(vehicleRecords, component),
  })), [vehicleRecords])

  const summary = useMemo(() => ({
    overdue: componentStates.filter((item) => item.key === 'overdue').length,
    dueSoon: componentStates.filter((item) => item.key === 'due_soon').length,
    findings: componentStates.filter((item) => ['critical', 'needs_review'].includes(item.key)).length,
    notInspected: componentStates.filter((item) => item.key === 'insufficient').length,
  }), [componentStates])

  const finishSave = async () => {
    setFormMode('')
    setSaving(false)
    await loadData()
  }

  async function saveComponentRecord(values) {
    if (!selectedVehicle) return
    setSaving(true)
    setError('')
    try {
      const isEditing = formMode === 'edit'
      const record = selectedState.record
      const status = formMode === 'schedule' ? 'scheduled' : values.status || 'completed'
      const payload = {
        maintenanceType: formMode === 'schedule'
          ? `${selectedComponent.label} service`
          : isEditing
            ? record.maintenanceType
            : `${selectedComponent.label} inspection`,
        description: values.findings,
        maintenanceDate: values.date,
        cost: isEditing ? record.cost || 0 : 0,
        maintenanceStatus: status,
        nextMaintenanceDate: values.nextServiceDate || null,
        odometerReading: values.odometer === '' ? null : Number(values.odometer),
      }
      if (isEditing && record) {
        await updateMaintenanceRecord(record.maintenanceID, payload)
      } else {
        await recordMaintenance({ vehicleID: Number(selectedVehicle.id), ...payload })
      }
      await finishSave()
    } catch (requestError) {
      setError(requestError.message)
      setSaving(false)
    }
  }

  async function completeScheduledRecord() {
    const record = selectedState.record
    if (!record || !selectedVehicle) return
    setSaving(true)
    setError('')
    try {
      await updateMaintenanceRecord(record.maintenanceID, {
        maintenanceStatus: 'completed',
        maintenanceDate: TODAY,
        ...(selectedVehicle.current_mileage !== null && selectedVehicle.current_mileage !== undefined
          ? { odometerReading: Number(selectedVehicle.current_mileage) }
          : {}),
      })
      await loadData()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  async function saveMileage(event) {
    event.preventDefault()
    if (!selectedVehicle || mileageInput === '') return
    setSaving(true)
    setMileageError('')
    try {
      await updateVehicleMileage({ vehicleID: Number(selectedVehicle.id), current_mileage: Number(mileageInput) })
      setMileageEditing(false)
      setMileageInput('')
      await loadData()
    } catch (requestError) {
      setMileageError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  async function refreshPredictions() {
    setRefreshing(true)
    setError('')
    try {
      await generateMaintenancePredictions()
      await loadData()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setRefreshing(false)
    }
  }

  async function analyzeComponent() {
    if (!selectedVehicle) return
    setAssistantBusy(true)
    setAssistantError('')
    setAssistantMessage('')
    try {
      const response = await requestDiagnosticAnalysis({
        vehicle_id: Number(selectedVehicle.id),
        component: selectedComponent.label,
        conversation_id: conversationId,
        message: `Explain the recorded maintenance evidence and rule-based service estimate for the selected ${selectedComponent.label} component on this vehicle. Distinguish recorded facts, estimates, and missing information. Do not infer unrecorded condition or measurements.`,
      })
      setAssistantMessage(response?.message || 'The diagnostic service returned no explanation.')
      setConversationId(response?.conversation_id || null)
    } catch (requestError) {
      setAssistantError(requestError.message)
    } finally {
      setAssistantBusy(false)
    }
  }

  function selectVehicle(event) {
    setSelectedVehicleId(event.target.value)
    setSelectedComponentKey(COMPONENTS[0].key)
    setFormMode('')
    setAssistantMessage('')
    setAssistantError('')
    setConversationId(null)
  }

  function retryLoading() {
    setError('')
    setLoading(true)
    void loadData()
  }

  return (
    <div className="admin-content maintenance-diagnostics">
      <header className="diag-header">
        <div className="diag-brand-title">
          <span className="diag-kicker">DRIVERENT · FLEET INTELLIGENCE</span>
          <h1>Vehicle diagnostics</h1>
          <p>Maintenance evidence and explainable service planning. No live sensor telemetry is connected.</p>
        </div>
        <div className="diag-header-actions">
          <label className="diag-vehicle-select">
            <span>SELECT VEHICLE</span>
            <select value={selectedVehicleId} onChange={selectVehicle} disabled={loading || vehicles.length === 0}>
              {vehicles.length
                ? vehicles.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.make} {vehicle.model}{vehicle.plate_number ? ` · ${vehicle.plate_number}` : ''}
                  </option>
                ))
                : <option value="">No vehicles in inventory</option>}
            </select>
          </label>
          <button type="button" className="diag-refresh-button" onClick={refreshPredictions} disabled={refreshing || loading || !selectedVehicle}>
            {refreshing ? 'Updating…' : 'Recalculate service estimate'}
          </button>
        </div>
      </header>

      {error && vehicles.length > 0 && <div className="diag-alert" role="alert">{error}</div>}
      {loading ? (
        <div className="diag-loading" role="status"><span className="spinner" />Loading vehicle and service records…</div>
      ) : error && !vehicles.length ? (
        <div className="diag-empty" role="alert">
          <h2>Unable to load diagnostic data</h2>
          <p>{error}</p>
          <button type="button" onClick={retryLoading}>Retry</button>
        </div>
      ) : !vehicles.length ? (
        <div className="diag-empty" role="status">
          <h2>No vehicles in the fleet</h2>
          <p>Add a vehicle in the existing inventory before opening its diagnostic view.</p>
          <button type="button" onClick={() => navigate('/admin/vehicles')}>Open vehicle inventory</button>
        </div>
      ) : selectedVehicle ? (
        <>
          <section className="diag-summary-strip" aria-label="Selected vehicle maintenance summary">
            <div className="diag-overall-status">
              <span className="diag-status-light" />
              <div><span className="diag-kicker">CURRENT RECORD STATUS</span><strong>{vehicleRecords.length ? 'Records available · condition not established' : 'Insufficient diagnostic data'}</strong></div>
            </div>
            <div className="diag-summary-stat"><strong>{summary.overdue}</strong><span>Overdue tasks</span></div>
            <div className="diag-summary-stat"><strong>{summary.dueSoon}</strong><span>Due within 30 days</span></div>
            <div className="diag-summary-stat"><strong>{summary.findings}</strong><span>Reported findings</span></div>
            <div className="diag-summary-stat"><strong>{summary.notInspected}</strong><span>Not inspected</span></div>
          </section>

          <div className="diag-workspace">
            <aside className="diag-component-sidebar" aria-label="Vehicle component list">
              <div className="diag-panel-heading"><div><span className="diag-kicker">INSPECTION AREAS</span><h2>Components</h2></div><span>{COMPONENTS.length}</span></div>
              <div className="diag-component-list">
                {componentStates.map(({ component, key }) => (
                  <button
                    key={component.key}
                    type="button"
                    className={`diag-component-button${selectedComponentKey === component.key ? ' is-active' : ''}`}
                    onClick={() => { setSelectedComponentKey(component.key); setFormMode(''); setAssistantMessage('') }}
                  >
                    <span className="diag-component-indicator" />
                    <span>{component.label}</span>
                    <small>{STATUS_LABELS[key]}</small>
                  </button>
                ))}
              </div>
              <div className="diag-no-telemetry"><strong>Telemetry unavailable</strong><span>RPM, voltage, tire pressure, temperatures, and sensor readings are not connected.</span></div>
            </aside>

            <main className="diag-main-column">
              <MaintenanceVehicleViewer
                car={selectedVehicle}
                components={COMPONENTS}
                selectedComponent={selectedComponentKey}
                onSelect={(componentKey) => { setSelectedComponentKey(componentKey); setFormMode(''); setAssistantMessage('') }}
              />
              <section className="diag-spec-panel" aria-label="Vehicle specifications">
                <div className="diag-panel-heading"><div><span className="diag-kicker">LIVE INVENTORY FIELDS</span><h2>Vehicle specifications</h2></div><span className="diag-source-label">Source: fleet inventory</span></div>
                <div className="diag-spec-grid">
                  <Field label="Vehicle">{selectedVehicle.make} {selectedVehicle.model}</Field>
                  <Field label="Year">{selectedVehicle.year}</Field>
                  <Field label="Plate">{selectedVehicle.plate_number}</Field>
                  <Field label="Color">{selectedVehicle.color}</Field>
                  <Field label="Fuel">{selectedVehicle.fuel_type}</Field>
                  <Field label="Transmission">{selectedVehicle.transmission}</Field>
                  <Field label="Seats">{selectedVehicle.seating_capacity}</Field>
                  <Field label="Fleet status">{selectedVehicle.status}</Field>
                  <Field label="Current mileage">{formatMileage(selectedVehicle.current_mileage)}</Field>
                </div>
              </section>
            </main>

            <aside className="diag-detail-column">
              <section className="diag-detail-panel">
                <div className="diag-panel-heading"><div><span className="diag-kicker">SELECTED COMPONENT</span><h2>{selectedComponent.label}</h2></div></div>
                <div className={`diag-state-badge state-${selectedState.key}`}><span />{STATUS_LABELS[selectedState.key]}</div>
                <p className="diag-status-explainer">
                  {selectedState.key === 'insufficient'
                    ? 'No matching inspection or maintenance record was found. Component condition is unknown.'
                    : selectedState.key === 'overdue'
                      ? 'A recorded scheduled task has passed its due date; this does not confirm a mechanical failure.'
                      : selectedState.key === 'due_soon'
                        ? 'A recorded service date is within 30 days. Confirm the due date against the vehicle schedule.'
                        : selectedState.key === 'needs_review' || selectedState.key === 'critical'
                          ? 'The note below contains a reported finding. It is shown as recorded, not independently verified.'
                          : 'A maintenance record exists. It does not establish current component health or unrecorded measurements.'}
                </p>
                <div className="diag-detail-facts">
                  <Field label="Vehicle">{selectedVehicle.make} {selectedVehicle.model} · {selectedVehicle.plate_number || 'No plate recorded'}</Field>
                  <Field label="Latest service / inspection">{formatDate(selectedState.record?.maintenanceDate)}</Field>
                  <Field label="Odometer at record">{formatMileage(selectedState.record?.odometerReading)}</Field>
                  <Field label="Current odometer">{formatMileage(selectedVehicle.current_mileage)}</Field>
                  <Field label="Next scheduled date">{formatDate(selectedState.record?.nextMaintenanceDate)}</Field>
                  <Field label="Recorded status">{selectedState.record?.maintenanceStatus || 'Not recorded'}</Field>
                </div>
                {selectedState.record?.description && <div className="diag-finding-note"><span>RECORDED FINDING / NOTES</span><p>{selectedState.record.description}</p></div>}

                <div className="diag-actions-grid">
                  <button type="button" onClick={() => setFormMode('inspection')}>Record inspection</button>
                  <button type="button" onClick={() => setFormMode('schedule')}>Schedule service</button>
                  {selectedState.record && <button type="button" onClick={() => setFormMode('edit')}>Update record</button>}
                  {selectedState.record && ['scheduled', 'pending', 'overdue'].includes(normalize(selectedState.record.maintenanceStatus)) && (
                    <button type="button" onClick={completeScheduledRecord} disabled={saving}>{saving ? 'Saving…' : 'Mark task complete'}</button>
                  )}
                </div>
                {formMode && (
                  <MaintenanceEditor
                    key={`${selectedComponentKey}-${formMode}-${selectedState.record?.maintenanceID || ''}`}
                    mode={formMode}
                    component={selectedComponent}
                    record={formMode === 'edit' ? selectedState.record : null}
                    car={selectedVehicle}
                    saving={saving}
                    onCancel={() => setFormMode('')}
                    onSave={saveComponentRecord}
                  />
                )}
              </section>

              <section className="diag-prediction-panel">
                <div className="diag-panel-heading"><div><span className="diag-kicker">RULE-BASED PLANNING</span><h2>Service estimate</h2></div></div>
                {vehiclePrediction ? (
                  <>
                    <div className={`diag-state-badge state-${vehiclePrediction.riskLevel === 'high' ? 'overdue' : vehiclePrediction.riskLevel === 'medium' ? 'due_soon' : vehiclePrediction.riskLevel === 'low' ? 'service_recorded' : 'insufficient'}`}>
                      <span />{vehiclePrediction.riskLevel === 'high' ? 'Interval reached / review' : vehiclePrediction.riskLevel === 'medium' ? 'Baseline interval approaching' : vehiclePrediction.riskLevel === 'low' ? 'Baseline interval not reached' : 'Insufficient data'}
                    </div>
                    <p>{vehiclePrediction.predictedIssue}</p>
                    <p><strong>Suggested action:</strong> {vehiclePrediction.recommendedAction}</p>
                    <Field label="Estimated due date">{formatDate(vehiclePrediction.nextMaintenanceDate)}</Field>
                    <small className="diag-interval-note">Uses a generic 5,000 km / 180-day planning baseline where records permit. This is not manufacturer-specific and does not predict component failure.</small>
                  </>
                ) : <p className="diag-muted">No rule-based estimate is available for this vehicle yet.</p>}
              </section>

              <section className="diag-assistant-panel">
                <div className="diag-panel-heading"><div><span className="diag-kicker">EXISTING AI ROUTER</span><h2>Diagnostic assistant</h2></div></div>
                <p>Ask for an explanation of this vehicle’s recorded evidence. AI output is explanatory, not an inspection result.</p>
                {assistantMessage && <div className="diag-assistant-response" role="status">{assistantMessage}</div>}
                {assistantError && <div className="diag-inline-error" role="alert">{assistantError}</div>}
                <button type="button" className="diag-assistant-button" onClick={analyzeComponent} disabled={assistantBusy}>
                  {assistantBusy ? 'Reviewing recorded evidence…' : 'Explain this component'}
                </button>
              </section>
            </aside>
          </div>

          <section className="diag-history-panel">
            <div className="diag-panel-heading"><div><span className="diag-kicker">VEHICLE-SPECIFIC RECORDS</span><h2>{selectedComponent.label} history</h2></div><span>{selectedState.history.length} matching records</span></div>
            {selectedState.history.length ? (
              <div className="diag-history-list">
                {selectedState.history.map((record) => (
                  <article key={record.maintenanceID} className="diag-history-row">
                    <div><strong>{record.maintenanceType}</strong><span>{record.description || 'No findings or notes recorded.'}</span></div>
                    <div><span>{formatDate(record.maintenanceDate)}</span><small>{record.maintenanceStatus}</small></div>
                    <div><span>{formatMileage(record.odometerReading)}</span><small>Recorded odometer</small></div>
                    <div><span>{formatDate(record.nextMaintenanceDate)}</span><small>Next service date</small></div>
                  </article>
                ))}
              </div>
            ) : <div className="diag-history-empty">Not inspected — no matching component history is recorded for this vehicle.</div>}
          </section>

          <section className="diag-mileage-panel">
            <div><span className="diag-kicker">MAINTENANCE DATA</span><h2>Odometer update</h2><p>Change the recorded inventory mileage for {selectedVehicle.make} {selectedVehicle.model}.</p></div>
            {mileageEditing ? (
              <form className="diag-mileage-form" onSubmit={saveMileage}>
                <label>Current mileage (km)<input type="number" min="0" value={mileageInput} onChange={(event) => setMileageInput(event.target.value)} required /></label>
                <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save mileage'}</button>
                <button type="button" onClick={() => { setMileageEditing(false); setMileageError('') }}>Cancel</button>
              </form>
            ) : (
              <div className="diag-mileage-current"><strong>{formatMileage(selectedVehicle.current_mileage)}</strong><button type="button" onClick={() => { setMileageInput(selectedVehicle.current_mileage ?? ''); setMileageEditing(true) }}>Update mileage</button></div>
            )}
            {mileageError && <div className="diag-inline-error" role="alert">{mileageError}</div>}
          </section>
        </>
      ) : null}
    </div>
  )
}
