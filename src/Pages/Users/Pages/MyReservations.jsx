import { useCallback, useEffect, useState } from 'react'
import { getReservations, submitManualPayment, updateReservationStatus } from '../../../Services/API/reservationAPI.js'

function money(value) {
  const amount = Number(value || 0)
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: amount % 1 ? 2 : 0 }).format(amount)
}

function ReservationStatus({ status }) {
  return <span className={`status-pill status-${status}`}><i />{status}</span>
}

function localToday() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

export default function MyReservations({ navigate, view = 'all' }) {
  const [reservations, setReservations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [updatingId, setUpdatingId] = useState(null)
  const [notice, setNotice] = useState('')
  const [payingId, setPayingId] = useState(null)
  const [contract, setContract] = useState(null)

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

  const paymentResult = new URLSearchParams(window.location.search).get('payment')

  useEffect(() => {
    let active = true
    getReservations()
      .then((results) => { if (active) setReservations(results) })
      .catch((requestError) => { if (active) setError(requestError.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (paymentResult !== 'success') return undefined

    let active = true
    let timer
    let attempts = 0
    const poll = async () => {
      if (!active) return
      await refresh()
      attempts += 1
      if (active && attempts < 10) timer = window.setTimeout(poll, 3000)
    }
    timer = window.setTimeout(poll, 1500)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [paymentResult, refresh])

  async function cancel(id) {
    setUpdatingId(id)
    setError('')
    try {
      await updateReservationStatus(id, 'cancelled')
      await refresh()
      setNotice('Reservation cancelled.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setUpdatingId(null)
    }
  }

  async function pay(id) {
    setPayingId(id)
    setError('')
    try {
      const reference = window.prompt('Send the exact rental amount to GCash 09979051769, then enter your GCash reference number:')
      if (!reference?.trim()) return
      await submitManualPayment(id, reference.trim())
      await refresh()
      setNotice('GCash payment submitted. An administrator will verify it before vehicle handover.')
    } catch (requestError) {
      setError(requestError.message)
      setPayingId(null)
    }
  }

  const today = localToday()
  const visibleReservations = reservations.filter((reservation) => {
    if (view === 'active') {
      return reservation.status === 'confirmed'
        && reservation.start_date <= today
        && reservation.end_date > today
    }
    if (view === 'history') {
      return ['completed', 'cancelled', 'rejected'].includes(reservation.status)
    }
    return true
  })
  const pageTitle = view === 'active' ? 'Active rentals' : view === 'history' ? 'Reservation history' : 'My reservations'
  return (
    <div className="public-page content-width">
      <section className="home-section">
        <div className="detail-heading">
          <div><div className="detail-breadcrumb">Your trips</div><h1>{pageTitle}</h1></div>
          <button className="button button-primary" onClick={() => navigate('/users/vehicles')}>Browse vehicles</button>
        </div>
        {paymentResult === 'success' && <div className="success-message" role="status">Payment submitted. The reservation will update after PayMongo verifies the GCash payment. <button type="button" className="inline-action" onClick={refresh}>Refresh payment status</button></div>}
        {paymentResult === 'cancelled' && <div className="global-error" role="status">Payment was not completed. You can try GCash checkout again when your reservation is approved.</div>}
        {notice && <div className="success-message" role="status">{notice}</div>}
        {error && <div className="global-error" role="alert">{error}</div>}
        {loading ? <div className="loading-state"><span className="spinner" />Loading reservations…</div>
          : visibleReservations.length ? <div className="vehicle-list-grid">
            {visibleReservations.map((reservation) => (
              <article className="vehicle-card card-panel" key={reservation.id}>
                <div className="detail-heading">
                  <h2>{reservation.make} {reservation.model}</h2>
                  <ReservationStatus status={reservation.status} />
                </div>
                <p>{reservation.start_date} → {reservation.end_date} · {reservation.rental_days} day{Number(reservation.rental_days) === 1 ? '' : 's'}</p>
                {Number(reservation.special_duration_request) === 1 && <p className="special-rental-note">
                  {reservation.status === 'pending' ? 'Special duration request. Waiting for administrator approval.' : 'Special duration request.'}
                </p>}
                {Number(reservation.payment_required) === 1 && <p className="reservation-payment-status">GCash payment: <b>{reservation.payment_status}</b></p>}
                <div className="vehicle-card-footer">
                  <b>{money(reservation.total_amount)}</b>
                  <div className="reservation-card-actions">
                    {reservation.contract_text && <button className="button button-outline" onClick={() => setContract(reservation)}>View agreement</button>}
                    {reservation.status === 'confirmed' && Number(reservation.payment_required) === 1 && reservation.payment_status !== 'paid' &&
                      <button className="button button-primary" disabled={payingId === reservation.id} onClick={() => pay(reservation.id)}>
                        {payingId === reservation.id ? 'Opening GCash…' : 'Pay with GCash'}
                      </button>}
                    {['pending', 'confirmed'].includes(reservation.status)
                      && !reservation.checked_out_at
                      && reservation.payment_status !== 'paid' &&
                    <button className="button button-outline" disabled={updatingId === reservation.id} onClick={() => cancel(reservation.id)}>
                      {updatingId === reservation.id ? 'Cancelling…' : 'Cancel reservation'}
                    </button>}
                  </div>
                </div>
                <small>Reservation #{reservation.id} · {reservation.status === 'pending' ? 'Awaiting admin confirmation' : `Daily rate ${money(reservation.daily_rate)}`}</small>
                {reservation.checked_out_at && <small>Vehicle checked out. Return must be recorded by the administrator before it becomes rentable again.</small>}
              </article>
            ))}
          </div> : !error && <div className="empty-state"><h3>{view === 'active' ? 'No active rentals' : view === 'history' ? 'No reservation history yet' : 'No reservations yet'}</h3><p>{view === 'active' ? 'Confirmed rentals in progress will appear here.' : view === 'history' ? 'Completed, cancelled, and rejected reservations will appear here.' : 'Choose a vehicle and dates to request your first reservation.'}</p><button className="button button-primary" onClick={() => navigate('/users/vehicles')}>{view === 'all' ? 'Find a vehicle' : 'Browse vehicles'}</button></div>}
      </section>
      {contract && (
        <div className="contract-dialog-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setContract(null)
        }}>
          <section className="rental-contract-print" role="dialog" aria-modal="true" aria-labelledby="rental-contract-title">
            <header>
              <h2 id="rental-contract-title">Rental agreement</h2>
              <div>
                <button className="button button-outline" onClick={() => window.print()}>Print agreement</button>
                <button className="button button-outline" onClick={() => setContract(null)}>Close</button>
              </div>
            </header>
            <pre>{contract.contract_text}</pre>
          </section>
        </div>
      )}
    </div>
  )
}
