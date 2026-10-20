import { useEffect, useState } from 'react'
import DashboardStats from '../Components/DashboardStats.jsx'
import { api } from '../../../Services/API/api.js'

function money(value) {
  const n = Number(value || 0)
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: n % 1 ? 2 : 0 }).format(n)
}

export default function AdminDashboard({ navigate }) {
  const [cars, setCars] = useState([])
  const [reservations, setReservations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    Promise.all([
      api.get('/api/cars/available'),
      api.get('/api/reservations')
    ])
      .then(([carsResponse, reservationsResponse]) => {
        if (!active) return
        setCars(carsResponse?.data || [])
        setReservations(reservationsResponse?.data || [])
      })
      .catch((requestError) => {
        if (active) {
          setError(requestError.message)
          setCars([])
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
    { label: 'Fleet', value: cars.length, detail: 'Available vehicles', tone: 'blue' },
    { label: 'Bookings', value: reservations.length, detail: 'All customer reservations', tone: 'green' },
    { label: 'Booking value', value: money(totalBookingValue), detail: 'Requested amounts, not payments', tone: 'amber' },
  ]

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
        ) : !error ? (
          <DashboardStats stats={stats} />
        ) : null}
      </section>
    </div>
  )
}
