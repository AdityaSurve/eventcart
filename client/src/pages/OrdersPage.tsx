import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { FiChevronRight } from 'react-icons/fi'
import { api } from '../lib/api'
import { statusTone } from '../lib/media'
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
      <h1 className="font-display text-3xl font-semibold sm:text-4xl">My orders</h1>
      <p className="mt-2 text-sm text-muted">
        Status changes sync live while you stay signed in.
      </p>
      {ordersQuery.isLoading ? <p className="mt-4 text-muted">Loading…</p> : null}
      <ul className="mt-6 space-y-3">
        {orders.map((order) => (
          <li key={order.id}>
            <Link
              to={`/orders/${order.id}`}
              className="surface flex items-center justify-between gap-4 rounded-3xl p-4 transition hover:border-ticket"
            >
              <div>
                <p className="font-medium">{order.orderNumber}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="status-pill" data-tone={statusTone(order.status)}>
                    {order.status}
                  </span>
                  {order.paymentStatus ? (
                    <span
                      className="status-pill"
                      data-tone={statusTone(order.paymentStatus)}
                    >
                      {order.paymentStatus}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="flex items-center gap-2 font-semibold">
                {formatMoney(order.total)}
                <FiChevronRight className="text-muted" />
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {!ordersQuery.isLoading && orders.length === 0 ? (
        <p className="mt-4 text-muted">No orders yet.</p>
      ) : null}
    </div>
  )
}
