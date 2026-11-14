import { useCallback, useEffect, useState } from 'react'
import { imageUrl } from '../../../Services/API/api.js'
import { createPaymentCheckout, getReservations, updateReservationStatus } from '../../../Services/API/reservationAPI.js'
import CarSilhouette from '../Components/CarSilhouette.jsx'
import { AgreementDialog, CancelDialog, PaymentDialog } from '../Components/ReservationDialogs.jsx'
import './MyReservations.css'

const SKELETON_CARDS = [1, 2]

const VIEW_COPY = {
  all: {
    title: 'My reservations',
    lede: 'Your current bookings. A reservation is confirmed automatically as soon as your payment is verified.',
    emptyTitle: 'No current reservations',
    emptyBody: 'Choose a vehicle and dates to make a reservation. Past bookings are in Reservation history.',
    emptyAction: 'Find a vehicle',
  },
  active: {
    title: 'Active rentals',
    lede: 'Confirmed rentals running today.',
    emptyTitle: 'No active rentals',
    emptyBody: 'Confirmed rentals in progress will appear here.',
    emptyAction: 'Browse vehicles',
  },
  history: {
    title: 'Reservation history',
    lede: 'Your completed and cancelled reservations, with their payment details.',
    emptyTitle: 'No reservation history yet',
    emptyBody: 'Completed, cancelled, expired, and rejected reservations will appear here.',
    emptyAction: 'Browse vehicles',
  },
}

const STATUS_LABELS = { pending: 'Pending payment', confirmed: 'Confirmed', completed: 'Completed', cancelled: 'Cancelled', rejected: 'Rejected', expired: 'Expired' }
const PAYMENT_LABELS = { unpaid: 'Not paid', pending: 'Pending verification', paid: 'Paid', failed: 'Failed', not_required: 'Not required' }
const HISTORY_STATUSES = ['completed', 'cancelled', 'rejected', 'expired']
const POLL_ATTEMPTS = 10

function money(value) {
  const amount = Number(value || 0)
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: amount % 1 ? 2 : 0 }).format(amount)
}

