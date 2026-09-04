import { useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  FiBarChart2,
  FiHeart,
  FiLogOut,
  FiMenu,
  FiPackage,
  FiShoppingBag,
  FiShoppingCart,
  FiTag,
  FiUser,
  FiX,
} from 'react-icons/fi'
import { useAuth } from '../hooks/useAuth'
import { useOrderRealtime } from '../hooks/useOrderRealtime'
import { api } from '../lib/api'
import type { Cart, LowStockResponse } from '../types'

function navClass({ isActive }: { isActive: boolean }) {
  return isActive
    ? 'flex items-center gap-2 text-ticket'
    : 'flex items-center gap-2 text-muted hover:text-ink'
}

export function Layout() {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  useOrderRealtime()

  const cartQuery = useQuery({
    queryKey: ['cart'],
    queryFn: async () => (await api.get<Cart>('/cart')).data,
  })

  const lowStockQuery = useQuery({
    queryKey: ['low-stock'],
    queryFn: async () => (await api.get<LowStockResponse>('/products/low-stock')).data,
    enabled: user?.role === 'ADMIN',
  })

  const cartCount =
    cartQuery.data?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0
  const lowStockCount = lowStockQuery.data?.count ?? 0

  const links = (
    <>
      <NavLink to="/" className={navClass} end onClick={() => setOpen(false)}>
        <FiPackage />
        Shop
      </NavLink>
      <NavLink to="/cart" className={navClass} onClick={() => setOpen(false)}>
        <FiShoppingCart />
        Cart{cartCount > 0 ? ` (${cartCount})` : ''}
      </NavLink>
      {user ? (
        <>
          <NavLink to="/wishlist" className={navClass} onClick={() => setOpen(false)}>
            <FiHeart />
            Wishlist
          </NavLink>
          <NavLink to="/orders" className={navClass} onClick={() => setOpen(false)}>
            <FiShoppingBag />
            Orders
          </NavLink>
          {user.role === 'ADMIN' ? (
            <>
              <NavLink
                to="/admin/analytics"
                className={navClass}
                onClick={() => setOpen(false)}
              >
                <FiBarChart2 />
                Analytics
              </NavLink>
              <NavLink
                to="/admin/coupons"
                className={navClass}
                onClick={() => setOpen(false)}
              >
                <FiTag />
                Coupons
              </NavLink>
              <NavLink
                to="/admin/products"
                className={navClass}
                onClick={() => setOpen(false)}
              >
                <FiPackage />
                Products
                {lowStockCount > 0 ? ` (${lowStockCount})` : ''}
              </NavLink>
            </>
          ) : null}
          <NavLink to="/account" className={navClass} onClick={() => setOpen(false)}>
            <FiUser />
            Account
          </NavLink>
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              void logout()
            }}
            className="flex items-center gap-2 text-muted hover:text-ink"
          >
            <FiLogOut />
            Log out
          </button>
        </>
      ) : (
        <>
          <NavLink to="/login" className={navClass} onClick={() => setOpen(false)}>
            Log in
          </NavLink>
          <NavLink
            to="/register"
            onClick={() => setOpen(false)}
            className="btn-primary text-sm"
          >
            Register
          </NavLink>
        </>
      )}
    </>
  )

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line/80 bg-[#fffcf7]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link to="/" className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
            EventCart
          </Link>
          <nav className="hidden items-center gap-5 text-sm md:flex">{links}</nav>
          <button
            type="button"
            className="rounded-full border border-line p-2 md:hidden"
            aria-label="Menu"
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <FiX size={20} /> : <FiMenu size={20} />}
          </button>
        </div>
        {open ? (
          <nav className="flex flex-col gap-4 border-t border-line px-4 py-4 text-sm md:hidden">
            {links}
          </nav>
        ) : null}
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        <Outlet />
      </main>
    </div>
  )
}
