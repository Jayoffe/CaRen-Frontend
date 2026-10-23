import { useCallback, useEffect, useState } from 'react'
import { getReservations, updateReservationStatus } from '../../../Services/API/reservationAPI.js'

function money(value) {
  const amount = Number(value || 0)
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: amount % 1 ? 2 : 0 }).format(amount)
}

function ReservationStatus({ status }) {
  return <span className={`status-pill status-${status}`}><i />{status}</span>
}

function localToday() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

export default function MyReservations({ navigate, view = 'all' }) {
  const [reservations, setReservations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [updatingId, setUpdatingId] = useState(null)
  const [notice, setNotice] = useState('')

  const refresh = useCallback(async () => {
    setError('')
    try {
      setReservations(await getReservations())
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    getReservations()
      .then((results) => { if (active) setReservations(results) })
      .catch((requestError) => { if (active) setError(requestError.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  async function cancel(id) {
    setUpdatingId(id)
    setError('')
    try {
      await updateReservationStatus(id, 'cancelled')
      await refresh()
      setNotice('Reservation cancelled.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setUpdatingId(null)
    }
  }

  const today = localToday()
  const visibleReservations = reservations.filter((reservation) => {
    if (view === 'active') {
      return reservation.status === 'confirmed'
        && reservation.start_date <= today
        && reservation.end_date > today
    }
    if (view === 'history') {
      return ['completed', 'cancelled', 'rejected'].includes(reservation.status)
    }
    return true
  })
  const pageTitle = view === 'active' ? 'Active rentals' : view === 'history' ? 'Reservation history' : 'My reservations'

  return (
    <div className="public-page content-width">
      <section className="home-section">
        <div className="detail-heading">
          <div><div className="detail-breadcrumb">Your trips</div><h1>{pageTitle}</h1></div>
          <button className="button button-primary" onClick={() => navigate('/users/vehicles')}>Browse vehicles</button>
        </div>
        {notice && <div className="success-message" role="status">{notice}</div>}
        {error && <div className="global-error" role="alert">{error}</div>}
        {loading ? <div className="loading-state"><span className="spinner" />Loading reservations…</div>
          : visibleReservations.length ? <div className="vehicle-list-grid">
            {visibleReservations.map((reservation) => (
              <article className="vehicle-card card-panel" key={reservation.id}>
                <div className="detail-heading">
                  <h2>{reservation.make} {reservation.model}</h2>
                  <ReservationStatus status={reservation.status} />
                </div>
                <p>{reservation.start_date} → {reservation.end_date} · {reservation.rental_days} day{Number(reservation.rental_days) === 1 ? '' : 's'}</p>
                <div className="vehicle-card-footer">
                  <b>{money(reservation.total_amount)}</b>
                  {['pending', 'confirmed'].includes(reservation.status) &&
                    <button className="button button-outline" disabled={updatingId === reservation.id} onClick={() => cancel(reservation.id)}>
                      {updatingId === reservation.id ? 'Cancelling…' : 'Cancel reservation'}
                    </button>}
                </div>
                <small>Reservation #{reservation.id} · {reservation.status === 'pending' ? 'Awaiting admin confirmation' : `Daily rate ${money(reservation.daily_rate)}`}</small>
              </article>
            ))}
          </div> : !error && <div className="empty-state"><h3>{view === 'active' ? 'No active rentals' : view === 'history' ? 'No reservation history yet' : 'No reservations yet'}</h3><p>{view === 'active' ? 'Confirmed rentals in progress will appear here.' : view === 'history' ? 'Completed, cancelled, and rejected reservations will appear here.' : 'Choose a vehicle and dates to request your first reservation.'}</p><button className="button button-primary" onClick={() => navigate('/users/vehicles')}>{view === 'all' ? 'Find a vehicle' : 'Browse vehicles'}</button></div>}
      </section>
    </div>
  )
}
