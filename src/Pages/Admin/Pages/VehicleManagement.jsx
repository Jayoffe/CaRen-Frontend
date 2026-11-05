import { useEffect, useState } from 'react'
import { api, imageUrl } from '../../../Services/API/api.js'
import { getFleetCounts } from '../../../Services/API/vehicleAPI.js'
import CarSilhouette from '../../Users/Components/CarSilhouette.jsx'
import './VehicleManagement.css'

const PAGE_SIZE = 24
const SEARCH_DELAY_MS = 250
const SKELETON_ROWS = [1, 2, 3, 4]
const STATUSES = [
  { value: '', label: 'All', countKey: 'total' },
  { value: 'available', label: 'Available', countKey: 'available' },
  { value: 'rented', label: 'Rented', countKey: 'rented' },
  { value: 'maintenance', label: 'Maintenance', countKey: 'maintenance' },
  { value: 'unavailable', label: 'Unavailable', countKey: 'unavailable' },
]
const SORTS = [
  { value: 'newest', label: 'Recently added' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'year_desc', label: 'Model year: newest' },
]

function vehicleImage(car) {
  const path = car.primary_image || car.images?.[0]?.image_path
  return path ? imageUrl(path) : ''
}

function money(value) {
  const n = Number(value || 0)
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: n % 1 ? 2 : 0 }).format(n)
}

function statusLabel(status) {
  return STATUSES.find((item) => item.value === status)?.label || status || 'Available'
}

function SearchIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.800-3.800" /></svg>
}

function InventorySkeleton() {
  return (
    <div className="vm-card vm-skeleton" role="status" aria-label="Loading vehicles">
      {SKELETON_ROWS.map((key) => (
        <div className="vm-skeleton-row" key={key} aria-hidden="true">
          <span className="vm-shimmer vm-line-thumb" />
          <span className="vm-shimmer vm-line-name" />
          <span className="vm-shimmer vm-line-rest" />
        </div>
      ))}
    </div>
  )
}

function VehicleRow({ car, navigate }) {
  const name = `${car.make} ${car.model}`
  const photo = vehicleImage(car)
  const meta = [car.year, car.category].filter(Boolean).join(' · ')
  const specs = [car.transmission, car.fuel_type, car.seating_capacity && `${car.seating_capacity} seats`].filter(Boolean).join(' · ')
  const status = car.status || 'available'
  const openDetails = () => navigate(`/admin/vehicles/${car.id}${window.location.search}`)

  return (
    <tr>
      <td className="vm-vehicle">
        <button type="button" className="vm-vehicle-link" onClick={openDetails}>
          <span className="vm-thumb">
            <span className="vm-thumb-empty"><CarSilhouette category={car.category} /></span>
            {photo && <img src={photo} alt="" loading="lazy" onError={(event) => { event.currentTarget.hidden = true }} />}
          </span>
          <span className="vm-name">
            <b>{name}</b>
            {meta && <small>{meta}</small>}
          </span>
        </button>
      </td>
      <td data-label="Plate">{car.plate_number || <span className="vm-none">Not set</span>}</td>
      <td data-label="Specs" className="vm-specs">{specs || <span className="vm-none">Not set</span>}</td>
      <td data-label="Daily rate" className="vm-rate">{money(car.daily_rental_price)}</td>
      <td data-label="Status"><span className={`vm-status vm-status-${status}`}><i aria-hidden="true" />{statusLabel(status)}</span></td>
      <td className="vm-actions">
        <button type="button" className="vm-link" onClick={() => navigate(`/admin/vehicles/${car.id}/edit${window.location.search}`)} aria-label={`Edit ${name}`}>Edit</button>
        <button type="button" className="vm-btn vm-btn-outline" onClick={openDetails} aria-label={`Manage ${name}`}>Manage</button>
      </td>
    </tr>
  )
}

