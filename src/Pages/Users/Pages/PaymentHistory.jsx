export default function PaymentHistory() {
	return <div className="public-page content-width">
		<section className="home-section">
			<div className="maintenance-panel">
				<div className="maintenance-panel-heading">
					<div><span className="eyebrow">YOUR ACCOUNT</span><h2>Payment history</h2></div>
				</div>
				<div className="maintenance-empty" role="status">
					<h3>No payment history is available</h3>
					<p>The current backend and active database schema do not provide payment or transaction records. No card details are requested or stored.</p>
				</div>
			</div>
		</section>
	</div>
}
