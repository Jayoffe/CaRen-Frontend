import { useCallback, useEffect, useState } from 'react'
import { getAssessmentFleet } from '../../../Services/API/assessmentAPI.js'
import AssessmentOverview from '../Components/maintenance3d/AssessmentOverview.jsx'
import AssessmentWorkspace from '../Components/maintenance3d/AssessmentWorkspace.jsx'
import FleetServiceNeeds from '../Components/maintenance3d/FleetServiceNeeds.jsx'
import './MaintenancePredictions.css'
import './AssessmentWorkspace.css'

function vehicleFromUrl() {
  const value = Number(new URLSearchParams(window.location.search).get('vehicle'))
  return Number.isInteger(value) && value > 0 ? value : null
}

/**
 * /admin/maintenance/predictions: the fleet overview, then one vehicle's
 * assessment workspace. The selected vehicle lives in
 * ?vehicle= so refresh and the browser back button behave as expected.
 */
export default function MaintenancePredictions({ navigate }) {
  const [fleet, setFleet] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [vehicleId, setVehicleId] = useState(vehicleFromUrl)

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

  // Reloads on return from a vehicle, so the overview shows what was just submitted.
  useEffect(() => {
    if (!vehicleId) void Promise.resolve().then(loadFleet)
  }, [loadFleet, vehicleId])

  useEffect(() => {
    const onPopState = () => setVehicleId(vehicleFromUrl())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  function openVehicle(id) {
    window.history.pushState({ pmVehicle: id }, '', `${window.location.pathname}?vehicle=${id}`)
    setVehicleId(id)
  }

  function backToFleet() {
    if (window.history.state?.pmVehicle) window.history.back()
    else {
      window.history.replaceState({}, '', window.location.pathname)
      setVehicleId(null)
    }
  }

  return (
    <div className="admin-content pm-page">
      {vehicleId ? (
        <AssessmentWorkspace key={vehicleId} vehicleId={vehicleId} onBack={backToFleet} />
      ) : loading && !fleet ? (
        <div className="pm-page-state" role="status"><span className="pm-spinner" />Loading fleet…</div>
      ) : error ? (
        <div className="pm-page-state" role="alert">
          <h2>Could not load the fleet</h2>
          <p>{error}</p>
          <button type="button" className="is-primary" onClick={loadFleet}>Retry</button>
        </div>
      ) : fleet?.vehicles.length ? (
        <>
          <AssessmentOverview fleet={fleet} onSelect={openVehicle} />
          <FleetServiceNeeds onSelect={openVehicle} />
        </>
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
