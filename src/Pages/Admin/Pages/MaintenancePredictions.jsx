import { useEffect, useState } from 'react'
import { api } from '../../../Services/API/api.js'

const emptySummary = { total_vehicles: 0, approaching: 0, overdue: 0, insufficient: 0 }

export default function MaintenancePredictions() {
  const [data, setData] = useState({ summary: emptySummary, vehicles: [], predictions: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [generating, setGenerating] = useState(false)

  const loadData = async () => {
    try {
      const response = await api.get('/api/maintenance/predictions')
      setData(response?.data || { summary: emptySummary, vehicles: [], predictions: [] })
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
        const response = await api.get('/api/maintenance/predictions')
        if (!active) return
        setData(response?.data || { summary: emptySummary, vehicles: [], predictions: [] })
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

  const generatePredictions = async () => {
    setGenerating(true)
    setError('')
    try {
      const response = await api.post('/api/maintenance/predictions/generate', {})
      setData((current) => ({
        ...current,
        predictions: response?.data || [],
      }))
      await loadData()
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setGenerating(false)
    }
  }

  const { summary, predictions } = data

  return <div className="admin-content maintenance-page">
    <header className="maintenance-page-heading">
      <div>
        <span className="eyebrow">FLEET INTELLIGENCE</span>
        <h1>Predictive Maintenance</h1>
        <p>Rule-based maintenance estimates using the latest fleet service history, due dates, and current mileage.</p>
      </div>
      <button className="button button-primary" onClick={generatePredictions} disabled={generating}>{generating ? 'Refreshing…' : 'Refresh predictions'}</button>
    </header>

    {error && <div className="error-message" role="alert">{error}</div>}
    {loading ? <div className="loading-state">Loading predictive maintenance…</div> : <>
      <section className="maintenance-panel">
        <div className="maintenance-panel-heading">
          <div><span className="eyebrow">PREDICTION SUMMARY</span><h2>Fleet maintenance forecast</h2></div>
          <span className="maintenance-count">{summary.total_vehicles || 0} vehicles</span>
        </div>
        <div className="maintenance-stat-grid">
          <article className="maintenance-stat"><span>Total monitored</span><strong>{summary.total_vehicles || 0}</strong></article>
          <article className="maintenance-stat"><span>Approaching</span><strong>{summary.approaching || 0}</strong></article>
          <article className="maintenance-stat"><span>Overdue</span><strong>{summary.overdue || 0}</strong></article>
          <article className="maintenance-stat"><span>Insufficient data</span><strong>{summary.insufficient || 0}</strong></article>
        </div>
      </section>

      <section className="maintenance-panel">
        <div className="maintenance-panel-heading">
          <div><span className="eyebrow">PREDICTION RESULTS</span><h2>Maintenance estimate list</h2></div>
        </div>
        {predictions.length ? <div className="maintenance-table-wrap"><table className="maintenance-table"><thead><tr><th>Vehicle</th><th>Plate</th><th>Current mileage</th><th>Risk</th><th>Predicted maintenance</th><th>Recommended action</th><th>Next estimate</th></tr></thead><tbody>
          {predictions.map((prediction) => (
            <tr key={`${prediction.vehicleID}-${prediction.predictedFor}`}>
              <td><strong>{prediction.make} {prediction.model}</strong></td>
              <td>{prediction.plate_number || '—'}</td>
              <td>{prediction.current_mileage !== null && prediction.current_mileage !== undefined ? `${Number(prediction.current_mileage).toLocaleString('en-US')} km` : '—'}</td>
              <td><span className={`status-pill status-${String(prediction.riskLevel || 'low').toLowerCase()}`}>{prediction.riskLevel || 'low'}</span></td>
              <td>{prediction.predictedMaintenanceType || 'general inspection'}</td>
              <td>{prediction.recommendedAction || 'Review service schedule.'}</td>
              <td>{prediction.nextMaintenanceDate || prediction.predictedFor || 'TBD'}</td>
            </tr>
          ))}
        </tbody></table></div> : <div className="maintenance-empty" role="status">No predictions are available yet. Add service records, update mileage, and regenerate the fleet forecast.</div>}
      </section>
    </>}
  </div>
}
