import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { api, imageUrl } from '../../../Services/API/api.js'
import { getReservations } from '../../../Services/API/reservationAPI.js'
import { invalidImage, parseFeatures } from '../../../Services/vehicleData.js'
import CarSilhouette from '../../Users/Components/CarSilhouette.jsx'
import './VehicleDetailAdmin.css'

const BOOKINGS_SHOWN = 4
const STATUS_LABELS = { available: 'Available', rented: 'Rented', maintenance: 'Maintenance', unavailable: 'Unavailable' }

function money(value) {
  const n = Number(value || 0)
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: n % 1 ? 2 : 0 }).format(n)
}

function hasValue(value) {
  return value !== null && value !== undefined && value !== ''
}

function formatDay(value, withYear = true) {
  const day = String(value || '').slice(0, 10)
  if (!day) return ''
  const date = new Date(`${day}T00:00:00`)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}) }).format(date)
}

function localToday() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

function plural(count, word) {
  return `${count} ${word}${Number(count) === 1 ? '' : 's'}`
}

/** Every photo once, with the listing's main photo first. */
function photosOf(car) {
  const photos = [...(car?.images || [])]
  if (car?.primary_image && !photos.some((photo) => photo.image_path === car.primary_image)) {
    photos.unshift({ id: null, image_path: car.primary_image })
  } else if (car?.primary_image) {
    photos.sort((left, right) => Number(right.image_path === car.primary_image) - Number(left.image_path === car.primary_image))
  }
  return photos
}

