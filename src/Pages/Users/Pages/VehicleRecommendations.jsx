import { useEffect, useMemo, useState } from 'react'
import { api, imageUrl } from '../../../Services/API/api.js'

const INITIAL_PREFERENCES = {
	purpose: 'Personal Travel',
	category: '',
	passengers: '2',
	minBudget: '',
	maxBudget: '',
	pickupDate: '',
	returnDate: '',
	transmission: '',
	fuel: '',
	feature: '',
}

function localDateString() {
	const now = new Date()
	return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

function carPhoto(car) {
	const path = car?.primary_image || car?.images?.[0]?.image_path
	return path ? imageUrl(path) : ''
}

function money(value) {
	const amount = Number(value || 0)
	return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: amount % 1 ? 2 : 0 }).format(amount)
}

function featuresFor(car) {
	let extras = car?.additional_features || []
	if (typeof extras === 'string') {
		try { extras = JSON.parse(extras) } catch { extras = extras.split(',').map((item) => item.trim()) }
	}
	const features = Array.isArray(extras) ? [...extras] : []
	if (Number(car?.air_conditioning)) features.unshift('Air conditioning')
	if (Number(car?.gps_navigation)) features.unshift('GPS navigation')
	return [...new Set(features.filter(Boolean))]
}

function reasonsFor(car, preferences) {
	const reasons = []
	if (Number(car.seating_capacity || 0) >= Number(preferences.passengers)) reasons.push(`Seats ${preferences.passengers} passengers`)
	if (preferences.category && car.category === preferences.category) reasons.push(`Matches ${preferences.category} category`)
	const price = Number(car.daily_rental_price || 0)
	if ((!preferences.minBudget || price >= Number(preferences.minBudget)) && (!preferences.maxBudget || price <= Number(preferences.maxBudget))) reasons.push('Fits your daily budget')
	if (preferences.transmission && car.transmission === preferences.transmission) reasons.push(`Matches ${preferences.transmission} transmission`)
	if (preferences.fuel && car.fuel_type === preferences.fuel) reasons.push(`Matches ${preferences.fuel} fuel preference`)
	if (preferences.feature && featuresFor(car).includes(preferences.feature)) reasons.push(`Includes ${preferences.feature}`)
	if (preferences.purpose === 'Family Trip' && Number(car.seating_capacity || 0) >= 5) reasons.push('Suitable for a family trip')
	if (preferences.purpose === 'Business' && ['Sedan', 'SUV'].includes(car.category)) reasons.push('Suitable for business travel')
	if (!reasons.length) reasons.push('Available to explore in the current fleet')
	return reasons.slice(0, 3)
}

function scoreCar(car, preferences) {
	return reasonsFor(car, preferences).length * 10 - Number(car.daily_rental_price || 0) / 10000
}

