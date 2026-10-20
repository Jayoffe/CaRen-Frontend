export default function AdminLayout({ sidebar, topbar, notifications, children }) {
  return (
    <div className="admin-frame">
      {sidebar}
      <div className="admin-main">
        {topbar}
        {notifications}
        <main className="admin-main-content">{children}</main>
      </div>
    </div>
  )
}
