import { useEffect, useMemo, useState } from 'react'
import { api, imageUrl } from '../../../Services/API/api.js'

function money(value) {
  const n = Number(value || 0)
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: n % 1 ? 2 : 0 }).format(n)
}

export default function VehicleListing({ navigate }) {
  const [cars, setCars] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    let active = true
    api.get('/api/cars/available')
      .then((response) => {
        if (active) setCars(response?.data || [])
      })
      .catch(() => {
        if (active) setCars([])
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [])

  const filteredCars = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return cars
    return cars.filter((car) => `${car.make || ''} ${car.model || ''}`.toLowerCase().includes(term))
  }, [cars, search])

  return (
    <div className="public-page content-width">
      <section className="home-section">
        <div className="detail-heading">
          <div>
            <div className="detail-breadcrumb">Marketplace</div>
            <h1>Available vehicles</h1>
          </div>
          <input
            className="form-control"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by make or model"
            style={{ maxWidth: 260 }}
          />
        </div>

        {loading ? (
          <div className="loading-state"><span className="spinner" />Loading vehicles…</div>
        ) : filteredCars.length ? (
          <div className="vehicle-list-grid">
            {filteredCars.map((car) => (
              <article key={car.id} className="vehicle-card card-panel">
                <img
                  src={imageUrl(car.primary_image || car.images?.[0]?.image_path || '/assets/hero.png')}
                  alt={`${car.make} ${car.model}`}
                  className="vehicle-card-image"
                  onError={(event) => {
                    event.currentTarget.src = '/assets/hero.png'
                  }}
                />
                <div className="vehicle-card-content">
                  <div className="vehicle-card-heading">
                    <div>
                      <h3>{car.make} {car.model}</h3>
                      <p>{car.year} · {car.category || 'SUV'}</p>
                    </div>
                    <span className="card-category">{car.status || 'available'}</span>
                  </div>
                  <div className="vehicle-specs">
                    <span>{car.transmission || 'Automatic'}</span>
                    <span>{car.fuel_type || 'Gasoline'}</span>
                  </div>
                  <div className="vehicle-card-footer">
                    <div className="daily-price"><b>{money(car.daily_rental_price)}</b><span> / day</span></div>
                    <button className="card-detail-link" onClick={() => navigate(`/users/vehicles/${car.id}`)}>Details</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h3>No vehicles found</h3>
            <p>There are currently no vehicles matching your search.</p>
          </div>
        )}
      </section>
    </div>
  )
}
