import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, imageUrl } from './api'
import Login from './auth/Login'
import SignUp from './auth/SignUp'
import AdminLayout from './Pages/Admin/Layout/AdminLayout.jsx'
import UserLayout from './Pages/Users/Layout/UserLayout.jsx'
import ProtectedRoute from './Routes/ProtectedRoute.jsx'
import UserDashboardPage from './Pages/Users/Pages/UserDashboard.jsx'
import VehicleListingPage from './Pages/Users/Pages/VehicleListing.jsx'
import VehicleDetailsPage from './Pages/Users/Pages/VehicleDetails.jsx'
import CreateReservationPage from './Pages/Users/Pages/CreateReservation.jsx'
import MyReservationsPage from './Pages/Users/Pages/MyReservations.jsx'
import AdminDashboardPage from './Pages/Admin/Pages/AdminDashboard.jsx'
import VehicleManagementPage from './Pages/Admin/Pages/VehicleManagement.jsx'
import ReservationManagementPage from './Pages/Admin/Pages/ReservationManagement.jsx'
import FleetOperationsPage from './Pages/Admin/Pages/FleetOperations.jsx'
import MaintenanceManagementPage from './Pages/Admin/Pages/MaintenanceManagement.jsx'
import MaintenancePredictionsPage from './Pages/Admin/Pages/MaintenancePredictions.jsx'
import VehicleRecommendationsPage from './Pages/Users/Pages/VehicleRecommendations.jsx'
import DemandPricingIntelligencePage from './Pages/Admin/Pages/DemandPricingIntelligence.jsx'
import RiskAnalysisPage from './Pages/Admin/Pages/RiskAnalysis.jsx'
import PaymentManagementPage from './Pages/Admin/Pages/PaymentManagement.jsx'
import PaymentHistoryPage from './Pages/Users/Pages/PaymentHistory.jsx'
import UserProfilePage from './Pages/Users/Pages/UserProfile.jsx'
import ChatWidget from '../../chatbot/frontend/ChatWidget.jsx'
import './App.css'

const EMPTY_CAR = {
  make: '', model: '', year: new Date().getFullYear(), category: 'SUV',
  plate_number: '', color: '', description: '', daily_rental_price: '',
  security_deposit: 0, minimum_rental_duration: 1, transmission: 'Automatic',
  fuel_type: 'Gasoline', seating_capacity: 5, air_conditioning: false,
  gps_navigation: false, additional_features: [], status: 'available',
}

function usePath() {
  const [path, setPath] = useState(window.location.pathname)
  useEffect(() => {
    const update = () => setPath(window.location.pathname)
    window.addEventListener('popstate', update)
    return () => window.removeEventListener('popstate', update)
  }, [])
  const navigate = useCallback((to, replace = false) => {
    const destination = new URL(to, window.location.origin)
    if (replace) window.history.replaceState({}, '', destination)
    else window.history.pushState({}, '', destination)
    setPath(destination.pathname)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])
  return [path, navigate]
}

