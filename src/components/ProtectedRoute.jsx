import { useEffect } from 'react'

export default function ProtectedRoute({ user, requiredRole, navigate, children }) {
  const permitted = requiredRole === 'admin'
    ? user?.role === 'admin'
    : user?.role === 'customer'
  const destination = !user
    ? '/auth/login'
    : user.role === 'admin'
      ? '/admin/dashboard'
      : '/users/dashboard'

  useEffect(() => {
    if (!permitted) navigate(destination, true)
  }, [destination, navigate, permitted])

  return permitted ? children : null
}
