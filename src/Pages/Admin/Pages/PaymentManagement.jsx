import { useEffect, useState } from 'react'
import { getReservations, verifyManualPayment } from '../../../Services/API/reservationAPI.js'

function money(value) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value || 0))
}

export default function PaymentManagement() {
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [updatingId, setUpdatingId] = useState(null)

  useEffect(() => {
    let active = true
    getReservations()
      .then((results) => {
        if (active) setPayments(results.filter((item) => Number(item.payment_required) === 1))
      })
      .catch((requestError) => {
        if (active) setError(requestError.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [])

  async function verify(id, decision) {
    setUpdatingId(id)
    setError('')
    try {
      await verifyManualPayment(id, decision)
      const results = await getReservations()
      setPayments(results.filter((item) => Number(item.payment_required) === 1))
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setUpdatingId(null)
    }
  }

  const paidTotal = payments
    .filter((payment) => payment.payment_status === 'paid')
    .reduce((total, payment) => total + Number(payment.total_amount || 0), 0)

  return (
    <div className="admin-content maintenance-page">
      <header className="maintenance-page-heading">
        <div>
          <span className="eyebrow">FINANCE</span>
          <h1>Payment history</h1>
          <p>Manual GCash submissions for 09979051769.</p>
        </div>
      </header>
      <section className="maintenance-panel">
        <div className="maintenance-panel-heading">
          <div><span className="eyebrow">VERIFIED PAYMENTS</span><h2>{money(paidTotal)} received</h2></div>
        </div>
        {error && <div className="global-error" role="alert">{error}</div>}
        {loading ? <div className="loading-state"><span className="spinner" />Loading payment records…</div>
          : payments.length ? (
            <div style={{ overflowX: 'auto' }}>
              <table className="reservation-table">
                <thead><tr><th>Customer</th><th>Reservation</th><th>Vehicle</th><th>Amount</th><th>Status</th><th>Paid on</th><th>Actions</th></tr></thead>
                <tbody>{payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>{payment.full_name || payment.username}<small>{payment.email}</small></td>
                    <td>#{payment.id}<small>{payment.payment_reference || 'GCash online payment'}</small></td>
                    <td>{payment.make} {payment.model}</td>
                    <td>{money(payment.total_amount)}</td>
                    <td>{payment.payment_status}</td>
                    <td>{payment.payment_paid_at || 'Not paid'}</td>
                    <td>{payment.payment_status === 'pending' && <><button className="button button-primary" disabled={updatingId === payment.id} onClick={() => verify(payment.id, 'approve')}>Verify</button> <button className="button button-outline" disabled={updatingId === payment.id} onClick={() => verify(payment.id, 'reject')}>Reject</button></>}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : !error && <div className="maintenance-empty" role="status">
            <h3>No payment records yet</h3>
            <p>Verified GCash payments will appear here after a customer pays an approved reservation.</p>
          </div>}
      </section>
    </div>
  )
}
