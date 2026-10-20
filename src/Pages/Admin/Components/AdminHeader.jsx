export default function AdminHeader({ title = 'Dashboard', action = null, breadcrumb = 'Admin' }) {
  return (
    <header className="topbar topbar-admin">
      <div className="admin-breadcrumb">
        <span>{breadcrumb}</span>
        <b>/</b>
        <strong>{title}</strong>
      </div>
      {action && <div className="detail-heading-actions">{action}</div>}
    </header>
  )
}
