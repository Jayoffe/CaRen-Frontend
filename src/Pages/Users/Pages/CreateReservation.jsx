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
  const [specialRequest, setSpecialRequest] = useState(false)
  const [acceptContract, setAcceptContract] = useState(false)
  const [availability, setAvailability] = useState(null)
  const [checkingAvailability, setCheckingAvailability] = useState(false)
  const today = useMemo(() => localDate(new Date()), [])
  const rentalDays = startDate && endDate
    ? Math.round((Date.parse(endDate) - Date.parse(startDate)) / 86400000)
    : 0
  const minimumDays = Math.max(3, Number(car?.minimum_rental_duration || 1))
  const maximumDays = specialRequest ? 21 : 7
  const amount = rentalDays > 0 ? rentalDays * Number(car?.daily_rental_price || 0) : 0
  const vehicleImage = imageUrl(car?.primary_image || car?.images?.[0]?.image_path)

  useEffect(() => {
    let active = true
    if (!carId || !startDate || !endDate || rentalDays < 1) return undefined

    const query = new URLSearchParams({ start_date: startDate, end_date: endDate })
    api.get(`/api/cars/${carId}/availability?${query}`)
      .then((response) => {
        if (active) setAvailability(Boolean(response?.data?.available))
      })
      .catch((requestError) => {
        if (active) {
          setAvailability(false)
          setError(requestError.message)
        }
      })
      .finally(() => {
        if (active) setCheckingAvailability(false)
      })
    return () => { active = false }
  }, [carId, endDate, rentalDays, startDate])

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
    if (!startDate || !endDate || rentalDays < minimumDays) {
      setError(`Choose a rental period of at least ${minimumDays} days.`)
      return
    }
    if (rentalDays > maximumDays) {
      setError(`This rental option is limited to ${maximumDays} days.`)
      return
    }
    if (rentalDays > 7 && !specialRequest) {
      setError('Rentals longer than 7 days require an administrator-approved special request.')
      return
    }
    if (checkingAvailability || availability !== true) {
      setError('Confirm that the vehicle is available for your selected dates before continuing.')
      return
    }
    if (!acceptContract) {
      setError('Accept the rental agreement before submitting your reservation.')
      return
    }
    setSubmitting(true)
    try {
      const response = await createReservation({
        car_id: Number(carId),
        start_date: startDate,
        end_date: endDate,
        special_request: specialRequest,
        accept_contract: acceptContract,
      })
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
              <div><h2>Rental period</h2><p>Standard rentals are 3 to 7 days. Special requests can be up to 21 days.</p></div>
            </div>
            <div className="form-grid">
              <label className="form-field">
                <span>Pickup date <i>*</i></span>
                <input type="date" min={today} required value={startDate} onChange={(event) => {
                  setError('')
                  const nextStartDate = event.target.value
                  setStartDate(nextStartDate)
                  if (endDate && endDate <= nextStartDate) {
                    setEndDate('')
                    setAvailability(null)
                    setCheckingAvailability(false)
                  } else if (endDate) {
                    setAvailability(null)
                    setCheckingAvailability(true)
                  }
                }} />
              </label>
              <label className="form-field">
                <span>Return date <i>*</i></span>
                <input
                  type="date"
                  min={startDate ? new Date(Date.parse(startDate) + minimumDays * 86400000).toISOString().slice(0, 10) : today}
                  max={startDate ? new Date(Date.parse(startDate) + maximumDays * 86400000).toISOString().slice(0, 10) : undefined}
                  required
                  value={endDate}
                  onChange={(event) => {
                    setError('')
                    const nextEndDate = event.target.value
                    setEndDate(nextEndDate)
                    setAvailability(null)
                    setCheckingAvailability(Boolean(startDate && nextEndDate > startDate))
                  }}
                />
              </label>
            </div>
            <label className="rental-special-request">
              <input
                type="checkbox"
                checked={specialRequest}
                onChange={(event) => {
                  const requested = event.target.checked
                  setSpecialRequest(requested)
                  if (!requested && rentalDays > 7) {
                    setEndDate('')
                    setAvailability(null)
                    setCheckingAvailability(false)
                  }
                }}
              />
              <span><b>Request a special rental period</b><small>For 8 to 21 days. An administrator must approve this request.</small></span>
            </label>
            {startDate && endDate && rentalDays >= minimumDays && (
              <div className={`rental-availability ${availability === true ? 'is-available' : availability === false ? 'is-unavailable' : ''}`} role="status">
                {checkingAvailability ? 'Checking these dates…' : availability === true ? 'Available for the selected dates.' : availability === false ? 'Not available for the selected dates.' : 'Availability will be checked when you choose both dates.'}
              </div>
            )}
            <div className="rental-agreement-acceptance">
              <h3>Rental agreement</h3>
              <p>This reservation records the vehicle, dates, rental total, and any security deposit. It requires administrator approval. GCash payment is due after approval and must be verified before handover. Extensions require approval and an updated agreement.</p>
              <label>
                <input type="checkbox" checked={acceptContract} onChange={(event) => setAcceptContract(event.target.checked)} />
                <span>I accept the rental dates, listed charges, and agreement terms.</span>
              </label>
            </div>
            <div className="editor-footer">
              <button type="button" className="button button-outline" onClick={() => navigate(`/users/vehicles/${car.id}`)}>Cancel</button>
              <button className="button button-primary" disabled={submitting || checkingAvailability || availability !== true || !acceptContract || car.status !== 'available'}>
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
              <p><span>Maximum rental</span><b>{maximumDays} days</b></p>
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
