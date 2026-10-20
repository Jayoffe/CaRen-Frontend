import { useEffect, useState } from 'react'
import { api } from '../../../Services/API/api.js'

function money(value) {
  const number = Number(value || 0)
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: number % 1 ? 2 : 0 }).format(number)
}

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

  const totalValue = reservations.reduce((sum, item) => (
    ['pending', 'confirmed', 'completed'].includes(item.status)
      ? sum + Number(item.total_amount || 0)
      : sum
  ), 0)

  return (
    <div className="public-page content-width">
      <section className="home-section">
        <div className="detail-heading">
          <div>
            <div className="detail-breadcrumb">Customer overview</div>
            <h1>Welcome back, {user?.full_name || user?.username || 'Driver'}</h1>
          </div>
          <button className="button button-primary" onClick={() => navigate('/users/vehicles')}>Browse vehicles</button>
        </div>

        <div className="dashboard-grid">
          <div className="stat-card">
            <span className="eyebrow">Reservations</span>
            <h3>{reservations.length}</h3>
            <small>Active and recent bookings</small>
          </div>
          <div className="stat-card">
            <span className="eyebrow">Booked value</span>
            <h3>{money(totalValue)}</h3>
            <small>Requested booking value, not payment history</small>
          </div>
          {error && <div className="global-error" role="alert">{error}</div>}
          <div className="stat-card">
            <span className="eyebrow">Next rental</span>
            <h3>{reservations[0]?.status || 'Pending'}</h3>
            <small>Reservation status</small>
          </div>
        </div>
      </section>

      <section className="home-section">
        <div className="detail-heading">
          <div>
            <div className="detail-breadcrumb">Trips</div>
            <h2>My reservations</h2>
          </div>
        </div>

        {loading ? (
          <div className="loading-state"><span className="spinner" />Loading reservations…</div>
        ) : reservations.length ? (
          <div className="vehicle-list-grid">
            {reservations.map((reservation, index) => (
              <article key={reservation.id || reservation.booking_id || `${reservation.pickup_date || 'pickup'}-${reservation.return_date || 'return'}-${index}`} className="vehicle-card card-panel">
                <h3>{reservation.vehicle_name || 'Vehicle booking'}</h3>
                <p>{reservation.status || 'Pending'}</p>
                <small>{reservation.start_date || 'Pickup date'} → {reservation.end_date || 'Return date'}</small>
                <div className="vehicle-card-footer">
                  <b>{money(reservation.total_amount || reservation.amount || 0)}</b>
                  <button className="card-detail-link" onClick={() => navigate('/users/reservations')}>View reservations</button>
                </div>
              </article>
            ))}
          </div>
        ) : !error && (
          <div className="empty-state">
            <h3>No reservations yet</h3>
            <p>Book a vehicle to start your first trip.</p>
            <button className="button button-primary" onClick={() => navigate('/users/vehicles')}>Find a car</button>
          </div>
        )}
      </section>
    </div>
  )
}
