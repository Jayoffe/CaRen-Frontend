import { useEffect, useState } from 'react'
import { api } from '../../../Services/API/api.js'
import './UserDashboard.css'

const DAY_MS = 86400000

function parseDay(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || '')
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null
}

function formatDay(value, options = { month: 'short', day: 'numeric', year: 'numeric' }) {
  const day = parseDay(value)
  return day ? day.toLocaleDateString('en-US', options) : value || '—'
}

function vehicleName(reservation) {
  return `${reservation.make || 'Vehicle'} ${reservation.model || ''}`.trim()
}

function plural(count, word) {
  return `${count} ${word}${Number(count) === 1 ? '' : 's'}`
}

function describeTrip(trip, today) {
  if (!trip) return 'No trips planned yet. Pick a car and your dates, and your trip will show up here.'
  const name = vehicleName(trip)
  if (trip.status === 'pending') return `Your ${name} request is waiting for confirmation.`
  if (trip.start_date <= today) return `You’re on the road. Your ${name} is due back ${formatDay(trip.end_date, { month: 'short', day: 'numeric' })}.`
  const days = Math.round((parseDay(trip.start_date) - parseDay(today)) / DAY_MS)
  if (days === 1) return `Pickup for your ${name} is tomorrow.`
  return `Pickup for your ${name} is in ${days} days.`
}

function ArrowIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14m-7-7 7 7-7 7" /></svg>
}

function Status({ status }) {
  return <span className={`status-pill status-${status}`}><i />{status}</span>
}

function NextTripTicket({ trip, loading, failed, navigate }) {
  if (loading) {
    return (
      <div className="dash-ticket" aria-hidden="true">
        <span className="dash-skeleton dash-skeleton-dark" style={{ width: '46%' }} />
        <span className="dash-skeleton dash-skeleton-dark dash-skeleton-lg" style={{ width: '72%' }} />
        <span className="dash-skeleton dash-skeleton-dark" style={{ width: '100%' }} />
      </div>
    )
  }
  if (failed || !trip) {
    return (
      <div className="dash-ticket dash-ticket-empty">
        <small className="dash-ticket-label">Next trip</small>
        <div className="dash-ticket-route" aria-hidden="true">
          <span><small>Pickup</small><b>—</b></span>
          <i />
          <span><small>Return</small><b>—</b></span>
        </div>
        <p>{failed ? 'Unavailable' : 'Nothing booked yet'}</p>
      </div>
    )
  }
  return (
    <article className="dash-ticket">
      <header>
        <small className="dash-ticket-label">Next trip</small>
        <Status status={trip.status} />
      </header>
      <h2>{vehicleName(trip)}</h2>
      <div className="dash-ticket-route">
        <span><small>Pickup</small><b>{formatDay(trip.start_date)}</b></span>
        <i aria-hidden="true" />
        <span><small>Return</small><b>{formatDay(trip.end_date)}</b></span>
      </div>
      <footer>
        <span>{trip.rental_days ? `${plural(trip.rental_days, 'day')} · ` : ''}#{trip.id}</span>
        <button type="button" onClick={() => navigate('/users/reservations')}>Manage <ArrowIcon /></button>
      </footer>
    </article>
  )
}

export default function UserDashboard({ user, navigate }) {
  const [reservations, setReservations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

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
  }, [attempt])

  const retry = () => {
    setError('')
    setLoading(true)
    setAttempt((value) => value + 1)
  }

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
  const firstName = (user?.full_name || user?.username || 'Driver').trim().split(/\s+/)[0]
  const failed = Boolean(error)

  const stats = [
    { label: 'All reservations', value: reservations.length, href: '/users/reservations' },
    { label: 'On the road', value: activeRentals, href: '/users/rentals' },
    { label: 'Awaiting confirmation', value: pendingReservations, href: '/users/reservations', attention: pendingReservations > 0 },
  ]

  return (
    <div className="public-page content-width customer-dashboard-page dash">
      <section className="dash-hero">
        <div className="dash-hero-copy">
          <time dateTime={today}>{now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</time>
          <h1>Welcome back, <em>{firstName}.</em></h1>
          <p>{loading ? 'Checking your trips…' : failed ? 'Your trip details are unavailable right now.' : describeTrip(nextRental, today)}</p>
          <button className="dash-hero-action" type="button" onClick={() => navigate('/users/vehicles')}>Browse vehicles <ArrowIcon /></button>
        </div>
        <NextTripTicket trip={nextRental} loading={loading} failed={failed} navigate={navigate} />
      </section>

      {error && (
        <div className="dash-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={retry}>Try again</button>
        </div>
      )}

      <section className="dash-stats" aria-label="Reservation overview" aria-busy={loading}>
        {stats.map((stat) => {
          const empty = !loading && !failed && stat.value === 0
          return (
            <button className="dash-stat" type="button" key={stat.label} onClick={() => navigate(stat.href)}>
              {loading
                ? <span className="dash-skeleton dash-skeleton-num" />
                : <b className={`${empty ? 'is-zero' : ''}${stat.attention ? ' is-attention' : ''}`}>{failed ? '—' : stat.value}</b>}
              <span>{stat.label}</span>
              <ArrowIcon />
            </button>
          )
        })}
      </section>

      <div className="dash-lower">
        <section className="dash-panel dash-recent" aria-labelledby="dash-recent-title" aria-busy={loading}>
          <header>
            <h2 id="dash-recent-title">Recent reservations</h2>
            {recentReservations.length > 0 && <button className="dash-link" type="button" onClick={() => navigate('/users/reservations')}>View all <ArrowIcon /></button>}
          </header>
          {loading ? (
            <div className="dash-rows" aria-hidden="true">
              {[0, 1, 2].map((row) => (
                <div className="dash-row" key={row}>
                  <div><span className="dash-skeleton" style={{ width: '42%' }} /><span className="dash-skeleton" style={{ width: '64%' }} /></div>
                </div>
              ))}
            </div>
          ) : recentReservations.length ? (
            <ul className="dash-rows">
              {recentReservations.map((reservation) => (
                <li className="dash-row" key={reservation.id}>
                  <div>
                    <b>{vehicleName(reservation)}</b>
                    <small>{formatDay(reservation.start_date, { month: 'short', day: 'numeric' })} – {formatDay(reservation.end_date)} · #{reservation.id}</small>
                  </div>
                  <Status status={reservation.status} />
                </li>
              ))}
            </ul>
          ) : (
            <div className="dash-empty">
              <p>{failed ? 'Unavailable until your reservations load.' : 'Your bookings will appear here once you reserve a vehicle.'}</p>
            </div>
          )}
        </section>

        <aside className="dash-panel dash-finder">
          <h2>Not sure which car fits?</h2>
          <p>Tell us about your trip and we’ll compare your needs with the vehicles available now.</p>
          <button className="dash-link" type="button" onClick={() => navigate('/users/recommendations')}>Get recommendations <ArrowIcon /></button>
        </aside>
      </div>
    </div>
  )
}
