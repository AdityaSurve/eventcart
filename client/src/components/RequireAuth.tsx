import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export function RequireAuth({ admin = false }: { admin?: boolean }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <p className="text-stone-500">Loading…</p>
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (admin && user.role !== 'ADMIN') {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
