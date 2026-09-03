import { Link, NavLink, Outlet } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../hooks/useAuth'
import { api } from '../lib/api'
import type { Cart } from '../types'

function navClass({ isActive }: { isActive: boolean }) {
  return isActive
    ? 'text-ticket'
    : 'text-stone-600 hover:text-ink'
}

export function Layout() {
  const { user, logout } = useAuth()
  const cartQuery = useQuery({
    queryKey: ['cart'],
    queryFn: async () => (await api.get<Cart>('/cart')).data,
    enabled: Boolean(user),
  })

  const cartCount =
    cartQuery.data?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0

  return (
    <div className="min-h-screen">
      <header className="border-b border-stone-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <Link to="/" className="font-semibold tracking-tight">
            EventCart
          </Link>
          <nav className="flex items-center gap-5 text-sm">
            <NavLink to="/" className={navClass} end>
              Shop
            </NavLink>
            {user ? (
              <>
                <NavLink to="/cart" className={navClass}>
                  Cart{cartCount > 0 ? ` (${cartCount})` : ''}
                </NavLink>
                <NavLink to="/orders" className={navClass}>
                  Orders
                </NavLink>
                {user.role === 'ADMIN' ? (
                  <NavLink to="/admin/products" className={navClass}>
                    Admin
                  </NavLink>
                ) : null}
                <button
                  type="button"
                  onClick={logout}
                  className="text-stone-500 hover:text-ink"
                >
                  Log out
                </button>
              </>
            ) : (
              <>
                <NavLink to="/login" className={navClass}>
                  Log in
                </NavLink>
                <NavLink
                  to="/register"
                  className="rounded-full bg-ticket px-3 py-1.5 text-white hover:bg-ticket-dark"
                >
                  Register
                </NavLink>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}
