import { useEffect } from 'react'

export default function ProtectedRoute({ children, user, requiredRole, navigate }) {
  const unauthorized = Boolean(user && requiredRole && user.role !== requiredRole)

  useEffect(() => {
    if (!user) {
      navigate('/auth/login', true)
    } else if (unauthorized) {
      navigate('/unauthorized', true)
    }
  }, [navigate, unauthorized, user])

  if (!user || unauthorized) {
    return <div className="app-loading"><span className="spinner" />Redirecting…</div>
  }
  return children
}
