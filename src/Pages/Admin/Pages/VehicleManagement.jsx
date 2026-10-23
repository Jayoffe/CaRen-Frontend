import { useEffect, useState } from 'react'
import { api, imageUrl } from '../../../Services/API/api.js'

function vehicleImage(car) {
  const path = car.primary_image || car.images?.[0]?.image_path
  return path ? imageUrl(path) : ''
}

function money(value) {
  const n = Number(value || 0)
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: n % 1 ? 2 : 0 }).format(n)
}

export default function VehicleManagement({ navigate }) {
  const [cars, setCars] = useState([])
  const [meta, setMeta] = useState({ total: 0, total_pages: 1 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [sort, setSort] = useState('newest')
  const [page, setPage] = useState(1)

  useEffect(() => {
    let active = true
    const query = new URLSearchParams({ page: String(page), per_page: '24', sort })
    if (search) query.set('search', search)
    if (status) query.set('status', status)
    api.get(`/api/cars?${query}`)
      .then((response) => {
        if (!active) return
        setCars(response?.data || [])
        setMeta(response?.meta || { total: 0, total_pages: 1 })
      })
      .catch((requestError) => {
        if (active) {
          setCars([])
          setMeta({ total: 0, total_pages: 1 })
          setError(requestError.message)
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [page, search, sort, status])

  function submitSearch(event) {
    event.preventDefault()
    if (searchInput.trim() !== search || page !== 1) setLoading(true)
    setError('')
    setPage(1)
    setSearch(searchInput.trim())
  }

  return (
    <div className="admin-content content-width">
      <section className="home-section">
        <div className="detail-heading">
          <div>
            <div className="detail-breadcrumb">Fleet management</div>
            <h1>Vehicle inventory</h1>
          </div>
          <button className="button button-primary" onClick={() => navigate('/admin/vehicles/create')}>Add vehicle</button>
        </div>

        <form className="fleet-filters" onSubmit={submitSearch}>
          <label className="form-field">
            <span>Search fleet</span>
            <input type="search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Make, model, or plate number" />
          </label>
          <label className="form-field">
            <span>Availability</span>
            <select value={status} onChange={(event) => { setLoading(true); setError(''); setPage(1); setStatus(event.target.value) }}>
              <option value="">All statuses</option>
              {['available', 'rented', 'maintenance', 'unavailable'].map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className="form-field">
            <span>Sort by</span>
            <select value={sort} onChange={(event) => { setLoading(true); setError(''); setPage(1); setSort(event.target.value) }}>
              <option value="newest">Newest</option>
              <option value="price_asc">Price: low to high</option>
              <option value="price_desc">Price: high to low</option>
              <option value="name">Vehicle name</option>
            </select>
          </label>
          <button className="button button-primary" type="submit">Search</button>
        </form>

        {error && <div className="global-error" role="alert">{error}</div>}
        {loading ? (
          <div className="loading-state"><span className="spinner" />Loading fleet…</div>
        ) : cars.length ? (
          <div className="vehicle-list-grid">
            {cars.map((car) => (
              <article key={car.id} className="vehicle-card card-panel">
                <div className="vehicle-card-image-wrap">
                  <div className="vehicle-card-image-placeholder" aria-label="Vehicle photo unavailable">Photo unavailable</div>
                  {vehicleImage(car) && <img
                    src={vehicleImage(car)}
                    alt={`${car.make} ${car.model}`}
                    className="vehicle-card-image"
                    onError={(event) => {
                      event.currentTarget.hidden = true
                    }}
                  />}
                </div>
                <div className="vehicle-card-content">
                  <div className="vehicle-card-heading">
                    <div>
                      <h3>{car.make} {car.model}</h3>
                      <p>{car.year} · {car.category || 'SUV'}</p>
                    </div>
                    <span className="card-category">{car.status || 'available'}</span>
                  </div>
                  <div className="vehicle-card-footer">
                    <div className="daily-price"><b>{money(car.daily_rental_price)}</b><span> / day</span></div>
                    <button className="card-detail-link" onClick={() => navigate(`/admin/vehicles/${car.id}`)}>Manage</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : !error && <div className="empty-state"><h3>No vehicles found</h3><p>Try another search or adjust the availability filter.</p></div>}
        {!loading && meta.total_pages > 1 && (
          <div className="fleet-pagination">
            <span>Showing page {page} of {meta.total_pages} · {meta.total} vehicles</span>
            <div>
              <button className="button button-outline" disabled={page <= 1} onClick={() => { setLoading(true); setError(''); setPage((current) => current - 1) }}>Previous</button>
              <button className="button button-outline" disabled={page >= meta.total_pages} onClick={() => { setLoading(true); setError(''); setPage((current) => current + 1) }}>Next</button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
