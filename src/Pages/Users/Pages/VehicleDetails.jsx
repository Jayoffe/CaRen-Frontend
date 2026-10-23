import { useEffect, useState } from 'react'
import { api, imageUrl } from '../../../Services/API/api.js'

function money(value) {
  const n = Number(value || 0)
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: n % 1 ? 2 : 0 }).format(n)
}

export default function VehicleDetails({ carId, navigate }) {
  const [car, setCar] = useState(null)
  const [loading, setLoading] = useState(Boolean(carId))
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    if (!carId) return undefined
    api.get(`/api/cars/${carId}`)
      .then((response) => {
        if (active) setCar(response?.data || null)
      })
      .catch((requestError) => {
        if (active) {
          setCar(null)
          setError(requestError.message)
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [carId])

  if (loading) {
    return <div className="public-page content-width"><div className="loading-state"><span className="spinner" />Loading vehicle details…</div></div>
  }

  if (!car) {
    return <div className="public-page content-width"><div className="empty-state" role={error ? 'alert' : 'status'}><h3>{error ? 'Unable to load vehicle' : 'Vehicle not found'}</h3><p>{error || 'This vehicle may no longer be available.'}</p><button className="button button-primary" onClick={() => navigate('/users/vehicles')}>Back to fleet</button></div></div>
  }

  return (
    <div className="public-page content-width detail-page">
      <button className="back-link" onClick={() => navigate('/users/vehicles')}>&larr; Back to vehicles</button>
      <div className="detail-top-grid">
        <div className="gallery">
          <div className="gallery-main">
            <span className="vehicle-photo-placeholder" aria-hidden="true">Photo unavailable</span>
            {(car.primary_image || car.images?.[0]?.image_path) && <img src={imageUrl(car.primary_image || car.images?.[0]?.image_path)} alt={`${car.make} ${car.model}`} onError={(event) => { event.currentTarget.hidden = true }} />}
          </div>
        </div>
        <aside className="detail-summary">
          <div className="detail-price"><b>{money(car.daily_rental_price)}</b><span> / day</span></div>
          <h1>{car.make} {car.model}</h1>
          <p>{car.description || 'Comfortable and ready for the road.'}</p>
          <div className="detail-quick-specs">
            <div><span><b>{car.transmission || 'Automatic'}</b><small>Transmission</small></span></div>
            <div><span><b>{car.fuel_type || 'Gasoline'}</b><small>Fuel</small></span></div>
            <div><span><b>{car.seating_capacity || 5}</b><small>Seats</small></span></div>
          </div>
          <button
            className="button button-primary"
            disabled={car.status !== 'available'}
            onClick={() => navigate(`/users/reservations/create?car_id=${car.id}`)}
          >
            {car.status === 'available' ? 'Reserve this vehicle' : 'Currently unavailable'}
          </button>
        </aside>
      </div>
    </div>
  )
}
