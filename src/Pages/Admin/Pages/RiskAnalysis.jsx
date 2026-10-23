export default function RiskAnalysis() {
	return <div className="admin-content maintenance-page">
		<section className="maintenance-panel">
			<div className="maintenance-panel-heading">
				<div><span className="eyebrow">ADMIN REVIEW</span><h2>Customer and transaction risk</h2></div>
			</div>
			<div className="maintenance-empty" role="status">
				<h3>No risk assessments available</h3>
				<p>The current database schema and backend do not expose risk-assessment records or an assessment service. Risk scores are not generated or inferred.</p>
			</div>
		</section>
	</div>
}
