import { useEffect, useState } from 'react'
import { api } from '../../../Services/API/api.js'

export default function UserDashboard({ user, navigate }) {
  const [reservations, setReservations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    api.get('/api/reservations')
      .then((response) => {
        if (active) setReservations(response?.data || [])
      })
      .catch((requestError) => {
        if (active) {
          setError(requestError.message)
          setReservations([])
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [])

  const now = new Date()
  const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
  const nextRental = reservations
    .filter((item) => ['pending', 'confirmed'].includes(item.status) && item.end_date >= today)
    .sort((left, right) => left.start_date.localeCompare(right.start_date))[0]
  const recentReservations = reservations.slice(0, 4)
  const activeRentals = reservations.filter((item) => (
    item.status === 'confirmed' && item.start_date <= today && item.end_date > today
  )).length
  const pendingReservations = reservations.filter((item) => item.status === 'pending').length

  return (
    <div className="public-page content-width customer-dashboard-page">
      <section className="customer-welcome-card">
        <div>
          <span className="eyebrow">YOUR DRIVERENT SPACE</span>
          <h1>Welcome back, <em>{user?.full_name || user?.username || 'Driver'}.</em></h1>
          <p>Your trips, reservations, and next ride—all in one place.</p>
          <button className="button button-white" onClick={() => navigate('/users/vehicles')}>Explore available vehicles</button>
        </div>
        <div className="customer-welcome-aside" aria-hidden="true">
          <span>MADE FOR YOUR NEXT JOURNEY</span>
          <b>01</b>
          <small>Browse · Choose · Go</small>
        </div>
      </section>

      {error && <div className="global-error" role="alert">{error}</div>}

      <section className="customer-dashboard-metrics" aria-label="Reservation overview">
        <article><span>ALL RESERVATIONS</span><b>{loading ? '—' : reservations.length}</b><small>Trips requested</small></article>
        <article><span>ACTIVE RENTALS</span><b>{loading ? '—' : activeRentals}</b><small>Currently on the road</small></article>
        <article><span>AWAITING CONFIRMATION</span><b>{loading ? '—' : pendingReservations}</b><small>Pending reservations</small></article>
      </section>

      <section className="customer-dashboard-section">
        <div className="customer-section-heading">
          <div><span className="eyebrow">YOUR NEXT TRIP</span><h2>{nextRental ? `${nextRental.make || 'Vehicle'} ${nextRental.model || ''}`.trim() : 'Ready when you are'}</h2></div>
          {nextRental && <span className={`status-pill status-${nextRental.status}`}><i />{nextRental.status}</span>}
        </div>
        {loading ? <div className="loading-state"><span className="spinner" />Loading your trips…</div> : nextRental ? (
          <article className="next-trip-panel">
            <div className="next-trip-dates">
              <span><small>PICKUP</small><b>{nextRental.start_date}</b></span>
              <span className="next-trip-divider" aria-hidden="true" />
              <span><small>RETURN</small><b>{nextRental.end_date}</b></span>
            </div>
            <div className="next-trip-meta">
              <span>Reservation #{nextRental.id}</span>
              <span>{nextRental.rental_days} days</span>
              <button className="text-action" onClick={() => navigate('/users/reservations')}>Manage reservation</button>
            </div>
          </article>
        ) : !error && (
          <div className="customer-empty-trip">
            <p>No upcoming or active reservations. Browse the fleet to plan your next drive.</p>
            <button className="button button-primary" onClick={() => navigate('/users/vehicles')}>Browse vehicles</button>
          </div>
        )}
      </section>

      <section className="customer-dashboard-section customer-recent-trips">
        <div className="customer-section-heading">
          <div><span className="eyebrow">BOOKING ACTIVITY</span><h2>Recent reservations</h2></div>
          <button className="text-action" onClick={() => navigate('/users/reservations')}>View all <span aria-hidden="true">→</span></button>
        </div>
        {loading ? null : recentReservations.length ? (
          <div className="customer-reservation-list">
            {recentReservations.map((reservation) => (
              <article className="customer-reservation-row" key={reservation.id}>
                <div><b>{reservation.make} {reservation.model}</b><small>{reservation.start_date} – {reservation.end_date}</small></div>
                <span className={`status-pill status-${reservation.status}`}><i />{reservation.status}</span>
                <span className="customer-reservation-id">#{reservation.id}</span>
              </article>
            ))}
          </div>
        ) : !error && <div className="customer-empty-trip"><p>Your reservation activity will appear here after you book a vehicle.</p></div>}
      </section>
    </div>
  )
}
