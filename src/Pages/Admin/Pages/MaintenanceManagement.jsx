export default function MaintenanceManagement({ navigate }) {
	return <div className="admin-content maintenance-page">
		<header className="maintenance-page-heading">
			<div>
				<span className="eyebrow">FLEET OPERATIONS</span>
				<h1>Vehicle Maintenance Records</h1>
				<p>Actual maintenance schedules and service history for the active fleet.</p>
			</div>
			<button className="button button-outline" onClick={() => navigate('/admin/vehicles')}>View fleet status</button>
		</header>
		<section className="maintenance-panel">
			<div className="maintenance-panel-heading">
				<div><span className="eyebrow">SERVICE HISTORY</span><h2>Maintenance records unavailable</h2></div>
			</div>
			<div className="maintenance-empty" role="status">
				<p>The supplied schema and current LavaLust API do not include the <code>tblvehicle_maintenance</code> table or maintenance-record endpoints. Records cannot be created, edited, or displayed without the existing table definition and its relationship to the active <code>cars</code> fleet. No demonstration records are shown.</p>
			</div>
		</section>
	</div>
}
