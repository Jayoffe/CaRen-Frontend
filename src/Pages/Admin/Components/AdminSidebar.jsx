export default function AdminSidebar({ title = 'Admin workspace', subtitle = 'Fleet and reservation management' }) {
  return (
    <aside className="admin-sidebar">
      <div className="logo" aria-label="DriveRent admin home">
        <span className="logo-symbol">D</span>
        <span>Drive<span>Rent</span></span>
      </div>
      <p className="sidebar-caption">Workspace</p>
      <h3 style={{ margin: '0', color: '#fff', fontSize: '17px', fontWeight: 700 }}>{title}</h3>
      <p style={{ margin: '8px 0 0', color: '#a7bfd9', fontSize: '11px', lineHeight: 1.6 }}>{subtitle}</p>
    </aside>
  )
}
