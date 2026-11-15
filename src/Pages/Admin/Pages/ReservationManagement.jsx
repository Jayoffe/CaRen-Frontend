import { useCallback, useEffect, useMemo, useState } from 'react'
import { getReservations, updateReservationStatus, updateVehicleUse } from '../../../Services/API/reservationAPI.js'
import './ReservationManagement.css'

function money(value) {
  const amount = Number(value || 0)
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: amount % 1 ? 2 : 0 }).format(amount)
}

// Reservations are confirmed only by a verified payment, so the only status change left here is cancelling.
const STATUS_LABELS = { pending: 'Pending payment', confirmed: 'Confirmed', cancelled: 'Cancelled', rejected: 'Rejected', completed: 'Completed' }
const PAYMENT_LABELS = { paid: 'Paid', pending: 'Pending', failed: 'Failed', unpaid: 'Not paid', not_required: 'Not required' }
const ACTIVE_STATUSES = ['pending', 'confirmed']
const HISTORY_STATUSES = ['completed', 'cancelled', 'rejected']

function localToday() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

/** Whole days from ISO date a to ISO date b (both YYYY-MM-DD). */
function daysBetween(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000)
}

function shortDate(value, withYear = false) {
  if (!value) return '—'
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}) }).format(date)
}

const needsRefund = (reservation) => reservation.payment_status === 'paid' && ['cancelled', 'rejected'].includes(reservation.status)

/** Where a current reservation stands today, for the trip column. Null when nothing time-based applies. */
function timing(reservation, today) {
  if (reservation.status !== 'confirmed') return null
  if (reservation.checked_out_at) {
    if (reservation.end_date < today) return { tone: 'red', label: `Return overdue · ${daysBetween(reservation.end_date, today)}d` }
    if (reservation.end_date === today) return { tone: 'amber', label: 'Due back today' }
    return { tone: 'teal', label: `In use · back ${shortDate(reservation.end_date)}` }
  }
  if (reservation.start_date === today) return { tone: 'green', label: 'Pickup today' }
  if (reservation.start_date > today) {
    const days = daysBetween(today, reservation.start_date)
    return { tone: 'blue', label: days === 1 ? 'Starts tomorrow' : `Starts in ${days} days` }
  }
  if (reservation.end_date > today) return { tone: 'green', label: 'Ready for check-out' }
  return { tone: 'grey', label: 'Pickup date passed' }
}

