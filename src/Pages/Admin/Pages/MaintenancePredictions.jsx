export default function MaintenancePredictions() {
	return <div className="admin-content maintenance-page">
		<header className="maintenance-page-heading">
			<div>
				<span className="eyebrow">FLEET INTELLIGENCE</span>
				<h1>Predictive Maintenance</h1>
				<p>Review maintenance predictions returned by the configured vehicle-maintenance AI service.</p>
			</div>
			<span className="ai-status ai-status-unavailable"><span />Prediction API not configured</span>
		</header>
		<section className="maintenance-panel">
			<div className="maintenance-panel-heading">
				<div><span className="eyebrow">PREDICTION RESULTS</span><h2>No predictions to display</h2></div>
			</div>
			<div className="maintenance-empty" role="status">
				<p>The existing chatbot service exposes a rental-support chat endpoint only; it does not expose predictive-maintenance logic or a prediction endpoint. The supplied database schema also contains no maintenance-prediction table. No sample predictions are shown or stored.</p>
			</div>
		</section>
	</div>
}
