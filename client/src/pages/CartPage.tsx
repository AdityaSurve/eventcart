import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FiCreditCard, FiMinus, FiPlus, FiTrash2 } from 'react-icons/fi'
import { useAuth } from '../hooks/useAuth'
import {
  api,
  getErrorMessage,
  rememberGuestOrder,
} from '../lib/api'
import { productImage } from '../lib/media'
import { formatMoney } from '../lib/money'
import type { Cart, Order } from '../types'

type PaymentMethods = { demo: boolean; stripe: boolean }

export function CartPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const queryClient = useQueryClient()
  const [couponInput, setCouponInput] = useState('')
  const [guestName, setGuestName] = useState('')
  const [guestEmail, setGuestEmail] = useState('')

  const cartQuery = useQuery({
    queryKey: ['cart'],
    queryFn: async () => (await api.get<Cart>('/cart')).data,
  })

  const methodsQuery = useQuery({
    queryKey: ['payment-methods'],
    queryFn: async () => (await api.get<PaymentMethods>('/payments/methods')).data,
  })

  const updateItem = useMutation({
    mutationFn: async ({ productId, quantity }: { productId: string; quantity: number }) => {
      if (quantity <= 0) {
        await api.delete(`/cart/items/${productId}`)
        return
      }
      await api.patch(`/cart/items/${productId}`, { quantity })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['cart'] })
    },
  })

  const applyCoupon = useMutation({
    mutationFn: async () =>
      (await api.post<Cart>('/cart/coupon', { code: couponInput })).data,
    onSuccess: async () => {
      setCouponInput('')
      await queryClient.invalidateQueries({ queryKey: ['cart'] })
    },
  })

  const removeCoupon = useMutation({
    mutationFn: async () => (await api.delete<Cart>('/cart/coupon')).data,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['cart'] })
    },
  })

  function guestBody() {
    if (user) return {}
    return { guestName, guestEmail }
  }

  const demoPay = useMutation({
    mutationFn: async () =>
      (await api.post<Order>('/payments/demo/checkout', guestBody())).data,
    onSuccess: async (order) => {
      await queryClient.invalidateQueries({ queryKey: ['cart'] })
      await queryClient.invalidateQueries({ queryKey: ['orders'] })
      if (order.guestEmail) {
        rememberGuestOrder(order.id, order.guestEmail)
        navigate(
          `/orders/${order.id}?paid=1&guestEmail=${encodeURIComponent(order.guestEmail)}`,
        )
        return
      }
      navigate(`/orders/${order.id}?paid=1`)
    },
  })

  const stripePay = useMutation({
    mutationFn: async () =>
      (
        await api.post<{ url: string }>('/payments/stripe/checkout-session', guestBody())
      ).data,
    onSuccess: (data) => {
      if (data.url) window.location.href = data.url
    },
  })

  const cart = cartQuery.data
  const pending = demoPay.isPending || stripePay.isPending
  const guestReady = Boolean(user) || (guestName.trim() && guestEmail.trim())
  const total = cart?.total ?? cart?.subtotal ?? 0

  if (cartQuery.isLoading) {
    return <p className="text-muted">Loading cart…</p>
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="surface rounded-[1.75rem] p-8 text-center">
        <h1 className="font-display text-3xl font-semibold">Cart</h1>
        <p className="mt-4 text-muted">Your cart is empty.</p>
        <Link to="/" className="btn-primary mt-6 inline-flex">
          Continue shopping
        </Link>
      </div>
    )
  }

  return (
    <div>
      <h1 className="font-display text-3xl font-semibold sm:text-4xl">Cart</h1>
      {params.get('cancelled') ? (
        <p className="mt-3 text-sm text-ticket-dark">Stripe checkout was cancelled.</p>
      ) : null}
      {!user ? (
        <p className="mt-3 text-sm text-muted">
          Checking out as a guest — or{' '}
          <Link to="/login" className="text-ticket">
            sign in
          </Link>{' '}
          to save orders to your account.
        </p>
      ) : null}

      <ul className="mt-6 space-y-3">
        {cart.items.map((item) => (
          <li
            key={item.productId}
            className="surface flex flex-col gap-4 rounded-3xl p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-center gap-4">
              <img
                src={productImage(item.product.slug, item.product.imageUrl)}
                alt=""
                className="h-16 w-16 rounded-2xl object-cover"
              />
              <div>
                <Link to={`/products/${item.product.slug}`} className="font-medium">
                  {item.product.name}
                </Link>
                <p className="text-sm text-muted">{formatMoney(item.unitPrice)} each</p>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 sm:justify-end">
              <div className="flex items-center gap-2 rounded-full border border-line bg-white px-2 py-1">
                <button
                  type="button"
                  className="p-1"
                  aria-label="Decrease"
                  onClick={() =>
                    updateItem.mutate({
                      productId: item.productId,
                      quantity: item.quantity - 1,
                    })
                  }
                >
                  {item.quantity <= 1 ? <FiTrash2 /> : <FiMinus />}
                </button>
                <span className="w-6 text-center text-sm">{item.quantity}</span>
                <button
                  type="button"
                  className="p-1"
                  aria-label="Increase"
                  onClick={() =>
                    updateItem.mutate({
                      productId: item.productId,
                      quantity: item.quantity + 1,
                    })
                  }
                >
                  <FiPlus />
                </button>
              </div>
              <span className="w-20 text-right font-semibold">
                {formatMoney(item.lineTotal)}
              </span>
            </div>
          </li>
        ))}
      </ul>

      <div className="surface mt-6 space-y-4 rounded-3xl p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="block flex-1 text-sm">
            <span className="text-muted">Promo code</span>
            <input
              className="mt-1 w-full rounded-full border border-line px-4 py-2.5"
              value={couponInput}
              onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
              placeholder="WELCOME10"
            />
          </label>
          <button
            type="button"
            disabled={!couponInput.trim() || applyCoupon.isPending}
            onClick={() => applyCoupon.mutate()}
            className="btn-ghost"
          >
            Apply
          </button>
          {cart.couponCode ? (
            <button
              type="button"
              disabled={removeCoupon.isPending}
              onClick={() => removeCoupon.mutate()}
              className="btn-ghost"
            >
              Remove {cart.couponCode}
            </button>
          ) : null}
        </div>
        {applyCoupon.isError ? (
          <p className="text-sm text-red-600">{getErrorMessage(applyCoupon.error)}</p>
        ) : null}

        {!user ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-muted">Name</span>
              <input
                className="mt-1 w-full rounded-full border border-line px-4 py-2.5"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                required
              />
            </label>
            <label className="block text-sm">
              <span className="text-muted">Email</span>
              <input
                type="email"
                className="mt-1 w-full rounded-full border border-line px-4 py-2.5"
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
                required
              />
            </label>
          </div>
        ) : null}

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm">
            <p>Subtotal {formatMoney(cart.subtotal)}</p>
            {(cart.discount ?? 0) > 0 ? (
              <p className="text-pine">
                Discount{cart.couponCode ? ` (${cart.couponCode})` : ''} −
                {formatMoney(cart.discount ?? 0)}
              </p>
            ) : null}
            <p className="mt-1 text-lg font-semibold">Total {formatMoney(total)}</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              disabled={pending || !guestReady}
              onClick={() => demoPay.mutate()}
              className="btn-primary disabled:opacity-40"
            >
              <FiCreditCard />
              {demoPay.isPending ? 'Paying…' : 'Pay with Demo'}
            </button>
            {methodsQuery.data?.stripe ? (
              <button
                type="button"
                disabled={pending || !guestReady}
                onClick={() => stripePay.mutate()}
                className="btn-ghost disabled:opacity-40"
              >
                Pay with Stripe (test)
              </button>
            ) : null}
          </div>
        </div>
        <p className="text-sm text-muted">
          Demo payment never charges a card. Try coupon codes WELCOME10 or SAVE5.
        </p>
        {demoPay.isError || stripePay.isError ? (
          <p className="text-sm text-red-600">
            {getErrorMessage(demoPay.error ?? stripePay.error)}
          </p>
        ) : null}
      </div>
    </div>
  )
}
