export default function PaymentManagement() {
	return <div className="admin-content maintenance-page">
		<header className="maintenance-page-heading">
			<div>
				<span className="eyebrow">FINANCE</span>
				<h1>Payment History</h1>
				<p>Review completed payment records and transaction details.</p>
			</div>
		</header>
		<section className="maintenance-panel">
			<div className="maintenance-panel-heading">
				<div><span className="eyebrow">TRANSACTIONS</span><h2>Payment records unavailable</h2></div>
			</div>
			<div className="maintenance-empty" role="status">
				<p>The supplied active schema and LavaLust API do not include payment or transaction tables/endpoints. No payment or revenue totals are displayed, and no payment is represented as processed.</p>
			</div>
		</section>
	</div>
}
