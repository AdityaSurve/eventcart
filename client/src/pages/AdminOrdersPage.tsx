import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FiEdit3 } from 'react-icons/fi'
import { api, getErrorMessage } from '../lib/api'
import { statusTone } from '../lib/media'
import { formatMoney } from '../lib/money'
import type { Order, OrderStatus, Paginated } from '../types'

const STATUSES: OrderStatus[] = [
  'PENDING',
  'CONFIRMED',
  'PREPARING',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
]

export function AdminOrdersPage() {
  const queryClient = useQueryClient()

  const ordersQuery = useQuery({
    queryKey: ['admin-orders'],
    queryFn: async () =>
      (await api.get<Paginated<Order>>('/orders', { params: { limit: 50 } })).data,
  })

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: OrderStatus }) => {
      await api.patch(`/orders/${id}/status`, { status })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-orders'] })
      await queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
  })

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-semibold">Admin orders</h1>
        <div className="flex gap-4 text-sm">
          <Link to="/admin/analytics" className="text-ticket">
            Analytics
          </Link>
          <Link to="/admin/products" className="text-ticket">
            Products
          </Link>
        </div>
      </div>
      <p className="mt-2 text-sm text-muted">
        Changes sync live to the customer order page over WebSockets.
      </p>
      {updateStatus.isError ? (
        <p className="mt-3 text-sm text-red-600">{getErrorMessage(updateStatus.error)}</p>
      ) : null}

      <div className="mt-6 space-y-3 md:hidden">
        {(ordersQuery.data?.items ?? []).map((order) => (
          <div key={order.id} className="surface rounded-3xl p-4">
            <Link className="font-medium text-ticket" to={`/orders/${order.id}`}>
              {order.orderNumber}
            </Link>
            <p className="mt-1 text-sm text-muted">
              {order.user?.email ?? order.guestEmail ?? 'Guest'}
            </p>
            <p className="mt-2 font-semibold">{formatMoney(order.total)}</p>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <FiEdit3 />
              <select
                value={order.status}
                onChange={(e) =>
                  updateStatus.mutate({
                    id: order.id,
                    status: e.target.value as OrderStatus,
                  })
                }
                className="w-full rounded-full border border-line bg-white px-3 py-2"
              >
                {STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ))}
      </div>

      <div className="surface mt-6 hidden overflow-x-auto rounded-3xl md:block">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-line bg-[#f7f2ea]">
            <tr>
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Payment</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {(ordersQuery.data?.items ?? []).map((order) => (
              <tr key={order.id} className="border-t border-line">
                <td className="px-4 py-3">
                  <Link className="text-ticket" to={`/orders/${order.id}`}>
                    {order.orderNumber}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  {order.user?.email ?? order.guestEmail ?? 'Guest'}
                </td>
                <td className="px-4 py-3">{formatMoney(order.total)}</td>
                <td className="px-4 py-3">
                  <span
                    className="status-pill"
                    data-tone={statusTone(order.paymentStatus ?? 'UNPAID')}
                  >
                    {order.paymentStatus ?? 'UNPAID'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <select
                    value={order.status}
                    onChange={(e) =>
                      updateStatus.mutate({
                        id: order.id,
                        status: e.target.value as OrderStatus,
                      })
                    }
                    className="rounded-full border border-line bg-white px-3 py-1.5"
                  >
                    {STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
