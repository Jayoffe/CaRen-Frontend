export default function AdminLayout({ sidebar, topbar, notifications, children }) {
  return <div className="app-frame admin-frame">
    {sidebar}
    <div className="app-main">
      {topbar}
      {notifications}
      <main>{children}</main>
    </div>
  </div>
}
