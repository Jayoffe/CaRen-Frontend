import { useCallback, useEffect, useState } from 'react'
import { getAssessmentFleet } from '../../../Services/API/assessmentAPI.js'
import AssessmentOverview from '../Components/maintenance3d/AssessmentOverview.jsx'
import AssessmentWorkspace from '../Components/maintenance3d/AssessmentWorkspace.jsx'
import './MaintenancePredictions.css'
import './AssessmentWorkspace.css'

function locationState() {
  const params = new URLSearchParams(window.location.search)
  const value = Number(params.get('vehicle'))
  return {
    vehicleId: Number.isInteger(value) && value > 0 ? value : null,
    view: params.get('view') === 'assess' || params.get('view') === 'results' ? params.get('view') : null,
  }
}

/**
 * /admin/maintenance/predictions. Select a vehicle, assess it, then view results.
 * The vehicle and step live in ?vehicle=&view= so refresh and the back button work.
 */
export default function MaintenancePredictions({ navigate }) {
  const [fleet, setFleet] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [{ vehicleId, view }, setLocation] = useState(locationState)

  const loadFleet = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setFleet(await getAssessmentFleet())
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }, [])

  // Reloads on return from a vehicle, so the panels show what was just submitted.
  useEffect(() => {
    void Promise.resolve().then(loadFleet)
  }, [loadFleet, vehicleId])

  useEffect(() => {
    const onPopState = () => setLocation(locationState())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const go = useCallback((id, nextView) => {
    const query = id ? `?vehicle=${id}${nextView ? `&view=${nextView}` : ''}` : ''
    window.history.pushState({}, '', `${window.location.pathname}${query}`)
    setLocation({ vehicleId: id, view: nextView || null })
  }, [])

  return (
    <div className="admin-content pm-page">
      {vehicleId ? (
        <AssessmentWorkspace
          key={vehicleId}
          vehicleId={vehicleId}
          view={view}
          listing={fleet?.vehicles.find((vehicle) => vehicle.id === vehicleId)}
          onView={(nextView) => go(vehicleId, nextView)}
          onBack={() => go(null)}
        />
      ) : loading && !fleet ? (
        <div className="pm-page-state" role="status"><span className="pm-spinner" />Loading fleet…</div>
      ) : error ? (
        <div className="pm-page-state" role="alert">
          <h2>Could not load the fleet</h2>
          <p>{error}</p>
          <button type="button" className="is-primary" onClick={loadFleet}>Retry</button>
        </div>
      ) : fleet?.vehicles.length ? (
        <AssessmentOverview fleet={fleet} onOpen={go} onManageModels={() => navigate('/admin/maintenance/model-management')} />
      ) : (
        <div className="pm-page-state" role="status">
          <h2>No vehicles in the fleet</h2>
          <p>Add a vehicle to the inventory before assessing it.</p>
          <button type="button" className="is-primary" onClick={() => navigate('/admin/vehicles')}>Open vehicle inventory</button>
        </div>
      )}
    </div>
  )
}
