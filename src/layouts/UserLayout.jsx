export default function UserLayout({ topbar, notifications, footer, children }) {
  return <div className="app-frame">
    <div className="app-main">
      {topbar}
      {notifications}
      <main>{children}</main>
      {footer}
    </div>
  </div>
}
