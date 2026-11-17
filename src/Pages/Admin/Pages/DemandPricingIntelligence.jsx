import { useEffect, useRef, useState } from 'react'
import { api } from '../../../Services/API/api.js'
import './DemandIntelligence.css'

/*
 * Demand Intelligence: rental demand from the reservations only (GET /api/reservations/demand, the same summary the
 * assistant's demand.summary retrieval uses). History is shown as recorded; a forecast appears only once there are
 * enough months of bookings. Green is recorded demand, amber is days already booked ahead.
 */
const COLORS = { past: '#2b8a63', ahead: '#e0913a', grid: '#f0efe9', axis: '#9aa19c', ink: '#1f2a27' }
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const RANGES = [6, 12, 24]

const monthLabel = (month) => new Intl.DateTimeFormat('en-PH', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`))
const shortMonth = (month) => new Intl.DateTimeFormat('en-PH', { month: 'short', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`))
const longMonth = (month) => new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`))
const money = (value) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(Number(value || 0))
const pct = (value) => `${Math.max(0, Math.min(100, Math.round(value)))}%`
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

function useBarChart(canvasRef, config, deps) {
  useEffect(() => {
    let chart
    let cancelled = false
    import('chart.js').then(({ Chart, BarController, BarElement, CategoryScale, LinearScale, Tooltip }) => {
      if (cancelled || !canvasRef.current) return
      Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip)
      Chart.defaults.font.family = "'Outfit', 'Segoe UI', Arial, sans-serif"
      Chart.defaults.color = COLORS.axis
      chart = new Chart(canvasRef.current, config())
    })
    return () => {
      cancelled = true
      chart?.destroy()
    }
    // The data dependencies decide when to redraw; config is rebuilt each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

/* ------------------------------------------------------------------ Pieces */

function RangeSwitch({ value, onChange }) {
  return (
    <div className="di-range" role="radiogroup" aria-label="History range">
      {RANGES.map((range) => (
        <button key={range} type="button" role="radio" aria-checked={value === range} className={value === range ? 'is-on' : ''} onClick={() => onChange(range)}>
          {range}M
        </button>
      ))}
    </div>
  )
}

function Meter({ value, tone = 'past' }) {
  return <span className={`di-meter is-${tone}`} aria-hidden="true"><i style={{ '--w': pct(value) }} /></span>
}

/** Lead card: booked days ahead, with how full the fleet already is over 30, 60 and 90 days. */
function AheadCard({ books, fleet }) {
  const horizons = [[30, books.next_30_days || 0], [60, books.next_60_days || 0], [90, books.next_90_days || 0]]
  return (
    <section className="di-card di-ahead" style={{ '--i': 0 }}>
      <span className="di-label">Booked ahead · 30 days</span>
      <div className="di-hero-value"><b>{books.next_30_days || 0}</b><span>days</span></div>
      <ul className="di-horizons">
        {horizons.map(([days, booked]) => {
          const load = fleet ? (booked / (fleet * days)) * 100 : 0
          return (
            <li key={days}>
              <span>{days}d</span>
              <Meter value={load} tone="ahead" />
              <b>{booked}</b>
              <small>{pct(load)}</small>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function Stat({ label, value, unit, note, index }) {
  return (
    <section className="di-card di-stat" style={{ '--i': index }}>
      <span className="di-label">{label}</span>
      <div className="di-stat-value"><b>{value}</b>{unit && <span>{unit}</span>}</div>
      {note && <small>{note}</small>}
    </section>
  )
}

function MonthlyChart({ months }) {
  const canvasRef = useRef(null)
  const [view, setView] = useState('chart')
  const past = months.filter((m) => !m.future)
  const totalDays = past.reduce((sum, m) => sum + Number(m.booked_days || 0), 0)
  const totalBookings = past.reduce((sum, m) => sum + Number(m.bookings || 0), 0)

  useBarChart(canvasRef, () => ({
    type: 'bar',
    data: {
      labels: months.map((m) => monthLabel(m.month)),
      datasets: [
        { label: 'Booked', data: months.map((m) => (m.future ? 0 : m.booked_days)), backgroundColor: COLORS.past, hoverBackgroundColor: '#237553' },
        { label: 'Ahead', data: months.map((m) => (m.future ? m.booked_days : 0)), backgroundColor: COLORS.ahead, hoverBackgroundColor: '#c97d2c' },
      ].map((set) => ({ ...set, borderRadius: 6, borderSkipped: false, maxBarThickness: 28, categoryPercentage: 0.62 })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: reducedMotion() ? false : { duration: 700, easing: 'easeOutQuart' },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: COLORS.ink, padding: 10, cornerRadius: 8, displayColors: false,
          filter: (item) => item.raw > 0,
          callbacks: { label: (item) => `${item.dataset.label}: ${item.raw} days` },
        },
      },
      scales: {
        x: { stacked: true, grid: { display: false }, border: { display: false }, ticks: { maxRotation: 0, autoSkip: true, font: { size: 11 } } },
        y: { stacked: true, beginAtZero: true, grid: { color: COLORS.grid }, border: { display: false }, ticks: { precision: 0, maxTicksLimit: 5, font: { size: 11 } } },
      },
    },
  }), [months, view])

  return (
    <section className="di-card di-monthly" style={{ '--i': 4 }}>
      <header className="di-card-head">
        <div>
          <h2>Booked days</h2>
          <p className="di-sub"><b>{totalDays}</b> days · <b>{totalBookings}</b> bookings</p>
        </div>
        <div className="di-card-tools">
          <ul className="di-legend">
            <li><i style={{ background: COLORS.past }} aria-hidden="true" />Booked</li>
            <li><i style={{ background: COLORS.ahead }} aria-hidden="true" />Ahead</li>
          </ul>
          <div className="di-range is-small" role="radiogroup" aria-label="View">
            {['chart', 'table'].map((key) => (
              <button key={key} type="button" role="radio" aria-checked={view === key} className={view === key ? 'is-on' : ''} onClick={() => setView(key)}>
                {key === 'chart' ? 'Chart' : 'Table'}
              </button>
            ))}
          </div>
        </div>
      </header>
      {view === 'table' ? (
        <div className="di-table-wrap">
          <table className="di-table">
            <thead><tr><th>Month</th><th>Days</th><th>Bookings</th><th>Value</th><th>Cancelled</th><th>Expired</th></tr></thead>
            <tbody>{months.map((m) => (
              <tr key={m.month} className={m.future ? 'is-future' : ''}>
                <td>{longMonth(m.month)}{m.future && <span className="di-tag">Ahead</span>}</td>
                <td>{m.booked_days}</td><td>{m.bookings}</td><td>{money(m.booked_value)}</td><td>{m.cancelled}</td><td>{m.expired}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <div className="di-chart"><canvas ref={canvasRef} role="img" aria-label="Booked days per month" /></div>}
    </section>
  )
}

function Forecast({ data }) {
  if (!data.forecast) {
    const have = data.history_months || 0
    const need = data.forecast_min_months || 1
    return (
      <section className="di-card di-forecast is-locked" style={{ '--i': 5 }}>
        <header className="di-card-head"><h2>Forecast</h2><span className="di-tag">Locked</span></header>
        <div className="di-unlock">
          <div className="di-unlock-count"><b>{have}</b><span>/ {need} months</span></div>
          <Meter value={(have / need) * 100} />
          <small>Needs {need} months of bookings.</small>
        </div>
      </section>
    )
  }
  const peak = Math.max(...data.forecast.map((f) => Number(f.high) || 0), 1)
  return (
    <section className="di-card di-forecast" style={{ '--i': 5 }}>
      <header className="di-card-head"><h2>Forecast</h2><span className="di-tag">Next 3 months</span></header>
      <ol className="di-forecast-list">
        {data.forecast.map((f) => (
          <li key={f.month} title={`From ${f.basis}`}>
            <span className="di-label">{shortMonth(f.month)}</span>
            <div className="di-stat-value"><b>{f.expected_booked_days}</b><span>days</span></div>
            {/* Range band with the already-booked share filled in. */}
            <span className="di-band" aria-hidden="true">
              <i className="di-band-range" style={{ left: pct((f.low / peak) * 100), width: pct(((f.high - f.low) / peak) * 100) }} />
              <i className="di-band-booked" style={{ width: pct((f.already_booked / peak) * 100) }} />
            </span>
            <small>{f.low}–{f.high} · {f.already_booked} booked</small>
          </li>
        ))}
      </ol>
    </section>
  )
}

function Weekdays({ counts }) {
  const values = WEEKDAYS.map((day) => Number(counts[day] || 0))
  const max = Math.max(...values)
  return (
    <section className="di-card di-weekdays" style={{ '--i': 6 }}>
      <header className="di-card-head">
        <h2>Pickups</h2>
        {max > 0 && <span className="di-tag is-accent">{WEEKDAYS[values.indexOf(max)]}</span>}
      </header>
      {max === 0 ? <p className="di-empty">No pickups yet.</p> : (
        <ol className="di-columns">
          {WEEKDAYS.map((day, index) => (
            <li key={day} className={values[index] === max ? 'is-peak' : ''} title={`${day}: ${values[index]}`}>
              <b>{values[index]}</b>
              <span className="di-column"><i style={{ '--h': pct((values[index] / max) * 100) }} /></span>
              <span>{day.slice(0, 1)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function Utilisation({ categories }) {
  return (
    <section className="di-card di-util" style={{ '--i': 7 }}>
      <header className="di-card-head"><h2>Utilisation</h2><span className="di-tag">90 days</span></header>
      {categories.length === 0 ? <p className="di-empty">No categories yet.</p> : (
        <ul className="di-util-list">
          {categories.map((c) => (
            <li key={c.category} title={`${c.booked_days_last_90} booked days · ${c.vehicles} vehicles`}>
              <span className="di-util-name">{c.category}<small>{c.vehicles}</small></span>
              <Meter value={c.utilization_percent || 0} />
              <b>{c.utilization_percent == null ? '—' : `${c.utilization_percent}%`}</b>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Skeleton() {
  return (
    <div className="di-skeleton" role="status" aria-label="Loading demand">
      <div className="di-bento"><span className="is-tall" /><span /><span /><span /></div>
      <span className="is-chart" />
    </div>
  )
}

/* ------------------------------------------------------------------ Page */

export default function DemandPricingIntelligence() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [months, setMonths] = useState(12)

  useEffect(() => {
    let active = true
    api.get(`/api/reservations/demand?months=${months}`)
      .then((response) => { if (active) { setData(response?.data || null); setError('') } })
      .catch((requestError) => { if (active) setError(requestError.message) })
    return () => { active = false }
  }, [months])

  const header = (
    <header className="di-head">
      <h1>Demand Intelligence</h1>
      <RangeSwitch value={months} onChange={(range) => { if (range !== months) { setData(null); setMonths(range) } }} />
    </header>
  )

  if (error) return <div className="admin-content maintenance-page di-page">{header}<div className="global-error" role="alert">{error}</div></div>
  if (!data) return <div className="admin-content maintenance-page di-page">{header}<Skeleton /></div>

  const books = data.on_the_books || {}
  const hasBookings = data.by_month.some((m) => m.bookings || m.booked_days)
  const lead = data.lead_time_days
  return (
    <div className="admin-content maintenance-page di-page">
      {header}

      <div className="di-bento">
        <AheadCard books={books} fleet={data.fleet_size} />
        <Stat index={1} label="Lead time" value={lead ? lead.median : '—'} unit={lead ? 'days' : ''} note={lead ? `${lead.bookings} bookings` : null} />
        <Stat index={2} label="Cancelled" value={data.cancellation_rate_percent == null ? '—' : `${data.cancellation_rate_percent}%`} note={data.expiry_rate_percent == null ? null : `${data.expiry_rate_percent}% expired`} />
        <Stat index={3} label="History" value={data.history_months} unit={data.history_months === 1 ? 'month' : 'months'} note={`${data.fleet_size} vehicles`} />
      </div>

      {!hasBookings && <p className="di-notice" role="status">No bookings in this period.</p>}

      <MonthlyChart months={data.by_month} />

      <div className="di-lower">
        <Forecast data={data} />
        <Weekdays counts={data.pickups_by_weekday || {}} />
        <Utilisation categories={data.by_category || []} />
      </div>
    </div>
  )
}
