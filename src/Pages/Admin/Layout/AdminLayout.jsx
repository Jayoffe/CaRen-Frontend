export default function AdminLayout({ sidebar, topbar, notifications, navOpen, onCloseNavigation, children }) {
  return (
    <div className="admin-frame">
      {navOpen && <button className="nav-drawer-backdrop" type="button" aria-label="Close navigation" onClick={onCloseNavigation} />}
      {sidebar}
      <div className="admin-main">
        {topbar}
        {notifications}
        <main className="admin-main-content">{children}</main>
      </div>
    </div>
  )
}
