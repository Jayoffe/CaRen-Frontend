import { useEffect, useMemo, useState } from 'react'
import { api, imageUrl } from '../../../Services/API/api.js'
import { createReservation } from '../../../Services/API/reservationAPI.js'

function money(value) {
  const amount = Number(value || 0)
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: amount % 1 ? 2 : 0 }).format(amount)
}

function localDate(value) {
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

export default function CreateReservation({ navigate, carId, setToast }) {
  const [car, setCar] = useState(null)
  const [loading, setLoading] = useState(Boolean(carId))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const today = useMemo(() => localDate(new Date()), [])
  const rentalDays = startDate && endDate
    ? Math.round((Date.parse(endDate) - Date.parse(startDate)) / 86400000)
    : 0
  const minimumDays = Math.max(1, Number(car?.minimum_rental_duration || 1))
  const amount = rentalDays > 0 ? rentalDays * Number(car?.daily_rental_price || 0) : 0
  const vehicleImage = imageUrl(car?.primary_image || car?.images?.[0]?.image_path)

  useEffect(() => {
    let active = true
    if (!carId) return undefined
    api.get(`/api/cars/${carId}`)
      .then((response) => {
        if (active) setCar(response?.data || null)
      })
      .catch((requestError) => {
        if (active) setError(requestError.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [carId])

  async function submit(event) {
    event.preventDefault()
    setError('')
    if (!startDate || !endDate || rentalDays < 1) {
      setError('Choose a return date at least one day after pickup.')
      return
    }
    if (rentalDays < minimumDays) {
      setError(`This vehicle has a minimum rental of ${minimumDays} days.`)
      return
    }
    setSubmitting(true)
    try {
      const response = await createReservation({ car_id: Number(carId), start_date: startDate, end_date: endDate })
      setToast?.(response?.message || 'Reservation request submitted.')
      navigate('/users/reservations')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="public-page content-width"><div className="loading-state"><span className="spinner" />Loading vehicle…</div></div>
  }

  if (!carId) {
    return <div className="public-page content-width"><div className="empty-state"><h3>Select a vehicle first</h3><p>Choose a vehicle before starting a reservation.</p><button className="button button-primary" onClick={() => navigate('/users/vehicles')}>Browse vehicles</button></div></div>
  }

  if (!car) {
    return <div className="public-page content-width"><div className="empty-state"><h3>Unable to load vehicle</h3><p>{error || 'This vehicle could not be found.'}</p><button className="button button-primary" onClick={() => navigate('/users/vehicles')}>Back to vehicles</button></div></div>
  }

  return (
    <div className="public-page content-width">
      <section className="home-section">
        <button className="back-link" type="button" onClick={() => navigate(`/users/vehicles/${car.id}`)}>← Back to vehicle</button>
        <div className="detail-heading">
          <div>
            <div className="detail-breadcrumb">Reservation</div>
            <h1>Reserve {car.make} {car.model}</h1>
            <p>Choose your rental dates. The server confirms availability and calculates the final rental amount.</p>
          </div>
        </div>

        {error && <div className="global-error" role="alert">{error}</div>}
        <div className="editor-grid">
          <form className="form-panel" onSubmit={submit}>
            <div className="form-section-heading">
              <span>01</span>
              <div><h2>Rental period</h2><p>Pickup and return dates are treated as a half-open rental period.</p></div>
            </div>
            <div className="form-grid">
              <label className="form-field">
                <span>Pickup date <i>*</i></span>
                <input type="date" min={today} required value={startDate} onChange={(event) => {
                  setStartDate(event.target.value)
                  if (endDate && endDate <= event.target.value) setEndDate('')
                }} />
              </label>
              <label className="form-field">
                <span>Return date <i>*</i></span>
                <input type="date" min={startDate ? new Date(Date.parse(startDate) + 86400000).toISOString().slice(0, 10) : today} required value={endDate} onChange={(event) => setEndDate(event.target.value)} />
              </label>
            </div>
            <div className="editor-footer">
              <button type="button" className="button button-outline" onClick={() => navigate(`/users/vehicles/${car.id}`)}>Cancel</button>
              <button className="button button-primary" disabled={submitting || car.status !== 'available'}>
                {submitting ? 'Submitting…' : 'Request reservation'}
              </button>
            </div>
          </form>

          <aside className="form-panel">
            <div className="form-section-heading">
              <span>02</span>
              <div><h2>Booking summary</h2><p>Estimate based on the listed daily rate.</p></div>
            </div>
            <div className="booking-vehicle-summary">
              <div className="row-thumb">
                {vehicleImage ? <img src={vehicleImage} alt="" /> : <span aria-hidden="true">Photo unavailable</span>}
              </div>
              <span><b>{car.make} {car.model}</b><small>{car.category} · {car.year}</small></span>
            </div>
            <div className="summary-lines">
              <p><span>Daily rate</span><b>{money(car.daily_rental_price)} / day</b></p>
              <p><span>Rental days</span><b>{rentalDays > 0 ? rentalDays : '—'}</b></p>
              <p><span>Minimum rental</span><b>{minimumDays} day{minimumDays === 1 ? '' : 's'}</b></p>
              <p className="summary-total"><span>Estimated rental amount</span><b>{money(amount)}</b></p>
              {Number(car.security_deposit) > 0 && <small>Security deposit of {money(car.security_deposit)} may apply separately.</small>}
              {car.status !== 'available' && <p className="error-text">This vehicle is not currently available.</p>}
            </div>
          </aside>
        </div>
      </section>
    </div>
  )
}
