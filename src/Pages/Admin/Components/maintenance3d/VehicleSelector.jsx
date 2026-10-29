import { useMemo, useState } from 'react'
import { imageUrl } from '../../../../Services/API/api.js'

function VehicleImage({ vehicle }) {
  const [failed, setFailed] = useState(false)
  const path = vehicle.primary_image || vehicle.images?.[0]?.image_path
  if (!path || failed) {
    return (
      <div className="pm-card-placeholder">
        <svg viewBox="0 0 64 32" width="72" height="36" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 22v-5l6-2 8-7h22l10 7 8 2v5h-5M17 22h26M4 22h5" />
          <circle cx="13" cy="23" r="4" /><circle cx="47" cy="23" r="4" />
        </svg>
        <span>No photo</span>
      </div>
    )
  }
  return <img src={imageUrl(path)} alt="" loading="lazy" onError={() => setFailed(true)} />
}

/** Fleet list shown before a vehicle is chosen. Uses the inventory records as-is. */
export default function VehicleSelector({ vehicles, onSelect }) {
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase()
    if (!text) return vehicles
    return vehicles.filter((vehicle) => [vehicle.make, vehicle.model, vehicle.year, vehicle.category, vehicle.plate_number]
      .some((value) => String(value ?? '').toLowerCase().includes(text)))
  }, [vehicles, query])

  return (
    <section className="pm-selector" aria-labelledby="pm-selector-title">
      <header className="pm-selector-header">
        <div>
          <span className="pm-kicker">Predictive maintenance</span>
          <h1 id="pm-selector-title">Select a vehicle to inspect</h1>
        </div>
        {vehicles.length > 6 && (
          <label className="pm-search">
            <span className="sr-only">Search vehicles</span>
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search make, model, plate" />
          </label>
        )}
      </header>
      {filtered.length ? (
        <ul className="pm-vehicle-grid">
          {filtered.map((vehicle) => (
            <li key={vehicle.id}>
              <button type="button" className="pm-vehicle-card" onClick={() => onSelect(vehicle.id)}>
                <div className="pm-card-media"><VehicleImage vehicle={vehicle} /></div>
                <div className="pm-card-body">
                  <strong>{vehicle.make} {vehicle.model}</strong>
                  <span>{[vehicle.year, vehicle.category].filter(Boolean).join(' · ')}</span>
                  <span className="pm-plate">{vehicle.plate_number || `Vehicle #${vehicle.id}`}</span>
                </div>
                <span className="pm-card-cta">Inspect<span aria-hidden="true"> →</span></span>
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="pm-muted">No vehicles match “{query}”.</p>}
    </section>
  )
}
