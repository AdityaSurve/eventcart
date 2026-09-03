import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { formatMoney } from '../lib/money'
import type { Order, Paginated } from '../types'

export function OrdersPage() {
  const ordersQuery = useQuery({
    queryKey: ['orders'],
    queryFn: async () => (await api.get<Paginated<Order>>('/orders')).data,
  })

  const orders = ordersQuery.data?.items ?? []

  return (
    <div>
      <h1 className="text-3xl font-semibold">My orders</h1>
      {ordersQuery.isLoading ? <p className="mt-4 text-stone-500">Loading…</p> : null}
      <ul className="mt-6 space-y-3">
        {orders.map((order) => (
          <li key={order.id}>
            <Link
              to={`/orders/${order.id}`}
              className="flex items-center justify-between rounded-xl border border-stone-200 bg-white p-4 hover:border-ticket"
            >
              <div>
                <p className="font-medium">{order.orderNumber}</p>
                <p className="text-sm text-stone-500">{order.status}</p>
              </div>
              <span>{formatMoney(order.total)}</span>
            </Link>
          </li>
        ))}
      </ul>
      {!ordersQuery.isLoading && orders.length === 0 ? (
        <p className="mt-4 text-stone-500">No orders yet.</p>
      ) : null}
    </div>
  )
}
