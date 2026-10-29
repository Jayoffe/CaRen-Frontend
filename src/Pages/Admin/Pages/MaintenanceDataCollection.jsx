import { useEffect, useMemo, useState } from 'react'
import {
  createMaintenanceDataRecord,
  exportVerifiedMaintenanceData,
  getFleetVehicles,
  getMaintenanceDataRecord,
  getMaintenanceDataRecords,
  submitMaintenanceDataRecord,
  supersedeMaintenanceDataRecord,
  verifyMaintenanceDataRecord,
} from '../../../Services/API/maintenanceDataAPI.js'

const RECORD_TYPES = [
  ['vehicle_inspection', 'Vehicle inspection'],
  ['sensor_measurement', 'Sensor measurement'],
  ['diagnostic_scan', 'Diagnostic scan'],
  ['diagnostic_trouble_code', 'Diagnostic trouble code'],
  ['suspected_fault', 'Suspected fault'],
  ['mechanic_confirmed_fault', 'Mechanic-confirmed fault'],
  ['repair_performed', 'Repair performed'],
  ['component_replaced', 'Component replaced'],
  ['follow_up_inspection', 'Follow-up inspection'],
  ['preventive_maintenance', 'Preventive maintenance service'],
]

const STATUSES = ['draft', 'awaiting_verification', 'verified', 'rejected', 'superseded']
const nowLocal = () => new Date().toISOString().slice(0, 16)
const createIdempotencyKey = () => crypto.randomUUID()
const freshForm = () => ({
  vehicle_id: '',
  record_type: 'vehicle_inspection',
  recorded_at: nowLocal(),
  odometer_reading: '',
  odometer_unit: 'km',
  component: '',
  component_identifier: '',
  symptoms: '',
  inspection_findings: '',
  dtc_codes: '',
  sensor_measurements: [{ name: '', value: '', unit: '' }],
  suspected_cause: '',
  confirmed_cause: '',
  diagnostic_tests: '',
  repair_action: '',
  replaced_components: '',
  repair_outcome: '',
  technician_reference: '',
  source: 'manual_entry',
  evidence_reference: '',
  engine_details: '',
})

const recordTypeName = (type) => RECORD_TYPES.find(([value]) => value === type)?.[1] || type
const displayValue = (value) => value === null || value === undefined || value === '' ? 'Not recorded' : value

function recordPayload(form) {
  return {
    ...form,
    recorded_at: new Date(`${form.recorded_at}:00Z`).toISOString(),
    odometer_reading: form.odometer_reading === '' ? null : Number(form.odometer_reading),
    odometer_unit: form.odometer_reading === '' ? null : form.odometer_unit,
    dtc_codes: form.dtc_codes.split(/\r?\n/).map((value) => value.trim()).filter(Boolean),
    sensor_measurements: form.sensor_measurements
      .filter((measurement) => measurement.name || measurement.value || measurement.unit)
      .map((measurement) => ({ ...measurement, value: Number(measurement.value) })),
    replaced_components: form.replaced_components.split(/\r?\n/).map((value) => value.trim()).filter(Boolean),
  }
}

