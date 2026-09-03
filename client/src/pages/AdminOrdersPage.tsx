import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, getErrorMessage } from '../lib/api'
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
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold">Admin orders</h1>
        <div className="flex gap-4 text-sm">
          <Link to="/admin/analytics" className="text-ticket">
            Analytics
          </Link>
          <Link to="/admin/products" className="text-ticket">
            Products
          </Link>
        </div>
      </div>
      {updateStatus.isError ? (
        <p className="mt-3 text-sm text-red-600">{getErrorMessage(updateStatus.error)}</p>
      ) : null}
      <table className="mt-6 w-full overflow-hidden rounded-xl border border-stone-200 bg-white text-left text-sm">
        <thead className="bg-stone-50">
          <tr>
            <th className="px-3 py-2">Order</th>
            <th className="px-3 py-2">Customer</th>
            <th className="px-3 py-2">Total</th>
            <th className="px-3 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {(ordersQuery.data?.items ?? []).map((order) => (
            <tr key={order.id} className="border-t border-stone-100">
              <td className="px-3 py-2">
                <Link className="text-ticket" to={`/orders/${order.id}`}>
                  {order.orderNumber}
                </Link>
              </td>
              <td className="px-3 py-2">{order.user.email}</td>
              <td className="px-3 py-2">{formatMoney(order.total)}</td>
              <td className="px-3 py-2">
                <select
                  value={order.status}
                  onChange={(e) =>
                    updateStatus.mutate({
                      id: order.id,
                      status: e.target.value as OrderStatus,
                    })
                  }
                  className="rounded-lg border border-stone-300 px-2 py-1"
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
  )
}
