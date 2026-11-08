import { useEffect, useState } from 'react'
import { getReservations } from '../../../Services/API/reservationAPI.js'

// The server returns only the signed-in customer's reservations, so only their payments appear here.
const PAYMENT_LABELS = { paid: 'Paid', pending: 'Pending verification', failed: 'Failed' }
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

export default function PaymentHistory() {
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    getReservations()
      .then((results) => {
        if (active) setPayments(results.filter((item) => item.payment_id))
      })
      .catch((requestError) => {
        if (active) setError(requestError.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [])

  return (
    <div className="public-page content-width">
      <section className="home-section">
        <div className="maintenance-panel">
          <div className="maintenance-panel-heading">
            <div>
              <span className="eyebrow">YOUR ACCOUNT</span>
              <h2>Payment history</h2>
              <p>Payments are verified by the payment provider. A reservation is confirmed automatically once its payment shows as Paid.</p>
            </div>
          </div>
          {error && <div className="global-error" role="alert">{error}</div>}
          {loading ? <div className="loading-state"><span className="spinner" />Loading payment records…</div>
            : payments.length ? (
              <div style={{ overflowX: 'auto' }}>
                <table className="reservation-table">
                  <thead><tr><th>Transaction reference</th><th>Reservation</th><th>Amount</th><th>Method</th><th>Date</th><th>Status</th></tr></thead>
                  <tbody>{payments.map((item) => (
                    <tr key={item.payment_id}>
                      <td><span style={{ overflowWrap: 'anywhere' }}>{item.payment_reference || '—'}</span></td>
                      <td>#{item.id} · {item.make} {item.model}<small>{item.start_date} → {item.end_date}</small></td>
                      <td>{money(item.payment_amount ?? item.total_amount)}</td>
                      <td>{item.payment_method || '—'}</td>
                      <td>{formatDateTime(item.payment_status === 'paid' ? item.payment_paid_at : item.payment_created_at)}<small>{item.payment_status === 'paid' ? 'Paid' : 'Started'}</small></td>
                      <td><span className={`status-pill status-${PAYMENT_TONES[item.payment_status] || 'pending'}`}><i />{PAYMENT_LABELS[item.payment_status] || item.payment_status}</span></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : !error && <div className="maintenance-empty" role="status">
              <h3>No payments yet</h3>
              <p>Payments you make for your reservations will appear here.</p>
            </div>}
        </div>
      </section>
    </div>
  )
}
