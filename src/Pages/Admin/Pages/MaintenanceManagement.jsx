import { useEffect, useState } from 'react'
import { api } from '../../../Services/API/api.js'

const emptySummary = { total_vehicles: 0, approaching: 0, overdue: 0, insufficient: 0 }
const defaultRecordForm = {
  vehicleID: '',
  maintenanceType: 'oil-change',
  description: '',
  maintenanceDate: new Date().toISOString().slice(0, 10),
  cost: '',
  maintenanceStatus: 'completed',
  nextMaintenanceDate: '',
  odometerReading: '',
}

export default function MaintenanceManagement({ navigate }) {
  const [data, setData] = useState({ summary: emptySummary, vehicles: [], records: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [recordForm, setRecordForm] = useState(defaultRecordForm)
  const [mileageForm, setMileageForm] = useState({ vehicleID: '', current_mileage: '' })
  const [saving, setSaving] = useState(false)

  const loadData = async () => {
    try {
      const response = await api.get('/api/maintenance')
      setData(response?.data || { summary: emptySummary, vehicles: [], records: [] })
      setError('')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    const fetchData = async () => {
      try {
        const response = await api.get('/api/maintenance')
        if (!active) return
        setData(response?.data || { summary: emptySummary, vehicles: [], records: [] })
      } catch (requestError) {
        if (!active) return
        setError(requestError.message)
      } finally {
        if (active) setLoading(false)
      }
    }
    fetchData()
    return () => { active = false }
  }, [])

  const submitRecord = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')

    try {
      await api.post('/api/maintenance/records', {
        vehicleID: Number(recordForm.vehicleID),
        maintenanceType: recordForm.maintenanceType,
        description: recordForm.description,
        maintenanceDate: recordForm.maintenanceDate,
        cost: recordForm.cost || 0,
        maintenanceStatus: recordForm.maintenanceStatus,
        nextMaintenanceDate: recordForm.nextMaintenanceDate || null,
        odometerReading: recordForm.odometerReading ? Number(recordForm.odometerReading) : null,
      })
      setRecordForm(defaultRecordForm)
      await loadData()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  const updateMileage = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')

    try {
      await api.patch('/api/maintenance/mileage', {
        vehicleID: Number(mileageForm.vehicleID),
        current_mileage: Number(mileageForm.current_mileage),
      })
      setMileageForm({ vehicleID: '', current_mileage: '' })
      await loadData()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSaving(false)
    }
  }

  const { summary, vehicles, records } = data

  return <div className="admin-content maintenance-page">
    <header className="maintenance-page-heading">
      <div>
        <span className="eyebrow">FLEET OPERATIONS</span>
        <h1>Vehicle Maintenance Records</h1>
        <p>Monitor real service history, upcoming maintenance windows, and current vehicle mileage.</p>
      </div>
      <button className="button button-outline" onClick={() => navigate('/admin/maintenance/predictions')}>View predictions</button>
    </header>

    {error && <div className="error-message" role="alert">{error}</div>}
    {loading ? <div className="loading-state">Loading maintenance records…</div> : <>
      <section className="maintenance-panel">
        <div className="maintenance-panel-heading">
          <div><span className="eyebrow">SERVICE SUMMARY</span><h2>Fleet maintenance status</h2></div>
          <span className="maintenance-count">{summary.total_vehicles || 0} vehicles</span>
        </div>
        <div className="maintenance-stat-grid">
          <article className="maintenance-stat"><span>Total vehicles</span><strong>{summary.total_vehicles || 0}</strong></article>
          <article className="maintenance-stat"><span>Approaching</span><strong>{summary.approaching || 0}</strong></article>
          <article className="maintenance-stat"><span>Overdue</span><strong>{summary.overdue || 0}</strong></article>
          <article className="maintenance-stat"><span>Insufficient data</span><strong>{summary.insufficient || 0}</strong></article>
        </div>
      </section>

      <section className="maintenance-panel">
        <div className="maintenance-panel-heading">
          <div><span className="eyebrow">ADD SERVICE DATA</span><h2>Record maintenance and mileage</h2></div>
        </div>
        <div className="maintenance-form-grid">
          <form onSubmit={submitRecord} className="maintenance-form">
            <label>
              Vehicle
              <select value={recordForm.vehicleID} onChange={(event) => setRecordForm({ ...recordForm, vehicleID: event.target.value })} required>
                <option value="">Select a vehicle</option>
                {vehicles.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>{vehicle.make} {vehicle.model}</option>
                ))}
              </select>
            </label>
            <label>
              Maintenance type
              <select value={recordForm.maintenanceType} onChange={(event) => setRecordForm({ ...recordForm, maintenanceType: event.target.value })}>
                <option value="oil-change">Oil change</option>
                <option value="inspection">Inspection</option>
                <option value="brake-service">Brake service</option>
                <option value="tires">Tires</option>
                <option value="battery">Battery</option>
                <option value="general-inspection">General inspection</option>
              </select>
            </label>
            <label>
              Service date
              <input type="date" value={recordForm.maintenanceDate} onChange={(event) => setRecordForm({ ...recordForm, maintenanceDate: event.target.value })} required />
            </label>
            <label>
              Odometer reading (km)
              <input type="number" min="0" value={recordForm.odometerReading} onChange={(event) => setRecordForm({ ...recordForm, odometerReading: event.target.value })} />
            </label>
            <label>
              Cost (PHP)
              <input type="number" min="0" step="0.01" value={recordForm.cost} onChange={(event) => setRecordForm({ ...recordForm, cost: event.target.value })} />
            </label>
            <label>
              Status
              <select value={recordForm.maintenanceStatus} onChange={(event) => setRecordForm({ ...recordForm, maintenanceStatus: event.target.value })}>
                <option value="completed">Completed</option>
                <option value="scheduled">Scheduled</option>
                <option value="overdue">Overdue</option>
              </select>
            </label>
            <label>
              Notes
              <textarea value={recordForm.description} onChange={(event) => setRecordForm({ ...recordForm, description: event.target.value })} rows="3" placeholder="Service notes or issues found" />
            </label>
            <label>
              Next maintenance date
              <input type="date" value={recordForm.nextMaintenanceDate} onChange={(event) => setRecordForm({ ...recordForm, nextMaintenanceDate: event.target.value })} />
            </label>
            <div className="maintenance-form-actions">
              <button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save maintenance record'}</button>
            </div>
          </form>

          <form onSubmit={updateMileage} className="maintenance-form">
            <label>
              Vehicle
              <select value={mileageForm.vehicleID} onChange={(event) => setMileageForm({ ...mileageForm, vehicleID: event.target.value })} required>
                <option value="">Select a vehicle</option>
                {vehicles.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>{vehicle.make} {vehicle.model}</option>
                ))}
              </select>
            </label>
            <label>
              Current mileage (km)
              <input type="number" min="0" value={mileageForm.current_mileage} onChange={(event) => setMileageForm({ ...mileageForm, current_mileage: event.target.value })} required />
            </label>
            <div className="maintenance-form-actions">
              <button className="button button-outline" type="submit" disabled={saving}>{saving ? 'Updating…' : 'Update mileage'}</button>
            </div>
          </form>
        </div>
      </section>

      <section className="maintenance-panel">
        <div className="maintenance-panel-heading">
          <div><span className="eyebrow">SERVICE HISTORY</span><h2>Vehicle service log</h2></div>
          <span className="maintenance-count">{records.length} records</span>
        </div>
        {records.length ? <div className="maintenance-table-wrap"><table className="maintenance-table"><thead><tr><th>Vehicle</th><th>Type</th><th>Service date</th><th>Odometer</th><th>Next due</th><th>Status</th></tr></thead><tbody>
          {records.map((record) => (
            <tr key={record.maintenanceID}>
              <td><strong>{record.make} {record.model}</strong><small>{record.plate_number || '—'}</small></td>
              <td>{record.maintenanceType}</td>
              <td>{record.maintenanceDate}</td>
              <td>{record.odometerReading ? `${Number(record.odometerReading).toLocaleString('en-US')} km` : '—'}</td>
              <td>{record.nextMaintenanceDate || '—'}</td>
              <td><span className={`status-pill status-${record.maintenanceStatus || 'scheduled'}`}>{record.maintenanceStatus || 'scheduled'}</span></td>
            </tr>
          ))}
        </tbody></table></div> : <div className="maintenance-empty">No maintenance records are available yet. Add the first service entry to start forecasting upcoming maintenance.</div>}
      </section>
    </>}
  </div>
}