function App() {
  const [path, navigate] = usePath()
  const [user, setUser] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [toast, setToast] = useState('')
  const [apiError, setApiError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [adminNavOpen, setAdminNavOpen] = useState(false)
  const [customerNavOpen, setCustomerNavOpen] = useState(false)
  const refresh = () => setReloadKey((key) => key + 1)
  const admin = user?.role === 'admin'

  useEffect(() => {
    let active = true
    api.get('/api/me')
      .then((response) => { if (active) setUser(response.data) })
      .catch(() => { if (active) setUser(null) })
      .finally(() => { if (active) setAuthReady(true) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!toast) return undefined
    const timer = window.setTimeout(() => setToast(''), 3500)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    if (!adminNavOpen && !customerNavOpen) return undefined
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        setAdminNavOpen(false)
        setCustomerNavOpen(false)
      }
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [adminNavOpen, customerNavOpen])

  const login = async (credentials) => {
    const response = await api.post('/api/login', credentials)
    const loggedInUser = response?.data ?? (response?.role ? response : null)
    if (!loggedInUser || typeof loggedInUser !== 'object' || !loggedInUser.role) {
      throw new Error('The login response did not include user information. Check that the backend API is up to date.')
    }
    setUser(loggedInUser)
    setToast(`Welcome, ${loggedInUser.full_name || loggedInUser.username || loggedInUser.email || 'there'}.`)
    const requestedPath = new URLSearchParams(window.location.search).get('next')
    const nextPath = requestedPath?.startsWith('/users/reservations/create?car_id=')
      ? requestedPath
      : null
    navigate(loggedInUser.role === 'admin'
      ? '/admin/dashboard'
      : nextPath || '/users/dashboard', true)
  }

  const logout = async () => {
    setApiError('')
    try {
      await api.post('/api/logout', {})
      setUser(null)
      setToast('You have been signed out.')
      navigate('/auth/login')
    } catch (error) {
      setApiError(error.message)
    }
  }

  if (!authReady) return <div className="app-loading"><span className="spinner" />Loading DriveRent…</div>

  const isAdminRoute = path.startsWith('/admin')
  const isUserRoute = path.startsWith('/users')
  const isCustomerDashboard = path === '/dashboard'
  const isAuthRoute = path === '/auth/login' || path === '/auth/sign-up' || path === '/login'

  const shared = { user, navigate, logout, apiError, setApiError, toast, setToast }
  let content

  if (isAuthRoute) {
    content = user
      ? <Redirect navigate={navigate} to={admin ? '/admin/dashboard' : '/users/dashboard'} />
      : path === '/auth/sign-up'
        ? <SignUp navigate={navigate} />
        : <Login onLogin={login} navigate={navigate} onError={setApiError} error={apiError} />
  } else if (path === '/') {
    content = <HomePage {...shared} onOpenApiError={setApiError} reloadKey={reloadKey} />
  } else if (path === '/dashboard') {
    content = <CustomerDashboard {...shared} reloadKey={reloadKey} />
  } else if (path === '/users/dashboard') {
    content = <UserDashboardPage {...shared} navigate={navigate} />
  } else if (path === '/users/vehicles') {
    content = <VehicleListingPage {...shared} navigate={navigate} />
  } else if (/^\/users\/vehicles\/\d+$/.test(path)) {
    content = <VehicleDetailsPage {...shared} navigate={navigate} carId={path.split('/')[3]} />
  } else if (path === '/users/reservations') {
    content = <MyReservationsPage {...shared} navigate={navigate} />
  } else if (path === '/users/rentals') {
    content = <MyReservationsPage {...shared} navigate={navigate} view="active" />
  } else if (path === '/users/reservations/history') {
    content = <MyReservationsPage {...shared} navigate={navigate} view="history" />
  } else if (path === '/users/profile') {
    content = <UserProfilePage user={user} onProfileSaved={setUser} />
  } else if (path === '/users/payments') {
    content = <PaymentHistoryPage />
  } else if (path === '/users/recommendations') {
    content = <VehicleRecommendationsPage navigate={navigate} />
  } else if (path === '/users/reservations/create') {
    content = <CreateReservationPage {...shared} navigate={navigate} carId={new URLSearchParams(window.location.search).get('car_id')} />
  } else if (path === '/admin/dashboard') {
    content = <AdminDashboardPage {...shared} navigate={navigate} />
  } else if (path === '/admin/reservations') {
    content = <ReservationManagementPage {...shared} navigate={navigate} />
  } else if (path === '/admin/reservations/history') {
    content = <ReservationManagementPage {...shared} navigate={navigate} historyView />
  } else if (path === '/admin/maintenance') {
    content = <FleetOperationsPage navigate={navigate} />
  } else if (path === '/admin/maintenance/records') {
    content = <MaintenanceManagementPage navigate={navigate} />
  } else if (path === '/admin/maintenance/predictions') {
    content = <MaintenancePredictionsPage navigate={navigate} />
  } else if (path === '/admin/intelligence/demand') {
    content = <DemandPricingIntelligencePage />
  } else if (path === '/admin/intelligence/risk') {
    content = <RiskAnalysisPage />
  } else if (path === '/admin/payments') {
    content = <PaymentManagementPage />
  } else if (path === '/vehicles') {
    content = <VehicleListing {...shared} reloadKey={reloadKey} admin={admin} />
  } else if (path === '/admin/vehicles') {
    content = <VehicleManagementPage {...shared} navigate={navigate} />
  } else if (path === '/admin/vehicles/create') {
    content = <VehicleEditor {...shared} navigate={navigate} onSaved={refresh} />
  } else if (/^\/admin\/vehicles\/\d+\/edit$/.test(path)) {
    content = <VehicleEditor {...shared} navigate={navigate} onSaved={refresh} carId={path.split('/')[3]} />
  } else if (/^\/admin\/vehicles\/\d+$/.test(path)) {
    content = <VehicleDetails {...shared} navigate={navigate} carId={path.split('/')[3]} admin onChanged={refresh} />
  } else if (/^\/vehicles\/\d+$/.test(path)) {
    content = <VehicleDetails {...shared} navigate={navigate} carId={path.split('/')[2]} admin={admin} onChanged={refresh} />
  } else if (path === '/unauthorized') {
    content = <MessagePage title="Access restricted" message="You do not have permission to view this page." action="Go to home" onAction={() => navigate('/')} />
  } else {
    content = <MessagePage title="Page not found" message="The page you are looking for does not exist." action="Back to home" onAction={() => navigate('/')} />
  }

  const requiredRole = isAdminRoute ? 'admin' : (isUserRoute || isCustomerDashboard) ? 'customer' : null
  if (requiredRole) {
    content = <ProtectedRoute user={user} requiredRole={requiredRole} navigate={navigate}>{content}</ProtectedRoute>
  }
  const adminLayout = isAdminRoute && user?.role === 'admin'
  if (isAuthRoute) return <main className="auth-shell">{content}</main>
  const notifications = <>
    {toast && <div className="toast"><span className="toast-check"><Icon name="check" /></span>{toast}<button onClick={() => setToast('')} aria-label="Dismiss notification"><Icon name="close" /></button></div>}
    {apiError && <div className="global-error" role="alert"><Icon name="alert" /><span>{apiError}</span><button onClick={() => setApiError('')} aria-label="Dismiss error"><Icon name="close" /></button></div>}
  </>
  if (adminLayout) return <AdminLayout
    sidebar={<AdminSidebar key={path} path={path} navigate={navigate} logout={logout} open={adminNavOpen} onNavigate={() => setAdminNavOpen(false)} />}
    topbar={<Navbar user={user} adminLayout path={path} navigate={navigate} logout={logout} onMenuToggle={() => setAdminNavOpen((open) => !open)} />}
    notifications={notifications}
    navOpen={adminNavOpen}
    onCloseNavigation={() => setAdminNavOpen(false)}
  >
    {content}
    {user && <ChatWidget user={user} />}
  </AdminLayout>
  if (isUserRoute) return <UserLayout
    user={user}
    sidebar={<CustomerSidebar user={user} path={path} navigate={navigate} logout={logout} open={customerNavOpen} onNavigate={() => setCustomerNavOpen(false)} />}
    topbar={<Navbar user={user} adminLayout={false} customerLayout path={path} navigate={navigate} logout={logout} onMenuToggle={() => setCustomerNavOpen((open) => !open)} />}
    notifications={notifications}
    navOpen={customerNavOpen}
    onCloseNavigation={() => setCustomerNavOpen(false)}
  >
    {content}
    {user && <ChatWidget user={user} />}
  </UserLayout>
  return (
    <div className="app-frame">
      <div className="app-main">
        <Navbar user={user} adminLayout={false} path={path} navigate={navigate} logout={logout} />
        {notifications}
        <main>{content}</main>
        {!adminLayout && <Footer navigate={navigate} />}
        {user && <ChatWidget user={user} />}
      </div>
    </div>
  )
}

function Redirect({ navigate, to }) {
  useEffect(() => navigate(to, true), [navigate, to])
  return null
}

function Icon({ name, size = 18 }) {
  const shapes = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /></>,
    brain: <><path d="M12 5.5a3 3 0 0 0-5.7-1.2A3.5 3.5 0 0 0 4 10.5a3.5 3.5 0 0 0 .8 6.3A3 3 0 0 0 12 18z" /><path d="M12 5.5a3 3 0 0 1 5.7-1.2 3.5 3.5 0 0 1 2.3 6.2 3.5 3.5 0 0 1-.8 6.3A3 3 0 0 1 12 18zM9 8v8m6-8v8M9 12h3m3 0h-3" /></>,
    chart: <><path d="M4 19V5m0 14h17" /><path d="m7 15 4-4 3 2 5-6" /><path d="M16 7h3v3" /></>,
    wallet: <><rect x="3" y="5" width="18" height="15" rx="2" /><path d="M3 9h18m-5 5h2" /><path d="M6 5V3h12v2" /></>,
    receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6m-6 4h6m-6 4h3" /></>,
    history: <><path d="M3 12a9 9 0 1 0 2.6-6.4L3 8" /><path d="M3 3v5h5m4-1v5l3 2" /></>,
    chevron: <path d="m7 10 5 5 5-5" />,
    key: <><circle cx="8" cy="15" r="5" /><path d="m11.5 11.5 8-8M16 7l2 2m-5 1 2 2" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    car: <><path d="m5 11 1.6-4.5A2.2 2.2 0 0 1 8.7 5h6.6a2.2 2.2 0 0 1 2.1 1.5L19 11" /><path d="M3 11h18v7H3zM6 18v2m12-2v2" /><circle cx="7" cy="15" r="1" /><circle cx="17" cy="15" r="1" /></>,
    search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    arrow: <><path d="M5 12h14m-7-7 7 7-7 7" /></>,
    back: <><path d="M19 12H5m7 7-7-7 7-7" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    alert: <><circle cx="12" cy="12" r="9" /><path d="M12 8v5m0 3h.01" /></>,
    logout: <><path d="M10 17l5-5-5-5m5 5H3" /><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></>,
    edit: <><path d="m15 5 4 4M4 20l4-.8L19 8a2.1 2.1 0 0 0-3-3L5 16l-1 4Z" /></>,
    trash: <><path d="M3 6h18m-2 0-.9 14H5.9L5 6m4 0V4h6v2m-5 4v6m4-6v6" /></>,
    image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9" r="1.5" /><path d="m21 15-5-5L5 20" /></>,
    seat: <><path d="M7 4v7a3 3 0 0 0 3 3h5v5m-8 1h12M9 4h2v5H9z" /></>,
    fuel: <><path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M3 21h14m-9-4h4m4-9h2l3 3v6a2 2 0 0 1-4 0v-4" /></>,
    gear: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8 8 0 0 1-1.6.9l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.6-.9l-1.7.6-1.4-2.4 1.4-1.1a7 7 0 0 1 0-1.9l-1.4-1.1 1.4-2.4 1.7.6a8 8 0 0 1 1.6-.9l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.6.9l1.7-.6 1.4 2.4-1.4 1.1a7 7 0 0 1 0 1.8Z" transform="translate(-1 -1)" /></>,
    shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" /><path d="m9 12 2 2 4-4" /></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[name] || shapes.car}</svg>
}

function Logo({ onClick }) {
  return <button className="logo" onClick={onClick} aria-label="DriveRent home"><span className="logo-symbol"><Icon name="car" size={19} /></span><span>Drive<span>Rent</span></span></button>
}

function Navbar({ user, adminLayout, customerLayout = false, path, navigate, logout, onMenuToggle }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const customerLinks = user?.role === 'admin'
    ? [['/admin/maintenance', 'Fleet Operations'], ['/admin/intelligence/demand', 'Demand Intelligence'], ['/admin/maintenance/predictions', 'Predictive Maintenance'], ['/admin/payments', 'Payment History'], ['/admin/reservations', 'Reservations'], ['/admin/reservations/history', 'Reservation History']]
    : user
    ? [['/', 'Home'], ['/users/vehicles', 'Vehicles'], ['/users/recommendations', 'Recommendations'], ['/users/reservations', 'Reservations'], ['/users/payments', 'Payments'], ['/users/dashboard', 'Dashboard']]
      : [['/', 'Home'], ['/vehicles', 'Vehicles']]
  return (
    <header className={`topbar ${adminLayout ? 'topbar-admin' : ''}`}>
      {!adminLayout && <Logo onClick={() => navigate('/')} />}
      {adminLayout || customerLayout
        ? <div className="admin-breadcrumb"><span>{adminLayout ? 'Workspace' : 'Your Drive'}</span><b>/</b><strong>{customerLayout ? (path.includes('/vehicles') ? 'Browse vehicles' : path.endsWith('/rentals') ? 'Active rentals' : path.endsWith('/history') ? 'Reservation history' : path.includes('/reservations') ? 'My reservations' : path.includes('payments') ? 'Payment history' : path.includes('profile') ? 'Profile' : 'Dashboard') : path.includes('/maintenance/predictions') ? 'Predictive maintenance' : path.includes('/maintenance/records') ? 'Vehicle maintenance records' : path === '/admin/maintenance' ? 'Fleet operations' : path.includes('/intelligence/demand') ? 'Demand intelligence' : path.includes('/intelligence/risk') ? 'Risk analysis' : path.includes('payments') ? 'Payment history' : path.endsWith('/reservations/history') ? 'Reservation history' : path.includes('reservations') ? 'Reservation management' : path.includes('vehicles') ? 'Vehicle management' : 'Dashboard'}</strong></div>
        : <nav className={menuOpen ? 'public-nav open' : 'public-nav'}>{customerLinks.map(([href, label]) => <button key={href} className={path === href ? 'nav-link active' : 'nav-link'} onClick={() => { navigate(href); setMenuOpen(false) }}>{label}</button>)}</nav>}
      <div className="topbar-right">
        <span className="connection-dot" title="Backend API" />
        {user ? <><button className="profile-button" onClick={() => navigate(user.role === 'admin' ? '/admin/dashboard' : '/users/dashboard')}><span className="avatar">{(user.full_name || user.username || 'U').slice(0, 1).toUpperCase()}</span><span className="profile-name">{user.full_name || user.username}<small>{user.role === 'admin' ? 'Administrator' : 'Customer'}</small></span></button><button className="icon-button logout-top" onClick={logout} title="Logout"><Icon name="logout" /></button></>
          : <button className="button button-primary button-compact" onClick={() => navigate('/auth/login')}>Sign in</button>}
        <button className={adminLayout || customerLayout ? 'menu-toggle admin-menu-toggle' : 'menu-toggle'} onClick={adminLayout || customerLayout ? onMenuToggle : () => setMenuOpen((open) => !open)} aria-label={adminLayout ? 'Toggle admin navigation' : customerLayout ? 'Toggle customer navigation' : 'Toggle navigation'} aria-expanded={adminLayout || customerLayout ? undefined : menuOpen}><span /><span /><span /></button>
      </div>
    </header>
  )
}

function AdminSidebar({ path, navigate, logout, open, onNavigate }) {
  const intelligenceItems = [
    ['/admin/maintenance', 'gear', 'Fleet Operations'],
    ['/admin/intelligence/demand', 'chart', 'Demand Intelligence'],
    ['/admin/maintenance/predictions', 'shield', 'Predictive Maintenance'],
  ]
  const paymentItems = [
    ['/admin/payments', 'receipt', 'Payment History'],
    ['/admin/reservations', 'calendar', 'Reservations'],
    ['/admin/reservations/history', 'history', 'Reservation History'],
  ]
  const primaryItems = [
    ['/admin/dashboard', 'dashboard', 'Dashboard'],
    ['/admin/vehicles', 'car', 'Car Listing'],
  ]
  const isIntelligencePath = intelligenceItems.some(([href]) => path === href)
  const isPaymentsPath = paymentItems.some(([href]) => path === href)
  const [expandedGroup, setExpandedGroup] = useState(
    isIntelligencePath ? 'intelligence' : isPaymentsPath ? 'payments' : null,
  )

  const renderGroup = (id, label, icon, items) => {
    const expanded = expandedGroup === id
    const hasActiveItem = items.some(([href]) => path === href)
    return (
      <section className="sidebar-group" key={id}>
        <button
          className={`sidebar-group-toggle${expanded ? ' expanded' : ''}${hasActiveItem ? ' has-active' : ''}`}
          type="button"
          aria-expanded={expanded}
          aria-controls={`sidebar-${id}-links`}
          onClick={() => setExpandedGroup(expanded ? null : id)}
        >
          <Icon name={icon} />
          <span>{label}</span>
          <Icon name="chevron" size={15} />
        </button>
        <div className="sidebar-submenu" id={`sidebar-${id}-links`} hidden={!expanded}>
          {items.map(([href, itemIcon, itemLabel]) => {
            const active = path === href
            return (
              <button
                className={`sidebar-link sidebar-submenu-link${active ? ' selected' : ''}`}
                key={href}
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => { navigate(href); onNavigate?.() }}
              >
                <Icon name={itemIcon} size={16} />
                <span>{itemLabel}</span>
              </button>
            )
          })}
        </div>
      </section>
    )
  }

  return <aside className={`admin-sidebar${open ? ' is-open' : ''}`}>
    <div className="admin-sidebar-content">
    <Logo onClick={() => navigate('/admin/dashboard')} />
    <div className="sidebar-caption">ADMIN MENU</div>
    <nav className="sidebar-nav" aria-label="Admin navigation">
      {primaryItems.map(([href, icon, label]) => {
        const active = path === href || (href === '/admin/vehicles' && path.startsWith('/admin/vehicles/'))
        return (
          <button
            className={`sidebar-link sidebar-primary-link${active ? ' selected' : ''}`}
            key={href}
            type="button"
            aria-current={active ? 'page' : undefined}
            onClick={() => { navigate(href); onNavigate?.() }}
          >
            <Icon name={icon} />
            <span>{label}</span>
          </button>
        )
      })}
      {renderGroup('intelligence', 'AI Intelligence', 'brain', intelligenceItems)}
      {renderGroup('payments', 'Payments', 'wallet', paymentItems)}
    </nav>
    <div className="sidebar-lower"><span className="sidebar-caption">ACCOUNT</span><button className="sidebar-link" onClick={() => { logout(); onNavigate?.() }}><Icon name="logout" />Log out</button><div className="sidebar-note"><Icon name="shield" size={16} /><span>Admin workspace<small>Manage your fleet</small></span></div></div>
    <small className="sidebar-version">DRIVERENT · FLEET PORTAL</small>
    </div>
  </aside>
}

function CustomerSidebar({ user, path, navigate, logout, open, onNavigate }) {
  const sections = [
    {
      title: 'MAIN',
      items: [
        ['/users/dashboard', 'dashboard', 'Dashboard'],
        ['/users/vehicles', 'car', 'Browse Vehicles'],
        ['/users/reservations', 'calendar', 'My Reservations'],
      ],
    },
    {
      title: 'RENTAL ACTIVITY',
      items: [
        ['/users/rentals', 'key', 'Active Rentals'],
        ['/users/reservations/history', 'history', 'Reservation History'],
      ],
    },
    {
      title: 'ACCOUNT',
      items: [
        ['/users/profile', 'user', 'Profile'],
        ['/users/payments', 'receipt', 'Payment History'],
      ],
    },
  ]

  return (
    <aside className={`customer-sidebar${open ? ' is-open' : ''}`}>
      <div className="customer-sidebar-content">
        <Logo onClick={() => { navigate('/users/dashboard'); onNavigate?.() }} />
        <div className="customer-sidebar-caption">YOUR DRIVE</div>
        <nav className="customer-sidebar-nav" aria-label="Customer navigation">
          {sections.map((section) => (
            <section className="customer-nav-section" key={section.title}>
              <h2>{section.title}</h2>
              {section.items.map(([href, icon, label]) => {
                const active = path === href
                return (
                  <button
                    className={`customer-nav-link${active ? ' selected' : ''}`}
                    type="button"
                    key={href}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => { navigate(href); onNavigate?.() }}
                  >
                    <Icon name={icon} size={17} />
                    <span>{label}</span>
                  </button>
                )
              })}
            </section>
          ))}
        </nav>
        <div className="customer-sidebar-profile">
          <span className="avatar">{(user?.full_name || user?.username || 'U').slice(0, 1).toUpperCase()}</span>
          <span><b>{user?.full_name || user?.username || 'Customer'}</b><small>Customer account</small></span>
          <button type="button" onClick={logout} aria-label="Log out"><Icon name="logout" size={16} /></button>
        </div>
      </div>
    </aside>
  )
}

