export default function RoleBasedRoute({ children, user, allowedRole }) {
  if (!user || user.role !== allowedRole) return null
  return children
}
