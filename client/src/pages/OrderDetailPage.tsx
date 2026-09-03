import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { formatMoney } from '../lib/money'
import type { Order } from '../types'

export function OrderDetailPage() {
  const { id } = useParams()
  const orderQuery = useQuery({
    queryKey: ['order', id],
    queryFn: async () => (await api.get<Order>(`/orders/${id}`)).data,
    enabled: Boolean(id),
  })

  const order = orderQuery.data

  if (orderQuery.isLoading) {
    return <p className="text-stone-500">Loading order…</p>
  }

  if (!order) {
    return <p className="text-red-600">Order not found.</p>
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-6">
      <Link to="/orders" className="text-sm text-ticket">
        ← All orders
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">{order.orderNumber}</h1>
      <p className="mt-1 text-stone-500">Status: {order.status}</p>
      <p className="mt-1 font-medium">Total {formatMoney(order.total)}</p>

      <h2 className="mt-8 font-medium">Items</h2>
      <ul className="mt-3 space-y-2 text-sm">
        {order.items.map((item) => (
          <li key={item.id} className="flex justify-between">
            <span>
              {item.product.name} × {item.quantity}
            </span>
            <span>{formatMoney(item.lineTotal)}</span>
          </li>
        ))}
      </ul>

      <h2 className="mt-8 font-medium">Status timeline</h2>
      <ol className="mt-3 space-y-3 border-l border-stone-200 pl-4">
        {order.statusHistory.map((entry) => (
          <li key={entry.id}>
            <p className="font-medium">{entry.status}</p>
            <p className="text-sm text-stone-500">
              {new Date(entry.createdAt).toLocaleString()}
              {entry.note ? ` — ${entry.note}` : ''}
            </p>
          </li>
        ))}
      </ol>
    </div>
  )
}