function Footer({ navigate }) {
  return <footer className="site-footer"><Logo onClick={() => navigate('/')} /><span>© {new Date().getFullYear()} DriveRent. Built for your next journey.</span></footer>
}

function HomePage({ user, navigate, onOpenApiError, reloadKey }) {
  const [cars, setCars] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  useEffect(() => {
    let active = true
    api.get('/api/cars/available?per_page=6')
      .then((response) => { if (active) setCars(response.data || []) })
      .catch((error) => { if (active) onOpenApiError(error.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [onOpenApiError, reloadKey])
  const vehiclesPath = user?.role === 'admin' ? '/admin/vehicles' : user ? '/users/vehicles' : '/vehicles'
  const dashboardRoute = user?.role === 'admin' ? '/admin/dashboard' : '/users/dashboard'
  const heroCar = cars[0]
  const heroImage = heroCar ? getVehiclePhoto(heroCar) : ''
  return <div className="public-page">
    <section className="home-hero">
      <div className="hero-copy">
        <span className="eyebrow"><span className="eyebrow-line" />A BETTER WAY TO GET THERE</span>
        <h1>The keys to<br /><em>what’s next.</em></h1>
        <p>Find a car that fits the plan. Straightforward options, clear daily pricing, and a fleet ready for your next trip.</p>
        <form className="hero-search" onSubmit={(event) => { event.preventDefault(); navigate(`${vehiclesPath}?search=${encodeURIComponent(search)}`) }}><Icon name="search" size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search make or model" /><button className="button button-primary">Explore fleet <Icon name="arrow" size={16} /></button></form>
        <div className="hero-trust"><span><Icon name="check" size={15} /> Real vehicle details</span><span><Icon name="shield" size={15} /> Clear daily pricing</span></div>
      </div>
      <div className="hero-visual">
        <div className="hero-car-placeholder" aria-label="No vehicle photo available"><Icon name="car" size={72} /></div>
        {heroImage && <img className="hero-car-photo" src={heroImage} alt={`${heroCar.make} ${heroCar.model}`} onError={handleVehicleImageError} />}
        <div className="hero-photo-shade" />
        <div className="hero-visual-label"><span className="label-dot" />READY FOR THE ROAD</div>
        {heroCar && <button className="hero-car-caption" onClick={() => navigate(`${vehiclesPath}/${heroCar.id}`)}><span><small>FEATURED VEHICLE</small><b>{heroCar.make} {heroCar.model}</b></span><span className="hero-car-price">{money(heroCar.daily_rental_price)}<small> / day</small></span><span className="hero-car-arrow"><Icon name="arrow" size={17} /></span></button>}
      </div>
    </section>
    <nav className="home-anchor-nav" aria-label="Explore DriveRent">
      <a href="#about-us">About us</a>
      <a href="#why-choose-us">Why choose us</a>
      <a href="#faqs">FAQs</a>
    </nav>
    <section className="home-section">
      <SectionHeading eyebrow="CHOOSE YOUR NEXT RIDE" title="A fleet for every kind of day" description="Browse the vehicles currently available and compare the details that matter." action="View all vehicles" onAction={() => navigate(vehiclesPath)} />
      {loading ? <Loading label="Loading available vehicles" /> : cars.length ? <VehicleGrid cars={cars.slice(0, 3)} navigate={navigate} user={user} admin={user?.role === 'admin'} vehicleBasePath={vehiclesPath} /> : <EmptyState title="No vehicles available right now" description="Check back soon to see new vehicles in our fleet." />}
    </section>
    <section className="home-about" id="about-us">
      <div className="home-about-copy">
        <span className="eyebrow"><span className="eyebrow-line" />ABOUT DRIVERENT</span>
        <h2>More clarity for<br />the road ahead.</h2>
        <p>DriveRent makes it easier to find a rental car that suits your plans. Browse vehicles marked available, compare their details and daily rates, then send a reservation request with your dates.</p>
        <button className="text-action" onClick={() => navigate(vehiclesPath)}>Get to know the fleet <Icon name="arrow" size={16} /></button>
      </div>
      <div className="home-about-note">
        <span className="home-about-icon"><Icon name="key" size={22} /></span>
        <p>A better rental experience starts with useful details and a clear next step.</p>
        <span className="home-about-caption">YOUR JOURNEY, YOUR WAY</span>
      </div>
    </section>
    <section className="home-why" id="why-choose-us">
      <SectionHeading eyebrow="THE DRIVERENT DIFFERENCE" title="A rental experience built around you" description="The essentials are easy to find, so you can choose with confidence." />
      <div className="home-why-grid">
        <article className="home-why-card">
          <span className="home-why-icon"><Icon name="shield" size={21} /></span>
          <h3>Know what it costs</h3>
          <p>See each vehicle’s daily rate up front and review an estimate when you choose your rental dates.</p>
        </article>
        <article className="home-why-card">
          <span className="home-why-icon"><Icon name="car" size={21} /></span>
          <h3>Compare the details</h3>
          <p>Check vehicle photos, seating, fuel type, transmission and other listed specifications before you decide.</p>
        </article>
        <article className="home-why-card">
          <span className="home-why-icon"><Icon name="check" size={21} /></span>
          <h3>Browse current availability</h3>
          <p>Start with vehicles currently listed as available and submit your preferred dates for confirmation.</p>
        </article>
      </div>
    </section>
    <section className="home-how"><div className="how-heading"><span className="eyebrow"><span className="eyebrow-line" />MADE FOR THE MILES AHEAD</span><h2>A more considered<br />way to rent.</h2><p>Good choices start with the right information. Explore real vehicles, see their specifications, and know the rental price before you decide.</p><button className="button button-dark" onClick={() => navigate(vehiclesPath)}>Explore the fleet <Icon name="arrow" size={16} /></button></div><div className="how-points"><HowPoint number="01" title="Find your fit" text="Search an available fleet and choose a vehicle for your plans." /><HowPoint number="02" title="See the full picture" text="Compare prices, specifications, availability, and vehicle images." /><HowPoint number="03" title="Get ready to go" text="Review your vehicle details and make the most of the journey." /></div></section>
    <section className="home-faq" id="faqs">
      <div className="home-faq-heading">
        <span className="eyebrow"><span className="eyebrow-line" />GOOD TO KNOW</span>
        <h2>Frequently asked<br />questions.</h2>
        <p>Here are a few helpful details before you get started.</p>
      </div>
      <div className="home-faq-list">
        <details>
          <summary>How do I reserve a vehicle?<span aria-hidden="true">+</span></summary>
          <p>Choose an available vehicle, select your pickup and return dates, then submit a reservation request. You’ll need to sign in to complete the request.</p>
        </details>
        <details>
          <summary>How is the rental amount calculated?<span aria-hidden="true">+</span></summary>
          <p>The estimate uses the vehicle’s listed daily rate and the number of rental days. If a security deposit applies, it is shown separately in the booking summary.</p>
        </details>
        <details>
          <summary>Does choosing a vehicle confirm my booking?<span aria-hidden="true">+</span></summary>
          <p>No. Selecting a vehicle starts a reservation request. Availability is checked when you submit your dates, and the system confirms whether it can be reserved.</p>
        </details>
        <details>
          <summary>What details can I compare before booking?<span aria-hidden="true">+</span></summary>
          <p>Vehicle listings can include photos, daily price, year, category, transmission, seating capacity, fuel type and other specifications.</p>
        </details>
      </div>
    </section>
    <section className="home-cta"><div><span className="eyebrow">YOUR NEXT JOURNEY STARTS HERE</span><h2>Find a car for the<br />road ahead.</h2></div><button className="button button-white" onClick={() => navigate(user ? dashboardRoute : vehiclesPath)}>{user ? 'Go to your dashboard' : 'Browse available cars'} <Icon name="arrow" size={17} /></button></section>
  </div>
}

function getVehiclePhoto(car) {
  const uploaded = car?.primary_image || car?.images?.find((image) => Number(image.is_primary))?.image_path || car?.images?.[0]?.image_path
  return uploaded ? imageUrl(uploaded) : ''
}

function handleVehicleImageError(event) {
  event.currentTarget.hidden = true
}

function SectionHeading({ eyebrow, title, description, action, onAction }) {
  return <div className="section-heading"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2>{description && <p>{description}</p>}</div>{action && <button className="text-action" onClick={onAction}>{action}<Icon name="arrow" size={16} /></button>}</div>
}

function HowPoint({ number, title, text }) {
  return <div className="how-point"><span>{number}</span><div><h3>{title}</h3><p>{text}</p></div><Icon name="arrow" size={17} /></div>
}

function CustomerDashboard({ user, navigate, reloadKey, vehicleBasePath = '/vehicles' }) {
  const [cars, setCars] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let active = true
    api.get('/api/cars/available?per_page=4')
      .then((response) => { if (active) setCars(response.data || []) })
      .catch(() => { if (active) setCars([]) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [reloadKey])
  const dashboardPhoto = cars.length ? getVehiclePhoto(cars[0]) : ''
  return <div className="customer-dashboard content-width">
    <div className="welcome-banner"><div><span className="eyebrow light">YOUR DRIVERENT SPACE</span><h1>Welcome back,<br /><em>{user?.full_name || user?.username || 'driver'}.</em></h1><p>Your next journey starts with the right vehicle.</p><button className="button button-white" onClick={() => navigate(vehicleBasePath)}>Browse vehicles <Icon name="arrow" size={16} /></button></div><div className="welcome-car">{dashboardPhoto ? <img src={dashboardPhoto} alt={`${cars[0].make} ${cars[0].model}`} onError={handleVehicleImageError} /> : <Icon name="car" size={72} />}</div></div>
    <section className="dashboard-content"><SectionHeading eyebrow="AVAILABLE NOW" title="Find a vehicle" description={`${cars.length} vehicle${cars.length === 1 ? '' : 's'} currently showing from the available fleet.`} action="View all" onAction={() => navigate(vehicleBasePath)} />{loading ? <Loading label="Loading available vehicles" /> : cars.length ? <VehicleGrid cars={cars} navigate={navigate} user={user} vehicleBasePath={vehicleBasePath} /> : <EmptyState title="Nothing available yet" description="New vehicles will show up here when they are ready." />}</section>
  </div>
}

function VehicleListing({ navigate, reloadKey, admin, user, vehicleBasePath = admin ? '/admin/vehicles' : '/vehicles' }) {
  const params = new URLSearchParams(window.location.search)
  const [query, setQuery] = useState(params.get('search') || '')
  const [category, setCategory] = useState(params.get('category') || '')
  const [brand, setBrand] = useState(params.get('make') || '')
  const [status, setStatus] = useState(params.get('status') || '')
  const [sort, setSort] = useState(params.get('sort') || 'newest')
  const [page, setPage] = useState(Number(params.get('page')) || 1)
  const [result, setResult] = useState({ cars: [], meta: { total: 0, total_pages: 0 } })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setLoading(true)
      setError('')
      const search = new URLSearchParams({ page: String(page), per_page: '12', sort })
      if (query.trim()) search.set('search', query.trim())
      if (category) search.set('category', category)
      if (brand) search.set('make', brand)
      if (status) search.set('status', status)
      api.get(`${admin ? '/api/cars' : '/api/cars/available'}?${search}`, { signal: controller.signal })
        .then((response) => setResult({ cars: response.data || [], meta: response.meta || { total: 0, total_pages: 0 } }))
        .catch((err) => { if (!controller.signal.aborted) setError(err.message) })
        .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    }, 180)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [admin, brand, category, page, query, reloadKey, sort, status])

  useEffect(() => {
    const search = new URLSearchParams()
    if (query.trim()) search.set('search', query.trim())
    if (category) search.set('category', category)
    if (brand) search.set('make', brand)
    if (status) search.set('status', status)
    if (sort !== 'newest') search.set('sort', sort)
    if (page > 1) search.set('page', String(page))
    const suffix = search.toString()
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${suffix ? `?${suffix}` : ''}`)
  }, [brand, category, page, query, sort, status])

  const categories = result.meta.categories || []
  const brands = result.meta.brands || []
  const filtersChanged = (setter) => (value) => { setter(value); setPage(1) }
  return <div className={admin ? 'admin-content content-width' : 'public-page content-width listing-content'}>
    <div className="listing-heading"><div><span className="eyebrow">{admin ? 'FLEET MANAGEMENT' : 'THE DRIVERENT FLEET'}</span><h1>{admin ? 'Vehicle management' : 'Find your vehicle'}</h1><p>{admin ? 'Manage every vehicle in one place.' : 'A vehicle for wherever you want to go.'}</p></div>{admin && <button className="button button-primary" onClick={() => navigate(`/admin/vehicles/create${window.location.search}`)}><Icon name="plus" size={16} /> Add vehicle</button>}</div>
    <div className="listing-toolbar">
      <label className="search-control"><Icon name="search" size={18} /><input value={query} onChange={(event) => filtersChanged(setQuery)(event.target.value)} placeholder="Search make, model, plate number…" /><kbd>⌕</kbd></label>
      <label className="filter-control"><span>Category</span><select value={category} onChange={(event) => filtersChanged(setCategory)(event.target.value)}><option value="">All categories</option>{categories.map((value) => <option key={value}>{value}</option>)}{!categories.includes('SUV') && <option>SUV</option>}</select></label>
      <label className="filter-control"><span>Brand</span><select value={brand} onChange={(event) => filtersChanged(setBrand)(event.target.value)}><option value="">All brands</option>{brands.map((value) => <option key={value}>{value}</option>)}</select></label>
      {admin && <label className="filter-control"><span>Availability</span><select value={status} onChange={(event) => filtersChanged(setStatus)(event.target.value)}><option value="">All statuses</option><option value="available">Available</option><option value="rented">Rented</option><option value="maintenance">Maintenance</option><option value="unavailable">Unavailable</option></select></label>}
      <label className="sort-control"><span>Sort</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="newest">Newest</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option><option value="name">Name</option></select></label>
    </div>
    <div className="listing-subtitle"><span><b>{result.meta.total}</b> vehicle{result.meta.total === 1 ? '' : 's'} {admin ? 'in fleet' : 'available'}</span>{!admin && <span><Icon name="shield" size={15} />Fleet availability updates from the system</span>}</div>
    {error && <ErrorMessage message={error} />}
    {loading ? <Loading label="Loading vehicles" /> : result.cars.length ? <>
      <VehicleGrid cars={result.cars} navigate={navigate} admin={admin} user={user} vehicleBasePath={vehicleBasePath} />
      {result.meta.total_pages > 1 && <Pagination page={page} pages={result.meta.total_pages} onPage={setPage} />}
    </> : <EmptyState title={query || category || brand || status ? 'No vehicles match those filters' : 'No vehicles to show yet'} description={query || category || brand || status ? 'Try removing a filter or changing your search.' : admin ? 'Add a vehicle to start managing your rental fleet.' : 'Please check back later for available vehicles.'} />}
  </div>
}

function VehicleGrid({ cars, navigate, admin = false, user, vehicleBasePath = admin ? '/admin/vehicles' : '/vehicles' }) {
  return <div className="vehicle-grid">{cars.map((car) => <VehicleCard key={car.id} car={car} admin={admin} onClick={() => navigate(`${vehicleBasePath}/${car.id}${window.location.search}`)} onBook={() => navigate(user?.role === 'customer' ? `/users/reservations/create?car_id=${car.id}` : `/auth/login?next=${encodeURIComponent(`/users/reservations/create?car_id=${car.id}`)}`)} />)}</div>
}

function VehicleCard({ car, admin, onClick, onBook }) {
  const primary = getVehiclePhoto(car)
  return <article className="vehicle-card">
    <button className="vehicle-photo" onClick={onClick} aria-label={`View ${car.make} ${car.model}`}>
      <span className="vehicle-photo-placeholder" aria-hidden="true"><Icon name="car" size={54} /></span>
      {primary && <img src={primary} alt={`${car.make} ${car.model}`} loading="lazy" onError={handleVehicleImageError} />}
      <StatusPill status={car.status} /><span className="photo-category">{car.category}</span>
    </button>
    <div className="vehicle-card-content">
      <div className="vehicle-card-heading"><div><h3>{car.make} {car.model}</h3><p>{car.year} <span>·</span> {car.transmission || 'Automatic'}</p></div><span className="card-category">{car.category}</span></div>
      <div className="vehicle-specs"><span><Icon name="seat" size={15} />{car.seating_capacity || 5} seats</span><span><Icon name="fuel" size={15} />{car.fuel_type || 'Gasoline'}</span></div>
      <div className="vehicle-card-footer"><div className="daily-price"><b>{money(car.daily_rental_price)}</b><span>/ day</span></div><div className="vehicle-card-actions"><button className="card-detail-link" onClick={onClick}>{admin ? 'Manage' : 'Details'}<Icon name="arrow" size={15} /></button>{!admin && car.status === 'available' && <button className="card-book-link" onClick={onBook}>Book now</button>}</div></div>
    </div>
  </article>
}

function StatusPill({ status = 'available' }) {
  const text = status === 'available' ? 'Available' : status === 'rented' ? 'Rented' : status === 'maintenance' ? 'Maintenance' : 'Unavailable'
  return <span className={`status-pill status-${status}`}><i />{text}</span>
}

function VehicleDetails({ carId, admin, user, navigate, onChanged, setToast, setApiError, vehicleBasePath = admin ? '/admin/vehicles' : '/vehicles' }) {
  const [car, setCar] = useState(null)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [selectedImage, setSelectedImage] = useState('')
  const [activeTab, setActiveTab] = useState('overview')

  const load = useCallback(async () => {
    try {
      const response = await api.get(`/api/cars/${carId}`)
      setCar(response.data)
      setSelectedImage(response.data.primary_image || response.data.images?.[0]?.image_path || '')
    } catch (error) {
      setApiError(error.message)
    } finally {
      setLoading(false)
    }
  }, [carId, setApiError])
  useEffect(() => {
    const timer = window.setTimeout(() => { load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const remove = async () => {
    if (deleting) return
    setDeleting(true)
    try {
      const response = await api.delete(`/api/cars/${carId}`)
      if (response?.success !== true) throw new Error('The API did not confirm the vehicle deletion.')
      onChanged()
      setToast('Vehicle deleted successfully.')
      navigate(`/admin/vehicles${window.location.search}`)
    } catch (error) {
      setApiError(error.message)
    } finally {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }
  const upload = async (event) => {
    const files = Array.from(event.target.files || [])
    if (!files.length) return
    const invalid = invalidImage(files)
    if (invalid) {
      setApiError(invalid)
      event.target.value = ''
      return
    }
    const form = new FormData()
    files.forEach((file) => form.append('images[]', file))
    try {
      await api.post(`/api/cars/${carId}/images`, form)
      await load()
      onChanged()
      setToast('Vehicle images uploaded.')
    } catch (error) {
      setApiError(error.message)
    }
    event.target.value = ''
  }
  const removeImage = async (image) => {
    try {
      await api.delete(`/api/cars/${carId}/images/${image.id}`)
      await load()
      onChanged()
      setToast('Vehicle image removed.')
    } catch (error) {
      setApiError(error.message)
    }
  }

  if (loading) return <div className={admin ? 'admin-content content-width' : 'public-page content-width'}><Loading label="Loading vehicle details" /></div>
  if (!car) return <div className="content-width"><EmptyState title="Vehicle not found" description="This vehicle may have been removed." /><button className="button button-primary" onClick={() => navigate(`${vehicleBasePath}${window.location.search}`)}>Back to vehicles</button></div>

  const images = car.images || []
  const features = parseFeatures(car.additional_features)
  const fallbackPhoto = getVehiclePhoto(car)
  const selectedPhoto = selectedImage ? imageUrl(selectedImage) : fallbackPhoto
  return <div className={`${admin ? 'admin-content' : 'public-page'} content-width detail-page`}>
    <button className="back-link" onClick={() => navigate(`${vehicleBasePath}${window.location.search}`)}><Icon name="back" size={16} />Back to vehicles</button>
    <div className="detail-heading"><div><div className="detail-breadcrumb">{car.category}<span>·</span>{car.year}<span>·</span>{car.transmission}</div><h1>{car.make} {car.model}</h1></div><div className="detail-heading-actions">{admin && <><button className="button button-outline" onClick={() => navigate(`/admin/vehicles/${car.id}/edit${window.location.search}`)}><Icon name="edit" size={16} />Edit vehicle</button><button className="button button-danger-outline" onClick={() => setConfirmDelete(true)}><Icon name="trash" size={16} />Delete</button></>}<StatusPill status={car.status} /></div></div>
    <div className="detail-top-grid">
      <div className="gallery">
        <div className="gallery-main"><span className="vehicle-photo-placeholder" aria-hidden="true"><Icon name="car" size={72} />Photo unavailable</span>{selectedPhoto && <img src={selectedPhoto} alt={`${car.make} ${car.model}`} onError={handleVehicleImageError} />}{!admin && <span className="gallery-badge"><Icon name="check" size={14} />Vehicle information</span>}</div>
        <div className="gallery-thumbs">{images.map((image) => <div className={`gallery-thumb ${selectedImage === image.image_path ? 'selected' : ''}`} key={image.id}><button onClick={() => setSelectedImage(image.image_path)} aria-label={`Show image ${image.id}`}><img src={imageUrl(image.image_path)} alt={`${car.make} ${car.model} view`} /></button>{admin && <button className="thumb-remove" onClick={() => removeImage(image)} aria-label="Remove image"><Icon name="close" size={14} /></button>}</div>)}{!images.length && <span className="gallery-note">Add vehicle photos for more views</span>}{admin && <label className="gallery-add"><Icon name="plus" size={19} /><span>Add image</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={upload} /></label>}</div>
      </div>
      <aside className="detail-summary">
        <div className="detail-price"><b>{money(car.daily_rental_price)}</b><span>/ day</span></div>
        <p className="summary-caption">Rental price</p>
        <div className="detail-quick-specs"><div><Icon name="seat" /><span><b>{car.seating_capacity || '—'}</b><small>Seats</small></span></div><div><Icon name="gear" /><span><b>{car.transmission || '—'}</b><small>Transmission</small></span></div><div><Icon name="fuel" /><span><b>{car.fuel_type || '—'}</b><small>Fuel type</small></span></div></div>
        {!admin && <button className="button button-primary book-button" disabled={car.status !== 'available'} onClick={() => navigate(user?.role === 'customer' ? `/users/reservations/create?car_id=${car.id}` : `/auth/login?next=${encodeURIComponent(`/users/reservations/create?car_id=${car.id}`)}`)}>{car.status === 'available' ? 'Book now' : 'Currently unavailable'} <Icon name="arrow" size={17} /></button>}
        <div className="summary-divider" />
        <dl className="summary-list"><div><dt>Security deposit</dt><dd>{money(car.security_deposit)}</dd></div><div><dt>Minimum rental</dt><dd>{car.minimum_rental_duration} {Number(car.minimum_rental_duration) === 1 ? 'day' : 'days'}</dd></div><div><dt>Availability</dt><dd><StatusPill status={car.status} /></dd></div></dl>
      </aside>
    </div>
    <section className="detail-tabs-section">
      <div className="detail-tabs" role="tablist" aria-label="Vehicle information">
        {[['overview', 'Overview'], ['specifications', 'Specifications'], ['rental', 'Rental information'], ['features', 'Features']].map(([tab, label]) => <button key={tab} id={`vehicle-tab-${tab}`} type="button" role="tab" aria-controls="vehicle-tab-panel" aria-selected={activeTab === tab} tabIndex={activeTab === tab ? 0 : -1} className={activeTab === tab ? 'detail-tab active' : 'detail-tab'} onClick={() => setActiveTab(tab)}>{label}</button>)}
      </div>
      <section className="detail-panel detail-tab-panel" id="vehicle-tab-panel" role="tabpanel" aria-labelledby={`vehicle-tab-${activeTab}`}>
        {activeTab === 'overview' && <><div className="detail-panel-head"><div><span className="eyebrow">ABOUT THIS VEHICLE</span><h2>Vehicle information</h2></div></div><p className="vehicle-description">{car.description || 'No description has been added for this vehicle.'}</p><div className="vehicle-info-table"><InfoItem label="Make" value={car.make} /><InfoItem label="Model" value={car.model} /><InfoItem label="Year" value={car.year} /><InfoItem label="Category" value={car.category} /><InfoItem label="Color" value={car.color || 'Not specified'} />{admin && <><InfoItem label="Added" value={formatDate(car.created_at)} /><InfoItem label="Updated" value={formatDate(car.updated_at)} /></>}</div></>}
        {activeTab === 'specifications' && <><div className="detail-panel-head"><div><span className="eyebrow">VEHICLE SPECS</span><h2>Specifications</h2></div></div><div className="vehicle-info-table"><InfoItem label="Transmission" value={car.transmission} /><InfoItem label="Fuel type" value={car.fuel_type} /><InfoItem label="Seating capacity" value={`${car.seating_capacity || '—'} seats`} /><InfoItem label="Air conditioning" value={Number(car.air_conditioning) ? 'Included' : 'Not included'} /><InfoItem label="GPS navigation" value={Number(car.gps_navigation) ? 'Included' : 'Not included'} /><InfoItem label="Category" value={car.category} /><InfoItem label="Color" value={car.color || 'Not specified'} /></div></>}
        {activeTab === 'rental' && <><div className="detail-panel-head"><div><span className="eyebrow">PRICING & AVAILABILITY</span><h2>Rental information</h2></div></div><div className="vehicle-info-table"><InfoItem label="Daily rental price" value={`${money(car.daily_rental_price)} / day`} /><InfoItem label="Security deposit" value={money(car.security_deposit)} /><InfoItem label="Minimum rental" value={`${car.minimum_rental_duration || 1} ${Number(car.minimum_rental_duration) === 1 ? 'day' : 'days'}`} /><InfoItem label="Availability" value={<StatusPill status={car.status} />} />{car.plate_number && admin && <InfoItem label="Plate number" value={car.plate_number} />}</div></>}
        {activeTab === 'features' && <><div className="detail-panel-head"><div><span className="eyebrow">COMFORT & CONVENIENCE</span><h2>Included features</h2></div></div>{features.length || Number(car.air_conditioning) || Number(car.gps_navigation) ? <div className="feature-list">{Number(car.air_conditioning) === 1 && <span><Icon name="check" size={14} />Air conditioning</span>}{Number(car.gps_navigation) === 1 && <span><Icon name="check" size={14} />GPS navigation</span>}{features.map((feature) => <span key={feature}><Icon name="check" size={14} />{feature}</span>)}</div> : <p className="vehicle-description">No additional features have been listed for this vehicle.</p>}</>}
      </section>
    </section>
    {confirmDelete && <Modal title="Delete this vehicle?" onClose={() => setConfirmDelete(false)}><p>Delete <b>{car.make} {car.model}</b> and its vehicle images? This action cannot be undone.</p><div className="modal-actions"><button className="button button-outline" onClick={() => setConfirmDelete(false)}>Cancel</button><button className="button button-danger" disabled={deleting} onClick={remove}>{deleting ? 'Deleting…' : 'Delete vehicle'}</button></div></Modal>}
  </div>
}

function InfoItem({ label, value }) {
  return <div className="info-item"><span>{label}</span><b>{value || '—'}</b></div>
}

function VehicleEditor({ carId, navigate, setToast, setApiError, onSaved }) {
  const editing = Boolean(carId)
  const [values, setValues] = useState(EMPTY_CAR)
  const [loading, setLoading] = useState(editing)
  const [saving, setSaving] = useState(false)
  const [files, setFiles] = useState([])
  const [existingImages, setExistingImages] = useState([])
  const [formError, setFormError] = useState('')
  const [featuresText, setFeaturesText] = useState('')
  const previews = useMemo(
    () => files.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [files],
  )
  useEffect(() => () => {
    previews.forEach((preview) => URL.revokeObjectURL(preview.url))
  }, [previews])

  useEffect(() => {
    if (!editing) return
    let active = true
    api.get(`/api/cars/${carId}`)
      .then(({ data }) => {
        if (!active) return
        setValues({
          ...EMPTY_CAR,
          ...data,
          additional_features: parseFeatures(data.additional_features),
          air_conditioning: Boolean(Number(data.air_conditioning)),
          gps_navigation: Boolean(Number(data.gps_navigation)),
        })
        setFeaturesText(parseFeatures(data.additional_features).join(', '))
        setExistingImages(data.images || [])
      })
      .catch((error) => setFormError(error.message))
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [carId, editing])

  const update = (event) => {
    const { name, value, type, checked } = event.target
    setValues((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }))
  }
  const removeExistingImage = async (image) => {
    try {
      await api.delete(`/api/cars/${carId}/images/${image.id}`)
      setExistingImages((current) => current.filter((item) => item.id !== image.id))
    } catch (error) {
      setFormError(error.message)
    }
  }
  const selectFiles = (event) => {
    const selected = Array.from(event.target.files || [])
    const invalid = invalidImage(selected)
    if (invalid) {
      setFormError(invalid)
      event.target.value = ''
      return
    }
    setFormError('')
    setFiles((current) => [...current, ...selected])
    event.target.value = ''
  }
  const submit = async (event) => {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setFormError('')
    setApiError('')
    const payload = {
      ...values,
      additional_features: featuresText.split(',').map((feature) => feature.trim()).filter(Boolean),
    }
    try {
      const response = editing
        ? await api.put(`/api/cars/${carId}`, payload)
        : await api.post('/api/cars', payload)
      if (response?.success !== true) throw new Error('The API did not confirm the vehicle save.')
      const id = editing ? carId : response.data?.id
      if (files.length) {
        if (!id) throw new Error('The vehicle was saved, but the API did not return its vehicle ID for image upload.')
        const formData = new FormData()
        files.forEach((file) => formData.append('images[]', file))
        await api.post(`/api/cars/${id}/images`, formData)
      }
      onSaved()
      setToast(editing ? 'Vehicle updated successfully.' : 'Vehicle added successfully.')
      navigate(`/admin/vehicles${window.location.search}`)
    } catch (error) {
      setFormError(error.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="admin-content content-width"><Loading label="Loading vehicle details" /></div>
  return <div className="admin-content content-width editor-page">
    <button className="back-link" onClick={() => navigate(`${editing ? `/admin/vehicles/${carId}` : '/admin/vehicles'}${window.location.search}`)}><Icon name="back" size={16} />Back to vehicles</button>
    <div className="listing-heading editor-heading"><div><span className="eyebrow">FLEET MANAGEMENT</span><h1>{editing ? 'Edit vehicle' : 'Add new vehicle'}</h1><p>{editing ? 'Update vehicle information and settings.' : 'Enter vehicle details and specifications.'}</p></div></div>
    {formError && <ErrorMessage message={formError} />}
    <form onSubmit={submit}>
      <div className="editor-grid">
        <div className="editor-column">
          <section className="form-panel"><FormSection number="01" title="Basic information" description="Vehicle identity and description" /><div className="form-grid"><FormField label="Make" required><input name="make" value={values.make} onChange={update} required maxLength="100" placeholder="e.g. Toyota" /></FormField><FormField label="Model" required><input name="model" value={values.model} onChange={update} required maxLength="100" placeholder="e.g. Fortuner" /></FormField><FormField label="Year" required><input name="year" type="number" value={values.year} onChange={update} min="1900" max={new Date().getFullYear() + 1} required /></FormField><FormField label="Category" required><select name="category" value={values.category} onChange={update}>{['SUV', 'Sedan', 'MPV', 'Van', 'Hatchback', 'Pickup', 'Coupe'].map((item) => <option key={item}>{item}</option>)}</select></FormField><FormField label="Plate number"><input name="plate_number" value={values.plate_number || ''} onChange={update} maxLength="40" placeholder="e.g. XYZ 1234" /></FormField><FormField label="Color"><input name="color" value={values.color || ''} onChange={update} maxLength="50" placeholder="e.g. Black" /></FormField><FormField label="Description" wide><textarea name="description" value={values.description || ''} onChange={update} rows="4" maxLength="5000" placeholder="Enter a detailed description…" /></FormField></div></section>
          <section className="form-panel"><FormSection number="02" title="Specifications" description="Performance and comfort features" /><div className="form-grid"><FormField label="Transmission"><select name="transmission" value={values.transmission} onChange={update}><option>Automatic</option><option>Manual</option><option>CVT</option></select></FormField><FormField label="Fuel type"><select name="fuel_type" value={values.fuel_type} onChange={update}><option>Gasoline</option><option>Diesel</option><option>Hybrid</option><option>Electric</option></select></FormField><FormField label="Seating capacity"><input name="seating_capacity" type="number" min="1" max="50" value={values.seating_capacity} onChange={update} /></FormField><FormField label="Additional features" wide><input value={featuresText} onChange={(event) => setFeaturesText(event.target.value)} placeholder="Bluetooth, parking sensors, leather seats" /><small>Separate features with commas.</small></FormField></div><div className="checkbox-row"><label><input name="air_conditioning" type="checkbox" checked={values.air_conditioning} onChange={update} /><span>Air conditioning</span></label><label><input name="gps_navigation" type="checkbox" checked={values.gps_navigation} onChange={update} /><span>GPS navigation</span></label></div></section>
        </div>
        <div className="editor-column">
          <section className="form-panel"><FormSection number="03" title="Rental information" description="Pricing and availability" /><div className="form-stack"><FormField label="Daily rental price" required><CurrencyInput name="daily_rental_price" value={values.daily_rental_price} onChange={update} /></FormField><FormField label="Security deposit"><CurrencyInput name="security_deposit" value={values.security_deposit} onChange={update} /></FormField><FormField label="Minimum rental duration"><select name="minimum_rental_duration" value={values.minimum_rental_duration} onChange={update}><option value="1">1 day</option><option value="2">2 days</option><option value="3">3 days</option><option value="7">7 days</option></select></FormField><FormField label="Availability status"><select name="status" value={values.status} onChange={update}><option value="available">Available</option><option value="rented">Rented</option><option value="maintenance">Maintenance</option><option value="unavailable">Unavailable</option></select></FormField></div></section>
          <section className="form-panel"><FormSection number="04" title="Vehicle images" description="JPEG, PNG, or WebP · maximum 5 MB each" /><label className="drop-area"><span className="upload-symbol"><Icon name="image" size={23} /></span><b>Choose vehicle images</b><span>Browse from your computer</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={selectFiles} /></label>{files.length > 0 && <div className="image-preview-grid">{files.map((file) => <div className="image-preview" key={`${file.name}-${file.lastModified}`}><img src={previews.find((preview) => preview.file === file)?.url} alt={file.name} /><button type="button" aria-label={`Remove ${file.name}`} onClick={() => setFiles((selected) => selected.filter((item) => item !== file))}><Icon name="close" size={13} /></button><small>{file.name}</small></div>)}</div>}{existingImages.length > 0 && <div className="existing-image-grid">{existingImages.map((image) => <div className="image-preview" key={image.id}><img src={imageUrl(image.image_path)} alt="Current vehicle" /><button type="button" aria-label="Remove current image" onClick={() => removeExistingImage(image)}><Icon name="close" size={13} /></button>{Number(image.is_primary) === 1 && <span className="primary-tag">Primary</span>}</div>)}</div>}</section>
        </div>
      </div>
      <div className="editor-footer"><button type="button" className="button button-outline" onClick={() => navigate(`${editing ? `/admin/vehicles/${carId}` : '/admin/vehicles'}${window.location.search}`)}>Cancel</button><button className="button button-primary" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Save vehicle'}<Icon name="arrow" size={16} /></button></div>
    </form>
  </div>
}

function FormSection({ number, title, description }) {
  return <div className="form-section-heading"><span>{number}</span><div><h2>{title}</h2><p>{description}</p></div></div>
}

function FormField({ label, required, wide, children }) {
  return <label className={`form-field ${wide ? 'field-wide' : ''}`}><span>{label}{required && <i> *</i>}</span>{children}</label>
}

function CurrencyInput({ name, value, onChange }) {
  return <div className="currency-input"><span>₱</span><input name={name} type="number" min="0" step="0.01" value={value ?? ''} onChange={onChange} required={name === 'daily_rental_price'} placeholder="0.00" /></div>
}

function Pagination({ page, pages, onPage }) {
  return <nav className="pagination" aria-label="Vehicle pages"><button disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">‹</button>{Array.from({ length: pages }, (_, index) => index + 1).map((number) => <button key={number} className={number === page ? 'current' : ''} onClick={() => onPage(number)}>{number}</button>)}<button disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">›</button></nav>
}

function Loading({ label }) {
  return <div className="loading-block"><span className="spinner" />{label}</div>
}

function ErrorMessage({ message }) {
  return <div className="error-message" role="alert"><Icon name="alert" size={18} /><span>{message}</span></div>
}

function EmptyState({ title, description }) {
  return <div className="empty-state"><span className="empty-icon"><Icon name="car" size={27} /></span><h3>{title}</h3><p>{description}</p></div>
}

function MessagePage({ title, message, action, onAction }) {
  return <div className="message-page"><span className="message-symbol"><Icon name="shield" size={28} /></span><span className="eyebrow">DRIVERENT</span><h1>{title}</h1><p>{message}</p><button className="button button-primary" onClick={onAction}>{action}<Icon name="arrow" size={16} /></button></div>
}

function Modal({ title, children, onClose }) {
  useEffect(() => {
    const closeOnEscape = (event) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><button className="modal-close" onClick={onClose} aria-label="Close dialog"><Icon name="close" /></button><span className="modal-icon"><Icon name="alert" /></span><h2 id="modal-title">{title}</h2>{children}</section></div>
}

function parseFeatures(features) {
  if (Array.isArray(features)) return features
  if (!features) return []
  try {
    const parsed = JSON.parse(features)
    if (Array.isArray(parsed)) return parsed
  } catch {
    return String(features).split(',').map((feature) => feature.trim()).filter(Boolean)
  }
  return []
}

function invalidImage(files) {
  const file = files.find((item) =>
    !['image/jpeg', 'image/png', 'image/webp'].includes(item.type) || item.size > 5 * 1024 * 1024,
  )
  return file ? `${file.name} must be a JPEG, PNG, or WebP image no larger than 5 MB.` : ''
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value.replace(' ', 'T'))
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(date)
}

function money(value) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: Number(value) % 1 ? 2 : 0,
  }).format(Number(value || 0))
}

export default App
