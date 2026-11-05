import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
import './MaintenanceDataCollection.css'

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

const SKELETON_ROWS = [1, 2, 3, 4]
const STATUS_TRACK = ['draft', 'awaiting_verification', 'verified']

const humanize = (value) => {
  const text = String(value || '').replaceAll('_', ' ').trim()
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : ''
}
const statusLabel = humanize
const plural = (count, word) => `${count} ${word}${Number(count) === 1 ? '' : 's'}`
const formatOdometer = (reading, unit) => `${Number(reading).toLocaleString('en-PH')} ${unit}`

/** Stored times are UTC, so they are shown as UTC, the same as the form asks for them. */
function formatUtc(value) {
  if (!value) return ''
  const text = String(value).trim().replace(' ', 'T')
  const date = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(text) ? text : `${text}Z`)
  if (Number.isNaN(date.getTime())) return String(value)
  return `${new Intl.DateTimeFormat('en-PH', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date)} UTC`
}

function FieldLabel({ required, children }) {
  return <span className="dc-label">{children}{required && <em className="dc-required">Required</em>}</span>
}

function FormSection({ title, hint, children }) {
  return (
    <div className="dc-form-section">
      <div className="dc-form-section-head">
        <h3>{title}</h3>
        <p>{hint}</p>
      </div>
      <div className="dc-fields">{children}</div>
    </div>
  )
}

function StatusPill({ status }) {
  return <span className={`dc-status dc-status-${status}`}><i aria-hidden="true" />{statusLabel(status)}</span>
}

/** Where the record is in its review. Rejected and superseded are endings, so they replace the last step. */
function StatusTrack({ status }) {
  const steps = status === 'rejected' || status === 'superseded'
    ? [...STATUS_TRACK.slice(0, status === 'rejected' ? 2 : 3), status]
    : STATUS_TRACK
  const current = steps.indexOf(status)
  return (
    <ol className="dc-track" aria-label="Verification progress">
      {steps.map((step, index) => (
        <li key={step} className={`${index < current ? 'is-done' : ''}${index === current ? ' is-current' : ''}${index === current && (step === 'rejected' || step === 'superseded') ? ` is-${step}` : ''}`} aria-current={index === current ? 'step' : undefined}>
          <span aria-hidden="true" />
          {statusLabel(step)}
        </li>
      ))}
    </ol>
  )
}

function DetailGroup({ title, children }) {
  return (
    <section className="dc-detail-group">
      <h3>{title}</h3>
      <dl>{children}</dl>
    </section>
  )
}

function Fact({ label, missing = 'Not recorded', children }) {
  const empty = children === null || children === undefined || children === '' || children === false
  return (
    <div className="dc-fact">
      <dt>{label}</dt>
      <dd className={empty ? 'dc-none' : undefined}>{empty ? missing : children}</dd>
    </div>
  )
}

function RecordDrawer({ selectedId, busy, onClose, children }) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    const dialog = ref.current
    if (!dialog.open) dialog.showModal()
    return () => dialog.close()
  }, [])
  return (
    <dialog
      ref={ref}
      className="dc-drawer"
      aria-labelledby="dc-drawer-title"
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onClose()
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <div className="dc-drawer-inner">
        <div className="dc-drawer-head">
          <h2 id="dc-drawer-title">Maintenance evidence #{selectedId}</h2>
          <button className="dc-btn dc-btn-outline" type="button" onClick={onClose}>Close</button>
        </div>
        <div className="dc-drawer-body" aria-live="polite">{children}</div>
      </div>
    </dialog>
  )
}

