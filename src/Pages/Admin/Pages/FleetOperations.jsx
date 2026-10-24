import { useEffect, useMemo, useState } from 'react'
import { api } from '../../../Services/API/api.js'

function localToday() {
	const now = new Date()
	return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

function FleetStatus({ status }) {
	return <span className={`status-pill status-${status}`}><i />{status}</span>
}

export default function FleetOperations({ navigate }) {
	const [cars, setCars] = useState([])
	const [reservations, setReservations] = useState([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState('')
	const today = useMemo(() => localToday(), [])

	useEffect(() => {
		let active = true
		Promise.all([
			api.get('/api/cars?per_page=100'),
			api.get('/api/reservations'),
		])
			.then(([carsResponse, reservationsResponse]) => {
				if (!active) return
				setCars(carsResponse?.data || [])
				setReservations(reservationsResponse?.data || [])
			})
			.catch((requestError) => {
				if (active) setError(requestError.message)
			})
			.finally(() => {
				if (active) setLoading(false)
			})
		return () => { active = false }
	}, [])

	const upcoming = reservations.filter((item) => (
		['pending', 'confirmed'].includes(item.status) && item.start_date > today
	))
	const overdue = reservations.filter((item) => (
		item.status === 'confirmed' && item.end_date < today
	))
	return <div className="admin-content maintenance-page">
		<header className="maintenance-page-heading">
			<div><span className="eyebrow">FLEET OPERATIONS</span><h1>Fleet Operations</h1><p>Monitor vehicle availability and real reservation pickup and return dates.</p></div>
			<div className="maintenance-heading-actions">
				<button className="button button-outline" onClick={() => navigate('/admin/maintenance/records')}>Maintenance records</button>
				<button className="button button-primary" onClick={() => navigate('/admin/reservations')}>Manage reservations</button>
			</div>
		</header>

		{error && <div className="error-message" role="alert">{error}</div>}
		{loading ? <div className="loading-state">Loading fleet operations…</div> : !error && <>
			<section className="maintenance-panel">
				<div className="maintenance-panel-heading"><div><span className="eyebrow">RESERVATION MONITOR</span><h2>Upcoming pickups and overdue returns</h2></div><span className="maintenance-count">{upcoming.length + overdue.length} reservations</span></div>
				{upcoming.length || overdue.length ? <div className="maintenance-table-wrap"><table className="maintenance-table"><thead><tr><th>Customer</th><th>Vehicle</th><th>Pickup</th><th>Return</th><th>Status</th></tr></thead><tbody>
					{[...overdue, ...upcoming].map((item) => <tr key={item.id}><td>{item.full_name || item.username || `Customer #${item.user_id}`}</td><td>{item.make} {item.model}</td><td>{item.start_date}</td><td>{item.end_date}</td><td><FleetStatus status={overdue.includes(item) ? 'overdue' : item.status} /></td></tr>)}
				</tbody></table></div> : <div className="maintenance-empty">No upcoming or overdue reservations in the current database records.</div>}
			</section>

			<section className="maintenance-panel">
				<div className="maintenance-panel-heading"><div><span className="eyebrow">CURRENT FLEET</span><h2>Vehicle status</h2></div><span className="maintenance-count">{cars.length} vehicles</span></div>
				{cars.length ? <div className="maintenance-table-wrap"><table className="maintenance-table"><thead><tr><th>Vehicle</th><th>Category</th><th>Plate</th><th>Daily rate</th><th>Status</th></tr></thead><tbody>
					{cars.map((car) => <tr key={car.id}><td><strong>{car.make} {car.model}</strong><small>{car.year}</small></td><td>{car.category}</td><td>{car.plate_number || '—'}</td><td>₱{Number(car.daily_rental_price).toLocaleString('en-PH')}</td><td><FleetStatus status={car.status} /></td></tr>)}
				</tbody></table></div> : <div className="maintenance-empty">No vehicles are present in the fleet.</div>}
				<p className="maintenance-demo-note">Service schedules, mileage tracking, and maintenance forecasts are managed from the maintenance workspace.</p>
			</section>
		</>}
	</div>
}
