import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, getErrorMessage } from '../lib/api'
import { formatMoney } from '../lib/money'
import type { Cart, Order } from '../types'

export function CartPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const cartQuery = useQuery({
    queryKey: ['cart'],
    queryFn: async () => (await api.get<Cart>('/cart')).data,
  })

  const updateItem = useMutation({
    mutationFn: async ({ productId, quantity }: { productId: string; quantity: number }) => {
      if (quantity === 0) {
        await api.delete(`/cart/items/${productId}`)
        return
      }
      await api.patch(`/cart/items/${productId}`, { quantity })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['cart'] })
    },
  })

  const checkout = useMutation({
    mutationFn: async () => (await api.post<Order>('/cart/checkout')).data,
    onSuccess: async (order) => {
      await queryClient.invalidateQueries({ queryKey: ['cart'] })
      await queryClient.invalidateQueries({ queryKey: ['orders'] })
      navigate(`/orders/${order.id}`)
    },
  })

  const cart = cartQuery.data

  if (cartQuery.isLoading) {
    return <p className="text-stone-500">Loading cart…</p>
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div>
        <h1 className="text-3xl font-semibold">Cart</h1>
        <p className="mt-4 text-stone-500">Your cart is empty.</p>
        <Link to="/" className="mt-4 inline-block text-ticket">
          Continue shopping
        </Link>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-3xl font-semibold">Cart</h1>
      <ul className="mt-6 space-y-3">
        {cart.items.map((item) => (
          <li
            key={item.productId}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white p-4"
          >
            <div>
              <Link to={`/products/${item.product.slug}`} className="font-medium">
                {item.product.name}
              </Link>
              <p className="text-sm text-stone-500">{formatMoney(item.unitPrice)} each</p>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={0}
                value={item.quantity}
                onChange={(e) =>
                  updateItem.mutate({
                    productId: item.productId,
                    quantity: Number(e.target.value),
                  })
                }
                className="w-16 rounded-lg border border-stone-300 px-2 py-1"
              />
              <span className="w-20 text-right font-medium">
                {formatMoney(item.lineTotal)}
              </span>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-6 flex items-center justify-between">
        <p className="text-lg font-semibold">Subtotal {formatMoney(cart.subtotal)}</p>
        <button
          type="button"
          disabled={checkout.isPending}
          onClick={() => checkout.mutate()}
          className="rounded-lg bg-ticket px-5 py-2.5 font-medium text-white hover:bg-ticket-dark disabled:opacity-60"
        >
          {checkout.isPending ? 'Checking out…' : 'Checkout'}
        </button>
      </div>
      {checkout.isError ? (
        <p className="mt-3 text-sm text-red-600">{getErrorMessage(checkout.error)}</p>
      ) : null}
    </div>
  )
}