export default function VehicleRecommendations({ navigate }) {
	const [cars, setCars] = useState([])
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState('')
	const [preferences, setPreferences] = useState(INITIAL_PREFERENCES)
	const [submittedPreferences, setSubmittedPreferences] = useState(null)
	const [formError, setFormError] = useState('')
	const [checkingAvailability, setCheckingAvailability] = useState(false)

	useEffect(() => {
		let active = true
		api.get('/api/cars/available?per_page=100')
			.then((response) => { if (active) setCars(response?.data || []) })
			.catch((requestError) => { if (active) setError(requestError.message) })
			.finally(() => { if (active) setLoading(false) })
		return () => { active = false }
	}, [])

	const categories = useMemo(() => [...new Set(cars.map((car) => car.category).filter(Boolean))].sort(), [cars])
	const transmissions = useMemo(() => [...new Set(cars.map((car) => car.transmission).filter(Boolean))].sort(), [cars])
	const fuels = useMemo(() => [...new Set(cars.map((car) => car.fuel_type).filter(Boolean))].sort(), [cars])
	const features = useMemo(() => [...new Set(cars.flatMap(featuresFor))].sort(), [cars])
	const recommendations = useMemo(() => {
		if (!submittedPreferences) return []
		const matched = cars.filter((car) => {
			const price = Number(car.daily_rental_price || 0)
			return Number(car.seating_capacity || 0) >= Number(submittedPreferences.passengers)
				&& (!submittedPreferences.category || car.category === submittedPreferences.category)
				&& (!submittedPreferences.minBudget || price >= Number(submittedPreferences.minBudget))
				&& (!submittedPreferences.maxBudget || price <= Number(submittedPreferences.maxBudget))
				&& (!submittedPreferences.transmission || car.transmission === submittedPreferences.transmission)
				&& (!submittedPreferences.fuel || car.fuel_type === submittedPreferences.fuel)
				&& (!submittedPreferences.feature || featuresFor(car).includes(submittedPreferences.feature))
		})
		return matched.sort((left, right) => scoreCar(right, submittedPreferences) - scoreCar(left, submittedPreferences))
	}, [cars, submittedPreferences])

	function updatePreference(event) {
		const { name, value } = event.target
		setPreferences((current) => ({ ...current, [name]: value }))
		setFormError('')
	}

	async function submitPreferences(event) {
		event.preventDefault()
		if (preferences.minBudget && preferences.maxBudget && Number(preferences.minBudget) > Number(preferences.maxBudget)) {
			setFormError('Minimum daily budget must not exceed the maximum.')
			return
		}
		if (!preferences.pickupDate || !preferences.returnDate) {
			setFormError('Choose both pickup and return dates to continue.')
			return
		}
		const todayString = localDateString()
		if (preferences.pickupDate < todayString || preferences.returnDate <= preferences.pickupDate) {
			setFormError('Choose a pickup date today or later and a return date after pickup.')
			return
		}
		setCheckingAvailability(true)
		setFormError('')
		try {
			const query = new URLSearchParams({
				per_page: '100',
				start_date: preferences.pickupDate,
				end_date: preferences.returnDate,
			})
			const response = await api.get(`/api/cars/available?${query}`)
			setCars(response?.data || [])
			setSubmittedPreferences({ ...preferences })
			window.setTimeout(() => document.getElementById('recommendation-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
		} catch (requestError) {
			setFormError(requestError.message)
		} finally {
			setCheckingAvailability(false)
		}
	}

	function resetPreferences() {
		setSubmittedPreferences(null)
		setPreferences(INITIAL_PREFERENCES)
		setFormError('')
		window.scrollTo({ top: 0, behavior: 'smooth' })
	}

	const best = recommendations[0]
	const alternatives = recommendations.slice(1)
	const introCar = best || cars[0]

	return <div className="recommendation-page">
		<section className="recommendation-hero">
			<div className="recommendation-hero-copy"><span className="eyebrow"><span className="eyebrow-line" />DRIVERENT VEHICLE FINDER</span><h1>Find the Right Car for Your Journey</h1><p>Explore vehicle recommendations based on your rental preferences.</p><div className="recommendation-demo-label">Rule-based preference matching · not AI-generated</div></div>
			<div className="recommendation-hero-photo"><div className="recommendation-image-placeholder">Vehicle photo unavailable</div>{carPhoto(introCar) && <img src={carPhoto(introCar)} alt={`${introCar.make} ${introCar.model}`} onError={(event) => { event.currentTarget.hidden = true }} />}<span>{introCar ? `${introCar.make} ${introCar.model}` : 'THE DRIVERENT FLEET'}</span></div>
		</section>

		<section className="recommendation-content">
			<form className="preference-form" onSubmit={submitPreferences}>
				<div className="preference-form-heading"><div><span className="eyebrow">YOUR JOURNEY</span><h2>Tell us what you need</h2><p>We’ll compare your preferences with vehicles currently available.</p></div><span className="form-step-count">01 <i>/</i> 01</span></div>
				{error && <div className="error-message" role="alert">{error}</div>}
				{loading ? <div className="loading-state">Loading available vehicles…</div> : cars.length ? <>
					<div className="preference-section"><h3>Trip details</h3><div className="preference-grid">
						<label className="preference-field"><span>Rental purpose</span><select name="purpose" value={preferences.purpose} onChange={updatePreference}>{['Personal Travel', 'Business', 'Family Trip', 'Special Occasion'].map((item) => <option key={item}>{item}</option>)}</select></label>
						<label className="preference-field"><span>Vehicle category</span><select name="category" value={preferences.category} onChange={updatePreference}><option value="">Any category</option>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
						<label className="preference-field"><span>Passenger capacity</span><select name="passengers" value={preferences.passengers} onChange={updatePreference}>{Array.from({ length: 10 }, (_, index) => String(index + 1)).map((item) => <option key={item} value={item}>{item} {item === '1' ? 'passenger' : 'passengers'}</option>)}</select></label>
					</div></div>
					<div className="preference-section"><h3>Daily budget</h3><div className="preference-grid budget-fields">
						<label className="preference-field"><span>Minimum per day</span><div className="preference-currency"><b>₱</b><input name="minBudget" type="number" min="0" step="100" value={preferences.minBudget} onChange={updatePreference} placeholder="No minimum" /></div></label>
						<label className="preference-field"><span>Maximum per day</span><div className="preference-currency"><b>₱</b><input name="maxBudget" type="number" min="0" step="100" value={preferences.maxBudget} onChange={updatePreference} placeholder="No maximum" /></div></label>
					</div></div>
					<div className="preference-section"><h3>Rental dates</h3><div className="preference-grid">
						<label className="preference-field"><span>Pickup date <i>*</i></span><input name="pickupDate" type="date" min={localDateString()} value={preferences.pickupDate} onChange={updatePreference} required /></label>
						<label className="preference-field"><span>Return date <i>*</i></span><input name="returnDate" type="date" min={preferences.pickupDate || undefined} value={preferences.returnDate} onChange={updatePreference} required /></label>
					</div></div>
					<div className="preference-section"><h3>Vehicle preferences <small>Optional</small></h3><div className="preference-grid">
						<label className="preference-field"><span>Transmission</span><select name="transmission" value={preferences.transmission} onChange={updatePreference}><option value="">Any transmission</option>{transmissions.map((item) => <option key={item}>{item}</option>)}</select></label>
						<label className="preference-field"><span>Fuel type</span><select name="fuel" value={preferences.fuel} onChange={updatePreference}><option value="">Any fuel type</option>{fuels.map((item) => <option key={item}>{item}</option>)}</select></label>
						<label className="preference-field"><span>Features</span><select name="feature" value={preferences.feature} onChange={updatePreference}><option value="">No preference</option>{features.map((item) => <option key={item}>{item}</option>)}</select></label>
					</div></div>
					{formError && <div className="maintenance-form-error" role="alert">{formError}</div>}
					<div className="preference-submit"><span>Matches are based on vehicle details and server-checked date availability.</span><button className="button button-primary" disabled={checkingAvailability}>{checkingAvailability ? 'Checking availability…' : 'Find My Car'} <span aria-hidden="true">→</span></button></div>
				</> : <div className="recommendation-empty"><h3>Vehicles are unavailable right now</h3><p>Recommendations use only vehicles returned by the current availability service.</p><button type="button" className="button button-outline" onClick={() => navigate('/users/vehicles')}>Browse vehicles</button></div>}
			</form>

			{submittedPreferences && <section id="recommendation-results" className="recommendation-results">
				<header className="recommendation-results-heading"><div><span className="eyebrow">YOUR SHORTLIST</span><h2>Vehicles for your journey</h2><p>{recommendations.length} match{recommendations.length === 1 ? '' : 'es'} based on your selected preferences.</p></div><button className="button button-outline" onClick={resetPreferences}>Adjust Preferences</button></header>
				<div className="preference-summary"><span>{submittedPreferences.purpose}</span><span>{submittedPreferences.passengers} passenger{submittedPreferences.passengers === '1' ? '' : 's'}</span>{submittedPreferences.category && <span>{submittedPreferences.category}</span>}<span>{money(submittedPreferences.minBudget || 0)} – {submittedPreferences.maxBudget ? money(submittedPreferences.maxBudget) : 'No maximum'} / day</span><span>{submittedPreferences.pickupDate} to {submittedPreferences.returnDate}</span></div>
				<div className="recommendation-demo-note"><span className="demo-dot" />Matches are computed from live vehicle data and your preferences; these are not AI-generated recommendations.</div>
				{best ? <>
					<article className="best-match">
						<div className="best-match-image"><div className="recommendation-image-placeholder">Vehicle photo unavailable</div>{carPhoto(best) && <img src={carPhoto(best)} alt={`${best.make} ${best.model}`} onError={(event) => { event.currentTarget.hidden = true }} />}<span>BEST MATCH</span></div>
						<div className="best-match-content"><span className="eyebrow">A STRONG FIT FOR YOUR PLANS</span><h3>{best.make} {best.model}</h3><p className="best-match-meta">{best.year} · {best.category || 'Vehicle'} · {best.seating_capacity || '—'} seats</p><div className="best-match-price"><strong>{money(best.daily_rental_price)}</strong><span> / day</span></div><div className="best-match-specs"><span>{best.transmission || 'Transmission not listed'}</span><span>{best.fuel_type || 'Fuel type not listed'}</span></div><div className="best-match-features">{featuresFor(best).slice(0, 4).map((feature) => <span key={feature}>{feature}</span>)}</div><div className="recommendation-reasons"><strong>Why it fits</strong>{reasonsFor(best, submittedPreferences).map((reason) => <span key={reason}><i aria-hidden="true">✓</i>{reason}</span>)}</div><div className="recommendation-actions"><button className="button button-outline" onClick={() => navigate(`/users/vehicles/${best.id}`)}>View Details</button><button className="button button-primary" onClick={() => navigate(`/users/reservations/create?car_id=${best.id}`)}>Book Vehicle <span aria-hidden="true">→</span></button></div></div>
					</article>
					{alternatives.length > 0 && <section className="alternative-recommendations"><div className="section-heading"><div><span className="eyebrow">MORE OPTIONS</span><h2>Alternative vehicles</h2></div><span>{alternatives.length} other match{alternatives.length === 1 ? '' : 'es'}</span></div><div className="recommendation-grid">
						{alternatives.map((car) => <article className="recommendation-card" key={car.id}><button className="recommendation-card-image" onClick={() => navigate(`/users/vehicles/${car.id}`)} aria-label={`View ${car.make} ${car.model}`}><div className="recommendation-image-placeholder">Photo unavailable</div>{carPhoto(car) && <img src={carPhoto(car)} alt={`${car.make} ${car.model}`} loading="lazy" onError={(event) => { event.currentTarget.hidden = true }} />}</button><div className="recommendation-card-body"><div className="recommendation-card-title"><div><h3>{car.make} {car.model}</h3><span>{car.category || 'Vehicle'} · {car.seating_capacity || '—'} seats</span></div><div className="recommendation-card-price"><strong>{money(car.daily_rental_price)}</strong><small>/ day</small></div></div><div className="recommendation-card-specs"><span>{car.transmission || 'Transmission not listed'}</span><span>{car.fuel_type || 'Fuel not listed'}</span></div><div className="recommendation-card-reason">{reasonsFor(car, submittedPreferences).slice(0, 2).join(' · ')}</div><div className="recommendation-actions"><button className="button button-outline" onClick={() => navigate(`/users/vehicles/${car.id}`)}>Details</button><button className="button button-primary" onClick={() => navigate(`/users/reservations/create?car_id=${car.id}`)}>Book</button></div></div></article>)}
					</div></section>}
				</> : <div className="recommendation-empty result-empty"><h3>No vehicles match every preference</h3><p>Try a wider budget, fewer passengers, or a different category and date range.</p><button className="button button-primary" onClick={resetPreferences}>Adjust Preferences</button></div>}
			</section>}
		</section>
	</div>
}
