import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FiCreditCard, FiMinus, FiPlus, FiTrash2 } from 'react-icons/fi'
import { api, getErrorMessage } from '../lib/api'
import { productImage } from '../lib/media'
import { formatMoney } from '../lib/money'
import type { Cart, Order } from '../types'

type PaymentMethods = { demo: boolean; stripe: boolean }

export function CartPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const queryClient = useQueryClient()

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

  const demoPay = useMutation({
    mutationFn: async () => (await api.post<Order>('/payments/demo/checkout')).data,
    onSuccess: async (order) => {
      await queryClient.invalidateQueries({ queryKey: ['cart'] })
      await queryClient.invalidateQueries({ queryKey: ['orders'] })
      navigate(`/orders/${order.id}?paid=1`)
    },
  })

  const stripePay = useMutation({
    mutationFn: async () =>
      (await api.post<{ url: string }>('/payments/stripe/checkout-session')).data,
    onSuccess: (data) => {
      if (data.url) window.location.href = data.url
    },
  })

  const cart = cartQuery.data
  const pending = demoPay.isPending || stripePay.isPending

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

      <div className="surface mt-6 rounded-3xl p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-lg font-semibold">Subtotal {formatMoney(cart.subtotal)}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              disabled={pending}
              onClick={() => demoPay.mutate()}
              className="btn-primary"
            >
              <FiCreditCard />
              {demoPay.isPending ? 'Paying…' : 'Pay with Demo'}
            </button>
            {methodsQuery.data?.stripe ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => stripePay.mutate()}
                className="btn-ghost"
              >
                Pay with Stripe (test)
              </button>
            ) : null}
          </div>
        </div>
        <p className="mt-3 text-sm text-muted">
          Demo payment never charges a card. Optional Stripe test mode appears when
          `STRIPE_SECRET_KEY` is set on the API.
        </p>
        {demoPay.isError || stripePay.isError ? (
          <p className="mt-3 text-sm text-red-600">
            {getErrorMessage(demoPay.error ?? stripePay.error)}
          </p>
        ) : null}
      </div>
    </div>
  )
}
