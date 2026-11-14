import { useEffect, useState } from 'react'
import { getPaymentsNeedingReview, getReservations } from '../../../Services/API/reservationAPI.js'

// Payments are verified by the gateway webhook and confirm their reservation automatically,
// so this page is for monitoring only. There is nothing to approve here.
const PAYMENT_LABELS = { paid: 'Paid', pending: 'Pending', failed: 'Failed' }
// Reuses the reservation status colours. The label always states the status in words.
const PAYMENT_TONES = { paid: 'confirmed', pending: 'pending', failed: 'cancelled' }

function money(value) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value || 0))
}

function formatDateTime(value) {
  if (!value) return '—'
  const date = new Date(String(value).replace(' ', 'T'))
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date)
}

export default function PaymentManagement() {
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [review, setReview] = useState([])

  useEffect(() => {
    let active = true
    Promise.all([getReservations(), getPaymentsNeedingReview()])
      .then(([results, flagged]) => {
        if (!active) return
        // One row per reservation, showing its latest payment attempt.
        setPayments(results.filter((item) => item.payment_id))
        setReview(flagged)
      })
      .catch((requestError) => {
        if (active) setError(requestError.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [])

  const term = search.trim().toLowerCase()
  const visible = payments.filter((payment) => (
    (statusFilter === 'all' || payment.payment_status === statusFilter)
    && (!term || [payment.payment_reference, payment.id, payment.full_name, payment.username, payment.email, payment.make, payment.model, payment.plate_number]
      .some((value) => String(value || '').toLowerCase().includes(term)))
  ))
  const count = (status) => payments.filter((payment) => payment.payment_status === status).length
  const paidTotal = payments
    .filter((payment) => payment.payment_status === 'paid')
    .reduce((total, payment) => total + Number(payment.payment_amount ?? payment.total_amount ?? 0), 0)

  return (
    <div className="admin-content">
      <section className="admin-panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">FINANCE</span>
            <h1>Payment History</h1>
            <p>{money(paidTotal)} received · {count('paid')} paid · {count('pending')} pending · {count('failed')} failed. Paid reservations are confirmed automatically.</p>
          </div>
          <label className="form-field">
            <span>Payment status</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">All statuses</option>
              {Object.entries(PAYMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="form-field">
            <span>Search</span>
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Transaction, customer, vehicle" />
          </label>
        </div>
        {error && <div className="global-error" role="alert">{error}</div>}
        {review.length > 0 && <div className="review-queue" role="alert">
          <h2>{review.length} payment{review.length === 1 ? '' : 's'} need{review.length === 1 ? 's' : ''} review</h2>
          <p>Money was received for a reservation that can no longer use it. Contact the customer to refund or rebook.</p>
          <ul>{review.map((item) => <li key={item.id}>
            <b>{money(item.paid_amount ?? item.amount)}</b> from {item.full_name} for reservation #{item.reservation_id} ({item.reservation_status}), paid {formatDateTime(item.paid_at)}.
            <small>{item.review_reason} Reference: {item.reference_number}</small>
          </li>)}</ul>
        </div>}
        {loading ? <div className="loading-state"><span className="spinner" />Loading payment records…</div>
          : visible.length ? (
            <div style={{ overflowX: 'auto' }}>
              <table className="reservation-table">
                <thead><tr><th>Transaction ID</th><th>Customer</th><th>Reservation</th><th>Vehicle</th><th>Amount</th><th>Method</th><th>Date</th><th>Status</th></tr></thead>
                <tbody>{visible.map((payment) => (
                  <tr key={payment.payment_id}>
                    <td><span style={{ overflowWrap: 'anywhere' }}>{payment.payment_reference || '—'}</span></td>
                    <td>{payment.full_name || payment.username}<small>{payment.email}</small></td>
                    <td>#{payment.id}<small>{payment.status === 'pending' ? 'Pending payment' : payment.status}</small></td>
                    <td>{payment.make} {payment.model}{payment.plate_number && <small>{payment.plate_number}</small>}</td>
                    <td>{money(payment.payment_amount ?? payment.total_amount)}</td>
                    <td>{payment.payment_method || '—'}</td>
                    <td>{formatDateTime(payment.payment_status === 'paid' ? payment.payment_paid_at : payment.payment_created_at)}<small>{payment.payment_status === 'paid' ? 'Paid' : 'Started'}</small></td>
                    <td><span className={`status-pill status-${PAYMENT_TONES[payment.payment_status] || 'pending'}`}><i />{PAYMENT_LABELS[payment.payment_status] || payment.payment_status}</span>
                      {payment.payment_review_reason && <small className="status-warning">Needs review</small>}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : !error && <div className="empty-state">
            <h3>{payments.length ? 'No payments match these filters' : 'No payment records yet'}</h3>
            <p>{payments.length ? 'Change the status or search to see more.' : 'Payments appear here as soon as a customer starts checkout.'}</p>
          </div>}
      </section>
    </div>
  )
}