export default function MaintenanceDataCollection() {
  const [view, setView] = useState('register')
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

  const clearFilters = () => {
    setLoading(true)
    setFilters((current) => ({
      ...current, search: '', vehicle_id: '', component: '', record_type: '', verification_status: '', date_from: '', date_to: '', page: 1,
    }))
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
      setView('register')
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
  const hasFilters = Boolean(filters.search || filters.vehicle_id || filters.component || filters.record_type || filters.verification_status || filters.date_from || filters.date_to)
  const messages = <>
    {error && <p className="dc-banner dc-banner-bad" role="alert">{error}</p>}
    {notice && <p className="dc-banner dc-banner-good" role="status">{notice}</p>}
  </>

  return <div className="admin-content dc">
    <header className="dc-header">
      <div>
        <span className="dc-eyebrow">Fleet evidence</span>
        <h1>Maintenance data collection</h1>
        <p>Capture observations, diagnostics, confirmed findings, and repair outcomes separately. This is a data collection tool, not a fault predictor.</p>
      </div>
      <button className="dc-btn dc-btn-outline" type="button" onClick={downloadExport} disabled={exporting}>
        {exporting ? 'Preparing export…' : 'Export verified data'}
      </button>
    </header>

    {!selectedId && <div className="dc-messages">{messages}</div>}

    <div className="dc-tabs" role="tablist" aria-label="Maintenance data views">
      <button type="button" role="tab" id="dc-tab-register" aria-controls="dc-panel-register" aria-selected={view === 'register'} className={view === 'register' ? 'selected' : undefined} onClick={() => setView('register')}>
        Record register <span>{meta.total}</span>
      </button>
      <button type="button" role="tab" id="dc-tab-new" aria-controls="dc-panel-new" aria-selected={view === 'new'} className={view === 'new' ? 'selected' : undefined} onClick={() => setView('new')}>
        New record
      </button>
    </div>

    {/* Hidden rather than removed, so a half-filled record survives switching views. */}
    <section className="dc-card dc-form-panel" id="dc-panel-new" role="tabpanel" aria-labelledby="dc-tab-new" hidden={view !== 'new'}>
      <div className="dc-form-intro">
        <h2>Record an inspection, scan, or repair</h2>
        <p>Fill in what was actually observed. New records are drafts and are never automatically verified.</p>
      </div>
      {vehicles.length === 0 && !loading && <p className="dc-empty-note">No fleet vehicles were returned. Add a vehicle before creating a maintenance record.</p>}
      <form onSubmit={submitForm}>
        <FormSection title="Vehicle and record" hint="Make, model, year, and vehicle type are snapshotted from the selected fleet vehicle.">
          <label className="dc-field dc-span-2"><FieldLabel required>Vehicle</FieldLabel>
            <select required value={form.vehicle_id} onChange={(event) => setField('vehicle_id', event.target.value)}>
              <option value="">Select a vehicle</option>
              {vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.make} {vehicle.model} ({vehicle.year}) — {vehicle.plate_number || `ID ${vehicle.id}`}</option>)}
            </select>
          </label>
          <label className="dc-field"><FieldLabel>Vehicle type</FieldLabel>
            <input value={selectedVehicle?.category || ''} readOnly placeholder="From fleet vehicle record" />
          </label>
          <label className="dc-field dc-span-2"><FieldLabel required>Record type</FieldLabel>
            <select required value={form.record_type} onChange={(event) => setField('record_type', event.target.value)}>
              {RECORD_TYPES.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </select>
          </label>
          <label className="dc-field"><FieldLabel required>Record timestamp (UTC)</FieldLabel>
            <input required type="datetime-local" value={form.recorded_at} onChange={(event) => setField('recorded_at', event.target.value)} />
          </label>
          <label className="dc-field"><FieldLabel>Odometer reading</FieldLabel>
            <input type="number" min="0" step="1" value={form.odometer_reading} onChange={(event) => setField('odometer_reading', event.target.value)} />
          </label>
          <label className="dc-field"><FieldLabel>Odometer unit</FieldLabel>
            <select value={form.odometer_unit} onChange={(event) => setField('odometer_unit', event.target.value)}>
              <option value="km">Kilometres (km)</option>
              <option value="mi">Miles (mi)</option>
            </select>
          </label>
        </FormSection>

        <FormSection title="Component" hint="Leave a detail blank when it isn't known. Don't guess missing specifications.">
          <label className="dc-field"><FieldLabel>Component or system</FieldLabel>
            <input maxLength="160" value={form.component} onChange={(event) => setField('component', event.target.value)} placeholder="e.g. cooling system" />
          </label>
          <label className="dc-field"><FieldLabel>Component identifier (when assigned)</FieldLabel>
            <input maxLength="160" value={form.component_identifier} onChange={(event) => setField('component_identifier', event.target.value)} placeholder="Existing fleet or catalog identifier" />
          </label>
          <label className="dc-field"><FieldLabel>Engine details, if known</FieldLabel>
            <input maxLength="500" value={form.engine_details} onChange={(event) => setField('engine_details', event.target.value)} placeholder="Do not guess missing specifications" />
          </label>
        </FormSection>

        <FormSection title="Observations" hint="What was seen or measured. Trouble codes are observations, not confirmed failures.">
          <label className="dc-field dc-span-all"><FieldLabel>Symptoms</FieldLabel>
            <textarea rows="3" value={form.symptoms} onChange={(event) => setField('symptoms', event.target.value)} />
          </label>
          <label className="dc-field dc-span-all"><FieldLabel>Inspection findings</FieldLabel>
            <textarea rows="3" value={form.inspection_findings} onChange={(event) => setField('inspection_findings', event.target.value)} />
          </label>
          <label className="dc-field dc-span-all"><FieldLabel>Diagnostic trouble codes (one per line)</FieldLabel>
            <textarea rows="3" value={form.dtc_codes} onChange={(event) => setField('dtc_codes', event.target.value)} placeholder="DTCs are observations, not confirmed failures" />
          </label>
          <fieldset className="dc-sensors dc-span-all">
            <legend>Sensor measurements <em>Optional</em></legend>
            {form.sensor_measurements.map((measurement, index) => <div className="dc-sensor-row" key={`sensor-${index}`}>
              <label className="dc-field"><FieldLabel>Sensor / parameter</FieldLabel>
                <input value={measurement.name} onChange={(event) => setForm((current) => ({
                  ...current,
                  sensor_measurements: current.sensor_measurements.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item),
                }))} />
              </label>
              <label className="dc-field"><FieldLabel>Value</FieldLabel>
                <input type="number" step="any" value={measurement.value} onChange={(event) => setForm((current) => ({
                  ...current,
                  sensor_measurements: current.sensor_measurements.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item),
                }))} />
              </label>
              <label className="dc-field"><FieldLabel>Unit</FieldLabel>
                <input value={measurement.unit} onChange={(event) => setForm((current) => ({
                  ...current,
                  sensor_measurements: current.sensor_measurements.map((item, itemIndex) => itemIndex === index ? { ...item, unit: event.target.value } : item),
                }))} />
              </label>
              {form.sensor_measurements.length > 1 && <button className="dc-link dc-sensor-remove" type="button" aria-label={`Remove sensor measurement ${index + 1}`} onClick={() => setForm((current) => ({
                ...current,
                sensor_measurements: current.sensor_measurements.filter((_, itemIndex) => itemIndex !== index),
              }))}>Remove</button>}
            </div>)}
            <button className="dc-btn dc-btn-outline" type="button" onClick={() => setForm((current) => ({
              ...current,
              sensor_measurements: [...current.sensor_measurements, { name: '', value: '', unit: '' }],
            }))}>Add sensor measurement</button>
          </fieldset>
        </FormSection>

        <FormSection title="Diagnosis" hint="Keep what is suspected separate from what a mechanic confirmed.">
          <label className="dc-field dc-span-all"><FieldLabel>Suspected cause</FieldLabel>
            <textarea rows="3" value={form.suspected_cause} onChange={(event) => setField('suspected_cause', event.target.value)} />
          </label>
          {form.record_type === 'mechanic_confirmed_fault' && <label className="dc-field dc-span-all"><FieldLabel required>Mechanic-confirmed cause</FieldLabel>
            <textarea required rows="3" value={form.confirmed_cause} onChange={(event) => setField('confirmed_cause', event.target.value)} />
          </label>}
          <label className="dc-field dc-span-all"><FieldLabel>Diagnostic tests performed and results</FieldLabel>
            <textarea rows="3" value={form.diagnostic_tests} onChange={(event) => setField('diagnostic_tests', event.target.value)} />
          </label>
        </FormSection>

        <FormSection title="Repair" hint="What was done, and whether it worked.">
          <label className="dc-field dc-span-all"><FieldLabel>Repair action</FieldLabel>
            <textarea rows="3" value={form.repair_action} onChange={(event) => setField('repair_action', event.target.value)} />
          </label>
          <label className="dc-field dc-span-all"><FieldLabel>Replaced components (one per line)</FieldLabel>
            <textarea rows="2" value={form.replaced_components} onChange={(event) => setField('replaced_components', event.target.value)} />
          </label>
          <label className="dc-field dc-span-all"><FieldLabel>Repair outcome / verification</FieldLabel>
            <textarea rows="3" value={form.repair_outcome} onChange={(event) => setField('repair_outcome', event.target.value)} />
          </label>
        </FormSection>

        <FormSection title="Source" hint="Where this record came from, so it can be checked later.">
          <label className="dc-field"><FieldLabel>Technician reference</FieldLabel>
            <input maxLength="160" value={form.technician_reference} onChange={(event) => setField('technician_reference', event.target.value)} />
          </label>
          <label className="dc-field"><FieldLabel required>Record source</FieldLabel>
            <input required maxLength="160" value={form.source} onChange={(event) => setField('source', event.target.value)} />
          </label>
          <label className="dc-field"><FieldLabel>Evidence reference (file path or URL)</FieldLabel>
            <input maxLength="5000" value={form.evidence_reference} onChange={(event) => setField('evidence_reference', event.target.value)} />
          </label>
        </FormSection>

        <div className="dc-form-foot">
          <p>Sensor fields and confirmed causes are optional unless the record type is a mechanic-confirmed fault.</p>
          <button className="dc-btn dc-btn-primary" type="submit" disabled={saving || vehicles.length === 0}>
            {saving ? 'Saving…' : 'Save draft record'}
          </button>
        </div>
      </form>
    </section>

    <section className="dc-card dc-register" id="dc-panel-register" role="tabpanel" aria-labelledby="dc-tab-register" hidden={view !== 'register'}>
      <div className="dc-chips" role="group" aria-label="Filter by verification status">
        <button type="button" className={!filters.verification_status ? 'selected' : undefined} aria-pressed={!filters.verification_status} onClick={() => setFilter('verification_status', '')}>All</button>
        {STATUSES.map((status) => <button key={status} type="button" className={filters.verification_status === status ? 'selected' : undefined} aria-pressed={filters.verification_status === status} onClick={() => setFilter('verification_status', status)}>{statusLabel(status)}</button>)}
      </div>
      <div className="dc-filters">
        <label className="dc-field dc-filter-search"><FieldLabel>Search</FieldLabel><input type="search" value={filters.search} onChange={(event) => setFilter('search', event.target.value)} placeholder="Symptoms, DTC, vehicle…" /></label>
        <label className="dc-field"><FieldLabel>Vehicle</FieldLabel>
          <select value={filters.vehicle_id} onChange={(event) => setFilter('vehicle_id', event.target.value)}>
            <option value="">All vehicles</option>
            {vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.make} {vehicle.model} — {vehicle.plate_number || vehicle.id}</option>)}
          </select>
        </label>
        <label className="dc-field"><FieldLabel>Record type</FieldLabel>
          <select value={filters.record_type} onChange={(event) => setFilter('record_type', event.target.value)}>
            <option value="">All types</option>
            {RECORD_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="dc-field"><FieldLabel>Component</FieldLabel><input value={filters.component} onChange={(event) => setFilter('component', event.target.value)} /></label>
        <label className="dc-field"><FieldLabel>From</FieldLabel><input type="date" value={filters.date_from} onChange={(event) => setFilter('date_from', event.target.value)} /></label>
        <label className="dc-field"><FieldLabel>To</FieldLabel><input type="date" value={filters.date_to} onChange={(event) => setFilter('date_to', event.target.value)} /></label>
      </div>

      <div className="dc-results">
        <p aria-live="polite">{plural(meta.total, 'record')}</p>
        {hasFilters && <button type="button" className="dc-link" onClick={clearFilters}>Clear filters</button>}
      </div>

      {loading ? <div className="dc-skeleton" role="status" aria-label="Loading maintenance records">
        {SKELETON_ROWS.map((key) => <span key={key} className="dc-shimmer" aria-hidden="true" />)}
      </div>
        : records.length === 0 ? <div className="dc-state">
          <h3>{hasFilters ? 'No records match these filters' : 'No records yet'}</h3>
          <p>{hasFilters ? 'Try a different search or clear the filters.' : 'Save your first inspection, scan, or repair as a draft.'}</p>
          {hasFilters
            ? <button type="button" className="dc-btn dc-btn-outline" onClick={clearFilters}>Clear filters</button>
            : <button type="button" className="dc-btn dc-btn-primary" onClick={() => setView('new')}>New record</button>}
        </div>
          : <table className="dc-table">
            <thead><tr><th scope="col">Vehicle</th><th scope="col">Type</th><th scope="col">Component</th><th scope="col">Recorded</th><th scope="col">Odometer</th><th scope="col">Verification</th><th scope="col"><span className="dc-sr">Details</span></th></tr></thead>
            <tbody>{records.map((item) => <tr key={item.id}>
              <td className="dc-primary"><b>{item.make} {item.model}</b><small>{item.plate_number || `Vehicle ${item.vehicle_id}`}</small></td>
              <td data-label="Type">{recordTypeName(item.record_type)}</td>
              <td data-label="Component">{item.component || <span className="dc-none">Not recorded</span>}</td>
              <td data-label="Recorded" className="dc-nowrap">{formatUtc(item.recorded_at)}</td>
              <td data-label="Odometer" className="dc-nowrap">{item.odometer_reading === null ? <span className="dc-none">Not recorded</span> : formatOdometer(item.odometer_reading, item.odometer_unit)}</td>
              <td data-label="Verification"><StatusPill status={item.verification_status} /></td>
              <td className="dc-row-action"><button className="dc-btn dc-btn-outline" type="button" aria-label={`View record ${item.id}, ${item.make} ${item.model}`} onClick={() => setSelectedId(String(item.id))}>View record</button></td>
            </tr>)}</tbody>
          </table>}
      {meta.total_pages > 1 && <nav className="dc-pagination" aria-label="Record pages">
        <span>Page {meta.page} of {meta.total_pages}</span>
        <div>
          <button className="dc-btn dc-btn-outline" type="button" disabled={filters.page <= 1} onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))}>Previous</button>
          <button className="dc-btn dc-btn-outline" type="button" disabled={filters.page >= meta.total_pages} onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}>Next</button>
        </div>
      </nav>}
    </section>

    {selectedId && <RecordDrawer selectedId={selectedId} busy={saving} onClose={() => setSelectedId('')}>
      {messages}
      {!record && detailErrorId === String(selectedId)
        ? <div className="dc-state" role="alert">
          <h3>Record detail could not be loaded</h3>
          <button className="dc-btn dc-btn-primary" type="button" onClick={() => setDetailRetry((value) => value + 1)}>Retry</button>
        </div>
        : !record ? <div className="dc-skeleton" role="status" aria-label="Loading record detail">
          {SKELETON_ROWS.map((key) => <span key={key} className="dc-shimmer" aria-hidden="true" />)}
        </div> : <>
          <div className="dc-summary">
            <StatusPill status={record.verification_status} />
            <h3>{record.vehicle_make} {record.vehicle_model} {record.vehicle_year}</h3>
            <p>{recordTypeName(record.record_type)} · {formatUtc(record.recorded_at)}</p>
          </div>
          <StatusTrack status={record.verification_status} />

          {record.verification_status === 'draft' && <div className="dc-action-box">
            <p>Submit this draft when its details and evidence are ready for verification.</p>
            <button className="dc-btn dc-btn-primary" type="button" disabled={saving} onClick={() => runRecordAction(() => submitMaintenanceDataRecord(record.id), 'Record submitted for verification.')}>Submit for verification</button>
          </div>}
          {record.verification_status === 'awaiting_verification' && <div className="dc-action-box">
            <p>Verified records are added to verified-only exports.</p>
            <button className="dc-btn dc-btn-primary" type="button" disabled={saving} onClick={() => runRecordAction(() => verifyMaintenanceDataRecord(record.id, 'verified'), 'Record verified and added to verified-only exports.')}>Verify record</button>
            <div className="dc-action-divider" />
            <label className="dc-field"><FieldLabel>Rejection reason</FieldLabel>
              <input value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} required />
            </label>
            <button className="dc-btn dc-btn-outline dc-btn-danger" type="button" disabled={saving || !rejectReason.trim()} onClick={() => runRecordAction(() => verifyMaintenanceDataRecord(record.id, 'rejected', rejectReason), 'Record rejected with an audit reason.')}>Reject record</button>
          </div>}
          {record.verification_status === 'verified' && <div className="dc-action-box">
            <p>Replace this record with another verified one. The original observation and audit history remain preserved.</p>
            <div className="dc-action-fields">
              <label className="dc-field"><FieldLabel>Verified replacement record ID</FieldLabel>
                <input type="number" min="1" value={replacementId} onChange={(event) => setReplacementId(event.target.value)} />
              </label>
              <label className="dc-field"><FieldLabel>Supersession reason</FieldLabel>
                <input value={supersedeReason} onChange={(event) => setSupersedeReason(event.target.value)} />
              </label>
            </div>
            <button className="dc-btn dc-btn-outline" type="button" disabled={saving || !replacementId || !supersedeReason.trim()} onClick={() => runRecordAction(() => supersedeMaintenanceDataRecord(record.id, replacementId, supersedeReason), 'Record superseded. The original observation and audit history remain preserved.')}>Supersede with verified record</button>
          </div>}

          <DetailGroup title="Vehicle and record">
            <Fact label="Vehicle">{record.vehicle_make} {record.vehicle_model} {record.vehicle_year} ({record.vehicle_type}) · ID {record.vehicle_id}</Fact>
            <Fact label="Odometer">{record.odometer_reading === null ? null : formatOdometer(record.odometer_reading, record.odometer_unit)}</Fact>
            <Fact label="Component">{record.component}</Fact>
            <Fact label="Component identifier">{record.component_identifier}</Fact>
            <Fact label="Engine details">{record.engine_details}</Fact>
          </DetailGroup>
          <DetailGroup title="Observations">
            <Fact label="Symptoms">{record.symptoms}</Fact>
            <Fact label="Inspection findings">{record.inspection_findings}</Fact>
            <Fact label="Diagnostic trouble codes" missing="Not recorded (not interpreted as no fault)">
              {record.dtc_codes.length > 0 && <span className="dc-codes">{record.dtc_codes.map((code) => <code key={code}>{code}</code>)}</span>}
            </Fact>
            <Fact label="Sensor measurements">
              {record.sensor_measurements.length > 0 && <ul className="dc-sensor-list">{record.sensor_measurements.map((sensor, index) => <li key={`${sensor.name}-${index}`}><span>{sensor.name}</span><b>{sensor.value} {sensor.unit}</b></li>)}</ul>}
            </Fact>
          </DetailGroup>
          <DetailGroup title="Diagnosis">
            <Fact label="Suspected cause">{record.suspected_cause}</Fact>
            <Fact label="Confirmed cause">{record.confirmed_cause}</Fact>
            <Fact label="Diagnostic tests">{record.diagnostic_tests}</Fact>
          </DetailGroup>
          <DetailGroup title="Repair">
            <Fact label="Repair action">{record.repair_action}</Fact>
            <Fact label="Replaced components" missing="No components recorded">{record.replaced_components.join(', ')}</Fact>
            <Fact label="Repair outcome">{record.repair_outcome}</Fact>
          </DetailGroup>
          <DetailGroup title="Source and verification">
            <Fact label="Technician">{record.technician_reference}</Fact>
            <Fact label="Source">{record.source}</Fact>
            <Fact label="Evidence reference">{record.evidence_reference}</Fact>
            <Fact label="Verified by" missing="Not verified">{record.verified_by_username}</Fact>
            <Fact label="Verified at" missing="Not verified">{record.verified_at && formatUtc(record.verified_at)}</Fact>
          </DetailGroup>

          <section className="dc-detail-group">
            <h3>Verification and edit history</h3>
            {detail.history.length === 0 ? <p className="dc-none">No audit events are available.</p> : <ol className="dc-history">
              {detail.history.map((event) => <li key={event.id}>
                <b>{humanize(event.event_type)}</b>
                <small>{event.actor_username || 'Former user'} · {formatUtc(event.created_at)}</small>
                {event.reason && <p>{event.reason}</p>}
                <small>{statusLabel(event.from_status || 'new')} → {event.to_status ? statusLabel(event.to_status) : '—'}</small>
              </li>)}
            </ol>}
          </section>
        </>}
    </RecordDrawer>}
  </div>
}
