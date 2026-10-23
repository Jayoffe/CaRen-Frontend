import { useCallback, useEffect, useState } from 'react'
import { getReservations, updateReservationStatus } from '../../../Services/API/reservationAPI.js'

function money(value) {
  const amount = Number(value || 0)
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: amount % 1 ? 2 : 0 }).format(amount)
}

const adminTransitions = {
  pending: [['confirmed', 'Confirm'], ['rejected', 'Reject']],
  confirmed: [['completed', 'Complete'], ['cancelled', 'Cancel']],
}

export default function ReservationManagement({ historyView = false, setToast }) {
  const [reservations, setReservations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [updatingId, setUpdatingId] = useState(null)

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

  async function updateStatus(id, status) {
    setUpdatingId(id)
    setError('')
    try {
      await updateReservationStatus(id, status)
      await refresh()
      setToast?.('Reservation status updated.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setUpdatingId(null)
    }
  }

  const searchTerm = search.trim().toLowerCase()
  const visibleReservations = reservations.filter((reservation) => (
    (statusFilter === 'all' || reservation.status === statusFilter)
    && (!searchTerm || [
      reservation.id,
      reservation.full_name,
      reservation.username,
      reservation.email,
      reservation.make,
      reservation.model,
      reservation.plate_number,
    ].some((value) => String(value || '').toLowerCase().includes(searchTerm)))
  ))

  return (
    <div className="admin-content">
      <section className="admin-panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">{historyView ? 'RECORDS' : 'BOOKING OPERATIONS'}</span>
            <h1>{historyView ? 'Reservation History' : 'Reservations'}</h1>
            <p>{historyView ? 'Review all customer reservations and their current statuses.' : 'Review customer requests and manage supported booking statuses.'}</p>
          </div>
          <label className="form-field">
            <span>Filter status</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">All statuses</option>
              {['pending', 'confirmed', 'cancelled', 'rejected', 'completed'].map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </label>
          <label className="form-field">
            <span>Search</span>
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Customer, vehicle, or ID" />
          </label>
        </div>
        {error && <div className="global-error" role="alert">{error}</div>}
        {loading ? <div className="loading-state"><span className="spinner" />Loading reservations…</div>
          : visibleReservations.length ? <div style={{ overflowX: 'auto' }}>
            <table className="reservation-table">
              <thead><tr><th>Customer</th><th>Vehicle</th><th>Rental period</th><th>Amount</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>{visibleReservations.map((reservation) => (
                <tr key={reservation.id}>
                  <td><b>{reservation.full_name || reservation.username}</b><small>{reservation.email}</small></td>
                  <td>{reservation.make} {reservation.model}</td>
                  <td>{reservation.start_date} → {reservation.end_date}<small>{reservation.rental_days} days</small></td>
                  <td>{money(reservation.total_amount)}</td>
                  <td><span className={`status-pill status-${reservation.status}`}><i />{reservation.status}</span></td>
                  <td><div className="reservation-actions">{(adminTransitions[reservation.status] || []).map(([status, label]) => (
                    <button key={status} className={status === 'rejected' || status === 'cancelled' ? 'button button-outline' : 'button button-primary'} disabled={updatingId === reservation.id} onClick={() => updateStatus(reservation.id, status)}>
                      {updatingId === reservation.id ? 'Saving…' : label}
                    </button>
                  ))}</div></td>
                </tr>
              ))}</tbody>
            </table>
          </div> : !error && <div className="empty-state"><h3>No reservations found</h3><p>New customer requests will appear here.</p></div>}
      </section>
    </div>
  )
}
