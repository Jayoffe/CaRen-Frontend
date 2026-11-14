import { useCallback, useEffect, useState } from 'react'
import { getReservations, updateReservationStatus, updateVehicleUse } from '../../../Services/API/reservationAPI.js'

function money(value) {
  const amount = Number(value || 0)
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: amount % 1 ? 2 : 0 }).format(amount)
}

// Reservations are confirmed only by a verified payment, so the only status change left here is cancelling.
const STATUS_LABELS = { pending: 'Pending payment', confirmed: 'Confirmed', cancelled: 'Cancelled', rejected: 'Rejected', completed: 'Completed', expired: 'Expired (not paid in time)' }
const PAYMENT_LABELS = { paid: 'Paid', pending: 'Pending', failed: 'Failed', unpaid: 'Not paid', not_required: 'Not required' }
const ACTIVE_STATUSES = ['pending', 'confirmed']
const HISTORY_STATUSES = ['completed', 'cancelled', 'rejected', 'expired']

function localToday() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

export default function ReservationManagement({ historyView = false, setToast }) {
  const [reservations, setReservations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState(() => new URLSearchParams(window.location.search).get('status') || 'all')
  const [search, setSearch] = useState('')
  const [updatingId, setUpdatingId] = useState(null)
  const today = localToday()

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
    if (status === 'cancelled' && !window.confirm(`Cancel reservation #${id}? The record is kept in Reservation History.`)) return
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

  async function updateUse(id, action) {
    setUpdatingId(id)
    setError('')
    try {
      await updateVehicleUse(id, action)
      await refresh()
      setToast?.(action === 'checkout' ? 'Vehicle handover recorded.' : 'Vehicle return recorded.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setUpdatingId(null)
    }
  }

  const searchTerm = search.trim().toLowerCase()
  const viewStatuses = historyView ? HISTORY_STATUSES : ACTIVE_STATUSES
  const visibleReservations = reservations.filter((reservation) => (
    viewStatuses.includes(reservation.status)
    && (statusFilter === 'all' || reservation.status === statusFilter)
    && (!searchTerm || [
      reservation.id,
      reservation.full_name,
      reservation.username,
      reservation.email,
      reservation.make,
      reservation.model,
      reservation.variant_color,
      reservation.plate_number,
      reservation.payment_reference,
    ].some((value) => String(value || '').toLowerCase().includes(searchTerm)))
  ))

  return (
    <div className="admin-content">
      <section className="admin-panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">{historyView ? 'RECORDS' : 'BOOKING OPERATIONS'}</span>
            <h1>{historyView ? 'Reservation History' : 'Reservations'}</h1>
            <p>{historyView ? 'Completed and cancelled reservations, with their payment details.' : 'Current reservations. A reservation is confirmed automatically once its payment is verified.'}</p>
          </div>
          <label className="form-field">
            <span>Filter status</span>
            <select value={viewStatuses.includes(statusFilter) ? statusFilter : 'all'} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">All statuses</option>
              {viewStatuses.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
            </select>
          </label>
          <label className="form-field">
            <span>Search</span>
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Customer, vehicle, reference" />
          </label>
        </div>
        {error && <div className="global-error" role="alert">{error}</div>}
        {loading ? <div className="loading-state"><span className="spinner" />Loading reservations…</div>
          : visibleReservations.length ? <div style={{ overflowX: 'auto' }}>
            <table className="reservation-table">
              <thead><tr><th>Reference</th><th>Customer</th><th>Vehicle</th><th>Pickup</th><th>Return</th><th>Total</th><th>Payment</th><th>Status</th>{!historyView && <th>Actions</th>}</tr></thead>
              <tbody>{visibleReservations.map((reservation) => (
                <tr key={reservation.id}>
                  <td><b>#{reservation.id}</b>{Number(reservation.special_duration_request) === 1 && <small className="special-rental-note">Special duration</small>}</td>
                  <td><b>{reservation.full_name || reservation.username}</b><small>{reservation.email}</small></td>
                  <td>{reservation.make} {reservation.model}{(reservation.variant_color || reservation.plate_number) && <small>{[reservation.variant_color, reservation.plate_number].filter(Boolean).join(' · ')}</small>}</td>
                  <td>{reservation.start_date}</td>
                  <td>{reservation.end_date}<small>{reservation.rental_days} days</small></td>
                  <td>{money(reservation.total_amount)}</td>
                  <td>{PAYMENT_LABELS[reservation.payment_status] || reservation.payment_status}
                    {reservation.payment_reference && <small style={{ overflowWrap: 'anywhere' }}>{reservation.payment_reference}</small>}
                    {reservation.payment_review_reason && <small className="status-warning">Needs review: {reservation.payment_review_reason}</small>}
                  </td>
                  <td><span className={`status-pill status-${reservation.status}`}><i />{STATUS_LABELS[reservation.status] || reservation.status}</span>
                    {reservation.checked_out_at && reservation.status === 'confirmed' && <small>Vehicle out</small>}
                  </td>
                  {!historyView && <td><div className="reservation-actions">
                    {!reservation.checked_out_at && reservation.payment_status !== 'paid' && (
                      <button className="button button-outline" disabled={updatingId === reservation.id} onClick={() => updateStatus(reservation.id, 'cancelled')}>
                        {updatingId === reservation.id ? 'Saving…' : 'Cancel'}
                      </button>
                    )}
                    {reservation.status === 'confirmed' && reservation.checked_out_at && (
                      <button className="button button-primary" disabled={updatingId === reservation.id} onClick={() => updateUse(reservation.id, 'return')}>
                        {updatingId === reservation.id ? 'Saving…' : 'Mark returned'}
                      </button>
                    )}
                    {reservation.status === 'confirmed' && !reservation.checked_out_at
                      && ['paid', 'not_required'].includes(reservation.payment_status)
                      && reservation.start_date <= today && reservation.end_date > today && (
                        <button className="button button-primary" disabled={updatingId === reservation.id} onClick={() => updateUse(reservation.id, 'checkout')}>
                          {updatingId === reservation.id ? 'Saving…' : 'Check out vehicle'}
                        </button>
                    )}
                  </div></td>}
                </tr>
              ))}</tbody>
            </table>
          </div> : !error && <div className="empty-state"><h3>No reservations found</h3><p>{historyView ? 'Completed and cancelled reservations will appear here.' : 'New customer reservations will appear here.'}</p></div>}
      </section>
    </div>
  )
}