export default function MaintenanceDataCollection() {
  const [vehicles, setVehicles] = useState([])
  const [records, setRecords] = useState([])
  const [meta, setMeta] = useState({ total: 0, page: 1, total_pages: 1 })
  const [filters, setFilters] = useState({
    search: '', vehicle_id: '', component: '', record_type: '', verification_status: '',
    date_from: '', date_to: '', page: 1, limit: 50,
  })
  const [form, setForm] = useState(freshForm)
  const [idempotencyKey, setIdempotencyKey] = useState(createIdempotencyKey)
  const [selectedId, setSelectedId] = useState('')
  const [detail, setDetail] = useState(null)
  const [detailErrorId, setDetailErrorId] = useState('')
  const [detailRetry, setDetailRetry] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [replacementId, setReplacementId] = useState('')
  const [supersedeReason, setSupersedeReason] = useState('')

  const selectedVehicle = useMemo(
    () => vehicles.find((vehicle) => String(vehicle.id) === String(form.vehicle_id)),
    [vehicles, form.vehicle_id],
  )

  useEffect(() => {
    let active = true
    getFleetVehicles()
      .then((fleet) => { if (active) setVehicles(fleet) })
      .catch((requestError) => { if (active) setError(requestError.message) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    getMaintenanceDataRecords(filters)
      .then((result) => {
        if (!active) return
        setRecords(result.records)
        setMeta(result.meta)
        setError('')
      })
      .catch((requestError) => { if (active) setError(requestError.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [filters])

  useEffect(() => {
    if (!selectedId) return undefined
    let active = true
    getMaintenanceDataRecord(selectedId)
      .then((result) => { if (active) setDetail(result) })
      .catch((requestError) => {
        if (!active) return
        setDetailErrorId(String(selectedId))
        setError(requestError.message)
      })
    return () => { active = false }
  }, [selectedId, detailRetry])

  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }))
  const setFilter = (field, value) => {
    setLoading(true)
    setFilters((current) => ({ ...current, [field]: value, page: 1 }))
  }

  const refreshRecords = async () => {
    const result = await getMaintenanceDataRecords(filters)
    setRecords(result.records)
    setMeta(result.meta)
  }

  const submitForm = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const saved = await createMaintenanceDataRecord(recordPayload(form), idempotencyKey)
      setForm(freshForm())
      setIdempotencyKey(createIdempotencyKey())
      setSelectedId(String(saved.id))
      await refreshRecords()
      setNotice('Record saved as a draft. Submit it when its details and evidence are ready for verification.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  const runRecordAction = async (action, successMessage) => {
    if (!selectedId) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await action()
      setNotice(successMessage)
      await Promise.all([refreshRecords(), getMaintenanceDataRecord(selectedId).then(setDetail)])
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  const downloadExport = async () => {
    setExporting(true)
    setError('')
    try {
      await exportVerifiedMaintenanceData()
      setNotice('Downloaded verified records only. Review the included label policy before model use.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setExporting(false)
    }
  }

  const record = String(detail?.record?.id) === String(selectedId) ? detail.record : null

  return <div className="admin-content maintenance-page maintenance-data-page">
    <header className="maintenance-page-heading">
      <div>
        <span className="eyebrow">FLEET EVIDENCE</span>
        <h1>Maintenance Data Collection</h1>
        <p>Capture observations, diagnostics, confirmed findings, and repair outcomes separately. This is a data collection tool, not a fault predictor.</p>
      </div>
      <button className="button button-outline" type="button" onClick={downloadExport} disabled={exporting}>
        {exporting ? 'Preparing export…' : 'Export verified data'}
      </button>
    </header>

    {error && <div className="error-message" role="alert">{error}</div>}
    {notice && <div className="maintenance-data-notice" role="status">{notice}</div>}

    <section className="maintenance-panel">
      <div className="maintenance-panel-heading">
        <div><span className="eyebrow">NEW EVIDENCE</span><h2>Record an inspection, scan, or repair</h2></div>
      </div>
      {vehicles.length === 0 && !loading && <p className="maintenance-empty">No fleet vehicles were returned. Add a vehicle before creating a maintenance record.</p>}
      <form className="maintenance-data-form" onSubmit={submitForm}>
        <label>Vehicle
          <select required value={form.vehicle_id} onChange={(event) => setField('vehicle_id', event.target.value)}>
            <option value="">Select a vehicle</option>
            {vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.make} {vehicle.model} ({vehicle.year}) — {vehicle.plate_number || `ID ${vehicle.id}`}</option>)}
          </select>
        </label>
        <label>Record type
          <select required value={form.record_type} onChange={(event) => setField('record_type', event.target.value)}>
            {RECORD_TYPES.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
        </label>
        <label>Record timestamp (UTC)
          <input required type="datetime-local" value={form.recorded_at} onChange={(event) => setField('recorded_at', event.target.value)} />
        </label>
        <label>Odometer reading
          <input type="number" min="0" step="1" value={form.odometer_reading} onChange={(event) => setField('odometer_reading', event.target.value)} />
        </label>
        <label>Odometer unit
          <select value={form.odometer_unit} onChange={(event) => setField('odometer_unit', event.target.value)}>
            <option value="km">Kilometres (km)</option>
            <option value="mi">Miles (mi)</option>
          </select>
        </label>
        <label>Component or system
          <input maxLength="160" value={form.component} onChange={(event) => setField('component', event.target.value)} placeholder="e.g. cooling system" />
        </label>
        <label>Component identifier (when assigned)
          <input maxLength="160" value={form.component_identifier} onChange={(event) => setField('component_identifier', event.target.value)} placeholder="Use an existing fleet/catalog identifier" />
        </label>
        <label>Vehicle type
          <input value={selectedVehicle?.category || ''} readOnly placeholder="From fleet vehicle record" />
        </label>
        <label>Engine details, if known
          <input maxLength="500" value={form.engine_details} onChange={(event) => setField('engine_details', event.target.value)} placeholder="Do not guess missing specifications" />
        </label>
        <label>Symptoms
          <textarea rows="3" value={form.symptoms} onChange={(event) => setField('symptoms', event.target.value)} />
        </label>
        <label>Inspection findings
          <textarea rows="3" value={form.inspection_findings} onChange={(event) => setField('inspection_findings', event.target.value)} />
        </label>
        <label>Diagnostic trouble codes (one per line)
          <textarea rows="3" value={form.dtc_codes} onChange={(event) => setField('dtc_codes', event.target.value)} placeholder="DTCs are observations, not confirmed failures" />
        </label>
        <fieldset className="maintenance-data-sensors">
          <legend>Sensor measurements (optional)</legend>
          {form.sensor_measurements.map((measurement, index) => <div className="maintenance-data-sensor-row" key={`sensor-${index}`}>
            <label>Sensor / parameter
              <input value={measurement.name} onChange={(event) => setForm((current) => ({
                ...current,
                sensor_measurements: current.sensor_measurements.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item),
              }))} />
            </label>
            <label>Value
              <input type="number" step="any" value={measurement.value} onChange={(event) => setForm((current) => ({
                ...current,
                sensor_measurements: current.sensor_measurements.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item),
              }))} />
            </label>
            <label>Unit
              <input value={measurement.unit} onChange={(event) => setForm((current) => ({
                ...current,
                sensor_measurements: current.sensor_measurements.map((item, itemIndex) => itemIndex === index ? { ...item, unit: event.target.value } : item),
              }))} />
            </label>
            {form.sensor_measurements.length > 1 && <button className="button button-outline" type="button" onClick={() => setForm((current) => ({
              ...current,
              sensor_measurements: current.sensor_measurements.filter((_, itemIndex) => itemIndex !== index),
            }))}>Remove</button>}
          </div>)}
          <button className="button button-outline" type="button" onClick={() => setForm((current) => ({
            ...current,
            sensor_measurements: [...current.sensor_measurements, { name: '', value: '', unit: '' }],
          }))}>Add sensor measurement</button>
        </fieldset>
        <label>Suspected cause
          <textarea rows="3" value={form.suspected_cause} onChange={(event) => setField('suspected_cause', event.target.value)} />
        </label>
        {form.record_type === 'mechanic_confirmed_fault' && <label>Mechanic-confirmed cause
          <textarea required rows="3" value={form.confirmed_cause} onChange={(event) => setField('confirmed_cause', event.target.value)} />
        </label>}
        <label>Diagnostic tests performed and results
          <textarea rows="3" value={form.diagnostic_tests} onChange={(event) => setField('diagnostic_tests', event.target.value)} />
        </label>
        <label>Repair action
          <textarea rows="3" value={form.repair_action} onChange={(event) => setField('repair_action', event.target.value)} />
        </label>
        <label>Replaced components (one per line)
          <textarea rows="2" value={form.replaced_components} onChange={(event) => setField('replaced_components', event.target.value)} />
        </label>
        <label>Repair outcome / verification
          <textarea rows="3" value={form.repair_outcome} onChange={(event) => setField('repair_outcome', event.target.value)} />
        </label>
        <label>Technician reference
          <input maxLength="160" value={form.technician_reference} onChange={(event) => setField('technician_reference', event.target.value)} />
        </label>
        <label>Record source
          <input required maxLength="160" value={form.source} onChange={(event) => setField('source', event.target.value)} />
        </label>
        <label>Evidence reference (file path or URL)
          <input maxLength="5000" value={form.evidence_reference} onChange={(event) => setField('evidence_reference', event.target.value)} />
        </label>
        <div className="maintenance-data-form-note">
          Make, model, year, and vehicle type are snapshotted from the selected fleet vehicle. Sensor fields and confirmed causes are optional unless the record type is a mechanic-confirmed fault. New records are drafts and are never automatically verified.
        </div>
        <button className="button button-primary" type="submit" disabled={saving || vehicles.length === 0}>
          {saving ? 'Saving…' : 'Save draft record'}
        </button>
      </form>
    </section>

    <section className="maintenance-panel">
      <div className="maintenance-panel-heading">
        <div><span className="eyebrow">RECORD REGISTER</span><h2>Search and verify maintenance evidence</h2></div>
        <span className="maintenance-count">{meta.total} records</span>
      </div>
      <div className="maintenance-data-filters">
        <label>Search <input value={filters.search} onChange={(event) => setFilter('search', event.target.value)} placeholder="Symptoms, DTC, vehicle…" /></label>
        <label>Vehicle
          <select value={filters.vehicle_id} onChange={(event) => setFilter('vehicle_id', event.target.value)}>
            <option value="">All vehicles</option>
            {vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.make} {vehicle.model} — {vehicle.plate_number || vehicle.id}</option>)}
          </select>
        </label>
        <label>Record type
          <select value={filters.record_type} onChange={(event) => setFilter('record_type', event.target.value)}>
            <option value="">All types</option>
            {RECORD_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>Component <input value={filters.component} onChange={(event) => setFilter('component', event.target.value)} /></label>
        <label>Verification status
          <select value={filters.verification_status} onChange={(event) => setFilter('verification_status', event.target.value)}>
            <option value="">All statuses</option>
            {STATUSES.map((status) => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}
          </select>
        </label>
        <label>From <input type="date" value={filters.date_from} onChange={(event) => setFilter('date_from', event.target.value)} /></label>
        <label>To <input type="date" value={filters.date_to} onChange={(event) => setFilter('date_to', event.target.value)} /></label>
      </div>
      {loading ? <div className="loading-state" role="status">Loading maintenance records…</div>
        : records.length === 0 ? <div className="maintenance-empty">No records match these filters.</div>
          : <div className="maintenance-table-wrap"><table className="maintenance-table">
            <thead><tr><th>Vehicle</th><th>Type</th><th>Component</th><th>Recorded</th><th>Odometer</th><th>Verification</th><th>Details</th></tr></thead>
            <tbody>{records.map((item) => <tr key={item.id}>
              <td><strong>{item.make} {item.model}</strong><small>{item.plate_number || `Vehicle ${item.vehicle_id}`}</small></td>
              <td>{recordTypeName(item.record_type)}</td><td>{displayValue(item.component)}</td>
              <td>{item.recorded_at} UTC</td><td>{item.odometer_reading === null ? 'Not recorded' : `${item.odometer_reading} ${item.odometer_unit}`}</td>
              <td><span className={`maintenance-data-status status-${item.verification_status}`}>{item.verification_status.replaceAll('_', ' ')}</span></td>
              <td><button className="button button-outline" type="button" onClick={() => setSelectedId(String(item.id))}>View record</button></td>
            </tr>)}</tbody>
          </table></div>}
      {meta.total_pages > 1 && <div className="maintenance-data-pagination">
        <button className="button button-outline" type="button" disabled={filters.page <= 1} onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))}>Previous</button>
        <span>Page {meta.page} of {meta.total_pages}</span>
        <button className="button button-outline" type="button" disabled={filters.page >= meta.total_pages} onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}>Next</button>
      </div>}
    </section>

    {selectedId && <section className="maintenance-panel maintenance-data-detail" aria-live="polite">
      <div className="maintenance-panel-heading">
        <div><span className="eyebrow">RECORD DETAIL</span><h2>Maintenance evidence #{selectedId}</h2></div>
        <button className="button button-outline" type="button" onClick={() => setSelectedId('')}>Close</button>
      </div>
      {!record && detailErrorId === String(selectedId)
        ? <div className="error-message" role="alert">Record detail could not be loaded. <button className="button button-outline" type="button" onClick={() => setDetailRetry((value) => value + 1)}>Retry</button></div>
        : !record ? <div className="loading-state" role="status">Loading record detail…</div> : <>
        <div className="maintenance-data-record-grid">
          <p><strong>Vehicle</strong>{record.vehicle_make} {record.vehicle_model} {record.vehicle_year} ({record.vehicle_type}) · ID {record.vehicle_id}</p>
          <p><strong>Type / status</strong>{recordTypeName(record.record_type)} · {record.verification_status.replaceAll('_', ' ')}</p>
          <p><strong>Timestamp / odometer</strong>{record.recorded_at} UTC · {record.odometer_reading === null ? 'Not recorded' : `${record.odometer_reading} ${record.odometer_unit}`}</p>
          <p><strong>Component / identifier / engine</strong>{displayValue(record.component)} · {displayValue(record.component_identifier)} · {displayValue(record.engine_details)}</p>
          <p><strong>Symptoms</strong>{displayValue(record.symptoms)}</p>
          <p><strong>Inspection findings</strong>{displayValue(record.inspection_findings)}</p>
          <p><strong>DTCs</strong>{record.dtc_codes.length ? record.dtc_codes.join(', ') : 'Not recorded (not interpreted as no fault)'}</p>
          <p><strong>Sensor measurements</strong>{record.sensor_measurements.length ? record.sensor_measurements.map((sensor) => `${sensor.name}: ${sensor.value} ${sensor.unit}`).join('; ') : 'Not recorded'}</p>
          <p><strong>Suspected cause</strong>{displayValue(record.suspected_cause)}</p>
          <p><strong>Confirmed cause</strong>{displayValue(record.confirmed_cause)}</p>
          <p><strong>Diagnostic tests</strong>{displayValue(record.diagnostic_tests)}</p>
          <p><strong>Repair action / replaced parts</strong>{displayValue(record.repair_action)} · {record.replaced_components.join(', ') || 'No components recorded'}</p>
          <p><strong>Repair outcome</strong>{displayValue(record.repair_outcome)}</p>
          <p><strong>Technician / source</strong>{displayValue(record.technician_reference)} · {record.source}</p>
          <p><strong>Evidence reference</strong>{displayValue(record.evidence_reference)}</p>
          <p><strong>Verified by / at</strong>{record.verified_by_username || 'Not verified'} · {record.verified_at || '—'}</p>
        </div>
        {record.verification_status === 'draft' && <button className="button button-primary" type="button" disabled={saving} onClick={() => runRecordAction(() => submitMaintenanceDataRecord(record.id), 'Record submitted for verification.')}>Submit for verification</button>}
        {record.verification_status === 'awaiting_verification' && <div className="maintenance-data-actions">
          <button className="button button-primary" type="button" disabled={saving} onClick={() => runRecordAction(() => verifyMaintenanceDataRecord(record.id, 'verified'), 'Record verified and added to verified-only exports.')}>Verify record</button>
          <label>Rejection reason
            <input value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} required />
          </label>
          <button className="button button-outline" type="button" disabled={saving || !rejectReason.trim()} onClick={() => runRecordAction(() => verifyMaintenanceDataRecord(record.id, 'rejected', rejectReason), 'Record rejected with an audit reason.')}>Reject record</button>
        </div>}
        {record.verification_status === 'verified' && <div className="maintenance-data-actions">
          <label>Verified replacement record ID
            <input type="number" min="1" value={replacementId} onChange={(event) => setReplacementId(event.target.value)} />
          </label>
          <label>Supersession reason
            <input value={supersedeReason} onChange={(event) => setSupersedeReason(event.target.value)} />
          </label>
          <button className="button button-outline" type="button" disabled={saving || !replacementId || !supersedeReason.trim()} onClick={() => runRecordAction(() => supersedeMaintenanceDataRecord(record.id, replacementId, supersedeReason), 'Record superseded. The original observation and audit history remain preserved.')}>Supersede with verified record</button>
        </div>}
        <h3>Verification and edit history</h3>
        {detail.history.length === 0 ? <p>No audit events are available.</p> : <ol className="maintenance-data-history">
          {detail.history.map((event) => <li key={event.id}>
            <strong>{event.event_type.replaceAll('_', ' ')}</strong> · {event.actor_username || 'Former user'} · {event.created_at} UTC
            {event.reason && <p>{event.reason}</p>}
            <small>{event.from_status || 'new'} → {event.to_status || '—'}</small>
          </li>)}
        </ol>}
      </>}
    </section>}
  </div>
}