function formatDate(value) {
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value || '—'
  return new Intl.DateTimeFormat('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

function localToday() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

function formatDateTime(value) {
  if (!value) return '—'
  const date = new Date(String(value).replace(' ', 'T'))
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date)
}

/**
 * An unpaid reservation holds its dates for a limited time (60 minutes). hold_seconds_left comes
 * from the server; loadedAt is when the list was fetched, so no time zones are compared.
 */
function holdActive(reservation) {
  if (reservation.status !== 'pending' || reservation.hold_seconds_left == null) return false
  return Date.now() < (reservation.loadedAt || 0) + Number(reservation.hold_seconds_left) * 1000
}

function holdDeadline(reservation) {
  const deadline = new Date((reservation.loadedAt || Date.now()) + Number(reservation.hold_seconds_left || 0) * 1000)
  return new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit' }).format(deadline)
}

/** Payment can be started or retried until it is verified. The server checks the same rules. */
function canPay(reservation, today) {
  return Number(reservation.payment_required) === 1
    && (reservation.status !== 'pending' || holdActive(reservation))
    && ['unpaid', 'pending', 'failed'].includes(reservation.payment_status)
    && ['pending', 'confirmed'].includes(reservation.status)
    && !reservation.checked_out_at
    && (reservation.status !== 'pending' || reservation.start_date >= today)
    && reservation.end_date > today
}

function payLabel(reservation) {
  if (reservation.payment_status === 'failed') return 'Retry payment'
  if (reservation.payment_status === 'pending') return 'Continue payment'
  return 'Pay now'
}

/** What the customer should expect next, in one sentence. */
function nextStep(reservation) {
  const special = Number(reservation.special_duration_request) === 1
  if (reservation.checked_out_at && !reservation.returned_at && reservation.status === 'confirmed') {
    return { text: `You have this vehicle. Return it by ${formatDate(reservation.end_date)}.` }
  }
  switch (reservation.status) {
    case 'pending':
      if (!holdActive(reservation)) return { tone: 'attention', text: 'The time to pay ran out, so these dates were released. Make a new reservation to book again.' }
      if (reservation.payment_status === 'failed') return { tone: 'attention', text: 'The last payment attempt did not go through. Retry the payment to confirm this reservation.' }
      if (reservation.payment_status === 'pending') return { text: `${special ? 'Special duration request. ' : ''}Waiting for the payment provider to verify your payment. Your reservation is confirmed automatically once it does.` }
      return { tone: 'attention', text: `${special ? 'Special duration request. ' : ''}Pay by ${holdDeadline(reservation)} to keep these dates. The reservation is confirmed automatically once the payment is verified.` }
    case 'confirmed':
      if (Number(reservation.payment_required) === 1 && reservation.payment_status !== 'paid') return { tone: 'attention', text: 'Payment is still needed before vehicle handover.' }
      return { tone: 'good', text: 'Confirmed and paid. Bring a valid driver license at pickup.' }
    case 'completed':
      return { text: 'Rental completed.' }
    case 'cancelled':
      return { text: 'This reservation was cancelled.' }
    case 'rejected':
      return { text: 'This request was not approved. You can choose other dates or another vehicle.' }
    case 'expired':
      if (reservation.payment_status === 'paid') return { tone: 'attention', text: 'Your payment arrived after the time to pay ran out. An administrator will contact you to rebook or refund it.' }
      return { text: 'Not paid in time, so the dates were released.' }
    default:
      return null
  }
}

function ReservationCard({ reservation, today, navigate, onAgreement, onPay, onCancel }) {
  const name = `${reservation.make} ${reservation.model}`
  const meta = [reservation.year, reservation.category, reservation.variant_color].filter(Boolean).join(' · ')
  const days = Number(reservation.rental_days)
  const step = nextStep(reservation)
  const showPayment = Number(reservation.payment_required) === 1
  const payable = canPay(reservation, today)
  const canCancel = ['pending', 'confirmed'].includes(reservation.status) && !reservation.checked_out_at && reservation.payment_status !== 'paid'

  return (
    <article className="rv-card">
      <button type="button" className="rv-photo" onClick={() => navigate(`/users/vehicles/${reservation.car_id}`)} aria-label={`View ${name}`}>
        <span className="rv-photo-empty" aria-hidden="true"><CarSilhouette category={reservation.category} /></span>
        {reservation.primary_image && <img
          src={imageUrl(reservation.primary_image)}
          alt=""
          loading="lazy"
          onError={(event) => { event.currentTarget.hidden = true }}
        />}
      </button>
      <div className="rv-card-body">
        <div className="rv-card-head">
          <div>
            <div className="rv-title">
              <h2>{name}</h2>
              <span className={`rv-status rv-status-${reservation.status}`}>{STATUS_LABELS[reservation.status] || reservation.status}</span>
            </div>
            <p>Reservation #{reservation.id}{meta && ` · ${meta}`}</p>
          </div>
          <div className="rv-total">
            <b>{money(reservation.total_amount)}</b>
            <small>{days} {days === 1 ? 'day' : 'days'} at {money(reservation.daily_rate)}</small>
          </div>
        </div>

        <dl className="rv-facts">
          <div><dt>Pickup</dt><dd>{formatDate(reservation.start_date)}</dd></div>
          <div><dt>Return</dt><dd>{formatDate(reservation.end_date)}</dd></div>
          {showPayment && <div><dt>Payment</dt><dd>{PAYMENT_LABELS[reservation.payment_status] || reservation.payment_status}</dd></div>}
          {reservation.payment_status === 'paid' && reservation.payment_reference && <div><dt>Transaction reference</dt><dd className="rv-ref">{reservation.payment_reference}</dd></div>}
        </dl>

        {step && <p className={`rv-next${step.tone ? ` rv-next-${step.tone}` : ''}`}>{step.text}</p>}

        <div className="rv-actions">
          {canCancel && <button type="button" className="rv-btn-cancel" onClick={() => onCancel(reservation)}>Cancel reservation</button>}
          {reservation.contract_text && <button type="button" className="rv-btn rv-btn-outline" onClick={() => onAgreement(reservation)}>View agreement</button>}
          {payable && <button type="button" className="rv-btn rv-btn-primary" onClick={() => onPay(reservation)}>{payLabel(reservation)}</button>}
        </div>
      </div>
    </article>
  )
}

/**
 * The result shown after returning from checkout. It reads the reservation from the server:
 * the return address only says which reservation to show, never whether the payment worked.
 */
function PaymentResult({ result, reservation, checking, onRefresh, onRetry, onDismiss }) {
  if (!reservation) {
    return checking ? null : (
      <div className="rv-banner rv-banner-bad" role="status">
        We could not find that reservation. Check the list below for its latest payment status.
      </div>
    )
  }

  const paid = reservation.payment_status === 'paid'
  const failed = !paid && (result === 'cancelled' || reservation.payment_status === 'failed')
  const state = paid ? 'paid' : failed ? 'failed' : 'pending'
  const heading = {
    paid: 'Payment successful. Your reservation is confirmed.',
    pending: 'We are verifying your payment',
    failed: 'Payment was not completed',
  }[state]
  const body = {
    paid: 'The payment provider verified your payment and the reservation was confirmed automatically. No further approval is needed.',
    pending: checking
      ? 'Waiting for confirmation from the payment provider. This page updates automatically.'
      : 'Confirmation has not arrived yet. Your reservation is not confirmed until the payment is verified. Check again in a moment.',
    failed: 'No payment was taken for this attempt and the reservation is not confirmed. You can try again.',
  }[state]

  return (
    <section className={`rv-result rv-result-${state}`} role="status" aria-live="polite">
      <h2>{heading}</h2>
      <p>{body}</p>
      <dl className="rv-result-facts">
        <div><dt>Reservation</dt><dd>#{reservation.id} · {reservation.make} {reservation.model}</dd></div>
        <div><dt>Rental dates</dt><dd>{formatDate(reservation.start_date)} to {formatDate(reservation.end_date)}</dd></div>
        <div><dt>{paid ? 'Amount paid' : 'Amount due'}</dt><dd>{money(paid ? reservation.payment_amount ?? reservation.total_amount : reservation.total_amount)}</dd></div>
        <div><dt>Reservation status</dt><dd>{STATUS_LABELS[reservation.status] || reservation.status}</dd></div>
        {paid && <div><dt>Transaction reference</dt><dd className="rv-ref">{reservation.payment_reference || '—'}</dd></div>}
        {paid && <div><dt>Paid on</dt><dd>{formatDateTime(reservation.payment_paid_at)}</dd></div>}
      </dl>
      <div className="rv-actions">
        {state === 'pending' && <button type="button" className="rv-btn rv-btn-outline" disabled={checking} onClick={onRefresh}>{checking ? 'Checking…' : 'Check again'}</button>}
        {state === 'failed' && onRetry && <button type="button" className="rv-btn rv-btn-primary" onClick={onRetry}>Retry payment</button>}
        <button type="button" className="rv-btn rv-btn-outline" onClick={onDismiss}>Close</button>
      </div>
    </section>
  )
}

function ReservationSkeletons() {
  return (
    <div className="rv-list" role="status" aria-label="Loading reservations">
      {SKELETON_CARDS.map((key) => (
        <div className="rv-card rv-skeleton" key={key} aria-hidden="true">
          <div className="rv-photo rv-shimmer" />
          <div className="rv-card-body">
            <span className="rv-shimmer rv-line-title" />
            <span className="rv-shimmer rv-line-meta" />
            <span className="rv-shimmer rv-line-facts" />
            <span className="rv-shimmer rv-line-next" />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function MyReservations({ navigate, view = 'all' }) {
  const [reservations, setReservations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [agreementFor, setAgreementFor] = useState(null)
  const [cancelFor, setCancelFor] = useState(null)
  const [payFor, setPayFor] = useState(null)

  const [params] = useState(() => new URLSearchParams(window.location.search))
  const [paymentResult, setPaymentResult] = useState(() => params.get('payment'))
  const resultId = Number(params.get('reservation')) || null
  const [checking, setChecking] = useState(paymentResult === 'success' && Boolean(resultId))
  const [pollRun, setPollRun] = useState(0)

  const refresh = useCallback(async () => {
    setError('')
    try {
      const results = await getReservations()
      setReservations(results)
      return results
    } catch (requestError) {
      setError(requestError.message)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    getReservations()
      .then((results) => {
        if (!active) return
        setReservations(results)
        // Arriving from a new reservation: open its payment step straight away.
        const payId = Number(params.get('pay'))
        const created = payId ? results.find((item) => Number(item.id) === payId) : null
        if (created && canPay(created, localToday())) setPayFor(created)
      })
      .catch((requestError) => { if (active) setError(requestError.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [params])

  // After checkout, ask the server until the webhook has verified the payment, or stop after a while.
  useEffect(() => {
    if (paymentResult !== 'success' || !resultId) return undefined

    let active = true
    let timer
    let attempts = 0
    const poll = async () => {
      if (!active) return
      const results = await refresh()
      attempts += 1
      const target = results?.find((item) => Number(item.id) === resultId)
      if (!active) return
      if (target?.payment_status === 'paid' || target?.payment_status === 'failed' || attempts >= POLL_ATTEMPTS) {
        setChecking(false)
        return
      }
      timer = window.setTimeout(poll, 3000)
    }
    timer = window.setTimeout(poll, 1500)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [paymentResult, resultId, refresh, pollRun])

  function dismissResult() {
    setPaymentResult(null)
    window.history.replaceState(null, '', window.location.pathname)
  }

  async function confirmCancel() {
    await updateReservationStatus(cancelFor.id, 'cancelled')
    setCancelFor(null)
    setNotice('Reservation cancelled.')
    window.dispatchEvent(new Event('reservations:changed'))
    await refresh()
  }

  async function startPayment() {
    const response = await createPaymentCheckout(payFor.id)
    const checkoutUrl = response?.data?.checkout_url
    if (!checkoutUrl) throw new Error('The payment checkout link was not returned.')
    window.location.assign(checkoutUrl)
  }

  function openDialog(setter) {
    return (reservation) => {
      setNotice('')
      setter(reservation)
    }
  }

  function retry() {
    setLoading(true)
    refresh()
  }

  const today = localToday()
  const visibleReservations = reservations.filter((reservation) => {
    if (view === 'active') {
      return reservation.status === 'confirmed'
        && reservation.start_date <= today
        && reservation.end_date > today
    }
    if (view === 'history') return HISTORY_STATUSES.includes(reservation.status)
    return !HISTORY_STATUSES.includes(reservation.status)
  })
  const resultReservation = resultId ? reservations.find((item) => Number(item.id) === resultId) : null
  const copy = VIEW_COPY[view] || VIEW_COPY.all
  const loadFailed = error && !reservations.length

  return (
    <div className="public-page content-width rv">
      <header className="rv-header">
        <div>
          <span className="rv-eyebrow">Your trips</span>
          <h1>{copy.title}</h1>
          <p>{copy.lede}</p>
        </div>
        <button type="button" className="rv-btn rv-btn-primary" onClick={() => navigate('/users/vehicles')}>Browse vehicles</button>
      </header>

      {paymentResult && resultId && !loading && <PaymentResult
        result={paymentResult}
        reservation={resultReservation}
        checking={checking}
        onRefresh={() => { setChecking(true); setPollRun((run) => run + 1) }}
        onRetry={resultReservation && canPay(resultReservation, today) ? () => openDialog(setPayFor)(resultReservation) : null}
        onDismiss={dismissResult}
      />}
      {paymentResult && !resultId && <div className="rv-banner" role="status">Your payment status is shown on each reservation below. A reservation is confirmed once its payment is verified.</div>}
      {notice && <div className="rv-banner rv-banner-good" role="status">{notice}</div>}
      {error && !loadFailed && <div className="rv-banner rv-banner-bad" role="alert">{error}</div>}

      {loading ? <ReservationSkeletons />
        : loadFailed ? (
          <div className="rv-state" role="alert">
            <h2>We couldn't load your reservations</h2>
            <p>{error}</p>
            <button type="button" className="rv-btn rv-btn-primary" onClick={retry}>Try again</button>
          </div>
        ) : visibleReservations.length ? (
          <div className="rv-list">
            {visibleReservations.map((reservation) => (
              <ReservationCard
                key={reservation.id}
                reservation={reservation}
                today={today}
                navigate={navigate}
                onAgreement={openDialog(setAgreementFor)}
                onPay={openDialog(setPayFor)}
                onCancel={openDialog(setCancelFor)}
              />
            ))}
          </div>
        ) : (
          <div className="rv-state">
            <h2>{copy.emptyTitle}</h2>
            <p>{copy.emptyBody}</p>
            <button type="button" className="rv-btn rv-btn-primary" onClick={() => navigate('/users/vehicles')}>{copy.emptyAction}</button>
          </div>
        )}

      {agreementFor && <AgreementDialog reservation={agreementFor} onClose={() => setAgreementFor(null)} />}
      {cancelFor && <CancelDialog
        reservation={cancelFor}
        dates={`${formatDate(cancelFor.start_date)} to ${formatDate(cancelFor.end_date)}`}
        onConfirm={confirmCancel}
        onClose={() => setCancelFor(null)}
      />}
      {payFor && <PaymentDialog
        reservation={payFor}
        amount={money(payFor.total_amount)}
        onCheckout={startPayment}
        onClose={() => setPayFor(null)}
      />}
    </div>
  )
}
