import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getVehicleComponents } from '../../../../Services/API/componentMaintenanceAPI.js'
import ComponentInspector from './ComponentInspector.jsx'
import { rigFor } from './rigs.js'
import { formatKm, markerTone, TONE_LABELS } from './status.js'

// three.js and the scene are only downloaded once a vehicle is opened.
const InspectionStage = lazy(() => import('./InspectionStage.jsx'))

function StageMessage({ children, onBack, onRetry }) {
  return (
    <div className="pm-stage pm-stage-message">
      <div>
        {children}
        <div className="pm-message-actions">
          {onRetry && <button type="button" className="is-primary" onClick={onRetry}>Retry</button>}
          <button type="button" onClick={onBack}>Back to fleet</button>
        </div>
      </div>
    </div>
  )
}

/**
 * One vehicle's inspection view. Mounted with key={vehicleId}, so switching
 * vehicles discards all component state; responses are also checked against
 * the latest request so a slow reply can never overwrite newer data.
 */
export default function VehicleInspection({ vehicleId, onBack }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [selectedKey, setSelectedKey] = useState(null)
  const latestRequest = useRef(0)
  const controllerRef = useRef(null)

  const load = useCallback(async () => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    const requestId = ++latestRequest.current
    setError('')
    try {
      const result = await getVehicleComponents(vehicleId, { signal: controller.signal })
      if (requestId === latestRequest.current) setData(result)
    } catch (requestError) {
      if (!controller.signal.aborted && requestId === latestRequest.current) setError(requestError.message)
    }
  }, [vehicleId])

  useEffect(() => {
    void Promise.resolve().then(load)
    return () => controllerRef.current?.abort()
  }, [load])

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await load()
    } finally {
      setRefreshing(false)
    }
  }, [load])

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape' && !event.target.closest?.('input, textarea, select')) setSelectedKey(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const bodyType = data?.vehicle.body_type
  const rig = useMemo(() => (bodyType === undefined ? null : rigFor(bodyType)), [bodyType])
  const vehicle = data?.vehicle
  const components = data?.components || []
  const selected = components.find((component) => component.key === selectedKey) || null
  const select = useCallback((key) => setSelectedKey((current) => (key === current ? current : key)), [])

  const inspector = selected && (
    <ComponentInspector
      key={selected.key}
      vehicle={vehicle}
      component={selected}
      components={rig ? components.filter((component) => rig.components[component.key]) : components}
      refreshing={refreshing}
      onSwitch={setSelectedKey}
      onClose={() => setSelectedKey(null)}
      onSaved={refresh}
    />
  )

  return (
    <section className={`pm-inspection${selected ? ' is-inspecting' : ''}`} aria-label="Vehicle inspection">
      <header className="pm-topbar">
        <button type="button" className="pm-back" onClick={onBack}><span aria-hidden="true">←</span> Fleet</button>
        {vehicle && (
          <div className="pm-vehicle-label">
            <strong>{vehicle.make} {vehicle.model} <span>{vehicle.year}</span></strong>
            <small>{[vehicle.plate_number || `Vehicle #${vehicle.id}`, vehicle.category, formatKm(vehicle.current_mileage) || 'Odometer not recorded'].join(' · ')}</small>
          </div>
        )}
      </header>

      {error && !data ? (
        <StageMessage onBack={onBack} onRetry={load}>
          <h2>Could not load this vehicle</h2>
          <p>{error}</p>
        </StageMessage>
      ) : !data ? (
        <div className="pm-stage pm-stage-message" role="status"><div><span className="pm-spinner" />Loading vehicle records…</div></div>
      ) : rig ? (
        <>
          {error && <p className="pm-toast" role="alert">{error} <button type="button" onClick={load}>Retry</button></p>}
          <Suspense fallback={<div className="pm-stage pm-stage-message" role="status"><div><span className="pm-spinner" />Loading 3D model…</div></div>}>
            <InspectionStage rig={rig} vehicle={vehicle} components={components} selectedKey={selectedKey} onSelect={select}>
              {inspector}
            </InspectionStage>
          </Suspense>
        </>
      ) : (
        <div className="pm-stage pm-fallback">
          <div className="pm-fallback-intro">
            <h2>No 3D model for “{vehicle.category}”</h2>
            <p>3D models exist for sedans, SUVs, pickups, vans, minivans and motorcycles. This vehicle’s components can still be inspected from the list.</p>
            <button type="button" onClick={onBack}>Back to fleet</button>
          </div>
          <ul className="pm-fallback-list">
            {components.map((component) => {
              const tone = markerTone(component)
              return (
                <li key={component.key}>
                  <button type="button" className={component.key === selectedKey ? 'is-active' : ''} onClick={() => setSelectedKey(component.key)}>
                    <i className={`tone-${tone}`} aria-hidden="true" />{component.name}<small>{TONE_LABELS[tone]}</small>
                  </button>
                </li>
              )
            })}
          </ul>
          {inspector && <div className="pm-callout pm-callout-static">{inspector}</div>}
        </div>
      )}
    </section>
  )
}