function Icon({ name, size = 16 }) {
  const paths = {
    back: 'M19 12H5m6-6-6 6 6 6',
    edit: 'M12 20h9M16.500 3.500a2.100 2.100 0 0 1 3 3L7 19l-4 1 1-4Z',
    trash: 'M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m5 5v5m4-5v5',
    close: 'M6 6l12 12M18 6 6 18',
    check: 'm5 12.500 4.500 4.500L19 7.500',
    plus: 'M12 5v14M5 12h14',
    alert: 'M12 8v5m0 4h.01M10.300 3.900 2.500 18a2 2 0 0 0 1.700 3h15.600a2 2 0 0 0 1.700-3L13.700 3.900a2 2 0 0 0-3.400 0Z',
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>
}

function Fact({ label, children }) {
  const empty = children === null || children === undefined || children === ''
  return (
    <div className="vda-fact">
      <dt>{label}</dt>
      <dd className={empty ? 'vda-none' : undefined}>{empty ? 'Not set' : children}</dd>
    </div>
  )
}

function DeleteDialog({ car, onConfirm, onClose }) {
  const ref = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useLayoutEffect(() => {
    const dialog = ref.current
    if (!dialog.open) dialog.showModal()
    dialog.querySelector('[data-autofocus]')?.focus()
    return () => dialog.close()
  }, [])

  async function confirm() {
    setBusy(true)
    setError('')
    try {
      await onConfirm()
    } catch (requestError) {
      setError(requestError.message)
      setBusy(false)
    }
  }

  return (
    <dialog
      ref={ref}
      className="vda-dialog"
      aria-labelledby="vda-delete-title"
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onClose()
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <h2 id="vda-delete-title">Delete this vehicle?</h2>
      <p>This permanently deletes the {car.make} {car.model} and its photos. You can't undo this.</p>
      {error && <p className="vda-error" role="alert">{error}</p>}
      <div className="vda-dialog-actions">
        <button type="button" className="vda-btn vda-btn-outline" data-autofocus disabled={busy} onClick={onClose}>Keep vehicle</button>
        <button type="button" className="vda-btn vda-btn-danger" disabled={busy} onClick={confirm}>{busy ? 'Deleting…' : 'Delete vehicle'}</button>
      </div>
    </dialog>
  )
}

function PageSkeleton() {
  return (
    <div className="vda-layout" role="status" aria-label="Loading vehicle details">
      <div className="vda-card vda-gallery" aria-hidden="true"><span className="vda-shimmer vda-line-photo" /></div>
      <div className="vda-card vda-panel" aria-hidden="true"><span className="vda-shimmer vda-line-short" /><span className="vda-shimmer vda-line-block" /></div>
    </div>
  )
}

export default function VehicleDetailAdmin({ carId, navigate, onChanged, setToast }) {
  const [car, setCar] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [missing, setMissing] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [bookings, setBookings] = useState(null)
  const [bookingsError, setBookingsError] = useState(false)
  const [selectedPath, setSelectedPath] = useState('')
  const [failedPaths, setFailedPaths] = useState([])
  const [uploading, setUploading] = useState(false)
  const [photoError, setPhotoError] = useState('')
  const [removingPhoto, setRemovingPhoto] = useState(null)
  const [removeBusy, setRemoveBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const listPath = `/admin/vehicles${window.location.search}`

  useEffect(() => {
    let active = true
    api.get(`/api/cars/${carId}`)
      .then((response) => {
        if (!active) return
        if (response?.data) {
          setCar(response.data)
          setLoadError('')
          setMissing(false)
        } else {
          setMissing(true)
        }
      })
      .catch((error) => {
        if (!active) return
        // A missing vehicle and a failed request need different next steps.
        if (/not found/i.test(error.message)) setMissing(true)
        else setLoadError(error.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [attempt, carId])

  useEffect(() => {
    let active = true
    getReservations()
      .then((all) => {
        if (active) setBookings(all.filter((item) => Number(item.car_id) === Number(carId)))
      })
      .catch(() => {
        if (active) setBookingsError(true)
      })
    return () => { active = false }
  }, [carId])

  const reload = useCallback(() => setAttempt((value) => value + 1), [])

  async function upload(event) {
    const input = event.target
    const files = Array.from(input.files || [])
    if (!files.length) return
    setPhotoError('')
    const invalid = invalidImage(files)
    if (invalid) {
      setPhotoError(invalid)
      input.value = ''
      return
    }
    const form = new FormData()
    files.forEach((file) => form.append('images[]', file))
    setUploading(true)
    try {
      await api.post(`/api/cars/${carId}/images`, form)
      setToast?.(files.length === 1 ? 'Photo added.' : `${files.length} photos added.`)
      onChanged?.()
      reload()
    } catch (error) {
      setPhotoError(error.message)
    } finally {
      setUploading(false)
      input.value = ''
    }
  }

  async function removePhoto() {
    setRemoveBusy(true)
    setPhotoError('')
    try {
      await api.delete(`/api/cars/${carId}/images/${removingPhoto.id}`)
      setToast?.('Photo removed.')
      if (selectedPath === removingPhoto.image_path) setSelectedPath('')
      setRemovingPhoto(null)
      onChanged?.()
      reload()
    } catch (error) {
      setPhotoError(error.message)
    } finally {
      setRemoveBusy(false)
    }
  }

  async function deleteVehicle() {
    const response = await api.delete(`/api/cars/${carId}`)
    if (response?.success !== true) throw new Error('The server did not confirm the deletion. Refresh the list to check.')
    onChanged?.()
    setToast?.('Vehicle deleted.')
    navigate(listPath)
  }

  function retry() {
    setLoadError('')
    setLoading(true)
    reload()
  }

  const header = (
    <button type="button" className="vda-back" onClick={() => navigate(listPath)}><Icon name="back" />Back to vehicles</button>
  )

  if (loading) return <div className="admin-content vda">{header}<PageSkeleton /></div>
  if (loadError && !car) {
    return (
      <div className="admin-content vda">
        {header}
        <div className="vda-card vda-state" role="alert">
          <h2>We couldn't load this vehicle</h2>
          <p>{loadError}</p>
          <button type="button" className="vda-btn vda-btn-primary" onClick={retry}>Try again</button>
        </div>
      </div>
    )
  }
  if (missing || !car) {
    return (
      <div className="admin-content vda">
        {header}
        <div className="vda-card vda-state">
          <h2>Vehicle not found</h2>
          <p>It may have been deleted.</p>
          <button type="button" className="vda-btn vda-btn-primary" onClick={() => navigate(listPath)}>Back to vehicles</button>
        </div>
      </div>
    )
  }

  const name = `${car.make} ${car.model}`
  const photos = photosOf(car)
  const current = photos.find((photo) => photo.image_path === selectedPath) || photos[0] || null
  const currentFailed = current && failedPaths.includes(current.image_path)
  const missingCount = photos.filter((photo) => failedPaths.includes(photo.image_path)).length
  const features = [
    ...(Number(car.air_conditioning) === 1 ? ['Air conditioning'] : []),
    ...(Number(car.gps_navigation) === 1 ? ['GPS navigation'] : []),
    ...parseFeatures(car.additional_features),
  ]
  const variants = car.variants || []
  const status = car.status || 'available'
  const minimum = Number(car.minimum_rental_duration || 1)
  const today = localToday()
  const activeBookings = (bookings || [])
    .filter((item) => ['pending', 'confirmed'].includes(item.status) && !item.returned_at && String(item.end_date).slice(0, 10) >= today)
    .sort((left, right) => String(left.start_date).localeCompare(String(right.start_date)))

  return (
    <div className="admin-content vda">
      {header}
      <header className="vda-header">
        <div>
          <span className="vda-eyebrow">{[car.year, car.category, car.plate_number && `Plate ${car.plate_number}`].filter(Boolean).join(' · ')}</span>
          <div className="vda-title">
            <h1>{name}</h1>
            <span className={`vda-status vda-status-${status}`}><i aria-hidden="true" />{STATUS_LABELS[status] || status}</span>
          </div>
        </div>
        <div className="vda-header-actions">
          <button type="button" className="vda-btn vda-btn-ghost-danger" onClick={() => setConfirmDelete(true)}><Icon name="trash" />Delete</button>
          <button type="button" className="vda-btn vda-btn-outline" onClick={() => navigate(`/admin/maintenance/predictions?vehicle=${car.id}`)}>Inspect in 3D</button>
          <button type="button" className="vda-btn vda-btn-primary" onClick={() => navigate(`/admin/vehicles/${car.id}/edit${window.location.search}`)}><Icon name="edit" />Edit vehicle</button>
        </div>
      </header>

      {loadError && <p className="vda-banner" role="alert">{loadError}</p>}

      <div className="vda-layout">
        <div className="vda-main">
          <section className="vda-card vda-gallery" aria-label="Vehicle photos">
            <div className="vda-photo">
              {current && !currentFailed ? (
                <img
                  key={current.image_path}
                  src={imageUrl(current.image_path)}
                  alt={name}
                  onError={() => setFailedPaths((paths) => [...new Set([...paths, current.image_path])])}
                />
              ) : (
                <div className="vda-photo-empty">
                  <CarSilhouette category={car.category} />
                  <p>{current ? "This photo's file can't be found" : 'No photos yet'}</p>
                  {current && <small>Remove it and upload it again.</small>}
                </div>
              )}
            </div>

            <div className="vda-thumbs">
              {photos.map((photo, index) => {
                const failed = failedPaths.includes(photo.image_path)
                const isCurrent = current?.image_path === photo.image_path
                return (
                  <div className={`vda-thumb${isCurrent ? ' is-current' : ''}${failed ? ' is-failed' : ''}`} key={photo.image_path}>
                    <button type="button" className="vda-thumb-show" aria-label={`Show photo ${index + 1} of ${photos.length}${failed ? ', file missing' : ''}`} aria-current={isCurrent ? 'true' : undefined} onClick={() => setSelectedPath(photo.image_path)}>
                      {failed
                        ? <Icon name="alert" size={18} />
                        : <img src={imageUrl(photo.image_path)} alt="" loading="lazy" onError={() => setFailedPaths((paths) => [...new Set([...paths, photo.image_path])])} />}
                    </button>
                    {photo.id !== null && <button type="button" className="vda-thumb-remove" aria-label={`Remove photo ${index + 1}`} title="Remove photo" onClick={() => { setPhotoError(''); setRemovingPhoto(photo) }}><Icon name="close" size={12} /></button>}
                  </div>
                )
              })}
              <label className={`vda-add${uploading ? ' is-busy' : ''}`}>
                <Icon name="plus" size={18} />
                <span>{uploading ? 'Uploading…' : 'Add photos'}</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={uploading} onChange={upload} />
              </label>
            </div>

            {removingPhoto && (
              <div className="vda-confirm" role="group" aria-label="Confirm removing this photo">
                <p>Remove this photo? You can't undo this.</p>
                <div>
                  <button type="button" className="vda-link" disabled={removeBusy} onClick={() => setRemovingPhoto(null)}>Keep photo</button>
                  <button type="button" className="vda-btn vda-btn-danger" disabled={removeBusy} onClick={removePhoto}>{removeBusy ? 'Removing…' : 'Remove photo'}</button>
                </div>
              </div>
            )}
            {photoError && <p className="vda-error" role="alert">{photoError}</p>}
            {missingCount > 0 && !photoError && <p className="vda-warning">{missingCount === 1 ? "1 photo's file can't be found" : `${missingCount} photos' files can't be found`}, so customers won't see {missingCount === 1 ? 'it' : 'them'} either.</p>}
          </section>

          <section className="vda-card vda-panel" aria-labelledby="vda-about">
            <h2 id="vda-about">About this vehicle</h2>
            {car.description ? <p className="vda-description">{car.description}</p> : <p className="vda-description vda-none">No description yet. Customers see this on the vehicle's page.</p>}
            <dl className="vda-facts">
              <Fact label="Transmission">{car.transmission}</Fact>
              <Fact label="Fuel type">{car.fuel_type}</Fact>
              <Fact label="Seats">{car.seating_capacity}</Fact>
              <Fact label="Colour">{car.color}</Fact>
            </dl>
            <h3>Features</h3>
            {features.length ? (
              <ul className="vda-features">
                {features.map((feature) => <li key={feature}><Icon name="check" size={14} />{feature}</li>)}
              </ul>
            ) : <p className="vda-description vda-none">No features listed.</p>}
          </section>

          {variants.length > 0 && (
            <section className="vda-card vda-panel" aria-labelledby="vda-colours">
              <div className="vda-panel-head">
                <h2 id="vda-colours">Colours and stock</h2>
                <button type="button" className="vda-link" onClick={() => navigate(`/admin/vehicles/${car.id}/edit${window.location.search}`)}>Manage</button>
              </div>
              <ul className="vda-variants">
                {variants.map((variant) => (
                  <li key={variant.id}>
                    <span>{variant.color}</span>
                    <b className={Number(variant.stock) > 0 ? undefined : 'vda-out'}>{Number(variant.stock) > 0 ? `${variant.stock} in stock` : 'Out of stock'}</b>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="vda-side">
          <section className="vda-card vda-panel" aria-label="Rental details">
            <p className="vda-price"><b>{money(car.daily_rental_price)}</b><span>per day</span></p>
            <dl className="vda-rows">
              <div><dt>Security deposit</dt><dd>{money(car.security_deposit)}</dd></div>
              <div><dt>Minimum rental</dt><dd>{plural(minimum, 'day')}</dd></div>
              <div><dt>Plate number</dt><dd className={car.plate_number ? undefined : 'vda-none'}>{car.plate_number || 'Not set'}</dd></div>
              <div><dt>Mileage</dt><dd className={hasValue(car.current_mileage) ? undefined : 'vda-none'}>{hasValue(car.current_mileage) ? `${Number(car.current_mileage).toLocaleString('en-PH')} km` : 'Not recorded'}</dd></div>
              <div><dt>Added</dt><dd>{formatDay(car.created_at) || '—'}</dd></div>
              <div><dt>Updated</dt><dd>{formatDay(car.updated_at) || '—'}</dd></div>
            </dl>
          </section>

          <section className="vda-card vda-panel" aria-labelledby="vda-bookings">
            <div className="vda-panel-head">
              <h2 id="vda-bookings">Bookings</h2>
              <button type="button" className="vda-link" onClick={() => navigate('/admin/reservations')}>All reservations</button>
            </div>
            {bookingsError ? <p className="vda-description vda-none">Bookings couldn't be loaded.</p>
              : bookings === null ? <span className="vda-shimmer vda-line-short" role="status" aria-label="Loading bookings" />
                : activeBookings.length ? (
                  <ul className="vda-bookings">
                    {activeBookings.slice(0, BOOKINGS_SHOWN).map((item) => {
                      const out = item.checked_out_at && !item.returned_at
                      return (
                        <li key={item.id}>
                          <span>
                            <b>{item.full_name || item.username || `Customer #${item.user_id}`}</b>
                            <small>{formatDay(item.start_date, false)} to {formatDay(item.end_date, false)}</small>
                          </span>
                          <em className={out ? 'is-out' : `is-${item.status}`}>{out ? 'Out now' : item.status === 'pending' ? 'Pending' : 'Confirmed'}</em>
                        </li>
                      )
                    })}
                  </ul>
                ) : <p className="vda-description vda-none">No current or upcoming bookings.</p>}
            {activeBookings.length > BOOKINGS_SHOWN && <p className="vda-more">{plural(activeBookings.length - BOOKINGS_SHOWN, 'more booking')}</p>}
          </section>
        </aside>
      </div>

      {confirmDelete && <DeleteDialog car={car} onConfirm={deleteVehicle} onClose={() => setConfirmDelete(false)} />}
    </div>
  )
}
