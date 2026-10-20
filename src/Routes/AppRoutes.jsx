import { useEffect, useState } from 'react'
import UserDashboard from '../Pages/Users/Pages/UserDashboard.jsx'
import VehicleListing from '../Pages/Users/Pages/VehicleListing.jsx'
import VehicleDetails from '../Pages/Users/Pages/VehicleDetails.jsx'
import AdminDashboard from '../Pages/Admin/Pages/AdminDashboard.jsx'
import VehicleManagement from '../Pages/Admin/Pages/VehicleManagement.jsx'

export default function AppRoutes({ user, navigate }) {
  const [path, setPath] = useState(window.location.pathname)

  useEffect(() => {
    const update = () => setPath(window.location.pathname)
    window.addEventListener('popstate', update)
    return () => window.removeEventListener('popstate', update)
  }, [])

  if (path === '/users/dashboard') return <UserDashboard user={user} navigate={navigate} />
  if (path === '/users/vehicles') return <VehicleListing navigate={navigate} />
  if (path.startsWith('/users/vehicles/')) return <VehicleDetails navigate={navigate} carId={path.split('/').at(-1)} />
  if (path === '/admin/dashboard') return <AdminDashboard navigate={navigate} />
  if (path === '/admin/vehicles') return <VehicleManagement navigate={navigate} />

  return <UserDashboard user={user} navigate={navigate} />
}
