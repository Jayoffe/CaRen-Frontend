export default function PaymentPage() {
	return <section className="maintenance-panel">
		<div className="maintenance-panel-heading"><div><span className="eyebrow">SECURE CHECKOUT</span><h2>Payment is not configured</h2></div></div>
		<div className="maintenance-empty" role="status">
			<p>No payment gateway configuration, transaction endpoint, or payment-table definition is present in the current project schema. A payment cannot be submitted or marked successful.</p>
		</div>
	</section>
}
