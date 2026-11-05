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
    lede: 'Track your requests, pay once approved, and keep your agreements in one place.',
    emptyTitle: 'No reservations yet',
    emptyBody: 'Choose a vehicle and dates to request your first reservation.',
    emptyAction: 'Find a vehicle',
  },
  active: {
    title: 'Active rentals',
    lede: 'Approved rentals running today.',
    emptyTitle: 'No active rentals',
    emptyBody: 'Confirmed rentals in progress will appear here.',
    emptyAction: 'Browse vehicles',
  },
  history: {
    title: 'Reservation history',
    lede: 'Your completed, cancelled, and rejected reservations.',
    emptyTitle: 'No reservation history yet',
    emptyBody: 'Completed, cancelled, and rejected reservations will appear here.',
    emptyAction: 'Browse vehicles',
  },
}

const PAYMENT_LABELS = { unpaid: 'Unpaid', pending: 'Being verified', paid: 'Paid', not_required: 'Not required' }

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

function needsPayment(reservation) {
  return reservation.status === 'confirmed' && Number(reservation.payment_required) === 1
}

/** What the customer should expect next, in one sentence. */
function nextStep(reservation) {
  const special = Number(reservation.special_duration_request) === 1
  if (reservation.checked_out_at && !reservation.returned_at && reservation.status === 'confirmed') {
    return { text: `You have this vehicle. Return it by ${formatDate(reservation.end_date)}.` }
  }
  switch (reservation.status) {
    case 'pending':
      return { text: `${special ? 'Special duration request. ' : ''}Waiting for administrator approval. You pay after it is approved.` }
    case 'confirmed':
      if (needsPayment(reservation) && reservation.payment_status === 'unpaid') return { tone: 'attention', text: 'Approved. Pay with GCash to continue. Payment must be verified before vehicle handover.' }
      if (reservation.payment_status === 'pending') return { text: 'Payment submitted. An administrator is verifying it.' }
      return { tone: 'good', text: 'All set. Bring a valid driver license at pickup.' }
    case 'completed':
      return { text: 'Rental completed.' }
    case 'cancelled':
      return { text: 'This reservation was cancelled.' }
    case 'rejected':
      return { text: 'This request was not approved. You can choose other dates or another vehicle.' }
    default:
      return null
  }
}

function ReservationCard({ reservation, navigate, onAgreement, onPay, onCancel }) {
  const name = `${reservation.make} ${reservation.model}`
  const meta = [reservation.year, reservation.category, reservation.variant_color].filter(Boolean).join(' · ')
  const days = Number(reservation.rental_days)
  const step = nextStep(reservation)
  const showPayment = ['pending', 'confirmed', 'completed'].includes(reservation.status) && Number(reservation.payment_required) === 1
  const canPay = needsPayment(reservation) && reservation.payment_status === 'unpaid'
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
              <span className={`rv-status rv-status-${reservation.status}`}>{reservation.status}</span>
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
          {showPayment && <div><dt>GCash payment</dt><dd>{PAYMENT_LABELS[reservation.payment_status] || reservation.payment_status}</dd></div>}
        </dl>

        {step && <p className={`rv-next${step.tone ? ` rv-next-${step.tone}` : ''}`}>{step.text}</p>}

        <div className="rv-actions">
          {canCancel && <button type="button" className="rv-btn-cancel" onClick={() => onCancel(reservation)}>Cancel reservation</button>}
          {reservation.contract_text && <button type="button" className="rv-btn rv-btn-outline" onClick={() => onAgreement(reservation)}>View agreement</button>}
          {canPay && <button type="button" className="rv-btn rv-btn-primary" onClick={() => onPay(reservation)}>Pay with GCash</button>}
        </div>
      </div>
    </article>
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

  async function confirmCancel() {
    await updateReservationStatus(cancelFor.id, 'cancelled')
    setCancelFor(null)
    setNotice('Reservation cancelled.')
    await refresh()
  }

  async function startPayment() {
    const response = await createPaymentCheckout(payFor.id)
    const checkoutUrl = response?.data?.checkout_url
    if (!checkoutUrl) throw new Error('The online GCash checkout link was not returned.')
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
    if (view === 'history') {
      return ['completed', 'cancelled', 'rejected'].includes(reservation.status)
    }
    return true
  })
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

      {paymentResult === 'success' && <div className="rv-banner rv-banner-good" role="status">Payment submitted. The reservation will update after Xendit confirms the GCash payment. <button type="button" className="rv-btn-link" onClick={refresh}>Refresh payment status</button></div>}
      {paymentResult === 'cancelled' && <div className="rv-banner rv-banner-bad" role="status">Payment was not completed. You can try GCash checkout again when your reservation is approved.</div>}
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
