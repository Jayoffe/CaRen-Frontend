import { useEffect, useState } from 'react'
import { getReservations } from '../../../Services/API/reservationAPI.js'

function money(value) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value || 0))
}

export default function PaymentHistory() {
  const [reservations, setReservations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    getReservations()
      .then((results) => {
        if (active) setReservations(results.filter((item) => Number(item.payment_required) === 1))
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
            <div><span className="eyebrow">YOUR ACCOUNT</span><h2>Payment history</h2></div>
          </div>
          {error && <div className="global-error" role="alert">{error}</div>}
          {loading ? <div className="loading-state"><span className="spinner" />Loading payment records…</div>
            : reservations.length ? (
              <div style={{ overflowX: 'auto' }}>
                <table className="reservation-table">
                  <thead><tr><th>Reservation</th><th>Vehicle</th><th>Amount</th><th>Payment status</th><th>Paid on</th></tr></thead>
                  <tbody>{reservations.map((item) => (
                    <tr key={item.id}>
                      <td>#{item.id}<small>{item.payment_reference || 'GCash via PayMongo'}</small></td>
                      <td>{item.make} {item.model}</td>
                      <td>{money(item.total_amount)}</td>
                      <td>{item.payment_status}</td>
                      <td>{item.payment_paid_at || 'Not paid'}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : !error && <div className="maintenance-empty" role="status">
              <h3>No payments yet</h3>
              <p>Approved reservations that require GCash payment will appear here.</p>
            </div>}
        </div>
      </section>
    </div>
  )
}
