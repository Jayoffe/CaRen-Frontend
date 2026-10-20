export default function DashboardStats({ stats = [] }) {
  return (
    <div className="dashboard-grid">
      {stats.map((stat) => (
        <div className="stat-card" key={stat.label}>
          <div className={`stat-icon ${stat.tone || 'blue'}`}>
            <span>{stat.label.charAt(0)}</span>
          </div>
          <div className="stat-label">{stat.label}</div>
          <div className="stat-value">{stat.value}</div>
          <div className="stat-detail">{stat.detail}</div>
        </div>
      ))}
    </div>
  )
}