function Icon({ name, size = 18 }) {
  const shapes = {
    key: <><circle cx="8" cy="15" r="5" /><path d="m11.5 11.5 8-8M16 7l2 2m-5 1 2 2" /></>,
    car: <><path d="m5 11 1.6-4.5A2.2 2.2 0 0 1 8.7 5h6.6a2.2 2.2 0 0 1 2.1 1.5L19 11" /><path d="M3 11h18v7H3zM6 18v2m12-2v2" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    alert: <><circle cx="12" cy="12" r="9" /><path d="M12 8v5m0 3h.01" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    x: <path d="m6 6 12 12M18 6 6 18" />,
    refund: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m16.5 16.5 4 4" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    return: <><path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[name]}</svg>
}

function Stat({ icon, tone = '', label, value, note, onClick, active }) {
  const content = <>
    <span className={`rsv-stat-icon ${tone}`}><Icon name={icon} size={19} /></span>
    <span className="rsv-stat-label">{label}</span>
    <strong>{value}</strong>
    <small>{note}</small>
  </>
  return onClick
    ? <button type="button" className={`rsv-stat is-action${active ? ' is-active' : ''}`} onClick={onClick}>{content}</button>
    : <article className="rsv-stat">{content}</article>
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
      window.dispatchEvent(new Event('reservations:changed'))
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

  const viewStatuses = historyView ? HISTORY_STATUSES : ACTIVE_STATUSES
  const inView = useMemo(() => reservations.filter((reservation) => viewStatuses.includes(reservation.status)), [reservations, viewStatuses])
  const activeFilter = viewStatuses.includes(statusFilter) || ['pickup', 'out', 'overdue', 'refund'].includes(statusFilter) ? statusFilter : 'all'

  const stats = useMemo(() => {
    const counts = { all: inView.length }
    viewStatuses.forEach((status) => { counts[status] = inView.filter((item) => item.status === status).length })
    const out = inView.filter((item) => item.status === 'confirmed' && item.checked_out_at)
    return {
      counts,
      pickupsToday: inView.filter((item) => item.status === 'confirmed' && !item.checked_out_at && item.start_date <= today && item.end_date > today).length,
      out: out.length,
      overdue: out.filter((item) => item.end_date < today).length,
      dueToday: out.filter((item) => item.end_date === today).length,
      refunds: inView.filter(needsRefund).length,
      refundAmount: inView.filter(needsRefund).reduce((sum, item) => sum + Number(item.total_amount || 0), 0),
      pendingValue: inView.filter((item) => item.status === 'pending').reduce((sum, item) => sum + Number(item.total_amount || 0), 0),
      completedValue: inView.filter((item) => item.status === 'completed').reduce((sum, item) => sum + Number(item.total_amount || 0), 0),
    }
  }, [inView, viewStatuses, today])

  const matchesQuick = (reservation) => {
    if (activeFilter === 'pickup') return reservation.status === 'confirmed' && !reservation.checked_out_at && reservation.start_date <= today && reservation.end_date > today
    if (activeFilter === 'out') return reservation.status === 'confirmed' && Boolean(reservation.checked_out_at)
    if (activeFilter === 'overdue') return reservation.status === 'confirmed' && reservation.checked_out_at && reservation.end_date < today
    if (activeFilter === 'refund') return needsRefund(reservation)
    return activeFilter === 'all' || reservation.status === activeFilter
  }

  const searchTerm = search.trim().toLowerCase()
  const visibleReservations = inView.filter((reservation) => (
    matchesQuick(reservation)
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
  const toggle = (value) => setStatusFilter(activeFilter === value ? 'all' : value)

  return (
    <div className="admin-content rsv-page">
      <header className="rsv-header">
        <span className="rsv-eyebrow">{historyView ? 'RECORDS' : 'BOOKING OPERATIONS'}</span>
        <h1>{historyView ? 'Reservation History' : 'Reservations'}</h1>
        <p>{historyView ? 'Completed and cancelled reservations, with their payment details.' : 'Current reservations. A reservation is confirmed automatically once its payment is verified.'}</p>
      </header>

      <section className="rsv-stats" aria-label="Reservation summary">
        {historyView ? <>
          <Stat icon="check" label="Completed" value={loading ? '—' : stats.counts.completed} note={`${money(stats.completedValue)} in completed rentals`} />
          <Stat icon="x" tone="is-grey" label="Cancelled" value={loading ? '—' : stats.counts.cancelled} note="Kept for the record" />
          <Stat icon="alert" tone="is-red" label="Rejected" value={loading ? '—' : stats.counts.rejected} note="Not approved" />
          <Stat icon="refund" tone="is-red" label="Refunds needed" value={loading ? '—' : stats.refunds} note={stats.refunds ? `${money(stats.refundAmount)} paid, then cancelled` : 'All clear'} onClick={stats.refunds ? () => toggle('refund') : undefined} active={activeFilter === 'refund'} />
        </> : <>
          <Stat icon="key" tone="is-green" label="Ready for check-out" value={loading ? '—' : stats.pickupsToday} note={stats.pickupsToday ? 'Paid and within the rental dates' : 'No handovers waiting'} onClick={stats.pickupsToday ? () => toggle('pickup') : undefined} active={activeFilter === 'pickup'} />
          <Stat icon="car" tone="is-teal" label="Vehicles out" value={loading ? '—' : stats.out} note={stats.dueToday ? `${stats.dueToday} due back today` : 'Currently with customers'} onClick={stats.out ? () => toggle('out') : undefined} active={activeFilter === 'out'} />
          <Stat icon="alert" tone="is-red" label="Overdue returns" value={loading ? '—' : stats.overdue} note={stats.overdue ? 'Past their return date' : 'Nothing overdue'} onClick={stats.overdue ? () => toggle('overdue') : undefined} active={activeFilter === 'overdue'} />
          <Stat icon="clock" tone="is-amber" label="Awaiting payment" value={loading ? '—' : stats.counts.pending} note={stats.counts.pending ? `${money(stats.pendingValue)} not yet paid` : 'All paid'} onClick={stats.counts.pending ? () => toggle('pending') : undefined} active={activeFilter === 'pending'} />
        </>}
      </section>

      <section className="rsv-panel" aria-label={historyView ? 'Reservation records' : 'Current reservations'}>
        <div className="rsv-toolbar">
          <div className="rsv-tabs" role="tablist" aria-label="Filter by status">
            {['all', ...viewStatuses].map((status) => (
              <button key={status} type="button" role="tab" aria-selected={activeFilter === status} className={activeFilter === status ? 'active' : ''} onClick={() => setStatusFilter(status)}>
                {status === 'all' ? 'All' : STATUS_LABELS[status]}<span>{stats.counts[status] ?? 0}</span>
              </button>
            ))}
            {!['all', ...viewStatuses].includes(activeFilter) && (
              <button type="button" role="tab" aria-selected="true" className="active is-quick" onClick={() => setStatusFilter('all')}>
                {{ pickup: 'Ready for check-out', out: 'Vehicles out', overdue: 'Overdue returns', refund: 'Refunds needed' }[activeFilter]}<Icon name="x" size={13} />
              </button>
            )}
          </div>
          <label className="rsv-search">
            <Icon name="search" size={17} />
            <span className="rsv-sr">Search reservations</span>
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Customer, vehicle or reference" />
          </label>
        </div>

        {error && <div className="global-error" role="alert">{error}</div>}
        {loading ? (
          <div className="rsv-loading" aria-busy="true" aria-label="Loading reservations">{[0, 1, 2].map((key) => <span key={key} />)}</div>
        ) : visibleReservations.length ? (
          <>
            <div className="rsv-table-wrap">
              <table className="rsv-table">
                <thead><tr><th>Reservation</th><th>Customer</th><th>Vehicle</th><th>Trip</th><th className="is-num">Total</th><th>Payment</th><th>Status</th>{!historyView && <th>Actions</th>}</tr></thead>
                <tbody>{visibleReservations.map((reservation) => {
                  const when = historyView ? null : timing(reservation, today)
                  const name = reservation.full_name || reservation.username || 'Customer'
                  const refund = needsRefund(reservation)
                  const busy = updatingId === reservation.id
                  const canCancel = !reservation.checked_out_at && reservation.payment_status !== 'paid'
                  const canReturn = reservation.status === 'confirmed' && reservation.checked_out_at
                  const canCheckout = reservation.status === 'confirmed' && !reservation.checked_out_at
                    && ['paid', 'not_required'].includes(reservation.payment_status)
                    && reservation.start_date <= today && reservation.end_date > today
                  const waitingForPickup = reservation.status === 'confirmed' && !reservation.checked_out_at && reservation.start_date > today
                  return (
                    <tr key={reservation.id} className={`${when?.tone === 'red' || refund ? 'is-alert' : ''}`}>
                      <td>
                        <b className="rsv-id">#{reservation.id}</b>
                        {Number(reservation.special_duration_request) === 1 && <span className="rsv-tag tone-violet">Special duration</span>}
                      </td>
                      <td>
                        <div className="rsv-customer">
                          <span className="rsv-avatar" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>
                          <div><b>{name}</b><small>{reservation.email}</small></div>
                        </div>
                      </td>
                      <td>
                        <b>{reservation.make} {reservation.model}</b>
                        <div className="rsv-vehicle-meta">
                          {reservation.variant_color && <small>{reservation.variant_color}</small>}
                          {reservation.plate_number && <small className="rsv-plate">{reservation.plate_number}</small>}
                        </div>
                      </td>
                      <td>
                        <b className="rsv-trip">{shortDate(reservation.start_date)} <Icon name="arrow" size={13} /> {shortDate(reservation.end_date, true)}</b>
                        <small>{reservation.rental_days} day{Number(reservation.rental_days) === 1 ? '' : 's'}</small>
                        {when && <span className={`rsv-tag tone-${when.tone}`}>{when.label}</span>}
                      </td>
                      <td className="is-num"><b className="rsv-amount">{money(reservation.total_amount)}</b></td>
                      <td>
                        <span className={`rsv-pay is-${reservation.payment_status}`}><i />{PAYMENT_LABELS[reservation.payment_status] || reservation.payment_status}</span>
                        {reservation.payment_reference && <small className="rsv-ref" title={reservation.payment_reference}>{reservation.payment_reference}</small>}
                        {refund && <small className="rsv-refund"><Icon name="refund" size={13} /> Refund needed</small>}
                      </td>
                      <td>
                        <span className={`status-pill status-${reservation.status}`}><i />{STATUS_LABELS[reservation.status] || reservation.status}</span>
                        {reservation.checked_out_at && reservation.status === 'confirmed' && <span className="rsv-tag tone-teal">Vehicle out</span>}
                      </td>
                      {!historyView && (
                        <td>
                          <div className="rsv-actions">
                            {canCheckout && (
                              <button type="button" className="rsv-btn is-primary" disabled={busy} onClick={() => updateUse(reservation.id, 'checkout')}>
                                <Icon name="key" size={15} />{busy ? 'Saving…' : 'Check out vehicle'}
                              </button>
                            )}
                            {canReturn && (
                              <button type="button" className="rsv-btn is-primary" disabled={busy} onClick={() => updateUse(reservation.id, 'return')}>
                                <Icon name="return" size={15} />{busy ? 'Saving…' : 'Mark returned'}
                              </button>
                            )}
                            {canCancel && (
                              <button type="button" className="rsv-btn is-danger" disabled={busy} onClick={() => updateStatus(reservation.id, 'cancelled')}>
                                {busy ? 'Saving…' : 'Cancel'}
                              </button>
                            )}
                            {!canCheckout && !canReturn && !canCancel && (
                              <span className="rsv-no-action">{waitingForPickup ? `Check-out opens ${shortDate(reservation.start_date)}` : 'No action needed'}</span>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}</tbody>
              </table>
            </div>
            <footer className="rsv-foot">
              <span>Showing <b>{visibleReservations.length}</b> of {inView.length} reservation{inView.length === 1 ? '' : 's'}</span>
              {!historyView && <span>Pickup and return dates are compared with today, {shortDate(today, true)}.</span>}
            </footer>
          </>
        ) : !error && (
          <div className="rsv-empty" role="status">
            <span className="rsv-stat-icon is-green"><Icon name="calendar" size={22} /></span>
            <h3>{inView.length ? 'No reservations match these filters' : 'No reservations found'}</h3>
            <p>{inView.length ? 'Change the status or search to see more.' : historyView ? 'Completed and cancelled reservations will appear here.' : 'New customer reservations will appear here.'}</p>
            {inView.length > 0 && <button type="button" onClick={() => { setStatusFilter('all'); setSearch('') }}>Clear filters</button>}
          </div>
        )}
      </section>
    </div>
  )
}
