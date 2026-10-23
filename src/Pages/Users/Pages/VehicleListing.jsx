import { useEffect, useMemo, useState } from 'react'
import { api, imageUrl } from '../../../Services/API/api.js'

function vehicleImage(car) {
  const path = car.primary_image || car.images?.[0]?.image_path
  return path ? imageUrl(path) : ''
}

function money(value) {
  const n = Number(value || 0)
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: n % 1 ? 2 : 0 }).format(n)
}

export default function VehicleListing({ navigate }) {
  const [cars, setCars] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [transmission, setTransmission] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [sort, setSort] = useState('recommended')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    api.get('/api/cars/available')
      .then((response) => {
        if (active) setCars(response?.data || [])
      })
      .catch((requestError) => {
        if (active) setError(requestError.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [])

  const categories = useMemo(
    () => [...new Set(cars.map((car) => car.category).filter(Boolean))].sort((left, right) => left.localeCompare(right)),
    [cars],
  )
  const transmissions = useMemo(
    () => [...new Set(cars.map((car) => car.transmission).filter(Boolean))].sort((left, right) => left.localeCompare(right)),
    [cars],
  )
  const filteredCars = useMemo(() => {
    const term = search.trim().toLowerCase()
    const results = cars.filter((car) => {
      const searchable = `${car.make || ''} ${car.model || ''} ${car.category || ''} ${car.year || ''}`.toLowerCase()
      return (!term || searchable.includes(term))
        && (!category || car.category === category)
        && (!transmission || car.transmission === transmission)
        && (!maxPrice || Number(car.daily_rental_price || 0) <= Number(maxPrice))
    })
    return results.sort((left, right) => {
      if (sort === 'price-low') return Number(left.daily_rental_price || 0) - Number(right.daily_rental_price || 0)
      if (sort === 'price-high') return Number(right.daily_rental_price || 0) - Number(left.daily_rental_price || 0)
      if (sort === 'newest') return Number(right.year || 0) - Number(left.year || 0)
      if (sort === 'name') return `${left.make || ''} ${left.model || ''}`.localeCompare(`${right.make || ''} ${right.model || ''}`)
      return 0
    })
  }, [cars, category, maxPrice, search, sort, transmission])

  function clearFilters() {
    setSearch('')
    setCategory('')
    setTransmission('')
    setMaxPrice('')
    setSort('recommended')
  }

  return (
    <div className="public-page content-width customer-vehicles-page">
      <section className="customer-vehicles-hero">
        <div>
          <span className="eyebrow">YOUR NEXT DRIVE STARTS HERE</span>
          <h1>Find the right ride<br />for your plans.</h1>
          <p>Compare available vehicles, explore the details, and choose the one that feels right for your journey.</p>
        </div>
        <div className="customer-vehicles-hero-note" aria-hidden="true">
          <span>THE DRIVE YOU WANT</span>
          <b>Starts here.</b>
          <small>Browse the fleet ↓</small>
        </div>
      </section>

      <section className="customer-vehicles-content" aria-label="Browse available vehicles">
        <div className="customer-vehicles-heading">
          <div><span className="eyebrow">THE AVAILABLE FLEET</span><h2>Choose your vehicle</h2></div>
          {!loading && !error && <span className="customer-vehicles-total">{cars.length} available</span>}
        </div>

        <div className="customer-vehicle-filters">
          <label className="customer-vehicle-search">
            <span className="customer-vehicle-search-icon" aria-hidden="true">⌕</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search make, model, year…"
              aria-label="Search available vehicles"
            />
          </label>
          <label className="customer-vehicle-select">
            <span>Transmission</span>
            <select value={transmission} onChange={(event) => setTransmission(event.target.value)}>
              <option value="">Any transmission</option>
              {transmissions.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className="customer-vehicle-price-filter">
            <span>Max daily rate</span>
            <input
              type="number"
              min="0"
              value={maxPrice}
              onChange={(event) => setMaxPrice(event.target.value)}
              placeholder="No limit"
              aria-label="Maximum daily rental rate"
            />
          </label>
          <label className="customer-vehicle-select customer-vehicle-sort">
            <span>Sort by</span>
            <select value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="recommended">Recommended</option>
              <option value="price-low">Price: low to high</option>
              <option value="price-high">Price: high to low</option>
              <option value="newest">Newest year</option>
              <option value="name">Vehicle name</option>
            </select>
          </label>
        </div>

        <div className="customer-vehicle-categories" aria-label="Filter by vehicle category">
          <button type="button" className={!category ? 'selected' : ''} aria-pressed={!category} onClick={() => setCategory('')}>All vehicles <span>{cars.length}</span></button>
          {categories.map((value) => {
            const count = cars.filter((car) => car.category === value).length
            return <button type="button" key={value} className={category === value ? 'selected' : ''} aria-pressed={category === value} onClick={() => setCategory(category === value ? '' : value)}>{value} <span>{count}</span></button>
          })}
        </div>

        {error && <div className="global-error" role="alert">{error}</div>}
        {loading ? (
          <div className="customer-vehicles-loading"><span className="spinner" />Finding available vehicles…</div>
        ) : error ? null : filteredCars.length ? (
          <>
            <div className="customer-vehicles-results-label" aria-live="polite">
              Showing <b>{filteredCars.length}</b> of <b>{cars.length}</b> vehicles
              {(search || category || transmission || maxPrice) && <button type="button" onClick={clearFilters}>Clear filters</button>}
            </div>
            <div className="customer-vehicle-grid">
              {filteredCars.map((car) => (
                <article key={car.id} className="customer-vehicle-card">
                  <button className="customer-vehicle-photo" type="button" onClick={() => navigate(`/users/vehicles/${car.id}`)} aria-label={`View ${car.make} ${car.model} details`}>
                    <span className="customer-vehicle-photo-placeholder" aria-hidden="true">{car.category || 'DriveRent fleet'}</span>
                    {vehicleImage(car) && <img
                      src={vehicleImage(car)}
                      alt={`${car.make} ${car.model}`}
                      loading="lazy"
                      onError={(event) => { event.currentTarget.hidden = true }}
                    />}
                    <span className="customer-vehicle-available"><i />Available</span>
                    {car.category && <span className="customer-vehicle-category-tag">{car.category}</span>}
                  </button>
                  <div className="customer-vehicle-card-content">
                    <div className="customer-vehicle-card-heading">
                      <div><h3>{car.make} {car.model}</h3><p>{car.year || 'Year not listed'}</p></div>
                      <span className="customer-vehicle-card-price"><b>{money(car.daily_rental_price)}</b><small>/ day</small></span>
                    </div>
                    <div className="customer-vehicle-specs">
                      <span><b>{car.transmission || '—'}</b><small>Transmission</small></span>
                      <span><b>{car.fuel_type || '—'}</b><small>Fuel type</small></span>
                      <span><b>{car.seating_capacity || '—'} seats</b><small>Capacity</small></span>
                    </div>
                    <div className="customer-vehicle-card-actions">
                      <button type="button" className="customer-vehicle-details" onClick={() => navigate(`/users/vehicles/${car.id}`)}>View details <span aria-hidden="true">→</span></button>
                      <button type="button" className="customer-vehicle-book" onClick={() => navigate(`/users/reservations/create?car_id=${car.id}`)}>Reserve</button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </>
        ) : (
          <div className="customer-vehicles-empty">
            <span aria-hidden="true">⌕</span>
            <h3>{cars.length ? 'No vehicles match those filters' : 'No vehicles available right now'}</h3>
            <p>{cars.length ? 'Try another search or clear a filter to see more of the fleet.' : 'Please check back soon to see vehicles as they become available.'}</p>
            {cars.length > 0 && <button className="button button-outline" type="button" onClick={clearFilters}>Clear filters</button>}
          </div>
        )}
      </section>
    </div>
  )
}
