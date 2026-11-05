import { useEffect, useMemo, useState } from 'react'
import { api, imageUrl } from '../../../Services/API/api.js'
import { createReservation } from '../../../Services/API/reservationAPI.js'
import './CreateReservation.css'

const DAY_MS = 86400000
const STANDARD_MAX_DAYS = 7
const SPECIAL_MIN_DAYS = 8
const SPECIAL_MAX_DAYS = 21

function money(value) {
  const amount = Number(value || 0)
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: amount % 1 ? 2 : 0 }).format(amount)
}

function localDate(value) {
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

function addDays(day, count) {
  return new Date(Date.parse(day) + count * DAY_MS).toISOString().slice(0, 10)
}

function formatDay(day) {
  if (!day) return '—'
  return new Date(`${day}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

/** Dates passed in the link, from the vehicle finder. Anything invalid is ignored. */
function requestedDates() {
  const params = new URLSearchParams(window.location.search)
  const start = params.get('start_date') || ''
  const end = params.get('end_date') || ''
  const pattern = /^\d{4}-\d{2}-\d{2}$/
  const valid = pattern.test(start) && pattern.test(end) && start >= localDate(new Date()) && end > start
  return valid ? { start, end, days: Math.round((Date.parse(end) - Date.parse(start)) / DAY_MS) } : { start: '', end: '', days: 0 }
}

function plural(count) {
  return `${count} day${count === 1 ? '' : 's'}`
}

function CheckIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>
}

function CarIcon() {
  return <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 11 1.6-4.5A2.2 2.2 0 0 1 8.7 5h6.6a2.2 2.2 0 0 1 2.1 1.5L19 11" /><path d="M3 11h18v7H3zM6 18v2m12-2v2" /><circle cx="7" cy="15" r="1" /><circle cx="17" cy="15" r="1" /></svg>
}

function SectionHead({ step, done, title, children }) {
  return (
    <div className="rsv-section-head">
      <span className={`rsv-step${done ? ' is-done' : ''}`}>{done ? <CheckIcon /> : step}</span>
      <div><h2>{title}</h2>{children && <p>{children}</p>}</div>
    </div>
  )
}

function LoadingView() {
  return (
    <div className="public-page content-width rsv" aria-busy="true">
      <div className="rsv-header"><span className="rsv-skeleton rsv-skeleton-tall" style={{ width: '45%', marginTop: 42 }} /></div>
      <div className="rsv-grid" aria-hidden="true">
        <div className="rsv-panel rsv-section">
          <span className="rsv-skeleton" style={{ width: '30%' }} />
          <span className="rsv-skeleton rsv-skeleton-tall" />
          <span className="rsv-skeleton" style={{ width: '60%' }} />
        </div>
        <div className="rsv-panel rsv-section">
          <span className="rsv-skeleton rsv-skeleton-tall" />
          <span className="rsv-skeleton" style={{ width: '70%' }} />
          <span className="rsv-skeleton" style={{ width: '50%' }} />
        </div>
      </div>
    </div>
  )
}

export default function CreateReservation({ navigate, carId, setToast }) {
  const [car, setCar] = useState(null)
  const [loading, setLoading] = useState(Boolean(carId))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [requested] = useState(requestedDates)
  const [startDate, setStartDate] = useState(requested.start)
  const [endDate, setEndDate] = useState(requested.end)
  const [specialRequest, setSpecialRequest] = useState(requested.days > STANDARD_MAX_DAYS)
  const [acceptContract, setAcceptContract] = useState(false)
  const [availability, setAvailability] = useState(null)
  const [checkingAvailability, setCheckingAvailability] = useState(Boolean(requested.start))
  const [photoFailed, setPhotoFailed] = useState(false)
  const [variantId, setVariantId] = useState(() => Number(new URLSearchParams(window.location.search).get('variant_id')) || null)
  const [unitsLeft, setUnitsLeft] = useState(null)
  const today = useMemo(() => localDate(new Date()), [])
  const rentalDays = startDate && endDate
    ? Math.round((Date.parse(endDate) - Date.parse(startDate)) / DAY_MS)
    : 0
  const standardMinimum = Math.max(3, Number(car?.minimum_rental_duration || 1))
  const minimumDays = specialRequest ? Math.max(SPECIAL_MIN_DAYS, standardMinimum) : standardMinimum
  const maximumDays = specialRequest ? SPECIAL_MAX_DAYS : STANDARD_MAX_DAYS
  const amount = rentalDays > 0 ? rentalDays * Number(car?.daily_rental_price || 0) : 0
  const variants = car?.variants || []
  const selectedVariant = variants.find((option) => Number(option.id) === variantId && Number(option.stock) > 0)
    || variants.find((option) => Number(option.stock) > 0)
    || null
  const selectedVariantId = selectedVariant ? selectedVariant.id : null
  const colorPhoto = selectedVariant && car?.images?.find((image) => image.variant_id === selectedVariant.id)
  const vehicleImage = imageUrl(colorPhoto?.image_path || car?.primary_image || car?.images?.[0]?.image_path)
  const lengthOptions = (specialRequest ? [8, 14, 21] : [3, 5, 7]).filter((days) => days >= minimumDays && days <= maximumDays)

  let dateIssue = ''
  if (startDate && endDate) {
    if (rentalDays < 1) dateIssue = 'Your return date must be after your pickup date.'
    else if (rentalDays > STANDARD_MAX_DAYS && !specialRequest) dateIssue = `Rentals longer than ${STANDARD_MAX_DAYS} days need a special rental period request.`
    else if (rentalDays > maximumDays) dateIssue = `Rentals can’t be longer than ${maximumDays} days.`
    else if (specialRequest && rentalDays < minimumDays) dateIssue = `Special rental periods start at ${minimumDays} days. Choose a later return date or turn off the request.`
    else if (rentalDays < minimumDays) dateIssue = `This vehicle has a ${plural(minimumDays)} minimum rental.`
  }
  const datesReady = Boolean(startDate && endDate && !dateIssue && availability === true && !checkingAvailability)

  let blockedReason = ''
  if (car?.status !== 'available') blockedReason = 'This vehicle is not currently available.'
  else if (variants.length > 0 && !selectedVariant) blockedReason = 'All colours of this vehicle are out of stock.'
  else if (!startDate || !endDate) blockedReason = 'Choose your pickup and return dates to continue.'
  else if (dateIssue) blockedReason = 'Adjust your dates to continue.'
  else if (checkingAvailability) blockedReason = 'Checking these dates…'
  else if (availability === false) blockedReason = 'Choose different dates to continue.'
  else if (availability !== true) blockedReason = 'We couldn’t confirm availability for these dates.'
  else if (!acceptContract) blockedReason = 'Accept the rental agreement to continue.'

  useEffect(() => {
    let active = true
    if (!carId || !startDate || !endDate || rentalDays < 1) return undefined

    const query = new URLSearchParams({ start_date: startDate, end_date: endDate })
    if (selectedVariantId) query.set('variant_id', selectedVariantId)
    api.get(`/api/cars/${carId}/availability?${query}`)
      .then((response) => {
        if (active) {
          setAvailability(Boolean(response?.data?.available))
          setUnitsLeft(response?.data?.units_left ?? null)
        }
      })
      .catch((requestError) => {
        if (active) {
          setAvailability(null)
          setError(requestError.message)
        }
      })
      .finally(() => {
        if (active) setCheckingAvailability(false)
      })
    return () => { active = false }
  }, [carId, endDate, rentalDays, selectedVariantId, startDate])

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

  function changeVariant(variant) {
    setError('')
    setVariantId(Number(variant.id))
    setPhotoFailed(false)
    if (variant.id !== selectedVariantId && startDate && endDate && rentalDays > 0) {
      setAvailability(null)
      setCheckingAvailability(true)
    }
  }

  function changeStart(nextStart) {
    setError('')
    setStartDate(nextStart)
    setAvailability(null)
    if (endDate && nextStart && endDate <= nextStart) {
      setEndDate('')
      setCheckingAvailability(false)
    } else {
      setCheckingAvailability(Boolean(endDate && nextStart))
    }
  }

  function changeEnd(nextEnd) {
    setError('')
    setEndDate(nextEnd)
    setAvailability(null)
    setCheckingAvailability(Boolean(startDate && nextEnd > startDate))
  }

  function changeSpecial(requested) {
    setError('')
    setSpecialRequest(requested)
    if (!requested && rentalDays > STANDARD_MAX_DAYS) {
      setEndDate('')
      setAvailability(null)
      setCheckingAvailability(false)
    }
  }

  async function submit(event) {
    event.preventDefault()
    setError('')
    if (blockedReason) {
      setError(dateIssue || blockedReason)
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
        ...(selectedVariantId ? { variant_id: selectedVariantId } : {}),
      })
      setToast?.(response?.message || 'Reservation request submitted.')
      navigate('/users/reservations')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <LoadingView />

  if (!carId) {
    return <div className="public-page content-width"><div className="empty-state"><h3>Select a vehicle first</h3><p>Choose a vehicle before starting a reservation.</p><button className="button button-primary" onClick={() => navigate('/users/vehicles')}>Browse vehicles</button></div></div>
  }

  if (!car) {
    return <div className="public-page content-width"><div className="empty-state"><h3>Unable to load vehicle</h3><p>{error || 'This vehicle could not be found.'}</p><button className="button button-primary" onClick={() => navigate('/users/vehicles')}>Back to vehicles</button></div></div>
  }

  const backToVehicle = () => navigate(`/users/vehicles/${car.id}`)

  return (
    <div className="public-page content-width rsv">
      <button className="rsv-back" type="button" onClick={backToVehicle}><span aria-hidden="true">←</span> Back to vehicle</button>
      <header className="rsv-header">
        <h1>Reserve {car.make} {car.model}</h1>
        <p>Pick your dates and we’ll check availability right away.</p>
      </header>

      <div className="rsv-grid">
        <form className="rsv-panel" id="reservation-form" onSubmit={submit} noValidate>
          <section className="rsv-section">
            <SectionHead step="1" done={datesReady} title="Rental dates">
              Standard rentals are {standardMinimum} to {STANDARD_MAX_DAYS} days.
            </SectionHead>

            {variants.length > 0 && (
              <div className="rsv-colors" role="group" aria-label="Choose a colour">
                <span>Colour</span>
                <div>
                  {variants.map((variant) => (
                    <button
                      className="rsv-length"
                      type="button"
                      key={variant.id}
                      disabled={Number(variant.stock) === 0}
                      aria-pressed={variant.id === selectedVariantId}
                      onClick={() => changeVariant(variant)}
                    >
                      {variant.color}{Number(variant.stock) === 0 ? ' (out of stock)' : ''}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="rsv-dates">
              <label className="rsv-field">
                <span>Pickup date</span>
                <input type="date" min={today} required value={startDate} onChange={(event) => changeStart(event.target.value)} />
              </label>
              <label className="rsv-field">
                <span>Return date</span>
                <input
                  type="date"
                  min={startDate ? addDays(startDate, minimumDays) : today}
                  max={startDate ? addDays(startDate, maximumDays) : undefined}
                  required
                  value={endDate}
                  onChange={(event) => changeEnd(event.target.value)}
                />
              </label>
            </div>

            {lengthOptions.length > 0 && (
              <div className="rsv-lengths" role="group" aria-label="Set rental length">
                <span>{startDate ? 'Or rent for' : 'Choose a pickup date, then rent for'}</span>
                {lengthOptions.map((days) => (
                  <button
                    className="rsv-length"
                    type="button"
                    key={days}
                    disabled={!startDate}
                    aria-pressed={rentalDays === days}
                    onClick={() => changeEnd(addDays(startDate, days))}
                  >
                    {days} days
                  </button>
                ))}
              </div>
            )}

            {dateIssue ? (
              <div className="rsv-status is-warn" role="status"><i />{dateIssue}</div>
            ) : startDate && endDate && (
              <div className={`rsv-status${checkingAvailability ? ' is-checking' : availability === true ? ' is-good' : availability === false ? ' is-bad' : ''}`} role="status">
                <i />
                {checkingAvailability
                  ? 'Checking these dates…'
                  : availability === true
                    ? `Available for ${plural(rentalDays)}.${selectedVariant && unitsLeft !== null ? ` ${unitsLeft} ${selectedVariant.color} left for these dates.` : ''}`
                    : availability === false
                      ? 'Not available for these dates. Try different dates.'
                      : 'We couldn’t check these dates.'}
              </div>
            )}

            <label className="rsv-check rsv-check-special">
              <input type="checkbox" checked={specialRequest} onChange={(event) => changeSpecial(event.target.checked)} />
              <span>
                <b>Request a special rental period</b>
                <small>For {SPECIAL_MIN_DAYS} to {SPECIAL_MAX_DAYS} days. An administrator must approve this request.</small>
              </span>
            </label>
          </section>

          <section className="rsv-section">
            <SectionHead step="2" done={acceptContract} title="Rental agreement" />
            <p className="rsv-terms">This reservation records the vehicle, dates, rental total, and any security deposit. It requires administrator approval. GCash payment is due after approval and must be verified before handover. Extensions require approval and an updated agreement.</p>
            <label className="rsv-check rsv-accept">
              <input type="checkbox" checked={acceptContract} onChange={(event) => setAcceptContract(event.target.checked)} />
              <span>I accept the rental dates, listed charges, and agreement terms.</span>
            </label>
          </section>

          <section className="rsv-next">
            <h3>What happens next</h3>
            <ol>
              <li>An administrator reviews your request.</li>
              <li>You pay with GCash once it’s approved.</li>
              <li>We verify your payment before handover.</li>
            </ol>
          </section>
        </form>

        <aside className="rsv-panel rsv-summary" aria-label="Booking summary">
          <div className="rsv-summary-body">
            <div className="rsv-vehicle">
              <div className="rsv-photo">
                {vehicleImage && !photoFailed
                  ? <img src={vehicleImage} alt={`${selectedVariant ? `${selectedVariant.color} ` : ''}${car.make} ${car.model}`} onError={() => setPhotoFailed(true)} />
                  : <CarIcon />}
              </div>
              <div className="rsv-vehicle-name">
                <h2>{car.make} {car.model}</h2>
                <small>{[selectedVariant?.color, car.category, car.year].filter(Boolean).join(' · ')}</small>
                <div className="rsv-rate">{money(car.daily_rental_price)}<small> / day</small></div>
              </div>
            </div>

            <div className="rsv-trip">
              <div><small>Pickup</small><b>{formatDay(startDate)}</b></div>
              <div><small>Return</small><b>{formatDay(endDate)}</b></div>
            </div>

            <dl className="rsv-lines">
              {rentalDays > 0 && (
                <div>
                  <dt>{money(car.daily_rental_price)} × {plural(rentalDays)}</dt>
                  <dd>{money(amount)}</dd>
                </div>
              )}
              <div className="rsv-total">
                <dt>Estimated rental amount</dt>
                <dd>{rentalDays > 0 ? money(amount) : '—'}</dd>
              </div>
            </dl>
            <p className="rsv-note">
              We confirm the final amount when you submit.
              {Number(car.security_deposit) > 0 && ` A security deposit of ${money(car.security_deposit)} may apply separately.`}
            </p>

            {error && <div className="rsv-error" role="alert">{error}</div>}

            <div className="rsv-actions">
              <button className="rsv-submit" type="submit" form="reservation-form" disabled={submitting || Boolean(blockedReason)}>
                {submitting ? 'Submitting…' : 'Request reservation'}
              </button>
              {blockedReason && <p className="rsv-hint">{blockedReason}</p>}
              <button className="rsv-cancel" type="button" onClick={backToVehicle}>Cancel</button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