export default function VehicleManagement({ navigate }) {
  // Filters live in the address, so coming back from a vehicle returns to the same view.
  const [initial] = useState(() => new URLSearchParams(window.location.search))
  const [searchInput, setSearchInput] = useState(initial.get('search') || '')
  const [search, setSearch] = useState(initial.get('search') || '')
  const [status, setStatus] = useState(initial.get('status') || '')
  const [sort, setSort] = useState(initial.get('sort') || 'newest')
  const [page, setPage] = useState(Number(initial.get('page')) || 1)
  const [cars, setCars] = useState([])
  const [meta, setMeta] = useState({ total: 0, last_page: 1 })
  const [counts, setCounts] = useState(null)
  const [loaded, setLoaded] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    const query = new URLSearchParams({ page: String(page), per_page: String(PAGE_SIZE), sort })
    if (search) query.set('search', search)
    if (status) query.set('status', status)
    api.get(`/api/cars?${query}`)
      .then((response) => {
        if (!active) return
        // A saved link can point past the last page once vehicles are removed.
        if (!response?.data?.length && page > 1) {
          setPage(1)
          return
        }
        setCars(response?.data || [])
        setMeta(response?.meta || { total: 0, last_page: 1 })
        setError('')
      })
      .catch((requestError) => {
        if (active) setError(requestError.message)
      })
      .finally(() => {
        if (active) {
          setLoaded(true)
          setRefreshing(false)
        }
      })
    return () => { active = false }
  }, [attempt, page, search, sort, status])

  useEffect(() => {
    let active = true
    getFleetCounts()
      .then((result) => { if (active) setCounts(result) })
      .catch(() => { if (active) setCounts(null) })
    return () => { active = false }
  }, [attempt])

  useEffect(() => {
    const query = new URLSearchParams()
    if (search) query.set('search', search)
    if (status) query.set('status', status)
    if (sort !== 'newest') query.set('sort', sort)
    if (page > 1) query.set('page', String(page))
    const suffix = query.toString()
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${suffix ? `?${suffix}` : ''}`)
  }, [page, search, sort, status])

  function applySearch(value) {
    const next = value.trim()
    if (next === search) return
    setRefreshing(true)
    setPage(1)
    setSearch(next)
  }

  // Search follows typing after a short pause. A search that is already applied changes nothing.
  useEffect(() => {
    const next = searchInput.trim()
    if (next === search) return undefined
    const timer = window.setTimeout(() => {
      setRefreshing(true)
      setPage(1)
      setSearch(next)
    }, SEARCH_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [search, searchInput])

  function changeStatus(value) {
    if (value === status) return
    setRefreshing(true)
    setPage(1)
    setStatus(value)
  }

  function changeSort(value) {
    setRefreshing(true)
    setPage(1)
    setSort(value)
  }

  function changePage(value) {
    setRefreshing(true)
    setPage(value)
  }

  function clearFilters() {
    setSearchInput('')
    setRefreshing(true)
    setSearch('')
    setStatus('')
    setPage(1)
  }

  function retry() {
    setError('')
    setRefreshing(true)
    setAttempt((value) => value + 1)
  }

  const hasFilters = Boolean(search || status)
  const lastPage = Number(meta.last_page) || 1
  const total = Number(meta.total) || 0
  const firstShown = total ? (page - 1) * PAGE_SIZE + 1 : 0
  const lastShown = Math.min(page * PAGE_SIZE, total)
  const summary = total > cars.length
    ? `Showing ${firstShown}–${lastShown} of ${total} vehicles`
    : `${total} ${total === 1 ? 'vehicle' : 'vehicles'}${hasFilters ? ' found' : ''}`

  return (
    <div className="admin-content vm">
      <header className="vm-header">
        <div>
          <span className="vm-eyebrow">Fleet management</span>
          <h1>Vehicle inventory</h1>
        </div>
        <button type="button" className="vm-btn vm-btn-primary" onClick={() => navigate('/admin/vehicles/create')}>Add vehicle</button>
      </header>

      <form
        className="vm-controls"
        role="search"
        onSubmit={(event) => {
          event.preventDefault()
          applySearch(searchInput)
        }}
      >
        <label className="vm-search">
          <span className="vm-sr">Search fleet</span>
          <SearchIcon />
          <input type="search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search make, model, or plate number" />
        </label>
        <label className="vm-sort">
          <span>Sort by</span>
          <select value={sort} onChange={(event) => changeSort(event.target.value)}>
            {SORTS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
      </form>

      <div className="vm-chips" role="group" aria-label="Filter by availability">
        {STATUSES.map((item) => (
          <button key={item.label} type="button" className={status === item.value ? 'selected' : undefined} aria-pressed={status === item.value} onClick={() => changeStatus(item.value)}>
            {item.label}
            {counts && <span>{counts[item.countKey]}</span>}
          </button>
        ))}
      </div>

      {!loaded ? <InventorySkeleton /> : error && !cars.length ? (
        <div className="vm-card vm-state" role="alert">
          <h2>We couldn't load the fleet</h2>
          <p>{error}</p>
          <button type="button" className="vm-btn vm-btn-primary" onClick={retry}>Try again</button>
        </div>
      ) : cars.length ? (
        <>
          <div className="vm-results">
            <p aria-live="polite">{summary}</p>
            {hasFilters && <button type="button" className="vm-link" onClick={clearFilters}>Clear filters</button>}
          </div>
          {error && <p className="vm-inline-error" role="alert">{error}</p>}
          <div className={`vm-card vm-table-wrap${refreshing ? ' is-refreshing' : ''}`} aria-busy={refreshing}>
            <table className="vm-table">
              <thead>
                <tr>
                  <th scope="col">Vehicle</th>
                  <th scope="col">Plate</th>
                  <th scope="col">Specs</th>
                  <th scope="col">Daily rate</th>
                  <th scope="col">Status</th>
                  <th scope="col"><span className="vm-sr">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {cars.map((car) => <VehicleRow key={car.id} car={car} navigate={navigate} />)}
              </tbody>
            </table>
          </div>
          {lastPage > 1 && (
            <nav className="vm-pagination" aria-label="Vehicle pages">
              <span>Page {page} of {lastPage}</span>
              <div>
                <button type="button" className="vm-btn vm-btn-outline" disabled={page <= 1 || refreshing} onClick={() => changePage(page - 1)}>Previous</button>
                <button type="button" className="vm-btn vm-btn-outline" disabled={page >= lastPage || refreshing} onClick={() => changePage(page + 1)}>Next</button>
              </div>
            </nav>
          )}
        </>
      ) : hasFilters ? (
        <div className="vm-card vm-state">
          <h2>No vehicles match those filters</h2>
          <p>Try another search or a different availability.</p>
          <button type="button" className="vm-btn vm-btn-outline" onClick={clearFilters}>Clear filters</button>
        </div>
      ) : (
        <div className="vm-card vm-state">
          <h2>No vehicles yet</h2>
          <p>Add your first vehicle to start taking reservations.</p>
          <button type="button" className="vm-btn vm-btn-primary" onClick={() => navigate('/admin/vehicles/create')}>Add vehicle</button>
        </div>
      )}
    </div>
  )
}
