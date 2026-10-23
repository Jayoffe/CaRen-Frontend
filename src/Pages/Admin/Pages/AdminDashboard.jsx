import { useEffect, useState } from 'react'
import DashboardStats from '../Components/DashboardStats.jsx'
import { api } from '../../../Services/API/api.js'

function money(value) {
  const n = Number(value || 0)
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: n % 1 ? 2 : 0 }).format(n)
}

function localToday() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

export default function AdminDashboard({ navigate }) {
  const [fleet, setFleet] = useState({ total: 0, available: 0 })
  const [reservations, setReservations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    Promise.all([
      api.get('/api/cars?per_page=1'),
      api.get('/api/reservations')
    ])
      .then(([carsResponse, reservationsResponse]) => {
        if (!active) return
        setFleet({
          total: Number(carsResponse?.meta?.total || 0),
          available: Number(carsResponse?.meta?.available_count || 0),
        })
        setReservations(reservationsResponse?.data || [])
      })
      .catch((requestError) => {
        if (active) {
          setError(requestError.message)
          setFleet({ total: 0, available: 0 })
          setReservations([])
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [])

  const totalBookingValue = reservations.reduce((sum, item) => (
    ['pending', 'confirmed', 'completed'].includes(item.status)
      ? sum + Number(item.total_amount || 0)
      : sum
  ), 0)
  const stats = [
    { label: 'Fleet', value: fleet.total, detail: `${fleet.available} currently available`, tone: 'blue' },
    { label: 'Bookings', value: reservations.length, detail: 'All customer reservations', tone: 'green' },
    { label: 'Booking value', value: money(totalBookingValue), detail: 'Requested amounts, not payments', tone: 'amber' },
  ]
  const today = localToday()
  const operationalReservations = reservations
    .filter((item) => (
      (item.status === 'confirmed' && item.end_date < today)
      || (['pending', 'confirmed'].includes(item.status) && item.start_date >= today)
    ))
    .sort((left, right) => left.start_date.localeCompare(right.start_date))
    .slice(0, 6)

  return (
    <div className="admin-content">
      <section className="home-section admin-dashboard-section">
        <div className="detail-heading admin-dashboard-header">
          <div>
            <div className="detail-breadcrumb">Operations overview</div>
            <h1>Fleet dashboard</h1>
          </div>
          <button className="button button-primary" onClick={() => navigate('/admin/vehicles')}>Manage vehicles</button>
        </div>

        {error && <div className="global-error" role="alert">{error}</div>}
        {loading ? (
          <div className="loading-state"><span className="spinner" />Loading dashboard…</div>
        ) : !error ? <>
          <DashboardStats stats={stats} />
          <section className="admin-panel dashboard-operations">
            <div className="section-heading">
              <div><span className="eyebrow">FLEET SCHEDULE</span><h2>Upcoming pickups &amp; returns</h2><p>Pending and confirmed reservations from the live booking records.</p></div>
              <button className="button button-outline" onClick={() => navigate('/admin/reservations')}>All reservations</button>
            </div>
            {operationalReservations.length ? (
              <div className="maintenance-table-wrap">
                <table className="maintenance-table dashboard-operations-table">
                  <thead><tr><th>Customer</th><th>Vehicle</th><th>Pickup</th><th>Return</th><th>Status</th></tr></thead>
                  <tbody>{operationalReservations.map((item) => (
                    <tr key={item.id}>
                      <td>{item.full_name || item.username || `Customer #${item.user_id}`}</td>
                      <td>{item.make} {item.model}</td>
                      <td>{item.start_date}</td>
                      <td>{item.end_date}</td>
                      <td><span className={`status-pill status-${item.status}`}><i />{item.status}</span></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : <div className="maintenance-empty">No upcoming pickups or overdue returns in the current reservation records.</div>}
          </section>
        </> : null}
      </section>
    </div>
  )
}
