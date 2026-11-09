const PICKUP_LOCATION = 'Amuguis Street, Lumangbayan, Calapan, Philippines, 5200'
const GOOGLE_MAPS_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(PICKUP_LOCATION)}`
const GOOGLE_MAPS_EMBED_URL = `https://www.google.com/maps?q=${encodeURIComponent(PICKUP_LOCATION)}&output=embed`

function CustomerLocation() {
	return (
		<section className="customer-location" aria-labelledby="customer-location-title">
			<div className="customer-location-copy">
				<span className="customer-location-kicker">Pickup location</span>
				<h2 id="customer-location-title">Find us in Calapan</h2>
				<p>{PICKUP_LOCATION}</p>
				<a className="customer-location-link" href={GOOGLE_MAPS_URL} target="_blank" rel="noreferrer">
					Open in Google Maps
				</a>
			</div>
			<div className="customer-location-map">
				<iframe
					title="DriveRent pickup location"
					src={GOOGLE_MAPS_EMBED_URL}
					loading="lazy"
					referrerPolicy="no-referrer-when-downgrade"
				/>
			</div>
		</section>
	)
}

export default function UserLayout({ sidebar, topbar, notifications, navOpen, onCloseNavigation, children }) {
	return (
		<div className="app-frame customer-frame">
			{navOpen && <button className="nav-drawer-backdrop" type="button" aria-label="Close navigation" onClick={onCloseNavigation} />}
			{sidebar}
			<div className="app-main">
				{topbar}
				{notifications}
				<main>
					{children}
					<CustomerLocation />
				</main>
			</div>
		</div>
	)
}
